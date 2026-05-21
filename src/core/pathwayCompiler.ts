import {
  validateVoicePathway,
  type VoicePathway,
  type VoicePathwayAction,
  type VoicePathwayCondition,
  type VoicePathwayState,
  type VoicePathwayTransition,
} from "./pathway";

export type VoicePathwayCompilerToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      { type: string; description?: string; enum?: string[] }
    >;
    required: string[];
  };
};

export type VoicePathwayCompiledAssistant = {
  systemPrompt: string;
  tools: VoicePathwayCompilerToolDefinition[];
  initialPrompt?: string;
  metadata: {
    pathwayId: string;
    pathwayLabel: string;
    entryStateId: string;
  };
};

export type CompileVoicePathwayOptions = {
  pathway: VoicePathway;
  introduction?: string;
  fallbackBehavior?: "stay" | "end-call" | "transfer";
  toolNamePrefix?: string;
};

const describeAction = (action: VoicePathwayAction): string => {
  switch (action.kind) {
    case "say":
      return `Say to the caller: "${action.text}"`;
    case "collect-slot":
      return `Collect slot \`${action.slotId}\` from the caller.`;
    case "call-tool":
      return `Call tool \`${action.toolId}\`${action.argsFromSlots ? ` with slots: ${action.argsFromSlots.join(", ")}` : ""}.`;
    case "set-slot":
      return `Set slot \`${action.slotId}\` to expression \`${action.valueExpression}\`.`;
    case "transfer":
      return `Transfer the call to \`${action.destination}\`.`;
    case "end-call":
      return `End the call${action.reason ? ` (reason: ${action.reason})` : ""}.`;
  }
};

const describeCondition = (condition: VoicePathwayCondition): string => {
  switch (condition.kind) {
    case "always":
      return "always";
    case "fallback":
      return "if no other condition matches";
    case "slot-filled":
      return `when slot \`${condition.slotId}\` is filled`;
    case "slot-equals":
      return `when slot \`${condition.slotId}\` equals ${JSON.stringify(condition.value)}`;
    case "slot-matches":
      return `when slot \`${condition.slotId}\` matches /${condition.pattern}/`;
  }
};

const describeTransition = (transition: VoicePathwayTransition): string =>
  `→ ${transition.to} (${describeCondition(transition.condition)})`;

const describeState = (state: VoicePathwayState): string => {
  const header = `## State: ${state.id} — ${state.label}${state.kind ? ` (${state.kind})` : ""}`;
  const description = state.description ? `\n${state.description}` : "";
  const note = state.systemNote ? `\nNote: ${state.systemNote}` : "";
  const actions = (state.actions ?? [])
    .map((a) => `- ${describeAction(a)}`)
    .join("\n");
  const transitions = state.transitions
    .map((t) => `- ${describeTransition(t)}`)
    .join("\n");
  return [
    header,
    description,
    note,
    actions ? `\nActions:\n${actions}` : "",
    transitions ? `\nTransitions:\n${transitions}` : "",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
};

const buildTools = (
  pathway: VoicePathway,
  prefix: string,
): VoicePathwayCompilerToolDefinition[] => {
  const advanceTool: VoicePathwayCompilerToolDefinition = {
    description: `Advance the ${pathway.label} pathway by transitioning to the next state. Always call when a state's conditions are met.`,
    name: `${prefix}_advance`,
    parameters: {
      properties: {
        rationale: {
          description: "Why this transition is being taken now.",
          type: "string",
        },
        toStateId: {
          description: "ID of the target state.",
          enum: pathway.states.map((s) => s.id),
          type: "string",
        },
      },
      required: ["toStateId"],
      type: "object",
    },
  };

  const fillSlotTool: VoicePathwayCompilerToolDefinition = {
    description: `Record a slot value collected from the caller within the ${pathway.label} pathway.`,
    name: `${prefix}_fill_slot`,
    parameters: {
      properties: {
        slotId: {
          description: "ID of the slot being filled.",
          enum: pathway.slots.map((s) => s.id),
          type: "string",
        },
        value: {
          description: "The value the caller provided.",
          type: "string",
        },
      },
      required: ["slotId", "value"],
      type: "object",
    },
  };

  const endCallTool: VoicePathwayCompilerToolDefinition = {
    description: `End the ${pathway.label} call.`,
    name: `${prefix}_end_call`,
    parameters: {
      properties: {
        reason: { description: "Reason for ending.", type: "string" },
      },
      required: [],
      type: "object",
    },
  };

  const userTools = (pathway.tools ?? []).map((tool) => ({
    description: tool.description,
    name: `${prefix}_tool_${tool.id}`,
    parameters: {
      properties: {
        arguments: { description: "JSON-encoded arguments.", type: "string" },
      },
      required: [],
      type: "object",
    },
  })) as VoicePathwayCompilerToolDefinition[];

  return [advanceTool, fillSlotTool, endCallTool, ...userTools];
};

export const compileVoicePathwayToAssistant = (
  options: CompileVoicePathwayOptions,
): VoicePathwayCompiledAssistant => {
  const report = validateVoicePathway(options.pathway);
  if (!report.valid) {
    throw new Error(
      `Cannot compile invalid pathway: ${report.issues
        .filter((i) => i.severity === "error")
        .map((i) => i.message)
        .join("; ")}`,
    );
  }
  const prefix = options.toolNamePrefix ?? `pathway_${options.pathway.id}`;
  const tools = buildTools(options.pathway, prefix);
  const fallback =
    options.fallbackBehavior === "end-call"
      ? "If no transition condition is met, end the call politely."
      : options.fallbackBehavior === "transfer"
        ? "If no transition condition is met, transfer to a human agent."
        : "If no transition condition is met, ask a clarifying question and stay in the current state.";

  const slotBlock = options.pathway.slots
    .map(
      (slot) =>
        `- \`${slot.id}\` (${slot.type}${slot.required ? ", required" : ""}): ${slot.description ?? slot.prompt}`,
    )
    .join("\n");

  const stateBlock = options.pathway.states.map(describeState).join("\n\n");

  const systemPrompt = [
    `You are operating the "${options.pathway.label}" pathway as a voice agent.`,
    `Follow the state machine exactly. Use the provided tools to advance states, fill slots, and end the call.`,
    `Start in state \`${options.pathway.entryStateId}\`. Track which state you are in. Do not invent states or transitions.`,
    fallback,
    "",
    `Slots:\n${slotBlock || "(none)"}`,
    "",
    `States:\n${stateBlock}`,
  ].join("\n");

  return {
    metadata: {
      entryStateId: options.pathway.entryStateId,
      pathwayId: options.pathway.id,
      pathwayLabel: options.pathway.label,
    },
    systemPrompt,
    tools,
    ...(options.introduction !== undefined
      ? { initialPrompt: options.introduction }
      : {}),
  };
};
