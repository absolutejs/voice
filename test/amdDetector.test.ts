import { describe, expect, test } from "bun:test";
import { createMonologueAMDDetector } from "../src/amdDetector";
import type { VoiceSessionRecord } from "../src/types";

const baseSession: VoiceSessionRecord = {
  committedTurnIds: [],
  createdAt: 0,
  currentTurn: {
    finalText: "",
    partialText: "",
    transcripts: [],
  },
  id: "session-amd",
  reconnect: { attempts: 0 },
  status: "active",
  transcripts: [],
  turns: [],
};

const baseInput = {
  api: {} as never,
  audioLevel: undefined,
  partialTranscript: "",
  session: baseSession,
  transcripts: [],
};

describe("createMonologueAMDDetector", () => {
  test("returns undefined before the threshold", async () => {
    const detector = createMonologueAMDDetector({ minMonologueMs: 5_000 });
    const verdict = await detector.evaluate({
      ...baseInput,
      elapsedSinceFirstAudioMs: 2_000,
      elapsedSinceLastTurnCommitMs: 2_000,
    });
    expect(verdict).toBeUndefined();
  });

  test("flags voicemail once monologue exceeds threshold with no turns committed", async () => {
    const detector = createMonologueAMDDetector({ minMonologueMs: 5_000 });
    const verdict = await detector.evaluate({
      ...baseInput,
      elapsedSinceFirstAudioMs: 6_000,
      elapsedSinceLastTurnCommitMs: 0,
    });
    expect(verdict).toBeDefined();
    expect(verdict?.metadata).toMatchObject({ detector: "monologue" });
  });

  test("uses elapsedSinceLastTurnCommit when turns have been committed", async () => {
    const detector = createMonologueAMDDetector({ minMonologueMs: 5_000 });
    const verdict = await detector.evaluate({
      ...baseInput,
      elapsedSinceFirstAudioMs: 30_000,
      elapsedSinceLastTurnCommitMs: 1_000,
      session: {
        ...baseSession,
        turns: [
          {
            committedAt: Date.now(),
            id: "t1",
            text: "hi",
            transcripts: [],
          },
        ],
      },
    });
    expect(verdict).toBeUndefined();
  });

  test("does not fire before any user audio when requireFirstAudio is true", async () => {
    const detector = createMonologueAMDDetector({
      minMonologueMs: 5_000,
      requireFirstAudio: true,
    });
    const verdict = await detector.evaluate({
      ...baseInput,
      elapsedSinceFirstAudioMs: 0,
      elapsedSinceLastTurnCommitMs: 30_000,
    });
    expect(verdict).toBeUndefined();
  });
});
