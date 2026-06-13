import { describe, expect, test } from "bun:test";
import { createAcousticBargeInDetector } from "../src/core/bargeInDetector";
import type { AudioFormat } from "../src/core/types";

const FORMAT: AudioFormat = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 16_000,
};

// Constant-level voiced PCM16 (amp 3000 ≈ 0.09, above the voiced floor).
const voiced = (ms: number) => {
  const samples = Math.round((ms / 1000) * FORMAT.sampleRateHz);
  return [new Uint8Array(new Int16Array(samples).fill(3000).buffer)];
};

describe("createAcousticBargeInDetector", () => {
  const detector = createAcousticBargeInDetector();

  test("sustained voiced speech cancels", () => {
    expect(
      detector.evaluate({
        isBackchannelByText: false,
        partialText: "so the thing is i really think we should look at",
        turnAudio: voiced(800),
        turnAudioFormat: FORMAT,
        wordCount: 10,
      }),
    ).toMatchObject({ reason: "acoustic_sustained", shouldCancel: true });
  });

  test("short known backchannel cue keeps talking", () => {
    expect(
      detector.evaluate({
        isBackchannelByText: true,
        partialText: "got it",
        turnAudio: voiced(300),
        turnAudioFormat: FORMAT,
        wordCount: 2,
      }),
    ).toMatchObject({ reason: "acoustic_backchannel", shouldCancel: false });
  });

  test("short utterance starting with an interruption cue cancels", () => {
    expect(
      detector.evaluate({
        isBackchannelByText: false,
        partialText: "wait hold on",
        turnAudio: voiced(350),
        turnAudioFormat: FORMAT,
        wordCount: 3,
      }),
    ).toMatchObject({ reason: "acoustic_interruption", shouldCancel: true });
  });

  test("short ambiguous non-cue HOLDS (keep talking, wait for persistence)", () => {
    expect(
      detector.evaluate({
        isBackchannelByText: false,
        partialText: "the data",
        turnAudio: voiced(300),
        turnAudioFormat: FORMAT,
        wordCount: 2,
      }),
    ).toMatchObject({ reason: "acoustic_hold", shouldCancel: false });
  });

  test("leading silence does not inflate a short cue to sustained", () => {
    const silence = [
      new Uint8Array(new Int16Array(1.5 * FORMAT.sampleRateHz).buffer),
    ];
    expect(
      detector.evaluate({
        isBackchannelByText: true,
        partialText: "got it",
        turnAudio: [...silence, ...voiced(300)],
        turnAudioFormat: FORMAT,
        wordCount: 2,
      }),
    ).toMatchObject({ reason: "acoustic_backchannel", shouldCancel: false });
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
        partialText: "wait i have a question",
        wordCount: 5,
      }),
    ).toMatchObject({ reason: "text_interruption", shouldCancel: true });
  });
});
