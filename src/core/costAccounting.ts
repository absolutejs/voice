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
  "anthropic:claude-haiku-4-5-20251001": {
    llm: {
      cachedInputPerMillionTokensUsd: 0.1,
      inputPerMillionTokensUsd: 1,
      outputPerMillionTokensUsd: 5,
    },
  },
  "anthropic:claude-opus-4-5": {
    llm: {
      cachedInputPerMillionTokensUsd: 1.5,
      inputPerMillionTokensUsd: 15,
      outputPerMillionTokensUsd: 75,
    },
  },
  "anthropic:claude-opus-4-6": {
    llm: {
      cachedInputPerMillionTokensUsd: 0.5,
      inputPerMillionTokensUsd: 5,
      outputPerMillionTokensUsd: 25,
    },
  },
  "anthropic:claude-sonnet-4-5": {
    llm: {
      cachedInputPerMillionTokensUsd: 0.3,
      inputPerMillionTokensUsd: 3,
      outputPerMillionTokensUsd: 15,
    },
  },
  "anthropic:claude-sonnet-4-6": {
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
  "openai:gpt-4.1": {
    llm: {
      cachedInputPerMillionTokensUsd: 0.5,
      inputPerMillionTokensUsd: 2,
      outputPerMillionTokensUsd: 8,
    },
  },
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

// Per-vendor slice of a channel's cost+usage for a call. `byProvider` on each
// channel lists one of these per vendor that did work, so a mid-call failover
// (e.g. LLM openai→anthropic) shows EXACTLY where each dollar went, not just the
// dominant vendor. Units are channel-specific (only the relevant ones are set).
export type VoiceCostProviderSlice = {
  provider: string;
  usd: number;
  cachedInputTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  characters?: number;
  audioMs?: number;
  minutes?: number;
};

export type VoiceCostBreakdown = {
  llm: {
    cachedInputTokens: number;
    inputTokens: number;
    outputTokens: number;
    // Single source of truth for WHO spent what on this channel — one entry per
    // vendor, summing (the attributed part) to the channel `usd`. Derive a
    // dominant vendor from this if needed; there's no separate `provider` field.
    byProvider: VoiceCostProviderSlice[];
    usd: number;
  };
  sessionId?: string;
  stt: {
    audioMs: number;
    byProvider: VoiceCostProviderSlice[];
    usd: number;
  };
  telephony: {
    minutes: number;
    byProvider: VoiceCostProviderSlice[];
    usd: number;
  };
  totalUsd: number;
  tts: {
    audioMs: number;
    characters: number;
    byProvider: VoiceCostProviderSlice[];
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

  // The single source of truth for per-vendor attribution: one accumulating slice
  // per (channel, vendor). The channel totals above are just the headline
  // aggregate; these explain exactly where the spend went (incl. mid-call
  // failover). A vendor is registered the moment it does any work, even at $0.
  const llmSlices = new Map<string, VoiceCostProviderSlice>();
  const ttsSlices = new Map<string, VoiceCostProviderSlice>();
  const sttSlices = new Map<string, VoiceCostProviderSlice>();
  const telephonySlices = new Map<string, VoiceCostProviderSlice>();
  const sliceFor = (
    slices: Map<string, VoiceCostProviderSlice>,
    provider: string,
  ): VoiceCostProviderSlice => {
    let slice = slices.get(provider);
    if (!slice) {
      slice = { provider, usd: 0 };
      slices.set(provider, slice);
    }

    return slice;
  };
  const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
  const finalizeSlices = (slices: Map<string, VoiceCostProviderSlice>) =>
    [...slices.values()].map((slice) => ({ ...slice, usd: round6(slice.usd) }));

  return {
    recordLLM: (usage) => {
      const input = usage.inputTokens ?? 0;
      const cached = usage.cachedInputTokens ?? 0;
      const output = usage.outputTokens ?? 0;
      llmInput += input;
      llmCachedInput += cached;
      llmOutput += output;
      const rates = lookupRates(priceBook, usage.provider, usage.model)?.llm;
      let delta = 0;
      if (rates) {
        const cachedRate =
          rates.cachedInputPerMillionTokensUsd ??
          rates.inputPerMillionTokensUsd;
        delta =
          (Math.max(0, input - cached) * rates.inputPerMillionTokensUsd) /
            1_000_000 +
          (cached * cachedRate) / 1_000_000 +
          (output * rates.outputPerMillionTokensUsd) / 1_000_000;
        llmUsd += delta;
      }
      if (usage.provider) {
        const slice = sliceFor(llmSlices, usage.provider);
        slice.usd += delta;
        slice.inputTokens = (slice.inputTokens ?? 0) + input;
        slice.outputTokens = (slice.outputTokens ?? 0) + output;
        slice.cachedInputTokens = (slice.cachedInputTokens ?? 0) + cached;
      }
    },
    recordSTT: (input) => {
      const audioMs = Math.max(0, input.audioMs);
      sttAudioMs += audioMs;
      const rates = lookupRates(priceBook, input.provider, input.model)?.stt;
      let delta = 0;
      if (rates) {
        delta = (audioMs / 1_000) * rates.perSecondUsd;
        sttUsd += delta;
      }
      if (input.provider) {
        const slice = sliceFor(sttSlices, input.provider);
        slice.usd += delta;
        slice.audioMs = (slice.audioMs ?? 0) + audioMs;
      }
    },
    recordTelephony: (input) => {
      const minutes = Math.max(0, input.minutes);
      telephonyMinutes += minutes;
      const rates = lookupRates(priceBook, input.provider)?.telephony;
      let delta = 0;
      if (rates) {
        delta = minutes * rates.perMinuteUsd;
        telephonyUsd += delta;
      }
      if (input.provider) {
        const slice = sliceFor(telephonySlices, input.provider);
        slice.usd += delta;
        slice.minutes = (slice.minutes ?? 0) + minutes;
      }
    },
    recordTTS: (input) => {
      const chars = input.characters ?? 0;
      const audioMs = input.audioMs ?? 0;
      ttsCharacters += chars;
      ttsAudioMs += audioMs;
      const rates = lookupRates(priceBook, input.provider, input.voice)?.tts;
      let delta = 0;
      if (rates) {
        if (rates.perMillionCharactersUsd !== undefined && chars > 0) {
          delta = (chars * rates.perMillionCharactersUsd) / 1_000_000;
        } else if (rates.perSecondUsd !== undefined && audioMs > 0) {
          delta = (audioMs / 1_000) * rates.perSecondUsd;
        }
        ttsUsd += delta;
      }
      if (input.provider) {
        const slice = sliceFor(ttsSlices, input.provider);
        slice.usd += delta;
        slice.characters = (slice.characters ?? 0) + chars;
        slice.audioMs = (slice.audioMs ?? 0) + audioMs;
      }
    },
    snapshot: () => ({
      llm: {
        byProvider: finalizeSlices(llmSlices),
        cachedInputTokens: llmCachedInput,
        inputTokens: llmInput,
        outputTokens: llmOutput,
        usd: round6(llmUsd),
      },
      sessionId: options.sessionId,
      stt: {
        audioMs: sttAudioMs,
        byProvider: finalizeSlices(sttSlices),
        usd: round6(sttUsd),
      },
      telephony: {
        byProvider: finalizeSlices(telephonySlices),
        minutes: telephonyMinutes,
        usd: round6(telephonyUsd),
      },
      totalUsd: round6(llmUsd + ttsUsd + sttUsd + telephonyUsd),
      tts: {
        audioMs: ttsAudioMs,
        byProvider: finalizeSlices(ttsSlices),
        characters: ttsCharacters,
        usd: round6(ttsUsd),
      },
    }),
  };
};
