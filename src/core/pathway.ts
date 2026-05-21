export type VoicePathwaySlotType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "time"
  | "phone"
  | "email"
  | "currency"
  | "choice";

export type VoicePathwaySlot = {
  id: string;
  type: VoicePathwaySlotType;
  prompt: string;
  required?: boolean;
  choices?: string[];
  description?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
};

export type VoicePathwayCondition =
  | { kind: "slot-equals"; slotId: string; value: string | number | boolean }
  | { kind: "slot-filled"; slotId: string }
  | { kind: "slot-matches"; slotId: string; pattern: string }
  | { kind: "always" }
  | { kind: "fallback" };

export type VoicePathwayAction =
  | { kind: "say"; text: string }
  | { kind: "collect-slot"; slotId: string }
  | { kind: "call-tool"; toolId: string; argsFromSlots?: string[] }
  | { kind: "set-slot"; slotId: string; valueExpression: string }
  | { kind: "transfer"; destination: string }
  | { kind: "end-call"; reason?: string };

export type VoicePathwayTransition = {
  to: string;
  condition: VoicePathwayCondition;
  description?: string;
};

export type VoicePathwayState = {
  id: string;
  label: string;
  kind?: "entry" | "collect" | "branch" | "action" | "terminal";
  description?: string;
  systemNote?: string;
  actions?: VoicePathwayAction[];
  transitions: VoicePathwayTransition[];
};

export type VoicePathway = {
  id: string;
  label: string;
  entryStateId: string;
  states: VoicePathwayState[];
  slots: VoicePathwaySlot[];
  tools?: { id: string; description: string }[];
  metadata?: Record<string, string>;
};

export type VoicePathwayValidationIssue = {
  severity: "error" | "warning";
  code:
    | "duplicate-state"
    | "duplicate-slot"
    | "unknown-entry"
    | "unreachable-state"
    | "missing-transition-target"
    | "missing-slot-ref"
    | "no-terminal-reachable"
    | "fallback-not-last"
    | "duplicate-transition";
  message: string;
  stateId?: string;
  slotId?: string;
};

export type VoicePathwayValidationReport = {
  valid: boolean;
  issues: VoicePathwayValidationIssue[];
  reachableStates: string[];
};

const slotRefsInActions = (actions?: VoicePathwayAction[]): string[] => {
  if (!actions) return [];
  const refs: string[] = [];
  for (const action of actions) {
    if (action.kind === "collect-slot") refs.push(action.slotId);
    if (action.kind === "set-slot") refs.push(action.slotId);
    if (action.kind === "call-tool" && action.argsFromSlots) {
      refs.push(...action.argsFromSlots);
    }
  }

  return refs;
};

const slotRefsInCondition = (condition: VoicePathwayCondition): string[] => {
  if (condition.kind === "always" || condition.kind === "fallback") return [];

  return [condition.slotId];
};

export const findVoicePathwaySlot = (
  pathway: VoicePathway,
  id: string,
): VoicePathwaySlot | null => pathway.slots.find((s) => s.id === id) ?? null;
export const findVoicePathwayState = (
  pathway: VoicePathway,
  id: string,
): VoicePathwayState | null => pathway.states.find((s) => s.id === id) ?? null;
export const validateVoicePathway = (
  pathway: VoicePathway,
): VoicePathwayValidationReport => {
  const issues: VoicePathwayValidationIssue[] = [];
  const stateIds = new Set<string>();
  for (const state of pathway.states) {
    if (stateIds.has(state.id)) {
      issues.push({
        code: "duplicate-state",
        message: `Duplicate state id: ${state.id}`,
        severity: "error",
        stateId: state.id,
      });
    }
    stateIds.add(state.id);
  }
  const slotIds = new Set<string>();
  for (const slot of pathway.slots) {
    if (slotIds.has(slot.id)) {
      issues.push({
        code: "duplicate-slot",
        message: `Duplicate slot id: ${slot.id}`,
        severity: "error",
        slotId: slot.id,
      });
    }
    slotIds.add(slot.id);
  }
  if (!stateIds.has(pathway.entryStateId)) {
    issues.push({
      code: "unknown-entry",
      message: `Entry state ${pathway.entryStateId} is not defined`,
      severity: "error",
    });
  }
  for (const state of pathway.states) {
    const seenTransitionKeys = new Set<string>();
    state.transitions.forEach((transition, index) => {
      if (!stateIds.has(transition.to)) {
        issues.push({
          code: "missing-transition-target",
          message: `State ${state.id} transitions to unknown state ${transition.to}`,
          severity: "error",
          stateId: state.id,
        });
      }
      const key = `${transition.to}::${transition.condition.kind}::${
        "slotId" in transition.condition ? transition.condition.slotId : ""
      }`;
      if (seenTransitionKeys.has(key)) {
        issues.push({
          code: "duplicate-transition",
          message: `State ${state.id} has duplicate transition to ${transition.to}`,
          severity: "warning",
          stateId: state.id,
        });
      }
      seenTransitionKeys.add(key);
      if (
        transition.condition.kind === "fallback" &&
        index !== state.transitions.length - 1
      ) {
        issues.push({
          code: "fallback-not-last",
          message: `Fallback transition in ${state.id} must be the last transition`,
          severity: "error",
          stateId: state.id,
        });
      }
      for (const ref of slotRefsInCondition(transition.condition)) {
        if (!slotIds.has(ref)) {
          issues.push({
            code: "missing-slot-ref",
            message: `Transition condition references unknown slot ${ref}`,
            severity: "error",
            slotId: ref,
            stateId: state.id,
          });
        }
      }
    });
    for (const ref of slotRefsInActions(state.actions)) {
      if (!slotIds.has(ref)) {
        issues.push({
          code: "missing-slot-ref",
          message: `Action in ${state.id} references unknown slot ${ref}`,
          severity: "error",
          slotId: ref,
          stateId: state.id,
        });
      }
    }
  }
  const reachable = new Set<string>();
  const queue: string[] = stateIds.has(pathway.entryStateId)
    ? [pathway.entryStateId]
    : [];
  const stateById = new Map(pathway.states.map((s) => [s.id, s]));
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const state = stateById.get(id);
    if (!state) continue;
    for (const transition of state.transitions) {
      if (stateIds.has(transition.to) && !reachable.has(transition.to)) {
        queue.push(transition.to);
      }
    }
  }
  for (const state of pathway.states) {
    if (!reachable.has(state.id)) {
      issues.push({
        code: "unreachable-state",
        message: `State ${state.id} is not reachable from entry ${pathway.entryStateId}`,
        severity: "warning",
        stateId: state.id,
      });
    }
  }
  const hasReachableTerminal = pathway.states.some(
    (state) =>
      reachable.has(state.id) &&
      (state.kind === "terminal" || state.transitions.length === 0),
  );
  if (!hasReachableTerminal) {
    issues.push({
      code: "no-terminal-reachable",
      message: "No terminal state is reachable; pathway has no exit condition",
      severity: "error",
    });
  }
  const fatal = issues.some((i) => i.severity === "error");

  return {
    issues,
    reachableStates: Array.from(reachable),
    valid: !fatal,
  };
};
