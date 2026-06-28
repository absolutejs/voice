import type {
  MediaWebRTCStatsCollector,
  MediaWebRTCStatsReport,
  MediaWebRTCStatsReportInput,
  MediaWebRTCStreamContinuityInput,
  MediaWebRTCStreamContinuityReport,
} from "@absolutejs/media";
import type {
  VoiceOpsDispositionTaskPolicies,
  VoiceOpsTaskAssignmentRule,
  VoiceOpsTaskAssignmentRules,
  VoiceIntegrationWebhookConfig,
  StoredVoiceIntegrationEvent,
  StoredVoiceOpsTask,
  VoiceIntegrationEventStore,
  VoiceOpsTaskPolicy,
  VoiceOpsTask,
  VoiceOpsTaskStore,
} from "./ops";
import type { VoiceIntegrationSink } from "./opsSinks";
import type {
  StoredVoiceCallReviewArtifact,
  VoiceCallReviewArtifact,
  VoiceCallReviewStore,
} from "../testing/review";
import type { VoiceTraceEventStore } from "./trace";
import type { VoiceLiveOpsControlState } from "./liveOps";
import type { VoiceAuditActor, VoiceAuditEventStore } from "./audit";
import type {
  VoiceProfileSwitchGuardDecision,
  VoiceProfileSwitchGuardMode,
  VoiceProfileSwitchObservedSignals,
} from "./profileSwitchRecommendation";
import type {
  VoiceRealCallProfileDefaultsReport,
  VoiceRealCallProfileHistoryReport,
} from "./proofTrends";

export type AudioFormat = {
  container: "raw";
  encoding: "alaw" | "mulaw" | "pcm_s16le";
  sampleRateHz: number;
  channels: 1 | 2;
};

export type AudioChunk = ArrayBuffer | ArrayBufferView;

/**
 * Structural contract for an inbound noise suppressor applied before STT.
 * Matches `@absolutejs/media`'s `NoiseSuppressor`, so any media suppressor
 * (`createFFmpegNoiseSuppressor`, `createEnergyGateNoiseSuppressor`, a Krisp
 * adapter, etc.) satisfies it without a hard import.
 */
export type VoiceNoiseSuppressor = {
  readonly kind: string;
  process: (input: {
    format: AudioFormat;
    pcm: ArrayBuffer | ArrayBufferView;
  }) =>
    | Promise<{ bytes: Uint8Array; format: AudioFormat }>
    | { bytes: Uint8Array; format: AudioFormat };
  close?: () => Promise<void> | void;
};

export type VoiceLanguageStrategy =
  | {
      mode: "auto-detect";
      allowedLanguages?: string[];
    }
  | {
      mode: "fixed";
      primaryLanguage: string;
      secondaryLanguages?: string[];
    }
  | {
      mode: "allow-switching";
      primaryLanguage?: string;
      secondaryLanguages: string[];
    };

export type VoiceLanguageStrategyResolver<TContext = unknown> = (input: {
  context: TContext;
  scenarioId?: string;
  sessionId: string;
}) =>
  | Promise<VoiceLanguageStrategy | void>
  | VoiceLanguageStrategy
  | void;

export type VoicePhraseHint = {
  text: string;
  aliases?: string[];
  boost?: number;
  metadata?: Record<string, unknown>;
};

export type VoiceCorrectionRiskTier = "safe" | "balanced" | "risky";

export type VoiceDomainTerm = {
  text: string;
  aliases?: string[];
  boost?: number;
  language?: string;
  metadata?: Record<string, unknown>;
  pronunciation?: string;
};

export type VoiceLexiconEntry = {
  text: string;
  aliases?: string[];
  language?: string;
  metadata?: Record<string, unknown>;
  pronunciation?: string;
};

export type VoiceTranscriptSentiment = {
  label: "negative" | "neutral" | "positive" | (string & {});
  metadata?: Record<string, unknown>;
  score?: number;
};

export type Transcript = {
  id: string;
  text: string;
  isFinal: boolean;
  confidence?: number;
  language?: string;
  sentiment?: VoiceTranscriptSentiment;
  speaker?: string | number;
  startedAtMs?: number;
  endedAtMs?: number;
  vendor?: string;
};

export type VoiceTranscriptQuality = {
  averageConfidence?: number;
  confidenceSampleCount: number;
  correction?: VoiceTurnCorrectionDiagnostics;
  cost?: VoiceTurnCostEstimate;
  fallbackUsed: boolean;
  finalTranscriptCount: number;
  fallback?: VoiceFallbackDiagnostics;
  partialTranscriptCount: number;
  selectedTranscriptCount: number;
  source: "fallback" | "primary";
};

export type VoiceTurnCorrectionDiagnostics = {
  attempted: boolean;
  changed: boolean;
  correctedText: string;
  metadata?: Record<string, unknown>;
  originalText: string;
  provider?: string;
  reason?: string;
};

export type VoiceTurnCostEstimate = {
  estimatedRelativeCostUnits: number;
  fallbackAttemptCount: number;
  fallbackReplayAudioMs: number;
  primaryAudioMs: number;
  totalBillableAudioMs: number;
};

export type VoiceFallbackSelectionReason =
  | "fallback-empty"
  | "primary-empty"
  | "word-count-margin"
  | "confidence-margin"
  | "word-count-tiebreak"
  | "kept-primary";

export type VoiceFallbackDiagnostics = {
  attempted: boolean;
  fallbackConfidence?: number;
  fallbackText?: string;
  fallbackWordCount?: number;
  primaryConfidence: number;
  primaryText: string;
  primaryWordCount: number;
  selected: boolean;
  selectionReason: VoiceFallbackSelectionReason;
  trigger:
    | "empty-turn"
    | "low-confidence"
    | "empty-or-low-confidence"
    | "always";
};

export type VoicePartialEvent = {
  type: "partial";
  transcript: Transcript;
  receivedAt: number;
};

export type VoiceFinalEvent = {
  type: "final";
  transcript: Transcript;
  receivedAt: number;
};

export type VoiceEndOfTurnEvent = {
  type: "endOfTurn";
  reason: "vendor" | "silence" | "manual";
  receivedAt: number;
};

export type VoiceErrorEvent = {
  type: "error";
  error: Error;
  recoverable: boolean;
  code?: string;
};

export type VoiceCloseEvent = {
  type: "close";
  code?: number;
  reason?: string;
  recoverable?: boolean;
};

export type STTSessionEventMap = {
  partial: VoicePartialEvent;
  final: VoiceFinalEvent;
  endOfTurn: VoiceEndOfTurnEvent;
  error: VoiceErrorEvent;
  close: VoiceCloseEvent;
};

export type STTAdapterSession = {
  on: <K extends keyof STTSessionEventMap>(
    event: K,
    handler: (payload: STTSessionEventMap[K]) => void | Promise<void>,
  ) => () => void;
  send: (audio: AudioChunk) => Promise<void>;
  close: (reason?: string) => Promise<void>;
};

export type STTAdapterOpenOptions = {
  sessionId: string;
  format: AudioFormat;
  languageStrategy?: VoiceLanguageStrategy;
  lexicon?: VoiceLexiconEntry[];
  phraseHints?: VoicePhraseHint[];
  signal?: AbortSignal;
};

export type STTAdapter<
  TOptions extends STTAdapterOpenOptions = STTAdapterOpenOptions,
> = {
  kind: "stt";
  open: (options: TOptions) => Promise<STTAdapterSession> | STTAdapterSession;
};

export type TTSAudioEvent = {
  type: "audio";
  chunk: AudioChunk;
  format: AudioFormat;
  receivedAt: number;
};

export type TTSSessionEventMap = {
  audio: TTSAudioEvent;
  error: VoiceErrorEvent;
  close: VoiceCloseEvent;
};

export type TTSAdapterSession = {
  on: <K extends keyof TTSSessionEventMap>(
    event: K,
    handler: (payload: TTSSessionEventMap[K]) => void | Promise<void>,
  ) => () => void;
  send: (text: string) => Promise<void>;
  cancel?: (reason?: string) => Promise<void>;
  close: (reason?: string) => Promise<void>;
};

export const ttsAdapterSessionCanCancel = (
  session: TTSAdapterSession,
): session is TTSAdapterSession & {
  cancel: (reason?: string) => Promise<void>;
} => typeof session.cancel === "function";

export type VoiceTTSProsody = {
  emphasis?: number;
  pitch?: number;
  speed?: number;
  style?: string;
};

export type TTSAdapterOpenOptions = {
  sessionId: string;
  lexicon?: VoiceLexiconEntry[];
  prosody?: VoiceTTSProsody;
  signal?: AbortSignal;
};

export type TTSAdapter<
  TOptions extends TTSAdapterOpenOptions = TTSAdapterOpenOptions,
> = {
  kind: "tts";
  open: (options: TOptions) => Promise<TTSAdapterSession> | TTSAdapterSession;
};

export type RealtimeSessionEventMap = STTSessionEventMap & {
  audio: TTSAudioEvent;
};

export type RealtimeAdapterSession = {
  on: <K extends keyof RealtimeSessionEventMap>(
    event: K,
    handler: (payload: RealtimeSessionEventMap[K]) => void | Promise<void>,
  ) => () => void;
  send: (input: AudioChunk | string) => Promise<void>;
  close: (reason?: string) => Promise<void>;
};

export type RealtimeAdapterOpenOptions = {
  sessionId: string;
  format: AudioFormat;
  languageStrategy?: VoiceLanguageStrategy;
  lexicon?: VoiceLexiconEntry[];
  modalities?: ReadonlyArray<"audio" | "text">;
  phraseHints?: VoicePhraseHint[];
  promptCacheKey?: string;
  semanticVAD?: import("./assistantMode").VoiceSemanticVADConfig;
  signal?: AbortSignal;
};

export type RealtimeAdapter<
  TOptions extends RealtimeAdapterOpenOptions = RealtimeAdapterOpenOptions,
> = {
  kind: "realtime";
  open: (
    options: TOptions,
  ) => Promise<RealtimeAdapterSession> | RealtimeAdapterSession;
};

export type VoiceSessionStatus =
  | "active"
  | "reconnecting"
  | "completed"
  | "failed";

export type VoiceReconnectClientStatus =
  | "idle"
  | "reconnecting"
  | "resumed"
  | "exhausted";

export type VoiceReconnectClientState = {
  attempts: number;
  lastDisconnectAt?: number;
  lastResumedAt?: number;
  maxAttempts: number;
  nextAttemptAt?: number;
  status: VoiceReconnectClientStatus;
};

export type VoiceTurnCitation = {
  chunkId: string;
  score: number;
  source?: string;
  title?: string;
};

export type VoiceTurnRecord<TResult = unknown> = {
  id: string;
  text: string;
  quality?: VoiceTranscriptQuality;
  transcripts: Transcript[];
  assistantText?: string;
  attachments?: import("./agent").VoiceAgentMessageAttachment[];
  citations?: VoiceTurnCitation[];
  committedAt: number;
  result?: TResult;
};

export type VoiceCostTelemetryConfig<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  fallbackPassCostUnit?: number;
  onTurnCost?: (input: {
    api: VoiceSessionHandle<TContext, TSession, TResult>;
    context: TContext;
    estimate: VoiceTurnCostEstimate;
    session: TSession;
    turn: VoiceTurnRecord<TResult>;
  }) => Promise<void> | void;
  primaryPassCostUnit?: number;
};

export type VoiceSessionRecord<
  TMeta = Record<string, never>,
  TResult = unknown,
> = {
  id: string;
  createdAt: number;
  lastActivityAt?: number;
  status: VoiceSessionStatus;
  transcripts: Transcript[];
  currentTurn: {
    transcripts: Transcript[];
    partialText: string;
    partialStartedAt?: number;
    partialEndedAt?: number;
    finalText: string;
    lastAudioAt?: number;
    lastSpeechAt?: number;
    lastTranscriptAt?: number;
    silenceStartedAt?: number;
  };
  turns: VoiceTurnRecord<TResult>[];
  committedTurnIds: string[];
  reconnect: {
    attempts: number;
    lastDisconnectAt?: number;
  };
  lastCommittedTurn?: {
    signature: string;
    text: string;
    transcriptIds: string[];
    committedAt: number;
  };
  call?: VoiceCallLifecycleState;
  metadata?: TMeta;
  scenarioId?: string;
};

export type VoiceSessionSummary = {
  id: string;
  createdAt: number;
  lastActivityAt?: number;
  status: VoiceSessionStatus;
  turnCount: number;
};

export type VoiceCallDisposition =
  | "completed"
  | "transferred"
  | "escalated"
  | "voicemail"
  | "no-answer"
  | "failed"
  | "silence-timeout"
  | "closed";

export type VoiceCallLifecycleEvent = {
  at: number;
  type: "start" | "end" | "transfer" | "escalation" | "voicemail" | "no-answer";
  disposition?: VoiceCallDisposition;
  metadata?: Record<string, unknown>;
  reason?: string;
  target?: string;
};

export type VoiceCallLifecycleState = {
  disposition?: VoiceCallDisposition;
  endedAt?: number;
  events: VoiceCallLifecycleEvent[];
  lastEventAt: number;
  startedAt: number;
};

export type VoiceHandoffAction =
  | "escalate"
  | "no-answer"
  | "transfer"
  | "voicemail";

export type VoiceHandoffStatus = "delivered" | "failed" | "skipped";

export type VoiceHandoffResult = {
  deliveredAt?: number;
  deliveredTo?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  status: VoiceHandoffStatus;
};

export type VoiceHandoffDeliveryQueueStatus = VoiceHandoffStatus | "pending";

export type StoredVoiceHandoffDelivery<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  action: VoiceHandoffAction;
  context: TContext;
  createdAt: number;
  deliveredAt?: number;
  deliveries?: Record<
    string,
    VoiceHandoffResult & {
      adapterId: string;
      adapterKind?: string;
    }
  >;
  deliveryAttempts?: number;
  deliveryError?: string;
  deliveryStatus: VoiceHandoffDeliveryQueueStatus;
  id: string;
  metadata?: Record<string, unknown>;
  reason?: string;
  result?: TResult;
  session: TSession;
  sessionId: string;
  target?: string;
  updatedAt: number;
};

export type VoiceHandoffDeliveryStore<
  TDelivery extends StoredVoiceHandoffDelivery = StoredVoiceHandoffDelivery,
> = {
  get: (id: string) => Promise<TDelivery | undefined> | TDelivery | undefined;
  list: () => Promise<TDelivery[]> | TDelivery[];
  remove: (id: string) => Promise<void> | void;
  set: (id: string, delivery: TDelivery) => Promise<void> | void;
};

export type VoiceHandoffInput<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  action: VoiceHandoffAction;
  api: VoiceSessionHandle<TContext, TSession, TResult>;
  context: TContext;
  metadata?: Record<string, unknown>;
  reason?: string;
  result?: TResult;
  session: TSession;
  target?: string;
};

export type VoiceHandoffAdapter<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  actions?: VoiceHandoffAction[];
  handoff: (
    input: VoiceHandoffInput<TContext, TSession, TResult>,
  ) => Promise<VoiceHandoffResult> | VoiceHandoffResult;
  id: string;
  kind?: string;
};

export type VoiceHandoffConfig<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  adapters: VoiceHandoffAdapter<TContext, TSession, TResult>[];
  deliveryQueue?: VoiceHandoffDeliveryStore<
    StoredVoiceHandoffDelivery<TContext, TSession, TResult>
  >;
  enqueueOnly?: boolean;
  failMode?: "record" | "throw";
};

export type VoiceSessionStore<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = {
  get: (id: string) => Promise<TSession | undefined>;
  getOrCreate: (id: string) => Promise<TSession>;
  set: (id: string, value: TSession) => Promise<void>;
  list: () => Promise<VoiceSessionSummary[]>;
  remove: (id: string) => Promise<void>;
};

export type VoiceLogger = {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
};

export type VoiceReconnectConfig = {
  strategy?: "resume-last-turn" | "restart" | "fail";
  timeout?: number;
  maxAttempts?: number;
};

export type VoiceRuntimePreset =
  | "default"
  | "chat"
  | "guided-intake"
  | "dictation"
  | "noisy-room"
  | "pstn-balanced"
  | "pstn-fast"
  | "reliability";

export type VoiceSTTLifecycle = "continuous" | "turn-scoped";

export type VoiceTurnProfile = "fast" | "balanced" | "long-form";

export type VoiceTurnQualityProfile =
  | "general"
  | "accent-heavy"
  | "noisy-room"
  | "short-command";

export type VoiceTurnFallbackTrigger =
  | "empty-turn"
  | "low-confidence"
  | "empty-or-low-confidence"
  | "always";

export type VoiceSTTFallbackConfig = {
  adapter: STTAdapter;
  trigger?: VoiceTurnFallbackTrigger;
  confidenceThreshold?: number;
  minTextLength?: number;
  replayWindowMs?: number;
  settleMs?: number;
  completionTimeoutMs?: number;
  maxAttemptsPerTurn?: number;
};

export type VoiceResolvedSTTFallbackConfig = {
  adapter: STTAdapter;
  trigger: VoiceTurnFallbackTrigger;
  confidenceThreshold: number;
  minTextLength: number;
  replayWindowMs: number;
  settleMs: number;
  completionTimeoutMs: number;
  maxAttemptsPerTurn: number;
};

export type VoiceTurnDetectionConfig = {
  profile?: VoiceTurnProfile;
  qualityProfile?: VoiceTurnQualityProfile;
  // Adaptive endpointing: the silence-before-commit window is no longer fixed.
  // When a `semanticTurnDetector` returns a `confidence` (0-1 ≈ P(turn complete)),
  // the window scales between `minSilenceMs` (floor — commit fast when the caller
  // is clearly done) and `silenceMs` (ceiling — wait longer when they look
  // mid-thought). This replaces the old binary semantic-veto: instead of waiting
  // a fixed window then deferring, the wait IS the confidence. Set `silenceMs`
  // high to keep patience for genuine thinking pauses; the floor keeps confident
  // turns snappy. With no detector / no confidence, the window is `silenceMs`.
  silenceMs?: number;
  minSilenceMs?: number;
  speechThreshold?: number;
  transcriptStabilityMs?: number;
};

export type VoiceResolvedTurnDetectionConfig = {
  qualityProfile: VoiceTurnQualityProfile;
  profile: VoiceTurnProfile;
  silenceMs: number;
  minSilenceMs: number;
  speechThreshold: number;
  transcriptStabilityMs: number;
};

export type VoiceAudioConditioningConfig = {
  enabled?: boolean;
  targetLevel?: number;
  maxGain?: number;
  noiseGateThreshold?: number;
  noiseGateAttenuation?: number;
};

export type VoiceResolvedAudioConditioningConfig = {
  enabled: true;
  targetLevel: number;
  maxGain: number;
  noiseGateThreshold: number;
  noiseGateAttenuation: number;
};

export type VoiceSocket = {
  send: (data: string | Uint8Array | ArrayBuffer) => void | Promise<void>;
  close: (code?: number, reason?: string) => void | Promise<void>;
  /**
   * Discard any audio already buffered downstream (e.g. a telephony carrier's
   * outbound media buffer). Called on barge-in so the caller stops hearing the
   * assistant immediately, even when frames have already been flushed to the
   * transport. Optional: transports without a flush concept omit it.
   */
  clear?: () => void | Promise<void>;
};

export type VoiceMonitorRuntimeSessionBinding = {
  deregister: (reason?: string) => void;
  emitAudio: (
    chunk: Uint8Array | ArrayBuffer,
    options?: { source?: "assistant" | "caller" | (string & {}) },
  ) => void;
};

export type VoiceMonitorRuntimeRegisterInput = {
  handle: VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>;
  metadata?: Record<string, unknown>;
  sessionId: string;
};

export type VoiceMonitorRuntimeBinding = {
  registerSession: (
    input: VoiceMonitorRuntimeRegisterInput,
  ) => VoiceMonitorRuntimeSessionBinding;
};

export type VoiceSessionHandle<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  id: string;
  connect: (socket: VoiceSocket) => Promise<void>;
  receiveAudio: (audio: AudioChunk) => Promise<void>;
  attachUserMedia: (
    attachment: import("./agent").VoiceAgentMessageAttachment,
  ) => Promise<void>;
  commitTurn: (reason?: VoiceEndOfTurnEvent["reason"]) => Promise<void>;
  disconnect: (event?: VoiceCloseEvent) => Promise<void>;
  complete: (result?: TResult) => Promise<void>;
  escalate: (input: {
    metadata?: Record<string, unknown>;
    reason: string;
    result?: TResult;
  }) => Promise<void>;
  fail: (error: unknown) => Promise<void>;
  markNoAnswer: (input?: {
    metadata?: Record<string, unknown>;
    result?: TResult;
  }) => Promise<void>;
  markVoicemail: (input?: {
    metadata?: Record<string, unknown>;
    result?: TResult;
  }) => Promise<void>;
  transfer: (input: {
    metadata?: Record<string, unknown>;
    reason?: string;
    result?: TResult;
    target: string;
    transferMode?: "cold" | "warm";
  }) => Promise<void>;
  close: (reason?: string) => Promise<void>;
  snapshot: () => Promise<TSession>;
  /**
   * Mutate the live turn-detection config for this session — useful when a
   * tool call wants to dial silenceMs up ("the caller asked for more time")
   * or down. The change takes effect on the NEXT silence-timer schedule, so
   * an in-flight commit isn't cancelled. Returns the merged config so the
   * caller can confirm.
   */
  setTurnDetection: (patch: Partial<VoiceTurnDetectionConfig>) => Promise<{
    silenceMs: number;
    speechThreshold: number;
    transcriptStabilityMs: number;
  }>;
};

// Normalized conversational-LLM token usage for a turn, carried back on the turn
// result so the session can meter it (the per-session cost accountant records it
// into the `llm` cost channel). Shape matches VoiceCostLLMRecord so it can be
// passed straight to costAccountant.recordLLM.
export type VoiceLLMUsage = {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
};

export type VoiceRouteResult<TResult = unknown> = {
  complete?: boolean;
  result?: TResult;
  assistantText?: string;
  // Conversational-LLM usage for this turn (set by the model adapter). The
  // session reads it to meter LLM cost — previously dropped, so voice
  // conversation spend was invisible.
  usage?: VoiceLLMUsage;
  citations?: ReadonlyArray<VoiceTurnCitation>;
  transfer?: {
    metadata?: Record<string, unknown>;
    reason?: string;
    target: string;
    transferMode?: "cold" | "warm";
  };
  escalate?: {
    metadata?: Record<string, unknown>;
    reason: string;
  };
  voicemail?: {
    metadata?: Record<string, unknown>;
  };
  noAnswer?: {
    metadata?: Record<string, unknown>;
  };
};

export type VoiceTurnCorrectionResult =
  | string
  | {
      text: string;
      reason?: string;
      provider?: string;
      metadata?: Record<string, unknown>;
    };

export type VoiceTurnCorrectionHandler<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = (input: {
  api: VoiceSessionHandle<TContext, TSession, TResult>;
  context: TContext;
  fallback?: VoiceFallbackDiagnostics;
  lexicon: VoiceLexiconEntry[];
  phraseHints: VoicePhraseHint[];
  session: TSession;
  text: string;
  transcripts: Transcript[];
}) =>
  | Promise<VoiceTurnCorrectionResult | void>
  | VoiceTurnCorrectionResult
  | void;

export type VoicePhraseHintResolver<TContext = unknown> = (input: {
  context: TContext;
  scenarioId?: string;
  sessionId: string;
}) => Promise<VoicePhraseHint[] | void> | VoicePhraseHint[] | void;

export type VoiceLexiconResolver<TContext = unknown> = (input: {
  context: TContext;
  scenarioId?: string;
  sessionId: string;
}) => Promise<VoiceLexiconEntry[] | void> | VoiceLexiconEntry[] | void;

export type VoiceOnTurnObjectHandler<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = (input: {
  context: TContext;
  liveOps?: {
    control: VoiceLiveOpsControlState;
    injectedInstruction?: string;
  };
  // The session passes this on the TTS path; call it with prose deltas as the
  // reply generates and the caller hears the first sentence before the model
  // finishes. createVoiceAssistant wires it to the model adapter automatically.
  onTextDelta?: (delta: string) => void;
  session: TSession;
  turn: VoiceTurnRecord;
  api: VoiceSessionHandle<TContext, TSession, TResult>;
  // P3 eager generation: when `route.speculate` ran during the silence window and
  // the committed transcript still matches what it saw, the session hands the
  // pre-generated reply here. A route that wants the latency win streams this
  // text straight to TTS (via onTextDelta) and does its side effects, SKIPPING
  // its own model call. Absent on a divergence/resume or when no speculation ran.
  speculativeReply?: { text: string };
}) =>
  | Promise<VoiceRouteResult<TResult> | void>
  | VoiceRouteResult<TResult>
  | void;

export type VoiceOnTurnHandler<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> =
  | VoiceOnTurnObjectHandler<TContext, TSession, TResult>
  | ((
      session: TSession,
      turn: VoiceTurnRecord,
      api: VoiceSessionHandle<TContext, TSession, TResult>,
      context: TContext,
    ) =>
      | Promise<VoiceRouteResult<TResult> | void>
      | VoiceRouteResult<TResult>
      | void);

export type VoiceRouteConfig<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  onCallStart?: (input: {
    context: TContext;
    session: TSession;
    api: VoiceSessionHandle<TContext, TSession, TResult>;
  }) => Promise<void> | void;
  onCallEnd?: (input: {
    api: VoiceSessionHandle<TContext, TSession, TResult>;
    context: TContext;
    disposition: VoiceCallDisposition;
    metadata?: Record<string, unknown>;
    reason?: string;
    session: TSession;
    target?: string;
  }) => Promise<void> | void;
  onSession?: (input: {
    context: TContext;
    session: TSession;
    api: VoiceSessionHandle<TContext, TSession, TResult>;
  }) => Promise<void> | void;
  /** Fires when a connect RESUMES an existing session (a reconnect, or a fresh
   *  process after a restart finding the session in a persistent store) instead
   *  of starting a new call — onCallStart/onSession do NOT fire on a resume.
   *  Use it to rebuild any per-session in-memory state (caller context, paced
   *  flags) that didn't survive the process, so the resumed call keeps the
   *  personalization the original had. Runs before the resume re-greeting. */
  onResume?: (input: {
    context: TContext;
    session: TSession;
    api: VoiceSessionHandle<TContext, TSession, TResult>;
  }) => Promise<void> | void;
  correctTurn?: VoiceTurnCorrectionHandler<TContext, TSession, TResult>;
  // P3 eager generation (optional). Fired during the silence window once the
  // caller appears done, with a PROVISIONAL turn carrying their utterance so far.
  // Must generate ONLY the reply text — no tools, no persistence, no audio (the
  // session never plays it directly). Return null to decline (e.g. the model
  // wants a tool, so the real turn must run). If the caller then stays quiet and
  // the committed transcript matches, the session passes the text to onTurn as
  // `speculativeReply`; if they resume, it's discarded. Wire to
  // `assistant.speculate`.
  speculate?: (input: {
    api: VoiceSessionHandle<TContext, TSession, TResult>;
    context: TContext;
    session: TSession;
    turn: VoiceTurnRecord;
    // Fires when the speculation is superseded (the caller resumed, or the turn
    // diverged at commit). Forward it to the model generation so the wasted call
    // is cancelled instead of holding the model slot / delaying the real turn.
    signal?: AbortSignal;
  }) => Promise<{ text: string } | null | void>;
  onTurn: VoiceOnTurnHandler<TContext, TSession, TResult>;
  onComplete: (input: {
    context: TContext;
    session: TSession;
    api: VoiceSessionHandle<TContext, TSession, TResult>;
  }) => Promise<void> | void;
  onError?: (input: {
    context: TContext;
    sessionId: string;
    session?: TSession;
    error: unknown;
    api?: VoiceSessionHandle<TContext, TSession, TResult>;
  }) => Promise<void> | void;
  onEscalation?: (input: {
    api: VoiceSessionHandle<TContext, TSession, TResult>;
    context: TContext;
    metadata?: Record<string, unknown>;
    reason: string;
    session: TSession;
  }) => Promise<void> | void;
  onNoAnswer?: (input: {
    api: VoiceSessionHandle<TContext, TSession, TResult>;
    context: TContext;
    metadata?: Record<string, unknown>;
    session: TSession;
  }) => Promise<void> | void;
  onTransfer?: (input: {
    api: VoiceSessionHandle<TContext, TSession, TResult>;
    context: TContext;
    metadata?: Record<string, unknown>;
    reason?: string;
    session: TSession;
    target: string;
  }) => Promise<void> | void;
  onVoicemail?: (input: {
    api: VoiceSessionHandle<TContext, TSession, TResult>;
    context: TContext;
    metadata?: Record<string, unknown>;
    session: TSession;
  }) => Promise<void> | void;
};

export type VoiceRuntimeOpsConfig<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  buildReview?: (input: {
    api: VoiceSessionHandle<TContext, TSession, TResult>;
    context: TContext;
    disposition: VoiceCallDisposition;
    metadata?: Record<string, unknown>;
    reason?: string;
    result?: TResult;
    session: TSession;
    target?: string;
  }) =>
    | Promise<VoiceCallReviewArtifact | StoredVoiceCallReviewArtifact | void>
    | VoiceCallReviewArtifact
    | StoredVoiceCallReviewArtifact
    | void;
  createTaskFromReview?: (input: {
    api: VoiceSessionHandle<TContext, TSession, TResult>;
    context: TContext;
    disposition: VoiceCallDisposition;
    review: StoredVoiceCallReviewArtifact;
    session: TSession;
  }) =>
    | Promise<
        | Omit<VoiceOpsTask, "id">
        | VoiceOpsTask
        | StoredVoiceOpsTask
        | null
        | void
      >
    | Omit<VoiceOpsTask, "id">
    | VoiceOpsTask
    | StoredVoiceOpsTask
    | null
    | void;
  resolveTaskPolicy?: (input: {
    api: VoiceSessionHandle<TContext, TSession, TResult>;
    context: TContext;
    disposition: VoiceCallDisposition;
    metadata?: Record<string, unknown>;
    reason?: string;
    review?: StoredVoiceCallReviewArtifact;
    session: TSession;
    target?: string;
    task: StoredVoiceOpsTask;
  }) => Promise<VoiceOpsTaskPolicy | void> | VoiceOpsTaskPolicy | void;
  resolveTaskAssignment?: (input: {
    api: VoiceSessionHandle<TContext, TSession, TResult>;
    context: TContext;
    disposition: VoiceCallDisposition;
    metadata?: Record<string, unknown>;
    reason?: string;
    review?: StoredVoiceCallReviewArtifact;
    session: TSession;
    target?: string;
    task: StoredVoiceOpsTask;
  }) =>
    | Promise<VoiceOpsTaskAssignmentRule | void>
    | VoiceOpsTaskAssignmentRule
    | void;
  taskAssignmentRules?: VoiceOpsTaskAssignmentRules;
  taskPolicies?: VoiceOpsDispositionTaskPolicies;
  events?: VoiceIntegrationEventStore;
  onEvent?: (input: {
    api: VoiceSessionHandle<TContext, TSession, TResult>;
    context: TContext;
    event: StoredVoiceIntegrationEvent;
    session: TSession;
  }) => Promise<void> | void;
  reviews?: VoiceCallReviewStore;
  sinks?: VoiceIntegrationSink[];
  tasks?: VoiceOpsTaskStore;
  webhook?: VoiceIntegrationWebhookConfig;
};

export type VoiceLiveOpsRuntimeConfig = {
  getControl: (
    sessionId: string,
  ) =>
    | Promise<VoiceLiveOpsControlState | null | undefined>
    | VoiceLiveOpsControlState
    | null
    | undefined;
};

export type VoiceProfileSwitchGuardResolverInput<TContext = unknown> = {
  context: TContext;
  scenarioId?: string;
  sessionId: string;
};

export type VoicePluginProfileSwitchGuardConfig<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  actor?: VoiceAuditActor;
  allowedProfileIds?:
    | string[]
    | ((
        input: VoiceProfileSwitchGuardResolverInput<TContext>,
      ) => Promise<string[] | undefined> | string[] | undefined);
  audit?: VoiceAuditEventStore;
  blockedProfileIds?:
    | string[]
    | ((
        input: VoiceProfileSwitchGuardResolverInput<TContext>,
      ) => Promise<string[] | undefined> | string[] | undefined);
  currentProfileId?:
    | string
    | ((
        input: VoiceProfileSwitchGuardResolverInput<TContext>,
      ) => Promise<string | undefined> | string | undefined);
  defaultProfileId?: string;
  defaults:
    | VoiceRealCallProfileDefaultsReport
    | VoiceRealCallProfileHistoryReport
    | ((
        input: VoiceProfileSwitchGuardResolverInput<TContext>,
      ) =>
        | Promise<
            | VoiceRealCallProfileDefaultsReport
            | VoiceRealCallProfileHistoryReport
          >
        | VoiceRealCallProfileDefaultsReport
        | VoiceRealCallProfileHistoryReport);
  metadata?:
    | Record<string, unknown>
    | ((
        input: VoiceProfileSwitchGuardResolverInput<TContext>,
      ) =>
        | Promise<Record<string, unknown> | undefined>
        | Record<string, unknown>
        | undefined);
  minConfidence?:
    | number
    | ((
        input: VoiceProfileSwitchGuardResolverInput<TContext>,
      ) => Promise<number | undefined> | number | undefined);
  maxAutoSwitchesPerSession?:
    | number
    | ((
        input: VoiceProfileSwitchGuardResolverInput<TContext>,
      ) => Promise<number | undefined> | number | undefined);
  mode?:
    | VoiceProfileSwitchGuardMode
    | ((
        input: VoiceProfileSwitchGuardResolverInput<TContext>,
      ) =>
        | Promise<VoiceProfileSwitchGuardMode | undefined>
        | VoiceProfileSwitchGuardMode
        | undefined);
  observed?:
    | VoiceProfileSwitchObservedSignals
    | ((
        input: VoiceProfileSwitchGuardResolverInput<TContext>,
      ) =>
        | Promise<VoiceProfileSwitchObservedSignals | undefined>
        | VoiceProfileSwitchObservedSignals
        | undefined);
  onDecision?: (input: {
    context: TContext;
    decision: VoiceProfileSwitchGuardDecision;
    scenarioId?: string;
    sessionId: string;
  }) => Promise<void> | void;
  sessionMetadataKey?: string | false;
  trace?: false | VoiceTraceEventStore;
};

export type VoiceNormalizedRouteConfig<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = Omit<VoiceRouteConfig<TContext, TSession, TResult>, "onTurn"> & {
  onTurn: VoiceOnTurnObjectHandler<TContext, TSession, TResult>;
};

export type VoiceScenario = {
  id: string;
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type VoiceExpectedSpeakerTurn = {
  speaker: string;
  text: string;
};

/**
 * Configures one of the plugin's optional route surfaces. Pass that surface's
 * options object to mount it, `false` (or omit) to leave it off. Surfaces whose
 * options are entirely optional may also be enabled with `true` for defaults.
 */
export type VoiceSurfaceConfig<O> =
  | false
  | O
  | (Record<string, never> extends O ? true : never);

export type VoicePluginConfig<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  // Per-call cost accounting for the runtime sessions this plugin creates. Set it
  // (+ optional costTelephony) so the session emits cost.ready and a metered trace
  // store can record LLM/STT/TTS spend — the plugin path was previously unable to
  // meter at all, only createTwilioVoiceRoutes accepted these.
  costAccountant?: import("./costAccounting").VoiceCostAccountant;
  costTelephony?: { provider?: string };
  costTelemetry?: VoiceCostTelemetryConfig<TContext, TSession, TResult>;
  path: string;
  // Spoken once, by the assistant, the moment a fresh session connects — before
  // the caller says anything ("assistant speaks first"). TTS'd via the configured
  // tts/realtime adapter and surfaced as the first assistant message. A function
  // is resolved per session (it receives the session), so the greeting can come
  // from a live/DB source or vary per call — e.g. a "welcome back" on resume.
  greeting?:
    | string
    | ((input: { session: TSession }) => string | Promise<string>);
  // Spoken when a call RESUMES (reconnect / restart) after it already had a
  // committed turn — a short re-orientation so the caller knows they're back,
  // since the in-flight assistant audio didn't survive the gap. Resolved per
  // session (receives the session) so it can reference the last turn. Unset =
  // silent resume.
  resumeGreeting?:
    | string
    | ((input: { session: TSession }) => string | Promise<string>);
  // Spoken by the assistant when the STT-health watchdog detects the stream has
  // gone DEAF mid-call — the caller is producing continuous speech energy but no
  // transcripts are landing (see STT_HEALTH_STALE_MS). Without this the caller's
  // words are silently lost, no turn commits, and the call hangs until the ping
  // timeout disposes it "abandoned". A short re-prompt ("Sorry, I think I missed
  // that — go ahead?") gets the caller to repeat into the freshly reconnected
  // stream. Cooldown-guarded so it fires at most once per stale episode. Resolved
  // per session. Unset = silent reconnect only (prior behaviour).
  sttRecoveryLine?:
    | string
    | ((input: { session: TSession }) => string | Promise<string>);
  // Last-resort GRACEFUL terminal close for a wedged call. If the call makes no
  // caller-side progress (no committed turn and no user partial transcript) for
  // `afterMs` on a live call — e.g. STT is permanently deaf, or the caller left —
  // the assistant speaks `line` (a warm sign-off) and the session COMPLETES with
  // disposition "completed", so onComplete still runs (the intake is saved) and
  // the call ends with a real goodbye instead of dead air + an "abandoned" row.
  // Reset by real conversational progress (committed turn / user partial / a
  // (re)connect), NOT by the assistant's own speech, so repeated STT recovery
  // re-prompts can't keep deferring it forever. Unset = no auto-close.
  stuckCallClose?: {
    afterMs: number;
    line?:
      | string
      | ((input: { session: TSession }) => string | Promise<string>);
    reason?: string;
  };
  /** Gentle re-engagement before a silent call is given up on. When the caller
   *  makes no progress (no committed turn / user partial) for `afterMs`, the
   *  assistant speaks `line` ("still there?") instead of ending, and the close
   *  deadline (stuckCallClose) is pushed out — up to `maxReprompts` times (default
   *  1). After the budget is spent the normal close path runs. Caller speech
   *  resets the budget. Assistant speech does NOT, so this can only extend a
   *  bounded amount. `afterMs` should be < stuckCallClose.afterMs so the nudge
   *  fires first. */
  idleReprompt?: {
    afterMs: number;
    line:
      | string
      | ((input: { session: TSession }) => string | Promise<string>);
    maxReprompts?: number;
  };
  languageStrategy?:
    | VoiceLanguageStrategy
    | VoiceLanguageStrategyResolver<TContext>;
  lexicon?: VoiceLexiconEntry[] | VoiceLexiconResolver<TContext>;
  phraseHints?: VoicePhraseHint[] | VoicePhraseHintResolver<TContext>;
  preset?: VoiceRuntimePreset;
  stt?: STTAdapter;
  sttFallback?: VoiceSTTFallbackConfig;
  sttLifecycle?: VoiceSTTLifecycle;
  realtime?: RealtimeAdapter;
  realtimeInputFormat?: AudioFormat;
  // Persist the call audio (assistant + caller) via a recording store, so a
  // failed/garbled call leaves an artifact to triage. Already supported on the
  // Twilio path; exposing it here records browser/WS plugin calls too.
  recording?: VoiceSessionRecordingConfig;
  tts?: TTSAdapter;
  session: VoiceSessionStore<NoInfer<TSession>>;
  reconnect?: VoiceReconnectConfig;
  turnDetection?: VoiceTurnDetectionConfig;
  semanticTurnDetector?: import("./semanticTurn").VoiceSemanticTurnDetector;
  bargeInDetector?: import("./bargeInDetector").VoiceBargeInDetector;
  bargeInMinPartialWords?: number;
  /**
   * When true, a pure listening cue ("mm-hm", "yeah", "right", "got it") spoken
   * WHILE the assistant is talking does NOT barge-in — the assistant keeps going
   * and the cue is dropped so it never becomes the caller's next turn. A bare
   * "yeah" said AFTER the assistant finishes is a normal answer, unaffected.
   * Default false (any in-speech words interrupt, the prior behavior).
   */
  backchannelBargeInGuard?: boolean;
  fillerPhrases?: ReadonlyArray<string>;
  fillerDelayMs?: number;
  fillerFor?: (input: {
    sessionId: string;
    turnId: string;
    userText: string;
  }) => Promise<string | null>;
  fillerForTimeoutMs?: number;
  backchannel?: import("./backchannel").VoiceBackchannelConfig;
  defaultSilentTurnAck?: string;
  routeOnTurnTimeoutMs?: number;
  audioConditioning?: VoiceAudioConditioningConfig;
  /* Rewrite spelled-out numbers / currency / percentages in each committed
     user turn to digit form ("ten million" -> "10 million", "forty percent"
     -> "40%"). Conversational STT models like Deepgram Flux don't format
     numerals, so downstream extraction otherwise reads the same metric
     inconsistently across calls. Off by default. */
  normalizeNumbers?: boolean;
  noiseSuppressor?: VoiceNoiseSuppressor;
  noiseSuppressorFormat?: AudioFormat;
  logger?: VoiceLogger;
  htmx?: boolean | VoiceHTMXConfig<TSession, NoInfer<TResult>>;
  handoff?: VoiceHandoffConfig<TContext, TSession, TResult>;
  ops?: VoiceRuntimeOpsConfig<TContext, TSession, TResult>;
  liveOps?: VoiceLiveOpsRuntimeConfig;
  monitor?: VoiceMonitorRuntimeBinding;
  profileSwitchGuard?: VoicePluginProfileSwitchGuardConfig<
    TContext,
    TSession,
    TResult
  >;
  trace?: VoiceTraceEventStore;
  assistantHealth?: VoiceSurfaceConfig<
    import("./assistantHealth").VoiceAssistantHealthRoutesOptions
  >;
  auditDelivery?: VoiceSurfaceConfig<
    import("./auditDeliveryRoutes").VoiceAuditDeliveryRoutesOptions
  >;
  auditTrail?: VoiceSurfaceConfig<
    import("./auditRoutes").VoiceAuditTrailRoutesOptions
  >;
  bargeIn?: VoiceSurfaceConfig<
    import("./bargeInRoutes").VoiceBargeInRoutesOptions
  >;
  browserCallProfile?: VoiceSurfaceConfig<
    import("./browserCallProfiles").VoiceBrowserCallProfileRoutesOptions
  >;
  browserMedia?: VoiceSurfaceConfig<
    import("./browserMediaRoutes").VoiceBrowserMediaRoutesOptions
  >;
  callDebugger?: VoiceSurfaceConfig<
    import("./callDebugger").VoiceCallDebuggerRoutesOptions
  >;
  campaign?: VoiceSurfaceConfig<
    import("./campaign").VoiceCampaignRoutesOptions
  >;
  competitiveCoverage?: VoiceSurfaceConfig<
    import("./competitiveCoverage").VoiceCompetitiveCoverageRoutesOptions
  >;
  dataControl?: VoiceSurfaceConfig<
    import("./dataControl").VoiceDataControlRoutesOptions
  >;
  deliveryRuntime?: VoiceSurfaceConfig<
    import("./deliveryRuntime").VoiceDeliveryRuntimeRoutesOptions
  >;
  deliverySink?: VoiceSurfaceConfig<
    import("./deliverySinkRoutes").VoiceDeliverySinkRoutesOptions
  >;
  demoReady?: VoiceSurfaceConfig<
    import("./demoReadyRoutes").VoiceDemoReadyRoutesOptions
  >;
  diagnostics?: VoiceSurfaceConfig<
    import("./diagnosticsRoutes").VoiceDiagnosticsRoutesOptions
  >;
  eval?: VoiceSurfaceConfig<import("./evalRoutes").VoiceEvalRoutesOptions>;
  guardrail?: VoiceSurfaceConfig<
    import("./guardrails").VoiceGuardrailRoutesOptions
  >;
  handoffHealth?: VoiceSurfaceConfig<
    import("./handoffHealth").VoiceHandoffHealthRoutesOptions
  >;
  htmxDashboard?: VoiceSurfaceConfig<
    import("./htmxDashboardRoutes").VoiceHTMXDashboardRoutesOptions
  >;
  incidentBundle?: VoiceSurfaceConfig<
    import("./incidentBundle").VoiceIncidentBundleRoutesOptions
  >;
  incidentTimeline?: VoiceSurfaceConfig<
    import("./incidentTimeline").VoiceIncidentTimelineRoutesOptions
  >;
  liveLatency?: VoiceSurfaceConfig<
    import("./liveLatency").VoiceLiveLatencyRoutesOptions
  >;
  liveMonitor?: VoiceSurfaceConfig<
    import("./monitor").VoiceLiveMonitorRoutesOptions
  >;
  liveOpsConsole?: VoiceSurfaceConfig<
    import("./liveOps").VoiceLiveOpsRoutesOptions
  >;
  mediaPipeline?: VoiceSurfaceConfig<
    import("./mediaPipelineRoutes").VoiceMediaPipelineRoutesOptions
  >;
  monitorReport?: VoiceSurfaceConfig<
    import("./voiceMonitoring").VoiceMonitorRoutesOptions
  >;
  monitorRunner?: VoiceSurfaceConfig<
    import("./voiceMonitoring").VoiceMonitorRunnerRoutesOptions
  >;
  observabilityExport?: VoiceSurfaceConfig<
    import("./observabilityExport").VoiceObservabilityExportRoutesOptions
  >;
  observabilityExportReplay?: VoiceSurfaceConfig<
    import("./observabilityExport").VoiceObservabilityExportReplayRoutesOptions
  >;
  operationalStatus?: VoiceSurfaceConfig<
    import("./operationalStatus").VoiceOperationalStatusRoutesOptions
  >;
  operationsRecord?: VoiceSurfaceConfig<
    import("./operationsRecord").VoiceOperationsRecordRoutesOptions
  >;
  opsActionAudit?: VoiceSurfaceConfig<
    import("./opsActionAuditRoutes").VoiceOpsActionAuditRoutesOptions
  >;
  opsConsole?: VoiceSurfaceConfig<
    import("./opsConsoleRoutes").VoiceOpsConsoleRoutesOptions
  >;
  opsRecovery?: VoiceSurfaceConfig<
    import("./opsRecovery").VoiceOpsRecoveryRoutesOptions
  >;
  opsStatus?: VoiceSurfaceConfig<
    import("./opsStatus").VoiceOpsStatusRoutesOptions
  >;
  opsWebhookReceiver?: VoiceSurfaceConfig<
    import("./opsWebhook").VoiceOpsWebhookReceiverRoutesOptions
  >;
  outcomeContract?: VoiceSurfaceConfig<
    import("./outcomeContract").VoiceOutcomeContractRoutesOptions
  >;
  phoneAgentProductionSmoke?: VoiceSurfaceConfig<
    import("./phoneAgentProductionSmoke").VoicePhoneAgentProductionSmokeRoutesOptions
  >;
  platformCoverage?: VoiceSurfaceConfig<
    import("./platformCoverage").VoicePlatformCoverageRoutesOptions
  >;
  postCallAnalysis?: VoiceSurfaceConfig<
    import("./postCallAnalysis").VoicePostCallAnalysisRoutesOptions
  >;
  productionReadiness?: VoiceSurfaceConfig<
    import("./productionReadiness").VoiceProductionReadinessRoutesOptions
  >;
  profileSwitchLiveDecision?: VoiceSurfaceConfig<
    import("./profileSwitchRecommendation").VoiceProfileSwitchLiveDecisionRoutesOptions
  >;
  profileSwitchPolicyProof?: VoiceSurfaceConfig<
    import("./profileSwitchRecommendation").VoiceProfileSwitchPolicyProofRoutesOptions
  >;
  profileSwitchReadiness?: VoiceSurfaceConfig<
    import("./profileSwitchRecommendation").VoiceProfileSwitchReadinessRoutesOptions
  >;
  proofPack?: VoiceSurfaceConfig<
    import("./proofPack").VoiceProofPackRoutesOptions
  >;
  proofTrend?: VoiceSurfaceConfig<
    import("./proofTrends").VoiceProofTrendRoutesOptions
  >;
  proofTrendRecommendation?: VoiceSurfaceConfig<
    import("./proofTrends").VoiceProofTrendRecommendationRoutesOptions
  >;
  providerCapability?: VoiceSurfaceConfig<
    import("./providerCapabilities").VoiceProviderCapabilityRoutesOptions
  >;
  providerContractMatrix?: VoiceSurfaceConfig<
    import("./providerStackRecommendations").VoiceProviderContractMatrixRoutesOptions
  >;
  providerDecisionTrace?: VoiceSurfaceConfig<
    import("./providerDecisionTraces").VoiceProviderDecisionTraceRoutesOptions
  >;
  providerHealth?: VoiceSurfaceConfig<
    import("./providerHealth").VoiceProviderHealthRoutesOptions
  >;
  providerOrchestration?: VoiceSurfaceConfig<
    import("./providerOrchestration").VoiceProviderOrchestrationRoutesOptions
  >;
  providerSlo?: VoiceSurfaceConfig<
    import("./providerSlo").VoiceProviderSloRoutesOptions
  >;
  quality?: VoiceSurfaceConfig<
    import("./qualityRoutes").VoiceQualityRoutesOptions
  >;
  realCallEvidenceRuntime?: VoiceSurfaceConfig<
    import("./proofTrends").VoiceRealCallEvidenceRuntimeRoutesOptions
  >;
  realCallProfileHistory?: VoiceSurfaceConfig<
    import("./proofTrends").VoiceRealCallProfileHistoryRoutesOptions
  >;
  realCallProfileRecoveryAction?: VoiceSurfaceConfig<
    import("./proofTrends").VoiceRealCallProfileRecoveryActionRoutesOptions
  >;
  realtimeChannel?: VoiceSurfaceConfig<
    import("./realtimeChannel").VoiceRealtimeChannelRoutesOptions
  >;
  realtimeProviderContract?: VoiceSurfaceConfig<
    import("./realtimeProviderContracts").VoiceRealtimeProviderContractRoutesOptions
  >;
  reconnectContract?: VoiceSurfaceConfig<
    import("./reconnectContract").VoiceReconnectContractRoutesOptions
  >;
  reconnectProof?: VoiceSurfaceConfig<
    import("./reconnectContract").VoiceReconnectProofRoutesOptions
  >;
  resilience?: VoiceSurfaceConfig<
    import("./resilienceRoutes").VoiceResilienceRoutesOptions
  >;
  sessionList?: VoiceSurfaceConfig<
    import("./sessionReplay").VoiceSessionListRoutesOptions
  >;
  sessionObservability?: VoiceSurfaceConfig<
    import("./sessionObservability").VoiceSessionObservabilityRoutesOptions
  >;
  sessionReplay?: VoiceSurfaceConfig<
    import("./sessionReplay").VoiceSessionReplayRoutesOptions
  >;
  sessionSnapshot?: VoiceSurfaceConfig<
    import("./sessionSnapshot").VoiceSessionSnapshotRoutesOptions
  >;
  simulationSuite?: VoiceSurfaceConfig<
    import("./simulationSuite").VoiceSimulationSuiteRoutesOptions
  >;
  sloCalibration?: VoiceSurfaceConfig<
    import("./sloCalibration").VoiceSloCalibrationRoutesOptions
  >;
  sloReadinessThreshold?: VoiceSurfaceConfig<
    import("./sloCalibration").VoiceSloReadinessThresholdRoutesOptions
  >;
  telephonyCarrierMatrix?: VoiceSurfaceConfig<
    import("../telephony/matrix").VoiceTelephonyCarrierMatrixRoutesOptions
  >;
  telephonyMedia?: VoiceSurfaceConfig<
    import("./telephonyMediaRoutes").VoiceTelephonyMediaRoutesOptions
  >;
  telephonyWebhook?: VoiceSurfaceConfig<
    import("./telephonyOutcome").VoiceTelephonyWebhookRoutesOptions
  >;
  telephonyWebhookSecurity?: VoiceSurfaceConfig<
    import("../telephony/security").VoiceTelephonyWebhookSecurityRoutesOptions
  >;
  toolContract?: VoiceSurfaceConfig<
    import("./toolContract").VoiceToolContractRoutesOptions
  >;
  traceDelivery?: VoiceSurfaceConfig<
    import("./traceDeliveryRoutes").VoiceTraceDeliveryRoutesOptions
  >;
  traceTimeline?: VoiceSurfaceConfig<
    import("./traceTimeline").VoiceTraceTimelineRoutesOptions
  >;
  turnLatency?: VoiceSurfaceConfig<
    import("./turnLatency").VoiceTurnLatencyRoutesOptions
  >;
  turnQuality?: VoiceSurfaceConfig<
    import("./turnQuality").VoiceTurnQualityRoutesOptions
  >;
} & VoiceRouteConfig<TContext, TSession, TResult>;

export type VoiceSessionRecordingConfig = {
  channels?: ReadonlyArray<"assistant" | "user">;
  maxBytesPerChannel?: number;
  store: import("./recordingStore").VoiceRecordingStore;
  userInputFormat?: AudioFormat;
};

export type CreateVoiceSessionOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  costTelemetry?: VoiceCostTelemetryConfig<TContext, TSession, TResult>;
  id: string;
  context: TContext;
  socket: VoiceSocket;
  greeting?:
    | string
    | ((input: { session: TSession }) => string | Promise<string>);
  /** Spoken on a RESUME (reconnect / restart) of a call that already had at
   *  least one committed turn — a short re-orientation ("Sorry, you cut out —
   *  you were telling me about X; go on") so the caller knows they're back,
   *  since the in-flight assistant audio didn't survive. Receives the session so
   *  it can reference the last turn. No resume greeting fires if unset. */
  resumeGreeting?:
    | string
    | ((input: { session: TSession }) => string | Promise<string>);
  /** Spoken when the STT-health watchdog detects the stream has gone DEAF
   *  mid-call (continuous speech energy, no transcripts landing — see
   *  STT_HEALTH_STALE_MS). A short re-prompt ("Sorry, I think I missed that — go
   *  ahead?") so the caller repeats into the freshly reconnected stream instead
   *  of talking into a silently dead call. Cooldown-guarded to fire at most once
   *  per stale episode. Receives the session. Unset = silent reconnect only. */
  sttRecoveryLine?:
    | string
    | ((input: { session: TSession }) => string | Promise<string>);
  /** Last-resort GRACEFUL terminal close for a wedged call. If no caller-side
   *  progress (committed turn / user partial) lands for `afterMs` on a live call
   *  — STT permanently deaf, or the caller left — the assistant speaks `line` and
   *  the session COMPLETES (disposition "completed") so onComplete still saves and
   *  the call ends with a real goodbye instead of dead air + "abandoned". Reset by
   *  real progress (committed turn / user partial / (re)connect), NOT by the
   *  assistant's own speech, so STT recovery re-prompts can't defer it forever. */
  stuckCallClose?: {
    afterMs: number;
    line?:
      | string
      | ((input: { session: TSession }) => string | Promise<string>);
    reason?: string;
  };
  /** Gentle re-engagement before a silent call is given up on. When the caller
   *  makes no progress (no committed turn / user partial) for `afterMs`, the
   *  assistant speaks `line` ("still there?") instead of ending, and the close
   *  deadline (stuckCallClose) is pushed out — up to `maxReprompts` times (default
   *  1). After the budget is spent the normal close path runs. Caller speech
   *  resets the budget. Assistant speech does NOT, so this can only extend a
   *  bounded amount. `afterMs` should be < stuckCallClose.afterMs so the nudge
   *  fires first. */
  idleReprompt?: {
    afterMs: number;
    line:
      | string
      | ((input: { session: TSession }) => string | Promise<string>);
    maxReprompts?: number;
  };
  stt?: STTAdapter;
  realtime?: RealtimeAdapter;
  realtimeInputFormat?: AudioFormat;
  tts?: TTSAdapter;
  languageStrategy?: VoiceLanguageStrategy;
  lexicon?: VoiceLexiconEntry[];
  sttFallback?: VoiceResolvedSTTFallbackConfig;
  store: VoiceSessionStore<TSession>;
  trace?: VoiceTraceEventStore;
  recording?: VoiceSessionRecordingConfig;
  callSilenceTimeoutMs?: number;
  amd?: import("./amdDetector").VoiceAMDDetector<TContext, TSession, TResult>;
  costAccountant?: import("./costAccounting").VoiceCostAccountant;
  costTelephony?: { provider?: string };
  redact?: import("./redaction").VoiceTranscriptRedactor;
  semanticTurnDetector?: import("./semanticTurn").VoiceSemanticTurnDetector;
  bargeInDetector?: import("./bargeInDetector").VoiceBargeInDetector;
  /**
   * Pre-rendered filler phrases the runtime plays in the gap between
   * user-turn-commit and real assistant audio (typically 800-1500ms). The
   * caller hears something within ~150-300ms of stopping speaking, so the
   * LLM/TTS latency feels like the bot thinking instead of dead air. Boardy's
   * killer UX feature.
   *
   * Behavior:
   *  - After a turn commits, a timer fires at `fillerDelayMs` (default
   *    250ms). At that point, if the real assistant audio for this turn
   *    hasn't started flowing yet, a random phrase is rendered via the
   *    configured `tts` adapter and pushed to the socket.
   *  - When the real assistant audio's first chunk arrives, any in-flight
   *    filler is cancelled (`cancelActiveTTS` clears the carrier buffer).
   *  - Cooldown protects against double-fillers per turn.
   *
   * Set `fillerPhrases: []` (or omit) to disable. Reasonable defaults if
   * you enable: `["Hmm.", "Got it.", "Right.", "Mm-hm.", "Let me think.", "Okay."]`.
   */
  /**
   * Minimum word count in an STT partial transcript before speech-gated
   * barge-in cancels the in-flight assistant TTS. Default 1 (any non-empty
   * partial triggers barge-in — backwards-compatible).
   *
   * Set to 2 (or higher) on phone routes where the caller's brief
   * acknowledgements ("yeah", "uh-huh", "you", "am i") would otherwise
   * cut the bot off mid-question. Each extra word added typically delays
   * barge-in by ~100-200ms (one extra STT partial cycle) — cheap compared
   * to losing the bot's response.
   *
   * Word splitting is whitespace-based. Punctuation is left attached.
   */
  bargeInMinPartialWords?: number;
  /**
   * When true, a pure listening cue ("mm-hm", "yeah", "right", "got it") spoken
   * WHILE the assistant is talking does NOT barge-in — the assistant keeps going
   * and the cue is dropped so it never becomes the caller's next turn. A bare
   * "yeah" said AFTER the assistant finishes is a normal answer, unaffected.
   * Default false (any in-speech words interrupt, the prior behavior).
   */
  backchannelBargeInGuard?: boolean;
  fillerPhrases?: ReadonlyArray<string>;
  /** Milliseconds after turn-commit before the filler fires. Default 250ms — short enough to feel instant, long enough to skip if the LLM is very fast. */
  fillerDelayMs?: number;
  /**
   * Latency Theater — content-aware filler (Boardy parity move). When
   * defined, the runtime calls `fillerFor({ userText, ... })` in parallel
   * with the main LLM call to generate a brief acknowledgement of what the
   * caller just said ("Freelance CFOs — interesting.", "Yeah, I hear you.").
   * The runtime races the promise against `fillerForTimeoutMs` (default
   * 600ms). If `fillerFor` returns a non-empty string in time, it's spoken
   * INSTEAD of a random `fillerPhrases` entry. On timeout or null return,
   * the runtime falls back to a static random phrase, so a slow / failed
   * acknowledgement call never costs you the filler entirely.
   *
   * Return `null` (or an empty string) to explicitly skip filler for this
   * turn — useful when `userText` is so short ("yes", "no", "okay") that
   * acknowledging it back sounds robotic. Return throws are caught and
   * treated as null.
   *
   * Cost-aware: callers typically wire this to a cheap nano/haiku model
   * (gpt-4.1-nano, claude-haiku-4-5) that returns 2–5 words.
   */
  fillerFor?: (input: {
    sessionId: string;
    turnId: string;
    userText: string;
  }) => Promise<string | null>;
  /** Ceiling for the `fillerFor` call before we fall back to a static phrase. Default 600ms. */
  fillerForTimeoutMs?: number;
  /**
   * Backchannel cues — short "mm-hm"/"right" acknowledgements played while the
   * CALLER is mid-turn (a long answer) so they feel heard, the way a human
   * listener interjects. Plays on the same non-turn TTS path as fillers, so it
   * never registers as the assistant's turn or trips barge-in. Off unless
   * `enabled` is set. Fires only while the assistant is silent.
   */
  backchannel?: import("./backchannel").VoiceBackchannelConfig;
  /**
   * Default spoken ack if the model returns ONLY tool calls (no text) and the
   * turn isn't ending. Without this, the caller hears total silence after
   * their turn and assumes the line dropped. Default is "Sorry, one moment."
   * Set to "" to opt out entirely.
   */
  defaultSilentTurnAck?: string;
  /**
   * Hard timeout on a single `route.onTurn` call. If onTurn hasn't resolved
   * in this many ms, it's rejected with a hard-timeout error which falls
   * through to defaultSilentTurnAck. Default 45s — generous for normal
   * conversational LLM calls (1-3s typical), but catches hangs where the
   * model adapter's own timeout doesn't fire. Set to 0 to disable.
   */
  routeOnTurnTimeoutMs?: number;
  assistantMode?: import("./assistantMode").VoiceAssistantMode;
  modalities?: ReadonlyArray<"audio" | "text">;
  prosody?: VoiceTTSProsody;
  reconnect: Required<VoiceReconnectConfig>;
  phraseHints?: VoicePhraseHint[];
  sessionMetadata?: Record<string, unknown>;
  scenarioId?: string;
  sttLifecycle: VoiceSTTLifecycle;
  turnDetection: VoiceResolvedTurnDetectionConfig;
  audioConditioning?: VoiceResolvedAudioConditioningConfig;
  /* Digitize spelled-out numbers in committed user turns (see VoicePluginConfig). */
  normalizeNumbers?: boolean;
  noiseSuppressor?: VoiceNoiseSuppressor;
  noiseSuppressorFormat?: AudioFormat;
  handoff?: VoiceHandoffConfig<TContext, TSession, TResult>;
  liveOps?: VoiceLiveOpsRuntimeConfig;
  route: VoiceNormalizedRouteConfig<TContext, TSession, TResult>;
  logger?: VoiceLogger;
};

export type CreateVoiceSession = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: CreateVoiceSessionOptions<TContext, TSession, TResult>,
) => VoiceSessionHandle<TContext, TSession, TResult>;

export type VoiceClientStartMessage = {
  type: "start";
  sessionId?: string;
  scenarioId?: string;
};

export type VoiceClientEndTurnMessage = {
  type: "end_turn";
};

export type VoiceClientCloseMessage = {
  type: "close";
  reason?: string;
};

export type VoiceClientCallControlMessage = {
  type: "call_control";
  action: "complete" | "escalate" | "no-answer" | "transfer" | "voicemail";
  metadata?: Record<string, unknown>;
  reason?: string;
  target?: string;
};

export type VoiceClientPingMessage = {
  type: "ping";
};

export type VoiceClientMessage =
  | VoiceClientStartMessage
  | VoiceClientEndTurnMessage
  | VoiceClientCloseMessage
  | VoiceClientCallControlMessage
  | VoiceClientPingMessage;

export type VoiceServerSessionMessage = {
  type: "session";
  sessionId: string;
  status: VoiceSessionStatus;
  scenarioId?: string;
  sessionMetadata?: Record<string, unknown>;
};

export type VoiceServerReplayMessage<TResult = unknown> = {
  type: "replay";
  assistantTexts: string[];
  call?: VoiceCallLifecycleState;
  partial: string;
  scenarioId?: string;
  sessionId: string;
  sessionMetadata?: Record<string, unknown>;
  status: VoiceSessionStatus;
  turns: VoiceTurnRecord<TResult>[];
};

export type VoiceServerPartialMessage = {
  type: "partial";
  transcript: Transcript;
};

export type VoiceServerFinalMessage = {
  type: "final";
  transcript: Transcript;
};

export type VoiceServerTurnMessage<TResult = unknown> = {
  type: "turn";
  turn: VoiceTurnRecord<TResult>;
};

export type VoiceServerAssistantMessage = {
  type: "assistant";
  text: string;
  turnId?: string;
};

export type VoiceServerAssistantDeltaMessage = {
  type: "assistant_delta";
  delta: string;
  turnId?: string;
};

export type VoiceServerAudioMessage = {
  type: "audio";
  chunkBase64: string;
  format: AudioFormat;
  receivedAt: number;
  turnId?: string;
};

export type VoiceServerCompleteMessage = {
  type: "complete";
  sessionId: string;
};

export type VoiceServerCallLifecycleMessage = {
  type: "call_lifecycle";
  event: VoiceCallLifecycleEvent;
  sessionId: string;
};

export type VoiceServerErrorMessage = {
  type: "error";
  message: string;
  recoverable?: boolean;
};

export type VoiceServerPongMessage = {
  type: "pong";
};

export type VoiceServerConnectionMessage = {
  type: "connection";
  reconnect: VoiceReconnectClientState;
};

export type VoiceServerMessage<TResult = unknown> =
  | VoiceServerSessionMessage
  | VoiceServerReplayMessage<TResult>
  | VoiceServerPartialMessage
  | VoiceServerFinalMessage
  | VoiceServerTurnMessage<TResult>
  | VoiceServerAssistantMessage
  | VoiceServerAssistantDeltaMessage
  | VoiceServerAudioMessage
  | VoiceServerCallLifecycleMessage
  | VoiceServerCompleteMessage
  | VoiceServerErrorMessage
  | VoiceServerPongMessage
  | VoiceServerConnectionMessage;

export type VoiceConnectionOptions = {
  browserMedia?: false | VoiceBrowserMediaReporterOptions;
  protocols?: string[];
  scenarioId?: string;
  reconnect?: boolean;
  reconnectReportPath?: string;
  maxReconnectAttempts?: number;
  /** Cap on the exponential reconnect backoff (ms). The delay doubles from 500ms
   *  up to this ceiling each attempt, so the total retry window is roughly
   *  maxReconnectAttempts spread across it. Default 8000 — with the default 15
   *  attempts that's a ~95s window, enough to ride out a server redeploy without
   *  the caller losing the call. */
  reconnectMaxDelayMs?: number;
  pingInterval?: number;
  sessionId?: string;
};

export type VoiceBrowserMediaReportPayload = {
  at: number;
  continuity?: MediaWebRTCStreamContinuityReport;
  report: MediaWebRTCStatsReport;
  scenarioId?: string | null;
  sessionId?: string | null;
};

export type VoiceBrowserMediaReporterOptions = Omit<
  MediaWebRTCStatsReportInput,
  "peerConnection"
> & {
  fetch?: typeof fetch;
  getPeerConnection?:
    | (() => MediaWebRTCStatsCollector | null | undefined)
    | (() => Promise<MediaWebRTCStatsCollector | null | undefined>);
  getScenarioId?: () => string | null | undefined;
  getSessionId?: () => string | null | undefined;
  intervalMs?: number;
  continuity?:
    | false
    | Omit<MediaWebRTCStreamContinuityInput, "previousStats" | "stats">;
  onError?: (error: unknown) => void;
  onReport?: (payload: VoiceBrowserMediaReportPayload) => void;
  path?: string;
  peerConnection?: MediaWebRTCStatsCollector;
};

export type VoiceCaptureOptions = {
  channelCount?: 1 | 2;
  onAudio?: (
    audio: Uint8Array | ArrayBuffer,
    sendAudio: (audio: Uint8Array | ArrayBuffer) => void,
  ) => void;
  onLevel?: (level: number) => void;
  sampleRateHz?: number;
  /**
   * A pre-acquired microphone MediaStream. When set, capture uses it instead of
   * calling getUserMedia — so a host that requested permission UP FRONT (before
   * connecting, so the prompt can't interrupt the assistant's greeting) can hand
   * the SAME stream in rather than release-and-reacquire (a second getUserMedia
   * + a track stop can trigger an audio-device change that suspends playback and
   * cuts the greeting). Capture owns it after handoff and stops it on close.
   */
  stream?: MediaStream;
};

export type VoiceControllerOptions = {
  preset?: VoiceRuntimePreset;
  connection?: VoiceConnectionOptions;
  capture?: VoiceCaptureOptions;
  autoStopOnComplete?: boolean;
};

export type VoiceBargeInOptions = {
  enabled?: boolean;
  interruptOnPartial?: boolean;
  interruptThreshold?: number;
  monitor?: VoiceBargeInMonitor;
};

export type VoiceBargeInTriggerReason =
  | "input-level"
  | "manual-audio"
  | "manual-interrupt"
  | "partial-transcript";

export type VoiceBargeInMonitorEvent = {
  at: number;
  id: string;
  latencyMs?: number;
  playbackStopLatencyMs?: number;
  reason: VoiceBargeInTriggerReason;
  sessionId?: string | null;
  status: "requested" | "stopped" | "skipped";
  thresholdMs?: number;
};

export type VoiceBargeInMonitorSnapshot = {
  averageLatencyMs?: number;
  events: VoiceBargeInMonitorEvent[];
  failed: number;
  lastEvent?: VoiceBargeInMonitorEvent;
  passed: number;
  status: "empty" | "fail" | "pass" | "warn";
  thresholdMs: number;
  total: number;
};

export type VoiceBargeInMonitor = {
  getSnapshot: () => VoiceBargeInMonitorSnapshot;
  recordRequested: (input: {
    reason: VoiceBargeInTriggerReason;
    sessionId?: string | null;
  }) => VoiceBargeInMonitorEvent;
  recordSkipped: (input: {
    reason: VoiceBargeInTriggerReason;
    sessionId?: string | null;
  }) => VoiceBargeInMonitorEvent;
  recordStopped: (input: {
    latencyMs?: number;
    playbackStopLatencyMs?: number;
    reason: VoiceBargeInTriggerReason;
    sessionId?: string | null;
  }) => VoiceBargeInMonitorEvent;
  subscribe: (subscriber: () => void) => () => void;
};

export type VoiceAudioPlayerOptions = {
  autoStart?: boolean;
  createAudioContext?: () => AudioContext;
  lookaheadMs?: number;
  /**
   * Playback speed multiplier for the assistant's speech. 1 = normal. Clamped
   * to [0.5, 2]. Pitch shifts with the rate (Web Audio playbackRate), so keep
   * UI ranges modest (≈0.85–1.25) to stay natural. Can be changed live via
   * setPlaybackRate — already-scheduled chunks keep their rate; new chunks
   * adopt the new one.
   */
  playbackRate?: number;
  volume?: number;
};

export type VoiceDuplexControllerOptions = VoiceControllerOptions & {
  audioPlayer?: VoiceAudioPlayerOptions;
  bargeIn?: VoiceBargeInOptions;
};

export type VoiceSTTRoutingGoal = "best" | "low-cost";

export type VoiceSTTRoutingCorrectionMode = "generic" | "none" | "risky-turn";

export type VoiceSTTRoutingStrategy = {
  benchmarkSessionTarget: "deepgram-corrected" | "deepgram-flux";
  correctionMode: VoiceSTTRoutingCorrectionMode;
  goal: VoiceSTTRoutingGoal;
  notes: string[];
  preset: VoiceRuntimePreset;
  sttLifecycle: VoiceSTTLifecycle;
};

export type VoiceHTMXRenderInput<
  TResult = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = {
  assistantTexts: string[];
  partial: string;
  scenarioId?: string;
  result?: TResult;
  session?: TSession;
  sessionId?: string;
  status: VoiceSessionStatus | "idle";
  turnCount: number;
  turns: VoiceTurnRecord<TResult>[];
};

export type VoiceHTMXRenderConfig<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  metrics?: (input: VoiceHTMXRenderInput<TResult, TSession>) => string;
  status?: (input: VoiceHTMXRenderInput<TResult, TSession>) => string;
  turns?: (input: VoiceHTMXRenderInput<TResult, TSession>) => string;
  assistant?: (input: VoiceHTMXRenderInput<TResult, TSession>) => string;
  result?: (input: VoiceHTMXRenderInput<TResult, TSession>) => string;
  emptyState?: (
    kind: keyof VoiceHTMXTargets,
    input: VoiceHTMXRenderInput<TResult, TSession>,
  ) => string;
};

export type VoiceHTMXRenderer<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = (input: VoiceHTMXRenderInput<TResult, TSession>) => string;

export type VoiceHTMXTargets = {
  assistant: string;
  metrics: string;
  result: string;
  status: string;
  turns: string;
};

export type VoiceHTMXOptions<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = VoiceHTMXRenderConfig<TSession, TResult> & {
  bootstrapRoute?: string;
  route?: string;
  targets?: Partial<VoiceHTMXTargets>;
};

export type VoiceHTMXConfig<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = VoiceHTMXRenderer<TSession, TResult> | VoiceHTMXOptions<TSession, TResult>;

export type VoiceStreamState<TResult = unknown> = {
  call: VoiceCallLifecycleState | null;
  sessionMetadata: Record<string, unknown> | null;
  sessionId: string | null;
  scenarioId: string | null;
  status: VoiceSessionStatus | "idle";
  reconnect: VoiceReconnectClientState;
  partial: string;
  turns: VoiceTurnRecord<TResult>[];
  assistantTexts: string[];
  assistantStreamingText: string;
  assistantAudio: Array<{
    chunk: Uint8Array;
    format: AudioFormat;
    receivedAt: number;
    turnId?: string;
  }>;
  error: string | null;
  isConnected: boolean;
};

export type VoiceStream<TResult = unknown> = {
  call: VoiceCallLifecycleState | null;
  callControl: (message: Omit<VoiceClientCallControlMessage, "type">) => void;
  close: () => void;
  start: (input?: { scenarioId?: string; sessionId?: string }) => Promise<void>;
  endTurn: () => void;
  error: string | null;
  getServerSnapshot: () => VoiceStreamState<TResult>;
  getSnapshot: () => VoiceStreamState<TResult>;
  isConnected: boolean;
  partial: string;
  reconnect: VoiceReconnectClientState;
  sendAudio: (audio: Uint8Array | ArrayBuffer) => void;
  simulateDisconnect: () => void;
  sessionId: string | null;
  sessionMetadata: Record<string, unknown> | null;
  scenarioId: string | null;
  status: VoiceSessionStatus | "idle";
  subscribe: (subscriber: () => void) => () => void;
  turns: VoiceTurnRecord<TResult>[];
  assistantTexts: string[];
  assistantStreamingText: string;
  assistantAudio: Array<{
    chunk: Uint8Array;
    format: AudioFormat;
    receivedAt: number;
    turnId?: string;
  }>;
};

export type VoiceControllerState<TResult = unknown> =
  VoiceStreamState<TResult> & {
    isRecording: boolean;
    recordingError: string | null;
  };

export type VoiceAudioPlayerState = {
  activeSourceCount: number;
  error: string | null;
  isActive: boolean;
  isPlaying: boolean;
  lastInterruptLatencyMs?: number;
  lastPlaybackStopLatencyMs?: number;
  processedChunkCount: number;
  queuedChunkCount: number;
};

export type VoiceAudioPlayerSource = {
  assistantAudio: VoiceStreamState["assistantAudio"];
  subscribe: (subscriber: () => void) => () => void;
};

export type VoiceAudioPlayer = {
  close: () => Promise<void>;
  error: string | null;
  /** Instantaneous RMS amplitude (0..1) of the assistant's audio output — for
   *  driving a visualizer from the actual voice. 0 when idle / no analyser. */
  getOutputLevel: () => number;
  getSnapshot: () => VoiceAudioPlayerState;
  activeSourceCount: number;
  isActive: boolean;
  isPlaying: boolean;
  interrupt: () => Promise<void>;
  lastInterruptLatencyMs?: number;
  lastPlaybackStopLatencyMs?: number;
  pause: () => Promise<void>;
  playbackRate: number;
  processedChunkCount: number;
  queuedChunkCount: number;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  start: () => Promise<void>;
  subscribe: (subscriber: () => void) => () => void;
  volume: number;
};

export type VoiceBargeInBinding = {
  close: () => void;
  handleLevel: (level: number) => void;
  sendAudio: (audio: Uint8Array | ArrayBuffer) => void;
};

export type VoiceController<TResult = unknown> = {
  bindHTMX: (options: VoiceHTMXBindingOptions) => () => void;
  call: VoiceCallLifecycleState | null;
  callControl: (message: Omit<VoiceClientCallControlMessage, "type">) => void;
  close: () => void;
  endTurn: () => void;
  start: (input?: { scenarioId?: string; sessionId?: string }) => Promise<void>;
  error: string | null;
  getServerSnapshot: () => VoiceControllerState<TResult>;
  getSnapshot: () => VoiceControllerState<TResult>;
  isConnected: boolean;
  isRecording: boolean;
  partial: string;
  reconnect: VoiceReconnectClientState;
  recordingError: string | null;
  sendAudio: (audio: Uint8Array | ArrayBuffer) => void;
  simulateDisconnect: () => void;
  sessionId: string | null;
  sessionMetadata: Record<string, unknown> | null;
  scenarioId: string | null;
  startRecording: () => Promise<void>;
  status: VoiceSessionStatus | "idle";
  stopRecording: () => void;
  subscribe: (subscriber: () => void) => () => void;
  toggleRecording: () => Promise<void>;
  turns: VoiceTurnRecord<TResult>[];
  assistantTexts: string[];
  assistantStreamingText: string;
  assistantAudio: Array<{
    chunk: Uint8Array;
    format: AudioFormat;
    receivedAt: number;
    turnId?: string;
  }>;
};

export type VoiceDuplexController<TResult = unknown> =
  VoiceController<TResult> & {
    audioPlayer: VoiceAudioPlayer;
    interruptAssistant: () => Promise<void>;
  };

export type VoiceHTMXBindingOptions = {
  element: Element | string;
  eventName?: string;
  route?: string;
  sessionQueryParam?: string;
};

export type VoiceStoreAction<TResult = unknown> =
  | {
      type: "session";
      sessionId: string;
      sessionMetadata?: Record<string, unknown>;
      scenarioId?: string;
      status: VoiceSessionStatus;
    }
  | {
      type: "replay";
      assistantTexts: string[];
      call?: VoiceCallLifecycleState;
      partial: string;
      scenarioId?: string;
      sessionId: string;
      sessionMetadata?: Record<string, unknown>;
      status: VoiceSessionStatus;
      turns: VoiceTurnRecord<TResult>[];
    }
  | {
      type: "call_lifecycle";
      event: VoiceCallLifecycleEvent;
      sessionId: string;
    }
  | {
      type: "partial";
      transcript: Transcript;
    }
  | {
      type: "final";
      transcript: Transcript;
    }
  | {
      type: "turn";
      turn: VoiceTurnRecord<TResult>;
    }
  | {
      type: "assistant";
      text: string;
      turnId?: string;
    }
  | {
      type: "assistant_delta";
      delta: string;
      turnId?: string;
    }
  | {
      type: "audio";
      chunk: Uint8Array;
      format: AudioFormat;
      receivedAt: number;
      turnId?: string;
    }
  | {
      type: "complete";
      sessionId: string;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "connected";
    }
  | {
      type: "connection";
      reconnect: VoiceReconnectClientState;
    }
  | {
      type: "disconnected";
    };
