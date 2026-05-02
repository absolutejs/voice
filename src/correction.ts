import type {
  Transcript,
  VoiceCorrectionRiskTier,
  VoiceDomainTerm,
  VoiceLexiconEntry,
  VoicePhraseHint,
  VoiceTurnCorrectionHandler,
} from "./types";

export type VoicePhraseHintCorrectionMatch = {
  alias: string;
  hint: VoicePhraseHint;
};

export type VoicePhraseHintCorrectionResult = {
  changed: boolean;
  matches: VoicePhraseHintCorrectionMatch[];
  text: string;
};

export type VoicePhraseHintCorrectionOptions = {
  provider?: string;
  reason?: string;
};

export type VoiceLexiconCorrectionOptions = VoicePhraseHintCorrectionOptions;

export type VoiceDomainHintGenerationOptions = {
  riskTier?: VoiceCorrectionRiskTier;
};

export type VoiceRiskyTurnCorrectionHandlerOptions =
  VoicePhraseHintCorrectionOptions & {
    maxAverageConfidence?: number;
    riskTier?: Exclude<VoiceCorrectionRiskTier, "safe">;
  };

export type VoicePhraseHintCorrectionRunOptions = {
  riskTier?: VoiceCorrectionRiskTier;
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildAliasMatcher = (alias: string) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}'])${escapeRegExp(alias)}(?![\\p{L}\\p{N}'])`,
    "giu",
  );

const WORD_PATTERN = /[\p{L}\p{N}']+/gu;

const normalizeComparableText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeDomainTerm = (value: string) => normalizeComparableText(value);

type TokenMatch = {
  end: number;
  start: number;
  text: string;
};

const tokenizeWithIndices = (value: string) => {
  const matches = value.matchAll(WORD_PATTERN);
  const tokens: TokenMatch[] = [];

  for (const match of matches) {
    const token = match[0];
    const start = match.index ?? -1;
    if (start < 0) {
      continue;
    }

    tokens.push({
      end: start + token.length,
      start,
      text: token,
    });
  }

  return tokens;
};

const levenshteinDistance = (left: string, right: string) => {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + cost,
      );
    }

    for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) {
      previous[rightIndex] = current[rightIndex]!;
    }
  }

  return previous[right.length]!;
};

const canUseFuzzyAlias = (alias: string) =>
  normalizeComparableText(alias)
    .split(" ")
    .filter((token) => token.length > 0).length >= 2;

const resolveFuzzyThreshold = (riskTier: VoiceCorrectionRiskTier) => {
  switch (riskTier) {
    case "safe":
      return -1;
    case "balanced":
      return 0.14;
    case "risky":
      return 0.2;
  }
};

const canUseTieredFuzzyAlias = (
  alias: string,
  riskTier: VoiceCorrectionRiskTier,
) => {
  if (riskTier === "safe") {
    return false;
  }

  const tokenCount = normalizeComparableText(alias)
    .split(" ")
    .filter((token) => token.length > 0).length;

  return riskTier === "balanced" ? tokenCount >= 3 : tokenCount >= 2;
};

const findFuzzyAliasMatch = (
  text: string,
  alias: string,
  riskTier: VoiceCorrectionRiskTier,
) => {
  const tokens = tokenizeWithIndices(text);
  const aliasTokens = normalizeComparableText(alias)
    .split(" ")
    .filter((token) => token.length > 0);

  if (tokens.length === 0 || aliasTokens.length < 2) {
    return;
  }

  const minWindowLength = Math.max(1, aliasTokens.length - 1);
  const maxWindowLength = Math.min(tokens.length, aliasTokens.length + 1);
  const normalizedAlias = aliasTokens.join(" ");
  const normalizedAliasFirstToken = aliasTokens[0] ?? "";
  let bestMatch:
    | {
        end: number;
        score: number;
        start: number;
      }
    | undefined;

  for (let startIndex = 0; startIndex < tokens.length; startIndex += 1) {
    for (
      let windowLength = minWindowLength;
      windowLength <= maxWindowLength;
      windowLength += 1
    ) {
      const endIndex = startIndex + windowLength - 1;
      if (endIndex >= tokens.length) {
        break;
      }

      const windowTokens = tokens.slice(startIndex, endIndex + 1);
      const normalizedWindow = normalizeComparableText(
        windowTokens.map((token) => token.text).join(" "),
      );
      if (!normalizedWindow) {
        continue;
      }

      const [windowFirstToken] = normalizedWindow.split(" ");
      if (windowFirstToken !== normalizedAliasFirstToken) {
        continue;
      }

      const distance = levenshteinDistance(normalizedWindow, normalizedAlias);
      const denominator = Math.max(
        normalizedWindow.length,
        normalizedAlias.length,
      );
      const score = denominator > 0 ? distance / denominator : 0;

      if (score > resolveFuzzyThreshold(riskTier)) {
        continue;
      }

      const candidate = {
        end: windowTokens[windowTokens.length - 1]!.end,
        score,
        start: windowTokens[0]!.start,
      };

      if (
        !bestMatch ||
        candidate.score < bestMatch.score ||
        (candidate.score === bestMatch.score &&
          candidate.end - candidate.start > bestMatch.end - bestMatch.start)
      ) {
        bestMatch = candidate;
      }
    }
  }

  return bestMatch;
};

const normalizeHintAliases = (hint: VoicePhraseHint) =>
  (hint.aliases ?? [])
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0)
    .sort((left, right) => right.length - left.length);

export const applyPhraseHintCorrections = (
  text: string,
  phraseHints: VoicePhraseHint[],
): VoicePhraseHintCorrectionResult => {
  return applyRiskTieredPhraseHintCorrections(text, phraseHints, {
    riskTier: "risky",
  });
};

export const applyRiskTieredPhraseHintCorrections = (
  text: string,
  phraseHints: VoicePhraseHint[],
  options: VoicePhraseHintCorrectionRunOptions = {},
): VoicePhraseHintCorrectionResult => {
  const riskTier = options.riskTier ?? "safe";
  let corrected = text;
  const matches: VoicePhraseHintCorrectionMatch[] = [];

  for (const hint of phraseHints) {
    for (const alias of normalizeHintAliases(hint)) {
      const matcher = buildAliasMatcher(alias);
      if (!matcher.test(corrected)) {
        if (!canUseTieredFuzzyAlias(alias, riskTier)) {
          continue;
        }

        const fuzzyMatch = findFuzzyAliasMatch(corrected, alias, riskTier);
        if (!fuzzyMatch) {
          continue;
        }

        corrected = `${corrected.slice(0, fuzzyMatch.start)}${hint.text}${corrected.slice(
          fuzzyMatch.end,
        )}`;
        matches.push({
          alias,
          hint,
        });
        break;
      }

      corrected = corrected.replace(matcher, hint.text);
      matches.push({
        alias,
        hint,
      });
      break;
    }
  }

  return {
    changed: corrected !== text,
    matches,
    text: corrected,
  };
};

const dedupeAliases = (aliases: string[]) => {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const alias of aliases) {
    const normalized = normalizeDomainTerm(alias);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(alias);
  }

  return deduped;
};

const isSafeAlias = (alias: string) => {
  const normalized = normalizeDomainTerm(alias);
  if (normalized.length < 4) {
    return false;
  }

  const tokens = normalized.split(" ").filter((token) => token.length > 0);
  return tokens.length >= 2 || normalized.length >= 7;
};

export const createDomainPhraseHints = (
  terms: VoiceDomainTerm[],
  options: VoiceDomainHintGenerationOptions = {},
): VoicePhraseHint[] => {
  const riskTier = options.riskTier ?? "safe";
  const hints: VoicePhraseHint[] = [];
  const seen = new Set<string>();

  for (const term of terms) {
    const normalizedText = normalizeDomainTerm(term.text);
    if (!normalizedText || seen.has(normalizedText)) {
      continue;
    }

    const candidateAliases = dedupeAliases(term.aliases ?? []);
    const aliases = candidateAliases.filter((alias) => {
      if (riskTier === "risky") {
        return true;
      }

      if (riskTier === "balanced") {
        return (
          isSafeAlias(alias) || normalizeDomainTerm(alias) === normalizedText
        );
      }

      return isSafeAlias(alias);
    });

    hints.push({
      aliases: aliases.length > 0 ? aliases : undefined,
      boost: term.boost,
      metadata: term.metadata,
      text: term.text,
    });
    seen.add(normalizedText);
  }

  return hints;
};

export const createDomainLexicon = (
  terms: VoiceDomainTerm[],
): VoiceLexiconEntry[] => {
  const entries: VoiceLexiconEntry[] = [];
  const seen = new Set<string>();

  for (const term of terms) {
    const normalizedText = normalizeDomainTerm(term.text);
    if (!normalizedText || seen.has(normalizedText)) {
      continue;
    }

    entries.push({
      aliases: dedupeAliases(term.aliases ?? []),
      language: term.language,
      metadata: term.metadata,
      pronunciation: term.pronunciation,
      text: term.text,
    });
    seen.add(normalizedText);
  }

  return entries;
};

const averageTranscriptConfidence = (transcripts: Transcript[]) => {
  const confidences = transcripts
    .map((transcript) => transcript.confidence)
    .filter((value): value is number => typeof value === "number");

  return confidences.length > 0
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : undefined;
};

export const createPhraseHintCorrectionHandler = (
  options: VoicePhraseHintCorrectionOptions = {},
): VoiceTurnCorrectionHandler => {
  const provider = options.provider ?? "@absolutejs/voice";
  const reason = options.reason ?? "phrase-hint-correction";

  return async ({ phraseHints, text }) => {
    const result = applyPhraseHintCorrections(text, phraseHints);
    if (!result.changed) {
      return;
    }

    return {
      metadata:
        result.matches.length > 0
          ? {
              matchedAliases: result.matches.map((match) => match.alias),
              matchedHints: result.matches.map((match) => match.hint.text),
            }
          : undefined,
      provider,
      reason,
      text: result.text,
    };
  };
};

const lexiconToPhraseHints = (
  lexicon: VoiceLexiconEntry[],
): VoicePhraseHint[] =>
  lexicon.map((entry) => ({
    aliases: entry.aliases,
    metadata: entry.metadata,
    text: entry.text,
  }));

export const applyLexiconCorrections = (
  text: string,
  lexicon: VoiceLexiconEntry[],
): VoicePhraseHintCorrectionResult =>
  applyPhraseHintCorrections(text, lexiconToPhraseHints(lexicon));

export const createLexiconCorrectionHandler = (
  options: VoiceLexiconCorrectionOptions = {},
): VoiceTurnCorrectionHandler => {
  const provider = options.provider ?? "@absolutejs/voice";
  const reason = options.reason ?? "lexicon-correction";

  return async ({ lexicon, text }) => {
    const result = applyLexiconCorrections(text, lexicon);
    if (!result.changed) {
      return;
    }

    return {
      metadata:
        result.matches.length > 0
          ? {
              matchedAliases: result.matches.map((match) => match.alias),
              matchedHints: result.matches.map((match) => match.hint.text),
            }
          : undefined,
      provider,
      reason,
      text: result.text,
    };
  };
};

export const createRiskyTurnCorrectionHandler = (
  options: VoiceRiskyTurnCorrectionHandlerOptions = {},
): VoiceTurnCorrectionHandler => {
  const provider = options.provider ?? "@absolutejs/voice";
  const reason = options.reason ?? "risky-turn-correction";
  const riskTier = options.riskTier ?? "balanced";
  const maxAverageConfidence = options.maxAverageConfidence ?? 0.92;

  return async ({ lexicon, phraseHints, text, transcripts }) => {
    const averageConfidence = averageTranscriptConfidence(transcripts);
    if (
      averageConfidence !== undefined &&
      averageConfidence > maxAverageConfidence
    ) {
      return;
    }

    const result = applyRiskTieredPhraseHintCorrections(
      text,
      [...phraseHints, ...lexiconToPhraseHints(lexicon)],
      { riskTier },
    );
    if (!result.changed) {
      return;
    }

    return {
      metadata: {
        averageConfidence,
        matchedAliases: result.matches.map((match) => match.alias),
        matchedHints: result.matches.map((match) => match.hint.text),
        riskTier,
      },
      provider,
      reason,
      text: result.text,
    };
  };
};
