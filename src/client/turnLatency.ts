import type { VoiceTurnLatencyReport } from "../turnLatency";

export type VoiceTurnLatencyClientOptions = {
  fetch?: typeof fetch;
  intervalMs?: number;
  proofPath?: string;
};

export type VoiceTurnLatencySnapshot = {
  error: string | null;
  isLoading: boolean;
  report?: VoiceTurnLatencyReport;
  updatedAt?: number;
};

export const fetchVoiceTurnLatency = async (
  path = "/api/turn-latency",
  options: Pick<VoiceTurnLatencyClientOptions, "fetch"> = {},
) => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(path);
  if (!response.ok) {
    throw new Error(`Voice turn latency failed: HTTP ${response.status}`);
  }
  return (await response.json()) as VoiceTurnLatencyReport;
};

export const runVoiceTurnLatencyProof = async (
  path: string,
  options: Pick<VoiceTurnLatencyClientOptions, "fetch"> = {},
) => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(path, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Voice turn latency proof failed: HTTP ${response.status}`);
  }
  return response.json() as Promise<unknown>;
};

export const createVoiceTurnLatencyStore = (
  path = "/api/turn-latency",
  options: VoiceTurnLatencyClientOptions = {},
) => {
  const listeners = new Set<() => void>();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let snapshot: VoiceTurnLatencySnapshot = {
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
      const report = await fetchVoiceTurnLatency(path, options);
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
  const runProof = async () => {
    if (!options.proofPath) {
      throw new Error("Voice turn latency proof path is not configured.");
    }
    snapshot = { ...snapshot, error: null, isLoading: true };
    emit();
    try {
      await runVoiceTurnLatencyProof(options.proofPath, options);
      return await refresh();
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
    runProof,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
