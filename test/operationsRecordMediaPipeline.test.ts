import { expect, test } from "bun:test";
import { createMediaFrame } from "@absolutejs/media";
import {
  buildVoiceFailureReplay,
  buildVoiceMediaPipelineIncidentEvents,
  buildVoiceMediaPipelineReport,
  buildVoiceOperationsRecord,
  createVoiceMemoryTraceEventStore,
  createVoiceTraceEvent,
  renderVoiceFailureReplayMarkdown,
} from "../src";

const raw24k = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 24_000,
} as const;

const buildFailingPipelineReport = () =>
  buildVoiceMediaPipelineReport({
    frames: [
      createMediaFrame({
        at: 0,
        durationMs: 20,
        format: raw24k,
        id: "input-1",
        kind: "input-audio",
        metadata: { jitterMs: 120, level: 0.4, speechProbability: 0.9 },
        sessionId: "session-media",
        source: "browser",
      }),
      createMediaFrame({
        at: 400,
        durationMs: 20,
        format: raw24k,
        id: "assistant-1",
        kind: "assistant-audio",
        metadata: { jitterMs: 120, level: 0.4 },
        sessionId: "session-media",
        source: "provider",
      }),
    ],
    maxMediaGapMs: 50,
    maxMediaJitterMs: 20,
    maxMediaTimestampDriftMs: 20,
    minMediaSpeechRatio: 0.5,
    surface: "test-surface",
  });

test("buildVoiceOperationsRecord projects media pipeline issue codes into the record", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  await trace.append(
    createVoiceTraceEvent({
      payload: {},
      sessionId: "session-media",
      type: "session.start",
    }),
  );
  const mediaPipeline = buildFailingPipelineReport();
  const record = await buildVoiceOperationsRecord({
    mediaPipeline,
    sessionId: "session-media",
    store: trace,
  });
  expect(record.mediaPipeline).toBeDefined();
  expect(record.mediaPipeline?.surface).toBe("test-surface");
  expect(record.mediaPipeline?.issueCodes.length).toBeGreaterThan(0);
  expect(record.mediaPipeline?.issueCodes).toContain("media.quality_jitter");
  expect(record.mediaPipeline?.qualityStatus).not.toBe("pass");
});

test("buildVoiceOperationsRecord omits mediaPipeline when no report provided", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  await trace.append(
    createVoiceTraceEvent({
      payload: {},
      sessionId: "session-media",
      type: "session.start",
    }),
  );
  const record = await buildVoiceOperationsRecord({
    sessionId: "session-media",
    store: trace,
  });
  expect(record.mediaPipeline).toBeUndefined();
});

test("buildVoiceFailureReplay attaches pipeline codes and demotes status", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  await trace.append(
    createVoiceTraceEvent({
      payload: {},
      sessionId: "session-media",
      type: "session.start",
    }),
  );
  const mediaPipeline = buildFailingPipelineReport();
  const record = await buildVoiceOperationsRecord({
    mediaPipeline,
    sessionId: "session-media",
    store: trace,
  });
  const replay = buildVoiceFailureReplay(record);
  expect(replay.media.pipelineIssueCodes.length).toBeGreaterThan(0);
  expect(replay.media.pipelineIssueCodes).toContain("media.quality_jitter");
  expect(replay.media.pipelineStatus).toBe(mediaPipeline.status);
  expect(replay.status).not.toBe("healthy");
  const containsCode = replay.summary.issues.some((issue) =>
    issue.includes("media.quality_jitter"),
  );
  expect(containsCode).toBe(true);
  const markdown = renderVoiceFailureReplayMarkdown(replay);
  expect(markdown).toContain("Media Pipeline (status: ");
  expect(markdown).toContain("media.quality_jitter");
});

test("buildVoiceMediaPipelineIncidentEvents output feeds incident-timeline extraEvents shape", () => {
  const mediaPipeline = buildFailingPipelineReport();
  const events = buildVoiceMediaPipelineIncidentEvents(mediaPipeline, {
    now: () => 1_700_000_000_000,
    source: "media-pipeline-test",
  });
  expect(events.length).toBeGreaterThan(0);
  for (const event of events) {
    expect(event.at).toBe(1_700_000_000_000);
    expect(event.id.startsWith("media-pipeline:")).toBe(true);
    expect(event.source).toBe("media-pipeline-test");
    expect(event.category).toBe("monitor");
  }
});
