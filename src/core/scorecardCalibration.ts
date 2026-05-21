import type { VoiceScorecard } from "./callScorecard";

export type VoiceScorecardCalibrationPair = {
  sessionId: string;
  human: VoiceScorecard;
  llm: VoiceScorecard;
};

export type VoiceScorecardCalibrationDivergence = {
  sessionId: string;
  criterionId: string;
  humanScore: number;
  llmScore: number;
  normalizedGap: number;
};

export type VoiceScorecardCalibrationReport = {
  pairsCompared: number;
  meanAbsoluteError: number;
  rootMeanSquareError: number;
  weightedScoreCorrelation: number;
  gradeAgreementRate: number;
  perCriterion: {
    criterionId: string;
    meanAbsoluteError: number;
    averageHumanScore: number;
    averageLLMScore: number;
    bias: number;
  }[];
  worstDivergences: VoiceScorecardCalibrationDivergence[];
};

const normalize = (raw: number, scaleMax: number) =>
  scaleMax === 0 ? 0 : raw / scaleMax;

const correlation = (xs: number[], ys: number[]): number => {
  if (xs.length === 0 || xs.length !== ys.length) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = (xs[i] ?? 0) - meanX;
    const dy = (ys[i] ?? 0) - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  if (denomX === 0 || denomY === 0) return 0;

  return num / Math.sqrt(denomX * denomY);
};

export const computeVoiceScorecardCalibration = (
  pairs: VoiceScorecardCalibrationPair[],
  options: { topDivergences?: number } = {},
): VoiceScorecardCalibrationReport => {
  if (pairs.length === 0) {
    return {
      gradeAgreementRate: 0,
      meanAbsoluteError: 0,
      pairsCompared: 0,
      perCriterion: [],
      rootMeanSquareError: 0,
      weightedScoreCorrelation: 0,
      worstDivergences: [],
    };
  }
  const topN = options.topDivergences ?? 10;
  const gapsByCriterion = new Map<
    string,
    {
      absSum: number;
      biasSum: number;
      humanSum: number;
      llmSum: number;
      count: number;
    }
  >();
  const allGaps: number[] = [];
  const divergences: VoiceScorecardCalibrationDivergence[] = [];
  const humanWeighted: number[] = [];
  const llmWeighted: number[] = [];
  let gradeAgreed = 0;
  let comparedPairs = 0;

  for (const pair of pairs) {
    if (pair.human.rubricId !== pair.llm.rubricId) continue;
    comparedPairs += 1;
    if (pair.human.grade === pair.llm.grade) gradeAgreed += 1;
    humanWeighted.push(pair.human.weightedScore);
    llmWeighted.push(pair.llm.weightedScore);
    const humanByCriterion = new Map(
      pair.human.results.map((r) => [r.criterionId, r] as const),
    );
    const llmByCriterion = new Map(
      pair.llm.results.map((r) => [r.criterionId, r] as const),
    );
    const criteriaIds = new Set([
      ...humanByCriterion.keys(),
      ...llmByCriterion.keys(),
    ]);
    for (const criterionId of criteriaIds) {
      const h = humanByCriterion.get(criterionId);
      const l = llmByCriterion.get(criterionId);
      if (!h || !l) continue;
      const hn = normalize(h.score, pair.human.scaleMax);
      const ln = normalize(l.score, pair.llm.scaleMax);
      const gap = Math.abs(hn - ln);
      allGaps.push(gap);
      divergences.push({
        criterionId,
        humanScore: hn,
        llmScore: ln,
        normalizedGap: hn - ln,
        sessionId: pair.sessionId,
      });
      const entry = gapsByCriterion.get(criterionId) ?? {
        absSum: 0,
        biasSum: 0,
        count: 0,
        humanSum: 0,
        llmSum: 0,
      };
      entry.absSum += gap;
      entry.biasSum += ln - hn;
      entry.humanSum += hn;
      entry.llmSum += ln;
      entry.count += 1;
      gapsByCriterion.set(criterionId, entry);
    }
  }

  const mae =
    allGaps.length === 0
      ? 0
      : allGaps.reduce((a, b) => a + b, 0) / allGaps.length;
  const rmse =
    allGaps.length === 0
      ? 0
      : Math.sqrt(allGaps.reduce((a, b) => a + b * b, 0) / allGaps.length);

  const perCriterion = Array.from(gapsByCriterion.entries()).map(
    ([criterionId, e]) => ({
      averageHumanScore: e.count === 0 ? 0 : e.humanSum / e.count,
      averageLLMScore: e.count === 0 ? 0 : e.llmSum / e.count,
      bias: e.count === 0 ? 0 : e.biasSum / e.count,
      criterionId,
      meanAbsoluteError: e.count === 0 ? 0 : e.absSum / e.count,
    }),
  );

  return {
    gradeAgreementRate: comparedPairs === 0 ? 0 : gradeAgreed / comparedPairs,
    meanAbsoluteError: mae,
    pairsCompared: comparedPairs,
    perCriterion,
    rootMeanSquareError: rmse,
    weightedScoreCorrelation: correlation(humanWeighted, llmWeighted),
    worstDivergences: divergences
      .sort((a, b) => Math.abs(b.normalizedGap) - Math.abs(a.normalizedGap))
      .slice(0, topN),
  };
};
