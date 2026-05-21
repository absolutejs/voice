export type VoiceProviderRates = {
  llm?: {
    cachedInputPerMillionTokensUsd?: number;
    inputPerMillionTokensUsd: number;
    outputPerMillionTokensUsd: number;
  };
  stt?: {
    perSecondUsd: number;
  };
  telephony?: {
    perMinuteUsd: number;
  };
  tts?: {
    perMillionCharactersUsd?: number;
    perSecondUsd?: number;
  };
};

export type VoicePriceBook = Record<string, VoiceProviderRates>;

export const DEFAULT_VOICE_PRICE_BOOK: VoicePriceBook = {
  "anthropic:claude-opus-4-5": {
    llm: {
      cachedInputPerMillionTokensUsd: 1.5,
      inputPerMillionTokensUsd: 15,
      outputPerMillionTokensUsd: 75,
    },
  },
  "anthropic:claude-sonnet-4-5": {
    llm: {
      cachedInputPerMillionTokensUsd: 0.3,
      inputPerMillionTokensUsd: 3,
      outputPerMillionTokensUsd: 15,
    },
  },
  "assemblyai:streaming": { stt: { perSecondUsd: 0.000_18 } },
  "azure:tts-neural": { tts: { perMillionCharactersUsd: 16 } },
  "cartesia:sonic-2": { tts: { perMillionCharactersUsd: 65 } },
  "deepgram:nova-3": { stt: { perSecondUsd: 0.000_077 } },
  "elevenlabs:flash-v2-5": { tts: { perMillionCharactersUsd: 50 } },
  "openai:gpt-4o-mini": {
    llm: {
      cachedInputPerMillionTokensUsd: 0.075,
      inputPerMillionTokensUsd: 0.15,
      outputPerMillionTokensUsd: 0.6,
    },
  },
  "openai:gpt-4o-realtime": {
    llm: {
      cachedInputPerMillionTokensUsd: 2.5,
      inputPerMillionTokensUsd: 5,
      outputPerMillionTokensUsd: 20,
    },
  },
  "openai:whisper-1": { stt: { perSecondUsd: 0.0001 } },
  telnyx: { telephony: { perMinuteUsd: 0.007 } },
  twilio: { telephony: { perMinuteUsd: 0.014 } },
};

export type VoiceCostLLMRecord = {
  cachedInputTokens?: number;
  inputTokens?: number;
  model?: string;
  outputTokens?: number;
  provider?: string;
};

export type VoiceCostTTSRecord = {
  audioMs?: number;
  characters?: number;
  provider?: string;
  voice?: string;
};

export type VoiceCostSTTRecord = {
  audioMs: number;
  model?: string;
  provider?: string;
};

export type VoiceCostTelephonyRecord = {
  minutes: number;
  provider?: string;
};

export type VoiceCostBreakdown = {
  llm: {
    cachedInputTokens: number;
    inputTokens: number;
    outputTokens: number;
    usd: number;
  };
  sessionId?: string;
  stt: {
    audioMs: number;
    usd: number;
  };
  telephony: {
    minutes: number;
    usd: number;
  };
  totalUsd: number;
  tts: {
    audioMs: number;
    characters: number;
    usd: number;
  };
};

export type VoiceCostAccountant = {
  recordLLM: (usage: VoiceCostLLMRecord) => void;
  recordSTT: (input: VoiceCostSTTRecord) => void;
  recordTTS: (input: VoiceCostTTSRecord) => void;
  recordTelephony: (input: VoiceCostTelephonyRecord) => void;
  snapshot: () => VoiceCostBreakdown;
};

const resolveProviderKey = (provider?: string, model?: string) => {
  if (provider && model) {
    return `${provider.toLowerCase()}:${model.toLowerCase()}`;
  }
  if (provider) {
    return provider.toLowerCase();
  }

  return undefined;
};

const lookupRates = (
  priceBook: VoicePriceBook,
  provider?: string,
  model?: string,
): VoiceProviderRates | undefined => {
  const exactKey = resolveProviderKey(provider, model);
  if (exactKey && priceBook[exactKey]) {
    return priceBook[exactKey];
  }
  const providerKey = provider?.toLowerCase();
  if (providerKey && priceBook[providerKey]) {
    return priceBook[providerKey];
  }

  return undefined;
};

export type CreateVoiceCostAccountantOptions = {
  priceBook?: VoicePriceBook;
  sessionId?: string;
};

export const createVoiceCostAccountant = (
  options: CreateVoiceCostAccountantOptions = {},
): VoiceCostAccountant => {
  const priceBook = options.priceBook ?? DEFAULT_VOICE_PRICE_BOOK;
  let llmInput = 0;
  let llmCachedInput = 0;
  let llmOutput = 0;
  let llmUsd = 0;
  let ttsCharacters = 0;
  let ttsAudioMs = 0;
  let ttsUsd = 0;
  let sttAudioMs = 0;
  let sttUsd = 0;
  let telephonyMinutes = 0;
  let telephonyUsd = 0;

  return {
    recordLLM: (usage) => {
      const input = usage.inputTokens ?? 0;
      const cached = usage.cachedInputTokens ?? 0;
      const output = usage.outputTokens ?? 0;
      llmInput += input;
      llmCachedInput += cached;
      llmOutput += output;
      const rates = lookupRates(priceBook, usage.provider, usage.model)?.llm;
      if (!rates) {
        return;
      }
      const cachedRate =
        rates.cachedInputPerMillionTokensUsd ?? rates.inputPerMillionTokensUsd;
      llmUsd +=
        (Math.max(0, input - cached) * rates.inputPerMillionTokensUsd) /
          1_000_000 +
        (cached * cachedRate) / 1_000_000 +
        (output * rates.outputPerMillionTokensUsd) / 1_000_000;
    },
    recordSTT: (input) => {
      sttAudioMs += Math.max(0, input.audioMs);
      const rates = lookupRates(priceBook, input.provider, input.model)?.stt;
      if (!rates) {
        return;
      }
      sttUsd += (Math.max(0, input.audioMs) / 1_000) * rates.perSecondUsd;
    },
    recordTelephony: (input) => {
      telephonyMinutes += Math.max(0, input.minutes);
      const rates = lookupRates(priceBook, input.provider)?.telephony;
      if (!rates) {
        return;
      }
      telephonyUsd += Math.max(0, input.minutes) * rates.perMinuteUsd;
    },
    recordTTS: (input) => {
      const chars = input.characters ?? 0;
      const audioMs = input.audioMs ?? 0;
      ttsCharacters += chars;
      ttsAudioMs += audioMs;
      const rates = lookupRates(priceBook, input.provider, input.voice)?.tts;
      if (!rates) {
        return;
      }
      if (rates.perMillionCharactersUsd !== undefined && chars > 0) {
        ttsUsd += (chars * rates.perMillionCharactersUsd) / 1_000_000;
      } else if (rates.perSecondUsd !== undefined && audioMs > 0) {
        ttsUsd += (audioMs / 1_000) * rates.perSecondUsd;
      }
    },
    snapshot: () => ({
      llm: {
        cachedInputTokens: llmCachedInput,
        inputTokens: llmInput,
        outputTokens: llmOutput,
        usd: Math.round(llmUsd * 1_000_000) / 1_000_000,
      },
      sessionId: options.sessionId,
      stt: {
        audioMs: sttAudioMs,
        usd: Math.round(sttUsd * 1_000_000) / 1_000_000,
      },
      telephony: {
        minutes: telephonyMinutes,
        usd: Math.round(telephonyUsd * 1_000_000) / 1_000_000,
      },
      totalUsd:
        Math.round((llmUsd + ttsUsd + sttUsd + telephonyUsd) * 1_000_000) /
        1_000_000,
      tts: {
        audioMs: ttsAudioMs,
        characters: ttsCharacters,
        usd: Math.round(ttsUsd * 1_000_000) / 1_000_000,
      },
    }),
  };
};
