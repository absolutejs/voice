import { describe, expect, test } from "bun:test";
import { deriveVoiceRecordingRedactionRanges } from "../src/recordingRedaction";
import type { Transcript } from "../src/types";

const final = (
  text: string,
  startedAtMs?: number,
  endedAtMs?: number,
): Transcript => ({
  endedAtMs,
  id: `${text}-${startedAtMs ?? 0}`,
  isFinal: true,
  startedAtMs,
  text,
});

describe("deriveVoiceRecordingRedactionRanges", () => {
  test("flags transcripts containing PII patterns with the matching label", () => {
    const ranges = deriveVoiceRecordingRedactionRanges({
      paddingMs: 0,
      transcripts: [
        final("hi there", 1_000, 2_000),
        final("my card is 4242 4242 4242 4242", 2_500, 4_500),
        final("thanks", 4_700, 5_200),
      ],
    });
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({
      endMs: 4_500,
      label: "credit-card",
      startMs: 2_500,
    });
  });

  test("applies padding around the matched transcript", () => {
    const ranges = deriveVoiceRecordingRedactionRanges({
      paddingMs: 150,
      transcripts: [final("call 555-123-4567 tomorrow", 1_000, 3_000)],
    });
    expect(ranges[0]).toEqual({
      endMs: 3_150,
      label: "phone",
      startMs: 850,
    });
  });

  test("converts absolute epoch timestamps to recording-relative offsets", () => {
    const epoch = 1_710_000_000_000;
    const ranges = deriveVoiceRecordingRedactionRanges({
      paddingMs: 0,
      recordingStartedAtEpochMs: epoch,
      transcripts: [
        final("ssn 123-45-6789", epoch + 5_000, epoch + 7_000),
      ],
    });
    expect(ranges[0]).toEqual({
      endMs: 7_000,
      label: "ssn",
      startMs: 5_000,
    });
  });

  test("skips transcripts without timestamps", () => {
    const ranges = deriveVoiceRecordingRedactionRanges({
      transcripts: [final("user@example.com")],
    });
    expect(ranges).toEqual([]);
  });

  test("skips partial transcripts", () => {
    const partial: Transcript = {
      endedAtMs: 2_000,
      id: "p",
      isFinal: false,
      startedAtMs: 1_000,
      text: "my number is 415-555-1212",
    };
    const ranges = deriveVoiceRecordingRedactionRanges({
      transcripts: [partial],
    });
    expect(ranges).toEqual([]);
  });
});

describe("redactVoiceRecording", () => {
  test("bleeps the PCM ranges that match sensitive transcripts (silence default)", async () => {
    const { redactVoiceRecording } = await import("../src/recordingRedaction");
    const format = {
      channels: 1 as const,
      container: "raw" as const,
      encoding: "pcm_s16le" as const,
      sampleRateHz: 1_000,
    };
    // 5 seconds of constant tone at amplitude 1000.
    const samples = new Int16Array(5_000).fill(1_000);
    const result = redactVoiceRecording({
      format,
      paddingMs: 0,
      pcm: new Uint8Array(samples.buffer),
      transcripts: [
        final("my card is 4242 4242 4242 4242", 2_000, 3_000),
      ],
    });
    expect(result.redactedCount).toBe(1);
    const out = new Int16Array(
      result.bytes.buffer,
      result.bytes.byteOffset,
      result.bytes.byteLength / 2,
    );
    // Samples inside the 2000-3000ms window are zeroed; outside untouched.
    expect(out[1_500]).toBe(1_000);
    expect(out[2_500]).toBe(0);
    expect(out[3_500]).toBe(1_000);
  });

  test("returns the original audio when no transcript matches", async () => {
    const { redactVoiceRecording } = await import("../src/recordingRedaction");
    const format = {
      channels: 1 as const,
      container: "raw" as const,
      encoding: "pcm_s16le" as const,
      sampleRateHz: 1_000,
    };
    const samples = new Int16Array(2_000).fill(500);
    const result = redactVoiceRecording({
      format,
      pcm: new Uint8Array(samples.buffer),
      transcripts: [final("just a normal sentence", 0, 1_000)],
    });
    expect(result.redactedCount).toBe(0);
    const out = new Int16Array(
      result.bytes.buffer,
      result.bytes.byteOffset,
      result.bytes.byteLength / 2,
    );
    expect(out.every((sample) => sample === 500)).toBe(true);
  });

  test("tone fill writes a non-zero beep into the redacted window", async () => {
    const { redactVoiceRecording } = await import("../src/recordingRedaction");
    const sampleRateHz = 8_000;
    const format = {
      channels: 1 as const,
      container: "raw" as const,
      encoding: "pcm_s16le" as const,
      sampleRateHz,
    };
    // 3 seconds of silence so the 2000-3000ms window is in range.
    const samples = new Int16Array(sampleRateHz * 3).fill(0);
    const result = redactVoiceRecording({
      fill: { frequencyHz: 1_000, kind: "tone" },
      format,
      paddingMs: 0,
      pcm: new Uint8Array(samples.buffer),
      transcripts: [final("my card is 4242 4242 4242 4242", 2_000, 3_000)],
    });
    expect(result.redactedCount).toBe(1);
    const out = new Int16Array(
      result.bytes.buffer,
      result.bytes.byteOffset,
      result.bytes.byteLength / 2,
    );
    const startSample = (2_000 / 1_000) * sampleRateHz;
    const endSample = (3_000 / 1_000) * sampleRateHz;
    const redactedSlice = out.subarray(startSample, endSample);
    expect(redactedSlice.some((sample) => sample !== 0)).toBe(true);
    expect(out[startSample - 100]).toBe(0);
  });
});
