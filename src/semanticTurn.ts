import type { Transcript } from "./types";

export type VoiceSemanticTurnInput = {
  audioLevel?: number;
  lastFinalTranscript?: Transcript;
  partialText: string;
  silenceMs: number;
  transcripts: Transcript[];
};

export type VoiceSemanticTurnVerdict = {
  confidence?: number;
  endOfTurn: boolean;
  reason?: string;
};

export type VoiceSemanticTurnDetector = {
  evaluate: (
    input: VoiceSemanticTurnInput,
  ) => Promise<VoiceSemanticTurnVerdict> | VoiceSemanticTurnVerdict;
};

export type CreatePunctuationSemanticTurnDetectorOptions = {
  endPunctuation?: ReadonlyArray<string>;
  fillerWords?: ReadonlyArray<string>;
  minPartialWords?: number;
};

const DEFAULT_END_PUNCTUATION = [".", "?", "!"] as const;
const DEFAULT_FILLER_WORDS = [
  "uh",
  "um",
  "er",
  "ah",
  "like",
  "you know",
  "i mean",
  "well",
  "so",
] as const;

const stripTerminalPunctuation = (text: string) =>
  text.replace(/[\s.?!]+$/u, "").trim();

export const createPunctuationSemanticTurnDetector = (
  options: CreatePunctuationSemanticTurnDetectorOptions = {},
): VoiceSemanticTurnDetector => {
  const endPunctuation = options.endPunctuation ?? DEFAULT_END_PUNCTUATION;
  const fillerWords = (options.fillerWords ?? DEFAULT_FILLER_WORDS).map(
    (word) => word.toLowerCase(),
  );
  const minPartialWords = options.minPartialWords ?? 2;

  return {
    evaluate: ({ lastFinalTranscript, partialText }) => {
      const candidate =
        partialText.trim().length > 0
          ? partialText
          : (lastFinalTranscript?.text ?? "");
      const trimmed = candidate.trim();
      if (!trimmed) {
        return { endOfTurn: false, reason: "empty" };
      }
      const wordCount = trimmed.split(/\s+/u).filter(Boolean).length;
      if (wordCount < minPartialWords) {
        return { endOfTurn: false, reason: "below-min-words" };
      }
      const lastChar = trimmed.at(-1);
      const endsWithTerminal =
        typeof lastChar === "string" && endPunctuation.includes(lastChar);
      if (!endsWithTerminal) {
        return { endOfTurn: false, reason: "no-terminal-punctuation" };
      }
      const lastWord = stripTerminalPunctuation(trimmed)
        .split(/\s+/u)
        .at(-1)
        ?.toLowerCase();
      if (lastWord && fillerWords.includes(lastWord)) {
        return { endOfTurn: false, reason: "trailing-filler" };
      }
      return {
        confidence: 0.9,
        endOfTurn: true,
        reason: "terminal-punctuation",
      };
    },
  };
};

export type CreateRegexSemanticTurnDetectorOptions = {
  endPattern: RegExp;
  minPartialWords?: number;
};

export const createRegexSemanticTurnDetector = (
  options: CreateRegexSemanticTurnDetectorOptions,
): VoiceSemanticTurnDetector => {
  const minPartialWords = options.minPartialWords ?? 2;
  return {
    evaluate: ({ lastFinalTranscript, partialText }) => {
      const candidate =
        partialText.trim().length > 0
          ? partialText
          : (lastFinalTranscript?.text ?? "");
      const trimmed = candidate.trim();
      if (!trimmed) {
        return { endOfTurn: false, reason: "empty" };
      }
      const wordCount = trimmed.split(/\s+/u).filter(Boolean).length;
      if (wordCount < minPartialWords) {
        return { endOfTurn: false, reason: "below-min-words" };
      }
      const match = options.endPattern.exec(trimmed);
      if (!match) {
        return { endOfTurn: false, reason: "pattern-miss" };
      }
      return {
        endOfTurn: true,
        reason: "pattern-match",
      };
    },
  };
};
