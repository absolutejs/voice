import type {
  VoiceCampaignDialerProofReport,
  VoiceCampaignDialerProofStatus,
} from "../campaignDialers";

export type VoiceCampaignDialerProofClientOptions = {
  fetch?: typeof fetch;
  intervalMs?: number;
  runPath?: string;
};

export type VoiceCampaignDialerProofSnapshot = {
  error: string | null;
  isLoading: boolean;
  report?: VoiceCampaignDialerProofReport;
  status?: VoiceCampaignDialerProofStatus;
  updatedAt?: number;
};

export const fetchVoiceCampaignDialerProofStatus = async (
  path = "/api/voice/campaigns/dialer-proof",
  options: Pick<VoiceCampaignDialerProofClientOptions, "fetch"> = {},
) => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(path);
  if (!response.ok) {
    throw new Error(
      `Voice campaign dialer proof status failed: HTTP ${response.status}`,
    );
  }
  return (await response.json()) as VoiceCampaignDialerProofStatus;
};

export const runVoiceCampaignDialerProofAction = async (
  path = "/api/voice/campaigns/dialer-proof",
  options: Pick<VoiceCampaignDialerProofClientOptions, "fetch"> = {},
) => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(path, { method: "POST" });
  if (!response.ok) {
    throw new Error(
      `Voice campaign dialer proof failed: HTTP ${response.status}`,
    );
  }
  return (await response.json()) as VoiceCampaignDialerProofReport;
};

export const createVoiceCampaignDialerProofStore = (
  path = "/api/voice/campaigns/dialer-proof",
  options: VoiceCampaignDialerProofClientOptions = {},
) => {
  const listeners = new Set<() => void>();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let snapshot: VoiceCampaignDialerProofSnapshot = {
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
      return snapshot.status;
    }
    snapshot = { ...snapshot, error: null, isLoading: true };
    emit();
    try {
      const status = await fetchVoiceCampaignDialerProofStatus(path, options);
      snapshot = {
        ...snapshot,
        error: null,
        isLoading: false,
        status,
        updatedAt: Date.now(),
      };
      emit();
      return status;
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
    const runPath = options.runPath ?? snapshot.status?.runPath ?? path;
    snapshot = { ...snapshot, error: null, isLoading: true };
    emit();
    try {
      const report = await runVoiceCampaignDialerProofAction(runPath, options);
      snapshot = {
        ...snapshot,
        error: null,
        isLoading: false,
        report,
        status: {
          generatedAt: Date.now(),
          mode: report.mode,
          ok: report.ok,
          providers: report.providers.map((provider) => provider.provider),
          runPath,
          safe: true,
        },
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
    runProof,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
