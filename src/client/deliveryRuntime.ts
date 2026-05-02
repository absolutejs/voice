import type { VoiceDeliveryRuntimeReport } from "../deliveryRuntime";

export type VoiceDeliveryRuntimeClientOptions = {
  fetch?: typeof fetch;
  intervalMs?: number;
  requeueDeadLettersPath?: string;
  tickPath?: string;
};

export type VoiceDeliveryRuntimeSnapshot = {
  actionError: string | null;
  actionStatus: "idle" | "running" | "completed" | "failed";
  error: string | null;
  isLoading: boolean;
  lastAction?: VoiceDeliveryRuntimeActionResult;
  report?: VoiceDeliveryRuntimeReport;
  updatedAt?: number;
};

export type VoiceDeliveryRuntimeAction = "tick" | "requeue-dead-letters";

export type VoiceDeliveryRuntimeActionResult = {
  action: VoiceDeliveryRuntimeAction;
  result?: unknown;
  summary?: VoiceDeliveryRuntimeReport["summary"];
  updatedAt: number;
};

const getDefaultActionPath = (
  path: string,
  action: VoiceDeliveryRuntimeAction,
  options: VoiceDeliveryRuntimeClientOptions,
) => {
  if (action === "tick") {
    return options.tickPath ?? `${path.replace(/\/$/, "")}/tick`;
  }

  return (
    options.requeueDeadLettersPath ??
    `${path.replace(/\/$/, "")}/requeue-dead-letters`
  );
};

export const fetchVoiceDeliveryRuntime = async (
  path = "/api/voice-delivery-runtime",
  options: Pick<VoiceDeliveryRuntimeClientOptions, "fetch"> = {},
) => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(path);
  if (!response.ok) {
    throw new Error(`Voice delivery runtime failed: HTTP ${response.status}`);
  }
  return (await response.json()) as VoiceDeliveryRuntimeReport;
};

export const runVoiceDeliveryRuntimeAction = async (
  action: VoiceDeliveryRuntimeAction,
  path = "/api/voice-delivery-runtime",
  options: VoiceDeliveryRuntimeClientOptions = {},
): Promise<VoiceDeliveryRuntimeActionResult> => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(
    getDefaultActionPath(path, action, options),
    {
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(
      `Voice delivery runtime ${action} failed: HTTP ${response.status}`,
    );
  }
  const body = (await response.json()) as {
    result?: unknown;
    summary?: VoiceDeliveryRuntimeReport["summary"];
  };
  return {
    action,
    result: body.result,
    summary: body.summary,
    updatedAt: Date.now(),
  };
};

export const createVoiceDeliveryRuntimeStore = (
  path = "/api/voice-delivery-runtime",
  options: VoiceDeliveryRuntimeClientOptions = {},
) => {
  const listeners = new Set<() => void>();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let snapshot: VoiceDeliveryRuntimeSnapshot = {
    actionError: null,
    actionStatus: "idle",
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
    snapshot = {
      ...snapshot,
      error: null,
      isLoading: true,
    };
    emit();
    try {
      const report = await fetchVoiceDeliveryRuntime(path, options);
      snapshot = {
        ...snapshot,
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
  const runAction = async (action: VoiceDeliveryRuntimeAction) => {
    if (closed) {
      return snapshot.lastAction;
    }
    snapshot = {
      ...snapshot,
      actionError: null,
      actionStatus: "running",
    };
    emit();
    try {
      const result = await runVoiceDeliveryRuntimeAction(action, path, options);
      snapshot = {
        ...snapshot,
        actionError: null,
        actionStatus: "completed",
        lastAction: result,
      };
      emit();
      await refresh();
      return result;
    } catch (error) {
      snapshot = {
        ...snapshot,
        actionError: error instanceof Error ? error.message : String(error),
        actionStatus: "failed",
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
    requeueDeadLetters: () => runAction("requeue-dead-letters"),
    refresh,
    tick: () => runAction("tick"),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
