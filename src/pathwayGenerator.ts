import {
  validateVoicePathway,
  type VoicePathway,
  type VoicePathwayValidationReport,
} from "./pathway";

export type VoicePathwayGeneratorCompletion = (input: {
  prompt: string;
  systemPrompt: string;
}) => Promise<string>;

export type GenerateVoicePathwayInput = {
  /** Plain-text description of the agent / flow to build. */
  description: string;
  completion: VoicePathwayGeneratorCompletion;
  /** Suggested pathway id (slugified). Defaults to "generated-pathway". */
  id?: string;
  /** Extra guidance appended to the system prompt. */
  guidance?: string;
  /**
   * If the first attempt fails validation, retry this many times feeding the
   * issues back to the model. Defaults to 2.
   */
  maxRepairAttempts?: number;
};

export type GenerateVoicePathwayResult = {
  pathway: VoicePathway;
  report: VoicePathwayValidationReport;
  attempts: number;
  /** Raw model outputs from each attempt, for debugging. */
  rawOutputs: string[];
};

const SYSTEM_PROMPT = `You design conversation pathways for voice agents as strict JSON.

A pathway is a state machine. Output ONLY a JSON object with this shape:
{
  "id": "kebab-case-id",
  "label": "Human readable label",
  "entryStateId": "<id of the first state>",
  "slots": [
    { "id": "slot_id", "type": "string|number|boolean|date|time|phone|email|currency|choice", "prompt": "what to ask", "required": true, "choices": ["a","b"] }
  ],
  "states": [
    {
      "id": "state_id",
      "label": "Label",
      "kind": "entry|collect|branch|action|terminal",
      "actions": [
        { "kind": "say", "text": "..." },
        { "kind": "collect-slot", "slotId": "slot_id" },
        { "kind": "call-tool", "toolId": "tool_id", "argsFromSlots": ["slot_id"] },
        { "kind": "transfer", "destination": "..." },
        { "kind": "end-call", "reason": "..." }
      ],
      "transitions": [
        { "to": "next_state", "condition": { "kind": "always" } },
        { "to": "x", "condition": { "kind": "slot-filled", "slotId": "slot_id" } },
        { "to": "y", "condition": { "kind": "slot-equals", "slotId": "slot_id", "value": "yes" } },
        { "to": "z", "condition": { "kind": "fallback" } }
      ]
    }
  ],
  "tools": [ { "id": "tool_id", "description": "..." } ]
}

Hard rules:
- Exactly one entry state; entryStateId must reference a real state.
- At least one terminal state (kind "terminal" or a state with no transitions) must be reachable from entry.
- Every transition "to" must reference a defined state id.
- Every slotId referenced in actions/conditions must be defined in "slots".
- A "fallback" transition, if present, must be the LAST transition in its state.
- Do not invent extra fields. Output JSON only — no prose, no markdown fences.`;

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60) || "generated-pathway";

const extractJson = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Pathway generator returned an empty response");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error(
      `Pathway generator response was not valid JSON: ${raw.slice(0, 200)}`,
    );
  }
};

const coercePathway = (parsed: unknown, fallbackId: string): VoicePathway => {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Pathway generator response is not a JSON object");
  }
  const root = parsed as Partial<VoicePathway>;
  return {
    entryStateId: String(root.entryStateId ?? ""),
    id: typeof root.id === "string" && root.id.length > 0 ? root.id : fallbackId,
    label: String(root.label ?? "Generated pathway"),
    slots: Array.isArray(root.slots) ? root.slots : [],
    states: Array.isArray(root.states) ? root.states : [],
    ...(Array.isArray(root.tools) ? { tools: root.tools } : {}),
    ...(root.metadata && typeof root.metadata === "object"
      ? { metadata: root.metadata }
      : {}),
  };
};

export const generateVoicePathwayFromPrompt = async (
  input: GenerateVoicePathwayInput,
): Promise<GenerateVoicePathwayResult> => {
  const fallbackId = input.id ?? slugify(input.description);
  const maxRepairs = input.maxRepairAttempts ?? 2;
  const systemPrompt = input.guidance
    ? `${SYSTEM_PROMPT}\n\nAdditional guidance:\n${input.guidance}`
    : SYSTEM_PROMPT;

  const rawOutputs: string[] = [];
  let lastReport: VoicePathwayValidationReport | null = null;
  let lastPathway: VoicePathway | null = null;

  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    const prompt =
      attempt === 0
        ? `Build a voice pathway for:\n${input.description}\n\nSuggested id: ${fallbackId}`
        : `The previous pathway JSON failed validation with these errors:\n${lastReport!.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => `- ${issue.message}`)
            .join("\n")}\n\nHere was your previous output:\n${rawOutputs.at(-1)}\n\nReturn a corrected pathway JSON that fixes every error.`;

    const raw = await input.completion({ prompt, systemPrompt });
    rawOutputs.push(raw);
    const pathway = coercePathway(extractJson(raw), fallbackId);
    const report = validateVoicePathway(pathway);
    lastReport = report;
    lastPathway = pathway;
    if (report.valid) {
      return { attempts: attempt + 1, pathway, rawOutputs, report };
    }
  }

  return {
    attempts: rawOutputs.length,
    pathway: lastPathway as VoicePathway,
    rawOutputs,
    report: lastReport as VoicePathwayValidationReport,
  };
};
