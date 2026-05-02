import { expect, test } from "bun:test";
import {
  buildTurnText,
  measureAudioLevel,
  selectPreferredTranscriptText,
} from "../src/turnDetection";
import { createTranscript } from "../src/store";

test("buildTurnText collapses cumulative final transcripts", () => {
  const text = buildTurnText(
    [
      createTranscript("I am trying", { isFinal: true }),
      createTranscript("I am trying to see if this is working", {
        isFinal: true,
      }),
      createTranscript("I am trying to see if this is working", {
        id: "duplicate",
        isFinal: true,
      }),
    ],
    "",
  );

  expect(text).toBe("I am trying to see if this is working");
});

test("measureAudioLevel distinguishes silence from speech-like pcm", () => {
  const silence = new Int16Array(160).fill(0);
  const speech = new Int16Array(160).fill(18_000);

  expect(measureAudioLevel(silence)).toBe(0);
  expect(measureAudioLevel(speech)).toBeGreaterThan(0.1);
});

test("selectPreferredTranscriptText keeps the richer partial hypothesis", () => {
  expect(
    selectPreferredTranscriptText(
      "Go quietly alone no harm will befall you",
      "No harm will befall you",
    ),
  ).toBe("Go quietly alone no harm will befall you");

  expect(
    selectPreferredTranscriptText(
      "No harm will befall you",
      "Go quietly alone no harm will befall you",
    ),
  ).toBe("Go quietly alone no harm will befall you");

  expect(
    selectPreferredTranscriptText("Go quietly. Allow", "Go quietly, alone."),
  ).toBe("Go quietly, alone.");
});

test("buildTurnText merges timed final and partial fragments from one turn", () => {
  const text = buildTurnText(
    [
      createTranscript("Go quietly alone.", {
        endedAtMs: 3_120,
        isFinal: true,
        startedAtMs: 1_200,
      }),
    ],
    "No harm will befall you.",
    {
      partialStartedAtMs: 3_865,
    },
  );

  expect(text).toBe("Go quietly alone. No harm will befall you.");
});
