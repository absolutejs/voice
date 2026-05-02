import type { VoiceSessionObservabilityReport } from "../sessionObservability";

export type VoiceSessionObservabilityClientOptions = {
  fetch?: typeof fetch;
  intervalMs?: number;
};

export type VoiceSessionObservabilitySnapshot = {
  error: string | null;
  isLoading: boolean;
  report: VoiceSessionObservabilityReport | null;
  updatedAt?: number;
};

export const fetchVoiceSessionObservability = async (
  path: string,
  options: Pick<VoiceSessionObservabilityClientOptions, "fetch"> = {},
) => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(path);
  if (!response.ok) {
    throw new Error(
      `Voice session observability failed: HTTP ${response.status}`,
    );
  }
  return (await response.json()) as VoiceSessionObservabilityReport;
};

export const createVoiceSessionObservabilityStore = (
  path: string,
  options: VoiceSessionObservabilityClientOptions = {},
) => {
  const listeners = new Set<() => void>();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let snapshot: VoiceSessionObservabilitySnapshot = {
    error: null,
    isLoading: false,
    report: null,
  };
  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const refresh = async () => {
    if (closed) {
      return snapshot.report;
    }
    snapshot = {
      ...snapshot,
      error: null,
      isLoading: true,
    };
    emit();
    try {
      const report = await fetchVoiceSessionObservability(path, options);
      snapshot = {
        error: null,
        isLoading: false,
        report,
        updatedAt: Date.now(),
      };
      emit();
      return report;
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
