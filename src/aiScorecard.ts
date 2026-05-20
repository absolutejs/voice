import {
  buildVoiceCallScorecard,
  type VoiceScorecard,
  type VoiceScorecardRubric,
} from "./callScorecard";

export type VoiceAIScorecardCompletion = (input: {
  prompt: string;
  systemPrompt?: string;
}) => Promise<string>;

export type VoiceAIScorecardScoringResult = {
  criterionId: string;
  score: number;
  rationale?: string;
};

export type VoiceAIScorecardParsedResponse = {
  scores: VoiceAIScorecardScoringResult[];
  comments?: string;
};

export type ScoreVoiceCallWithAIInput = {
  rubric: VoiceScorecardRubric;
  sessionId: string;
  transcript: string;
  agentId?: string;
  reviewerId?: string;
  metadata?: Record<string, unknown>;
  now?: () => number;
};

export type CreateVoiceAIScorecardOptions = {
  completion: VoiceAIScorecardCompletion;
  systemPrompt?: string;
};

const DEFAULT_SYSTEM_PROMPT =
  "You are an impartial quality reviewer scoring a voice-agent call transcript. " +
  "For each criterion, return a numeric score between 0 and the rubric's scaleMax, with a one-sentence rationale grounded in the transcript. " +
  'Respond with strict JSON: {"scores":[{"criterionId":"…","score":4,"rationale":"…"}],"comments":"…"}. ' +
  "Do not return prose outside the JSON.";

const buildPrompt = (input: ScoreVoiceCallWithAIInput): string => {
  const { rubric } = input;
  const scaleMax = rubric.scaleMax ?? 5;
  const criteriaBlock = rubric.criteria
    .map(
      (criterion) =>
        `- ${criterion.id}${criterion.required ? " (required)" : ""}: ${criterion.label} (weight=${criterion.weight}${criterion.section ? `, section=${criterion.section}` : ""})`,
    )
    .join("\n");
  const metadataBlock = input.metadata
    ? `\nMetadata:\n${JSON.stringify(input.metadata, null, 2)}\n`
    : "";
  return `Rubric: ${rubric.label} (scaleMax=${scaleMax})\nCriteria:\n${criteriaBlock}\n${metadataBlock}\nTranscript:\n${input.transcript}\n\nReturn JSON only.`;
};

const extractJson = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("AI scorecard returned an empty response");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error(
      `AI scorecard response was not valid JSON: ${raw.slice(0, 200)}`,
    );
  }
};

export const parseVoiceAIScorecardResponse = (
  raw: string,
  rubric: VoiceScorecardRubric,
): VoiceAIScorecardParsedResponse => {
  const payload = extractJson(raw);
  if (!payload || typeof payload !== "object") {
    throw new Error("AI scorecard response is not a JSON object");
  }
  const root = payload as Record<string, unknown>;
  const scoresRaw = root.scores;
  if (!Array.isArray(scoresRaw)) {
    throw new Error("AI scorecard response missing scores[] array");
  }
  const known = new Set(rubric.criteria.map((c) => c.id));
  const parsed: VoiceAIScorecardScoringResult[] = [];
  for (const entry of scoresRaw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const criterionId = String(item.criterionId ?? "").trim();
    if (!criterionId || !known.has(criterionId)) continue;
    const scoreValue = Number(item.score);
    if (Number.isNaN(scoreValue)) continue;
    parsed.push({
      criterionId,
      score: scoreValue,
      ...(typeof item.rationale === "string"
        ? { rationale: item.rationale }
        : {}),
    });
  }
  const comments =
    typeof root.comments === "string" ? (root.comments as string) : undefined;
  return {
    scores: parsed,
    ...(comments !== undefined ? { comments } : {}),
  };
};

export const createVoiceAIScorecard = (
  options: CreateVoiceAIScorecardOptions,
) => {
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  return {
    async scoreCall(input: ScoreVoiceCallWithAIInput): Promise<VoiceScorecard> {
      const prompt = buildPrompt(input);
      const raw = await options.completion({ prompt, systemPrompt });
      const parsed = parseVoiceAIScorecardResponse(raw, input.rubric);
      const scoreMap: Record<string, { score: number; rationale?: string }> =
        {};
      for (const entry of parsed.scores) {
        scoreMap[entry.criterionId] = {
          score: entry.score,
          ...(entry.rationale !== undefined
            ? { rationale: entry.rationale }
            : {}),
        };
      }
      for (const criterion of input.rubric.criteria) {
        if (!scoreMap[criterion.id]) {
          scoreMap[criterion.id] = {
            rationale: "No rationale returned by AI scorer",
            score: 0,
          };
        }
      }
      return buildVoiceCallScorecard({
        reviewer: "llm",
        rubric: input.rubric,
        scores: scoreMap,
        sessionId: input.sessionId,
        ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
        ...(input.reviewerId !== undefined
          ? { reviewerId: input.reviewerId }
          : {}),
        ...(parsed.comments !== undefined ? { comments: parsed.comments } : {}),
        ...(input.now !== undefined ? { now: input.now } : {}),
      });
    },
  };
};

export type VoiceAIScorecard = ReturnType<typeof createVoiceAIScorecard>;
