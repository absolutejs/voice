import type { VoiceProviderHealthSummary } from "../providerHealth";

export type VoiceProviderStatusClientOptions = {
  fetch?: typeof fetch;
  intervalMs?: number;
};

export type VoiceProviderStatusSnapshot<TProvider extends string = string> = {
  error: string | null;
  isLoading: boolean;
  providers: VoiceProviderHealthSummary<TProvider>[];
  updatedAt?: number;
};

export const fetchVoiceProviderStatus = async <
  TProvider extends string = string,
>(
  path = "/api/provider-status",
  options: Pick<VoiceProviderStatusClientOptions, "fetch"> = {},
) => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(path);
  if (!response.ok) {
    throw new Error(`Voice provider status failed: HTTP ${response.status}`);
  }
  return (await response.json()) as VoiceProviderHealthSummary<TProvider>[];
};

export const createVoiceProviderStatusStore = <
  TProvider extends string = string,
>(
  path = "/api/provider-status",
  options: VoiceProviderStatusClientOptions = {},
) => {
  const listeners = new Set<() => void>();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let snapshot: VoiceProviderStatusSnapshot<TProvider> = {
    error: null,
    isLoading: false,
    providers: [],
  };
  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const refresh = async () => {
    if (closed) {
      return snapshot.providers;
    }
    snapshot = {
      ...snapshot,
      error: null,
      isLoading: true,
    };
    emit();
    try {
      const providers = await fetchVoiceProviderStatus<TProvider>(
        path,
        options,
      );
      snapshot = {
        error: null,
        isLoading: false,
        providers,
        updatedAt: Date.now(),
      };
      emit();
      return providers;
    } catch (error) {
      snapshot = {
        ...snapshot,
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      };
      emit();
      throw error;
    }
  };
  const close = () => {
    closed = true;
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    listeners.clear();
  };

  if (options.intervalMs && options.intervalMs > 0) {
    timer = setInterval(() => {
      void refresh().catch(() => {});
    }, options.intervalMs);
  }

  return {
    close,
    getServerSnapshot: () => snapshot,
    getSnapshot: () => snapshot,
    refresh,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
