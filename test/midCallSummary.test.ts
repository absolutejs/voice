import { describe, expect, test } from "bun:test";
import { createMidCallSummarizer } from "../src/midCallSummary";
import type { VoiceLLMJudgeCompletion } from "../src/llmJudge";
import type { VoiceSessionRecord, VoiceTurnRecord } from "../src/types";

const turn = (text: string, assistantText?: string): VoiceTurnRecord => ({
  assistantText,
  committedAt: Date.now(),
  id: text,
  text,
  transcripts: [],
});

const baseSession = (turns: VoiceTurnRecord[]): VoiceSessionRecord => ({
  committedTurnIds: turns.map((t) => t.id),
  createdAt: 0,
  currentTurn: { finalText: "", partialText: "", transcripts: [] },
  id: "s",
  reconnect: { attempts: 0 },
  status: "active",
  transcripts: [],
  turns,
});

const fakeCompletion =
  (text: string): VoiceLLMJudgeCompletion =>
  async () =>
    text;

describe("createMidCallSummarizer", () => {
  test("returns undefined before everyTurns threshold", async () => {
    const summarizer = createMidCallSummarizer({
      completion: fakeCompletion("summary"),
      everyTurns: 3,
      minIntervalMs: 10_000,
    });
    const out = await summarizer.evaluate({
      session: baseSession([turn("hi")]),
    });
    expect(out).toBeUndefined();
  });

  test("fires once everyTurns threshold is met", async () => {
    const summarizer = createMidCallSummarizer({
      completion: fakeCompletion("Caller wants a refund."),
      everyTurns: 2,
      minIntervalMs: 100_000,
    });
    const session = baseSession([turn("hi", "hello"), turn("refund please", "ok")]);
    const out = await summarizer.evaluate({ session });
    expect(out?.summary).toBe("Caller wants a refund.");
    expect(out?.turnCount).toBe(2);
  });

  test("respects minIntervalMs gating after a recent summary", async () => {
    let runs = 0;
    const completion: VoiceLLMJudgeCompletion = async () => {
      runs += 1;
      return `summary ${runs}`;
    };
    const summarizer = createMidCallSummarizer({
      completion,
      everyTurns: 1,
      minIntervalMs: 60_000,
    });
    await summarizer.evaluate({ session: baseSession([turn("a")]) });
    await summarizer.evaluate({
      session: baseSession([turn("a"), turn("b")]),
    });
    expect(runs).toBe(1);
  });

  test("threads the previous summary into the prompt", async () => {
    const seen: string[] = [];
    const completion: VoiceLLMJudgeCompletion = async ({ prompt }) => {
      seen.push(prompt);
      return "updated";
    };
    const summarizer = createMidCallSummarizer({
      completion,
      everyTurns: 1,
      minIntervalMs: 0,
    });
    await summarizer.evaluate({ session: baseSession([turn("a")]) });
    await summarizer.evaluate({
      session: baseSession([turn("a"), turn("b")]),
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain("Previous summary");
  });
});
