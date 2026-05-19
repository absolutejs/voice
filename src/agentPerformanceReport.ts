import type { VoiceScorecard } from "./callScorecard";

export type VoiceAgentPerformanceBucket = "day" | "week" | "month";

export type VoiceAgentPerformanceCriterionSummary = {
  criterionId: string;
  averageScore: number;
  passRate: number;
  trend: "up" | "down" | "flat";
  delta: number;
};

export type VoiceAgentPerformanceBucketSummary = {
  bucketKey: string;
  callsScored: number;
  averageWeightedScore: number;
  passRate: number;
  needsReviewRate: number;
  failRate: number;
};

export type VoiceAgentPerformanceReport = {
  agentId: string;
  rubricId: string;
  fromMs: number;
  toMs: number;
  bucket: VoiceAgentPerformanceBucket;
  totalCalls: number;
  buckets: VoiceAgentPerformanceBucketSummary[];
  criteria: VoiceAgentPerformanceCriterionSummary[];
  overallPassRate: number;
  overallAverageScore: number;
  worstCriterion: string | null;
  bestCriterion: string | null;
};

const bucketKeyFor = (
  ms: number,
  bucket: VoiceAgentPerformanceBucket,
): string => {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  if (bucket === "day") return `${year}-${month}-${day}`;
  if (bucket === "month") return `${year}-${month}`;
  const firstJan = Date.UTC(year, 0, 1);
  const week = Math.floor((ms - firstJan) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
};

export type BuildVoiceAgentPerformanceReportInput = {
  agentId: string;
  rubricId: string;
  scorecards: VoiceScorecard[];
  fromMs?: number;
  toMs?: number;
  bucket?: VoiceAgentPerformanceBucket;
};

export const buildVoiceAgentPerformanceReport = (
  input: BuildVoiceAgentPerformanceReportInput,
): VoiceAgentPerformanceReport => {
  const bucket = input.bucket ?? "week";
  const scorecards = input.scorecards
    .filter(
      (card) =>
        card.agentId === input.agentId && card.rubricId === input.rubricId,
    )
    .filter(
      (card) =>
        (input.fromMs === undefined || card.createdAt >= input.fromMs) &&
        (input.toMs === undefined || card.createdAt <= input.toMs),
    )
    .sort((a, b) => a.createdAt - b.createdAt);

  const bucketMap = new Map<
    string,
    {
      total: number;
      sum: number;
      pass: number;
      needsReview: number;
      fail: number;
    }
  >();
  for (const card of scorecards) {
    const key = bucketKeyFor(card.createdAt, bucket);
    const entry = bucketMap.get(key) ?? {
      fail: 0,
      needsReview: 0,
      pass: 0,
      sum: 0,
      total: 0,
    };
    entry.total += 1;
    entry.sum += card.weightedScore;
    if (card.grade === "pass") entry.pass += 1;
    else if (card.grade === "needs-review") entry.needsReview += 1;
    else entry.fail += 1;
    bucketMap.set(key, entry);
  }
  const buckets: VoiceAgentPerformanceBucketSummary[] = Array.from(
    bucketMap.entries(),
  )
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([bucketKey, e]) => ({
      averageWeightedScore: e.total > 0 ? e.sum / e.total : 0,
      bucketKey,
      callsScored: e.total,
      failRate: e.total > 0 ? e.fail / e.total : 0,
      needsReviewRate: e.total > 0 ? e.needsReview / e.total : 0,
      passRate: e.total > 0 ? e.pass / e.total : 0,
    }));

  const criterionMap = new Map<
    string,
    { scoreSum: number; total: number; passes: number; firstAvg: number | null }
  >();
  for (const card of scorecards) {
    for (const result of card.results) {
      const entry = criterionMap.get(result.criterionId) ?? {
        firstAvg: null,
        passes: 0,
        scoreSum: 0,
        total: 0,
      };
      entry.scoreSum += result.score / card.scaleMax;
      entry.total += 1;
      if (result.passed) entry.passes += 1;
      criterionMap.set(result.criterionId, entry);
    }
  }
  const firstHalf = scorecards.slice(
    0,
    Math.max(1, Math.floor(scorecards.length / 2)),
  );
  const secondHalf = scorecards.slice(
    Math.floor(scorecards.length / 2),
  );
  const halfAverage = (cards: VoiceScorecard[], criterionId: string) => {
    const matches = cards
      .flatMap((c) =>
        c.results
          .filter((r) => r.criterionId === criterionId)
          .map((r) => r.score / c.scaleMax),
      );
    if (matches.length === 0) return null;
    return matches.reduce((a, b) => a + b, 0) / matches.length;
  };

  const criteria: VoiceAgentPerformanceCriterionSummary[] = [];
  for (const [criterionId, e] of criterionMap) {
    const earlier = halfAverage(firstHalf, criterionId);
    const later = halfAverage(secondHalf, criterionId);
    let trend: "up" | "down" | "flat" = "flat";
    let delta = 0;
    if (earlier !== null && later !== null) {
      delta = later - earlier;
      if (delta > 0.05) trend = "up";
      else if (delta < -0.05) trend = "down";
    }
    criteria.push({
      averageScore: e.total > 0 ? e.scoreSum / e.total : 0,
      criterionId,
      delta,
      passRate: e.total > 0 ? e.passes / e.total : 0,
      trend,
    });
  }
  criteria.sort((a, b) => a.criterionId.localeCompare(b.criterionId));

  const overallTotal = scorecards.length;
  const overallSum = scorecards.reduce((s, c) => s + c.weightedScore, 0);
  const overallPasses = scorecards.filter((c) => c.grade === "pass").length;
  const ranked = [...criteria].sort((a, b) => a.averageScore - b.averageScore);

  return {
    agentId: input.agentId,
    bestCriterion: ranked.at(-1)?.criterionId ?? null,
    bucket,
    buckets,
    criteria,
    fromMs: input.fromMs ?? scorecards[0]?.createdAt ?? 0,
    overallAverageScore: overallTotal > 0 ? overallSum / overallTotal : 0,
    overallPassRate: overallTotal > 0 ? overallPasses / overallTotal : 0,
    rubricId: input.rubricId,
    toMs: input.toMs ?? scorecards.at(-1)?.createdAt ?? 0,
    totalCalls: overallTotal,
    worstCriterion: ranked[0]?.criterionId ?? null,
  };
};
