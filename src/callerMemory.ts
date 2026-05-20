import type { Transcript, VoiceSessionRecord, VoiceTurnRecord } from "./types";
import type { VoiceAssistantMemoryNamespaceInput } from "./assistantMemory";

export type VoiceCallerIdentity = {
  email?: string;
  externalId?: string;
  phone?: string;
};

export type VoiceCallerMemorySnapshot = {
  facts: Record<string, string>;
  identity: VoiceCallerIdentity;
  lastSessionAt: number;
  openActions: string[];
  summary: string;
};

export const VOICE_CALLER_MEMORY_KEY = "caller-memory-snapshot";

const normalizeIdentifier = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9+@._-]/g, "-")
    .toLowerCase();

export const buildVoiceCallerMemoryNamespace = (
  identity: VoiceCallerIdentity | undefined,
  prefix = "caller",
) => {
  const identifier =
    identity?.externalId ?? identity?.phone ?? identity?.email ?? "anonymous";
  return `${prefix}:${normalizeIdentifier(identifier)}`;
};

export type CreateVoiceCallerMemoryNamespaceOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = {
  identifyCaller: (
    input: VoiceAssistantMemoryNamespaceInput<TContext, TSession>,
  ) =>
    | Promise<VoiceCallerIdentity | undefined>
    | VoiceCallerIdentity
    | undefined;
  prefix?: string;
};

export const createVoiceCallerMemoryNamespace =
  <
    TContext = unknown,
    TSession extends VoiceSessionRecord = VoiceSessionRecord,
  >(
    options: CreateVoiceCallerMemoryNamespaceOptions<TContext, TSession>,
  ) =>
  async (input: VoiceAssistantMemoryNamespaceInput<TContext, TSession>) => {
    const identity = await Promise.resolve(options.identifyCaller(input));
    return buildVoiceCallerMemoryNamespace(identity, options.prefix);
  };

export type VoiceCallerMemoryCompletion = (input: {
  prompt: string;
  systemPrompt?: string;
}) => Promise<string>;

export type SummarizeVoiceCallerTranscriptOptions = {
  completion: VoiceCallerMemoryCompletion;
  previousSnapshot?: VoiceCallerMemorySnapshot;
  systemPrompt?: string;
};

const DEFAULT_SYSTEM_PROMPT =
  "You write structured caller memory snapshots for a voice agent. " +
  "Given the latest call transcript (and an optional previous snapshot), " +
  "merge them into JSON with shape " +
  '{"summary":"…","facts":{"key":"value"},"openActions":["…"]}. ' +
  "Keep summary under 240 chars. Facts must be short value strings (name, plan, last_issue). " +
  "openActions are concrete follow-ups still pending. JSON only.";

const buildTranscriptBlock = (turns: VoiceTurnRecord[]) =>
  turns
    .map((turn, index) => {
      const userText = turn.text.trim();
      const assistantText =
        typeof turn.assistantText === "string" ? turn.assistantText.trim() : "";
      const lines = [`Turn ${index + 1}:`];
      if (userText) {
        lines.push(`  user: ${userText}`);
      }
      if (assistantText) {
        lines.push(`  agent: ${assistantText}`);
      }
      return lines.join("\n");
    })
    .join("\n");

const extractJson = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Caller-memory summarizer returned empty response");
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("Caller-memory response was not valid JSON");
  }
};

const coerceFacts = (input: unknown): Record<string, string> => {
  if (!input || typeof input !== "object") {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string") {
      out[key] = value;
    } else if (value !== null && value !== undefined) {
      out[key] = String(value);
    }
  }
  return out;
};

const coerceActions = (input: unknown): string[] => {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
};

export type VoiceCallerMemorySummarizerInput = {
  identity: VoiceCallerIdentity;
  options: SummarizeVoiceCallerTranscriptOptions;
  transcripts?: Transcript[];
  turns: VoiceTurnRecord[];
};

export const summarizeVoiceCallerTranscript = async (
  input: VoiceCallerMemorySummarizerInput,
): Promise<VoiceCallerMemorySnapshot> => {
  const transcriptBlock = buildTranscriptBlock(input.turns);
  const previousBlock = input.options.previousSnapshot
    ? `Previous snapshot:\n${JSON.stringify(input.options.previousSnapshot, null, 2)}\n\n`
    : "";
  const prompt = `${previousBlock}Latest call transcript:\n${transcriptBlock}\n\nReturn JSON only.`;
  const raw = await input.options.completion({
    prompt,
    systemPrompt: input.options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
  });
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Caller-memory summarizer returned non-object JSON");
  }
  const record = parsed as Record<string, unknown>;
  return {
    facts: coerceFacts(record.facts),
    identity: input.identity,
    lastSessionAt: Date.now(),
    openActions: coerceActions(record.openActions ?? record.open_actions),
    summary: typeof record.summary === "string" ? record.summary : "",
  };
};
