import { expect, test } from "bun:test";
import {
  assertVoiceLatencySLOGate,
  buildVoiceLatencySLOGate,
  createVoiceTraceEvent,
  renderVoiceLatencySLOMarkdown,
} from "../src";

const createLatencyEvents = () => [
  createVoiceTraceEvent({
    at: 100,
    payload: { stage: "speech_detected" },
    sessionId: "session-fast",
    turnId: "turn-1",
    type: "turn_latency.stage",
  }),
  createVoiceTraceEvent({
    at: 180,
    payload: { stage: "final_transcript" },
    sessionId: "session-fast",
    turnId: "turn-1",
    type: "turn_latency.stage",
  }),
  createVoiceTraceEvent({
    at: 250,
    payload: { stage: "turn_committed" },
    sessionId: "session-fast",
    turnId: "turn-1",
    type: "turn_latency.stage",
  }),
  createVoiceTraceEvent({
    at: 430,
    payload: { stage: "assistant_text_started" },
    sessionId: "session-fast",
    turnId: "turn-1",
    type: "turn_latency.stage",
  }),
  createVoiceTraceEvent({
    at: 460,
    payload: { stage: "tts_send_started" },
    sessionId: "session-fast",
    turnId: "turn-1",
    type: "turn_latency.stage",
  }),
  createVoiceTraceEvent({
    at: 620,
    payload: { stage: "tts_send_completed" },
    sessionId: "session-fast",
    turnId: "turn-1",
    type: "turn_latency.stage",
  }),
  createVoiceTraceEvent({
    at: 700,
    payload: { stage: "assistant_audio_received" },
    sessionId: "session-fast",
    turnId: "turn-1",
    type: "turn_latency.stage",
  }),
  createVoiceTraceEvent({
    at: 710,
    payload: {
      elapsedMs: 280,
      provider: "openai",
      providerStatus: "success",
    },
    sessionId: "session-fast",
    turnId: "turn-1",
    type: "assistant.run",
  }),
  createVoiceTraceEvent({
    at: 720,
    payload: {
      elapsedMs: 90,
      provider: "deepgram",
      providerStatus: "success",
    },
    sessionId: "session-fast",
    turnId: "turn-1",
    type: "turn.transcript",
  }),
  createVoiceTraceEvent({
    at: 730,
    payload: {
      latencyMs: 850,
      status: "assistant_audio_started",
    },
    sessionId: "session-fast",
    type: "client.live_latency",
  }),
  createVoiceTraceEvent({
    at: 740,
    payload: {
      latencyMs: 95,
    },
    sessionId: "session-fast",
    type: "client.barge_in",
  }),
];

test("buildVoiceLatencySLOGate evaluates turn provider live and interruption stages", async () => {
  const report = await buildVoiceLatencySLOGate({
    budgets: {
      live_latency: {
        failAfterMs: 1_200,
        warnAfterMs: 900,
      },
      provider_llm: {
        failAfterMs: 500,
        warnAfterMs: 350,
      },
      speech_to_commit: {
        failAfterMs: 400,
        warnAfterMs: 250,
      },
    },
    events: createLatencyEvents(),
    failAfterMs: 700,
    warnAfterMs: 500,
  });

  expect(report).toMatchObject({
    failed: 0,
    status: "pass",
    total: 10,
    warnings: 0,
  });
  expect(report.stages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        p95Ms: 150,
        stage: "speech_to_commit",
        status: "pass",
      }),
      expect.objectContaining({
        p95Ms: 280,
        stage: "provider_llm",
        status: "pass",
      }),
      expect.objectContaining({
        p95Ms: 850,
        stage: "live_latency",
        status: "pass",
      }),
      expect.objectContaining({
        p95Ms: 95,
        stage: "barge_in_stop",
        status: "pass",
      }),
    ]),
  );
  const markdown = renderVoiceLatencySLOMarkdown(report);
  expect(markdown).toContain("Voice Latency SLO Gate");
  expect(markdown).toContain("Browser live latency");
  expect(markdown).toContain("LLM provider latency");
});

test("assertVoiceLatencySLOGate throws with a report when a stage exceeds budget", async () => {
  await expect(
    assertVoiceLatencySLOGate({
      budgets: {
        provider_llm: {
          failAfterMs: 200,
          warnAfterMs: 150,
        },
      },
      events: createLatencyEvents(),
    }),
  ).rejects.toMatchObject({
    message: "Voice latency SLO gate failed with 1 failed measurement(s).",
    report: {
      failed: 1,
      status: "fail",
    },
  });
});
