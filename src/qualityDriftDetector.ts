import type { VoiceScorecard } from "./callScorecard";

export type VoiceQualityDriftSeverity = "ok" | "watch" | "regression";

export type VoiceQualityDriftCriterionAlert = {
  criterionId: string;
  baselineAverage: number;
  currentAverage: number;
  delta: number;
  severity: VoiceQualityDriftSeverity;
};

export type VoiceQualityDriftReport = {
  rubricId: string;
  scope: { from: number; to: number };
  baselineWindow: { from: number; to: number; sampleSize: number };
  currentWindow: { from: number; to: number; sampleSize: number };
  overall: {
    baselineAverage: number;
    currentAverage: number;
    delta: number;
    severity: VoiceQualityDriftSeverity;
  };
  criteria: VoiceQualityDriftCriterionAlert[];
  alertCount: number;
};

export type DetectVoiceQualityDriftInput = {
  rubricId: string;
  scorecards: VoiceScorecard[];
  baselineWindowMs?: number;
  currentWindowMs?: number;
  now?: () => number;
  watchThreshold?: number;
  regressionThreshold?: number;
};

const severityFor = (
  delta: number,
  watch: number,
  regression: number,
): VoiceQualityDriftSeverity => {
  if (delta <= -regression) return "regression";
  if (delta <= -watch) return "watch";
  return "ok";
};

const averageScore = (cards: VoiceScorecard[]): number =>
  cards.length === 0
    ? 0
    : cards.reduce((sum, c) => sum + c.weightedScore, 0) / cards.length;

const averageCriterion = (
  cards: VoiceScorecard[],
  criterionId: string,
): number => {
  const matches: number[] = [];
  for (const card of cards) {
    for (const result of card.results) {
      if (result.criterionId === criterionId) {
        matches.push(result.score / card.scaleMax);
      }
    }
  }
  return matches.length === 0
    ? 0
    : matches.reduce((a, b) => a + b, 0) / matches.length;
};

export const detectVoiceQualityDrift = (
  input: DetectVoiceQualityDriftInput,
): VoiceQualityDriftReport => {
  const now = input.now ?? (() => Date.now());
  const currentWindow = input.currentWindowMs ?? 7 * 24 * 60 * 60 * 1000;
  const baselineWindow = input.baselineWindowMs ?? 30 * 24 * 60 * 60 * 1000;
  const watch = input.watchThreshold ?? 0.05;
  const regression = input.regressionThreshold ?? 0.1;
  const cutoff = now();
  const currentFrom = cutoff - currentWindow;
  const baselineFrom = cutoff - currentWindow - baselineWindow;
  const baselineTo = currentFrom;

  const relevant = input.scorecards.filter(
    (card) => card.rubricId === input.rubricId,
  );
  const baselineCards = relevant.filter(
    (c) => c.createdAt >= baselineFrom && c.createdAt < baselineTo,
  );
  const currentCards = relevant.filter(
    (c) => c.createdAt >= currentFrom && c.createdAt <= cutoff,
  );

  const baselineAvg = averageScore(baselineCards);
  const currentAvg = averageScore(currentCards);
  const overallDelta = currentAvg - baselineAvg;

  const criterionIds = new Set<string>();
  for (const card of relevant) {
    for (const result of card.results) criterionIds.add(result.criterionId);
  }

  const criteria: VoiceQualityDriftCriterionAlert[] = [];
  for (const criterionId of criterionIds) {
    const baseline = averageCriterion(baselineCards, criterionId);
    const current = averageCriterion(currentCards, criterionId);
    const delta = current - baseline;
    const severity = severityFor(delta, watch, regression);
    criteria.push({
      baselineAverage: baseline,
      criterionId,
      currentAverage: current,
      delta,
      severity,
    });
  }

  criteria.sort((a, b) => a.delta - b.delta);
  const alertCount = criteria.filter((c) => c.severity !== "ok").length;

  return {
    alertCount,
    baselineWindow: {
      from: baselineFrom,
      sampleSize: baselineCards.length,
      to: baselineTo,
    },
    criteria,
    currentWindow: {
      from: currentFrom,
      sampleSize: currentCards.length,
      to: cutoff,
    },
    overall: {
      baselineAverage: baselineAvg,
      currentAverage: currentAvg,
      delta: overallDelta,
      severity: severityFor(overallDelta, watch, regression),
    },
    rubricId: input.rubricId,
    scope: { from: baselineFrom, to: cutoff },
  };
};
