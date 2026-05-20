import { describe, expect, test } from "bun:test";
import {
  VOICE_ZERO_DATA_RETENTION_REDACTION_MARKER,
  createVoiceZeroDataRetentionPolicy,
  isVoiceZeroDataRetentionActive,
  scrubVoiceTraceForZeroDataRetention,
  scrubVoiceTurnForZeroDataRetention,
  shouldRetainVoiceRecording,
  shouldRetainVoiceTranscript,
  type VoiceTurnRecord,
} from "../src";

const turn = (): VoiceTurnRecord => ({
  assistantText: "Sure, your card ending 4242 is on file.",
  attachments: [{ kind: "image", url: "https://x/y.png" } as never],
  citations: [{ chunkId: "c1", score: 0.9, title: "Doc" }],
  committedAt: 1,
  id: "t1",
  text: "my card is 4242 4242 4242 4242",
  transcripts: [
    { id: "s1", isFinal: true, text: "my card is 4242 4242 4242 4242" },
  ],
});

describe("createVoiceZeroDataRetentionPolicy", () => {
  test("defaults to off and retains everything", () => {
    const policy = createVoiceZeroDataRetentionPolicy();
    expect(policy.mode).toBe("off");
    expect(isVoiceZeroDataRetentionActive(policy)).toBe(false);
    expect(shouldRetainVoiceRecording(policy)).toBe(true);
    expect(shouldRetainVoiceTranscript(policy)).toBe(true);
  });

  test("strict mode retains nothing and is active", () => {
    const policy = createVoiceZeroDataRetentionPolicy({ mode: "strict" });
    expect(isVoiceZeroDataRetentionActive(policy)).toBe(true);
    expect(shouldRetainVoiceRecording(policy)).toBe(false);
    expect(shouldRetainVoiceTranscript(policy)).toBe(false);
  });

  test("custom mode applies per-flag overrides", () => {
    const policy = createVoiceZeroDataRetentionPolicy({
      mode: "custom",
      retain: { recordings: false, transcriptText: true },
    });
    expect(isVoiceZeroDataRetentionActive(policy)).toBe(true);
    expect(shouldRetainVoiceRecording(policy)).toBe(false);
    expect(shouldRetainVoiceTranscript(policy)).toBe(true);
  });
});

describe("scrubVoiceTurnForZeroDataRetention", () => {
  test("off policy returns the turn untouched", () => {
    const original = turn();
    const result = scrubVoiceTurnForZeroDataRetention(
      original,
      createVoiceZeroDataRetentionPolicy(),
    );
    expect(result).toBe(original);
  });

  test("strict policy redacts text + assistant text and drops metadata", () => {
    const result = scrubVoiceTurnForZeroDataRetention(
      turn(),
      createVoiceZeroDataRetentionPolicy({ mode: "strict" }),
    );
    expect(result.text).toBe(VOICE_ZERO_DATA_RETENTION_REDACTION_MARKER);
    expect(result.assistantText).toBe(
      VOICE_ZERO_DATA_RETENTION_REDACTION_MARKER,
    );
    expect(result.transcripts[0]!.text).toBe(
      VOICE_ZERO_DATA_RETENTION_REDACTION_MARKER,
    );
    expect(result.attachments).toBeUndefined();
    // structural fields preserved
    expect(result.id).toBe("t1");
    expect(result.transcripts).toHaveLength(1);
    expect(result.citations).toEqual([
      { chunkId: "c1", score: 0.9, title: "Doc" },
    ]);
  });

  test("custom policy keeps transcripts while dropping metadata", () => {
    const result = scrubVoiceTurnForZeroDataRetention(
      turn(),
      createVoiceZeroDataRetentionPolicy({
        mode: "custom",
        retain: { metadata: false, transcriptText: true },
      }),
    );
    expect(result.text).toBe("my card is 4242 4242 4242 4242");
    expect(result.transcripts[0]!.text).toBe("my card is 4242 4242 4242 4242");
    expect(result.attachments).toBeUndefined();
  });
});

describe("scrubVoiceTraceForZeroDataRetention", () => {
  const event = () => ({
    at: 1,
    payload: { kept: 7, text: "the caller said xyz" },
    sessionId: "s1",
    type: "turn.completed" as const,
  });

  test("masks string payload fields, preserves non-strings", () => {
    const result = scrubVoiceTraceForZeroDataRetention(
      event(),
      createVoiceZeroDataRetentionPolicy({ mode: "strict" }),
    );
    expect(result.payload.text).toBe(
      VOICE_ZERO_DATA_RETENTION_REDACTION_MARKER,
    );
    expect(result.payload.kept).toBe(7);
    expect(result.type).toBe("turn.completed");
  });

  test("leaves event untouched when traceText is retained", () => {
    const original = event();
    const result = scrubVoiceTraceForZeroDataRetention(
      original,
      createVoiceZeroDataRetentionPolicy({
        mode: "custom",
        retain: { recordings: false, traceText: true },
      }),
    );
    expect(result).toBe(original);
  });
});
