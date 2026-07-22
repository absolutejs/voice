import type { VoiceTranscriptAccuracy } from "./accuracy";

export type VoiceAggregateErrorMetrics = {
  correct: number;
  deletions: number;
  insertions: number;
  macroWordErrorRate: number;
  microWordErrorRate: number;
  referenceWordCount: number;
  sentenceErrorRate: number;
  substitutions: number;
};

export type VoiceConfidenceInterval = {
  confidenceLevel: number;
  high: number;
  low: number;
  samples: number;
};

export type VoicePairedBootstrapComparison = {
  baselineMean: number;
  candidateMean: number;
  delta: number;
  deltaConfidenceInterval: VoiceConfidenceInterval;
  probabilityCandidateIsBetter: number;
};

const mean = (values: number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

export const aggregateTranscriptAccuracy = (
  values: VoiceTranscriptAccuracy[],
): VoiceAggregateErrorMetrics => {
  const alignments = values.map((value) => value.alignment).filter(Boolean);
  const sum = (key: "correct" | "deletions" | "insertions" | "referenceWordCount" | "substitutions") =>
    alignments.reduce((total, alignment) => total + alignment![key], 0);
  const referenceWordCount = sum("referenceWordCount");
  const errors = sum("substitutions") + sum("deletions") + sum("insertions");
  return {
    correct: sum("correct"),
    deletions: sum("deletions"),
    insertions: sum("insertions"),
    macroWordErrorRate: mean(values.map((value) => value.wordErrorRate)),
    microWordErrorRate: referenceWordCount > 0 ? errors / referenceWordCount : 0,
    referenceWordCount,
    sentenceErrorRate:
      values.length > 0
        ? alignments.filter((alignment) => alignment!.sentenceError).length /
          values.length
        : 0,
    substitutions: sum("substitutions"),
  };
};

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

export const comparePairedMetrics = (
  baseline: number[],
  candidate: number[],
  options: { confidenceLevel?: number; samples?: number; seed?: number } = {},
): VoicePairedBootstrapComparison => {
  if (baseline.length !== candidate.length || baseline.length === 0) {
    throw new Error("Paired comparisons require equal, non-empty samples.");
  }
  const samples = options.samples ?? 10_000;
  const confidenceLevel = options.confidenceLevel ?? 0.95;
  const random = seededRandom(options.seed ?? 20_260_722);
  const deltas: number[] = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const selected: number[] = [];
    for (let index = 0; index < baseline.length; index += 1) {
      const selectedIndex = Math.floor(random() * baseline.length);
      selected.push(candidate[selectedIndex]! - baseline[selectedIndex]!);
    }
    deltas.push(mean(selected));
  }
  deltas.sort((left, right) => left - right);
  const alpha = (1 - confidenceLevel) / 2;
  const percentile = (value: number) =>
    deltas[Math.min(deltas.length - 1, Math.floor(value * deltas.length))] ?? 0;
  return {
    baselineMean: mean(baseline),
    candidateMean: mean(candidate),
    delta: mean(candidate) - mean(baseline),
    deltaConfidenceInterval: {
      confidenceLevel,
      high: percentile(1 - alpha),
      low: percentile(alpha),
      samples,
    },
    probabilityCandidateIsBetter:
      deltas.filter((delta) => delta < 0).length / deltas.length,
  };
};
