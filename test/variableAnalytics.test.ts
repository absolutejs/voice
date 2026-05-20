import { describe, expect, test } from "bun:test";
import {
  buildVoiceVariableAnalytics,
  type VoiceAnalyticsCall,
} from "../src";

const calls: VoiceAnalyticsCall[] = [
  {
    costUsd: 0.1,
    durationSeconds: 60,
    outcome: "won",
    sessionId: "a",
    variables: { plan: "pro", source: "ads" },
  },
  {
    costUsd: 0.2,
    durationSeconds: 120,
    outcome: "lost",
    sessionId: "b",
    variables: { plan: "pro", source: "organic" },
  },
  {
    costUsd: 0.3,
    durationSeconds: 30,
    success: true,
    sessionId: "c",
    variables: { plan: "free", source: "ads" },
  },
  {
    sessionId: "d",
    variables: { source: "ads" }, // missing "plan"
  },
];

describe("buildVoiceVariableAnalytics", () => {
  test("computes overall metrics across calls", () => {
    const report = buildVoiceVariableAnalytics({
      calls,
      variables: ["plan"],
    });
    expect(report.totalCalls).toBe(4);
    // 3 calls have cost: (0.1+0.2+0.3)/3
    expect(report.overall.avgCostUsd).toBeCloseTo(0.2, 5);
    // 3 calls have duration: (60+120+30)/3
    expect(report.overall.avgDurationSeconds).toBeCloseTo(70, 5);
    // flagged: a(won)=success, b(lost)=fail, c(success)=success → 2/3
    expect(report.overall.successRate).toBeCloseTo(2 / 3, 5);
  });

  test("breaks down by variable value with counts, shares, and missing", () => {
    const report = buildVoiceVariableAnalytics({
      calls,
      variables: ["plan"],
    });
    const plan = report.byVariable.plan!;
    expect(plan.distinctValues).toBe(2);
    expect(plan.missingCount).toBe(1);
    const pro = plan.values.find((value) => value.value === "pro")!;
    expect(pro.count).toBe(2);
    expect(pro.share).toBeCloseTo(2 / 4, 5);
    // pro: a(won)=success, b(lost)=fail → 1/2
    expect(pro.successRate).toBeCloseTo(0.5, 5);
    expect(pro.outcomes).toEqual({ lost: 1, won: 1 });
    const free = plan.values.find((value) => value.value === "free")!;
    expect(free.count).toBe(1);
    expect(free.successRate).toBeCloseTo(1, 5);
  });

  test("sorts values by count descending and caps with topValuesPerVariable", () => {
    const report = buildVoiceVariableAnalytics({
      calls,
      topValuesPerVariable: 1,
      variables: ["source"],
    });
    const source = report.byVariable.source!;
    expect(source.distinctValues).toBe(2);
    expect(source.values).toHaveLength(1);
    expect(source.values[0]!.value).toBe("ads"); // 3 ads vs 1 organic
    expect(source.values[0]!.count).toBe(3);
  });

  test("honors custom successOutcomes and returns null when nothing flagged", () => {
    const noSignal = buildVoiceVariableAnalytics({
      calls: [{ sessionId: "x", variables: { plan: "pro" } }],
      variables: ["plan"],
    });
    expect(noSignal.overall.successRate).toBeNull();
    expect(noSignal.byVariable.plan!.values[0]!.successRate).toBeNull();

    const custom = buildVoiceVariableAnalytics({
      calls: [
        { outcome: "demo-booked", sessionId: "x", variables: { plan: "pro" } },
        { outcome: "no-show", sessionId: "y", variables: { plan: "pro" } },
      ],
      successOutcomes: ["demo-booked"],
      variables: ["plan"],
    });
    expect(custom.overall.successRate).toBeCloseTo(0.5, 5);
  });
});
