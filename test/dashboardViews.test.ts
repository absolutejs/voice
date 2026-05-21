import { describe, expect, test } from "bun:test";
import { buildVoiceCostDashboardReport } from "../src/client/costDashboard";
import { createLiveCallViewer } from "../src/client/liveCallViewer";
import { buildReplayTimelineReport } from "../src/client/replayTimeline";
import type { StoredVoiceTraceEvent } from "../src/core/trace";
import type { VoiceCallReviewArtifact } from "../src/testing/review";

const costEvent = (
  at: number,
  totalUsd: number,
  llmUsd = totalUsd * 0.6,
): StoredVoiceTraceEvent => ({
  at,
  id: `cost-${at}`,
  payload: {
    llm: {
      cachedInputTokens: 0,
      inputTokens: 100,
      outputTokens: 50,
      usd: llmUsd,
    },
    sessionId: "s",
    stt: { audioMs: 30_000, usd: totalUsd * 0.1 },
    telephony: { minutes: 1, usd: totalUsd * 0.1 },
    totalUsd,
    tts: { audioMs: 0, characters: 200, usd: totalUsd * 0.2 },
  },
  sessionId: "s",
  type: "cost.ready",
});

describe("buildVoiceCostDashboardReport", () => {
  test("buckets by day and totals every modality", () => {
    const dayA = new Date("2026-05-19T10:00:00Z").getTime();
    const dayB = new Date("2026-05-20T09:00:00Z").getTime();
    const report = buildVoiceCostDashboardReport({
      events: [
        costEvent(dayA, 1),
        costEvent(dayA + 60_000, 0.5),
        costEvent(dayB, 2),
      ],
    });
    expect(report.buckets).toHaveLength(2);
    const dayABucket = report.buckets[0]!;
    expect(dayABucket.bucketKey).toBe("2026-05-19");
    expect(dayABucket.callCount).toBe(2);
    expect(dayABucket.totalUsd).toBeCloseTo(1.5, 4);
    expect(report.grandTotal.totalUsd).toBeCloseTo(3.5, 4);
  });

  test("honors fromMs / toMs window", () => {
    const base = 1_700_000_000_000;
    const report = buildVoiceCostDashboardReport({
      events: [costEvent(base, 1), costEvent(base + 10_000, 1)],
      fromMs: base + 5_000,
      toMs: base + 20_000,
    });
    expect(report.buckets[0]!.callCount).toBe(1);
  });

  test("ignores non-cost events", () => {
    const report = buildVoiceCostDashboardReport({
      events: [
        costEvent(0, 1),
        {
          at: 1,
          id: "x",
          payload: {},
          sessionId: "s",
          type: "turn.assistant",
        },
      ],
    });
    expect(report.grandTotal.callCount).toBe(1);
  });
});

describe("createLiveCallViewer", () => {
  test("appends timeline events and updates agent state on notePartial/Transcript", () => {
    const viewer = createLiveCallViewer({ sessionId: "s1" });
    viewer.notePartial("hello", 100);
    expect(viewer.getState().partialTranscript).toBe("hello");
    expect(viewer.getState().events).toHaveLength(1);
    viewer.noteTranscript("hello there", 200);
    expect(viewer.getState().partialTranscript).toBe("");
    expect(viewer.getState().events.length).toBeGreaterThanOrEqual(2);
  });

  test("subscribers fire on state updates", () => {
    const viewer = createLiveCallViewer({ sessionId: "s2" });
    let fires = 0;
    viewer.subscribe(() => {
      fires += 1;
    });
    viewer.notePartial("hi");
    viewer.noteAgentAudio();
    expect(fires).toBeGreaterThanOrEqual(2);
  });

  test("respects bufferLimit on the timeline", () => {
    const viewer = createLiveCallViewer({ bufferLimit: 3, sessionId: "s3" });
    for (let i = 0; i < 10; i += 1) viewer.noteTranscript(`t${i}`, i);
    expect(viewer.getState().events).toHaveLength(3);
  });
});

describe("buildReplayTimelineReport", () => {
  test("categorizes events and totals turn counts", () => {
    const artifact: VoiceCallReviewArtifact = {
      errors: [],
      latencyBreakdown: [],
      notes: [],
      summary: { pass: true },
      timeline: [
        { atMs: 0, event: "call.lifecycle.start", source: "voice-runtime" },
        {
          atMs: 1_000,
          event: "stt.final",
          source: "voice-runtime",
          text: "hi",
        },
        {
          atMs: 1_400,
          event: "tts.send",
          source: "voice-runtime",
          text: "hello",
        },
        { atMs: 2_000, event: "tool.call", source: "voice-runtime" },
      ],
      title: "Test",
      transcript: { actual: "hi" },
    };
    const report = buildReplayTimelineReport({ artifact });
    expect(report.events).toHaveLength(4);
    expect(report.summary.userTurns).toBe(1);
    expect(report.summary.agentTurns).toBe(1);
    expect(report.summary.toolCalls).toBe(1);
    expect(report.duration).toBe(2_000);
  });
});
