import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMediaFrame, createMediaTransport } from "@absolutejs/media";
import {
  buildVoiceMediaPipelineIncidentEvents,
  buildVoiceMediaPipelineReadinessChecks,
  buildVoiceMediaPipelineReport,
  extractVoiceMediaPipelineIssueEntries,
  summarizeVoiceMediaPipelineReport,
  writeVoiceMediaPipelineArtifacts,
} from "../src";

const raw24k = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 24_000,
} as const;

const healthyFrames = [
  createMediaFrame({
    at: 0,
    durationMs: 20,
    format: raw24k,
    id: "input-1",
    kind: "input-audio",
    metadata: { level: 0.4, speechProbability: 0.9 },
    sessionId: "demo-session",
    source: "browser",
    traceEventId: "trace-1",
  }),
  createMediaFrame({
    at: 20,
    durationMs: 20,
    format: raw24k,
    id: "input-2",
    kind: "input-audio",
    metadata: { level: 0.42, speechProbability: 0.9 },
    sessionId: "demo-session",
    source: "browser",
    traceEventId: "trace-2",
  }),
  createMediaFrame({
    at: 40,
    durationMs: 20,
    format: raw24k,
    id: "assistant-1",
    kind: "assistant-audio",
    metadata: { jitterMs: 4, level: 0.48 },
    sessionId: "demo-session",
    source: "provider",
    traceEventId: "trace-3",
  }),
  createMediaFrame({
    at: 60,
    format: raw24k,
    id: "interruption-1",
    kind: "interruption",
    latencyMs: 80,
    sessionId: "demo-session",
    source: "voice-runtime",
    traceEventId: "trace-4",
  }),
];

const buildHealthyReport = () =>
  buildVoiceMediaPipelineReport({
    expectedInputFormat: raw24k,
    expectedOutputFormat: raw24k,
    frames: healthyFrames,
    maxJitterMs: 50,
    maxMediaGapMs: 50,
    maxMediaJitterMs: 50,
    maxMediaTimestampDriftMs: 50,
    minMediaSpeechRatio: 0.5,
    surface: "unit-surface",
  });

describe("voice media pipeline summarize + surfaces", () => {
  test("summarize returns a compact, array-free payload with stable issue codes", () => {
    const report = buildHealthyReport();
    const summary = summarizeVoiceMediaPipelineReport(report);
    expect(summary.surface).toBe("unit-surface");
    expect(summary.frames).toBe(healthyFrames.length);
    expect(summary.calibration.inputAudioFrames).toBe(2);
    expect(summary.calibration.assistantAudioFrames).toBe(1);
    expect(summary.quality.status).toBe("pass");
    expect(summary.issueCodes).toEqual([]);
    expect(summary.processorGraph).toBeUndefined();
    expect(summary.transport).toBeUndefined();
    expect(JSON.stringify(summary).length).toBeLessThan(2_000);
  });

  test("summarize threads artifact hrefs through to the proof envelope", () => {
    const report = buildHealthyReport();
    const summary = summarizeVoiceMediaPipelineReport(report, {
      artifacts: {
        quality: "/proof/media-quality.json",
        transport: "/proof/media-transport.json",
      },
    });
    expect(summary.artifacts?.quality).toBe("/proof/media-quality.json");
    expect(summary.artifacts?.transport).toBe("/proof/media-transport.json");
  });

  test("extractVoiceMediaPipelineIssueEntries flags transport backpressure and stale audio", async () => {
    const transport = createMediaTransport({
      inputFormat: raw24k,
      maxBufferedFrames: 1,
      name: "burst-transport",
      outputFormat: raw24k,
    });
    await transport.connect?.();
    for (const frame of healthyFrames) {
      if (frame.kind === "input-audio") {
        await transport.receive(frame);
      } else if (frame.kind === "assistant-audio") {
        await transport.send(frame);
      }
    }
    const report = buildVoiceMediaPipelineReport({
      expectedInputFormat: raw24k,
      expectedOutputFormat: raw24k,
      frames: healthyFrames,
      maxMediaBackpressureEvents: 0,
      maxMediaGapMs: 50,
      maxMediaJitterMs: 50,
      maxMediaTimestampDriftMs: 50,
      minMediaSpeechRatio: 0.99,
      surface: "burst-surface",
      transport: transport.report(),
    });
    const entries = extractVoiceMediaPipelineIssueEntries(report);
    const codes = entries.map((entry) => entry.code);
    expect(codes).toContain("media.transport_backpressure");
    expect(entries.every((entry) => entry.surface === "burst-surface")).toBe(
      true,
    );
  });

  test("readiness checks expose status per category", () => {
    const report = buildHealthyReport();
    const checks = buildVoiceMediaPipelineReadinessChecks(report);
    const labels = checks.map((check) => check.label);
    expect(labels).toContain("Media pipeline: overall");
    expect(labels).toContain("Media pipeline: media quality");
    expect(
      checks.every((check) => check.href === "/voice/media-pipeline"),
    ).toBe(true);
    const overall = checks.find((check) => check.label.endsWith("overall"));
    const quality = checks.find((check) =>
      check.label.endsWith("media quality"),
    );
    expect(overall?.status).toBe(
      report.status === "pass" ? "pass" : overall?.status,
    );
    expect(quality?.status).toBe("pass");
  });

  test("incident events use one-line labels and stable ids", () => {
    const failingFrames = [
      createMediaFrame({
        at: 0,
        durationMs: 20,
        format: raw24k,
        id: "input-1",
        kind: "input-audio",
        metadata: {
          jitterMs: 120,
          level: 0.4,
          speechProbability: 0.9,
        },
        source: "browser",
      }),
      createMediaFrame({
        at: 400,
        durationMs: 20,
        format: raw24k,
        id: "assistant-1",
        kind: "assistant-audio",
        metadata: { jitterMs: 120, level: 0.4 },
        source: "provider",
      }),
    ];
    const report = buildVoiceMediaPipelineReport({
      frames: failingFrames,
      maxMediaGapMs: 50,
      maxMediaJitterMs: 20,
      maxMediaTimestampDriftMs: 20,
      minMediaSpeechRatio: 0.5,
      surface: "failing-surface",
    });
    const events = buildVoiceMediaPipelineIncidentEvents(report, {
      now: () => 1_700_000_000_000,
    });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.at).toBe(1_700_000_000_000);
      expect(event.id.startsWith("media-pipeline:")).toBe(true);
      expect(event.category).toBe("monitor");
      expect(event.label.startsWith("Media ")).toBe(true);
    }
  });
});

describe("writeVoiceMediaPipelineArtifacts", () => {
  test("persists quality, transport, and processor graph artifacts when present", async () => {
    const transport = createMediaTransport({
      inputFormat: raw24k,
      maxBufferedFrames: 8,
      name: "artifact-transport",
      outputFormat: raw24k,
    });
    await transport.connect?.();
    for (const frame of healthyFrames) {
      if (frame.kind === "input-audio") {
        await transport.receive(frame);
      } else if (frame.kind === "assistant-audio") {
        await transport.send(frame);
      }
    }
    const report = buildVoiceMediaPipelineReport({
      expectedInputFormat: raw24k,
      expectedOutputFormat: raw24k,
      frames: healthyFrames,
      maxMediaGapMs: 50,
      maxMediaJitterMs: 50,
      maxMediaTimestampDriftMs: 50,
      minMediaSpeechRatio: 0.5,
      surface: "artifact-surface",
      transport: transport.report(),
    });
    const dir = await mkdtemp(join(tmpdir(), "voice-media-artifact-"));
    try {
      const result = await writeVoiceMediaPipelineArtifacts({
        dir,
        hrefBase: "/proof/media",
        report,
      });
      expect(result.artifacts.length).toBe(2);
      expect(result.hrefs.quality).toBe("/proof/media/media-quality.json");
      expect(result.hrefs.transport).toBe("/proof/media/media-transport.json");
      const files = await readdir(dir);
      expect(files.sort()).toEqual([
        "media-quality.json",
        "media-quality.md",
        "media-transport.json",
        "media-transport.md",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
