import type {
	VoiceAgentModel,
	VoiceAgentModelInput,
	VoiceAgentModelOutput
} from '../agent';
import { createVoiceProviderRouter } from '../modelAdapters';
import { createVoiceSessionRecord } from '../store';
import type { VoiceSessionRecord } from '../types';
import type {
	VoiceProviderRouterEvent,
	VoiceProviderRouterHealthOptions
} from '../modelAdapters';

export type VoiceProviderFailureSimulationMode = 'failure' | 'recovery';

export type VoiceProviderFailureSimulationContext<
	TProvider extends string = string
> = {
	query: {
		provider: TProvider;
		recoverProvider?: TProvider;
		simulateFailureProvider?: TProvider;
	};
};

export type VoiceProviderFailureSimulationResult<
	TProvider extends string = string,
	TResult = unknown
> = {
	mode: VoiceProviderFailureSimulationMode;
	provider: TProvider;
	result: VoiceAgentModelOutput<TResult>;
	status: 'simulated';
};

type ProviderListResolver<
	TContext,
	TSession extends VoiceSessionRecord,
	TProvider extends string
> =
	| readonly TProvider[]
	| ((
			input: VoiceAgentModelInput<TContext, TSession>
	  ) => readonly TProvider[] | Promise<readonly TProvider[]>);

export type VoiceProviderFailureSimulatorOptions<
	TContext extends VoiceProviderFailureSimulationContext<TProvider>,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown,
	TProvider extends string = string
> = {
	allowProviders?: ProviderListResolver<TContext, TSession, TProvider>;
	fallback?:
		| readonly TProvider[]
		| ((
				provider: TProvider,
				input: VoiceAgentModelInput<TContext, TSession>
		  ) => readonly TProvider[] | Promise<readonly TProvider[]>);
	isProviderError?: (error: unknown, provider: TProvider) => boolean;
	isRateLimitError?: (error: unknown, provider: TProvider) => boolean;
	onProviderEvent?: (
		event: VoiceProviderRouterEvent<TProvider>,
		input: VoiceAgentModelInput<TContext, TSession>
	) => Promise<void> | void;
	providerHealth?: boolean | VoiceProviderRouterHealthOptions;
	providerLabel?: (provider: TProvider) => string;
	providers: readonly TProvider[];
	response?: (
		input: {
			mode: VoiceProviderFailureSimulationMode;
			provider: TProvider;
		} & VoiceAgentModelInput<TContext, TSession>
	) => VoiceAgentModelOutput<TResult> | Promise<VoiceAgentModelOutput<TResult>>;
};

const getContextQuery = <TProvider extends string>(
	context: VoiceProviderFailureSimulationContext<TProvider>
) => context.query;

const titleCaseProvider = (provider: string) =>
	provider
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(' ');

const resolveRequestedProvider = <TProvider extends string>(
	context: VoiceProviderFailureSimulationContext<TProvider>,
	providers: readonly TProvider[]
): TProvider => {
	const provider = getContextQuery(context).provider;
	return providers.includes(provider) ? provider : providers[0]!;
};

export const createVoiceProviderFailureSimulator = <
	TProvider extends string,
	TResult = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TContext extends VoiceProviderFailureSimulationContext<TProvider> = VoiceProviderFailureSimulationContext<TProvider>
>(
	options: VoiceProviderFailureSimulatorOptions<
		TContext,
		TSession,
		TResult,
		TProvider
	>
) => {
	if (options.providers.length === 0) {
		throw new Error('At least one provider is required.');
	}

	const providerModels = Object.fromEntries(
		options.providers.map((provider) => [
			provider,
			{
				generate: async (input) => {
					const query = getContextQuery(input.context);
					if (provider === query.simulateFailureProvider) {
						const label = options.providerLabel?.(provider) ?? titleCaseProvider(provider);
						throw new Error(
							`${label} voice assistant model failed: HTTP 429`
						);
					}

					if (options.response) {
						return options.response({
							...input,
							mode: query.recoverProvider === provider ? 'recovery' : 'failure',
							provider
						});
					}

					return {
						assistantText: `Simulated ${provider} provider recovered.`
					};
				}
			} satisfies VoiceAgentModel<TContext, TSession, TResult>
		])
	) as Partial<Record<TProvider, VoiceAgentModel<TContext, TSession, TResult>>>;

	const router = createVoiceProviderRouter<TContext, TSession, TResult, TProvider>({
		allowProviders: async (input) => {
			const recoverProvider = getContextQuery(input.context).recoverProvider;
			if (recoverProvider) {
				return [recoverProvider];
			}
			if (typeof options.allowProviders === 'function') {
				return options.allowProviders(input);
			}
			return options.allowProviders ?? options.providers;
		},
		fallback: async (input) => {
			const selectedProvider = resolveRequestedProvider(
				input.context,
				options.providers
			);
			if (typeof options.fallback === 'function') {
				return options.fallback(selectedProvider, input);
			}
			return options.fallback ?? options.providers.filter((provider) => provider !== selectedProvider);
		},
		fallbackMode: 'provider-error',
		isProviderError: options.isProviderError,
		isRateLimitError: options.isRateLimitError,
		onProviderEvent: options.onProviderEvent,
		policy: 'prefer-selected',
		providerHealth: options.providerHealth ?? {
			cooldownMs: 30_000,
			failureThreshold: 1,
			rateLimitCooldownMs: 120_000
		},
		providers: providerModels,
		selectProvider: ({ context }) =>
			resolveRequestedProvider(context, options.providers)
	});

	const run = async (
		provider: TProvider,
		mode: VoiceProviderFailureSimulationMode
	): Promise<VoiceProviderFailureSimulationResult<TProvider, TResult>> => {
		const now = Date.now();
		const session = createVoiceSessionRecord<TSession>(
			`provider-sim-${now}`,
			'provider-simulation'
		);
		const turn = {
			committedAt: now,
			id: `provider-sim-turn-${now}`,
			text:
				mode === 'failure'
					? `Simulate ${provider} provider failure.`
					: `Simulate ${provider} provider recovery.`,
			transcripts: []
		};
		const context = {
			query: {
				provider,
				...(mode === 'recovery' ? { recoverProvider: provider } : {}),
				...(mode === 'failure'
					? { simulateFailureProvider: provider }
					: {})
			}
		} as TContext;
		const result = await router.generate({
			agentId: 'provider-simulator',
			context,
			messages: [
				{
					content: turn.text,
					role: 'user'
				}
			],
			session,
			system: 'Simulate provider routing without calling external APIs.',
			tools: [],
			turn
		});

		return {
			mode,
			provider,
			result,
			status: 'simulated'
		};
	};

	return {
		run
	};
};
