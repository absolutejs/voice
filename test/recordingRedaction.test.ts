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
