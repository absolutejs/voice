import type {
	VoiceAgentMessage,
	VoiceAgentModel,
	VoiceAgentModelInput,
	VoiceAgentModelOutput,
	VoiceAgentToolCall
} from './agent';
import type { VoiceSessionRecord } from './types';

export type VoiceJSONAssistantModelHandler<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = (
	input: VoiceAgentModelInput<TContext, TSession>
) =>
	| Promise<Record<string, unknown> | VoiceAgentModelOutput<TResult>>
	| Record<string, unknown>
	| VoiceAgentModelOutput<TResult>;

export type VoiceJSONAssistantModelOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	generate: VoiceJSONAssistantModelHandler<TContext, TSession, TResult>;
	mapOutput?: (output: Record<string, unknown>) => VoiceAgentModelOutput<TResult>;
};

export type OpenAIVoiceAssistantModelOptions = {
	apiKey: string;
	baseUrl?: string;
	fetch?: typeof fetch;
	maxOutputTokens?: number;
	model?: string;
	onUsage?: (usage: Record<string, unknown>) => Promise<void> | void;
	temperature?: number;
};

export type AnthropicVoiceAssistantModelOptions = {
	apiKey: string;
	baseUrl?: string;
	fetch?: typeof fetch;
	maxOutputTokens?: number;
	model?: string;
	onUsage?: (usage: Record<string, unknown>) => Promise<void> | void;
	temperature?: number;
	version?: string;
};

export type GeminiVoiceAssistantModelOptions = {
	apiKey: string;
	baseUrl?: string;
	fetch?: typeof fetch;
	maxOutputTokens?: number;
	maxRetries?: number;
	model?: string;
	onUsage?: (usage: Record<string, unknown>) => Promise<void> | void;
	temperature?: number;
};

export type VoiceProviderRouterEvent<TProvider extends string = string> = {
	at: number;
	attempt: number;
	elapsedMs: number;
	error?: string;
	fallbackProvider?: TProvider;
	latencyBudgetMs?: number;
	provider: TProvider;
	providerHealth?: VoiceProviderRouterProviderHealth<TProvider>;
	rateLimited?: boolean;
	recovered?: boolean;
	selectedProvider: TProvider;
	suppressionRemainingMs?: number;
	suppressedUntil?: number;
	status: 'error' | 'fallback' | 'success';
	timedOut?: boolean;
};

export type VoiceProviderRouterFallbackMode =
	| 'never'
	| 'provider-error'
	| 'rate-limit';

export type VoiceProviderRouterStrategy =
	| 'balanced'
	| 'ordered'
	| 'prefer-cheapest'
	| 'prefer-fastest'
	| 'prefer-selected'
	| 'quality-first';

export type VoiceProviderRouterPolicyPreset =
	| 'balanced'
	| 'cost-cap'
	| 'cost-first'
	| 'latency-first'
	| 'quality-first';

export type VoiceProviderRouterPolicyWeights = {
	cost?: number;
	latencyMs?: number;
	priority?: number;
	quality?: number;
};

export type VoiceProviderRouterPolicy<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TProvider extends string = string
> =
	| VoiceProviderRouterStrategy
	| VoiceProviderRouterPolicyPreset
	| {
			allowProviders?:
				| readonly TProvider[]
				| ((
						input: VoiceAgentModelInput<TContext, TSession>
					) => readonly TProvider[] | Promise<readonly TProvider[]>);
			fallbackMode?: VoiceProviderRouterFallbackMode;
			maxCost?: number;
			maxLatencyMs?: number;
			minQuality?: number;
			scoreProvider?: (
				provider: TProvider,
				profile: VoiceProviderRouterProviderProfile | undefined
			) => number;
			strategy?: VoiceProviderRouterStrategy;
			weights?: VoiceProviderRouterPolicyWeights;
	  };

export type VoiceProviderRouterProviderProfile = {
	cost?: number;
	latencyMs?: number;
	priority?: number;
	quality?: number;
	timeoutMs?: number;
};

const isVoiceProviderRoutingPolicyPreset = (
	value: string
): value is VoiceProviderRouterPolicyPreset =>
	value === 'balanced' ||
	value === 'cost-cap' ||
	value === 'cost-first' ||
	value === 'latency-first' ||
	value === 'quality-first';

export const resolveVoiceProviderRoutingPolicyPreset = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TProvider extends string = string
>(
	preset: VoiceProviderRouterPolicyPreset,
	options: Omit<
		Extract<
			VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
			Record<string, unknown>
		>,
		'strategy'
	> = {}
): Extract<
	VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
	Record<string, unknown>
> => {
	switch (preset) {
		case 'balanced':
			return {
				fallbackMode: 'provider-error',
				strategy: 'balanced',
				weights: {
					cost: 1,
					latencyMs: 0.005,
					priority: 1,
					quality: 10,
					...options.weights
				},
				...options
			};
		case 'cost-cap':
			return {
				fallbackMode: 'provider-error',
				strategy: 'prefer-cheapest',
				...options
			};
		case 'cost-first':
			return {
				fallbackMode: 'provider-error',
				strategy: 'prefer-cheapest',
				...options
			};
		case 'latency-first':
			return {
				fallbackMode: 'provider-error',
				strategy: 'prefer-fastest',
				...options
			};
		case 'quality-first':
			return {
				fallbackMode: 'provider-error',
				strategy: 'quality-first',
				...options
			};
	}
};

const resolveVoiceProviderRoutingPolicy = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TProvider extends string = string
>(
	policy?: VoiceProviderRouterPolicy<TContext, TSession, TProvider>
): Extract<
	VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
	Record<string, unknown>
> | undefined => {
	if (!policy) {
		return undefined;
	}
	if (typeof policy === 'string') {
		return isVoiceProviderRoutingPolicyPreset(policy)
			? resolveVoiceProviderRoutingPolicyPreset<TContext, TSession, TProvider>(
					policy
				)
			: {
					strategy: policy
				};
	}
	return policy;
};

export type VoiceProviderRouterHealthOptions = {
	cooldownMs?: number;
	failureThreshold?: number;
	now?: () => number;
	rateLimitCooldownMs?: number;
};

export type VoiceProviderRouterProviderHealth<
	TProvider extends string = string
> = {
	consecutiveFailures: number;
	lastFailureAt?: number;
	lastRateLimitedAt?: number;
	provider: TProvider;
	status: 'healthy' | 'suppressed';
	suppressedUntil?: number;
};

export type VoiceProviderOrchestrationSurface<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TProvider extends string = string
> = {
	allowProviders?:
		| readonly TProvider[]
		| ((
				input: VoiceAgentModelInput<TContext, TSession>
			) => readonly TProvider[] | Promise<readonly TProvider[]>);
	fallback?:
		| readonly TProvider[]
		| ((
				input: VoiceAgentModelInput<TContext, TSession>
			) => readonly TProvider[] | Promise<readonly TProvider[]>);
	fallbackMode?: VoiceProviderRouterFallbackMode;
	maxCost?: number;
	maxLatencyMs?: number;
	minQuality?: number;
	policy?: VoiceProviderRouterPolicy<TContext, TSession, TProvider>;
	providerHealth?: boolean | VoiceProviderRouterHealthOptions;
	providerProfiles?: Partial<Record<TProvider, VoiceProviderRouterProviderProfile>>;
	strategy?: VoiceProviderRouterStrategy;
	timeoutMs?: number;
	weights?: VoiceProviderRouterPolicyWeights;
};

export type VoiceProviderOrchestrationProfile<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TProvider extends string = string,
	TSurface extends string = string
> = {
	defaultSurface?: TSurface;
	id: string;
	resolve: (
		surface?: TSurface
	) => VoiceProviderOrchestrationResolvedSurface<TContext, TSession, TProvider>;
	surfaces: Record<
		TSurface,
		VoiceProviderOrchestrationSurface<TContext, TSession, TProvider>
	>;
};

export type VoiceProviderOrchestrationProfileOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TProvider extends string = string,
	TSurface extends string = string
> = {
	defaultSurface?: TSurface;
	id: string;
	surfaces: Record<
		TSurface,
		VoiceProviderOrchestrationSurface<TContext, TSession, TProvider>
	>;
};

export type VoiceProviderOrchestrationResolvedSurface<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TProvider extends string = string
> = {
	allowProviders?: VoiceProviderOrchestrationSurface<
		TContext,
		TSession,
		TProvider
	>['allowProviders'];
	fallback?: VoiceProviderOrchestrationSurface<
		TContext,
		TSession,
		TProvider
	>['fallback'];
	fallbackMode?: VoiceProviderRouterFallbackMode;
	policy?: VoiceProviderRouterPolicy<TContext, TSession, TProvider>;
	providerHealth?: boolean | VoiceProviderRouterHealthOptions;
	providerProfiles?: Partial<Record<TProvider, VoiceProviderRouterProviderProfile>>;
	timeoutMs?: number;
};

const mergeDefinedProviderPolicyFields = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TProvider extends string = string
>(
	base:
		| Extract<
				VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
				Record<string, unknown>
		  >
		| undefined,
	surface: VoiceProviderOrchestrationSurface<TContext, TSession, TProvider>
): Extract<
	VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
	Record<string, unknown>
> => {
	const next: Extract<
		VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
		Record<string, unknown>
	> = {
		...(base ?? {})
	};
	if (surface.allowProviders !== undefined) {
		next.allowProviders = surface.allowProviders;
	}
	if (surface.fallbackMode !== undefined) {
		next.fallbackMode = surface.fallbackMode;
	}
	if (surface.maxCost !== undefined) {
		next.maxCost = surface.maxCost;
	}
	if (surface.maxLatencyMs !== undefined) {
		next.maxLatencyMs = surface.maxLatencyMs;
	}
	if (surface.minQuality !== undefined) {
		next.minQuality = surface.minQuality;
	}
	if (surface.strategy !== undefined) {
		next.strategy = surface.strategy;
	}
	if (surface.weights !== undefined) {
		next.weights = {
			...(base?.weights ?? {}),
			...surface.weights
		};
	}
	return next;
};

export const createVoiceProviderOrchestrationProfile = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TProvider extends string = string,
	TSurface extends string = string
>(
	options: VoiceProviderOrchestrationProfileOptions<
		TContext,
		TSession,
		TProvider,
		TSurface
	>
): VoiceProviderOrchestrationProfile<
	TContext,
	TSession,
	TProvider,
	TSurface
> => {
	const surfaceNames = Object.keys(options.surfaces) as TSurface[];
	const defaultSurface = options.defaultSurface ?? surfaceNames[0];
	if (!defaultSurface || !options.surfaces[defaultSurface]) {
		throw new Error('Voice provider orchestration profile has no surfaces.');
	}

	return {
		defaultSurface,
		id: options.id,
		resolve: (surface = defaultSurface) => {
			const config = options.surfaces[surface];
			if (!config) {
				throw new Error(
					`Voice provider orchestration profile ${options.id} has no surface "${surface}".`
				);
			}
			const policy = mergeDefinedProviderPolicyFields(
				resolveVoiceProviderRoutingPolicy(config.policy),
				config
			);
			return {
				allowProviders: config.allowProviders,
				fallback: config.fallback,
				fallbackMode: config.fallbackMode,
				policy,
				providerHealth: config.providerHealth,
				providerProfiles: config.providerProfiles,
				timeoutMs: config.timeoutMs
			};
		},
		surfaces: options.surfaces
	};
};

export type VoiceProviderRouterOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown,
	TProvider extends string = string
> = {
	allowProviders?:
		| readonly TProvider[]
		| ((
				input: VoiceAgentModelInput<TContext, TSession>
			) => readonly TProvider[] | Promise<readonly TProvider[]>);
	fallback?:
		| TProvider[]
		| ((
				input: VoiceAgentModelInput<TContext, TSession>
			) => readonly TProvider[] | Promise<readonly TProvider[]>);
	fallbackMode?: VoiceProviderRouterFallbackMode;
	isProviderError?: (error: unknown, provider: TProvider) => boolean;
	isRateLimitError?: (error: unknown, provider: TProvider) => boolean;
	isTimeoutError?: (error: unknown, provider: TProvider) => boolean;
	onProviderEvent?: (
		event: VoiceProviderRouterEvent<TProvider>,
		input: VoiceAgentModelInput<TContext, TSession>
	) => Promise<void> | void;
	orchestrationProfile?: VoiceProviderOrchestrationProfile<
		TContext,
		TSession,
		TProvider
	>;
	orchestrationSurface?: string;
	policy?: VoiceProviderRouterPolicy<TContext, TSession, TProvider>;
	providerHealth?: boolean | VoiceProviderRouterHealthOptions;
	providerProfiles?: Partial<Record<TProvider, VoiceProviderRouterProviderProfile>>;
	timeoutMs?: number;
	providers: Partial<
		Record<TProvider, VoiceAgentModel<TContext, TSession, TResult>>
	>;
	selectProvider?: (
		input: VoiceAgentModelInput<TContext, TSession>
	) => TProvider | undefined | Promise<TProvider | undefined>;
};

const OUTPUT_SCHEMA = {
	additionalProperties: false,
	properties: {
		assistantText: {
			type: 'string'
		},
		complete: {
			type: 'boolean'
		},
		escalate: {
			additionalProperties: false,
			properties: {
				metadata: {
					additionalProperties: true,
					type: 'object'
				},
				reason: {
					type: 'string'
				}
			},
			required: ['reason'],
			type: 'object'
		},
		noAnswer: {
			additionalProperties: false,
			properties: {
				metadata: {
					additionalProperties: true,
					type: 'object'
				}
			},
			type: 'object'
		},
		result: {
			additionalProperties: true,
			type: 'object'
		},
		transfer: {
			additionalProperties: false,
			properties: {
				metadata: {
					additionalProperties: true,
					type: 'object'
				},
				reason: {
					type: 'string'
				},
				target: {
					type: 'string'
				}
			},
			required: ['target'],
			type: 'object'
		},
		voicemail: {
			additionalProperties: false,
			properties: {
				metadata: {
					additionalProperties: true,
					type: 'object'
				}
			},
			type: 'object'
		}
	},
	type: 'object'
};

const ROUTE_RESULT_INSTRUCTION =
	'Return only a JSON object with assistantText, complete, transfer, escalate, voicemail, noAnswer, and result when you are not calling tools. Only set transfer, escalate, voicemail, or noAnswer when the user explicitly asks for that lifecycle outcome or a tool result says that exact outcome. Do not infer voicemail from generic words like voice, voice app, or voice integration.';

const stripJSONCodeFence = (value: string) => {
	const trimmed = value.trim();
	const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	return match?.[1]?.trim() ?? value;
};

const parseJSON = (value: string): Record<string, unknown> => {
	try {
		const parsed = JSON.parse(stripJSONCodeFence(value));
		return parsed && typeof parsed === 'object'
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {
			assistantText: value
		};
	}
};

const parseJSONValue = (value: string): unknown => {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
};

class VoiceProviderTimeoutError extends Error {
	provider: string;
	timeoutMs: number;

	constructor(provider: string, timeoutMs: number) {
		super(`Voice provider ${provider} exceeded ${timeoutMs}ms latency budget.`);
		this.name = 'VoiceProviderTimeoutError';
		this.provider = provider;
		this.timeoutMs = timeoutMs;
	}
}

const getMessageToolCalls = (message: VoiceAgentMessage): VoiceAgentToolCall[] => {
	const toolCalls = message.metadata?.toolCalls;
	return Array.isArray(toolCalls)
		? (toolCalls.filter(
				(toolCall) =>
					toolCall &&
					typeof toolCall === 'object' &&
					typeof (toolCall as Record<string, unknown>).name === 'string'
			) as VoiceAgentToolCall[])
		: [];
};

const createHTTPError = (provider: string, response: Response) =>
	new Error(`${provider} voice assistant model failed: HTTP ${response.status}`);

const sleep = (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const defaultIsRateLimitError = (error: unknown) =>
	/(\b429\b|rate limit|quota|too many requests)/i.test(errorMessage(error));

const normalizeRouteOutput = <TResult>(
	output: Record<string, unknown>
): VoiceAgentModelOutput<TResult> => {
	const result: VoiceAgentModelOutput<TResult> = {};

	if (typeof output.assistantText === 'string') {
		result.assistantText = output.assistantText;
	}
	if (typeof output.complete === 'boolean') {
		result.complete = output.complete;
	}
	if (output.result !== undefined) {
		result.result = output.result as TResult;
	}
	if (output.transfer && typeof output.transfer === 'object') {
		const transfer = output.transfer as Record<string, unknown>;
		if (typeof transfer.target === 'string') {
			result.transfer = {
				metadata:
					transfer.metadata && typeof transfer.metadata === 'object'
						? (transfer.metadata as Record<string, unknown>)
						: undefined,
				reason:
					typeof transfer.reason === 'string' ? transfer.reason : undefined,
				target: transfer.target
			};
		}
	}
	if (output.escalate && typeof output.escalate === 'object') {
		const escalate = output.escalate as Record<string, unknown>;
		if (typeof escalate.reason === 'string') {
			result.escalate = {
				metadata:
					escalate.metadata && typeof escalate.metadata === 'object'
						? (escalate.metadata as Record<string, unknown>)
						: undefined,
				reason: escalate.reason
			};
		}
	}
	if (output.voicemail && typeof output.voicemail === 'object') {
		const voicemail = output.voicemail as Record<string, unknown>;
		result.voicemail = {
			metadata:
				voicemail.metadata && typeof voicemail.metadata === 'object'
					? (voicemail.metadata as Record<string, unknown>)
					: undefined
		};
	}
	if (output.noAnswer && typeof output.noAnswer === 'object') {
		const noAnswer = output.noAnswer as Record<string, unknown>;
		result.noAnswer = {
			metadata:
				noAnswer.metadata && typeof noAnswer.metadata === 'object'
					? (noAnswer.metadata as Record<string, unknown>)
					: undefined
		};
	}

	return result;
};

export const createJSONVoiceAssistantModel = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: VoiceJSONAssistantModelOptions<TContext, TSession, TResult>
): VoiceAgentModel<TContext, TSession, TResult> => ({
	generate: async (input) => {
		const output = await options.generate(input);
		if (
			'assistantText' in output ||
			'toolCalls' in output ||
			'complete' in output ||
			'transfer' in output ||
			'escalate' in output
		) {
			return output as VoiceAgentModelOutput<TResult>;
		}

		return options.mapOutput?.(output) ?? normalizeRouteOutput<TResult>(output);
	}
});

export const createVoiceProviderRouter = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown,
	TProvider extends string = string
>(
	options: VoiceProviderRouterOptions<
		TContext,
		TSession,
		TResult,
		TProvider
	>
): VoiceAgentModel<TContext, TSession, TResult> => {
	const providerIds = Object.keys(options.providers) as TProvider[];
	const firstProvider = providerIds[0];
	const orchestrationSurface = options.orchestrationProfile?.resolve(
		options.orchestrationSurface
	);
	const policy =
		resolveVoiceProviderRoutingPolicy(options.policy) ??
		resolveVoiceProviderRoutingPolicy(orchestrationSurface?.policy);
	const strategy = policy?.strategy ?? 'prefer-selected';
	const fallbackMode =
		policy?.fallbackMode ??
		options.fallbackMode ??
		orchestrationSurface?.fallbackMode ??
		'provider-error';
	const providerProfiles = {
		...(orchestrationSurface?.providerProfiles ?? {}),
		...(options.providerProfiles ?? {})
	} as Partial<Record<TProvider, VoiceProviderRouterProviderProfile>>;
	const providerHealthOption =
		options.providerHealth ?? orchestrationSurface?.providerHealth;
	const healthOptions: VoiceProviderRouterHealthOptions | undefined =
		typeof providerHealthOption === 'object'
			? providerHealthOption
			: providerHealthOption
				? {}
				: undefined;
	const healthState = new Map<
		TProvider,
		VoiceProviderRouterProviderHealth<TProvider>
	>();
	const now = () => healthOptions?.now?.() ?? Date.now();
	const failureThreshold = Math.max(1, healthOptions?.failureThreshold ?? 1);
	const cooldownMs = Math.max(0, healthOptions?.cooldownMs ?? 30_000);
	const rateLimitCooldownMs = Math.max(
		0,
		healthOptions?.rateLimitCooldownMs ?? 60_000
	);
	const getProviderTimeoutMs = (provider: TProvider) => {
		const timeoutMs =
			providerProfiles[provider]?.timeoutMs ??
			options.timeoutMs ??
			orchestrationSurface?.timeoutMs;
		return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
			? timeoutMs
			: undefined;
	};

	const getHealth = (provider: TProvider) => {
		const existing = healthState.get(provider);
		if (existing) {
			return existing;
		}
		const next: VoiceProviderRouterProviderHealth<TProvider> = {
			consecutiveFailures: 0,
			provider,
			status: 'healthy'
		};
		healthState.set(provider, next);
		return next;
	};

	const cloneHealth = (provider: TProvider) => {
		if (!healthOptions) {
			return undefined;
		}
		return {
			...getHealth(provider)
		};
	};

	const getSuppressionRemainingMs = (provider: TProvider) => {
		if (!healthOptions) {
			return undefined;
		}
		const suppressedUntil = getHealth(provider).suppressedUntil;
		return typeof suppressedUntil === 'number'
			? Math.max(0, suppressedUntil - now())
			: undefined;
	};

	const isSuppressed = (provider: TProvider) => {
		if (!healthOptions) {
			return false;
		}
		const health = getHealth(provider);
		return (
			typeof health.suppressedUntil === 'number' &&
			health.suppressedUntil > now()
		);
	};

	const recordProviderSuccess = (provider: TProvider) => {
		if (!healthOptions) {
			return undefined;
		}
		const health = getHealth(provider);
		health.consecutiveFailures = 0;
		health.status = 'healthy';
		health.suppressedUntil = undefined;
		return cloneHealth(provider);
	};

	const recordProviderError = (
		provider: TProvider,
		isProviderError: boolean,
		rateLimited: boolean
	) => {
		if (!healthOptions || !isProviderError) {
			return cloneHealth(provider);
		}
		const currentTime = now();
		const health = getHealth(provider);
		health.consecutiveFailures += 1;
		health.lastFailureAt = currentTime;
		if (rateLimited) {
			health.lastRateLimitedAt = currentTime;
		}
		if (rateLimited || health.consecutiveFailures >= failureThreshold) {
			health.status = 'suppressed';
			health.suppressedUntil =
				currentTime + (rateLimited ? rateLimitCooldownMs : cooldownMs);
		}
		return cloneHealth(provider);
	};

	const resolveAllowedProviders = async (
		input: VoiceAgentModelInput<TContext, TSession>
	) => {
		const allowProviders =
			policy?.allowProviders ??
			options.allowProviders ??
			orchestrationSurface?.allowProviders;
		const allowed =
			typeof allowProviders === 'function'
				? await allowProviders(input)
				: allowProviders;
		return new Set(allowed ?? providerIds);
	};

	const passesBudgetFilters = (provider: TProvider) => {
		const profile = providerProfiles[provider];
		if (
			typeof policy?.maxCost === 'number' &&
			typeof profile?.cost === 'number' &&
			profile.cost > policy.maxCost
		) {
			return false;
		}
		if (
			typeof policy?.maxLatencyMs === 'number' &&
			typeof profile?.latencyMs === 'number' &&
			profile.latencyMs > policy.maxLatencyMs
		) {
			return false;
		}
		if (
			typeof policy?.minQuality === 'number' &&
			typeof profile?.quality === 'number' &&
			profile.quality < policy.minQuality
		) {
			return false;
		}
		return true;
	};

	const getBalancedScore = (provider: TProvider) => {
		const profile = providerProfiles[provider];
		if (policy?.scoreProvider) {
			return policy.scoreProvider(provider, profile);
		}
		const weights = policy?.weights ?? {};
		return (
			(profile?.cost ?? Number.MAX_SAFE_INTEGER) * (weights.cost ?? 1) +
			(profile?.latencyMs ?? Number.MAX_SAFE_INTEGER) *
				(weights.latencyMs ?? 0.005) +
			(profile?.priority ?? 0) * (weights.priority ?? 1) -
			(profile?.quality ?? 0) * (weights.quality ?? 10)
		);
	};

	const sortProviders = (providers: TProvider[]) => {
		if (
			strategy !== 'prefer-cheapest' &&
			strategy !== 'prefer-fastest' &&
			strategy !== 'quality-first' &&
			strategy !== 'balanced'
		) {
			return providers;
		}

		return [...providers].sort((left, right) => {
			const leftProfile = providerProfiles[left];
			const rightProfile = providerProfiles[right];
			if (strategy === 'quality-first') {
				return (
					(rightProfile?.quality ?? Number.MIN_SAFE_INTEGER) -
						(leftProfile?.quality ?? Number.MIN_SAFE_INTEGER) ||
					(leftProfile?.priority ?? Number.MAX_SAFE_INTEGER) -
						(rightProfile?.priority ?? Number.MAX_SAFE_INTEGER) ||
					(leftProfile?.latencyMs ?? Number.MAX_SAFE_INTEGER) -
						(rightProfile?.latencyMs ?? Number.MAX_SAFE_INTEGER) ||
					(leftProfile?.cost ?? Number.MAX_SAFE_INTEGER) -
						(rightProfile?.cost ?? Number.MAX_SAFE_INTEGER)
				);
			}
			if (strategy === 'balanced') {
				return getBalancedScore(left) - getBalancedScore(right);
			}
			const leftValue =
				strategy === 'prefer-cheapest'
					? (leftProfile?.cost ?? Number.MAX_SAFE_INTEGER)
					: (leftProfile?.latencyMs ?? Number.MAX_SAFE_INTEGER);
			const rightValue =
				strategy === 'prefer-cheapest'
					? (rightProfile?.cost ?? Number.MAX_SAFE_INTEGER)
					: (rightProfile?.latencyMs ?? Number.MAX_SAFE_INTEGER);

			return (
				leftValue - rightValue ||
				(leftProfile?.priority ?? Number.MAX_SAFE_INTEGER) -
					(rightProfile?.priority ?? Number.MAX_SAFE_INTEGER)
			);
		});
	};

	const resolveOrder = async (
		input: VoiceAgentModelInput<TContext, TSession>
	) => {
		const selectedProvider = await options.selectProvider?.(input);
		const allowedProviders = await resolveAllowedProviders(input);
		const fallbackSource = options.fallback ?? orchestrationSurface?.fallback;
		const fallbackOrder =
			typeof fallbackSource === 'function'
				? await fallbackSource(input)
				: fallbackSource;
		const allowedRankedProviders = sortProviders([
			...(fallbackOrder ?? providerIds)
		]).filter((provider) => allowedProviders.has(provider));
		const rankedProviders = allowedRankedProviders.filter(passesBudgetFilters);
		const healthyRankedProviders = healthOptions
			? rankedProviders.filter((provider) => !isSuppressed(provider))
			: rankedProviders;
		const candidateRankedProviders = healthyRankedProviders.length
			? healthyRankedProviders
			: rankedProviders;
		const preferred =
			selectedProvider &&
			allowedProviders.has(selectedProvider) &&
			passesBudgetFilters(selectedProvider) &&
			(!healthOptions || !isSuppressed(selectedProvider))
				? selectedProvider
				: candidateRankedProviders[0] ?? firstProvider;
		const seen = new Set<TProvider>();
		const order: TProvider[] = [];
		const candidates =
			strategy === 'ordered'
				? candidateRankedProviders
				: [
						preferred,
						...candidateRankedProviders,
						...providerIds.filter(
							(provider) => !healthOptions || !isSuppressed(provider)
						)
					];

		for (const provider of candidates) {
			if (
				!provider ||
				seen.has(provider) ||
				!allowedProviders.has(provider) ||
				!options.providers[provider]
			) {
				continue;
			}
			seen.add(provider);
			order.push(provider);
		}

		return {
			order,
			selectedProvider: preferred
		};
	};

	const emit = async (
		event: VoiceProviderRouterEvent<TProvider>,
		input: VoiceAgentModelInput<TContext, TSession>
	) => {
		await options.onProviderEvent?.(event, input);
	};

	const runProvider = async (
		provider: TProvider,
		model: VoiceAgentModel<TContext, TSession, TResult>,
		input: VoiceAgentModelInput<TContext, TSession>
	) => {
		const timeoutMs = getProviderTimeoutMs(provider);
		if (!timeoutMs) {
			return model.generate(input);
		}

		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				model.generate(input),
				new Promise<never>((_, reject) => {
					timeout = setTimeout(
						() => reject(new VoiceProviderTimeoutError(provider, timeoutMs)),
						timeoutMs
					);
				})
			]);
		} finally {
			if (timeout) {
				clearTimeout(timeout);
			}
		}
	};

	return {
		generate: async (input) => {
			const { order, selectedProvider } = await resolveOrder(input);
			if (!selectedProvider || order.length === 0) {
				throw new Error('Voice provider router has no available providers.');
			}

			let lastError: unknown;
			for (const [index, provider] of order.entries()) {
				const model = options.providers[provider];
				if (!model) {
					continue;
				}
				const startedAt = Date.now();
				try {
					const output = await runProvider(provider, model, input);
					const providerHealth = recordProviderSuccess(provider);
					await emit(
						{
							at: Date.now(),
							attempt: index + 1,
							elapsedMs: Date.now() - startedAt,
							fallbackProvider:
								provider === selectedProvider ? undefined : provider,
							latencyBudgetMs: getProviderTimeoutMs(provider),
							provider,
							providerHealth,
							recovered: provider !== selectedProvider,
							selectedProvider,
							status: provider === selectedProvider ? 'success' : 'fallback'
						},
						input
					);
					return output;
				} catch (error) {
					lastError = error;
					const hasNextProvider = index < order.length - 1;
					const isProviderError =
						options.isProviderError?.(error, provider) ?? true;
					const timedOut =
						options.isTimeoutError?.(error, provider) ??
						error instanceof VoiceProviderTimeoutError;
					const rateLimited =
						options.isRateLimitError?.(error, provider) ??
						defaultIsRateLimitError(error);
					const shouldFallback =
						fallbackMode === 'provider-error'
							? isProviderError
							: fallbackMode === 'rate-limit'
								? isProviderError && rateLimited
								: false;
					const providerHealth = recordProviderError(
						provider,
						isProviderError,
						rateLimited
					);
					const nextProvider = hasNextProvider ? order[index + 1] : undefined;

					await emit(
						{
							at: Date.now(),
							attempt: index + 1,
							elapsedMs: Date.now() - startedAt,
							error: errorMessage(error),
							fallbackProvider: shouldFallback ? nextProvider : undefined,
							latencyBudgetMs: getProviderTimeoutMs(provider),
							provider,
							providerHealth,
							rateLimited,
							selectedProvider,
							suppressionRemainingMs: getSuppressionRemainingMs(provider),
							suppressedUntil: providerHealth?.suppressedUntil,
							status: 'error',
							timedOut
						},
						input
					);

					if (!hasNextProvider || !shouldFallback) {
						throw error;
					}
				}
			}

			throw lastError ?? new Error('Voice provider router did not run a provider.');
		}
	};
};

const messageToOpenAIInput = (
	message: VoiceAgentMessage
): Array<Record<string, unknown>> => {
	if (message.role === 'tool') {
		return [
			{
				call_id: message.toolCallId ?? message.name ?? crypto.randomUUID(),
				output: message.content,
				type: 'function_call_output'
			}
		];
	}

	const toolCalls = getMessageToolCalls(message);
	if (message.role === 'assistant' && toolCalls.length) {
		return toolCalls.map((toolCall) => ({
			arguments: JSON.stringify(toolCall.args),
			call_id: toolCall.id ?? crypto.randomUUID(),
			name: toolCall.name,
			type: 'function_call'
		}));
	}

	return [
		{
			content: message.content,
			role: message.role === 'system' ? 'developer' : message.role
		}
	];
};

const messagesToOpenAIInput = (messages: VoiceAgentMessage[]) =>
	messages.flatMap(messageToOpenAIInput);

const messageToAnthropicMessage = (message: VoiceAgentMessage) => {
	if (message.role === 'system') {
		return undefined;
	}

	if (message.role === 'tool') {
		if (!message.toolCallId) {
			return {
				content: `Tool result from ${message.name ?? 'tool'}: ${message.content}`,
				role: 'user'
			};
		}

		return {
			content: [
				{
					content: message.content,
					tool_use_id: message.toolCallId,
					type: 'tool_result'
				}
			],
			role: 'user'
		};
	}

	const toolCalls = getMessageToolCalls(message);
	if (message.role === 'assistant' && toolCalls.length) {
		return {
			content: [
				...(message.content
					? [
							{
								text: message.content,
								type: 'text'
							}
						]
					: []),
				...toolCalls.map((toolCall) => ({
					id: toolCall.id ?? crypto.randomUUID(),
					input: toolCall.args,
					name: toolCall.name,
					type: 'tool_use'
				}))
			],
			role: 'assistant'
		};
	}

	return {
		content: message.content,
		role: message.role
	};
};

const toGeminiSchema = (schema: Record<string, unknown>): Record<string, unknown> => {
	const next: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(schema)) {
		if (key === 'additionalProperties') {
			continue;
		}
		if (key === 'type' && typeof value === 'string') {
			next[key] = value.toUpperCase();
			continue;
		}
		if (Array.isArray(value)) {
			next[key] = value.map((item) =>
				item && typeof item === 'object'
					? toGeminiSchema(item as Record<string, unknown>)
					: item
			);
			continue;
		}
		if (value && typeof value === 'object') {
			next[key] = toGeminiSchema(value as Record<string, unknown>);
			continue;
		}
		next[key] = value;
	}
	return next;
};

const messageToGeminiContent = (message: VoiceAgentMessage) => {
	if (message.role === 'system') {
		return undefined;
	}

	if (message.role === 'tool') {
		return {
			parts: [
				{
					functionResponse: {
						id: message.toolCallId,
						name: message.name ?? 'tool',
						response: {
							result: parseJSONValue(message.content)
						}
					}
				}
			],
			role: 'user'
		};
	}

	const toolCalls = getMessageToolCalls(message);
	if (message.role === 'assistant' && toolCalls.length) {
		return {
			parts: [
				...(message.content
					? [
							{
								text: message.content
							}
						]
					: []),
				...toolCalls.map((toolCall) => ({
					functionCall: {
						args: toolCall.args,
						id: toolCall.id,
						name: toolCall.name
					}
				}))
			],
			role: 'model'
		};
	}

	return {
		parts: [
			{
				text: message.content
			}
		],
		role: message.role === 'assistant' ? 'model' : 'user'
	};
};

const extractText = (response: Record<string, unknown>) => {
	if (typeof response.output_text === 'string') {
		return response.output_text;
	}

	const output = Array.isArray(response.output) ? response.output : [];
	for (const item of output) {
		if (!item || typeof item !== 'object') {
			continue;
		}
		const record = item as Record<string, unknown>;
		const content = Array.isArray(record.content) ? record.content : [];
		for (const contentItem of content) {
			if (!contentItem || typeof contentItem !== 'object') {
				continue;
			}
			const contentRecord = contentItem as Record<string, unknown>;
			if (typeof contentRecord.text === 'string') {
				return contentRecord.text;
			}
		}
	}

	return '';
};

const extractToolCalls = (response: Record<string, unknown>) => {
	const output = Array.isArray(response.output) ? response.output : [];
	const toolCalls: VoiceAgentToolCall[] = [];

	for (const item of output) {
		if (!item || typeof item !== 'object') {
			continue;
		}
		const record = item as Record<string, unknown>;
		if (record.type !== 'function_call' || typeof record.name !== 'string') {
			continue;
		}
		const args =
			typeof record.arguments === 'string'
				? parseJSON(record.arguments)
				: {};
		toolCalls.push({
			args,
			id:
				typeof record.call_id === 'string'
					? record.call_id
					: typeof record.id === 'string'
						? record.id
						: undefined,
			name: record.name
		});
	}

	return toolCalls;
};

export const createOpenAIVoiceAssistantModel = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: OpenAIVoiceAssistantModelOptions
): VoiceAgentModel<TContext, TSession, TResult> => {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
	const model = options.model ?? 'gpt-4.1-mini';

	return {
		generate: async (input) => {
			const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/responses`, {
				body: JSON.stringify({
					input: messagesToOpenAIInput(input.messages),
					instructions: [
						input.system,
						'Return a JSON object with assistantText, complete, transfer, escalate, voicemail, noAnswer, and result when you are not calling tools.'
					]
						.filter(Boolean)
						.join('\n\n'),
					max_output_tokens: options.maxOutputTokens,
					model,
					temperature: options.temperature,
					text: {
						format: {
							name: 'voice_route_result',
							schema: OUTPUT_SCHEMA,
							strict: false,
							type: 'json_schema'
						}
					},
					tool_choice: input.tools.length ? 'auto' : 'none',
					tools: input.tools.map((tool) => ({
						description: tool.description,
						name: tool.name,
						parameters: tool.parameters ?? {
							additionalProperties: true,
							type: 'object'
						},
						strict: false,
						type: 'function'
					}))
				}),
				headers: {
					authorization: `Bearer ${options.apiKey}`,
					'content-type': 'application/json'
				},
				method: 'POST'
			});

			if (!response.ok) {
				throw createHTTPError('OpenAI', response);
			}

			const body = (await response.json()) as Record<string, unknown>;
			if (body.usage && typeof body.usage === 'object') {
				await options.onUsage?.(body.usage as Record<string, unknown>);
			}

			const toolCalls = extractToolCalls(body);
			if (toolCalls.length) {
				return {
					toolCalls
				};
			}

			return normalizeRouteOutput<TResult>(parseJSON(extractText(body)));
		}
	};
};

const extractAnthropicText = (response: Record<string, unknown>) => {
	const content = Array.isArray(response.content) ? response.content : [];
	return content
		.map((item) =>
			item &&
			typeof item === 'object' &&
			(item as Record<string, unknown>).type === 'text' &&
			typeof (item as Record<string, unknown>).text === 'string'
				? ((item as Record<string, unknown>).text as string)
				: ''
		)
		.filter(Boolean)
		.join('\n');
};

const extractAnthropicToolCalls = (response: Record<string, unknown>) => {
	const content = Array.isArray(response.content) ? response.content : [];
	const toolCalls: VoiceAgentToolCall[] = [];

	for (const item of content) {
		if (!item || typeof item !== 'object') {
			continue;
		}
		const record = item as Record<string, unknown>;
		if (record.type !== 'tool_use' || typeof record.name !== 'string') {
			continue;
		}
		toolCalls.push({
			args:
				record.input && typeof record.input === 'object'
					? (record.input as Record<string, unknown>)
					: {},
			id: typeof record.id === 'string' ? record.id : undefined,
			name: record.name
		});
	}

	return toolCalls;
};

export const createAnthropicVoiceAssistantModel = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: AnthropicVoiceAssistantModelOptions
): VoiceAgentModel<TContext, TSession, TResult> => {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	const baseUrl = options.baseUrl ?? 'https://api.anthropic.com/v1';
	const model = options.model ?? 'claude-sonnet-4-5';

	return {
		generate: async (input) => {
			const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/messages`, {
				body: JSON.stringify({
					max_tokens: options.maxOutputTokens ?? 1024,
					messages: input.messages
						.map(messageToAnthropicMessage)
						.filter(Boolean),
					model,
					system: [input.system, ROUTE_RESULT_INSTRUCTION]
						.filter(Boolean)
						.join('\n\n'),
					temperature: options.temperature,
					tool_choice: input.tools.length ? { type: 'auto' } : { type: 'none' },
					tools: input.tools.map((tool) => ({
						description: tool.description,
						input_schema: tool.parameters ?? {
							additionalProperties: true,
							type: 'object'
						},
						name: tool.name
					}))
				}),
				headers: {
					'anthropic-version': options.version ?? '2023-06-01',
					'content-type': 'application/json',
					'x-api-key': options.apiKey
				},
				method: 'POST'
			});

			if (!response.ok) {
				throw createHTTPError('Anthropic', response);
			}

			const body = (await response.json()) as Record<string, unknown>;
			if (body.usage && typeof body.usage === 'object') {
				await options.onUsage?.(body.usage as Record<string, unknown>);
			}

			const toolCalls = extractAnthropicToolCalls(body);
			if (toolCalls.length) {
				return {
					assistantText: extractAnthropicText(body) || undefined,
					toolCalls
				};
			}

			return normalizeRouteOutput<TResult>(parseJSON(extractAnthropicText(body)));
		}
	};
};

const extractGeminiCandidateParts = (response: Record<string, unknown>) => {
	const candidates = Array.isArray(response.candidates) ? response.candidates : [];
	const first = candidates[0];
	if (!first || typeof first !== 'object') {
		return [];
	}
	const content = (first as Record<string, unknown>).content;
	if (!content || typeof content !== 'object') {
		return [];
	}
	const parts = (content as Record<string, unknown>).parts;
	return Array.isArray(parts) ? parts : [];
};

const extractGeminiText = (response: Record<string, unknown>) =>
	extractGeminiCandidateParts(response)
		.map((part) =>
			part &&
			typeof part === 'object' &&
			typeof (part as Record<string, unknown>).text === 'string'
				? ((part as Record<string, unknown>).text as string)
				: ''
		)
		.filter(Boolean)
		.join('\n');

const extractGeminiToolCalls = (response: Record<string, unknown>) => {
	const toolCalls: VoiceAgentToolCall[] = [];
	for (const part of extractGeminiCandidateParts(response)) {
		if (!part || typeof part !== 'object') {
			continue;
		}
		const functionCall = (part as Record<string, unknown>).functionCall;
		if (!functionCall || typeof functionCall !== 'object') {
			continue;
		}
		const record = functionCall as Record<string, unknown>;
		if (typeof record.name !== 'string') {
			continue;
		}
		toolCalls.push({
			args:
				record.args && typeof record.args === 'object'
					? (record.args as Record<string, unknown>)
					: {},
			id: typeof record.id === 'string' ? record.id : undefined,
			name: record.name
		});
	}

	return toolCalls;
};

export const createGeminiVoiceAssistantModel = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: GeminiVoiceAssistantModelOptions
): VoiceAgentModel<TContext, TSession, TResult> => {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	const baseUrl = options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
	const model = options.model ?? 'gemini-2.5-flash';
	const maxRetries = Math.max(0, options.maxRetries ?? 2);

	return {
		generate: async (input) => {
			const endpoint = `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`;
			let response: Response | undefined;
			for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
				response = await fetchImpl(endpoint, {
					body: JSON.stringify({
						contents: input.messages.map(messageToGeminiContent).filter(Boolean),
						generationConfig: {
							maxOutputTokens: options.maxOutputTokens,
							...(input.tools.length
								? {}
								: {
										responseMimeType: 'application/json',
										responseSchema: toGeminiSchema(OUTPUT_SCHEMA)
									}),
							temperature: options.temperature
						},
						systemInstruction: {
							parts: [
								{
									text: [input.system, ROUTE_RESULT_INSTRUCTION]
										.filter(Boolean)
										.join('\n\n')
								}
							]
						},
						tools: input.tools.length
							? [
									{
										functionDeclarations: input.tools.map((tool) => ({
											description: tool.description,
											name: tool.name,
											parameters: toGeminiSchema(
												tool.parameters ?? {
													additionalProperties: true,
													type: 'object'
												}
											)
										}))
									}
								]
							: undefined
					}),
					headers: {
						'content-type': 'application/json'
					},
					method: 'POST'
				});

				if (
					response.ok ||
					(response.status !== 429 && response.status < 500) ||
					attempt === maxRetries
				) {
					break;
				}

				const retryAfter = Number(response.headers.get('retry-after'));
				await sleep(
					Number.isFinite(retryAfter) && retryAfter > 0
						? retryAfter * 1000
						: 500 * 2 ** attempt
				);
			}

			if (!response) {
				throw new Error('Gemini voice assistant model failed: no response');
			}
			if (!response.ok) {
				throw createHTTPError('Gemini', response);
			}

			const body = (await response.json()) as Record<string, unknown>;
			if (body.usageMetadata && typeof body.usageMetadata === 'object') {
				await options.onUsage?.(body.usageMetadata as Record<string, unknown>);
			}

			const toolCalls = extractGeminiToolCalls(body);
			if (toolCalls.length) {
				return {
					assistantText: extractGeminiText(body) || undefined,
					toolCalls
				};
			}

			return normalizeRouteOutput<TResult>(parseJSON(extractGeminiText(body)));
		}
	};
};
