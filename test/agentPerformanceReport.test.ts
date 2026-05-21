import { describe, expect, test } from "bun:test";
import {
  buildVoiceCallScorecard,
  DEFAULT_VOICE_SALES_RUBRIC,
} from "../src/core/callScorecard";
import { buildVoiceAgentPerformanceReport } from "../src/core/agentPerformanceReport";

const utc = (iso: string) => new Date(`${iso}Z`).getTime();

const card = (
  scores: number,
  at: number,
  agentId = "agent_1",
  overrides: Record<string, number> = {},
) =>
  buildVoiceCallScorecard({
    agentId,
    now: () => at,
    reviewer: "llm",
    rubric: DEFAULT_VOICE_SALES_RUBRIC,
    scores: {
      "close-or-next-step": {
        score: overrides["close-or-next-step"] ?? scores,
      },
      "compliance-disclosure": {
        score: overrides["compliance-disclosure"] ?? scores,
      },
      greeting: { score: overrides.greeting ?? scores },
      "needs-discovery": { score: overrides["needs-discovery"] ?? scores },
      "objection-handling": {
        score: overrides["objection-handling"] ?? scores,
      },
    },
    sessionId: `call_${at}`,
  });

describe("buildVoiceAgentPerformanceReport", () => {
  test("filters by agent + rubric and counts buckets", () => {
    const report = buildVoiceAgentPerformanceReport({
      agentId: "agent_1",
      bucket: "day",
      rubricId: DEFAULT_VOICE_SALES_RUBRIC.id,
      scorecards: [
        card(5, utc("2026-05-18T10:00:00")),
        card(4, utc("2026-05-18T15:00:00")),
        card(3, utc("2026-05-19T10:00:00"), "agent_2"),
      ],
    });
    expect(report.totalCalls).toBe(2);
    expect(report.buckets[0]?.bucketKey).toBe("2026-05-18");
    expect(report.buckets[0]?.callsScored).toBe(2);
  });

  test("computes overall pass rate", () => {
    const report = buildVoiceAgentPerformanceReport({
      agentId: "agent_1",
      rubricId: DEFAULT_VOICE_SALES_RUBRIC.id,
      scorecards: [
        card(5, utc("2026-05-18T10:00:00")),
        card(5, utc("2026-05-19T10:00:00")),
        card(0, utc("2026-05-20T10:00:00")),
      ],
    });
    expect(report.overallPassRate).toBeCloseTo(2 / 3, 5);
  });

  test("flags worst and best criteria", () => {
    const report = buildVoiceAgentPerformanceReport({
      agentId: "agent_1",
      rubricId: DEFAULT_VOICE_SALES_RUBRIC.id,
      scorecards: [
        card(5, utc("2026-05-18T10:00:00"), "agent_1", {
          "compliance-disclosure": 5,
          greeting: 1,
        }),
        card(5, utc("2026-05-19T10:00:00"), "agent_1", {
          "compliance-disclosure": 5,
          greeting: 1,
        }),
      ],
    });
    expect(report.worstCriterion).toBe("greeting");
    expect(report.bestCriterion).not.toBe("greeting");
  });

  test("detects downward trend in a criterion", () => {
    const cards = [
      card(5, utc("2026-05-01T10:00:00")),
      card(5, utc("2026-05-02T10:00:00")),
      card(2, utc("2026-05-15T10:00:00"), "agent_1", { greeting: 2 }),
      card(2, utc("2026-05-16T10:00:00"), "agent_1", { greeting: 2 }),
    ];
    const report = buildVoiceAgentPerformanceReport({
      agentId: "agent_1",
      rubricId: DEFAULT_VOICE_SALES_RUBRIC.id,
      scorecards: cards,
    });
    const greeting = report.criteria.find((c) => c.criterionId === "greeting");
    expect(greeting?.trend).toBe("down");
    expect(greeting?.delta).toBeLessThan(0);
  });

  test("respects date window filter", () => {
    const report = buildVoiceAgentPerformanceReport({
      agentId: "agent_1",
      fromMs: utc("2026-05-19T00:00:00"),
      rubricId: DEFAULT_VOICE_SALES_RUBRIC.id,
      scorecards: [
        card(5, utc("2026-05-18T10:00:00")),
        card(5, utc("2026-05-20T10:00:00")),
      ],
      toMs: utc("2026-05-25T00:00:00"),
    });
    expect(report.totalCalls).toBe(1);
  });
});
