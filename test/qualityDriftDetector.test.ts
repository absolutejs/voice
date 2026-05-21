import { describe, expect, test } from "bun:test";
import {
  buildVoiceCallScorecard,
  DEFAULT_VOICE_SALES_RUBRIC,
} from "../src/core/callScorecard";
import { detectVoiceQualityDrift } from "../src/core/qualityDriftDetector";

const card = (
  score: number,
  at: number,
  overrides: Record<string, number> = {},
) =>
  buildVoiceCallScorecard({
    agentId: "agent_1",
    now: () => at,
    reviewer: "llm",
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
    sessionId: `call_${at}`,
  });

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;

describe("detectVoiceQualityDrift", () => {
  test("flat scores yield ok severity", () => {
    const cards = Array.from({ length: 10 }, (_, i) =>
      card(5, now - (i + 1) * DAY),
    );
    const report = detectVoiceQualityDrift({
      now: () => now,
      rubricId: DEFAULT_VOICE_SALES_RUBRIC.id,
      scorecards: cards,
    });
    expect(report.overall.severity).toBe("ok");
  });

  test("regression on overall score triggers regression severity", () => {
    const baseline = Array.from({ length: 20 }, (_, i) =>
      card(5, now - 20 * DAY - i * DAY),
    );
    const current = Array.from({ length: 5 }, (_, i) => card(2, now - i * DAY));
    const report = detectVoiceQualityDrift({
      now: () => now,
      rubricId: DEFAULT_VOICE_SALES_RUBRIC.id,
      scorecards: [...baseline, ...current],
    });
    expect(report.overall.severity).toBe("regression");
    expect(report.alertCount).toBeGreaterThan(0);
  });

  test("per-criterion drift surfaces the offending criterion", () => {
    const baseline = Array.from({ length: 10 }, (_, i) =>
      card(5, now - 20 * DAY - i * DAY),
    );
    const current = Array.from({ length: 5 }, (_, i) =>
      card(5, now - i * DAY, { "compliance-disclosure": 1 }),
    );
    const report = detectVoiceQualityDrift({
      now: () => now,
      rubricId: DEFAULT_VOICE_SALES_RUBRIC.id,
      scorecards: [...baseline, ...current],
    });
    const compliance = report.criteria.find(
      (c) => c.criterionId === "compliance-disclosure",
    );
    expect(compliance?.severity).toBe("regression");
  });

  test("scope window respects custom baseline + current windows", () => {
    const baseline = [card(5, now - 30 * DAY)];
    const current = [card(5, now - 1 * DAY)];
    const report = detectVoiceQualityDrift({
      baselineWindowMs: 60 * DAY,
      currentWindowMs: 7 * DAY,
      now: () => now,
      rubricId: DEFAULT_VOICE_SALES_RUBRIC.id,
      scorecards: [...baseline, ...current],
    });
    expect(report.baselineWindow.sampleSize).toBe(1);
    expect(report.currentWindow.sampleSize).toBe(1);
  });

  test("filters by rubricId", () => {
    const cards = [
      card(5, now - DAY),
      {
        ...card(5, now - 2 * DAY),
        rubricId: "other-rubric",
      },
    ];
    const report = detectVoiceQualityDrift({
      now: () => now,
      rubricId: DEFAULT_VOICE_SALES_RUBRIC.id,
      scorecards: cards,
    });
    expect(report.currentWindow.sampleSize).toBe(1);
  });
});
