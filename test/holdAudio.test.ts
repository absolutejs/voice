import { describe, expect, test } from "bun:test";
import {
  createVoiceHoldAudioDriver,
  type VoiceHoldAudioCue,
} from "../src/holdAudio";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("createVoiceHoldAudioDriver", () => {
  test("fires no cue before thinkingThresholdMs has elapsed", async () => {
    const cues: VoiceHoldAudioCue[] = [];
    const driver = createVoiceHoldAudioDriver({
      onCue: (cue) => {
        cues.push(cue);
      },
      thinkingThresholdMs: 500,
    });
    driver.noteThinking();
    await sleep(100);
    expect(cues).toHaveLength(0);
    driver.noteResponse();
  });

  test("fires a cue once thinking duration crosses the threshold", async () => {
    const cues: VoiceHoldAudioCue[] = [];
    const driver = createVoiceHoldAudioDriver({
      cues: [{ text: "checking" }],
      onCue: (cue) => {
        cues.push(cue);
      },
      thinkingThresholdMs: 50,
    });
    driver.noteThinking();
    await sleep(120);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe("checking");
    driver.noteResponse();
  });

  test("respects cooldownMs between cues", async () => {
    const cues: VoiceHoldAudioCue[] = [];
    const driver = createVoiceHoldAudioDriver({
      cooldownMs: 300,
      cues: [{ text: "a" }, { text: "b" }],
      onCue: (cue) => {
        cues.push(cue);
      },
      thinkingThresholdMs: 50,
    });
    driver.noteThinking();
    await sleep(120);
    await sleep(180);
    expect(cues).toHaveLength(1);
    await sleep(250);
    expect(cues.length).toBeGreaterThanOrEqual(2);
    expect(cues.map((cue) => cue.text)).toEqual(["a", "b"]);
    driver.noteResponse();
  });

  test("noteResponse cancels pending cues", async () => {
    const cues: VoiceHoldAudioCue[] = [];
    const driver = createVoiceHoldAudioDriver({
      onCue: (cue) => {
        cues.push(cue);
      },
      thinkingThresholdMs: 80,
    });
    driver.noteThinking();
    driver.noteResponse();
    await sleep(120);
    expect(cues).toHaveLength(0);
  });

  test("reset clears all internal state", async () => {
    const cues: VoiceHoldAudioCue[] = [];
    const driver = createVoiceHoldAudioDriver({
      onCue: (cue) => {
        cues.push(cue);
      },
      thinkingThresholdMs: 30,
    });
    driver.noteThinking();
    await sleep(60);
    expect(cues).toHaveLength(1);
    driver.reset();
    driver.noteThinking();
    await sleep(60);
    expect(cues).toHaveLength(2);
    driver.noteResponse();
  });
});
