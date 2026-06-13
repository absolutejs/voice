import { describe, expect, test } from "bun:test";
import { createAcousticBargeInDetector } from "../src/core/bargeInDetector";
import type { AudioFormat } from "../src/core/types";

const FORMAT: AudioFormat = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 16_000,
};

// Constant-level PCM16: RMS == |amplitude| / 32768, duration == ms.
const pcm = (ms: number, amplitude: number) => {
  const samples = Math.round((ms / 1000) * FORMAT.sampleRateHz);
  const buf = new Int16Array(samples).fill(amplitude);
  return [new Uint8Array(buf.buffer)];
};

describe("createAcousticBargeInDetector", () => {
  const detector = createAcousticBargeInDetector();

  test("sustained speech cancels regardless of words", () => {
    const v = detector.evaluate({
      isBackchannelByText: false,
      partialText: "so the thing is i really think we should",
      turnAudio: pcm(800, 3000),
      turnAudioFormat: FORMAT,
      wordCount: 8,
    });
    expect(v).toMatchObject({
      reason: "acoustic_sustained",
      shouldCancel: true,
    });
  });

  test("short known cue keeps talking", () => {
    const v = detector.evaluate({
      isBackchannelByText: true,
      partialText: "mm hm",
      turnAudio: pcm(300, 3000),
      turnAudioFormat: FORMAT,
      wordCount: 2,
    });
    expect(v).toMatchObject({
      reason: "acoustic_backchannel",
      shouldCancel: false,
    });
  });

  test("short but loud onset cancels (emphatic interruption)", () => {
    const v = detector.evaluate({
      isBackchannelByText: false,
      partialText: "wait stop",
      turnAudio: pcm(300, 9000), // rms ~0.27 >= 0.16
      turnAudioFormat: FORMAT,
      wordCount: 2,
    });
    expect(v).toMatchObject({
      reason: "acoustic_emphatic",
      shouldCancel: true,
    });
  });

  test("short and quiet is incidental noise", () => {
    const v = detector.evaluate({
      isBackchannelByText: false,
      partialText: "uh",
      turnAudio: pcm(300, 500), // rms ~0.015 <= 0.035
      turnAudioFormat: FORMAT,
      wordCount: 1,
    });
    expect(v).toMatchObject({
      reason: "acoustic_noise_floor",
      shouldCancel: false,
    });
  });

  test("no audio defers to the text signal", () => {
    expect(
      detector.evaluate({
        isBackchannelByText: true,
        partialText: "got it",
        wordCount: 2,
      }),
    ).toMatchObject({ reason: "text_backchannel", shouldCancel: false });
    expect(
      detector.evaluate({
        isBackchannelByText: false,
        partialText: "actually i disagree",
        wordCount: 3,
      }),
    ).toMatchObject({ reason: "text_only", shouldCancel: true });
  });
});
