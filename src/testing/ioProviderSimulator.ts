import type { VoiceIOProviderRouterEvent } from '../providerAdapters';
import type { VoiceProviderRouterProviderHealth } from '../modelAdapters';

export type VoiceIOProviderFailureSimulationMode = 'failure' | 'recovery';
export type VoiceIOProviderFailureSimulationKind = 'stt' | 'tts';
export type VoiceIOProviderFailureSimulationOperation = 'open' | 'send';

export type VoiceIOProviderFailureSimulationResult<
	TProvider extends string = string
> = {
	fallbackProvider?: TProvider;
	mode: VoiceIOProviderFailureSimulationMode;
	provider: TProvider;
	sessionId: string;
	status: 'simulated';
	suppressedUntil?: number;
};

export type VoiceIOProviderFailureSimulatorOptions<
	TProvider extends string = string
> = {
	cooldownMs?: number;
	fallback?:
		| readonly TProvider[]
		| ((provider: TProvider) => readonly TProvider[] | Promise<readonly TProvider[]>);
	failureElapsedMs?: number;
	failureMessage?: (input: {
		kind: VoiceIOProviderFailureSimulationKind;
		operation: VoiceIOProviderFailureSimulationOperation;
		provider: TProvider;
	}) => string;
	kind: VoiceIOProviderFailureSimulationKind;
	latencyBudgets?: Partial<Record<TProvider, number>>;
	now?: () => number;
	onProviderEvent?: (
		event: VoiceIOProviderRouterEvent<TProvider>
	) => Promise<void> | void;
	operation?: VoiceIOProviderFailureSimulationOperation;
	providers: readonly TProvider[];
	recoveryElapsedMs?: number | Partial<Record<TProvider, number>>;
	sessionId?: (input: {
		mode: VoiceIOProviderFailureSimulationMode;
		now: number;
		provider: TProvider;
	}) => string;
};

const defaultFailureMessage = <TProvider extends string>(input: {
	kind: VoiceIOProviderFailureSimulationKind;
	operation: VoiceIOProviderFailureSimulationOperation;
	provider: TProvider;
}) =>
	`Simulated ${input.provider} ${input.kind.toUpperCase()} ${input.operation} failure.`;

const resolveRecoveryElapsedMs = <TProvider extends string>(
	value: VoiceIOProviderFailureSimulatorOptions<TProvider>['recoveryElapsedMs'],
	provider: TProvider
) => {
	if (typeof value === 'number') {
		return value;
	}
	return value?.[provider] ?? 25;
};

const createHealth = <TProvider extends string>(input: {
	now: number;
	provider: TProvider;
	status: VoiceProviderRouterProviderHealth<TProvider>['status'];
	suppressedUntil?: number;
}): VoiceProviderRouterProviderHealth<TProvider> => ({
	consecutiveFailures: input.status === 'healthy' ? 0 : 1,
	lastFailureAt: input.status === 'healthy' ? undefined : input.now,
	provider: input.provider,
	status: input.status,
	suppressedUntil: input.suppressedUntil
});

const resolveFallback = async <TProvider extends string>(
	options: VoiceIOProviderFailureSimulatorOptions<TProvider>,
	provider: TProvider
) => {
	const configured =
		typeof options.fallback === 'function'
			? await options.fallback(provider)
			: options.fallback;
	return (configured ?? options.providers).find((candidate) => candidate !== provider);
};

export const createVoiceIOProviderFailureSimulator = <
	TProvider extends string
>(
	options: VoiceIOProviderFailureSimulatorOptions<TProvider>
) => {
	if (options.providers.length === 0) {
		throw new Error('At least one provider is required.');
	}

	const now = options.now ?? Date.now;
	const operation = options.operation ?? 'open';
	const cooldownMs = Math.max(0, options.cooldownMs ?? 30_000);

	const emit = async (event: VoiceIOProviderRouterEvent<TProvider>) => {
		await options.onProviderEvent?.(event);
	};

	const run = async (
		provider: TProvider,
		mode: VoiceIOProviderFailureSimulationMode
	): Promise<VoiceIOProviderFailureSimulationResult<TProvider>> => {
		if (!options.providers.includes(provider)) {
			throw new Error(`${provider} is not configured for simulation.`);
		}

		const startedAt = now();
		const sessionId =
			options.sessionId?.({ mode, now: startedAt, provider }) ??
			`${options.kind}-provider-sim-${startedAt}`;

		if (mode === 'recovery') {
			await emit({
				at: startedAt,
				attempt: 0,
				elapsedMs: resolveRecoveryElapsedMs(
					options.recoveryElapsedMs,
					provider
				),
				kind: options.kind,
				latencyBudgetMs: options.latencyBudgets?.[provider],
				operation,
				provider,
				providerHealth: createHealth({
					now: startedAt,
					provider,
					status: 'healthy'
				}),
				selectedProvider: provider,
				status: 'success'
			});

			return {
				mode,
				provider,
				sessionId,
				status: 'simulated'
			};
		}

		const fallbackProvider = await resolveFallback(options, provider);
		const suppressedUntil = startedAt + cooldownMs;
		await emit({
			at: startedAt,
			attempt: 0,
			elapsedMs: options.failureElapsedMs ?? 10,
			error: (options.failureMessage ?? defaultFailureMessage)({
				kind: options.kind,
				operation,
				provider
			}),
			fallbackProvider,
			kind: options.kind,
			latencyBudgetMs: options.latencyBudgets?.[provider],
			operation,
			provider,
			providerHealth: createHealth({
				now: startedAt,
				provider,
				status: 'suppressed',
				suppressedUntil
			}),
			selectedProvider: provider,
			status: 'error',
			suppressedUntil
		});

		if (fallbackProvider) {
			await emit({
				at: startedAt + 1,
				attempt: 1,
				elapsedMs: resolveRecoveryElapsedMs(
					options.recoveryElapsedMs,
					fallbackProvider
				),
				fallbackProvider,
				kind: options.kind,
				latencyBudgetMs: options.latencyBudgets?.[fallbackProvider],
				operation,
				provider: fallbackProvider,
				providerHealth: createHealth({
					now: startedAt + 1,
					provider: fallbackProvider,
					status: 'healthy'
				}),
				selectedProvider: provider,
				status: 'fallback'
			});
		}

		return {
			fallbackProvider,
			mode,
			provider,
			sessionId,
			status: 'simulated',
			suppressedUntil
		};
	};

	return {
		run
	};
};
