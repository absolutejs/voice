import type {
  AIProviderConfig,
  AIProviderMessage,
} from "@absolutejs/ai";

export type VoiceLLMJudgeRubricCriterion = {
  description: string;
  id: string;
  required?: boolean;
  weight?: number;
};

export type VoiceLLMJudgeRubric = {
  criteria: VoiceLLMJudgeRubricCriterion[];
  minPassScore?: number;
};

export type VoiceLLMJudgeCriterionVerdict = {
  criterionId: string;
  passed: boolean;
  rationale: string;
};

export type VoiceLLMJudgeVerdict = {
  criteria: VoiceLLMJudgeCriterionVerdict[];
  passed: boolean;
  score: number;
  summary?: string;
};

export type VoiceLLMJudgeInput = {
  metadata?: Record<string, unknown>;
  transcript: string;
};

export type VoiceLLMJudgeCompletion = (input: {
  prompt: string;
  systemPrompt?: string;
}) => Promise<string>;

export type CreateVoiceLLMJudgeOptions = {
  completion: VoiceLLMJudgeCompletion;
  rubric: VoiceLLMJudgeRubric;
  systemPrompt?: string;
};

export type VoiceLLMJudge = {
  evaluate: (input: VoiceLLMJudgeInput) => Promise<VoiceLLMJudgeVerdict>;
  rubric: VoiceLLMJudgeRubric;
};

const DEFAULT_SYSTEM_PROMPT =
  "You are an impartial evaluator scoring a voice-agent transcript against a rubric. " +
  "For each criterion, decide pass/fail and give a one-sentence rationale grounded in the transcript. " +
  'Respond with strict JSON: {"criteria":[{"criterionId":"…","passed":true,"rationale":"…"}],"summary":"…"}.';

const buildPrompt = (
  rubric: VoiceLLMJudgeRubric,
  input: VoiceLLMJudgeInput,
): string => {
  const criteriaBlock = rubric.criteria
    .map(
      (criterion) =>
        `- ${criterion.id}${criterion.required ? " (required)" : ""}: ${criterion.description}`,
    )
    .join("\n");
  const metadataBlock = input.metadata
    ? `\nMetadata:\n${JSON.stringify(input.metadata, null, 2)}\n`
    : "";
  return `Rubric criteria:\n${criteriaBlock}\n${metadataBlock}\nTranscript:\n${input.transcript}\n\nReturn JSON only.`;
};

const extractJson = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("LLM judge returned an empty response");
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error(`LLM judge response was not valid JSON: ${raw.slice(0, 200)}`);
  }
};

const parseCriteria = (
  payload: unknown,
  rubric: VoiceLLMJudgeRubric,
): { criteria: VoiceLLMJudgeCriterionVerdict[]; summary?: string } => {
  if (!payload || typeof payload !== "object") {
    throw new Error("LLM judge response is not a JSON object");
  }
  const root = payload as Record<string, unknown>;
  const criteriaRaw = root.criteria;
  if (!Array.isArray(criteriaRaw)) {
    throw new Error("LLM judge response is missing the 'criteria' array");
  }
  const verdictById = new Map<string, VoiceLLMJudgeCriterionVerdict>();
  for (const entry of criteriaRaw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const criterionId =
      typeof record.criterionId === "string"
        ? record.criterionId
        : typeof record.id === "string"
          ? record.id
          : undefined;
    if (!criterionId) {
      continue;
    }
    verdictById.set(criterionId, {
      criterionId,
      passed: record.passed === true,
      rationale:
        typeof record.rationale === "string" ? record.rationale : "",
    });
  }
  const criteria = rubric.criteria.map(
    (criterion) =>
      verdictById.get(criterion.id) ?? {
        criterionId: criterion.id,
        passed: false,
        rationale: "Judge did not return a verdict for this criterion.",
      },
  );
  return {
    criteria,
    summary: typeof root.summary === "string" ? root.summary : undefined,
  };
};

const scoreVerdict = (
  rubric: VoiceLLMJudgeRubric,
  criteria: VoiceLLMJudgeCriterionVerdict[],
): { passed: boolean; score: number } => {
  const totalWeight = rubric.criteria.reduce(
    (sum, criterion) => sum + (criterion.weight ?? 1),
    0,
  );
  if (totalWeight === 0) {
    return { passed: false, score: 0 };
  }
  const weightById = new Map(
    rubric.criteria.map((criterion) => [criterion.id, criterion.weight ?? 1]),
  );
  const requiredIds = new Set(
    rubric.criteria
      .filter((criterion) => criterion.required)
      .map((criterion) => criterion.id),
  );
  let earned = 0;
  let allRequiredPassed = true;
  for (const verdict of criteria) {
    if (verdict.passed) {
      earned += weightById.get(verdict.criterionId) ?? 1;
    } else if (requiredIds.has(verdict.criterionId)) {
      allRequiredPassed = false;
    }
  }
  const score = earned / totalWeight;
  const minPassScore = rubric.minPassScore ?? 1;
  return {
    passed: allRequiredPassed && score >= minPassScore,
    score,
  };
};

export const createVoiceLLMJudge = (
  options: CreateVoiceLLMJudgeOptions,
): VoiceLLMJudge => ({
  evaluate: async (input) => {
    const prompt = buildPrompt(options.rubric, input);
    const raw = await options.completion({
      prompt,
      systemPrompt: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    });
    const parsed = parseCriteria(extractJson(raw), options.rubric);
    const { passed, score } = scoreVerdict(options.rubric, parsed.criteria);
    return {
      criteria: parsed.criteria,
      passed,
      score,
      summary: parsed.summary,
    };
  },
  rubric: options.rubric,
});

export type CreateVoiceAIJudgeCompletionOptions = {
  model: string;
  provider: AIProviderConfig;
};

export const createVoiceAIJudgeCompletion = (
  options: CreateVoiceAIJudgeCompletionOptions,
): VoiceLLMJudgeCompletion =>
  async ({ prompt, systemPrompt }) => {
    const messages: AIProviderMessage[] = [
      { content: prompt, role: "user" },
    ];
    const stream = options.provider.stream({
      messages,
      model: options.model,
      systemPrompt,
    });
    let buffered = "";
    for await (const chunk of stream) {
      if (chunk.type === "text") {
        buffered += chunk.content;
      }
    }
    return buffered;
  };
