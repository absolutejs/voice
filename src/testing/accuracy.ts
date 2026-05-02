import { buildTurnText } from "../turnDetection";
import type { Transcript } from "../types";

export type VoiceTranscriptAccuracy = {
  actualText: string;
  charDistance: number;
  charErrorRate: number;
  expectedText: string;
  passesThreshold: boolean;
  threshold: number;
  wordDistance: number;
  wordErrorRate: number;
};

const normalizeAccuracyText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const levenshteinDistance = <T>(left: T[], right: T[]) => {
  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previous = new Array(right.length + 1).fill(0);
  const current = new Array(right.length + 1).fill(0);

  for (let column = 0; column <= right.length; column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;

    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;

      current[column] = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + substitutionCost,
      );
    }

    for (let column = 0; column <= right.length; column += 1) {
      previous[column] = current[column]!;
    }
  }

  return previous[right.length]!;
};

export const mergeFinalTranscriptText = (transcripts: Transcript[]) =>
  buildTurnText(
    transcripts.filter((transcript) => transcript.isFinal),
    "",
  );

export const scoreTranscriptAccuracy = (
  actualText: string,
  expectedText: string,
  threshold = 0.35,
): VoiceTranscriptAccuracy => {
  const normalizedActual = normalizeAccuracyText(actualText);
  const normalizedExpected = normalizeAccuracyText(expectedText);
  const actualWords = normalizedActual ? normalizedActual.split(" ") : [];
  const expectedWords = normalizedExpected ? normalizedExpected.split(" ") : [];
  const wordDistance = levenshteinDistance(actualWords, expectedWords);
  const charDistance = levenshteinDistance(
    Array.from(normalizedActual),
    Array.from(normalizedExpected),
  );
  const wordErrorRate =
    expectedWords.length > 0 ? wordDistance / expectedWords.length : 0;
  const charErrorRate =
    normalizedExpected.length > 0
      ? charDistance / normalizedExpected.length
      : 0;

  return {
    actualText: normalizedActual,
    charDistance,
    charErrorRate,
    expectedText: normalizedExpected,
    passesThreshold: wordErrorRate <= threshold,
    threshold,
    wordDistance,
    wordErrorRate,
  };
};
