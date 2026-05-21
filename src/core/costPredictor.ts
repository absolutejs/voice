import {
  DEFAULT_VOICE_PRICE_BOOK,
  type VoicePriceBook,
} from "./costAccounting";

export type VoiceCostProfile = {
  /** Stored callers? Set to true to include caller-memory storage costs (per snapshot, monthly). Default false (we don't model storage here). */
  includeCallerMemory?: boolean;
  /** Inbound calls per day. */
  inboundPerDay?: number;
  /** Average input tokens per agent turn. */
  inputTokensPerTurn: number;
  /** LLM model id used for provider:model price lookup. */
  llmModel: string;
  /** LLM provider — must match price book namespace. */
  llmProvider: string;
  /** Average minutes per call. */
  minutesPerCall: number;
  /** Outbound calls per day. */
  outboundPerDay?: number;
  /** Average output tokens per agent turn. */
  outputTokensPerTurn: number;
  /** STT model. */
  sttModel?: string;
  /** STT provider. */
  sttProvider?: string;
  /** Telephony provider key in the price book (e.g. 'twilio', 'telnyx'). */
  telephonyProvider?: string;
  /** Total turns per call. */
  turnsPerCall: number;
  /** Average TTS characters spoken per agent turn. */
  ttsCharsPerTurn: number;
  /** TTS model / voice id. */
  ttsModel?: string;
  /** TTS provider. */
  ttsProvider?: string;
};

export type VoiceCostPrediction = {
  callsPerDay: number;
  monthly: {
    llmUsd: number;
    sttUsd: number;
    telephonyUsd: number;
    totalUsd: number;
    ttsUsd: number;
  };
  perCall: {
    llmUsd: number;
    sttUsd: number;
    telephonyUsd: number;
    totalUsd: number;
    ttsUsd: number;
  };
};

const lookupRates = (
  priceBook: VoicePriceBook,
  provider?: string,
  model?: string,
) => {
  if (!provider) return undefined;
  const namespacedKey = model
    ? `${provider.toLowerCase()}:${model.toLowerCase()}`
    : undefined;
  if (namespacedKey && priceBook[namespacedKey]) {
    return priceBook[namespacedKey];
  }
  const bare = provider.toLowerCase();

  return priceBook[bare];
};

const round = (value: number, places = 6) => {
  const factor = 10 ** places;

  return Math.round(value * factor) / factor;
};

export type PredictVoiceCallCostInput = {
  priceBook?: VoicePriceBook;
  profile: VoiceCostProfile;
};

export const predictVoiceCallCost = (
  input: PredictVoiceCallCostInput,
): VoiceCostPrediction => {
  const priceBook = input.priceBook ?? DEFAULT_VOICE_PRICE_BOOK;
  const p = input.profile;
  const llm = lookupRates(priceBook, p.llmProvider, p.llmModel)?.llm;
  const tts = p.ttsProvider
    ? lookupRates(priceBook, p.ttsProvider, p.ttsModel)?.tts
    : undefined;
  const stt = p.sttProvider
    ? lookupRates(priceBook, p.sttProvider, p.sttModel)?.stt
    : undefined;
  const telephony = p.telephonyProvider
    ? lookupRates(priceBook, p.telephonyProvider, undefined)?.telephony
    : undefined;

  const totalInputTokens = p.inputTokensPerTurn * p.turnsPerCall;
  const totalOutputTokens = p.outputTokensPerTurn * p.turnsPerCall;
  const llmUsd = llm
    ? (totalInputTokens * llm.inputPerMillionTokensUsd) / 1_000_000 +
      (totalOutputTokens * llm.outputPerMillionTokensUsd) / 1_000_000
    : 0;

  const totalChars = p.ttsCharsPerTurn * p.turnsPerCall;
  let ttsUsd = 0;
  if (tts?.perMillionCharactersUsd !== undefined && totalChars > 0) {
    ttsUsd = (totalChars * tts.perMillionCharactersUsd) / 1_000_000;
  } else if (tts?.perSecondUsd !== undefined) {
    // Approximate: 165 wpm × 5 chars/word → 13.75 chars/sec; turns spoken ≈ totalChars / 13.75
    const audioSec = totalChars / 13.75;
    ttsUsd = audioSec * tts.perSecondUsd;
  }

  const sttSeconds = p.minutesPerCall * 60;
  const sttUsd = stt ? sttSeconds * stt.perSecondUsd : 0;

  const telephonyUsd = telephony
    ? p.minutesPerCall * telephony.perMinuteUsd
    : 0;

  const totalPerCall = llmUsd + ttsUsd + sttUsd + telephonyUsd;
  const callsPerDay = (p.inboundPerDay ?? 0) + (p.outboundPerDay ?? 0);
  const monthlyCalls = callsPerDay * 30;

  return {
    callsPerDay,
    monthly: {
      llmUsd: round(llmUsd * monthlyCalls),
      sttUsd: round(sttUsd * monthlyCalls),
      telephonyUsd: round(telephonyUsd * monthlyCalls),
      totalUsd: round(totalPerCall * monthlyCalls),
      ttsUsd: round(ttsUsd * monthlyCalls),
    },
    perCall: {
      llmUsd: round(llmUsd),
      sttUsd: round(sttUsd),
      telephonyUsd: round(telephonyUsd),
      totalUsd: round(totalPerCall),
      ttsUsd: round(ttsUsd),
    },
  };
};

export type VoiceCostScenarioComparison = {
  delta: {
    monthlyUsd: number;
    perCallUsd: number;
  };
  prediction: VoiceCostPrediction;
  scenarioId: string;
};

export const compareVoiceCostScenarios = (input: {
  baselineId: string;
  priceBook?: VoicePriceBook;
  scenarios: ReadonlyArray<{ id: string; profile: VoiceCostProfile }>;
}): {
  baseline: VoiceCostPrediction;
  scenarios: VoiceCostScenarioComparison[];
} => {
  const baselineDef = input.scenarios.find((s) => s.id === input.baselineId);
  if (!baselineDef) {
    throw new Error(
      `Baseline scenario '${input.baselineId}' not found in scenarios list`,
    );
  }
  const baseline = predictVoiceCallCost({
    priceBook: input.priceBook,
    profile: baselineDef.profile,
  });

  return {
    baseline,
    scenarios: input.scenarios.map((scenario) => {
      const prediction = predictVoiceCallCost({
        priceBook: input.priceBook,
        profile: scenario.profile,
      });

      return {
        delta: {
          monthlyUsd: round(
            prediction.monthly.totalUsd - baseline.monthly.totalUsd,
          ),
          perCallUsd: round(
            prediction.perCall.totalUsd - baseline.perCall.totalUsd,
          ),
        },
        prediction,
        scenarioId: scenario.id,
      };
    }),
  };
};
