import type {
  VoiceAgentMessage,
  VoiceAgentModel,
  VoiceAgentModelInput,
  VoiceAgentModelOutput,
  VoiceAgentToolCall,
} from "./agent";
import type { VoiceLLMUsage, VoiceSessionRecord } from "./types";
import { startVoiceTimer } from "./debugTiming";
import { hardenFetch } from "./hardenedFetch";

// Normalize a provider's raw usage object into VoiceLLMUsage so the session can
// meter LLM cost. Handles Anthropic + OpenAI (input_tokens/output_tokens, with
// OpenAI's cached_tokens nested under input_tokens_details) and Gemini
// (usageMetadata.promptTokenCount/candidatesTokenCount/cachedContentTokenCount).
const normalizeVoiceUsage = (
  provider: string,
  model: string | undefined,
  raw: Record<string, unknown> | undefined,
): VoiceLLMUsage | undefined => {
  if (!raw) return undefined;
  const toNum = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const details =
    typeof raw.input_tokens_details === "object" &&
    raw.input_tokens_details !== null
      ? (raw.input_tokens_details as Record<string, unknown>)
      : undefined;
  const inputTokens =
    toNum(raw.input_tokens) ??
    toNum(raw.prompt_tokens) ??
    toNum(raw.promptTokenCount);
  const outputTokens =
    toNum(raw.output_tokens) ??
    toNum(raw.completion_tokens) ??
    toNum(raw.candidatesTokenCount);
  const cachedInputTokens =
    toNum(raw.cache_read_input_tokens) ??
    toNum(details?.cached_tokens) ??
    toNum(raw.cachedContentTokenCount);

  return { cachedInputTokens, inputTokens, model, outputTokens, provider };
};

export type VoiceJSONAssistantModelHandler<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = (
  input: VoiceAgentModelInput<TContext, TSession>,
) =>
  | Promise<Record<string, unknown> | VoiceAgentModelOutput<TResult>>
  | Record<string, unknown>
  | VoiceAgentModelOutput<TResult>;

export type VoiceJSONAssistantModelOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  generate: VoiceJSONAssistantModelHandler<TContext, TSession, TResult>;
  mapOutput?: (
    output: Record<string, unknown>,
  ) => VoiceAgentModelOutput<TResult>;
};

export type OpenAIVoiceAssistantModelOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  maxOutputTokens?: number;
  model?: string;
  onUsage?: (usage: Record<string, unknown>) => Promise<void> | void;
  temperature?: number;
  /**
   * Hard cap on a single /responses stream. Aborts via AbortController if
   * the stream doesn't complete in time. Default 60s — generous for typical
   * gpt-4.1-mini conversational turns (1-3s) but catches infinite hangs
   * (server-side stream stalls observed on rare complex inputs). On timeout
   * the agent loop falls through to default-silent-turn-ack.
   */
  timeoutMs?: number;
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
  /** Set when this event marks a provider returning an empty completion (no text
   *  and no tool call) that triggered a same-provider retry — so consumers can
   *  track how often the model glitches empty, and whether the retry recovered. */
  emptyCompletion?: boolean;
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
  status: "error" | "fallback" | "success";
  timedOut?: boolean;
};

export type VoiceProviderRouterFallbackMode =
  | "never"
  | "provider-error"
  | "rate-limit";

export type VoiceProviderRouterStrategy =
  | "balanced"
  | "ordered"
  | "prefer-cheapest"
  | "prefer-fastest"
  | "prefer-selected"
  | "quality-first";

export type VoiceProviderRouterPolicyPreset =
  | "balanced"
  | "cost-cap"
  | "cost-first"
  | "latency-first"
  | "quality-first";

export type VoiceProviderRouterPolicyWeights = {
  cost?: number;
  latencyMs?: number;
  priority?: number;
  quality?: number;
};

export type VoiceProviderRouterPolicy<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TProvider extends string = string,
> =
  | VoiceProviderRouterStrategy
  | VoiceProviderRouterPolicyPreset
  | {
      allowProviders?:
        | readonly TProvider[]
        | ((
            input: VoiceAgentModelInput<TContext, TSession>,
          ) => readonly TProvider[] | Promise<readonly TProvider[]>);
      fallbackMode?: VoiceProviderRouterFallbackMode;
      maxCost?: number;
      maxLatencyMs?: number;
      minQuality?: number;
      scoreProvider?: (
        provider: TProvider,
        profile: VoiceProviderRouterProviderProfile | undefined,
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
  value: string,
): value is VoiceProviderRouterPolicyPreset =>
  value === "balanced" ||
  value === "cost-cap" ||
  value === "cost-first" ||
  value === "latency-first" ||
  value === "quality-first";

export const resolveVoiceProviderRoutingPolicyPreset = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TProvider extends string = string,
>(
  preset: VoiceProviderRouterPolicyPreset,
  options: Omit<
    Extract<
      VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
      Record<string, unknown>
    >,
    "strategy"
  > = {},
): Extract<
  VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
  Record<string, unknown>
> => {
  switch (preset) {
    case "balanced":
      return {
        fallbackMode: "provider-error",
        strategy: "balanced",
        weights: {
          cost: 1,
          latencyMs: 0.005,
          priority: 1,
          quality: 10,
          ...options.weights,
        },
        ...options,
      };
    case "cost-cap":
      return {
        fallbackMode: "provider-error",
        strategy: "prefer-cheapest",
        ...options,
      };
    case "cost-first":
      return {
        fallbackMode: "provider-error",
        strategy: "prefer-cheapest",
        ...options,
      };
    case "latency-first":
      return {
        fallbackMode: "provider-error",
        strategy: "prefer-fastest",
        ...options,
      };
    case "quality-first":
      return {
        fallbackMode: "provider-error",
        strategy: "quality-first",
        ...options,
      };
  }
};

const resolveVoiceProviderRoutingPolicy = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TProvider extends string = string,
>(
  policy?: VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
):
  | Extract<
      VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
      Record<string, unknown>
    >
  | undefined => {
  if (!policy) {
    return undefined;
  }
  if (typeof policy === "string") {
    return isVoiceProviderRoutingPolicyPreset(policy)
      ? resolveVoiceProviderRoutingPolicyPreset<TContext, TSession, TProvider>(
          policy,
        )
      : {
          strategy: policy,
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
  TProvider extends string = string,
> = {
  consecutiveFailures: number;
  lastFailureAt?: number;
  lastRateLimitedAt?: number;
  provider: TProvider;
  status: "healthy" | "suppressed";
  suppressedUntil?: number;
};

export type VoiceProviderOrchestrationSurface<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TProvider extends string = string,
> = {
  allowProviders?:
    | readonly TProvider[]
    | ((
        input: VoiceAgentModelInput<TContext, TSession>,
      ) => readonly TProvider[] | Promise<readonly TProvider[]>);
  fallback?:
    | readonly TProvider[]
    | ((
        input: VoiceAgentModelInput<TContext, TSession>,
      ) => readonly TProvider[] | Promise<readonly TProvider[]>);
  fallbackMode?: VoiceProviderRouterFallbackMode;
  maxCost?: number;
  maxLatencyMs?: number;
  minQuality?: number;
  policy?: VoiceProviderRouterPolicy<TContext, TSession, TProvider>;
  providerHealth?: boolean | VoiceProviderRouterHealthOptions;
  providerProfiles?: Partial<
    Record<TProvider, VoiceProviderRouterProviderProfile>
  >;
  strategy?: VoiceProviderRouterStrategy;
  timeoutMs?: number;
  weights?: VoiceProviderRouterPolicyWeights;
};

export type VoiceProviderOrchestrationProfile<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TProvider extends string = string,
  TSurface extends string = string,
> = {
  defaultSurface?: TSurface;
  id: string;
  resolve: (
    surface?: TSurface,
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
  TSurface extends string = string,
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
  TProvider extends string = string,
> = {
  allowProviders?: VoiceProviderOrchestrationSurface<
    TContext,
    TSession,
    TProvider
  >["allowProviders"];
  fallback?: VoiceProviderOrchestrationSurface<
    TContext,
    TSession,
    TProvider
  >["fallback"];
  fallbackMode?: VoiceProviderRouterFallbackMode;
  policy?: VoiceProviderRouterPolicy<TContext, TSession, TProvider>;
  providerHealth?: boolean | VoiceProviderRouterHealthOptions;
  providerProfiles?: Partial<
    Record<TProvider, VoiceProviderRouterProviderProfile>
  >;
  timeoutMs?: number;
};

const mergeDefinedProviderPolicyFields = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TProvider extends string = string,
>(
  base:
    | Extract<
        VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
        Record<string, unknown>
      >
    | undefined,
  surface: VoiceProviderOrchestrationSurface<TContext, TSession, TProvider>,
): Extract<
  VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
  Record<string, unknown>
> => {
  const next: Extract<
    VoiceProviderRouterPolicy<TContext, TSession, TProvider>,
    Record<string, unknown>
  > = {
    ...(base ?? {}),
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
      ...surface.weights,
    };
  }

  return next;
};

export const createVoiceProviderOrchestrationProfile = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TProvider extends string = string,
  TSurface extends string = string,
>(
  options: VoiceProviderOrchestrationProfileOptions<
    TContext,
    TSession,
    TProvider,
    TSurface
  >,
): VoiceProviderOrchestrationProfile<
  TContext,
  TSession,
  TProvider,
  TSurface
> => {
  const surfaceNames = Object.keys(options.surfaces) as TSurface[];
  const defaultSurface = options.defaultSurface ?? surfaceNames[0];
  if (!defaultSurface || !options.surfaces[defaultSurface]) {
    throw new Error("Voice provider orchestration profile has no surfaces.");
  }

  return {
    defaultSurface,
    id: options.id,
    surfaces: options.surfaces,
    resolve: (surface = defaultSurface) => {
      const config = options.surfaces[surface];
      if (!config) {
        throw new Error(
          `Voice provider orchestration profile ${options.id} has no surface "${surface}".`,
        );
      }
      const policy = mergeDefinedProviderPolicyFields(
        resolveVoiceProviderRoutingPolicy(config.policy),
        config,
      );

      return {
        allowProviders: config.allowProviders,
        fallback: config.fallback,
        fallbackMode: config.fallbackMode,
        policy,
        providerHealth: config.providerHealth,
        providerProfiles: config.providerProfiles,
        timeoutMs: config.timeoutMs,
      };
    },
  };
};

export type VoiceProviderRouterOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
  TProvider extends string = string,
> = {
  allowProviders?:
    | readonly TProvider[]
    | ((
        input: VoiceAgentModelInput<TContext, TSession>,
      ) => readonly TProvider[] | Promise<readonly TProvider[]>);
  fallback?:
    | TProvider[]
    | ((
        input: VoiceAgentModelInput<TContext, TSession>,
      ) => readonly TProvider[] | Promise<readonly TProvider[]>);
  fallbackMode?: VoiceProviderRouterFallbackMode;
  /** Retry the SAME provider this many times when it returns a non-error but
   *  EMPTY completion (no assistant text AND no tool call) before accepting it.
   *  An empty completion is a transient model glitch (observed on OpenAI
   *  /responses returning a 200 with zero output items mid-conversation), NOT a
   *  provider error — so it bypasses fallbackMode and never suppresses provider
   *  health. Without this a one-off empty surfaces to the app as a dead turn
   *  (the caller hears a re-engage / "go on, I'm listening" loop). Default 1. */
  emptyCompletionRetries?: number;
  isProviderError?: (error: unknown, provider: TProvider) => boolean;
  isRateLimitError?: (error: unknown, provider: TProvider) => boolean;
  isTimeoutError?: (error: unknown, provider: TProvider) => boolean;
  onProviderEvent?: (
    event: VoiceProviderRouterEvent<TProvider>,
    input: VoiceAgentModelInput<TContext, TSession>,
  ) => Promise<void> | void;
  orchestrationProfile?: VoiceProviderOrchestrationProfile<
    TContext,
    TSession,
    TProvider
  >;
  orchestrationSurface?: string;
  policy?: VoiceProviderRouterPolicy<TContext, TSession, TProvider>;
  providerHealth?: boolean | VoiceProviderRouterHealthOptions;
  providerProfiles?: Partial<
    Record<TProvider, VoiceProviderRouterProviderProfile>
  >;
  timeoutMs?: number;
  providers: Partial<
    Record<TProvider, VoiceAgentModel<TContext, TSession, TResult>>
  >;
  selectProvider?: (
    input: VoiceAgentModelInput<TContext, TSession>,
  ) => TProvider | undefined | Promise<TProvider | undefined>;
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
    this.name = "VoiceProviderTimeoutError";
    this.provider = provider;
    this.timeoutMs = timeoutMs;
  }
}

const getMessageToolCalls = (
  message: VoiceAgentMessage,
): VoiceAgentToolCall[] => {
  const toolCalls = message.metadata?.toolCalls;

  return Array.isArray(toolCalls)
    ? (toolCalls.filter(
        (toolCall) =>
          toolCall &&
          typeof toolCall === "object" &&
          typeof (toolCall as Record<string, unknown>).name === "string",
      ) as VoiceAgentToolCall[])
    : [];
};

const createHTTPError = (provider: string, response: Response) =>
  new Error(
    `${provider} voice assistant model failed: HTTP ${response.status}`,
  );

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const defaultIsRateLimitError = (error: unknown) =>
  /(\b429\b|rate limit|quota|too many requests)/i.test(errorMessage(error));

const normalizeRouteOutput = <TResult>(
  output: Record<string, unknown>,
): VoiceAgentModelOutput<TResult> => {
  const result: VoiceAgentModelOutput<TResult> = {};

  if (typeof output.assistantText === "string") {
    result.assistantText = output.assistantText;
  }
  if (typeof output.complete === "boolean") {
    result.complete = output.complete;
  }
  if (output.result !== undefined) {
    result.result = output.result as TResult;
  }
  if (output.transfer && typeof output.transfer === "object") {
    const transfer = output.transfer as Record<string, unknown>;
    if (typeof transfer.target === "string") {
      result.transfer = {
        metadata:
          transfer.metadata && typeof transfer.metadata === "object"
            ? (transfer.metadata as Record<string, unknown>)
            : undefined,
        reason:
          typeof transfer.reason === "string" ? transfer.reason : undefined,
        target: transfer.target,
      };
    }
  }
  if (output.escalate && typeof output.escalate === "object") {
    const escalate = output.escalate as Record<string, unknown>;
    if (typeof escalate.reason === "string") {
      result.escalate = {
        metadata:
          escalate.metadata && typeof escalate.metadata === "object"
            ? (escalate.metadata as Record<string, unknown>)
            : undefined,
        reason: escalate.reason,
      };
    }
  }
  if (output.voicemail && typeof output.voicemail === "object") {
    const voicemail = output.voicemail as Record<string, unknown>;
    result.voicemail = {
      metadata:
        voicemail.metadata && typeof voicemail.metadata === "object"
          ? (voicemail.metadata as Record<string, unknown>)
          : undefined,
    };
  }
  if (output.noAnswer && typeof output.noAnswer === "object") {
    const noAnswer = output.noAnswer as Record<string, unknown>;
    result.noAnswer = {
      metadata:
        noAnswer.metadata && typeof noAnswer.metadata === "object"
          ? (noAnswer.metadata as Record<string, unknown>)
          : undefined,
    };
  }

  return result;
};

export const createJSONVoiceAssistantModel = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: VoiceJSONAssistantModelOptions<TContext, TSession, TResult>,
): VoiceAgentModel<TContext, TSession, TResult> => ({
  generate: async (input) => {
    const output = await options.generate(input);
    if (
      "assistantText" in output ||
      "toolCalls" in output ||
      "complete" in output ||
      "transfer" in output ||
      "escalate" in output
    ) {
      return output;
    }

    return options.mapOutput?.(output) ?? normalizeRouteOutput<TResult>(output);
  },
});

// A completion that came back with neither assistant text nor a tool call. The
// turn produced nothing usable — distinct from a thrown provider error.
const isEmptyModelOutput = (output: VoiceAgentModelOutput<unknown>) =>
  !output.assistantText?.trim() && !output.toolCalls?.length;

export const createVoiceProviderRouter = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
  TProvider extends string = string,
>(
  options: VoiceProviderRouterOptions<TContext, TSession, TResult, TProvider>,
): VoiceAgentModel<TContext, TSession, TResult> => {
  const providerIds = Object.keys(options.providers) as TProvider[];
  const firstProvider = providerIds[0];
  const orchestrationSurface = options.orchestrationProfile?.resolve(
    options.orchestrationSurface,
  );
  const policy =
    resolveVoiceProviderRoutingPolicy(options.policy) ??
    resolveVoiceProviderRoutingPolicy(orchestrationSurface?.policy);
  const strategy = policy?.strategy ?? "prefer-selected";
  const fallbackMode =
    policy?.fallbackMode ??
    options.fallbackMode ??
    orchestrationSurface?.fallbackMode ??
    "provider-error";
  const emptyCompletionRetries = Math.max(
    0,
    options.emptyCompletionRetries ?? 1,
  );
  const providerProfiles = {
    ...(orchestrationSurface?.providerProfiles ?? {}),
    ...(options.providerProfiles ?? {}),
  } as Partial<Record<TProvider, VoiceProviderRouterProviderProfile>>;
  const providerHealthOption =
    options.providerHealth ?? orchestrationSurface?.providerHealth;
  const healthOptions: VoiceProviderRouterHealthOptions | undefined =
    typeof providerHealthOption === "object"
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
    healthOptions?.rateLimitCooldownMs ?? 60_000,
  );
  const getProviderTimeoutMs = (provider: TProvider) => {
    const timeoutMs =
      providerProfiles[provider]?.timeoutMs ??
      options.timeoutMs ??
      orchestrationSurface?.timeoutMs;

    return typeof timeoutMs === "number" &&
      Number.isFinite(timeoutMs) &&
      timeoutMs > 0
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
      status: "healthy",
    };
    healthState.set(provider, next);

    return next;
  };

  const cloneHealth = (provider: TProvider) => {
    if (!healthOptions) {
      return undefined;
    }

    return {
      ...getHealth(provider),
    };
  };

  const getSuppressionRemainingMs = (provider: TProvider) => {
    if (!healthOptions) {
      return undefined;
    }
    const { suppressedUntil } = getHealth(provider);

    return typeof suppressedUntil === "number"
      ? Math.max(0, suppressedUntil - now())
      : undefined;
  };

  const isSuppressed = (provider: TProvider) => {
    if (!healthOptions) {
      return false;
    }
    const health = getHealth(provider);

    return (
      typeof health.suppressedUntil === "number" &&
      health.suppressedUntil > now()
    );
  };

  const recordProviderSuccess = (provider: TProvider) => {
    if (!healthOptions) {
      return undefined;
    }
    const health = getHealth(provider);
    health.consecutiveFailures = 0;
    health.status = "healthy";
    health.suppressedUntil = undefined;

    return cloneHealth(provider);
  };

  const recordProviderError = (
    provider: TProvider,
    isProviderError: boolean,
    rateLimited: boolean,
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
      health.status = "suppressed";
      health.suppressedUntil =
        currentTime + (rateLimited ? rateLimitCooldownMs : cooldownMs);
    }

    return cloneHealth(provider);
  };

  const resolveAllowedProviders = async (
    input: VoiceAgentModelInput<TContext, TSession>,
  ) => {
    const allowProviders =
      policy?.allowProviders ??
      options.allowProviders ??
      orchestrationSurface?.allowProviders;
    const allowed =
      typeof allowProviders === "function"
        ? await allowProviders(input)
        : allowProviders;

    return new Set(allowed ?? providerIds);
  };

  const passesBudgetFilters = (provider: TProvider) => {
    const profile = providerProfiles[provider];
    if (
      typeof policy?.maxCost === "number" &&
      typeof profile?.cost === "number" &&
      profile.cost > policy.maxCost
    ) {
      return false;
    }
    if (
      typeof policy?.maxLatencyMs === "number" &&
      typeof profile?.latencyMs === "number" &&
      profile.latencyMs > policy.maxLatencyMs
    ) {
      return false;
    }
    if (
      typeof policy?.minQuality === "number" &&
      typeof profile?.quality === "number" &&
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
      strategy !== "prefer-cheapest" &&
      strategy !== "prefer-fastest" &&
      strategy !== "quality-first" &&
      strategy !== "balanced"
    ) {
      return providers;
    }

    return [...providers].sort((left, right) => {
      const leftProfile = providerProfiles[left];
      const rightProfile = providerProfiles[right];
      if (strategy === "quality-first") {
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
      if (strategy === "balanced") {
        return getBalancedScore(left) - getBalancedScore(right);
      }
      const leftValue =
        strategy === "prefer-cheapest"
          ? (leftProfile?.cost ?? Number.MAX_SAFE_INTEGER)
          : (leftProfile?.latencyMs ?? Number.MAX_SAFE_INTEGER);
      const rightValue =
        strategy === "prefer-cheapest"
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
    input: VoiceAgentModelInput<TContext, TSession>,
  ) => {
    const selectedProvider = await options.selectProvider?.(input);
    const allowedProviders = await resolveAllowedProviders(input);
    const fallbackSource = options.fallback ?? orchestrationSurface?.fallback;
    const fallbackOrder =
      typeof fallbackSource === "function"
        ? await fallbackSource(input)
        : fallbackSource;
    const allowedRankedProviders = sortProviders([
      ...(fallbackOrder ?? providerIds),
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
        : (candidateRankedProviders[0] ?? firstProvider);
    const seen = new Set<TProvider>();
    const order: TProvider[] = [];
    const candidates =
      strategy === "ordered"
        ? candidateRankedProviders
        : [
            preferred,
            ...candidateRankedProviders,
            ...providerIds.filter(
              (provider) => !healthOptions || !isSuppressed(provider),
            ),
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
      selectedProvider: preferred,
    };
  };

  const emit = async (
    event: VoiceProviderRouterEvent<TProvider>,
    input: VoiceAgentModelInput<TContext, TSession>,
  ) => {
    await options.onProviderEvent?.(event, input);
  };

  const runProvider = async (
    provider: TProvider,
    model: VoiceAgentModel<TContext, TSession, TResult>,
    input: VoiceAgentModelInput<TContext, TSession>,
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
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  };

  // Run a provider, retrying the SAME provider on a non-error but EMPTY
  // completion (no text, no tool call) up to emptyCompletionRetries times. An
  // empty completion is a transient model glitch (not a provider error), so it
  // deliberately bypasses fallbackMode + provider-health — it must neither switch
  // providers nor suppress this one. Each retry emits an observability event.
  const runProviderWithEmptyRetry = async (
    provider: TProvider,
    model: VoiceAgentModel<TContext, TSession, TResult>,
    input: VoiceAgentModelInput<TContext, TSession>,
    index: number,
    selectedProvider: TProvider,
    startedAt: number,
  ) => {
    let output = await runProvider(provider, model, input);
    let emptyAttempt = 0;
    while (
      emptyAttempt < emptyCompletionRetries &&
      isEmptyModelOutput(output)
    ) {
      emptyAttempt += 1;
      // eslint-disable-next-line no-await-in-loop -- retries are sequential
      await emit(
        {
          at: Date.now(),
          attempt: index + 1,
          elapsedMs: Date.now() - startedAt,
          emptyCompletion: true,
          provider,
          selectedProvider,
          status: "success",
        },
        input,
      );
      // eslint-disable-next-line no-await-in-loop -- retry the same provider serially
      output = await runProvider(provider, model, input);
    }

    return output;
  };

  return {
    generate: async (input) => {
      const { order, selectedProvider } = await resolveOrder(input);
      if (!selectedProvider || order.length === 0) {
        throw new Error("Voice provider router has no available providers.");
      }

      let lastError: unknown;
      for (const [index, provider] of order.entries()) {
        const model = options.providers[provider];
        if (!model) {
          continue;
        }
        const startedAt = Date.now();
        try {
          const output = await runProviderWithEmptyRetry(
            provider,
            model,
            input,
            index,
            selectedProvider,
            startedAt,
          );
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
              status: provider === selectedProvider ? "success" : "fallback",
            },
            input,
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
            fallbackMode === "provider-error"
              ? isProviderError
              : fallbackMode === "rate-limit"
                ? isProviderError && rateLimited
                : false;
          const providerHealth = recordProviderError(
            provider,
            isProviderError,
            rateLimited,
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
              status: "error",
              timedOut,
            },
            input,
          );

          if (!hasNextProvider || !shouldFallback) {
            throw error;
          }
        }
      }

      throw (
        lastError ?? new Error("Voice provider router did not run a provider.")
      );
    },
  };
};

const messageToOpenAIInput = (
  message: VoiceAgentMessage,
): Array<Record<string, unknown>> => {
  if (message.role === "tool") {
    return [
      {
        call_id: message.toolCallId ?? message.name ?? crypto.randomUUID(),
        output: message.content,
        type: "function_call_output",
      },
    ];
  }

  const toolCalls = getMessageToolCalls(message);
  if (message.role === "assistant" && toolCalls.length) {
    return toolCalls.map((toolCall) => ({
      arguments: JSON.stringify(toolCall.args),
      call_id: toolCall.id ?? crypto.randomUUID(),
      name: toolCall.name,
      type: "function_call",
    }));
  }

  return [
    {
      content: message.content,
      role: message.role === "system" ? "developer" : message.role,
    },
  ];
};

const messagesToOpenAIInput = (messages: VoiceAgentMessage[]) =>
  messages.flatMap(messageToOpenAIInput);

const messageToAnthropicMessage = (message: VoiceAgentMessage) => {
  if (message.role === "system") {
    return undefined;
  }

  if (message.role === "tool") {
    if (!message.toolCallId) {
      return {
        content: `Tool result from ${message.name ?? "tool"}: ${message.content}`,
        role: "user",
      };
    }

    return {
      content: [
        {
          content: message.content,
          tool_use_id: message.toolCallId,
          type: "tool_result",
        },
      ],
      role: "user",
    };
  }

  const toolCalls = getMessageToolCalls(message);
  if (message.role === "assistant" && toolCalls.length) {
    return {
      content: [
        ...(message.content
          ? [
              {
                text: message.content,
                type: "text",
              },
            ]
          : []),
        ...toolCalls.map((toolCall) => ({
          id: toolCall.id ?? crypto.randomUUID(),
          input: toolCall.args,
          name: toolCall.name,
          type: "tool_use",
        })),
      ],
      role: "assistant",
    };
  }

  return {
    content: message.content,
    role: message.role,
  };
};

const toGeminiSchema = (
  schema: Record<string, unknown>,
): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties") {
      continue;
    }
    if (key === "type" && typeof value === "string") {
      next[key] = value.toUpperCase();
      continue;
    }
    if (Array.isArray(value)) {
      next[key] = value.map((item) =>
        item && typeof item === "object"
          ? toGeminiSchema(item as Record<string, unknown>)
          : item,
      );
      continue;
    }
    if (value && typeof value === "object") {
      next[key] = toGeminiSchema(value as Record<string, unknown>);
      continue;
    }
    next[key] = value;
  }

  return next;
};

const messageToGeminiContent = (message: VoiceAgentMessage) => {
  if (message.role === "system") {
    return undefined;
  }

  if (message.role === "tool") {
    return {
      parts: [
        {
          functionResponse: {
            id: message.toolCallId,
            name: message.name ?? "tool",
            response: {
              result: parseJSONValue(message.content),
            },
          },
        },
      ],
      role: "user",
    };
  }

  const toolCalls = getMessageToolCalls(message);
  if (message.role === "assistant" && toolCalls.length) {
    return {
      parts: [
        ...(message.content
          ? [
              {
                text: message.content,
              },
            ]
          : []),
        ...toolCalls.map((toolCall) => ({
          functionCall: {
            args: toolCall.args,
            id: toolCall.id,
            name: toolCall.name,
          },
        })),
      ],
      role: "model",
    };
  }

  return {
    parts: [
      {
        text: message.content,
      },
    ],
    role: message.role === "assistant" ? "model" : "user",
  };
};

// Spoken-style system instructions (Option B): the model replies with natural
// prose for TTS and takes call actions via the built-in lifecycle tools instead
// of returning a JSON object. This lets us stream the reply straight to TTS.
const VOICE_SYSTEM_INSTRUCTIONS =
  "You are on a live phone call. Reply with natural, concise spoken sentences — no markdown, lists, headings, or emoji. To take an action (transfer the call, escalate, record voicemail/no-answer, or end the call), CALL the matching tool rather than describing it in words. Call the complete tool once the conversation's goal is met.";

const parseToolArgs = (raw: string) => {
  if (!raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;

    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

// Read an SSE response body, invoking onEvent with each parsed `data:` JSON
// payload. Shared by the streaming model adapters.
//
// Two-layer abort handling — both are required because `await reader.read()`
// is genuinely indefinite when the server stops sending (keeps the
// connection alive but emits nothing, or stalls after a barge-in-driven
// abort that didn't fully propagate):
//
//   1. `signal` (passed by the adapter's timeout AbortController): if it
//      fires, we Promise.race the reader.read() against an abort-rejection
//      and throw out of the loop immediately. Without this, modern fetch's
//      "abort propagates to body stream" guarantee doesn't always hold in
//      Bun's compiled binary, and the 60s parent timeout silently has no
//      effect.
//   2. `inactivityMs` (default 10s): if no chunk arrives within this
//      window we throw an inactivity error. Catches the case where the
//      server keeps the connection alive but sends no data (no heartbeat,
//      no completion) — observed on OpenAI /responses after rare upstream
//      hiccups. Live-traced 2026-05-27.
const readServerSentEvents = async (
  response: Response,
  onEvent: (event: Record<string, unknown>) => void,
  abortOptions?: {
    signal?: AbortSignal;
    inactivityMs?: number;
  },
) => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("streaming response has no body");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  const signal = abortOptions?.signal;
  const inactivityMs = abortOptions?.inactivityMs ?? 10_000;

  const drain = (block: string) => {
    for (const line of block.split("\n")) {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice("data:".length).trim();
      if (!data || data === "[DONE]") continue;
      try {
        onEvent(JSON.parse(data) as Record<string, unknown>);
      } catch {
        // Ignore keep-alive / non-JSON frames.
      }
    }
  };

  // readWithRace: returns whatever resolves first between:
  //   - reader.read() (real chunk or done)
  //   - inactivity timeout (rejects)
  //   - signal abort (rejects)
  // Cancels the reader on any rejection path so the underlying connection
  // is freed instead of leaked.
  type ReadChunk =
    | { done: false; value: Uint8Array }
    | { done: true; value?: undefined };
  const readWithRace = async (): Promise<ReadChunk> => {
    if (signal?.aborted) {
      try {
        await reader.cancel();
      } catch {
        /* best-effort */
      }
      throw new Error("SSE read aborted by signal");
    }
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let onAbort: (() => void) | null = null;
    return new Promise<ReadChunk>((resolve, reject) => {
      inactivityTimer = setTimeout(() => {
        // Cancel the reader so the connection releases promptly.
        reader.cancel().catch(() => {
          /* best-effort */
        });
        reject(
          new Error(
            `SSE read inactivity timeout (${inactivityMs}ms with no chunk)`,
          ),
        );
      }, inactivityMs);
      if (signal) {
        onAbort = () => {
          reader.cancel().catch(() => {
            /* best-effort */
          });
          reject(new Error("SSE read aborted by signal"));
        };
        signal.addEventListener("abort", onAbort);
      }
      reader.read().then(
        (result) => resolve(result as ReadChunk),
        (err) => reject(err),
      );
    }).finally(() => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    });
  };

  for (;;) {
    const { done, value } = await readWithRace();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf("\n\n");
    while (separator !== -1) {
      drain(buffer.slice(0, separator));
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) drain(buffer);
};

type StreamedToolCall = { args: string; id?: string; name: string };

const finalizeToolCalls = (
  calls: Map<string, StreamedToolCall>,
): VoiceAgentToolCall[] =>
  [...calls.values()]
    .filter((call) => call.name)
    .map((call) => ({
      args: parseToolArgs(call.args),
      id: call.id,
      name: call.name,
    }));

// Parse the OpenAI Responses SSE stream: forward text deltas + accumulate
// function (tool) calls and usage.
const consumeOpenAIResponsesStream = async (
  response: Response,
  onTextDelta?: (delta: string) => void,
  abortOptions?: { signal?: AbortSignal; inactivityMs?: number },
) => {
  let assistantText = "";
  let usage: Record<string, unknown> | undefined;
  // Diagnostics for an EMPTY completion: the terminal status (completed /
  // incomplete / failed), the reason an incomplete one stopped early
  // (max_output_tokens / content_filter), any model refusal text, and how many
  // output items the response carried. Lets a caller see WHY a turn came back
  // with no text/tools instead of guessing.
  let status: string | undefined;
  let incompleteReason: string | undefined;
  let refusal = "";
  let failureMessage: string | undefined;
  let outputItems = 0;
  const calls = new Map<string, StreamedToolCall>();

  await readServerSentEvents(
    response,
    (event) => {
      const type = typeof event.type === "string" ? event.type : "";
      const item = event.item as Record<string, unknown> | undefined;
      if (type === "response.output_item.added") {
        outputItems += 1;
      }
      if (
        (type === "response.refusal.delta" ||
          type === "response.refusal.done") &&
        typeof event.delta === "string"
      ) {
        refusal += event.delta;
      }
      if (
        type === "response.output_text.delta" &&
        typeof event.delta === "string"
      ) {
        assistantText += event.delta;
        onTextDelta?.(event.delta);
      } else if (
        type === "response.output_item.added" &&
        item?.type === "function_call"
      ) {
        calls.set(String(item.id ?? item.call_id ?? ""), {
          args: typeof item.arguments === "string" ? item.arguments : "",
          id:
            typeof item.call_id === "string"
              ? item.call_id
              : (item.id as string),
          name: typeof item.name === "string" ? item.name : "",
        });
      } else if (
        type === "response.function_call_arguments.delta" &&
        typeof event.delta === "string"
      ) {
        const entry = calls.get(String(event.item_id ?? ""));
        if (entry) entry.args += event.delta;
      } else if (
        type === "response.output_item.done" &&
        item?.type === "function_call" &&
        typeof item.arguments === "string" &&
        item.arguments
      ) {
        const entry = calls.get(String(item.id ?? item.call_id ?? ""));
        if (entry) entry.args = item.arguments;
      } else if (
        type === "response.completed" ||
        type === "response.incomplete" ||
        type === "response.failed"
      ) {
        const completed = event.response as Record<string, unknown> | undefined;
        if (completed?.usage && typeof completed.usage === "object") {
          usage = completed.usage as Record<string, unknown>;
        }
        if (typeof completed?.status === "string") {
          status = completed.status;
        }
        const incomplete = completed?.incomplete_details as
          | Record<string, unknown>
          | undefined;
        if (typeof incomplete?.reason === "string") {
          incompleteReason = incomplete.reason;
        }
        const failure = completed?.error as Record<string, unknown> | undefined;
        if (typeof failure?.message === "string") {
          failureMessage = failure.message;
        }
      }
    },
    abortOptions,
  );

  return {
    assistantText,
    failureMessage,
    incompleteReason,
    outputItems,
    refusal: refusal || undefined,
    status,
    toolCalls: finalizeToolCalls(calls),
    usage,
  };
};

export const createOpenAIVoiceAssistantModel = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: OpenAIVoiceAssistantModelOptions,
): VoiceAgentModel<TContext, TSession, TResult> => {
  // hardenFetch: works around a Bun stale-keepalive hang — see hardenedFetch.ts
  // / UPSTREAM_ISSUES.md. Wraps the caller's fetch too if they supplied one.
  const fetchImpl = hardenFetch(options.fetch);
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  const model = options.model ?? "gpt-4.1-mini";
  // OpenAI's `/responses` SSE stream has no built-in client timeout; if the
  // server hangs after returning 200 (rare but possible — saw it on phone
  // intake with merged adversarial input 2026-05-27), the await never
  // resolves and the entire voice session blocks indefinitely. Bound the
  // whole request+stream at this limit; on timeout, the AbortController
  // throws and the agent loop falls through to the default-silent-turn-ack
  // safeguard. 60s is generous for normal calls (gpt-4.1-mini typically
  // streams in 1-3s) but catches infinite hangs.
  const timeoutMs = options.timeoutMs ?? 60_000;

  return {
    generate: async (input) => {
      const stamp = startVoiceTimer(input.session.id);
      const ac = new AbortController();
      const timer = setTimeout(() => {
        ac.abort(
          new Error(
            `OpenAI /responses timed out after ${timeoutMs}ms (no completion event received)`,
          ),
        );
      }, timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/responses`, {
          body: JSON.stringify({
            input: messagesToOpenAIInput(input.messages),
            instructions: [input.system, VOICE_SYSTEM_INSTRUCTIONS]
              .filter(Boolean)
              .join("\n\n"),
            max_output_tokens: options.maxOutputTokens,
            model,
            stream: true,
            temperature: options.temperature,
            tool_choice: input.tools.length ? "auto" : "none",
            tools: input.tools.map((tool) => ({
              description: tool.description,
              name: tool.name,
              parameters: tool.parameters ?? {
                additionalProperties: true,
                type: "object",
              },
              strict: false,
              type: "function",
            })),
          }),
          headers: {
            accept: "text/event-stream",
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
          },
          method: "POST",
          signal: ac.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        throw error;
      }

      stamp("openai.fetch-returned", {
        messages: input.messages.length,
        status: response.status,
      });

      if (!response.ok) {
        clearTimeout(timer);
        throw createHTTPError("OpenAI", response);
      }

      let assistantText: string | undefined;
      let toolCalls: VoiceAgentToolCall[];
      let usage: Record<string, unknown> | undefined;
      let status: string | undefined;
      let incompleteReason: string | undefined;
      let refusal: string | undefined;
      let failureMessage: string | undefined;
      let outputItems = 0;
      // Stamp the FIRST text delta so we can separate "OpenAI is slow to first
      // token" from "the stream is slow to drain".
      let firstDeltaSeen = false;
      const onTextDelta = input.onTextDelta
        ? (delta: string) => {
            if (!firstDeltaSeen) {
              firstDeltaSeen = true;
              stamp("openai.first-delta");
            }
            input.onTextDelta?.(delta);
          }
        : undefined;
      try {
        ({
          assistantText,
          toolCalls,
          usage,
          status,
          incompleteReason,
          refusal,
          failureMessage,
          outputItems,
        } = await consumeOpenAIResponsesStream(response, onTextDelta, {
          // Pass the abort signal to the stream reader so my parent
          // timeout actually interrupts a stalled reader.read(). Without
          // this, ac.abort() aborts the fetch REQUEST but the body
          // stream's reader.read() can stay blocked indefinitely in
          // Bun's compiled binary — confirmed live 2026-05-27.
          signal: ac.signal,
          // Inactivity sub-timeout — even if the parent timer is
          // generous, kill the read if the server stalls for >10s with
          // no chunk. Catches the post-barge-in OpenAI hang where the
          // connection stays open but no events arrive.
          inactivityMs: 10_000,
        }));
        stamp("openai.stream-done", {
          textChars: assistantText?.length ?? 0,
          toolCalls: toolCalls.length,
        });
        // Empty completion (no text, no tool call) — record WHY so a recurring
        // glitch is diagnosable instead of a mystery. The router retries this;
        // the stamp survives whether or not the retry recovers.
        if (!assistantText?.trim() && !toolCalls.length) {
          stamp("openai.empty-completion", {
            failureMessage: failureMessage ?? "none",
            incompleteReason: incompleteReason ?? "none",
            outputItems,
            refusal: refusal ? refusal.slice(0, 200) : "none",
            status: status ?? "unknown",
          });
        }
      } finally {
        clearTimeout(timer);
      }
      if (usage) {
        await options.onUsage?.(usage);
      }

      return {
        ...(assistantText ? { assistantText } : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
        ...(usage
          ? { usage: normalizeVoiceUsage("openai", options.model, usage) }
          : {}),
      };
    },
  };
};

// Parse the Anthropic Messages SSE stream: forward text deltas + accumulate
// tool_use blocks (keyed by content block index) and usage.
const consumeAnthropicStream = async (
  response: Response,
  onTextDelta?: (delta: string) => void,
) => {
  let assistantText = "";
  let usage: Record<string, unknown> | undefined;
  const calls = new Map<string, StreamedToolCall>();

  await readServerSentEvents(response, (event) => {
    const type = typeof event.type === "string" ? event.type : "";
    const delta = event.delta as Record<string, unknown> | undefined;
    if (type === "content_block_delta" && delta?.type === "text_delta") {
      if (typeof delta.text === "string") {
        assistantText += delta.text;
        onTextDelta?.(delta.text);
      }
    } else if (
      type === "content_block_delta" &&
      delta?.type === "input_json_delta" &&
      typeof delta.partial_json === "string"
    ) {
      const entry = calls.get(String(event.index ?? ""));
      if (entry) entry.args += delta.partial_json;
    } else if (type === "content_block_start") {
      const block = event.content_block as Record<string, unknown> | undefined;
      if (block?.type === "tool_use") {
        calls.set(String(event.index ?? ""), {
          args: "",
          id: typeof block.id === "string" ? block.id : undefined,
          name: typeof block.name === "string" ? block.name : "",
        });
      }
    } else if (type === "message_start") {
      const message = event.message as Record<string, unknown> | undefined;
      if (message?.usage && typeof message.usage === "object") {
        usage = message.usage as Record<string, unknown>;
      }
    } else if (
      type === "message_delta" &&
      event.usage &&
      typeof event.usage === "object"
    ) {
      usage = { ...usage, ...(event.usage as Record<string, unknown>) };
    }
  });

  return { assistantText, toolCalls: finalizeToolCalls(calls), usage };
};

export const createAnthropicVoiceAssistantModel = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: AnthropicVoiceAssistantModelOptions,
): VoiceAgentModel<TContext, TSession, TResult> => {
  // hardenFetch: works around a Bun stale-keepalive hang — see hardenedFetch.ts
  // / UPSTREAM_ISSUES.md. Wraps the caller's fetch too if they supplied one.
  const fetchImpl = hardenFetch(options.fetch);
  const baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1";
  const model = options.model ?? "claude-sonnet-4-5";

  return {
    generate: async (input) => {
      const response = await fetchImpl(
        `${baseUrl.replace(/\/$/, "")}/messages`,
        {
          body: JSON.stringify({
            max_tokens: options.maxOutputTokens ?? 1024,
            messages: input.messages
              .map(messageToAnthropicMessage)
              .filter(Boolean),
            model,
            stream: true,
            system: [input.system, VOICE_SYSTEM_INSTRUCTIONS]
              .filter(Boolean)
              .join("\n\n"),
            temperature: options.temperature,
            tool_choice: input.tools.length
              ? { type: "auto" }
              : { type: "none" },
            tools: input.tools.map((tool) => ({
              description: tool.description,
              input_schema: tool.parameters ?? {
                additionalProperties: true,
                type: "object",
              },
              name: tool.name,
            })),
          }),
          headers: {
            "anthropic-version": options.version ?? "2023-06-01",
            "content-type": "application/json",
            "x-api-key": options.apiKey,
          },
          method: "POST",
        },
      );

      if (!response.ok) {
        throw createHTTPError("Anthropic", response);
      }

      const { assistantText, toolCalls, usage } = await consumeAnthropicStream(
        response,
        input.onTextDelta,
      );
      if (usage) {
        await options.onUsage?.(usage);
      }

      return {
        ...(assistantText ? { assistantText } : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
        ...(usage
          ? { usage: normalizeVoiceUsage("anthropic", options.model, usage) }
          : {}),
      };
    },
  };
};

const handleGeminiPart = (
  part: unknown,
  collect: {
    onTextDelta?: (delta: string) => void;
    toolCalls: VoiceAgentToolCall[];
  },
) => {
  if (!part || typeof part !== "object") return "";
  const record = part as Record<string, unknown>;
  if (typeof record.text === "string" && record.text) {
    collect.onTextDelta?.(record.text);

    return record.text;
  }
  const { functionCall } = record;
  if (functionCall && typeof functionCall === "object") {
    const fn = functionCall as Record<string, unknown>;
    if (typeof fn.name === "string") {
      collect.toolCalls.push({
        args:
          fn.args && typeof fn.args === "object"
            ? (fn.args as Record<string, unknown>)
            : {},
        id: typeof fn.id === "string" ? fn.id : undefined,
        name: fn.name,
      });
    }
  }

  return "";
};

// Parse the Gemini streamGenerateContent SSE stream: forward text part deltas +
// accumulate functionCall parts and usage.
const consumeGeminiStream = async (
  response: Response,
  onTextDelta?: (delta: string) => void,
) => {
  let assistantText = "";
  let usage: Record<string, unknown> | undefined;
  const toolCalls: VoiceAgentToolCall[] = [];

  await readServerSentEvents(response, (event) => {
    if (event.usageMetadata && typeof event.usageMetadata === "object") {
      usage = event.usageMetadata as Record<string, unknown>;
    }
    const candidates = Array.isArray(event.candidates) ? event.candidates : [];
    const first = candidates[0] as Record<string, unknown> | undefined;
    const content = first?.content as Record<string, unknown> | undefined;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    for (const part of parts) {
      assistantText += handleGeminiPart(part, { onTextDelta, toolCalls });
    }
  });

  return { assistantText, toolCalls, usage };
};

export const createGeminiVoiceAssistantModel = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: GeminiVoiceAssistantModelOptions,
): VoiceAgentModel<TContext, TSession, TResult> => {
  // hardenFetch: works around a Bun stale-keepalive hang — see hardenedFetch.ts
  // / UPSTREAM_ISSUES.md. Wraps the caller's fetch too if they supplied one.
  const fetchImpl = hardenFetch(options.fetch);
  const baseUrl =
    options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  const model = options.model ?? "gemini-2.5-flash";
  const maxRetries = Math.max(0, options.maxRetries ?? 2);

  return {
    generate: async (input) => {
      const endpoint = `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(options.apiKey)}`;
      let response: Response | undefined;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        response = await fetchImpl(endpoint, {
          body: JSON.stringify({
            contents: input.messages
              .map(messageToGeminiContent)
              .filter(Boolean),
            generationConfig: {
              maxOutputTokens: options.maxOutputTokens,
              temperature: options.temperature,
            },
            systemInstruction: {
              parts: [
                {
                  text: [input.system, VOICE_SYSTEM_INSTRUCTIONS]
                    .filter(Boolean)
                    .join("\n\n"),
                },
              ],
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
                          type: "object",
                        },
                      ),
                    })),
                  },
                ]
              : undefined,
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        });

        if (
          response.ok ||
          (response.status !== 429 && response.status < 500) ||
          attempt === maxRetries
        ) {
          break;
        }

        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 500 * 2 ** attempt,
        );
      }

      if (!response) {
        throw new Error("Gemini voice assistant model failed: no response");
      }
      if (!response.ok) {
        throw createHTTPError("Gemini", response);
      }

      const { assistantText, toolCalls, usage } = await consumeGeminiStream(
        response,
        input.onTextDelta,
      );
      if (usage) {
        await options.onUsage?.(usage);
      }

      return {
        ...(assistantText ? { assistantText } : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
        ...(usage
          ? { usage: normalizeVoiceUsage("google", options.model, usage) }
          : {}),
      };
    },
  };
};
