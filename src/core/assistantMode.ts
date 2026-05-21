import type { CreateVoiceSessionOptions, VoiceSessionRecord } from "./types";

export type VoiceAssistantMode = "cascade" | "s2s";

export type VoiceSemanticVADConfig = {
  createResponseAutomatically?: boolean;
  eagerness?: "auto" | "high" | "low" | "medium";
  silenceDurationMs?: number;
};

export type VoiceAssistantModality = "audio" | "text";

export const resolveVoiceAssistantMode = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: Pick<
    CreateVoiceSessionOptions<TContext, TSession, TResult>,
    "realtime" | "stt" | "tts"
  > & { assistantMode?: VoiceAssistantMode },
): VoiceAssistantMode => {
  if (options.assistantMode) {
    return options.assistantMode;
  }
  if (options.realtime) {
    return "s2s";
  }
  return "cascade";
};

export type VoiceAssistantModeDescriptor = {
  hasRealtime: boolean;
  hasSTT: boolean;
  hasTTS: boolean;
  mode: VoiceAssistantMode;
  modalities: VoiceAssistantModality[];
};

export const describeVoiceAssistantMode = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: Pick<
    CreateVoiceSessionOptions<TContext, TSession, TResult>,
    "realtime" | "stt" | "tts"
  > & {
    assistantMode?: VoiceAssistantMode;
    modalities?: ReadonlyArray<VoiceAssistantModality>;
  },
): VoiceAssistantModeDescriptor => {
  const mode = resolveVoiceAssistantMode(options);
  const modalities: VoiceAssistantModality[] = options.modalities
    ? Array.from(new Set(options.modalities))
    : ["audio"];
  return {
    hasRealtime: Boolean(options.realtime),
    hasSTT: Boolean(options.stt),
    hasTTS: Boolean(options.tts),
    modalities,
    mode,
  };
};
