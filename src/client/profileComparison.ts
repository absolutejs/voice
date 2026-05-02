import type { VoiceRealCallProfileHistoryReport } from "../proofTrends";

export type VoiceProfileComparisonClientOptions = {
  fetch?: typeof fetch;
  intervalMs?: number;
};

export type VoiceProfileComparisonSnapshot = {
  error: string | null;
  isLoading: boolean;
  report?: VoiceRealCallProfileHistoryReport;
  updatedAt?: number;
};

export const fetchVoiceProfileComparison = async (
  path = "/api/voice/real-call-profile-history",
  options: Pick<VoiceProfileComparisonClientOptions, "fetch"> = {},
) => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(path);
  if (!response.ok) {
    throw new Error(`Voice profile comparison failed: HTTP ${response.status}`);
  }
  return (await response.json()) as VoiceRealCallProfileHistoryReport;
};

export const createVoiceProfileComparisonStore = (
  path = "/api/voice/real-call-profile-history",
  options: VoiceProfileComparisonClientOptions = {},
) => {
  const listeners = new Set<() => void>();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let snapshot: VoiceProfileComparisonSnapshot = {
    error: null,
    isLoading: false,
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
    snapshot = { ...snapshot, error: null, isLoading: true };
    emit();
    try {
      const report = await fetchVoiceProfileComparison(path, options);
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

  if (
    typeof window !== "undefined" &&
    options.intervalMs &&
    options.intervalMs > 0
  ) {
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
