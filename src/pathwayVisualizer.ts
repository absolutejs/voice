import type {
  VoicePathway,
  VoicePathwayCondition,
  VoicePathwayState,
} from "./pathway";

const escapeMermaidLabel = (text: string): string =>
  text.replace(/[<>"]/gu, "").replace(/\|/gu, "/");

const conditionLabel = (condition: VoicePathwayCondition): string => {
  switch (condition.kind) {
    case "always":
      return "always";
    case "fallback":
      return "else";
    case "slot-filled":
      return `${condition.slotId} ✓`;
    case "slot-equals":
      return `${condition.slotId}=${condition.value}`;
    case "slot-matches":
      return `${condition.slotId}~/${condition.pattern}/`;
  }
};

const mermaidShape = (state: VoicePathwayState): { open: string; close: string } => {
  switch (state.kind) {
    case "entry":
      return { close: ")", open: "((" };
    case "terminal":
      return { close: "))", open: "((" };
    case "branch":
      return { close: "}", open: "{" };
    case "action":
      return { close: "]", open: "[" };
    case "collect":
      return { close: "]", open: "[" };
    default:
      return { close: "]", open: "[" };
  }
};

export const renderVoicePathwayMermaid = (pathway: VoicePathway): string => {
  const lines: string[] = ["flowchart TD"];
  for (const state of pathway.states) {
    const shape = mermaidShape(state);
    const label = escapeMermaidLabel(`${state.id}: ${state.label}`);
    lines.push(`    ${state.id}${shape.open}"${label}"${shape.close}`);
  }
  for (const state of pathway.states) {
    for (const transition of state.transitions) {
      const label = escapeMermaidLabel(conditionLabel(transition.condition));
      lines.push(`    ${state.id} -- "${label}" --> ${transition.to}`);
    }
  }
  return lines.join("\n");
};

export const renderVoicePathwayText = (pathway: VoicePathway): string => {
  const stateById = new Map(pathway.states.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const lines: string[] = [
    `Pathway: ${pathway.label} (${pathway.id})`,
    `Entry: ${pathway.entryStateId}`,
    "",
  ];

  if (pathway.slots.length > 0) {
    lines.push("Slots:");
    for (const slot of pathway.slots) {
      lines.push(
        `  - ${slot.id} (${slot.type}${slot.required ? ", required" : ""}): ${slot.prompt}`,
      );
    }
    lines.push("");
  }

  const walk = (stateId: string, depth: number) => {
    if (visited.has(stateId)) {
      lines.push(`${"  ".repeat(depth)}→ ${stateId} (already shown)`);
      return;
    }
    visited.add(stateId);
    const state = stateById.get(stateId);
    if (!state) {
      lines.push(`${"  ".repeat(depth)}→ ${stateId} (missing)`);
      return;
    }
    const indent = "  ".repeat(depth);
    const kind = state.kind ? ` [${state.kind}]` : "";
    lines.push(`${indent}- ${state.id}: ${state.label}${kind}`);
    if (state.actions && state.actions.length > 0) {
      for (const action of state.actions) {
        lines.push(`${indent}    · ${action.kind}`);
      }
    }
    for (const transition of state.transitions) {
      lines.push(
        `${indent}    → ${transition.to} (${conditionLabel(transition.condition)})`,
      );
      walk(transition.to, depth + 1);
    }
  };

  lines.push("States:");
  walk(pathway.entryStateId, 1);
  return lines.join("\n");
};

export type VoicePathwayVisualization = {
  mermaid: string;
  text: string;
};

export const visualizeVoicePathway = (
  pathway: VoicePathway,
): VoicePathwayVisualization => ({
  mermaid: renderVoicePathwayMermaid(pathway),
  text: renderVoicePathwayText(pathway),
});
