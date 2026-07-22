import { buildTurnText } from "../core/turnDetection";
import type { Transcript } from "../core/types";

export type VoiceTranscriptAccuracy = {
  actualText: string;
  charDistance: number;
  charErrorRate: number;
  expectedText: string;
  passesThreshold: boolean;
  threshold: number;
  wordDistance: number;
  wordErrorRate: number;
  alignment?: VoiceWordAlignment;
};

export type VoiceWordAlignmentOperation = {
  actual?: string;
  expected?: string;
  type: "correct" | "substitution" | "deletion" | "insertion";
};

export type VoiceWordAlignment = {
  correct: number;
  deletions: number;
  hypothesisWordCount: number;
  insertions: number;
  operations: VoiceWordAlignmentOperation[];
  referenceWordCount: number;
  sentenceError: boolean;
  substitutions: number;
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

export const alignTranscriptWords = (
  actualWords: string[],
  expectedWords: string[],
): VoiceWordAlignment => {
  const rows = expectedWords.length + 1;
  const columns = actualWords.length + 1;
  const costs = Array.from({ length: rows }, () =>
    new Array<number>(columns).fill(0),
  );
  for (let row = 0; row < rows; row += 1) costs[row]![0] = row;
  for (let column = 0; column < columns; column += 1)
    costs[0]![column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitution =
        costs[row - 1]![column - 1]! +
        (expectedWords[row - 1] === actualWords[column - 1] ? 0 : 1);
      costs[row]![column] = Math.min(
        substitution,
        costs[row - 1]![column]! + 1,
        costs[row]![column - 1]! + 1,
      );
    }
  }

  const operations: VoiceWordAlignmentOperation[] = [];
  let row = expectedWords.length;
  let column = actualWords.length;
  while (row > 0 || column > 0) {
    const expected = expectedWords[row - 1];
    const actual = actualWords[column - 1];
    if (
      row > 0 &&
      column > 0 &&
      expected === actual &&
      costs[row]![column] === costs[row - 1]![column - 1]
    ) {
      operations.push({ actual, expected, type: "correct" });
      row -= 1;
      column -= 1;
    } else if (
      row > 0 &&
      column > 0 &&
      costs[row]![column] === costs[row - 1]![column - 1]! + 1
    ) {
      operations.push({ actual, expected, type: "substitution" });
      row -= 1;
      column -= 1;
    } else if (
      row > 0 &&
      costs[row]![column] === costs[row - 1]![column]! + 1
    ) {
      operations.push({ expected, type: "deletion" });
      row -= 1;
    } else {
      operations.push({ actual, type: "insertion" });
      column -= 1;
    }
  }
  operations.reverse();
  const count = (type: VoiceWordAlignmentOperation["type"]) =>
    operations.filter((operation) => operation.type === type).length;
  const substitutions = count("substitution");
  const deletions = count("deletion");
  const insertions = count("insertion");
  return {
    correct: count("correct"),
    deletions,
    hypothesisWordCount: actualWords.length,
    insertions,
    operations,
    referenceWordCount: expectedWords.length,
    sentenceError: substitutions + deletions + insertions > 0,
    substitutions,
  };
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
  const alignment = alignTranscriptWords(actualWords, expectedWords);
  const wordDistance =
    alignment.substitutions + alignment.deletions + alignment.insertions;
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
    alignment,
    charDistance,
    charErrorRate,
    expectedText: normalizedExpected,
    passesThreshold: wordErrorRate <= threshold,
    threshold,
    wordDistance,
    wordErrorRate,
  };
};
