import { describe, expect, test } from "bun:test";
import {
  buildVoiceCallScorecard,
  DEFAULT_VOICE_SALES_RUBRIC,
} from "../src/callScorecard";

const fullScores = (max = 5) => ({
  "close-or-next-step": { score: max },
  "compliance-disclosure": { score: max },
  greeting: { score: max },
  "needs-discovery": { score: max },
  "objection-handling": { score: max },
});

describe("buildVoiceCallScorecard", () => {
  test("perfect scores produce a pass grade", () => {
    const card = buildVoiceCallScorecard({
      now: () => 1_000,
      reviewer: "human",
      rubric: DEFAULT_VOICE_SALES_RUBRIC,
      scores: fullScores(),
      sessionId: "call_1",
    });
    expect(card.grade).toBe("pass");
    expect(card.weightedScore).toBeCloseTo(1, 5);
  });

  test("missing required criterion fails the call", () => {
    const card = buildVoiceCallScorecard({
      reviewer: "human",
      rubric: DEFAULT_VOICE_SALES_RUBRIC,
      scores: {
        ...fullScores(),
        "compliance-disclosure": { score: 1 },
      },
      sessionId: "call_2",
    });
    expect(card.grade).toBe("fail");
    expect(card.failedRequiredCriteria).toContain("compliance-disclosure");
  });

  test("weighted average between passing and failing grades needs-review", () => {
    const card = buildVoiceCallScorecard({
      reviewer: "human",
      rubric: DEFAULT_VOICE_SALES_RUBRIC,
      scores: {
        ...fullScores(),
        "close-or-next-step": { score: 2 },
        "needs-discovery": { score: 4 },
        "objection-handling": { score: 2 },
      },
      sessionId: "call_3",
    });
    expect(card.grade).toBe("needs-review");
  });

  test("section scores roll up by criterion section", () => {
    const card = buildVoiceCallScorecard({
      reviewer: "human",
      rubric: DEFAULT_VOICE_SALES_RUBRIC,
      scores: fullScores(),
      sessionId: "call_4",
    });
    expect(card.sectionScores.opening).toBeCloseTo(1, 5);
    expect(card.sectionScores.compliance).toBeCloseTo(1, 5);
  });

  test("clamps scores outside [0, scaleMax]", () => {
    const card = buildVoiceCallScorecard({
      reviewer: "human",
      rubric: DEFAULT_VOICE_SALES_RUBRIC,
      scores: {
        ...fullScores(),
        greeting: { score: 99 },
      },
      sessionId: "call_5",
    });
    expect(card.results.find((r) => r.criterionId === "greeting")?.score).toBe(5);
  });

  test("missing score for a criterion throws", () => {
    expect(() =>
      buildVoiceCallScorecard({
        reviewer: "human",
        rubric: DEFAULT_VOICE_SALES_RUBRIC,
        scores: {
          greeting: { score: 5 },
        } as never,
        sessionId: "call_6",
      }),
    ).toThrow(/Missing score/);
  });

  test("custom rubric weights are respected", () => {
    const card = buildVoiceCallScorecard({
      reviewer: "human",
      rubric: {
        criteria: [
          { id: "a", label: "A", weight: 1 },
          { id: "b", label: "B", weight: 9 },
        ],
        id: "custom",
        label: "Custom",
      },
      scores: {
        a: { score: 1 },
        b: { score: 5 },
      },
      sessionId: "call_7",
    });
    expect(card.weightedScore).toBeCloseTo((1 * 1 + 9 * 5) / (10 * 5), 5);
  });
});
