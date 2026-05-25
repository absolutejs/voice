import type { Transcript, VoiceSessionRecord, VoiceTurnRecord } from "./types";
import type { VoiceLLMJudgeCompletion } from "./llmJudge";

type MidCallSummary = {
  generatedAt: number;
  summary: string;
  topicalShift?: boolean;
  turnCount: number;
};

export type CreateMidCallSummarizerOptions = {
  completion: VoiceLLMJudgeCompletion;
  /** Force a summary every N turns. Default 6. */
  everyTurns?: number;
  /** Force a summary at most every M ms. Default 60_000. */
  minIntervalMs?: number;
  /** Maximum chars to include in the system prompt. Default 600. */
  summaryMaxChars?: number;
  systemPrompt?: string;
};

export type MidCallSummarizer = {
  evaluate: (input: {
    session: VoiceSessionRecord;
    turn?: VoiceTurnRecord;
  }) => Promise<MidCallSummary | undefined>;
  latest: () => MidCallSummary | undefined;
};

const DEFAULT_SYSTEM_PROMPT =
  "You write a concise rolling summary of an ongoing voice agent call. " +
  "Compress the latest turns into 1-2 sentences focused on caller intent, " +
  "open issues, and any agreed actions. Plain text only, no preamble.";

const buildPrompt = (
  turns: VoiceTurnRecord[],
  options: CreateMidCallSummarizerOptions,
  previous?: MidCallSummary,
) => {
  const maxChars = options.summaryMaxChars ?? 600;
  const transcript = turns
    .map((turn, index) => {
      const user = turn.text.trim();
      const assistant =
        typeof turn.assistantText === "string" ? turn.assistantText.trim() : "";
      const lines = [`Turn ${index + 1}:`];
      if (user) lines.push(`  user: ${user}`);
      if (assistant) lines.push(`  agent: ${assistant}`);

      return lines.join("\n");
    })
    .join("\n");
  const previousBlock = previous
    ? `Previous summary:\n${previous.summary.slice(0, maxChars)}\n\n`
    : "";

  return `${previousBlock}Latest turns:\n${transcript}\n\nReturn one updated summary, plain text only.`;
};

export const createMidCallSummarizer = (
  options: CreateMidCallSummarizerOptions,
): MidCallSummarizer => {
  const everyTurns = Math.max(1, options.everyTurns ?? 6);
  const minIntervalMs = Math.max(0, options.minIntervalMs ?? 60_000);
  let lastSummary: MidCallSummary | undefined;
  let lastTurnCount = 0;
  let inFlight: Promise<void> | undefined;

  const run = async (
    turns: VoiceTurnRecord[],
    previous: MidCallSummary | undefined,
  ): Promise<MidCallSummary | undefined> => {
    const prompt = buildPrompt(turns, options, previous);
    const raw = await options.completion({
      prompt,
      systemPrompt: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    });
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const summary: MidCallSummary = {
      generatedAt: Date.now(),
      summary: trimmed,
      turnCount: turns.length,
    };

    return summary;
  };

  return {
    evaluate: async ({ session }) => {
      const { turns } = session;
      if (turns.length === 0) return undefined;
      const turnsSince = turns.length - lastTurnCount;
      if (turnsSince < everyTurns) return undefined;
      if (lastSummary && Date.now() - lastSummary.generatedAt < minIntervalMs) {
        return undefined;
      }
      if (inFlight) return undefined;
      const promise = (async () => {
        try {
          const next = await run(turns, lastSummary);
          if (next) {
            lastSummary = next;
            lastTurnCount = turns.length;
          }
        } finally {
          inFlight = undefined;
        }
      })();
      inFlight = promise;
      await promise;

      return lastSummary;
    },
    latest: () => lastSummary,
  };
};
