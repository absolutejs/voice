export type VoiceScorecardCriterion = {
  id: string;
  label: string;
  weight: number;
  section?: string;
  passingScore?: number;
  required?: boolean;
};

export type VoiceScorecardRubric = {
  id: string;
  label: string;
  scaleMax?: number;
  passingGrade?: number;
  criteria: VoiceScorecardCriterion[];
};

export type VoiceScorecardCriterionResult = {
  criterionId: string;
  score: number;
  weight: number;
  rationale?: string;
  passed: boolean;
};

export type VoiceScorecard = {
  rubricId: string;
  sessionId: string;
  agentId?: string;
  reviewer: "human" | "llm" | "hybrid";
  reviewerId?: string;
  createdAt: number;
  scaleMax: number;
  passingGrade: number;
  results: VoiceScorecardCriterionResult[];
  weightedScore: number;
  grade: "pass" | "fail" | "needs-review";
  sectionScores: Record<string, number>;
  failedRequiredCriteria: string[];
  comments?: string;
};

export type BuildVoiceCallScorecardInput = {
  rubric: VoiceScorecardRubric;
  sessionId: string;
  agentId?: string;
  reviewer: VoiceScorecard["reviewer"];
  reviewerId?: string;
  scores: Record<string, { score: number; rationale?: string }>;
  comments?: string;
  now?: () => number;
};

const clampScore = (raw: number, max: number) =>
  Math.max(0, Math.min(max, raw));

export const buildVoiceCallScorecard = (
  input: BuildVoiceCallScorecardInput,
): VoiceScorecard => {
  const now = input.now ?? (() => Date.now());
  const scaleMax = input.rubric.scaleMax ?? 5;
  const passingGrade = input.rubric.passingGrade ?? 0.7;
  const totalWeight = input.rubric.criteria.reduce(
    (sum, c) => sum + c.weight,
    0,
  );
  if (totalWeight <= 0) {
    throw new Error("Rubric weights must sum to a positive number");
  }
  const results: VoiceScorecardCriterionResult[] = [];
  const failedRequiredCriteria: string[] = [];
  const sectionAccum = new Map<string, { weighted: number; weight: number }>();

  for (const criterion of input.rubric.criteria) {
    const raw = input.scores[criterion.id];
    if (!raw) {
      throw new Error(`Missing score for criterion: ${criterion.id}`);
    }
    const score = clampScore(raw.score, scaleMax);
    const passingScore = criterion.passingScore ?? scaleMax * 0.6;
    const passed = score >= passingScore;
    const result: VoiceScorecardCriterionResult = {
      criterionId: criterion.id,
      passed,
      score,
      weight: criterion.weight,
      ...(raw.rationale !== undefined ? { rationale: raw.rationale } : {}),
    };
    results.push(result);
    if (!passed && criterion.required) {
      failedRequiredCriteria.push(criterion.id);
    }
    const section = criterion.section ?? "default";
    const entry = sectionAccum.get(section) ?? { weight: 0, weighted: 0 };
    entry.weighted += score * criterion.weight;
    entry.weight += criterion.weight;
    sectionAccum.set(section, entry);
  }

  const weightedSum = results.reduce((sum, r) => sum + r.score * r.weight, 0);
  const weightedScore = weightedSum / (totalWeight * scaleMax);

  const sectionScores: Record<string, number> = {};
  for (const [section, accum] of sectionAccum) {
    sectionScores[section] =
      accum.weight === 0 ? 0 : accum.weighted / (accum.weight * scaleMax);
  }

  const grade: VoiceScorecard["grade"] =
    failedRequiredCriteria.length > 0
      ? "fail"
      : weightedScore >= passingGrade
        ? "pass"
        : "needs-review";

  return {
    createdAt: now(),
    failedRequiredCriteria,
    grade,
    passingGrade,
    results,
    reviewer: input.reviewer,
    rubricId: input.rubric.id,
    scaleMax,
    sectionScores,
    sessionId: input.sessionId,
    weightedScore,
    ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
    ...(input.reviewerId !== undefined ? { reviewerId: input.reviewerId } : {}),
    ...(input.comments !== undefined ? { comments: input.comments } : {}),
  };
};

export const DEFAULT_VOICE_SALES_RUBRIC: VoiceScorecardRubric = {
  criteria: [
    {
      id: "greeting",
      label: "Professional greeting",
      section: "opening",
      weight: 1,
    },
    {
      id: "needs-discovery",
      label: "Discovers customer needs",
      required: true,
      section: "discovery",
      weight: 2,
    },
    {
      id: "objection-handling",
      label: "Handles objections clearly",
      section: "objections",
      weight: 2,
    },
    {
      id: "compliance-disclosure",
      label: "Made required compliance disclosure",
      required: true,
      section: "compliance",
      weight: 3,
    },
    {
      id: "close-or-next-step",
      label: "Closes or sets a next step",
      section: "close",
      weight: 2,
    },
  ],
  id: "default-sales",
  label: "Default sales QA rubric",
  passingGrade: 0.75,
  scaleMax: 5,
};
