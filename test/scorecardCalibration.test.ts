import { describe, expect, test } from "bun:test";
import {
  buildVoiceCallScorecard,
  DEFAULT_VOICE_SALES_RUBRIC,
} from "../src/core/callScorecard";
import { computeVoiceScorecardCalibration } from "../src/core/scorecardCalibration";

const card = (
  reviewer: "human" | "llm",
  score: number,
  sessionId: string,
  overrides: Record<string, number> = {},
) =>
  buildVoiceCallScorecard({
    reviewer,
    rubric: DEFAULT_VOICE_SALES_RUBRIC,
    scores: {
      "close-or-next-step": { score: overrides["close-or-next-step"] ?? score },
      "compliance-disclosure": {
        score: overrides["compliance-disclosure"] ?? score,
      },
      greeting: { score: overrides.greeting ?? score },
      "needs-discovery": { score: overrides["needs-discovery"] ?? score },
      "objection-handling": {
        score: overrides["objection-handling"] ?? score,
      },
    },
    sessionId,
  });

describe("computeVoiceScorecardCalibration", () => {
  test("identical pairs produce zero error and full agreement", () => {
    const report = computeVoiceScorecardCalibration([
      {
        human: card("human", 5, "call_1"),
        llm: card("llm", 5, "call_1"),
        sessionId: "call_1",
      },
      {
        human: card("human", 3, "call_2"),
        llm: card("llm", 3, "call_2"),
        sessionId: "call_2",
      },
    ]);
    expect(report.meanAbsoluteError).toBe(0);
    expect(report.gradeAgreementRate).toBe(1);
  });

  test("computes MAE across diverging scores", () => {
    const report = computeVoiceScorecardCalibration([
      {
        human: card("human", 5, "call_1"),
        llm: card("llm", 4, "call_1"),
        sessionId: "call_1",
      },
    ]);
    expect(report.meanAbsoluteError).toBeCloseTo(1 / 5, 5);
  });

  test("worst divergence list returns biggest gap first", () => {
    const report = computeVoiceScorecardCalibration([
      {
        human: card("human", 5, "call_1", { "compliance-disclosure": 5 }),
        llm: card("llm", 5, "call_1", { "compliance-disclosure": 1 }),
        sessionId: "call_1",
      },
    ]);
    expect(report.worstDivergences[0]?.criterionId).toBe(
      "compliance-disclosure",
    );
  });

  test("per-criterion bias reflects LLM under-scoring", () => {
    const report = computeVoiceScorecardCalibration([
      {
        human: card("human", 5, "call_1"),
        llm: card("llm", 3, "call_1"),
        sessionId: "call_1",
      },
    ]);
    expect(report.perCriterion.every((c) => c.bias < 0)).toBe(true);
  });

  test("correlation is positive when LLM tracks human", () => {
    const report = computeVoiceScorecardCalibration([
      {
        human: card("human", 5, "call_1"),
        llm: card("llm", 4, "call_1"),
        sessionId: "call_1",
      },
      {
        human: card("human", 3, "call_2"),
        llm: card("llm", 2, "call_2"),
        sessionId: "call_2",
      },
      {
        human: card("human", 1, "call_3"),
        llm: card("llm", 1, "call_3"),
        sessionId: "call_3",
      },
    ]);
    expect(report.weightedScoreCorrelation).toBeGreaterThan(0.9);
  });

  test("empty input returns zeroed report", () => {
    const report = computeVoiceScorecardCalibration([]);
    expect(report.pairsCompared).toBe(0);
    expect(report.meanAbsoluteError).toBe(0);
  });
});
