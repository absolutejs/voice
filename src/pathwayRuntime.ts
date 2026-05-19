import {
  findVoicePathwaySlot,
  findVoicePathwayState,
  validateVoicePathway,
  type VoicePathway,
  type VoicePathwayAction,
  type VoicePathwayCondition,
  type VoicePathwayState,
  type VoicePathwayTransition,
} from "./pathway";

export type VoicePathwaySlotValue = string | number | boolean | null;

export type VoicePathwayRuntimeStatus =
  | "ready"
  | "awaiting-slot"
  | "branching"
  | "ended"
  | "errored";

export type VoicePathwayRuntimeState = {
  currentStateId: string;
  status: VoicePathwayRuntimeStatus;
  slots: Record<string, VoicePathwaySlotValue>;
  awaitingSlotId: string | null;
  history: { stateId: string; at: number }[];
  pendingActions: VoicePathwayAction[];
  lastError?: string;
  endedReason?: string;
};

export type VoicePathwayToolCall = {
  toolId: string;
  args: Record<string, VoicePathwaySlotValue>;
};

export type VoicePathwayRuntimeEvent =
  | { type: "say"; text: string }
  | { type: "ask-slot"; slotId: string; prompt: string }
  | { type: "tool-call"; call: VoicePathwayToolCall }
  | { type: "transfer"; destination: string }
  | { type: "end-call"; reason?: string }
  | { type: "state-entered"; stateId: string }
  | { type: "errored"; message: string };

export type CreateVoicePathwayRuntimeOptions = {
  pathway: VoicePathway;
  initialSlots?: Record<string, VoicePathwaySlotValue>;
  now?: () => number;
  skipValidation?: boolean;
};

const evaluateCondition = (
  condition: VoicePathwayCondition,
  slots: Record<string, VoicePathwaySlotValue>,
): boolean => {
  switch (condition.kind) {
    case "always":
      return true;
    case "fallback":
      return true;
    case "slot-filled":
      return (
        slots[condition.slotId] !== undefined &&
        slots[condition.slotId] !== null &&
        slots[condition.slotId] !== ""
      );
    case "slot-equals":
      return slots[condition.slotId] === condition.value;
    case "slot-matches": {
      const raw = slots[condition.slotId];
      if (typeof raw !== "string") return false;
      try {
        return new RegExp(condition.pattern, "u").test(raw);
      } catch {
        return false;
      }
    }
  }
};

const pickTransition = (
  state: VoicePathwayState,
  slots: Record<string, VoicePathwaySlotValue>,
): VoicePathwayTransition | null => {
  for (const transition of state.transitions) {
    if (transition.condition.kind === "fallback") continue;
    if (evaluateCondition(transition.condition, slots)) return transition;
  }
  const fallback = state.transitions.find(
    (t) => t.condition.kind === "fallback",
  );
  return fallback ?? null;
};

const buildPendingActions = (
  state: VoicePathwayState,
  slots: Record<string, VoicePathwaySlotValue>,
  pathway: VoicePathway,
  emit: (event: VoicePathwayRuntimeEvent) => void,
): { actions: VoicePathwayAction[]; awaitingSlotId: string | null; ended: boolean; reason?: string } => {
  const pending: VoicePathwayAction[] = [];
  let awaitingSlotId: string | null = null;
  for (const action of state.actions ?? []) {
    if (action.kind === "say") {
      emit({ text: action.text, type: "say" });
      continue;
    }
    if (action.kind === "collect-slot") {
      if (
        slots[action.slotId] === undefined ||
        slots[action.slotId] === null
      ) {
        const slot = findVoicePathwaySlot(pathway, action.slotId);
        emit({
          prompt: slot?.prompt ?? `Please provide ${action.slotId}.`,
          slotId: action.slotId,
          type: "ask-slot",
        });
        awaitingSlotId = action.slotId;
        break;
      }
      continue;
    }
    if (action.kind === "call-tool") {
      const args: Record<string, VoicePathwaySlotValue> = {};
      for (const id of action.argsFromSlots ?? []) {
        args[id] = slots[id] ?? null;
      }
      emit({ call: { args, toolId: action.toolId }, type: "tool-call" });
      continue;
    }
    if (action.kind === "set-slot") {
      pending.push(action);
      continue;
    }
    if (action.kind === "transfer") {
      emit({ destination: action.destination, type: "transfer" });
      return { actions: pending, awaitingSlotId: null, ended: true, reason: `transfer:${action.destination}` };
    }
    if (action.kind === "end-call") {
      emit({ ...(action.reason !== undefined ? { reason: action.reason } : {}), type: "end-call" });
      return { actions: pending, awaitingSlotId: null, ended: true, ...(action.reason !== undefined ? { reason: action.reason } : {}) };
    }
  }
  return { actions: pending, awaitingSlotId, ended: false };
};

export const createVoicePathwayRuntime = (
  options: CreateVoicePathwayRuntimeOptions,
) => {
  if (!options.skipValidation) {
    const report = validateVoicePathway(options.pathway);
    if (!report.valid) {
      throw new Error(
        `Invalid pathway: ${report.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`,
      );
    }
  }
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<(event: VoicePathwayRuntimeEvent) => void>();
  const emit = (event: VoicePathwayRuntimeEvent) => {
    for (const l of listeners) l(event);
  };
  let state: VoicePathwayRuntimeState = {
    awaitingSlotId: null,
    currentStateId: options.pathway.entryStateId,
    history: [],
    pendingActions: [],
    slots: { ...(options.initialSlots ?? {}) },
    status: "ready",
  };

  const enter = (stateId: string) => {
    const target = findVoicePathwayState(options.pathway, stateId);
    if (!target) {
      state = { ...state, lastError: `Unknown state ${stateId}`, status: "errored" };
      emit({ message: state.lastError as string, type: "errored" });
      return;
    }
    state = {
      ...state,
      currentStateId: stateId,
      history: [...state.history, { at: now(), stateId }],
      pendingActions: [],
    };
    emit({ stateId, type: "state-entered" });
    const result = buildPendingActions(target, state.slots, options.pathway, emit);
    state = {
      ...state,
      awaitingSlotId: result.awaitingSlotId,
      pendingActions: result.actions,
      status: result.ended
        ? "ended"
        : result.awaitingSlotId
          ? "awaiting-slot"
          : "branching",
      ...(result.reason !== undefined ? { endedReason: result.reason } : {}),
    };
    if (state.status === "branching") tryTransition();
  };

  const tryTransition = () => {
    const current = findVoicePathwayState(
      options.pathway,
      state.currentStateId,
    );
    if (!current) return;
    if (current.transitions.length === 0) {
      state = { ...state, status: "ended" };
      return;
    }
    const transition = pickTransition(current, state.slots);
    if (!transition) {
      state = { ...state, status: "awaiting-slot" };
      return;
    }
    enter(transition.to);
  };

  const start = () => {
    state.history = [];
    enter(options.pathway.entryStateId);
  };

  const fillSlot = (slotId: string, value: VoicePathwaySlotValue) => {
    state = { ...state, slots: { ...state.slots, [slotId]: value } };
    if (state.awaitingSlotId === slotId) {
      state = { ...state, awaitingSlotId: null, status: "branching" };
      const current = findVoicePathwayState(
        options.pathway,
        state.currentStateId,
      );
      if (current) {
        const result = buildPendingActions(current, state.slots, options.pathway, emit);
        state = {
          ...state,
          awaitingSlotId: result.awaitingSlotId,
          pendingActions: result.actions,
          status: result.ended
            ? "ended"
            : result.awaitingSlotId
              ? "awaiting-slot"
              : "branching",
          ...(result.reason !== undefined ? { endedReason: result.reason } : {}),
        };
        if (state.status === "branching") tryTransition();
      }
    }
  };

  return {
    fillSlot,
    getState: () => state,
    start,
    subscribe(listener: (event: VoicePathwayRuntimeEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    tryTransition,
  };
};

export type VoicePathwayRuntime = ReturnType<typeof createVoicePathwayRuntime>;
