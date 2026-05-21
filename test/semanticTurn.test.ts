import { describe, expect, test } from "bun:test";
import {
  createPunctuationSemanticTurnDetector,
  createRegexSemanticTurnDetector,
} from "../src/core/semanticTurn";
import type { Transcript } from "../src/core/types";

const finalTranscript = (text: string): Transcript => ({
  id: "t1",
  isFinal: true,
  text,
});

const baseInput = {
  silenceMs: 0,
  transcripts: [],
};

describe("createPunctuationSemanticTurnDetector", () => {
  test("ends turn on terminal punctuation with enough words", async () => {
    const detector = createPunctuationSemanticTurnDetector();
    const verdict = await detector.evaluate({
      ...baseInput,
      lastFinalTranscript: finalTranscript("I need help today."),
      partialText: "",
    });
    expect(verdict.endOfTurn).toBe(true);
    expect(verdict.reason).toBe("terminal-punctuation");
  });

  test("does not end turn below minPartialWords", async () => {
    const detector = createPunctuationSemanticTurnDetector({
      minPartialWords: 3,
    });
    const verdict = await detector.evaluate({
      ...baseInput,
      lastFinalTranscript: finalTranscript("OK."),
      partialText: "",
    });
    expect(verdict.endOfTurn).toBe(false);
    expect(verdict.reason).toBe("below-min-words");
  });

  test("does not end turn when last word is a filler", async () => {
    const detector = createPunctuationSemanticTurnDetector();
    const verdict = await detector.evaluate({
      ...baseInput,
      lastFinalTranscript: finalTranscript("I was thinking, um."),
      partialText: "",
    });
    expect(verdict.endOfTurn).toBe(false);
    expect(verdict.reason).toBe("trailing-filler");
  });

  test("does not end turn when missing terminal punctuation", async () => {
    const detector = createPunctuationSemanticTurnDetector();
    const verdict = await detector.evaluate({
      ...baseInput,
      lastFinalTranscript: finalTranscript("I am thinking about"),
      partialText: "",
    });
    expect(verdict.endOfTurn).toBe(false);
    expect(verdict.reason).toBe("no-terminal-punctuation");
  });

  test("prefers partialText over lastFinalTranscript when present", async () => {
    const detector = createPunctuationSemanticTurnDetector();
    const verdict = await detector.evaluate({
      ...baseInput,
      lastFinalTranscript: finalTranscript("just one"),
      partialText: "I am almost done with this thought.",
    });
    expect(verdict.endOfTurn).toBe(true);
  });
});

describe("createRegexSemanticTurnDetector", () => {
  test("ends turn when the pattern matches", async () => {
    const detector = createRegexSemanticTurnDetector({
      endPattern: /(?:thank you|goodbye|that's all)\b/iu,
    });
    const verdict = await detector.evaluate({
      ...baseInput,
      lastFinalTranscript: finalTranscript("Great, thank you"),
      partialText: "",
    });
    expect(verdict.endOfTurn).toBe(true);
  });

  test("does not end turn when the pattern misses", async () => {
    const detector = createRegexSemanticTurnDetector({
      endPattern: /thank you/iu,
    });
    const verdict = await detector.evaluate({
      ...baseInput,
      lastFinalTranscript: finalTranscript("Tell me more about that"),
      partialText: "",
    });
    expect(verdict.endOfTurn).toBe(false);
  });
});
