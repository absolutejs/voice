export type VoiceOpsActionMethod = "GET" | "POST";

export type VoiceOpsActionDescriptor = {
  description?: string;
  disabled?: boolean;
  id: string;
  label: string;
  method?: VoiceOpsActionMethod;
  path: string;
};

export type VoiceOpsActionCenterClientOptions = {
  actions?: VoiceOpsActionDescriptor[];
  auditPath?: false | string;
  fetch?: typeof fetch;
  intervalMs?: number;
  onActionResult?: (result: VoiceOpsActionRunResult) => Promise<void> | void;
};

export type VoiceOpsActionRunResult = {
  actionId: string;
  body: unknown;
  error?: string;
  ok: boolean;
  ranAt: number;
  status: number;
};

export const recordVoiceOpsActionResult = async (
  result: VoiceOpsActionRunResult,
  options: VoiceOpsActionCenterClientOptions = {},
) => {
  if (options.auditPath === false) {
    return;
  }
  const path = options.auditPath ?? "/api/voice/ops-actions/audit";
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(path, {
    body: JSON.stringify(result),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Voice ops action audit failed: HTTP ${response.status}`);
  }
};

export type VoiceOpsActionCenterSnapshot = {
  actions: VoiceOpsActionDescriptor[];
  error: string | null;
  isRunning: boolean;
  lastResult?: VoiceOpsActionRunResult;
  runningActionId?: string;
  updatedAt?: number;
};

export type VoiceOpsActionCenterPresetOptions = {
  deliveryRuntimePath?: string;
  includeDeliveryRuntime?: boolean;
  includeProductionReadiness?: boolean;
  includeProviderSimulation?: boolean;
  includeTurnLatencyProof?: boolean;
  productionReadinessPath?: string;
  providerSimulationPathPrefix?: string;
  providers?: readonly string[];
  turnLatencyProofPath?: string;
};

export const createVoiceOpsActionCenterActions = (
  options: VoiceOpsActionCenterPresetOptions = {},
): VoiceOpsActionDescriptor[] => {
  const deliveryRuntimePath =
    options.deliveryRuntimePath ?? "/api/voice-delivery-runtime";
  const actions: VoiceOpsActionDescriptor[] = [];

  if (options.includeProductionReadiness !== false) {
    actions.push({
      description: "Refresh the production readiness report.",
      id: "production-readiness",
      label: "Refresh readiness",
      method: "GET",
      path: options.productionReadinessPath ?? "/api/production-readiness",
    });
  }

  if (options.includeDeliveryRuntime !== false) {
    actions.push(
      {
        description: "Drain pending and failed audit/trace deliveries.",
        id: "delivery-runtime.tick",
        label: "Tick delivery workers",
        method: "POST",
        path: `${deliveryRuntimePath.replace(/\/$/, "")}/tick`,
      },
      {
        description: "Move reviewed dead letters back to live delivery queues.",
        id: "delivery-runtime.requeue-dead-letters",
        label: "Requeue dead letters",
        method: "POST",
        path: `${deliveryRuntimePath.replace(/\/$/, "")}/requeue-dead-letters`,
      },
    );
  }

  if (options.includeTurnLatencyProof !== false) {
    actions.push({
      description: "Run the synthetic turn latency proof.",
      id: "turn-latency.proof",
      label: "Run latency proof",
      method: "POST",
      path: options.turnLatencyProofPath ?? "/api/turn-latency/proof",
    });
  }

  if (options.includeProviderSimulation !== false) {
    const pathPrefix =
      options.providerSimulationPathPrefix ?? "/api/stt-simulate";
    for (const provider of options.providers ?? []) {
      actions.push(
        {
          description: `Simulate ${provider} provider failure.`,
          id: `provider.${provider}.failure`,
          label: `Simulate ${provider} failure`,
          method: "POST",
          path: `${pathPrefix}/failure?provider=${encodeURIComponent(provider)}`,
        },
        {
          description: `Mark ${provider} provider recovered.`,
          id: `provider.${provider}.recovery`,
          label: `Recover ${provider}`,
          method: "POST",
          path: `${pathPrefix}/recovery?provider=${encodeURIComponent(provider)}`,
        },
      );
    }
  }

  return actions;
};

export const runVoiceOpsAction = async (
  action: VoiceOpsActionDescriptor,
  options: Pick<VoiceOpsActionCenterClientOptions, "fetch"> = {},
): Promise<VoiceOpsActionRunResult> => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(action.path, {
    method: action.method ?? "POST",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Voice ops action "${action.id}" failed: HTTP ${response.status}`;
    throw new Error(message);
  }

  return {
    actionId: action.id,
    body,
    ok: response.ok,
    ranAt: Date.now(),
    status: response.status,
  };
};

export const createVoiceOpsActionCenterStore = (
  options: VoiceOpsActionCenterClientOptions = {},
) => {
  const listeners = new Set<() => void>();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let snapshot: VoiceOpsActionCenterSnapshot = {
    actions: options.actions ?? createVoiceOpsActionCenterActions(),
    error: null,
    isRunning: false,
  };
  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const setActions = (actions: VoiceOpsActionDescriptor[]) => {
    snapshot = { ...snapshot, actions, updatedAt: Date.now() };
    emit();
  };
  const run = async (actionId: string) => {
    if (closed) {
      return snapshot.lastResult;
    }
    const action = snapshot.actions.find((item) => item.id === actionId);
    if (!action) {
      throw new Error(`Voice ops action "${actionId}" is not configured.`);
    }
    if (action.disabled) {
      throw new Error(`Voice ops action "${actionId}" is disabled.`);
    }

    snapshot = {
      ...snapshot,
      error: null,
      isRunning: true,
      runningActionId: action.id,
    };
    emit();
    try {
      const result = await runVoiceOpsAction(action, options);
      await options.onActionResult?.(result);
      await recordVoiceOpsActionResult(result, options);
      snapshot = {
        ...snapshot,
        error: null,
        isRunning: false,
        lastResult: result,
        runningActionId: undefined,
        updatedAt: Date.now(),
      };
      emit();
      return result;
    } catch (error) {
      const result: VoiceOpsActionRunResult = {
        actionId: action.id,
        body: null,
        error: error instanceof Error ? error.message : String(error),
        ok: false,
        ranAt: Date.now(),
        status: 0,
      };
      await options.onActionResult?.(result);
      await recordVoiceOpsActionResult(result, options).catch(() => {});
      snapshot = {
        ...snapshot,
        error: error instanceof Error ? error.message : String(error),
        isRunning: false,
        runningActionId: undefined,
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
      emit();
    }, options.intervalMs);
  }

  return {
    close,
    getServerSnapshot: () => snapshot,
    getSnapshot: () => snapshot,
    run,
    setActions,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
