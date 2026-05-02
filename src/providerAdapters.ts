import type {
  STTAdapter,
  STTAdapterOpenOptions,
  TTSAdapter,
  TTSAdapterOpenOptions,
  TTSAdapterSession,
  TTSSessionEventMap,
  VoiceCloseEvent,
} from "./types";
import type {
  VoiceProviderRouterHealthOptions,
  VoiceProviderRouterProviderHealth,
  VoiceProviderRouterProviderProfile,
  VoiceProviderRouterPolicyPreset,
  VoiceProviderRouterPolicyWeights,
  VoiceProviderRouterStrategy,
} from "./modelAdapters";
import { resolveVoiceProviderRoutingPolicyPreset } from "./modelAdapters";

type MaybePromise<T> = T | Promise<T>;
type VoiceIOProviderKind = "stt" | "tts";
type VoiceIOProviderStatus = "error" | "fallback" | "success";

export type VoiceIOProviderRouterEvent<TProvider extends string = string> = {
  at: number;
  attempt: number;
  elapsedMs: number;
  error?: string;
  fallbackProvider?: TProvider;
  kind: VoiceIOProviderKind;
  latencyBudgetMs?: number;
  operation: "open" | "send";
  provider: TProvider;
  providerHealth?: VoiceProviderRouterProviderHealth<TProvider>;
  selectedProvider: TProvider;
  status: VoiceIOProviderStatus;
  suppressionRemainingMs?: number;
  suppressedUntil?: number;
  timedOut?: boolean;
};

export type VoiceIOProviderRouterPolicyConfig<
  TOpenOptions = unknown,
  TProvider extends string = string,
> = {
  allowProviders?:
    | readonly TProvider[]
    | ((input: TOpenOptions) => MaybePromise<readonly TProvider[]>);
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

export type VoiceIOProviderRouterPolicy<
  TOpenOptions = unknown,
  TProvider extends string = string,
> =
  | VoiceProviderRouterStrategy
  | VoiceProviderRouterPolicyPreset
  | VoiceIOProviderRouterPolicyConfig<TOpenOptions, TProvider>;

export type VoiceIOProviderRouterOptions<
  TProvider extends string,
  TAdapter,
  TOpenOptions,
> = {
  adapters: Partial<Record<TProvider, TAdapter>>;
  fallback?:
    | readonly TProvider[]
    | ((input: TOpenOptions) => MaybePromise<readonly TProvider[]>);
  isProviderError?: (error: unknown, provider: TProvider) => boolean;
  onProviderEvent?: (
    event: VoiceIOProviderRouterEvent<TProvider>,
    input: TOpenOptions,
  ) => Promise<void> | void;
  policy?: VoiceIOProviderRouterPolicy<TOpenOptions, TProvider>;
  providerHealth?: boolean | VoiceProviderRouterHealthOptions;
  providerProfiles?: Partial<
    Record<TProvider, VoiceProviderRouterProviderProfile>
  >;
  selectProvider?: (input: TOpenOptions) => MaybePromise<TProvider | undefined>;
  timeoutMs?: number;
};

export type VoiceSTTProviderRouterOptions<
  TProvider extends string = string,
  TOptions extends STTAdapterOpenOptions = STTAdapterOpenOptions,
> = VoiceIOProviderRouterOptions<TProvider, STTAdapter<TOptions>, TOptions>;

export type VoiceTTSProviderRouterOptions<
  TProvider extends string = string,
  TOptions extends TTSAdapterOpenOptions = TTSAdapterOpenOptions,
> = VoiceIOProviderRouterOptions<TProvider, TTSAdapter<TOptions>, TOptions>;

class VoiceIOProviderTimeoutError extends Error {
  provider: string;
  timeoutMs: number;

  constructor(kind: VoiceIOProviderKind, provider: string, timeoutMs: number) {
    super(
      `Voice ${kind} provider ${provider} exceeded ${timeoutMs}ms latency budget.`,
    );
    this.name = "VoiceIOProviderTimeoutError";
    this.provider = provider;
    this.timeoutMs = timeoutMs;
  }
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const createEmitter = <TEvents extends Record<string, unknown>>() => {
  const listeners = new Map<
    keyof TEvents,
    Set<(payload: never) => void | Promise<void>>
  >();

  return {
    emit: async <K extends keyof TEvents>(event: K, payload: TEvents[K]) => {
      await Promise.all(
        [...(listeners.get(event) ?? [])].map((handler) =>
          Promise.resolve(handler(payload as never)),
        ),
      );
    },
    on: <K extends keyof TEvents>(
      event: K,
      handler: (payload: TEvents[K]) => void | Promise<void>,
    ) => {
      const set = listeners.get(event) ?? new Set();
      set.add(handler as never);
      listeners.set(event, set);
      return () => {
        set.delete(handler as never);
      };
    },
  };
};

const getTimeoutMs = <TProvider extends string, TAdapter, TOpenOptions>(
  options: VoiceIOProviderRouterOptions<TProvider, TAdapter, TOpenOptions>,
  provider: TProvider,
) => {
  const timeoutMs =
    options.providerProfiles?.[provider]?.timeoutMs ?? options.timeoutMs;
  return typeof timeoutMs === "number" &&
    Number.isFinite(timeoutMs) &&
    timeoutMs > 0
    ? timeoutMs
    : undefined;
};

const withTimeout = async <T>(input: {
  kind: VoiceIOProviderKind;
  operation: "open" | "send";
  provider: string;
  run: () => MaybePromise<T>;
  timeoutMs?: number;
}) => {
  if (!input.timeoutMs) {
    return input.run();
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(input.run()),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new VoiceIOProviderTimeoutError(
                input.kind,
                input.provider,
                input.timeoutMs!,
              ),
            ),
          input.timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const isVoiceProviderRoutingPolicyPreset = (
  policy: string,
): policy is VoiceProviderRouterPolicyPreset =>
  policy === "balanced" ||
  policy === "cost-cap" ||
  policy === "cost-first" ||
  policy === "latency-first" ||
  policy === "quality-first";

const createResolver = <TProvider extends string, TAdapter, TOpenOptions>(
  options: VoiceIOProviderRouterOptions<TProvider, TAdapter, TOpenOptions>,
) => {
  const providerIds = Object.keys(options.adapters) as TProvider[];
  const firstProvider = providerIds[0];
  const policy:
    | VoiceIOProviderRouterPolicyConfig<TOpenOptions, TProvider>
    | undefined =
    typeof options.policy === "string"
      ? isVoiceProviderRoutingPolicyPreset(options.policy)
        ? (resolveVoiceProviderRoutingPolicyPreset<unknown, never, TProvider>(
            options.policy,
          ) as VoiceIOProviderRouterPolicyConfig<TOpenOptions, TProvider>)
        : {
            strategy: options.policy,
          }
      : options.policy;
  const strategy = policy?.strategy ?? "prefer-selected";
  const healthOptions =
    typeof options.providerHealth === "object"
      ? options.providerHealth
      : options.providerHealth
        ? {}
        : undefined;
  const healthState = new Map<
    TProvider,
    VoiceProviderRouterProviderHealth<TProvider>
  >();
  const now = () => healthOptions?.now?.() ?? Date.now();
  const failureThreshold = Math.max(1, healthOptions?.failureThreshold ?? 1);
  const cooldownMs = Math.max(0, healthOptions?.cooldownMs ?? 30_000);

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
    const suppressedUntil = getHealth(provider).suppressedUntil;
    return typeof suppressedUntil === "number"
      ? Math.max(0, suppressedUntil - now())
      : undefined;
  };

  const isSuppressed = (provider: TProvider) => {
    if (!healthOptions) {
      return false;
    }
    const suppressedUntil = getHealth(provider).suppressedUntil;
    return typeof suppressedUntil === "number" && suppressedUntil > now();
  };

  const recordSuccess = (provider: TProvider) => {
    if (!healthOptions) {
      return undefined;
    }
    const health = getHealth(provider);
    health.consecutiveFailures = 0;
    health.status = "healthy";
    health.suppressedUntil = undefined;
    return cloneHealth(provider);
  };

  const recordError = (provider: TProvider, isProviderError: boolean) => {
    if (!healthOptions || !isProviderError) {
      return cloneHealth(provider);
    }
    const health = getHealth(provider);
    health.consecutiveFailures += 1;
    health.lastFailureAt = now();
    if (health.consecutiveFailures >= failureThreshold) {
      health.status = "suppressed";
      health.suppressedUntil = now() + cooldownMs;
    }
    return cloneHealth(provider);
  };

  const resolveAllowedProviders = async (input: TOpenOptions) => {
    const allowed =
      typeof policy?.allowProviders === "function"
        ? await policy.allowProviders(input)
        : policy?.allowProviders;
    return new Set(allowed ?? providerIds);
  };

  const passesBudgetFilters = (provider: TProvider) => {
    const profile = options.providerProfiles?.[provider];
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
    const profile = options.providerProfiles?.[provider];
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
      const leftProfile = options.providerProfiles?.[left];
      const rightProfile = options.providerProfiles?.[right];
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

  const resolveOrder = async (input: TOpenOptions) => {
    const requestedProvider = await options.selectProvider?.(input);
    const selectedProvider = requestedProvider ?? firstProvider;
    const allowedProviders = await resolveAllowedProviders(input);
    const fallbackOrder =
      typeof options.fallback === "function"
        ? await options.fallback(input)
        : options.fallback;
    const candidates = [selectedProvider, ...(fallbackOrder ?? providerIds)];
    const seen = new Set<TProvider>();
    const orderedCandidates = candidates.filter(
      (provider): provider is TProvider => {
        if (!provider || seen.has(provider) || !options.adapters[provider]) {
          return false;
        }
        seen.add(provider);
        return true;
      },
    );
    const rankedOrder = sortProviders(orderedCandidates)
      .filter((provider) => allowedProviders.has(provider))
      .filter(passesBudgetFilters);
    const healthyOrder = healthOptions
      ? rankedOrder.filter((provider) => !isSuppressed(provider))
      : rankedOrder;
    const order = healthyOrder.length ? healthyOrder : rankedOrder;
    const preferred =
      strategy === "prefer-selected" &&
      selectedProvider &&
      allowedProviders.has(selectedProvider) &&
      passesBudgetFilters(selectedProvider) &&
      (!healthOptions || !isSuppressed(selectedProvider))
        ? selectedProvider
        : order[0];

    return {
      order,
      selectedProvider: preferred,
    };
  };

  const emit = async (
    event: VoiceIOProviderRouterEvent<TProvider>,
    input: TOpenOptions,
  ) => {
    await options.onProviderEvent?.(event, input);
  };

  return {
    emit,
    getSuppressionRemainingMs,
    providerIds,
    recordError,
    recordSuccess,
    resolveOrder,
  };
};

export const createVoiceSTTProviderRouter = <
  TProvider extends string = string,
  TOptions extends STTAdapterOpenOptions = STTAdapterOpenOptions,
>(
  options: VoiceSTTProviderRouterOptions<TProvider, TOptions>,
): STTAdapter<TOptions> => {
  const resolver = createResolver(options);

  return {
    kind: "stt",
    open: async (input) => {
      const { order, selectedProvider } = await resolver.resolveOrder(input);
      if (!selectedProvider || order.length === 0) {
        throw new Error(
          "Voice STT provider router has no available providers.",
        );
      }

      let lastError: unknown;
      for (const [index, provider] of order.entries()) {
        const adapter = options.adapters[provider];
        if (!adapter) {
          continue;
        }
        const startedAt = Date.now();
        try {
          const session = await withTimeout({
            kind: "stt",
            operation: "open",
            provider,
            run: () => adapter.open(input),
            timeoutMs: getTimeoutMs(options, provider),
          });
          const providerHealth = resolver.recordSuccess(provider);
          await resolver.emit(
            {
              at: Date.now(),
              attempt: index + 1,
              elapsedMs: Date.now() - startedAt,
              fallbackProvider:
                provider === selectedProvider ? undefined : provider,
              kind: "stt",
              latencyBudgetMs: getTimeoutMs(options, provider),
              operation: "open",
              provider,
              providerHealth,
              selectedProvider,
              status: provider === selectedProvider ? "success" : "fallback",
            },
            input,
          );
          return session;
        } catch (error) {
          lastError = error;
          const hasNextProvider = index < order.length - 1;
          const shouldFallback =
            options.isProviderError?.(error, provider) ?? true;
          const providerHealth = resolver.recordError(provider, shouldFallback);
          await resolver.emit(
            {
              at: Date.now(),
              attempt: index + 1,
              elapsedMs: Date.now() - startedAt,
              error: errorMessage(error),
              fallbackProvider: shouldFallback ? order[index + 1] : undefined,
              kind: "stt",
              latencyBudgetMs: getTimeoutMs(options, provider),
              operation: "open",
              provider,
              providerHealth,
              selectedProvider,
              status: "error",
              suppressionRemainingMs:
                resolver.getSuppressionRemainingMs(provider),
              suppressedUntil: providerHealth?.suppressedUntil,
              timedOut: error instanceof VoiceIOProviderTimeoutError,
            },
            input,
          );
          if (!hasNextProvider || !shouldFallback) {
            throw error;
          }
        }
      }

      throw (
        lastError ??
        new Error("Voice STT provider router did not open a provider.")
      );
    },
  };
};

export const createVoiceTTSProviderRouter = <
  TProvider extends string = string,
  TOptions extends TTSAdapterOpenOptions = TTSAdapterOpenOptions,
>(
  options: VoiceTTSProviderRouterOptions<TProvider, TOptions>,
): TTSAdapter<TOptions> => {
  const resolver = createResolver(options);

  return {
    kind: "tts",
    open: async (input) => {
      const { order, selectedProvider } = await resolver.resolveOrder(input);
      if (!selectedProvider || order.length === 0) {
        throw new Error(
          "Voice TTS provider router has no available providers.",
        );
      }
      const emitter = createEmitter<TTSSessionEventMap>();
      let activeSession: TTSAdapterSession | undefined;
      let activeProvider: TProvider | undefined;
      let nextProviderIndex = 0;

      const attach = (session: TTSAdapterSession) => {
        session.on("audio", (event) => {
          void emitter.emit("audio", event);
        });
        session.on("error", (event) => {
          void emitter.emit("error", event);
        });
      };

      const openProvider = async (provider: TProvider, attempt: number) => {
        const adapter = options.adapters[provider];
        if (!adapter) {
          throw new Error(`Voice TTS provider ${provider} is not configured.`);
        }
        const startedAt = Date.now();
        const session = await withTimeout({
          kind: "tts",
          operation: "open",
          provider,
          run: () => adapter.open(input),
          timeoutMs: getTimeoutMs(options, provider),
        });
        attach(session);
        activeSession = session;
        activeProvider = provider;
        const providerHealth = resolver.recordSuccess(provider);
        await resolver.emit(
          {
            at: Date.now(),
            attempt,
            elapsedMs: Date.now() - startedAt,
            fallbackProvider:
              provider === selectedProvider ? undefined : provider,
            kind: "tts",
            latencyBudgetMs: getTimeoutMs(options, provider),
            operation: "open",
            provider,
            providerHealth,
            selectedProvider,
            status: provider === selectedProvider ? "success" : "fallback",
          },
          input,
        );
        return session;
      };

      const failProvider = async (inputEvent: {
        attempt: number;
        error: unknown;
        operation: "open" | "send";
        provider: TProvider;
        startedAt: number;
      }) => {
        const shouldFallback =
          options.isProviderError?.(inputEvent.error, inputEvent.provider) ??
          true;
        const providerHealth = resolver.recordError(
          inputEvent.provider,
          shouldFallback,
        );
        await resolver.emit(
          {
            at: Date.now(),
            attempt: inputEvent.attempt,
            elapsedMs: Date.now() - inputEvent.startedAt,
            error: errorMessage(inputEvent.error),
            fallbackProvider: shouldFallback
              ? order[nextProviderIndex]
              : undefined,
            kind: "tts",
            latencyBudgetMs: getTimeoutMs(options, inputEvent.provider),
            operation: inputEvent.operation,
            provider: inputEvent.provider,
            providerHealth,
            selectedProvider,
            status: "error",
            suppressionRemainingMs: resolver.getSuppressionRemainingMs(
              inputEvent.provider,
            ),
            suppressedUntil: providerHealth?.suppressedUntil,
            timedOut: inputEvent.error instanceof VoiceIOProviderTimeoutError,
          },
          input,
        );
        return shouldFallback;
      };

      for (const [index, provider] of order.entries()) {
        nextProviderIndex = index + 1;
        const startedAt = Date.now();
        try {
          await openProvider(provider, index + 1);
          break;
        } catch (error) {
          const shouldFallback = await failProvider({
            attempt: index + 1,
            error,
            operation: "open",
            provider,
            startedAt,
          });
          if (!shouldFallback || index >= order.length - 1) {
            throw error;
          }
        }
      }

      if (!activeSession || !activeProvider) {
        throw new Error("Voice TTS provider router did not open a provider.");
      }

      const sendWithFallback = async (text: string) => {
        for (;;) {
          const session = activeSession;
          const provider = activeProvider;
          if (!session || !provider) {
            throw new Error(
              "Voice TTS provider router has no active provider.",
            );
          }

          const startedAt = Date.now();
          try {
            await withTimeout({
              kind: "tts",
              operation: "send",
              provider,
              run: () => session.send(text),
              timeoutMs: getTimeoutMs(options, provider),
            });
            return;
          } catch (error) {
            const shouldFallback = await failProvider({
              attempt: nextProviderIndex,
              error,
              operation: "send",
              provider,
              startedAt,
            });
            const nextProvider = order[nextProviderIndex];
            if (!shouldFallback || !nextProvider) {
              throw error;
            }
            nextProviderIndex += 1;
            await session.close("tts-provider-fallback").catch(() => {});
            await openProvider(nextProvider, nextProviderIndex);
          }
        }
      };

      return {
        close: async (reason?: string) => {
          await activeSession?.close(reason);
          activeSession = undefined;
          activeProvider = undefined;
          await emitter.emit("close", {
            reason,
            type: "close",
          } satisfies VoiceCloseEvent);
        },
        on: emitter.on,
        send: sendWithFallback,
      };
    },
  };
};
