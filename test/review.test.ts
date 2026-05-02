import { expect, test } from "bun:test";
import {
  createVoiceCallReviewRecorder,
  createVoiceCallReviewFromLiveTelephonyReport,
  renderVoiceCallReviewHTML,
  renderVoiceCallReviewMarkdown,
} from "../src/testing/review";

test("createVoiceCallReviewFromLiveTelephonyReport produces a compact review artifact", () => {
  const review = createVoiceCallReviewFromLiveTelephonyReport(
    {
      fixtures: [
        {
          actualText: "Go quietly alone. No harm will befall you.",
          clearLatencyMs: 0,
          elapsedMs: 7000,
          errors: [],
          expectedText: "GO QUIETLY ALONE NO HARM WILL BEFALL YOU",
          fixtureId: "quietly-alone-clean",
          firstOutboundMediaLatencyMs: 4493,
          firstTurnLatencyMs: 4112,
          markLatencyMs: 4112,
          outboundMediaCount: 5,
          passes: true,
          termRecall: 1,
          title: "Short clean utterance",
          turnCount: 1,
          wordErrorRate: 0,
        },
      ],
      generatedAt: 123,
      trace: [
        {
          atMs: 1200,
          event: "partial",
          source: "stt",
          text: "go quietly alone",
        },
        {
          atMs: 4112,
          event: "commit",
          source: "turn",
          text: "Go quietly alone. No harm will befall you.",
        },
        {
          atMs: 4493,
          event: "media",
          source: "twilio",
          bytes: 4096,
        },
      ],
      ttsConfig: {
        modelId: "eleven_flash_v2_5",
      },
      turnDetectionConfig: {
        silenceMs: 620,
      },
      variant: {
        description: "Deepgram Flux English conversational path",
        id: "flux-general-en",
        model: "flux-general-en",
      },
    },
    {
      path: "/tmp/report.json",
      preset: "pstn-fast",
    },
  );

  expect(review.summary.pass).toBe(true);
  expect(review.config?.preset).toBe("pstn-fast");
  expect(review.timeline).toHaveLength(3);
  expect(review.latencyBreakdown).toEqual([
    { label: "start to first partial", valueMs: 1200 },
    { label: "first partial to commit", valueMs: 2912 },
    { label: "commit to first outbound media", valueMs: 381 },
  ]);
  expect(review.notes).toContain('First partial: "go quietly alone"');
});

test("renderVoiceCallReviewMarkdown renders the main call review sections", () => {
  const markdown = renderVoiceCallReviewMarkdown({
    config: {
      preset: "pstn-balanced",
    },
    errors: [],
    fixtureId: "quietly-alone-clean",
    latencyBreakdown: [
      {
        label: "commit to first outbound media",
        valueMs: 381,
      },
    ],
    notes: ["Deepgram Flux English conversational path"],
    summary: {
      firstOutboundMediaLatencyMs: 4493,
      firstTurnLatencyMs: 4112,
      pass: true,
    },
    title: "Short clean utterance",
    timeline: [
      {
        atMs: 4112,
        event: "commit",
        source: "turn",
        text: "Go quietly alone. No harm will befall you.",
      },
    ],
    transcript: {
      actual: "Go quietly alone. No harm will befall you.",
      expected: "GO QUIETLY ALONE NO HARM WILL BEFALL YOU",
    },
  });

  expect(markdown).toContain("# Short clean utterance");
  expect(markdown).toContain("## Summary");
  expect(markdown).toContain("## Latency Breakdown");
  expect(markdown).toContain("## Timeline");
  expect(markdown).toContain("[turn] commit");
  expect(markdown).toContain("commit to first outbound media: 381ms");
  expect(markdown).toContain("pstn-balanced");
});

test("renderVoiceCallReviewHTML renders a portable debug page", () => {
  const html = renderVoiceCallReviewHTML({
    config: {
      preset: "pstn-balanced",
    },
    errors: [],
    fixtureId: "quietly-alone-clean",
    latencyBreakdown: [
      {
        label: "commit to first outbound media",
        valueMs: 381,
      },
    ],
    notes: ["Deepgram Flux English conversational path"],
    summary: {
      firstOutboundMediaLatencyMs: 4493,
      firstTurnLatencyMs: 4112,
      pass: true,
      turnCount: 1,
    },
    title: "Short clean utterance",
    timeline: [
      {
        atMs: 4112,
        event: "commit",
        source: "turn",
        text: "Go quietly alone. No harm will befall you.",
      },
    ],
    transcript: {
      actual: "Go quietly alone. No harm will befall you.",
      expected: "GO QUIETLY ALONE NO HARM WILL BEFALL YOU",
    },
  });

  expect(html).toContain("<!doctype html>");
  expect(html).toContain("Latency Breakdown");
  expect(html).toContain("Short clean utterance");
  expect(html).toContain("Go quietly alone. No harm will befall you.");
});

test("createVoiceCallReviewRecorder captures a real call timeline", () => {
  let now = 0;
  const recorder = createVoiceCallReviewRecorder({
    config: {
      preset: "pstn-balanced",
    },
    fixtureId: "call-123",
    now: () => now,
    title: "Telephony call",
  });

  recorder.recordTwilioInbound({
    event: "start",
    text: "session-123",
  });
  now = 1200;
  recorder.recordVoiceMessage({
    type: "partial",
    transcript: {
      id: "partial-1",
      text: "go quietly",
      isFinal: false,
      confidence: 0.9,
    },
  });
  now = 4100;
  recorder.recordVoiceMessage({
    type: "turn",
    turn: {
      id: "turn-1",
      text: "Go quietly alone.",
      receivedAt: 4100,
      quality: {
        averageConfidence: 0.95,
      },
    },
  });
  now = 4500;
  recorder.recordVoiceMessage({
    type: "audio",
    chunkBase64: "AAAA",
    format: {
      channels: 1,
      container: "raw",
      encoding: "pcm_s16le",
      sampleRateHz: 16000,
    },
    receivedAt: 4500,
  });
  now = 4550;
  recorder.recordTwilioOutbound({
    bytes: 3200,
    event: "media",
    track: "outbound",
  });
  now = 5000;

  const artifact = recorder.finalize();

  expect(artifact.title).toBe("Telephony call");
  expect(artifact.fixtureId).toBe("call-123");
  expect(artifact.summary.pass).toBe(true);
  expect(artifact.summary.firstTurnLatencyMs).toBe(4100);
  expect(artifact.summary.firstOutboundMediaLatencyMs).toBe(4550);
  expect(artifact.transcript.actual).toBe("Go quietly alone.");
  expect(artifact.latencyBreakdown).toEqual([
    { label: "start to first partial", valueMs: 1200 },
    { label: "first partial to commit", valueMs: 2900 },
    { label: "commit to first TTS audio", valueMs: 400 },
    { label: "commit to first outbound media", valueMs: 450 },
  ]);
});
