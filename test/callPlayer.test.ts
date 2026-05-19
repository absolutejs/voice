import { describe, expect, test } from "bun:test";
import {
  createVoiceCallPlayer,
  formatVoiceCallPlayerTimestamp,
} from "../src/client/callPlayer";
import type { Transcript } from "../src/types";

const final = (
  id: string,
  text: string,
  startedAtMs: number,
  endedAtMs: number,
): Transcript => ({
  endedAtMs,
  id,
  isFinal: true,
  startedAtMs,
  text,
});

describe("createVoiceCallPlayer", () => {
  test("seekMs flips the active transcript to the one covering the position", () => {
    const player = createVoiceCallPlayer({
      transcripts: [
        final("t1", "hello", 0, 1_500),
        final("t2", "there", 1_800, 3_500),
        final("t3", "world", 4_000, 5_000),
      ],
    });
    player.setDuration(5_000);
    player.seekMs(2_000);
    expect(player.getState().activeTranscriptId).toBe("t2");
    expect(player.getState().activeTranscriptIndex).toBe(1);
  });

  test("seekToTranscript moves currentTimeMs to that transcript's start", () => {
    const player = createVoiceCallPlayer({
      transcripts: [
        final("t1", "hi", 0, 800),
        final("t2", "there", 1_000, 2_500),
      ],
    });
    player.setDuration(3_000);
    player.seekToTranscript("t2");
    expect(player.getState().currentTimeMs).toBe(1_000);
    expect(player.getState().activeTranscriptId).toBe("t2");
  });

  test("converts absolute epoch timestamps to playback-relative offsets", () => {
    const epoch = 1_710_000_000_000;
    const player = createVoiceCallPlayer({
      recordingStartedAtEpochMs: epoch,
      transcripts: [final("t1", "hi", epoch + 200, epoch + 1_500)],
    });
    player.setDuration(2_000);
    player.seekMs(300);
    expect(player.getState().activeTranscriptId).toBe("t1");
  });

  test("setTime updates currentTimeMs and triggers active-transcript refresh", () => {
    const player = createVoiceCallPlayer({
      transcripts: [final("t1", "hi", 100, 200), final("t2", "hi2", 500, 700)],
    });
    player.setDuration(1_000);
    player.setTime(600);
    expect(player.getState().activeTranscriptId).toBe("t2");
  });

  test("clamps seek to [0, duration]", () => {
    const player = createVoiceCallPlayer({});
    player.setDuration(5_000);
    player.seekMs(-100);
    expect(player.getState().currentTimeMs).toBe(0);
    player.seekMs(10_000);
    expect(player.getState().currentTimeMs).toBe(5_000);
  });

  test("playbackRate clamps to [0.25, 4]", () => {
    const player = createVoiceCallPlayer({});
    player.setPlaybackRate(10);
    expect(player.getState().playbackRate).toBe(4);
    player.setPlaybackRate(0.1);
    expect(player.getState().playbackRate).toBe(0.25);
  });

  test("subscribe fires on each state change", () => {
    const player = createVoiceCallPlayer({});
    let fires = 0;
    player.subscribe(() => {
      fires += 1;
    });
    player.setDuration(1_000);
    player.setTime(500);
    expect(fires).toBeGreaterThanOrEqual(2);
  });

  test("setPlaying is idempotent (no notify on same value)", () => {
    const player = createVoiceCallPlayer({});
    let fires = 0;
    player.subscribe(() => {
      fires += 1;
    });
    player.setPlaying(false);
    expect(fires).toBe(0);
  });
});

describe("formatVoiceCallPlayerTimestamp", () => {
  test("formats ms as mm:ss", () => {
    expect(formatVoiceCallPlayerTimestamp(0)).toBe("00:00");
    expect(formatVoiceCallPlayerTimestamp(45_000)).toBe("00:45");
    expect(formatVoiceCallPlayerTimestamp(90_000)).toBe("01:30");
    expect(formatVoiceCallPlayerTimestamp(-100)).toBe("00:00");
  });
});
