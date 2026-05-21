export type VoicePostCallSurveyQuestion = {
  id: string;
  prompt: string;
  type: "rating" | "boolean" | "comment";
  min?: number;
  max?: number;
  required?: boolean;
};

export type VoicePostCallSurveyAnswer = {
  questionId: string;
  value: number | boolean | string | null;
};

export type VoicePostCallSurveyResponse = {
  sessionId: string;
  startedAt: number;
  completedAt: number | null;
  answers: VoicePostCallSurveyAnswer[];
  npsBucket: "promoter" | "passive" | "detractor" | null;
};

export type CreateVoicePostCallSurveyOptions = {
  sessionId: string;
  questions?: VoicePostCallSurveyQuestion[];
  now?: () => number;
};

export const DEFAULT_VOICE_POST_CALL_SURVEY_QUESTIONS: VoicePostCallSurveyQuestion[] =
  [
    {
      id: "nps",
      max: 10,
      min: 0,
      prompt:
        "On a scale of zero to ten, how likely are you to recommend this service?",
      required: true,
      type: "rating",
    },
    {
      id: "resolved",
      prompt: "Did we resolve the reason for your call today?",
      required: true,
      type: "boolean",
    },
    {
      id: "comment",
      prompt: "Anything else you'd like to share before we wrap up?",
      type: "comment",
    },
  ];

const bucketize = (
  rating: number | null,
): "promoter" | "passive" | "detractor" | null => {
  if (rating === null) return null;
  if (rating >= 9) return "promoter";
  if (rating >= 7) return "passive";

  return "detractor";
};

const validateRating = (
  question: VoicePostCallSurveyQuestion,
  value: unknown,
): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new TypeError(`Question ${question.id} requires a numeric rating`);
  }
  const min = question.min ?? 0;
  const max = question.max ?? 10;
  if (value < min || value > max) {
    throw new RangeError(
      `Question ${question.id} expects a rating between ${min} and ${max}`,
    );
  }

  return value;
};

export const createVoicePostCallSurvey = (
  options: CreateVoicePostCallSurveyOptions,
) => {
  const now = options.now ?? (() => Date.now());
  const questions =
    options.questions ?? DEFAULT_VOICE_POST_CALL_SURVEY_QUESTIONS;
  const response: VoicePostCallSurveyResponse = {
    answers: [],
    completedAt: null,
    npsBucket: null,
    sessionId: options.sessionId,
    startedAt: now(),
  };

  const indexById = new Map(questions.map((q) => [q.id, q]));
  let cursor = 0;

  const next = (): VoicePostCallSurveyQuestion | null =>
    cursor < questions.length ? (questions[cursor] ?? null) : null;

  const record = (
    questionId: string,
    value: number | boolean | string | null,
  ): VoicePostCallSurveyAnswer => {
    const question = indexById.get(questionId);
    if (!question) throw new Error(`Unknown survey question: ${questionId}`);
    let stored: number | boolean | string | null = value;
    if (question.type === "rating") stored = validateRating(question, value);
    if (question.type === "boolean") {
      if (typeof value !== "boolean") {
        throw new TypeError(`Question ${questionId} requires a boolean answer`);
      }
      stored = value;
    }
    if (
      question.type === "comment" &&
      value !== null &&
      typeof value !== "string"
    ) {
      throw new TypeError(`Question ${questionId} requires a string answer`);
    }
    if (question.required && (stored === null || stored === "")) {
      throw new Error(`Question ${questionId} is required`);
    }
    const answer: VoicePostCallSurveyAnswer = { questionId, value: stored };
    response.answers.push(answer);
    if (questionId === "nps" && typeof stored === "number") {
      response.npsBucket = bucketize(stored);
    }
    const idx = questions.findIndex((q) => q.id === questionId);
    if (idx >= 0) cursor = Math.max(cursor, idx + 1);

    return answer;
  };

  const skip = () => {
    const question = next();
    if (!question) return null;
    if (question.required) {
      throw new Error(`Cannot skip required question: ${question.id}`);
    }
    response.answers.push({ questionId: question.id, value: null });
    cursor += 1;

    return question;
  };

  const complete = () => {
    for (const question of questions) {
      if (
        question.required &&
        !response.answers.some(
          (a) => a.questionId === question.id && a.value !== null,
        )
      ) {
        throw new Error(`Survey is missing required answer: ${question.id}`);
      }
    }
    response.completedAt = now();

    return response;
  };

  return {
    complete,
    next,
    questions,
    record,
    skip,
    getResponse: () => response,
  };
};

export type VoicePostCallSurvey = ReturnType<typeof createVoicePostCallSurvey>;

export const summarizeVoicePostCallSurveys = (
  responses: VoicePostCallSurveyResponse[],
) => {
  const completed = responses.filter((r) => r.completedAt !== null);
  const ratings = completed
    .flatMap((r) => r.answers)
    .filter(
      (a): a is VoicePostCallSurveyAnswer & { value: number } =>
        a.questionId === "nps" && typeof a.value === "number",
    );
  const promoters = ratings.filter((a) => a.value >= 9).length;
  const detractors = ratings.filter((a) => a.value <= 6).length;
  const denom = ratings.length || 1;

  return {
    completion:
      responses.length === 0 ? 0 : completed.length / responses.length,
    detractors,
    nps: ratings.length === 0 ? null : ((promoters - detractors) / denom) * 100,
    promoters,
    sampleSize: ratings.length,
  };
};
