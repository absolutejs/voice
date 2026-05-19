import { describe, expect, test } from "bun:test";
import { summarizeVoiceCallTraffic } from "../src/client/conversationAnalytics";
import type { StoredVoiceTraceEvent } from "../src/trace";

const lifecycleEvent = (
  at: number,
  sessionId: string,
  payload: Record<string, unknown>,
): StoredVoiceTraceEvent => ({
  at,
  id: `lc-${sessionId}-${at}`,
  payload,
  sessionId,
  type: "call.lifecycle",
});

describe("summarizeVoiceCallTraffic", () => {
  test("buckets ended calls by day, totals dispositions + duration", () => {
    const dayA = new Date("2026-05-19T08:00:00Z").getTime();
    const dayAEnd = dayA + 5 * 60_000;
    const dayB = new Date("2026-05-20T11:00:00Z").getTime();
    const dayBEnd = dayB + 3 * 60_000;
    const summary = summarizeVoiceCallTraffic({
      events: [
        lifecycleEvent(dayA, "s1", { type: "start" }),
        lifecycleEvent(dayAEnd, "s1", { disposition: "completed", type: "end" }),
        lifecycleEvent(dayA + 1_000, "s2", { type: "start" }),
        lifecycleEvent(dayA + 2_000, "s2", {
          disposition: "failed",
          type: "end",
        }),
        lifecycleEvent(dayB, "s3", { type: "start" }),
        lifecycleEvent(dayBEnd, "s3", {
          disposition: "transferred",
          type: "end",
        }),
      ],
    });
    expect(summary.buckets).toHaveLength(2);
    expect(summary.totals.callsTotal).toBe(3);
    expect(summary.totals.callsCompleted).toBe(1);
    expect(summary.totals.callsFailed).toBe(1);
    expect(summary.totals.callsTransferred).toBe(1);
    expect(summary.totals.totalDurationMs).toBe(5 * 60_000 + 1_000 + 3 * 60_000);
    expect(summary.callsByDisposition.completed).toBe(1);
    expect(summary.callsByDisposition.failed).toBe(1);
    expect(summary.callsByDisposition.transferred).toBe(1);
  });

  test("rolls up transfer reasons and top targets", () => {
    const summary = summarizeVoiceCallTraffic({
      events: [
        lifecycleEvent(1, "s1", { type: "start" }),
        lifecycleEvent(2, "s1", {
          reason: "billing question",
          target: "+18005550101",
          type: "transfer",
        }),
        lifecycleEvent(3, "s1", { disposition: "transferred", type: "end" }),
        lifecycleEvent(4, "s2", { type: "start" }),
        lifecycleEvent(5, "s2", {
          reason: "billing question",
          target: "+18005550101",
          type: "transfer",
        }),
        lifecycleEvent(6, "s2", { disposition: "transferred", type: "end" }),
        lifecycleEvent(7, "s3", { type: "start" }),
        lifecycleEvent(8, "s3", {
          reason: "technical issue",
          target: "+18005550202",
          type: "transfer",
        }),
        lifecycleEvent(9, "s3", { disposition: "transferred", type: "end" }),
      ],
    });
    expect(summary.transferReasons["billing question"]).toBe(2);
    expect(summary.transferReasons["technical issue"]).toBe(1);
    expect(summary.topTransferTargets[0]).toEqual({
      count: 2,
      target: "+18005550101",
    });
  });

  test("honors fromMs / toMs", () => {
    const summary = summarizeVoiceCallTraffic({
      events: [
        lifecycleEvent(1_000, "s1", { type: "start" }),
        lifecycleEvent(2_000, "s1", { disposition: "completed", type: "end" }),
        lifecycleEvent(10_000, "s2", { type: "start" }),
        lifecycleEvent(11_000, "s2", { disposition: "completed", type: "end" }),
      ],
      fromMs: 5_000,
      toMs: 20_000,
    });
    expect(summary.totals.callsTotal).toBe(1);
  });

  test("returns empty totals when there are no lifecycle events", () => {
    const summary = summarizeVoiceCallTraffic({
      events: [
        {
          at: 1,
          id: "x",
          payload: {},
          sessionId: "s",
          type: "turn.assistant",
        },
      ],
    });
    expect(summary.totals.callsTotal).toBe(0);
    expect(summary.buckets).toEqual([]);
  });
});
