import { describe, expect, test } from "bun:test";
import {
  createVoiceBackchannelDriver,
  type VoiceBackchannelCue,
} from "../src/backchannel";

const collect = () => {
  const cues: VoiceBackchannelCue[] = [];
  return {
    cues,
    onCue: (cue: VoiceBackchannelCue) => {
      cues.push(cue);
    },
  };
};

describe("createVoiceBackchannelDriver", () => {
  test("fires no cue before minSpeechMs elapses", () => {
    const sink = collect();
    const driver = createVoiceBackchannelDriver({
      minSpeechMs: 1_000,
      onCue: sink.onCue,
    });
    driver.noteSpeech(0);
    driver.noteSpeech(500);
    expect(sink.cues).toHaveLength(0);
  });

  test("fires once after minSpeechMs of continuous speech", async () => {
    const sink = collect();
    const driver = createVoiceBackchannelDriver({
      cueIntervalMs: 500,
      cues: [{ text: "mm-hmm" }],
      minSpeechMs: 1_000,
      onCue: sink.onCue,
    });
    driver.noteSpeech(0);
    driver.noteSpeech(1_200);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(sink.cues).toHaveLength(1);
    expect(sink.cues[0]!.text).toBe("mm-hmm");
  });

  test("rotates through cue list across multiple firings", async () => {
    const sink = collect();
    const driver = createVoiceBackchannelDriver({
      cueIntervalMs: 500,
      cues: [{ text: "mm-hmm" }, { text: "I see" }, { text: "right" }],
      minSpeechMs: 1_000,
      onCue: sink.onCue,
    });
    driver.noteSpeech(0);
    driver.noteSpeech(1_200);
    await new Promise((resolve) => setTimeout(resolve, 5));
    driver.noteSpeech(1_800);
    await new Promise((resolve) => setTimeout(resolve, 5));
    driver.noteSpeech(2_400);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(sink.cues.map((cue) => cue.text)).toEqual([
      "mm-hmm",
      "I see",
      "right",
    ]);
  });

  test("respects cueIntervalMs between firings", async () => {
    const sink = collect();
    const driver = createVoiceBackchannelDriver({
      cueIntervalMs: 2_000,
      cues: [{ text: "a" }, { text: "b" }],
      minSpeechMs: 1_000,
      onCue: sink.onCue,
    });
    driver.noteSpeech(0);
    driver.noteSpeech(1_200);
    await new Promise((resolve) => setTimeout(resolve, 5));
    driver.noteSpeech(1_500);
    await new Promise((resolve) => setTimeout(resolve, 5));
    // second call is within cueInterval, should not fire
    expect(sink.cues).toHaveLength(1);
  });

  test("reset() clears the speech window", async () => {
    const sink = collect();
    const driver = createVoiceBackchannelDriver({
      cues: [{ text: "mm" }],
      minSpeechMs: 500,
      onCue: sink.onCue,
    });
    driver.noteSpeech(0);
    driver.noteSpeech(600);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(sink.cues).toHaveLength(1);
    driver.reset();
    driver.noteSpeech(700);
    expect(sink.cues).toHaveLength(1);
  });
});
