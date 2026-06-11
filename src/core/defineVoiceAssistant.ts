import {
  type VoiceAssistant,
  type VoiceAssistantAgentSource,
  type VoiceAssistantGuardrails,
  type VoiceAssistantMemoryLifecycle,
  type VoiceAssistantOptions,
  createVoiceAssistant,
} from "./assistant";
import type {
  AudioFormat,
  CreateVoiceSessionOptions,
  RealtimeAdapter,
  STTAdapter,
  TTSAdapter,
  VoiceLanguageStrategy,
  VoiceLexiconEntry,
  VoicePhraseHint,
  VoiceReconnectConfig,
  VoiceResolvedSTTFallbackConfig,
  VoiceResolvedAudioConditioningConfig,
  VoiceResolvedTurnDetectionConfig,
  VoiceRouteConfig,
  VoiceSessionRecord,
  VoiceSessionRecordingConfig,
  VoiceSessionStore,
  VoiceSocket,
  VoiceSTTLifecycle,
  VoiceTTSProsody,
  VoiceTurnDetectionConfig,
} from "./types";
import type { VoiceAssistantMemoryOptions } from "./assistantMemory";
import type { VoiceAgentTool } from "./agent";
import type { VoiceAMDDetector } from "./amdDetector";
import type { VoiceCostAccountant } from "./costAccounting";
import type { VoiceTraceEventStore } from "./trace";
import type { VoiceTranscriptRedactor } from "./redaction";
import type { VoiceSemanticTurnDetector } from "./semanticTurn";
import type { VoiceAssistantMode } from "./assistantMode";
import type { VoiceRuntimeOpsConfig } from "./types";

const DEFAULT_SPEECH_THRESHOLD = 0.015;
const DEFAULT_SILENCE_MS = 700;
const DEFAULT_TRANSCRIPT_STABILITY_MS = 200;
const DEFAULT_MIN_SILENCE_MS = 400;

const resolveTurnDetection = (
  input?: VoiceTurnDetectionConfig,
): VoiceResolvedTurnDetectionConfig => {
  const silenceMs = input?.silenceMs ?? DEFAULT_SILENCE_MS;

  return {
    profile: input?.profile ?? "balanced",
    qualityProfile: input?.qualityProfile ?? "general",
    minSilenceMs: Math.min(silenceMs, input?.minSilenceMs ?? DEFAULT_MIN_SILENCE_MS),
    silenceMs,
    speechThreshold: input?.speechThreshold ?? DEFAULT_SPEECH_THRESHOLD,
    transcriptStabilityMs:
      input?.transcriptStabilityMs ?? DEFAULT_TRANSCRIPT_STABILITY_MS,
  };
};

const resolveReconnect = (
  input?: Partial<VoiceReconnectConfig>,
): Required<VoiceReconnectConfig> => ({
  maxAttempts: input?.maxAttempts ?? 3,
  strategy: input?.strategy ?? "resume-last-turn",
  timeout: input?.timeout ?? 30_000,
});

export type VoiceAssistantVoiceConfig = {
  prosody?: VoiceTTSProsody;
  realtime?: RealtimeAdapter;
  realtimeInputFormat?: AudioFormat;
  stt?: STTAdapter;
  sttFallback?: VoiceResolvedSTTFallbackConfig;
  tts?: TTSAdapter;
};

export type VoiceAssistantObservabilityConfig = {
  costAccountant?: VoiceCostAccountant;
  costTelephony?: { provider?: string };
  recording?: VoiceSessionRecordingConfig;
  trace?: VoiceTraceEventStore;
};

export type VoiceAssistantDefinition<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  agent: VoiceAssistantAgentSource<TContext, TSession, TResult>;
  amd?: VoiceAMDDetector<TContext, TSession, TResult>;
  assistantMode?: VoiceAssistantMode;
  audioConditioning?: VoiceResolvedAudioConditioningConfig;
  callSilenceTimeoutMs?: number;
  guardrails?: VoiceAssistantGuardrails<TContext, TSession, TResult>;
  id: string;
  languageStrategy?: VoiceLanguageStrategy;
  lexicon?: VoiceLexiconEntry[];
  memory?: VoiceAssistantMemoryOptions<TContext, TSession>;
  memoryLifecycle?: VoiceAssistantMemoryLifecycle<TContext, TSession, TResult>;
  metadata?: Record<string, unknown>;
  modalities?: ReadonlyArray<"audio" | "text">;
  ops?: VoiceRuntimeOpsConfig<TContext, TSession, TResult>;
  observability?: VoiceAssistantObservabilityConfig;
  phraseHints?: VoicePhraseHint[];
  redact?: VoiceTranscriptRedactor;
  route?: Partial<VoiceRouteConfig<TContext, TSession, TResult>>;
  semanticTurnDetector?: VoiceSemanticTurnDetector;
  tools?: ReadonlyArray<
    VoiceAgentTool<
      TContext,
      TSession,
      Record<string, unknown>,
      unknown,
      TResult
    >
  >;
  turnDetection?: VoiceTurnDetectionConfig;
  voice: VoiceAssistantVoiceConfig;
};

export type VoiceAssistantSessionInput<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = {
  context: TContext;
  id: string;
  reconnect?: Partial<VoiceReconnectConfig>;
  scenarioId?: string;
  sessionMetadata?: Record<string, unknown>;
  socket: VoiceSocket;
  sttLifecycle?: VoiceSTTLifecycle;
  store: VoiceSessionStore<TSession>;
};

export type DefinedVoiceAssistant<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  assistant: VoiceAssistant<TContext, TSession, TResult>;
  definition: VoiceAssistantDefinition<TContext, TSession, TResult>;
  id: string;
  toSessionOptions: (
    input: VoiceAssistantSessionInput<TContext, TSession>,
  ) => CreateVoiceSessionOptions<TContext, TSession, TResult>;
};

const buildAssistantOptions = <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  def: VoiceAssistantDefinition<TContext, TSession, TResult>,
): VoiceAssistantOptions<TContext, TSession, TResult> => ({
  ...def.agent,
  guardrails: def.guardrails,
  id: def.id,
  memory: def.memory,
  memoryLifecycle: def.memoryLifecycle,
  ops: def.ops,
});

export const defineVoiceAssistant = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  definition: VoiceAssistantDefinition<TContext, TSession, TResult>,
): DefinedVoiceAssistant<TContext, TSession, TResult> => {
  const assistantOptions = buildAssistantOptions(definition);
  const assistant = createVoiceAssistant(assistantOptions);

  return {
    assistant,
    definition,
    id: definition.id,
    toSessionOptions: (input) => {
      const route = assistant.route(definition.route ?? {});
      const observability = definition.observability ?? {};

      return {
        amd: definition.amd,
        assistantMode: definition.assistantMode,
        audioConditioning: definition.audioConditioning,
        callSilenceTimeoutMs: definition.callSilenceTimeoutMs,
        context: input.context,
        costAccountant: observability.costAccountant,
        costTelephony: observability.costTelephony,
        id: input.id,
        languageStrategy: definition.languageStrategy,
        lexicon: definition.lexicon,
        modalities: definition.modalities,
        phraseHints: definition.phraseHints,
        prosody: definition.voice.prosody,
        realtime: definition.voice.realtime,
        realtimeInputFormat: definition.voice.realtimeInputFormat,
        reconnect: resolveReconnect(input.reconnect),
        recording: observability.recording,
        redact: definition.redact,
        route,
        scenarioId: input.scenarioId,
        semanticTurnDetector: definition.semanticTurnDetector,
        sessionMetadata: { ...definition.metadata, ...input.sessionMetadata },
        socket: input.socket,
        store: input.store,
        stt: definition.voice.stt,
        sttFallback: definition.voice.sttFallback,
        sttLifecycle: input.sttLifecycle ?? "continuous",
        trace: observability.trace,
        tts: definition.voice.tts,
        turnDetection: resolveTurnDetection(definition.turnDetection),
      };
    },
  };
};
