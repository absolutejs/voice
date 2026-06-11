import { Buffer } from "node:buffer";
import { conditionAudioChunk } from "./audioConditioning";
import { logVoiceTiming } from "./debugTiming";
import {
  createVoiceBackchannelDriver,
  type VoiceBackchannelDriver,
} from "./backchannel";
import {
  applyVoiceHandoffDeliveryResult,
  createVoiceHandoffDeliveryRecord,
  deliverVoiceHandoff,
} from "./handoff";
import { resolveLogger } from "./logger";
import {
  createId,
  createVoiceSessionRecord,
  resetVoiceSessionRecord,
} from "./store";
import {
  DEFAULT_MIN_SILENCE_MS,
  DEFAULT_SILENCE_MS,
  DEFAULT_SPEECH_THRESHOLD,
  buildTurnText,
  measureAudioLevel,
  selectPreferredTranscriptText,
} from "./turnDetection";
import type {
  CreateVoiceSessionOptions,
  AudioChunk,
  AudioFormat,
  RealtimeAdapterSession,
  STTAdapterSession,
  TTSAdapterSession,
  Transcript,
  VoiceCallLifecycleEvent,
  VoiceCallDisposition,
  VoicePhraseHint,
  VoiceFallbackDiagnostics,
  VoiceFallbackSelectionReason,
  VoiceResolvedSTTFallbackConfig,
  VoiceCloseEvent,
  VoiceTurnCostEstimate,
  VoiceEndOfTurnEvent,
  VoiceErrorEvent,
  VoiceServerMessage,
  VoiceSessionHandle,
  VoiceSessionRecord,
  VoiceTurnCitation,
  VoiceTurnCorrectionDiagnostics,
  VoiceTurnRecord,
  VoiceTranscriptQuality,
} from "./types";
import { ttsAdapterSessionCanCancel } from "./types";
import { computePcmDurationMs } from "./recordingStore";
import { resolveVoiceAssistantMode } from "./assistantMode";

const DEFAULT_RECONNECT_TIMEOUT = 30_000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_TRANSCRIPT_STABILITY_MS = 450;
const DEFAULT_FALLBACK_REPLAY_MS = 8_000;
const DEFAULT_FALLBACK_SETTLE_MS = 220;
const DEFAULT_FALLBACK_COMPLETION_TIMEOUT_MS = 2_500;
const DEFAULT_FALLBACK_CONFIDENCE_THRESHOLD = 0.6;
const DEFAULT_FALLBACK_MIN_TEXT_LENGTH = 2;
const DEFAULT_FALLBACK_MAX_ATTEMPTS_PER_TURN = 1;
const DEFAULT_DUPLICATE_TURN_WINDOW_MS = 5_000;
const FALLBACK_CONFIDENCE_SELECTION_DELTA = 0.05;
const FALLBACK_WORD_COUNT_SELECTION_MARGIN_RATIO = 0.12;
const EXTENDED_VENDOR_COMMIT_SILENCE_THRESHOLD_MS = 200;
const MAX_VENDOR_COMMIT_GRACE_MS = 1_200;
// A live call whose speech-to-text socket drops should re-establish the stream,
// not die. Providers (Deepgram) recycle their socket mid-call with a NORMAL
// (1000) close that the adapter flags `recoverable:false` — but for an active
// call that's just a dropped stream: closing our adapter lets the next audio
// packet lazily re-open a fresh STT session (the same path a `recoverable:true`
// close already uses). We only give up and fail the call when the socket FLAPS
// — closes repeatedly within a short window without any transcript progress
// (the signature of a genuinely fatal condition like a rejected API key),
// rather than on a single benign drop.
const STT_RECONNECT_FLAP_WINDOW_MS = 4_000;
const MAX_STT_RECONNECTS_IN_FLAP_WINDOW = 3;
// STT-health watchdog: a streaming STT (e.g. Deepgram) can go DEAD without ever
// emitting a close event — it idle-closes a half-open socket, or wedges, and the
// caller's speech vanishes into a stream that never transcribes. Unlike a clean
// close (handled by handleClose), nothing tells us. So we watch the truth signal:
// if the caller produces continuous speech energy for STT_HEALTH_STALE_MS without
// a SINGLE transcript landing, the stream is dead — force-reconnect it. A new
// speaking phase starts after a gap of STT_HEALTH_SPEECH_GAP_MS so brief pauses
// don't reset the window.
const STT_HEALTH_STALE_MS = 6_000;
const STT_HEALTH_SPEECH_GAP_MS = 2_000;

const DEFAULT_FORMAT = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 16_000,
} as const;

const DEFAULT_REALTIME_FORMAT = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 24_000,
} as const;

type BufferedAudioChunk = {
  chunk: Uint8Array;
  recordedAt: number;
};

const toError = (value: unknown) =>
  value instanceof Error ? value : new Error(String(value));

const createEmptyCurrentTurn = (): VoiceSessionRecord["currentTurn"] => ({
  finalText: "",
  lastSpeechAt: undefined,
  lastTranscriptAt: undefined,
  partialEndedAt: undefined,
  partialStartedAt: undefined,
  partialText: "",
  silenceStartedAt: undefined,
  transcripts: [],
});

const cloneTranscript = (transcript: Transcript) => ({ ...transcript });
const encodeBase64 = (chunk: Uint8Array) =>
  Buffer.from(chunk).toString("base64");

const countWords = (text: string) =>
  text.trim().split(/\s+/).filter(Boolean).length;

const normalizeText = (text: string) => text.trim().replace(/\s+/g, " ");

const getAudioChunkDurationMs = (chunk: Uint8Array) =>
  (chunk.byteLength /
    (DEFAULT_FORMAT.sampleRateHz * DEFAULT_FORMAT.channels * 2)) *
  1_000;

const getBufferedAudioDurationMs = (chunks: Uint8Array[]) =>
  chunks.reduce((total, chunk) => total + getAudioChunkDurationMs(chunk), 0);

// ── Streaming-TTS sentence chunking ──────────────────────────────────────────
// When a route streams its reply (VoiceRouteResult.assistantTextStream), we
// forward speakable phrases to TTS as they form instead of waiting for the full
// reply. A chunk is flushed when a sentence terminator is followed by
// whitespace — requiring the trailing space avoids cutting mid-token while the
// model is still streaming (e.g. "3.5" or "U.S." never trigger a flush). A long
// run-on past MAX_TTS_CHUNK_CHARS is soft-cut at a clause boundary (see below)
// so latency stays bounded. The final partial chunk is flushed when the stream
// ends.
const STREAM_SENTENCE_BOUNDARY = /[.!?…]['")\]]*\s/;
// Clause-level breaks (comma/semicolon/colon followed by whitespace) — natural
// prosodic pause points where a forced soft-cut sounds clean. Cutting mid-clause
// and stranding a tiny tail fragment (e.g. flushing "...part of your " and
// leaving "playbook." as its own send) makes the streaming TTS model emit a
// garbled/foreign-sounding phoneme at the seam — the word before the split is
// synthesised without the following word's context. The threshold is set above a
// typical single sentence so a normal recap sentence flushes whole at its period
// rather than being split.
const STREAM_CLAUSE_BOUNDARY = /[,;:]\s/g;
const MAX_TTS_CHUNK_CHARS = 320;
// A complete sentence sitting in the buffer (terminator at the very end, no
// trailing space yet) — e.g. a whole short reply like "Go on." The normal flush
// needs a terminator FOLLOWED BY whitespace, which a short reply that IS the
// entire turn never gets, so it would wait for the stream to formally close.
// gpt-4.1 can hold a stream open ~4-5s after a tiny completion (slow stop / tool
// deliberation), so the caller hears a 2-word nudge 5s late ("Go on… then
// paused"). If the model goes quiet for STREAM_IDLE_FLUSH_MS with a complete
// sentence buffered, speak it instead of waiting for the close.
const STREAM_SENTENCE_END = /[.!?…]['")\]]*$/;
const STREAM_IDLE_FLUSH_MS = 350;
// P3 eager generation: fire the speculative reply this long after the caller
// goes quiet. Short enough to beat the end-of-turn commit (giving the model a
// real head start), long enough that a brief mid-thought pause usually doesn't
// trigger a wasted generation. Armed ONCE per pause (the silence scheduler runs
// per audio frame, so re-arming each tick would never let the timer mature).
const SPECULATIVE_DELAY_MS = 350;

const nextSpeakableBoundary = (buffer: string) => {
  const match = STREAM_SENTENCE_BOUNDARY.exec(buffer);

  return match ? match.index + match[0].length : -1;
};

const softCutBoundary = (buffer: string) => {
  if (buffer.length < MAX_TTS_CHUNK_CHARS) return -1;
  const window = buffer.slice(0, MAX_TTS_CHUNK_CHARS);
  // Prefer the last clause boundary in the window so the cut lands on a natural
  // pause and both halves stay whole phrases.
  let lastClause = -1;
  for (const match of window.matchAll(STREAM_CLAUSE_BOUNDARY)) {
    lastClause = match.index + match[0].length;
  }
  if (lastClause > 0) return lastClause;
  const lastSpace = window.lastIndexOf(" ");

  return lastSpace > 0 ? lastSpace + 1 : MAX_TTS_CHUNK_CHARS;
};

const calculateMeanConfidence = (transcripts: Transcript[]) => {
  let sum = 0;
  let total = 0;

  for (const transcript of transcripts) {
    if (typeof transcript.confidence === "number") {
      sum += transcript.confidence;
      total += 1;
    }
  }

  if (total === 0) {
    return 0;
  }

  return sum / total;
};

const createTurnQuality = (
  transcripts: Transcript[],
  source: VoiceTranscriptQuality["source"],
  fallbackUsed: boolean,
  fallbackDiagnostics?: VoiceFallbackDiagnostics,
  correctionDiagnostics?: VoiceTurnCorrectionDiagnostics,
  costEstimate?: VoiceTurnCostEstimate,
): VoiceTranscriptQuality => {
  const sampledTranscripts = transcripts.filter(
    (transcript) => typeof transcript.confidence === "number",
  );
  const confidenceSampleCount = sampledTranscripts.length;

  return {
    averageConfidence:
      confidenceSampleCount > 0
        ? sampledTranscripts.reduce(
            (sum, transcript) => sum + transcript.confidence!,
            0,
          ) / confidenceSampleCount
        : undefined,
    confidenceSampleCount,
    correction: correctionDiagnostics,
    cost: costEstimate,
    fallback: fallbackDiagnostics,
    fallbackUsed,
    finalTranscriptCount: transcripts.filter((transcript) => transcript.isFinal)
      .length,
    partialTranscriptCount: transcripts.filter(
      (transcript) => !transcript.isFinal,
    ).length,
    selectedTranscriptCount: transcripts.length,
    source,
  };
};

const createTurnCostEstimate = (input: {
  fallbackAttemptCount: number;
  fallbackPassCostUnit?: number;
  fallbackReplayAudioMs: number;
  primaryAudioMs: number;
  primaryPassCostUnit?: number;
}): VoiceTurnCostEstimate => {
  const primaryMinutes = Math.max(0, input.primaryAudioMs) / 60_000;
  const fallbackMinutes = Math.max(0, input.fallbackReplayAudioMs) / 60_000;
  const primaryCostUnit = input.primaryPassCostUnit ?? 1;
  const fallbackCostUnit = input.fallbackPassCostUnit ?? primaryCostUnit;

  return {
    estimatedRelativeCostUnits:
      primaryMinutes * primaryCostUnit + fallbackMinutes * fallbackCostUnit,
    fallbackAttemptCount: input.fallbackAttemptCount,
    fallbackReplayAudioMs: Math.max(0, input.fallbackReplayAudioMs),
    primaryAudioMs: Math.max(0, input.primaryAudioMs),
    totalBillableAudioMs:
      Math.max(0, input.primaryAudioMs) +
      Math.max(0, input.fallbackReplayAudioMs),
  };
};

type TurnTranscriptionSelection = {
  diagnostics: VoiceFallbackDiagnostics;
  source: "fallback" | "primary";
  fallbackUsed: boolean;
  text: string;
  transcripts: Transcript[];
};

const normalizeCorrectionText = (text: string) => normalizeText(text);

const isFallbackNeeded = (
  candidate: {
    text: string;
    transcripts: Transcript[];
  },
  config: VoiceResolvedSTTFallbackConfig,
) => {
  const trimmed = normalizeText(candidate.text);
  const wordCount = countWords(trimmed);

  if (config.trigger === "always") {
    return true;
  }

  if (config.trigger === "empty-turn") {
    return wordCount < config.minTextLength;
  }

  const averageConfidence = calculateMeanConfidence(candidate.transcripts);

  if (config.trigger === "low-confidence") {
    return (
      averageConfidence > 0 && averageConfidence < config.confidenceThreshold
    );
  }

  return (
    (averageConfidence > 0 && averageConfidence < config.confidenceThreshold) ||
    wordCount < config.minTextLength
  );
};

const selectBetterTurnText = (
  candidate: {
    confidence: number;
    text: string;
    wordCount: number;
  },
  fallback: {
    confidence: number;
    text: string;
    wordCount: number;
  },
): {
  reason: VoiceFallbackSelectionReason;
  winner: typeof candidate | typeof fallback;
} => {
  if (!fallback.text) {
    return {
      reason: "fallback-empty",
      winner: candidate,
    };
  }

  if (!candidate.text) {
    return {
      reason: "primary-empty",
      winner: fallback,
    };
  }

  const largestWordCount = Math.max(candidate.wordCount, fallback.wordCount, 1);
  const wordCountDelta = fallback.wordCount - candidate.wordCount;
  const wordCountDeltaRatio = Math.abs(wordCountDelta) / largestWordCount;

  if (
    wordCountDeltaRatio >= FALLBACK_WORD_COUNT_SELECTION_MARGIN_RATIO &&
    wordCountDelta !== 0
  ) {
    return {
      reason: "word-count-margin",
      winner: wordCountDelta > 0 ? fallback : candidate,
    };
  }

  if (
    fallback.confidence >
    candidate.confidence + FALLBACK_CONFIDENCE_SELECTION_DELTA
  ) {
    return {
      reason: "confidence-margin",
      winner: fallback,
    };
  }

  if (
    candidate.confidence >
    fallback.confidence + FALLBACK_CONFIDENCE_SELECTION_DELTA
  ) {
    return {
      reason: "kept-primary",
      winner: candidate,
    };
  }

  if (fallback.wordCount > candidate.wordCount) {
    return {
      reason: "word-count-tiebreak",
      winner: fallback,
    };
  }

  return {
    reason: "kept-primary",
    winner: candidate,
  };
};

const setTurnResult = <TSession extends VoiceSessionRecord, TResult = unknown>(
  session: TSession,
  turnId: string,
  input: {
    assistantText?: string;
    result?: TResult;
    citations?: ReadonlyArray<VoiceTurnCitation>;
  },
) => {
  session.turns = session.turns.map((turn) =>
    turn.id === turnId
      ? {
          ...turn,
          assistantText: input.assistantText ?? turn.assistantText,
          result: input.result ?? turn.result,
          citations:
            input.citations && input.citations.length > 0
              ? [...input.citations]
              : turn.citations,
        }
      : turn,
  );
};

const ensureCallLifecycleState = <TSession extends VoiceSessionRecord>(
  session: TSession,
) => {
  const startedAt = session.createdAt;

  session.call ??= {
    events: [],
    lastEventAt: startedAt,
    startedAt,
  };

  return session.call;
};

const pushCallLifecycleEvent = <TSession extends VoiceSessionRecord>(
  session: TSession,
  input: {
    disposition?: VoiceCallDisposition;
    metadata?: Record<string, unknown>;
    reason?: string;
    target?: string;
    type:
      | "start"
      | "end"
      | "transfer"
      | "escalation"
      | "voicemail"
      | "no-answer";
  },
) => {
  const lifecycle = ensureCallLifecycleState(session);
  const at = Date.now();

  lifecycle.events = [
    ...lifecycle.events,
    {
      at,
      disposition: input.disposition,
      metadata: input.metadata,
      reason: input.reason,
      target: input.target,
      type: input.type,
    },
  ];
  lifecycle.lastEventAt = at;

  if (input.type === "end") {
    lifecycle.disposition = input.disposition;
    lifecycle.endedAt = at;
  }

  return lifecycle;
};

const getLatestCallLifecycleEvent = (
  session: VoiceSessionRecord,
): VoiceCallLifecycleEvent | undefined => session.call?.events.at(-1);

export const createVoiceSession = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: CreateVoiceSessionOptions<TContext, TSession, TResult>,
): VoiceSessionHandle<TContext, TSession, TResult> => {
  const logger = resolveLogger(options.logger);
  const reconnect = {
    maxAttempts:
      options.reconnect.maxAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
    strategy: options.reconnect.strategy ?? "resume-last-turn",
    timeout: options.reconnect.timeout ?? DEFAULT_RECONNECT_TIMEOUT,
  };
  const resolvedSilenceMs = options.turnDetection.silenceMs ?? DEFAULT_SILENCE_MS;
  const turnDetection = {
    silenceMs: resolvedSilenceMs,
    // Floor of the adaptive endpointing window. Defaults to the smaller of the
    // ceiling and DEFAULT_MIN_SILENCE_MS so existing callers (no minSilenceMs)
    // still get a snappy floor without ever exceeding their configured ceiling.
    minSilenceMs: Math.min(
      resolvedSilenceMs,
      options.turnDetection.minSilenceMs ?? DEFAULT_MIN_SILENCE_MS,
    ),
    speechThreshold:
      options.turnDetection.speechThreshold ?? DEFAULT_SPEECH_THRESHOLD,
    transcriptStabilityMs:
      options.turnDetection.transcriptStabilityMs ??
      DEFAULT_TRANSCRIPT_STABILITY_MS,
  };
  // Latest P(turn complete) from the semantic detector (its `confidence`), used
  // to scale the adaptive silence window. null until the detector has weighed in
  // on the current turn; reset when the turn commits or the caller speaks again.
  let lastTurnCompleteConfidence: number | null = null;

  // Adaptive endpointing: map the latest completion-confidence to a silence
  // window between the floor (commit fast when clearly done) and the ceiling
  // (wait longer when the caller looks mid-thought). No confidence yet → the
  // full ceiling, so we never commit faster than the caller's configured wait
  // until the detector says it's safe.
  const adaptiveSilenceMs = () => {
    const { minSilenceMs, silenceMs } = turnDetection;
    if (lastTurnCompleteConfidence === null || silenceMs <= minSilenceMs) {
      return silenceMs;
    }
    const complete = Math.max(0, Math.min(1, lastTurnCompleteConfidence));

    return Math.round(minSilenceMs + (silenceMs - minSilenceMs) * (1 - complete));
  };

  // P3 eager generation: a reply the route pre-generated during the silence
  // window, tagged with the pending text it saw. Reused on commit ONLY if the
  // committed transcript still equals `pendingText` (the caller stayed quiet);
  // a resume changes the text and discards it. `speculativeTimer` fires the
  // speculation partway through the silence window.
  let speculativeReply: { pendingText: string; text: string } | null = null;
  let speculativeTimer: ReturnType<typeof setTimeout> | null = null;
  // Guards "arm once per pause" — set when the speculative timer is armed,
  // cleared on resume/commit so the next pause can speculate afresh.
  let speculationAttempted = false;
  console.info(
    `[voice][p3dbg] session ${options.id} route.speculate wired=${Boolean(options.route.speculate)}`,
  );
  const sttFallback: VoiceResolvedSTTFallbackConfig | undefined =
    options.sttFallback
      ? {
          adapter: options.sttFallback.adapter,
          completionTimeoutMs:
            options.sttFallback.completionTimeoutMs ??
            DEFAULT_FALLBACK_COMPLETION_TIMEOUT_MS,
          confidenceThreshold:
            options.sttFallback.confidenceThreshold ??
            DEFAULT_FALLBACK_CONFIDENCE_THRESHOLD,
          maxAttemptsPerTurn:
            options.sttFallback.maxAttemptsPerTurn ??
            DEFAULT_FALLBACK_MAX_ATTEMPTS_PER_TURN,
          minTextLength:
            options.sttFallback.minTextLength ??
            DEFAULT_FALLBACK_MIN_TEXT_LENGTH,
          replayWindowMs:
            options.sttFallback.replayWindowMs ?? DEFAULT_FALLBACK_REPLAY_MS,
          settleMs: options.sttFallback.settleMs ?? DEFAULT_FALLBACK_SETTLE_MS,
          trigger: options.sttFallback.trigger ?? "empty-or-low-confidence",
        }
      : undefined;

  const appendTrace = async (input: {
    at?: number;
    metadata?: Record<string, unknown>;
    payload: Record<string, unknown>;
    session?: TSession;
    turnId?: string;
    type:
      | "call.handoff"
      | "call.lifecycle"
      | "cost.ready"
      | "operator.action"
      | "recording.ready"
      | "session.error"
      | "turn.assistant"
      | "turn.committed"
      | "turn.cost"
      | "turn_latency.stage"
      | "turn.transcript";
  }) => {
    await options.trace?.append({
      at: input.at ?? Date.now(),
      metadata: input.metadata,
      payload: input.payload,
      scenarioId: input.session?.scenarioId ?? options.scenarioId,
      sessionId: options.id,
      turnId: input.turnId,
      type: input.type,
    });
  };
  const appendTurnLatencyStage = async (input: {
    at?: number;
    session?: TSession;
    stage: string;
    turnId?: string;
    /** Extra fields merged into the stage payload (e.g. `{reason: "barge-in"}`
     *  on a `tts_canceled` stage). Lets one event type carry per-cause
     *  debugging context without inflating the trace `type` union. */
    metadata?: Record<string, unknown>;
  }) =>
    appendTrace({
      at: input.at,
      payload: { stage: input.stage, ...(input.metadata ?? {}) },
      session: input.session,
      turnId: input.turnId,
      type: "turn_latency.stage",
    });
  const phraseHints = options.phraseHints ?? [];
  const lexicon = options.lexicon ?? [];

  let { socket } = options;
  let sttSession: STTAdapterSession | RealtimeAdapterSession | null = null;
  let ttsSession: TTSAdapterSession | null = null;
  let ttsSessionPromise: Promise<TTSAdapterSession | null> | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingCommitReason: VoiceEndOfTurnEvent["reason"] | null = null;
  let speechDetected = false;
  let operationQueue = Promise.resolve();
  let adapterGenerationCounter = 0;
  let activeAdapterGeneration = 0;
  // STT-reconnect flap tracking (see STT_RECONNECT_FLAP_WINDOW_MS).
  let sttReconnectCount = 0;
  let lastSttReconnectAt = 0;
  // STT-health watchdog state (see STT_HEALTH_STALE_MS).
  let lastSpeechEnergyAt = 0;
  let sttHealthPhaseStart = 0;
  let activeTTSTurnId: string | undefined;
  // Estimated wall-clock time the client finishes PLAYING all assistant audio
  // we've sent so far (each chunk plays back-to-back in real time). A graceful
  // complete (end_call / intake done) waits for this so the closing line is
  // heard before the call tears down, instead of being cut mid-"goodbye".
  let assistantSpeechEndsAt = 0;
  // Wall-clock of the most recent assistant audio chunk RECEIVED from the TTS
  // provider. The drain uses this to detect when the provider has stopped
  // streaming (audio gone quiet) — `assistantSpeechEndsAt` alone is the
  // playback estimate for audio already received, which underestimates while a
  // closing line is still being rendered chunk-by-chunk after the text send
  // resolved. Without tracking arrival activity, the drain reads a near-empty
  // playback clock and tears the call down mid-closing.
  let lastAssistantAudioAt = 0;
  // Wall-clock of the most recent real-turn TTS text send (greeting, streamed
  // reply tail, or one-shot reply). The drain treats this as "a render is
  // pending": it waits for audio to actually start arriving for this send
  // before trusting the quiescence/playback clocks, so a provider's
  // text-sent→first-audio latency can't look like an already-drained stream.
  let lastTtsSendAt = 0;
  // Filler-phrase state (Boardy-style "the pause is character, not lag").
  // `fillerTimer` is the scheduled-but-not-yet-fired filler trigger.
  // `fillerActive` is true once a filler has been sent to TTS for the current
  // turn and not yet superseded by the real assistant audio. `fillerToken`
  // invalidates any in-flight timer if a new turn commits before the previous
  // filler logic resolves (token mismatch → skip).
  let fillerTimer: ReturnType<typeof setTimeout> | null = null;
  let fillerActive = false;
  let fillerToken = 0;
  const fillerPhrases = (options.fillerPhrases ?? []).filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  const fillerDelayMs = options.fillerDelayMs ?? 250;
  // Minimum word count an STT partial must reach before barge-in cancels
  // the in-flight TTS. Default 1 keeps backwards-compat. Phone routes
  // typically set 2 — live-test 2026-05-27 had single-word partials
  // ("you", "am i") cutting the bot off mid-question.
  const bargeInMinPartialWords = Math.max(
    1,
    options.bargeInMinPartialWords ?? 1,
  );
  // Latency Theater (content-aware filler): when the host wires `fillerFor`,
  // we race a per-turn cheap LLM call against `fillerForTimeoutMs` and
  // prefer its output over a random static phrase. The static phrases stay
  // wired as the fallback so a slow / failing acknowledgement call never
  // costs you a filler entirely.
  const fillerFor = options.fillerFor;
  const fillerForTimeoutMs = options.fillerForTimeoutMs ?? 600;
  const currentTurnAudio: BufferedAudioChunk[] = [];
  const pendingUserAttachments: import("./agent").VoiceAgentMessageAttachment[] =
    [];
  let fallbackAttemptsForCurrentTurn = 0;
  let fallbackReplayAudioMsForCurrentTurn = 0;

  const amdDetector = options.amd;
  let amdEvaluationTimer: ReturnType<typeof setInterval> | null = null;
  let amdFired = false;
  let amdFirstAudioAt: number | undefined;
  let amdLastTurnCommitAt: number | undefined;
  let amdLastAudioLevel: number | undefined;

  const clearAmdEvaluationTimer = () => {
    if (amdEvaluationTimer) {
      clearInterval(amdEvaluationTimer);
      amdEvaluationTimer = null;
    }
  };

  const evaluateAmd = async () => {
    if (!amdDetector || amdFired) {
      return;
    }
    let snapshot: TSession;
    try {
      snapshot = await readSession();
    } catch {
      return;
    }
    const now = Date.now();
    const verdict = await Promise.resolve(
      amdDetector.evaluate({
        api,
        audioLevel: amdLastAudioLevel,
        elapsedSinceFirstAudioMs:
          amdFirstAudioAt === undefined ? 0 : now - amdFirstAudioAt,
        elapsedSinceLastTurnCommitMs:
          amdLastTurnCommitAt === undefined ? 0 : now - amdLastTurnCommitAt,
        partialTranscript: snapshot.currentTurn.partialText,
        session: snapshot,
        transcripts: [
          ...snapshot.transcripts,
          ...snapshot.currentTurn.transcripts,
        ],
      }),
    );
    if (!verdict || amdFired) {
      return;
    }
    amdFired = true;
    clearAmdEvaluationTimer();
    try {
      await api.markVoicemail({
        metadata: verdict.metadata,
      });
    } catch (error) {
      logger.warn("voice amd markVoicemail failed", {
        error: toError(error).message,
        sessionId: options.id,
      });
    }
  };

  const startAmdEvaluationTimer = () => {
    if (!amdDetector || amdEvaluationTimer || amdFired) {
      return;
    }
    const intervalMs = amdDetector.intervalMs ?? 1_000;
    amdEvaluationTimer = setInterval(() => {
      void evaluateAmd();
    }, intervalMs);
  };

  const callSilenceTimeoutMs =
    options.callSilenceTimeoutMs && options.callSilenceTimeoutMs > 0
      ? options.callSilenceTimeoutMs
      : undefined;
  let callSilenceWatchdog: ReturnType<typeof setTimeout> | null = null;
  let callSilenceFired = false;
  const clearCallSilenceWatchdog = () => {
    if (callSilenceWatchdog) {
      clearTimeout(callSilenceWatchdog);
      callSilenceWatchdog = null;
    }
  };
  const fireCallSilenceTimeout = () => {
    callSilenceWatchdog = null;
    if (callSilenceFired) {
      return;
    }
    callSilenceFired = true;
    void api.close("silence-timeout");
  };
  const kickCallSilenceWatchdog = () => {
    if (callSilenceTimeoutMs === undefined || callSilenceFired) {
      return;
    }
    clearCallSilenceWatchdog();
    callSilenceWatchdog = setTimeout(
      fireCallSilenceTimeout,
      callSilenceTimeoutMs,
    );
  };

  const recordingConfig = options.recording;
  const recordingChannels = new Set<"assistant" | "user">(
    recordingConfig?.channels ?? ["assistant", "user"],
  );
  const recordingMaxBytes =
    recordingConfig?.maxBytesPerChannel ?? 50 * 1024 * 1024;
  const recordingBuffers: Record<"assistant" | "user", Uint8Array[]> = {
    assistant: [],
    user: [],
  };
  const recordingByteTotals: Record<"assistant" | "user", number> = {
    assistant: 0,
    user: 0,
  };
  const recordingFormats: Partial<Record<"assistant" | "user", AudioFormat>> =
    {};
  let recordingPersisted = false;
  const captureRecordingChunk = (
    channel: "assistant" | "user",
    bytes: Uint8Array,
    format: AudioFormat,
  ) => {
    if (!recordingConfig || recordingPersisted) {
      return;
    }
    if (!recordingChannels.has(channel)) {
      return;
    }
    if (format.container !== "raw" || format.encoding !== "pcm_s16le") {
      return;
    }
    const currentTotal = recordingByteTotals[channel];
    if (currentTotal >= recordingMaxBytes) {
      return;
    }
    const remaining = recordingMaxBytes - currentTotal;
    const slice =
      bytes.byteLength <= remaining ? bytes : bytes.subarray(0, remaining);
    recordingBuffers[channel].push(new Uint8Array(slice));
    recordingByteTotals[channel] += slice.byteLength;
    recordingFormats[channel] = format;
  };

  const pruneTurnAudio = () => {
    const replayWindowMs =
      sttFallback?.replayWindowMs ?? DEFAULT_FALLBACK_REPLAY_MS;
    const cutoffAt = Date.now() - replayWindowMs;
    let index = 0;

    while (
      index < currentTurnAudio.length &&
      currentTurnAudio[index]!.recordedAt < cutoffAt
    ) {
      index += 1;
    }

    if (index > 0) {
      currentTurnAudio.splice(0, index);
    }
  };

  const pushTurnAudio = (audio: AudioChunk) => {
    const chunk =
      audio instanceof ArrayBuffer
        ? new Uint8Array(audio.slice(0))
        : new Uint8Array(
            audio.buffer.slice(
              audio.byteOffset,
              audio.byteOffset + audio.byteLength,
            ),
          );

    currentTurnAudio.push({
      chunk,
      recordedAt: Date.now(),
    });

    pruneTurnAudio();
  };

  const getFallbackWindowAudio = () => {
    if (!sttFallback?.adapter) {
      return [];
    }

    pruneTurnAudio();

    return currentTurnAudio.map((audio) => audio.chunk);
  };

  // The current turn's buffered user audio (PCM, oldest→newest) + its format, for
  // an audio-based semantic turn detector. Undefined when nothing's buffered.
  const turnAudioInputFormat =
    recordingConfig?.userInputFormat ??
    options.realtimeInputFormat ??
    DEFAULT_REALTIME_FORMAT;
  const getTurnAudioForDetector = () => {
    if (!options.semanticTurnDetector || currentTurnAudio.length === 0) {
      return { turnAudio: undefined, turnAudioFormat: undefined };
    }
    const turnAudio = currentTurnAudio.map((audio) => {
      const c = audio.chunk;

      return c instanceof ArrayBuffer
        ? new Uint8Array(c)
        : new Uint8Array(c.buffer, c.byteOffset, c.byteLength);
    });

    return { turnAudio, turnAudioFormat: turnAudioInputFormat };
  };

  const clearSilenceTimer = () => {
    if (!silenceTimer) {
      return;
    }

    clearTimeout(silenceTimer);
    silenceTimer = null;
    pendingCommitReason = null;
  };

  const getVendorCommitDelayMs = () => {
    if (
      turnDetection.silenceMs < EXTENDED_VENDOR_COMMIT_SILENCE_THRESHOLD_MS ||
      turnDetection.transcriptStabilityMs <
        EXTENDED_VENDOR_COMMIT_SILENCE_THRESHOLD_MS
    ) {
      return turnDetection.transcriptStabilityMs;
    }

    return Math.max(
      turnDetection.transcriptStabilityMs,
      Math.min(MAX_VENDOR_COMMIT_GRACE_MS, turnDetection.silenceMs * 2),
    );
  };

  const send = async (message: VoiceServerMessage) => {
    try {
      await Promise.resolve(socket.send(JSON.stringify(message)));
    } catch (error) {
      logger.warn("voice socket send failed", {
        error: toError(error).message,
        sessionId: options.id,
        type: message.type,
      });
    }
  };

  const sendCallLifecycle = async (session: TSession) => {
    const event = getLatestCallLifecycleEvent(session);
    if (!event) {
      return;
    }

    await send({
      event,
      sessionId: options.id,
      type: "call_lifecycle",
    });
  };

  const sendReplay = async (session: TSession) => {
    await send({
      assistantTexts: session.turns.flatMap((turn) =>
        turn.assistantText ? [turn.assistantText] : [],
      ),
      call: session.call,
      partial: session.currentTurn.partialText,
      scenarioId: session.scenarioId,
      sessionId: options.id,
      sessionMetadata:
        session.metadata && typeof session.metadata === "object"
          ? session.metadata
          : undefined,
      status: session.status,
      turns: session.turns,
      type: "replay",
    });
  };

  const runHandoff = async (input: {
    action: "escalate" | "no-answer" | "transfer" | "voicemail";
    metadata?: Record<string, unknown>;
    reason?: string;
    result?: TResult;
    session: TSession;
    target?: string;
  }) => {
    const queuedDelivery = options.handoff?.deliveryQueue
      ? createVoiceHandoffDeliveryRecord({
          action: input.action,
          context: options.context,
          metadata: input.metadata,
          reason: input.reason,
          result: input.result,
          session: input.session,
          target: input.target,
        })
      : undefined;
    if (queuedDelivery) {
      await options.handoff?.deliveryQueue?.set(
        queuedDelivery.id,
        queuedDelivery,
      );
    }
    if (options.handoff?.enqueueOnly) {
      return;
    }

    const result = await deliverVoiceHandoff({
      config: options.handoff,
      handoff: {
        action: input.action,
        api,
        context: options.context,
        metadata: input.metadata,
        reason: input.reason,
        result: input.result,
        session: input.session,
        target: input.target,
      },
    });
    if (!result) {
      return;
    }
    if (queuedDelivery) {
      const updatedDelivery = applyVoiceHandoffDeliveryResult(
        queuedDelivery,
        result,
      );
      await options.handoff?.deliveryQueue?.set(
        updatedDelivery.id,
        updatedDelivery,
      );
    }

    await appendTrace({
      metadata: input.metadata,
      payload: {
        ...result,
        reason: input.reason,
        target: input.target,
      },
      session: input.session,
      type: "call.handoff",
    });
  };

  const readSession = async () => options.store.getOrCreate(options.id);

  const writeSession = async (mutate: (session: TSession) => void) => {
    const session = await options.store.getOrCreate(options.id);
    mutate(session);
    await options.store.set(options.id, session);

    return session;
  };

  const runSerial = <T>(
    phase: string,
    operation: () => Promise<T> | T,
  ): Promise<T> => {
    const result = operationQueue.then(async () => {
      logger.debug("voice session operation", {
        phase,
        sessionId: options.id,
      });

      return await operation();
    });

    operationQueue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  };

  // Assistant audio delivery runs on its OWN serial chain, NOT the main
  // operationQueue. Routing audio through `runSerial` starves it behind the
  // turn-commit op that produced it: for a normal turn the audio merely bursts
  // out once the turn resolves, but a graceful complete runs the closing-drain
  // INSIDE that op, so the closing audio can never arrive in time to be drained
  // and the call tears down mid-"goodbye". A dedicated chain keeps chunks
  // strictly ordered relative to each other while letting them flow
  // concurrently with turn control (also why normal replies now stream in
  // real time instead of bursting after the turn).
  let assistantAudioQueue: Promise<void> = Promise.resolve();
  const runAudioSerial = (operation: () => Promise<void> | void): void => {
    const next = assistantAudioQueue.then(operation);
    assistantAudioQueue = next.then(
      () => undefined,
      () => undefined,
    );
  };

  const closeAdapter = async (reason?: string) => {
    if (!sttSession) {
      return;
    }

    const activeSession = sttSession;
    sttSession = null;
    activeAdapterGeneration = 0;

    try {
      await activeSession.close(reason);
    } catch (error) {
      logger.warn("voice stt close failed", {
        error: toError(error).message,
        sessionId: options.id,
      });
    }
  };

  const closeTTSSession = async (reason?: string) => {
    const activeSession = ttsSession;
    ttsSession = null;
    ttsSessionPromise = null;
    activeTTSTurnId = undefined;

    if (!activeSession) {
      return;
    }

    try {
      await activeSession.close(reason);
    } catch (error) {
      logger.warn("voice tts adapter close failed", {
        error: toError(error).message,
        reason,
        sessionId: options.id,
      });
    }
  };

  const persistRecordings = async () => {
    if (!recordingConfig || recordingPersisted) {
      return;
    }
    recordingPersisted = true;
    const channels: Array<"assistant" | "user"> = ["assistant", "user"];
    for (const channel of channels) {
      if (!recordingChannels.has(channel)) {
        continue;
      }
      const chunks = recordingBuffers[channel];
      const format = recordingFormats[channel];
      if (chunks.length === 0 || !format) {
        continue;
      }
      const totalBytes = recordingByteTotals[channel];
      const merged = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      try {
        const stored = await recordingConfig.store.put({
          audioBytes: merged,
          capturedAt: Date.now(),
          channel,
          durationMs: computePcmDurationMs(totalBytes, format),
          format,
          sessionId: options.id,
        });
        await appendTrace({
          payload: {
            channel,
            durationMs: stored.durationMs,
            recordingUrl: stored.recordingUrl,
            sessionId: options.id,
            sizeBytes: merged.byteLength,
          },
          type: "recording.ready",
        });
      } catch (error) {
        logger.warn("voice recording persist failed", {
          channel,
          error: toError(error).message,
          sessionId: options.id,
        });
      } finally {
        recordingBuffers[channel] = [];
        recordingByteTotals[channel] = 0;
      }
    }
  };

  const finalizeCostReport = async (session: TSession) => {
    if (!options.costAccountant) {
      return;
    }
    const lifecycle = session.call;
    if (lifecycle?.startedAt && lifecycle.endedAt) {
      const durationMs = Math.max(0, lifecycle.endedAt - lifecycle.startedAt);
      const minutes = durationMs / 60_000;
      if (minutes > 0) {
        options.costAccountant.recordTelephony({
          minutes,
          provider: options.costTelephony?.provider,
        });
      }
    }
    const breakdown = options.costAccountant.snapshot();
    await appendTrace({
      payload: {
        ...breakdown,
        sessionId: options.id,
      },
      session,
      type: "cost.ready",
    });
  };

  const cancelActiveTTS = async (reason: string) => {
    const activeSession = ttsSession;
    const cancelledTurnId = activeTTSTurnId;
    if (!activeSession || cancelledTurnId === undefined) {
      return;
    }
    activeTTSTurnId = undefined;
    // Barged-in audio won't finish playing — drop the pending playback estimate
    // so a later graceful complete doesn't wait on speech that got cut off.
    assistantSpeechEndsAt = Date.now();
    // Trace the cancel BEFORE doing the work so it lands even if the
    // adapter close hangs. Hosts use this to diagnose "got cut off
    // mid-question" complaints — the `reason` ("barge-in",
    // "filler-superseded", "barge-in clear") is the smoking gun.
    void appendTurnLatencyStage({
      metadata: { reason },
      stage: "tts_canceled",
      turnId: cancelledTurnId,
    }).catch(() => {});
    // Flush whatever is already buffered downstream (e.g. a telephony carrier's
    // outbound audio) so barge-in silences the assistant for the caller
    // immediately — even if the TTS adapter itself can't be cancelled.
    void Promise.resolve(socket.clear?.()).catch(() => {});
    if (!ttsAdapterSessionCanCancel(activeSession)) {
      return;
    }
    try {
      await activeSession.cancel(reason);
    } catch (error) {
      logger.warn("voice tts adapter cancel failed", {
        error: toError(error).message,
        reason,
        sessionId: options.id,
        turnId: cancelledTurnId,
      });
    }
    // RESET THE SHARED TTS SESSION after a barge-in cancel. Several adapters
    // (notably Deepgram Aura's streaming HTTP impl) leave the post-cancel
    // session in a state where the NEXT send() silently hangs forever — no
    // chunks, no errors. Closing the session + clearing the cache forces
    // ensureTTSSession() to open a fresh session for the next turn, which is
    // a clean state. Costs ~50-100ms of session-open latency on the next
    // turn vs total dead air; clear win.
    // Diagnosed 2026-05-27 live: Turn 1 worked, Turn 2 silent after barge-in;
    // see project_voice_tester_outbound_mode.md.
    try {
      ttsSession = null;
      ttsSessionPromise = null;
      await activeSession.close("post-cancel-reset");
    } catch (error) {
      logger.warn("voice tts adapter close-after-cancel failed", {
        error: toError(error).message,
        reason,
        sessionId: options.id,
      });
    }
  };

  const sendAssistantAudio = async (
    chunk: AudioChunk,
    input: {
      format: AudioFormat;
      receivedAt: number;
    },
  ) => {
    const normalizedChunk =
      chunk instanceof Uint8Array
        ? new Uint8Array(chunk)
        : chunk instanceof ArrayBuffer
          ? new Uint8Array(chunk.slice(0))
          : new Uint8Array(
              chunk.buffer.slice(
                chunk.byteOffset,
                chunk.byteOffset + chunk.byteLength,
              ),
            );

    captureRecordingChunk("assistant", normalizedChunk, input.format);
    kickCallSilenceWatchdog();

    await send({
      chunkBase64: encodeBase64(normalizedChunk),
      format: input.format,
      receivedAt: input.receivedAt,
      turnId: activeTTSTurnId,
      type: "audio",
    });
    // Extend the estimated playback-end clock by this chunk's real-time
    // duration. raw pcm_s16le = 2 bytes/sample; a/mulaw = 1 byte/sample.
    const bytesPerSample = input.format.encoding === "pcm_s16le" ? 2 : 1;
    const bytesPerSecond =
      input.format.sampleRateHz * input.format.channels * bytesPerSample;
    if (bytesPerSecond > 0) {
      const chunkMs = (normalizedChunk.byteLength / bytesPerSecond) * 1000;
      assistantSpeechEndsAt =
        Math.max(assistantSpeechEndsAt, Date.now()) + chunkMs;
    }
    // Mark that audio is still actively arriving so the graceful-complete drain
    // can tell "provider still streaming the closing" from "stream finished".
    lastAssistantAudioAt = Date.now();
    if (activeTTSTurnId) {
      await appendTurnLatencyStage({
        at: input.receivedAt,
        stage: "assistant_audio_received",
        turnId: activeTTSTurnId,
      });
    }
  };

  const scheduleTurnCommit = (
    delayMs: number,
    reason: VoiceEndOfTurnEvent["reason"],
    reset = true,
  ) => {
    if (!reset && silenceTimer) {
      return;
    }

    if (reset) {
      clearSilenceTimer();
    }

    pendingCommitReason = reason;
    silenceTimer = setTimeout(() => {
      silenceTimer = null;
      pendingCommitReason = null;
      void runScheduledCommit(reason);
    }, delayMs);
  };

  // P3: discard any pending/stored speculation (timer + result) and allow the
  // next pause to arm a fresh one.
  const clearSpeculation = () => {
    if (speculativeTimer) {
      clearTimeout(speculativeTimer);
      speculativeTimer = null;
    }
    speculativeReply = null;
    speculationAttempted = false;
  };

  // P3: fire the route's speculate hook on the caller's utterance-so-far and
  // stash the reply. Pure — the route generates text only; we never play it
  // here. Kept only if the turn hasn't already produced a stored speculation.
  const runSpeculation = async () => {
    if (!options.route.speculate || speculativeReply) {
      return;
    }
    const session = await readSession();
    const pendingText = buildTurnText(
      session.currentTurn.transcripts,
      session.currentTurn.partialText,
      {
        partialEndedAtMs: session.currentTurn.partialEndedAt,
        partialStartedAtMs: session.currentTurn.partialStartedAt,
      },
    );
    if (!pendingText) {
      return;
    }
    const provisionalTurn: VoiceTurnRecord<TResult> = {
      committedAt: Date.now(),
      id: createId(),
      text: pendingText,
      transcripts: session.currentTurn.transcripts,
    };
    try {
      const result = await Promise.resolve(
        options.route.speculate({
          api,
          context: options.context,
          session,
          turn: provisionalTurn,
        }),
      );
      console.info(
        `[voice][p3] speculate fired session=${session.id} -> ${result?.text ? `${result.text.length} chars` : "null"} for "${pendingText.slice(0, 30)}"`,
      );
      if (result && result.text.trim() && !speculativeReply) {
        speculativeReply = { pendingText, text: result.text };
      }
    } catch (error) {
      // A speculation failure is non-fatal — the real turn regenerates.
      console.info(
        `[voice][p3] speculate error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const scheduleSilenceCommit = (
    delayMs = adaptiveSilenceMs(),
    reset = true,
  ) => {
    scheduleTurnCommit(delayMs, "silence", reset);
    // P3: arm eager generation ONCE per pause. This scheduler runs per audio
    // frame, so `speculationAttempted` stops each tick from resetting the timer;
    // a resume/commit clears the flag (via clearSpeculation) so the next pause
    // can speculate again.
    if (options.route.speculate && reset && !speculationAttempted) {
      speculationAttempted = true;
      console.info(
        `[voice][p3dbg] armed speculation delay=${SPECULATIVE_DELAY_MS} reason=silence session=${options.id}`,
      );
      speculativeTimer = setTimeout(() => {
        speculativeTimer = null;
        void runSpeculation();
      }, SPECULATIVE_DELAY_MS);
    }
  };

  // The silence window is now adaptive (see adaptiveSilenceMs): the detector's
  // completion-confidence already lengthens the wait for a mid-thought pause and
  // shortens it when the caller is clearly done, so the timer firing IS the
  // decision — no separate binary veto/defer loop.
  const runScheduledCommit = async (
    reason: VoiceEndOfTurnEvent["reason"],
  ) => {
    await api.commitTurn(reason);
  };

  const requestTurnCommit = async (reason: VoiceEndOfTurnEvent["reason"]) => {
    const session = await readSession();
    const text = buildTurnText(
      session.currentTurn.transcripts,
      session.currentTurn.partialText,
      {
        partialEndedAtMs: session.currentTurn.partialEndedAt,
        partialStartedAtMs: session.currentTurn.partialStartedAt,
      },
    );

    if (!text) {
      return;
    }

    const transcriptStabilityAge =
      session.currentTurn.lastTranscriptAt !== undefined
        ? Date.now() - session.currentTurn.lastTranscriptAt
        : undefined;

    if (reason === "vendor") {
      scheduleTurnCommit(getVendorCommitDelayMs(), reason);

      return;
    }

    if (
      reason !== "manual" &&
      typeof transcriptStabilityAge === "number" &&
      transcriptStabilityAge < turnDetection.transcriptStabilityMs
    ) {
      scheduleTurnCommit(
        turnDetection.transcriptStabilityMs - transcriptStabilityAge,
        reason,
      );

      return;
    }

    await commitTurnInternal(reason);
  };

  const failInternal = async (error: unknown) => {
    clearSilenceTimer();
    let didFail = false;

    const session = await writeSession((currentSession) => {
      if (currentSession.status === "failed") {
        return;
      }

      didFail = true;
      currentSession.lastActivityAt = Date.now();
      currentSession.status = "failed";
      if (!currentSession.call?.endedAt) {
        pushCallLifecycleEvent(currentSession, {
          disposition: "failed",
          reason: toError(error).message,
          type: "end",
        });
      }
    });
    if (!didFail) {
      return;
    }
    const resolvedError = toError(error);
    await appendTrace({
      payload: {
        error: resolvedError.message,
        recoverable: false,
      },
      session,
      type: "session.error",
    });
    await appendTrace({
      payload: {
        disposition: "failed",
        reason: resolvedError.message,
        type: "end",
      },
      session,
      type: "call.lifecycle",
    });

    await send({
      message: resolvedError.message,
      recoverable: false,
      type: "error",
    });
    clearCallSilenceWatchdog();
    clearAmdEvaluationTimer();
    await closeTTSSession("failed");
    await closeAdapter("failed");
    await persistRecordings();
    speechDetected = false;
    rewindFallbackTurnAudio();
    await options.route.onError?.({
      api,
      context: options.context,
      error: resolvedError,
      session,
      sessionId: options.id,
    });
    await options.route.onCallEnd?.({
      api,
      context: options.context,
      disposition: "failed",
      reason: resolvedError.message,
      session,
    });
  };

  // Wait for the assistant's closing line to finish playing on the client
  // before a graceful teardown, so "talk to you soon!" is heard instead of cut
  // off. The naive version — "return once the playback clock drains" — cut the
  // closing because streaming TTS sends the text in `finish()` but the audio
  // chunks arrive ASYNCHRONOUSLY afterward: at complete-time the playback clock
  // only reflects the first chunk or two, reads as nearly drained, and the call
  // tears down while the provider is still rendering the rest. The drain now
  // waits on three conditions, re-checked each tick:
  //   1. render started — audio for the just-sent closing has begun arriving
  //      (or a startup cap elapsed), so a provider's text→first-audio latency
  //      isn't mistaken for an empty stream;
  //   2. stream quiet — no new audio chunk for DRAIN_QUIET_MS, i.e. the provider
  //      finished streaming the closing;
  //   3. playback drained — the received audio has played out (+ a tail buffer).
  // The caps below guard ONLY the unbounded failure modes (a stream that never
  // renders, or one that never stops streaming). A healthy closing that is still
  // playing out is NOT cut off, however long it is: once the stream has gone
  // quiet, `assistantSpeechEndsAt` is fixed and the remaining wait is finite, so
  // we let it finish. Previously a single absolute 20s ceiling guillotined any
  // closing whose spoken audio ran past 20s — a long recap + sign-off would
  // render fully on screen (text is one block) but get torn down mid-speech.
  const DRAIN_POLL_MS = 100;
  const DRAIN_TAIL_BUFFER_MS = 300;
  const DRAIN_QUIET_MS = 600;
  const DRAIN_RENDER_START_MS = 4_000;
  // Cap on the unbounded cases only: how long we wait while audio has NOT yet
  // started, or is STILL actively streaming (provider never goes quiet). Does
  // not bound healthy playback of an already-received closing.
  const DRAIN_STREAMING_MAX_MS = 20_000;
  // Absolute safety net for all cases (e.g. a corrupt playback clock). Set far
  // above any real closing so it never truncates a genuine goodbye.
  const DRAIN_HARD_MAX_MS = 120_000;
  const drainAssistantSpeech = async (renderPendingSince: number) => {
    const startedAt = Date.now();
    const sleep = (delayMs: number) =>
      new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    while (Date.now() - startedAt < DRAIN_HARD_MAX_MS) {
      const now = Date.now();
      const renderStarted =
        lastAssistantAudioAt >= renderPendingSince ||
        now - renderPendingSince >= DRAIN_RENDER_START_MS;
      if (!renderStarted) {
        // No audio has rendered yet. Give the provider its startup window, then
        // bail rather than hold the call open on a stream that never began.
        if (now - startedAt >= DRAIN_STREAMING_MAX_MS) return;
        await sleep(DRAIN_POLL_MS);
        continue;
      }
      const streamQuiet = now - lastAssistantAudioAt >= DRAIN_QUIET_MS;
      const playbackDrained = assistantSpeechEndsAt + DRAIN_TAIL_BUFFER_MS <= now;
      if (streamQuiet && playbackDrained) return;
      // Backstop the only remaining unbounded case: a stream that keeps arriving
      // and never goes quiet (runaway/stuck provider). Once the stream IS quiet,
      // the wait is bounded by the fixed `assistantSpeechEndsAt`, so a long-but-
      // finite closing is allowed to play out fully.
      if (!streamQuiet && now - startedAt >= DRAIN_STREAMING_MAX_MS) return;
      await sleep(DRAIN_POLL_MS);
    }
  };

  const completeInternal = async (
    result?: unknown,
    input: {
      disposition?: VoiceCallDisposition;
      invokeOnComplete?: boolean;
      metadata?: Record<string, unknown>;
      reason?: string;
      target?: string;
    } = {},
  ) => {
    clearSilenceTimer();
    const disposition = input.disposition ?? "completed";
    const shouldInvokeOnComplete =
      input.invokeOnComplete ?? disposition === "completed";
    let didComplete = false;

    const session = await writeSession((currentSession) => {
      if (
        currentSession.status === "completed" ||
        currentSession.status === "failed"
      ) {
        return;
      }

      didComplete = true;

      currentSession.lastActivityAt = Date.now();
      currentSession.status = "completed";

      if (result !== undefined && currentSession.turns.length > 0) {
        const lastTurn = currentSession.turns.at(-1);
        if (lastTurn) {
          setTurnResult(currentSession, lastTurn.id, {
            result,
          });
        }
      }

      if (!currentSession.call?.endedAt) {
        pushCallLifecycleEvent(currentSession, {
          disposition,
          metadata: input.metadata,
          reason: input.reason,
          target: input.target,
          type: "end",
        });
      }
    });

    if (!didComplete) {
      return;
    }

    // Kick off the durable save NOW, concurrently with the closing-audio drain.
    // onComplete is the route's persistence hook (e.g. extract + write the
    // intake); it has no reason to wait out the ~20s+ of closing playback, and
    // gating it behind the drain meant a caller who navigated away during the
    // goodbye lost their result. Starting it here (not awaiting yet) makes the
    // save prompt and independent of whether the client survives — WITHOUT
    // delaying the client-facing "complete" below (that fires at drain-end), so a
    // slow extraction never extends the perceived call. Awaited before onCallEnd.
    const onCompletePromise = shouldInvokeOnComplete
      ? Promise.resolve(
          options.route.onComplete({
            api,
            context: options.context,
            session,
          }),
        )
      : Promise.resolve();

    // Only a graceful end (intake done / end_call) waits out the closing line —
    // a caller hangup / transfer / failure should tear down immediately.
    if (disposition === "completed") {
      await drainAssistantSpeech(lastTtsSendAt);
      // Settle any in-flight audio delivery on the dedicated chain before the
      // teardown lifecycle is sent, so the closing line lands before "end".
      await assistantAudioQueue;
    }

    await appendTrace({
      payload: {
        disposition,
        metadata: input.metadata,
        reason: input.reason,
        target: input.target,
        type: "end",
      },
      session,
      type: "call.lifecycle",
    });
    await sendCallLifecycle(session);
    await send({
      sessionId: options.id,
      type: "complete",
    });
    clearCallSilenceWatchdog();
    clearAmdEvaluationTimer();
    await closeTTSSession("complete");
    await closeAdapter("complete");
    await persistRecordings();
    speechDetected = false;
    rewindFallbackTurnAudio();
    if (disposition === "transferred" && input.target) {
      await options.route.onTransfer?.({
        api,
        context: options.context,
        metadata: input.metadata,
        reason: input.reason,
        session,
        target: input.target,
      });
    }
    if (disposition === "escalated" && input.reason) {
      await options.route.onEscalation?.({
        api,
        context: options.context,
        metadata: input.metadata,
        reason: input.reason,
        session,
      });
    }
    if (disposition === "voicemail") {
      await options.route.onVoicemail?.({
        api,
        context: options.context,
        metadata: input.metadata,
        session,
      });
    }
    if (disposition === "no-answer") {
      await options.route.onNoAnswer?.({
        api,
        context: options.context,
        metadata: input.metadata,
        session,
      });
    }
    // Ensure the durable save (started concurrently with the drain above)
    // finished before the final teardown / onCallEnd.
    await onCompletePromise;
    await options.route.onCallEnd?.({
      api,
      context: options.context,
      disposition,
      metadata: input.metadata,
      reason: input.reason,
      session,
      target: input.target,
    });
  };

  const transferInternal = async (input: {
    metadata?: Record<string, unknown>;
    reason?: string;
    result?: TResult;
    target: string;
    transferMode?: "cold" | "warm";
  }) => {
    const transferMetadata =
      input.transferMode === undefined
        ? input.metadata
        : { ...(input.metadata ?? {}), transferMode: input.transferMode };
    const session = await writeSession((currentSession) => {
      pushCallLifecycleEvent(currentSession, {
        metadata: transferMetadata,
        reason: input.reason,
        target: input.target,
        type: "transfer",
      });
    });
    await appendTrace({
      metadata: transferMetadata,
      payload: {
        reason: input.reason,
        target: input.target,
        transferMode: input.transferMode,
        type: "transfer",
      },
      session,
      type: "call.lifecycle",
    });
    await sendCallLifecycle(session);
    await runHandoff({
      action: "transfer",
      metadata: input.metadata,
      reason: input.reason,
      result: input.result,
      session,
      target: input.target,
    });
    await completeInternal(input.result, {
      disposition: "transferred",
      invokeOnComplete: false,
      metadata: input.metadata,
      reason: input.reason,
      target: input.target,
    });
  };

  const escalateInternal = async (input: {
    metadata?: Record<string, unknown>;
    reason: string;
    result?: TResult;
  }) => {
    const session = await writeSession((currentSession) => {
      pushCallLifecycleEvent(currentSession, {
        metadata: input.metadata,
        reason: input.reason,
        type: "escalation",
      });
    });
    await appendTrace({
      metadata: input.metadata,
      payload: {
        reason: input.reason,
        type: "escalation",
      },
      session,
      type: "call.lifecycle",
    });
    await sendCallLifecycle(session);
    await runHandoff({
      action: "escalate",
      metadata: input.metadata,
      reason: input.reason,
      result: input.result,
      session,
    });
    await completeInternal(input.result, {
      disposition: "escalated",
      invokeOnComplete: false,
      metadata: input.metadata,
      reason: input.reason,
    });
  };

  const markNoAnswerInternal = async (input?: {
    metadata?: Record<string, unknown>;
    result?: TResult;
  }) => {
    const session = await writeSession((currentSession) => {
      pushCallLifecycleEvent(currentSession, {
        metadata: input?.metadata,
        type: "no-answer",
      });
    });
    await appendTrace({
      metadata: input?.metadata,
      payload: {
        type: "no-answer",
      },
      session,
      type: "call.lifecycle",
    });
    await sendCallLifecycle(session);
    await runHandoff({
      action: "no-answer",
      metadata: input?.metadata,
      result: input?.result,
      session,
    });
    await completeInternal(input?.result, {
      disposition: "no-answer",
      invokeOnComplete: false,
      metadata: input?.metadata,
    });
  };

  const markVoicemailInternal = async (input?: {
    metadata?: Record<string, unknown>;
    result?: TResult;
  }) => {
    const session = await writeSession((currentSession) => {
      pushCallLifecycleEvent(currentSession, {
        metadata: input?.metadata,
        type: "voicemail",
      });
    });
    await appendTrace({
      metadata: input?.metadata,
      payload: {
        type: "voicemail",
      },
      session,
      type: "call.lifecycle",
    });
    await sendCallLifecycle(session);
    await runHandoff({
      action: "voicemail",
      metadata: input?.metadata,
      result: input?.result,
      session,
    });
    await completeInternal(input?.result, {
      disposition: "voicemail",
      invokeOnComplete: false,
      metadata: input?.metadata,
    });
  };

  const handleError = async (event: VoiceErrorEvent) => {
    await appendTrace({
      payload: {
        code: event.code,
        error: event.error.message,
        recoverable: event.recoverable,
      },
      type: "session.error",
    });
    await send({
      message: event.error.message,
      recoverable: event.recoverable,
      type: "error",
    });

    if (!event.recoverable) {
      await failInternal(event.error);
    }
  };

  const handleClose = async (event: VoiceCloseEvent) => {
    const session = await readSession();
    const callLive =
      session.status !== "completed" && session.status !== "failed";

    // For a still-live call, treat ANY STT close — even one the adapter flags
    // unrecoverable — as a dropped stream we should re-establish, not a fatal
    // error. closeAdapter() nulls the session so the next inbound audio packet
    // re-opens a fresh STT stream via ensureAdapter(). Only when the socket is
    // FLAPPING (repeated closes inside the flap window, no transcript progress
    // resetting the count) do we stop and fail — that's a real fatal condition.
    if (callLive && (options.stt || options.realtime)) {
      const now = Date.now();
      sttReconnectCount =
        now - lastSttReconnectAt < STT_RECONNECT_FLAP_WINDOW_MS
          ? sttReconnectCount + 1
          : 1;
      lastSttReconnectAt = now;

      if (sttReconnectCount <= MAX_STT_RECONNECTS_IN_FLAP_WINDOW) {
        await appendTrace({
          payload: {
            action: "stt-reconnect",
            attempt: sttReconnectCount,
            reason: event.reason ?? "stt stream closed",
            recoverable: event.recoverable,
          },
          session,
          type: "session.error",
        });
        await closeAdapter(event.reason ?? "stt stream closed; reconnecting");

        return;
      }
    }

    if (event.recoverable === false) {
      await failInternal(
        new Error(event.reason ?? "Speech-to-text session closed"),
      );

      return;
    }

    if (!event.reason) {
      await closeAdapter("provider stream closed");

      return;
    }

    await closeAdapter(event.reason);
  };

  const rewindFallbackTurnAudio = () => {
    fallbackAttemptsForCurrentTurn = 0;
    fallbackReplayAudioMsForCurrentTurn = 0;
    currentTurnAudio.length = 0;
  };

  const runFallbackTranscription = async (
    primaryText: string,
    primaryTranscripts: Transcript[],
  ): Promise<TurnTranscriptionSelection | null> => {
    if (
      !sttFallback?.adapter ||
      fallbackAttemptsForCurrentTurn >= sttFallback.maxAttemptsPerTurn
    ) {
      return null;
    }

    const candidate = {
      text: primaryText,
      transcripts: primaryTranscripts,
    };
    if (!isFallbackNeeded(candidate, sttFallback)) {
      return null;
    }

    fallbackAttemptsForCurrentTurn += 1;
    const replayAudio = getFallbackWindowAudio();
    if (replayAudio.length === 0) {
      return null;
    }

    let fallbackSession: STTAdapterSession | null = null;
    const fallbackTranscripts: Transcript[] = [];
    let fallbackClosed = false;
    let fallbackEndOfTurnReceived = false;
    let fallbackFinalReceived = false;
    let lastFallbackTranscriptAt = 0;

    try {
      fallbackSession = await sttFallback.adapter.open({
        format: DEFAULT_FORMAT,
        languageStrategy: options.languageStrategy,
        lexicon,
        phraseHints,
        sessionId: `${options.id}:fallback:${fallbackAttemptsForCurrentTurn}`,
      });
    } catch (error) {
      logger.warn("voice stt fallback open failed", {
        error: toError(error).message,
        sessionId: options.id,
      });

      return null;
    }

    const unsubscribers = [
      fallbackSession.on("final", ({ transcript }) => {
        fallbackFinalReceived = true;
        lastFallbackTranscriptAt = Date.now();
        const next = options.redact ? options.redact(transcript) : transcript;
        fallbackTranscripts.push(cloneTranscript(next));
      }),
      fallbackSession.on("partial", ({ transcript }) => {
        lastFallbackTranscriptAt = Date.now();
        const next = options.redact ? options.redact(transcript) : transcript;
        fallbackTranscripts.push(cloneTranscript(next));
      }),
      fallbackSession.on("endOfTurn", () => {
        fallbackEndOfTurnReceived = true;
      }),
      fallbackSession.on("error", (event) => {
        logger.warn("voice stt fallback error", {
          error: toError(event.error).message,
          sessionId: options.id,
        });
      }),
      fallbackSession.on("close", () => {
        fallbackClosed = true;
      }),
    ];

    const closeFallback = async (reason: string) => {
      if (!fallbackSession) {
        return;
      }

      try {
        await fallbackSession.close(reason);
      } catch (error) {
        logger.warn("voice stt fallback close failed", {
          error: toError(error).message,
          sessionId: options.id,
        });
      } finally {
        fallbackSession = null;
      }
    };

    try {
      for (const chunk of replayAudio) {
        await fallbackSession.send(chunk);
      }

      const replayDurationMs = getBufferedAudioDurationMs(replayAudio);
      fallbackReplayAudioMsForCurrentTurn += replayDurationMs;
      const completionTimeoutMs = Math.max(
        sttFallback.completionTimeoutMs,
        Math.min(
          4_000,
          Math.max(
            sttFallback.settleMs * 4,
            Math.round(replayDurationMs * 0.18),
          ),
        ),
      );
      const waitStartedAt = Date.now();

      while (Date.now() - waitStartedAt < completionTimeoutMs) {
        const idleMs =
          lastFallbackTranscriptAt > 0
            ? Date.now() - lastFallbackTranscriptAt
            : Date.now() - waitStartedAt;

        if (fallbackEndOfTurnReceived && idleMs >= sttFallback.settleMs) {
          break;
        }

        if (fallbackFinalReceived && idleMs >= sttFallback.settleMs) {
          break;
        }

        if (
          fallbackClosed &&
          (lastFallbackTranscriptAt === 0 || idleMs >= sttFallback.settleMs)
        ) {
          break;
        }

        await Bun.sleep(Math.min(75, Math.max(25, sttFallback.settleMs / 2)));
      }
    } catch (error) {
      logger.warn("voice stt fallback failed", {
        error: toError(error).message,
        sessionId: options.id,
      });
    } finally {
      await closeFallback("fallback-complete");
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    }

    if (fallbackTranscripts.length === 0) {
      return null;
    }

    const fallbackText = buildTurnText(fallbackTranscripts, "", {});
    const fallbackConfidence = calculateMeanConfidence(fallbackTranscripts);
    const fallbackCandidate = {
      confidence: fallbackConfidence,
      text: fallbackText,
      wordCount: countWords(normalizeText(fallbackText)),
    };
    const primaryCandidate = {
      confidence: calculateMeanConfidence(primaryTranscripts),
      text: primaryText,
      wordCount: countWords(normalizeText(primaryText)),
    };
    const selection = selectBetterTurnText(primaryCandidate, fallbackCandidate);
    const diagnostics: VoiceFallbackDiagnostics = {
      attempted: true,
      fallbackConfidence: fallbackCandidate.confidence,
      fallbackText: fallbackCandidate.text,
      fallbackWordCount: fallbackCandidate.wordCount,
      primaryConfidence: primaryCandidate.confidence,
      primaryText,
      primaryWordCount: primaryCandidate.wordCount,
      selected: selection.winner.text === fallbackCandidate.text,
      selectionReason: selection.reason,
      trigger: sttFallback.trigger,
    };
    if (selection.winner.text === primaryCandidate.text) {
      return {
        diagnostics,
        fallbackUsed: false,
        source: "primary",
        text: primaryText,
        transcripts: primaryTranscripts.map((transcript) => ({
          ...transcript,
          isFinal: true,
        })),
      };
    }

    const candidateTranscripts =
      fallbackText === fallbackCandidate.text ? fallbackTranscripts : [];

    return {
      diagnostics,
      fallbackUsed: true,
      source: "fallback",
      text: selection.winner.text,
      transcripts:
        candidateTranscripts.length > 0
          ? candidateTranscripts.map((transcript) => ({
              ...transcript,
              isFinal: true,
            }))
          : [{ id: createId(), isFinal: false, text: selection.winner.text }],
    };
  };

  const getFinalTranscriptIds = (transcripts: Transcript[]) => {
    const finalTranscriptIds = transcripts
      .filter((transcript) => transcript.isFinal)
      .map((transcript) => transcript.id);
    const fallbackIds = transcripts.map((transcript) => transcript.id);

    return finalTranscriptIds.length > 0 ? finalTranscriptIds : fallbackIds;
  };

  const runTurnCorrection = async (input: {
    fallbackDiagnostics?: VoiceFallbackDiagnostics;
    fallbackUsed: boolean;
    session: TSession;
    source: "fallback" | "primary";
    text: string;
    transcripts: Transcript[];
  }) => {
    if (!options.route.correctTurn) {
      return undefined;
    }

    const originalText = input.text;
    const result = await options.route.correctTurn({
      api,
      context: options.context,
      fallback: input.fallbackDiagnostics,
      lexicon,
      phraseHints,
      session: input.session,
      text: originalText,
      transcripts: input.transcripts.map(cloneTranscript),
    });

    const nextText =
      typeof result === "string"
        ? result
        : typeof result?.text === "string"
          ? result.text
          : originalText;
    const correctedText = normalizeCorrectionText(nextText);
    const normalizedOriginal = normalizeCorrectionText(originalText);

    return {
      diagnostics: {
        attempted: true,
        changed:
          correctedText.length > 0 && correctedText !== normalizedOriginal,
        correctedText:
          correctedText.length > 0 ? correctedText : normalizedOriginal,
        metadata: typeof result === "object" ? result.metadata : undefined,
        originalText,
        provider: typeof result === "object" ? result.provider : undefined,
        reason: typeof result === "object" ? result.reason : undefined,
      } satisfies VoiceTurnCorrectionDiagnostics,
      text: correctedText.length > 0 ? correctedText : originalText,
    };
  };

  const ensureCommittedTurnGuard = (session: TSession) => {
    if (!session.lastCommittedTurn) {
      session.lastCommittedTurn = {
        committedAt: 0,
        signature: "",
        text: "",
        transcriptIds: [],
      };
    }

    return session;
  };

  const buildTurnSignature = (
    session: TSession,
    finalText: string,
    transcriptIdsOverride?: string[],
  ) => {
    const finalTranscriptIds =
      transcriptIdsOverride ??
      getFinalTranscriptIds(session.currentTurn.transcripts);

    return `${normalizeText(finalText)}|${finalTranscriptIds.join(",")}`;
  };

  const isDuplicateTurnCommit = (session: TSession, finalText: string) => {
    const signature = buildTurnSignature(session, finalText);
    const committedTurn = session.lastCommittedTurn;
    const isRecent =
      committedTurn &&
      committedTurn.committedAt > 0 &&
      Date.now() - committedTurn.committedAt < DEFAULT_DUPLICATE_TURN_WINDOW_MS;
    const committedSignature = committedTurn?.signature ?? "";
    const committedTranscriptIds = committedTurn?.transcriptIds ?? [];
    const committedText = normalizeText(committedTurn?.text ?? "");
    const isSameText = normalizeText(finalText) === committedText;
    const hasNoNewAudioSinceCommit =
      (session.currentTurn.lastAudioAt ?? 0) <=
      (committedTurn?.committedAt ?? 0);

    if (!isRecent) {
      return false;
    }

    if (isSameText && hasNoNewAudioSinceCommit) {
      return true;
    }

    if (signature !== committedSignature) {
      return false;
    }

    const lastSignatureIds = new Set(committedTranscriptIds);
    const hasNoNewFinalIds = session.currentTurn.transcripts.every(
      (transcript) =>
        !transcript.isFinal || lastSignatureIds.has(transcript.id),
    );

    return isRecent && hasNoNewFinalIds;
  };

  const markTurnCommitted = (
    session: TSession,
    finalText: string,
    committedTranscripts: Transcript[],
  ) => {
    session.lastCommittedTurn = {
      ...(session.lastCommittedTurn ?? {}),
      committedAt: Date.now(),
      signature: buildTurnSignature(
        session,
        finalText,
        getFinalTranscriptIds(committedTranscripts),
      ),
      text: normalizeText(finalText),
      transcriptIds: getFinalTranscriptIds(committedTranscripts),
    };
  };

  const handlePartial = async (transcript: Transcript) => {
    // Speech-gated barge-in: the first partial transcript while the assistant is
    // speaking is real words (Deepgram doesn't transcribe noise), so interrupt
    // now — cancelActiveTTS also flushes the carrier's buffered playback.
    // bargeInMinPartialWords gates short fragments (default 1 = any
    // non-empty partial). Phone routes set 2+ to ignore single-word
    // breath / filler mistranscriptions ("you", "am i") that were
    // cutting the bot off mid-question per live-test 2026-05-27.
    if (activeTTSTurnId !== undefined) {
      const triggeringText = transcript.text.trim();
      if (triggeringText) {
        const wordCount = triggeringText.split(/\s+/).length;
        if (wordCount >= bargeInMinPartialWords) {
          void appendTurnLatencyStage({
            metadata: {
              partial: triggeringText.slice(0, 200),
              source: "stt_partial",
              wordCount,
            },
            stage: "barge_in",
            turnId: activeTTSTurnId,
          }).catch(() => {});
          void cancelActiveTTS("barge-in");
        } else {
          // Below threshold — trace that we SAW a partial but suppressed
          // barge-in. Useful for debugging the inverse complaint ("I
          // started talking and the bot kept going").
          void appendTurnLatencyStage({
            metadata: {
              partial: triggeringText.slice(0, 200),
              reason: "below_min_words",
              wordCount,
            },
            stage: "barge_in_suppressed",
            turnId: activeTTSTurnId,
          }).catch(() => {});
        }
      }
    }
    const session = await writeSession((session) => {
      const nextPartialStartedAt =
        transcript.startedAtMs ?? session.currentTurn.partialStartedAt;
      const nextPartialEndedAt =
        transcript.endedAtMs ?? session.currentTurn.partialEndedAt;
      const preferredPartial = selectPreferredTranscriptText(
        session.currentTurn.partialText,
        transcript.text,
      );

      session.currentTurn.lastTranscriptAt = Date.now();
      session.currentTurn.partialStartedAt = nextPartialStartedAt;
      session.currentTurn.partialEndedAt = nextPartialEndedAt;
      session.currentTurn.partialText = buildTurnText(
        session.currentTurn.transcripts,
        preferredPartial,
        {
          partialEndedAtMs: nextPartialEndedAt,
          partialStartedAtMs: nextPartialStartedAt,
        },
      );
      session.lastActivityAt = Date.now();
      session.status = "active";
    });

    if (silenceTimer && pendingCommitReason === "vendor") {
      scheduleTurnCommit(getVendorCommitDelayMs(), "vendor");
    }

    await send({
      transcript,
      type: "partial",
    });
    await appendTrace({
      payload: {
        confidence: transcript.confidence,
        isFinal: false,
        language: transcript.language,
        receivedAt: Date.now(),
        speaker: transcript.speaker,
        text: transcript.text,
        transcriptId: transcript.id,
        vendor: transcript.vendor,
      },
      session,
      type: "turn.transcript",
    });
  };

  const handleFinal = async (transcript: Transcript) => {
    // A real final transcript means STT is healthy again — clear the reconnect
    // flap budget so an earlier benign drop never counts against a later one.
    sttReconnectCount = 0;
    const session = await writeSession((session) => {
      const alreadyPresent = session.currentTurn.transcripts.some(
        (existing) => existing.id === transcript.id,
      );

      if (!alreadyPresent) {
        session.currentTurn.transcripts = [
          ...session.currentTurn.transcripts,
          cloneTranscript(transcript),
        ];
        session.transcripts = [
          ...session.transcripts,
          cloneTranscript(transcript),
        ];
      }

      session.currentTurn.finalText = buildTurnText(
        session.currentTurn.transcripts,
        session.currentTurn.partialText,
        {
          partialEndedAtMs: session.currentTurn.partialEndedAt,
          partialStartedAtMs: session.currentTurn.partialStartedAt,
        },
      );
      session.currentTurn.lastTranscriptAt = Date.now();
      session.lastActivityAt = Date.now();
      session.status = "active";
    });

    // The caller produced more words — drop the stale completion-confidence so
    // the adaptive window widens again until the detector re-weighs in, and
    // discard any speculation (it was generated for the shorter utterance).
    lastTurnCompleteConfidence = null;
    clearSpeculation();

    if (silenceTimer && pendingCommitReason === "vendor") {
      scheduleTurnCommit(getVendorCommitDelayMs(), "vendor");
    }

    await send({
      transcript,
      type: "final",
    });
    await appendTrace({
      payload: {
        confidence: transcript.confidence,
        isFinal: true,
        language: transcript.language,
        receivedAt: Date.now(),
        speaker: transcript.speaker,
        text: transcript.text,
        transcriptId: transcript.id,
        vendor: transcript.vendor,
      },
      session,
      type: "turn.transcript",
    });

    if (options.semanticTurnDetector) {
      const verdict = await Promise.resolve(
        options.semanticTurnDetector.evaluate({
          lastFinalTranscript: transcript,
          partialText: session.currentTurn.partialText,
          silenceMs:
            session.currentTurn.silenceStartedAt !== undefined
              ? Date.now() - session.currentTurn.silenceStartedAt
              : 0,
          transcripts: session.currentTurn.transcripts,
          ...getTurnAudioForDetector(),
        }),
      );
      // Feed the detector's completion-confidence into the adaptive silence
      // window (see adaptiveSilenceMs), and re-arm any pending silence timer at
      // the freshly-computed window so a high-confidence verdict commits sooner.
      if (typeof verdict.confidence === "number") {
        lastTurnCompleteConfidence = verdict.confidence;
        if (silenceTimer && pendingCommitReason === "silence") {
          scheduleSilenceCommit();
        }
      }
      if (verdict.endOfTurn) {
        clearSilenceTimer();
        await requestTurnCommit("vendor");
      }
    }
  };

  const resumePendingTurnCommit = (session: TSession) => {
    const pendingText = buildTurnText(
      session.currentTurn.transcripts,
      session.currentTurn.partialText,
      {
        partialEndedAtMs: session.currentTurn.partialEndedAt,
        partialStartedAtMs: session.currentTurn.partialStartedAt,
      },
    );

    if (!pendingText) {
      speechDetected = false;

      return;
    }

    speechDetected = true;

    const audioAge =
      session.currentTurn.silenceStartedAt !== undefined
        ? Date.now() - session.currentTurn.silenceStartedAt
        : session.currentTurn.lastSpeechAt !== undefined
          ? Date.now() - session.currentTurn.lastSpeechAt
          : 0;
    const transcriptAge =
      session.currentTurn.lastTranscriptAt !== undefined
        ? Date.now() - session.currentTurn.lastTranscriptAt
        : turnDetection.transcriptStabilityMs;
    const delayMs = Math.max(
      0,
      turnDetection.silenceMs - audioAge,
      turnDetection.transcriptStabilityMs - transcriptAge,
    );

    scheduleSilenceCommit(delayMs);
  };

  const ensureAdapter = async () => {
    if (sttSession) {
      return sttSession;
    }

    const inputAdapter = options.realtime ?? options.stt;
    if (!inputAdapter) {
      throw new Error(
        "Voice session requires either an stt or realtime adapter.",
      );
    }

    const openedSession = await (options.realtime
      ? options.realtime.open({
          format: options.realtimeInputFormat ?? DEFAULT_REALTIME_FORMAT,
          languageStrategy: options.languageStrategy,
          lexicon,
          modalities: options.modalities,
          phraseHints,
          sessionId: options.id,
        })
      : inputAdapter.open({
          format: DEFAULT_FORMAT,
          languageStrategy: options.languageStrategy,
          lexicon,
          phraseHints,
          sessionId: options.id,
        }));
    const generation = ++adapterGenerationCounter;
    sttSession = openedSession;
    activeAdapterGeneration = generation;

    const runAdapterEvent = (
      phase: string,
      handler: () => Promise<void> | void,
    ) => {
      void runSerial(phase, async () => {
        if (activeAdapterGeneration !== generation) {
          return;
        }

        await handler();
      });
    };

    openedSession.on("partial", ({ transcript }) => {
      const next = options.redact ? options.redact(transcript) : transcript;
      runAdapterEvent("adapter.partial", () => handlePartial(next));
    });
    openedSession.on("final", ({ transcript }) => {
      const next = options.redact ? options.redact(transcript) : transcript;
      runAdapterEvent("adapter.final", () => handleFinal(next));
    });
    openedSession.on("endOfTurn", ({ reason }) => {
      runAdapterEvent("adapter.endOfTurn", async () => {
        clearSilenceTimer();
        await requestTurnCommit(reason);
      });
    });
    openedSession.on("error", (event) => {
      runAdapterEvent("adapter.error", () => handleError(event));
    });
    openedSession.on("close", (event) => {
      runAdapterEvent("adapter.close", () => handleClose(event));
    });
    if (options.realtime) {
      (openedSession as RealtimeAdapterSession).on(
        "audio",
        ({ chunk, format, receivedAt }) => {
          // Same dedicated audio chain as the TTS bridge — keep the realtime
          // adapter's stale-generation guard so audio from a superseded STT
          // session is dropped.
          runAudioSerial(async () => {
            if (activeAdapterGeneration !== generation) {
              return;
            }

            await sendAssistantAudio(chunk, {
              format,
              receivedAt,
            });
          });
        },
      );
    }

    return openedSession;
  };

  const ensureTTSSession = async () => {
    const ttsAdapter = options.tts;
    if (!ttsAdapter) {
      return null;
    }

    if (ttsSession) {
      return ttsSession;
    }

    if (ttsSessionPromise) {
      return ttsSessionPromise;
    }

    ttsSessionPromise = (async () => {
      const openedSession = await ttsAdapter.open({
        lexicon,
        prosody: options.prosody,
        sessionId: options.id,
      });
      ttsSession = openedSession;

      openedSession.on("audio", ({ chunk, format, receivedAt }) => {
        runAudioSerial(async () => {
          if (ttsSession !== openedSession) {
            return;
          }

          await sendAssistantAudio(chunk, {
            format,
            receivedAt,
          });
        });
      });
      openedSession.on("error", (event) => {
        void runSerial("tts.error", async () => {
          if (ttsSession !== openedSession) {
            return;
          }

          await send({
            message: toError(event.error).message,
            recoverable: event.recoverable,
            type: "error",
          });
        });
      });
      openedSession.on("close", () => {
        void runSerial("tts.close", async () => {
          if (ttsSession === openedSession) {
            ttsSession = null;
            ttsSessionPromise = null;
            activeTTSTurnId = undefined;
          }
        });
      });

      return openedSession;
    })().catch((error) => {
      ttsSessionPromise = null;
      throw error;
    });

    return ttsSessionPromise;
  };

  const warmTTSSession = () => {
    if (!options.tts || ttsSession || ttsSessionPromise) {
      return;
    }

    void ensureTTSSession().catch((error) => {
      logger.warn("voice tts prewarm failed", {
        error: toError(error).message,
        sessionId: options.id,
      });
    });
  };

  // Backchannel: short "mm-hm"/"right" cues played while the CALLER is mid-turn
  // (a long answer) so they feel heard, the way a human listener interjects.
  // Reuses the same non-turn TTS path as fillers (ensureTTSSession + send, never
  // setting activeTTSTurnId), so a cue never registers as the assistant's turn
  // or trips barge-in. Fired ONLY while the assistant is silent and no filler is
  // mid-flight, so it can't collide with a real reply. Off unless enabled.
  const emitBackchannelCue = (text: string | undefined) => {
    if (!text || !options.tts) return;
    if (activeTTSTurnId !== undefined || fillerActive) return;
    void runSerial("backchannel.send", async () => {
      // Re-check inside the queue: a real turn may have started between the
      // driver firing and this send running.
      if (activeTTSTurnId !== undefined || fillerActive) return;
      const adapterSession = await ensureTTSSession();
      if (!adapterSession) return;
      try {
        await adapterSession.send(text);
      } catch {
        // A dropped cue is non-fatal — the turn is unaffected.
      }
    });
  };

  const backchannelDriver: VoiceBackchannelDriver | null =
    options.backchannel?.enabled && options.tts
      ? createVoiceBackchannelDriver({
          ...(options.backchannel.cueIntervalMs !== undefined
            ? { cueIntervalMs: options.backchannel.cueIntervalMs }
            : {}),
          ...(options.backchannel.cues
            ? {
                cues: options.backchannel.cues
                  .filter(
                    (cue): cue is string =>
                      typeof cue === "string" && cue.trim().length > 0,
                  )
                  .map((cue) => ({ text: cue })),
              }
            : {}),
          ...(options.backchannel.minSpeechMs !== undefined
            ? { minSpeechMs: options.backchannel.minSpeechMs }
            : {}),
          onCue: (cue) => emitBackchannelCue(cue.text),
        })
      : null;

  // Stream an assistant reply to TTS as the model generates it. The run pushes
  // prose deltas via `push`, which flushes complete sentences to the TTS adapter
  // in order (sends are serialized) so the caller hears the first phrase before
  // the model finishes. `finish` flushes the tail and waits for pending sends,
  // returning the full text + whether anything was streamed. Sends stop once a
  // barge-in (cancelActiveTTS clears activeTTSTurnId) takes over the channel.
  const createTurnTTSStreamer = (
    turn: VoiceTurnRecord<TResult>,
    session: TSession,
  ) => {
    let buffer = "";
    let full = "";
    let charsSent = 0;
    let started = false;
    let streamed = false;
    let idleFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let sendChain: Promise<void> = Promise.resolve();
    let ttsSessionRequest: Promise<TTSAdapterSession | null> | null = null;
    const ttsStartedAt = Date.now();

    const ensure = () => {
      if (!ttsSessionRequest) {
        ttsSessionRequest = ensureTTSSession().catch((error) => {
          logger.warn("voice assistant audio send failed", {
            error: toError(error).message,
            sessionId: options.id,
            turnId: turn.id,
          });

          return null;
        });
      }

      return ttsSessionRequest;
    };

    const flush = (text: string) => {
      if (!text.trim()) return;
      const previous = sendChain;
      sendChain = (async () => {
        await previous;
        // Stop once a barge-in (or a newer turn) has taken over the channel.
        if (started && activeTTSTurnId !== turn.id) return;
        const ttsSession = await ensure();
        if (!ttsSession || (started && activeTTSTurnId !== turn.id)) return;
        if (!started) {
          // Real streamed assistant audio is about to start — invalidate any
          // pending filler timer + flush any in-flight filler TTS via the
          // carrier clear, so the caller hears the filler-end then the real
          // reply instead of stacked overlap. Without this the streaming
          // path leaves the filler TTS running concurrently with the real
          // response on the same ttsSession, which on Aura silently jams
          // the second-and-later turn's send (observed prod 2026-05-27 —
          // Turn 1 works, Turn 2 sends never returns audio).
          fillerToken += 1;
          if (fillerTimer) {
            clearTimeout(fillerTimer);
            fillerTimer = null;
          }
          if (fillerActive) {
            await cancelActiveTTS("filler-superseded").catch(() => {});
            fillerActive = false;
          }
          activeTTSTurnId = turn.id;
          await appendTurnLatencyStage({
            at: ttsStartedAt,
            session,
            stage: "tts_send_started",
            turnId: turn.id,
          });
          started = true;
        }
        try {
          await ttsSession.send(text);
          charsSent += text.length;
          // A render is now pending for this turn — the drain must wait for its
          // audio to arrive before completing, not just for prior audio.
          lastTtsSendAt = Date.now();
        } catch (error) {
          logger.warn("voice assistant audio send failed", {
            error: toError(error).message,
            sessionId: options.id,
            turnId: turn.id,
          });
        }
      })();
    };

    const clearIdleFlush = () => {
      if (idleFlushTimer) {
        clearTimeout(idleFlushTimer);
        idleFlushTimer = null;
      }
    };

    // The model has paused mid-stream. If a COMPLETE sentence is buffered, speak
    // it now rather than waiting for the (possibly slow) stream close — only a
    // whole sentence, so we never split mid-clause and seam-garble the audio.
    const flushOnIdle = () => {
      idleFlushTimer = null;
      const pending = buffer.trim();
      if (pending && STREAM_SENTENCE_END.test(pending)) {
        flush(buffer);
        buffer = "";
      }
    };

    return {
      finish: async () => {
        clearIdleFlush();
        if (buffer.trim()) {
          flush(buffer);
        }
        buffer = "";
        await sendChain;
        if (started) {
          if (options.costAccountant) {
            options.costAccountant.recordTTS({ characters: charsSent });
          }
          await appendTurnLatencyStage({
            session,
            stage: "tts_send_completed",
            turnId: turn.id,
          });
          await appendTrace({
            payload: {
              elapsedMs: Date.now() - ttsStartedAt,
              status: "sent",
              streamed: true,
            },
            session,
            turnId: turn.id,
            type: "turn.assistant",
          });
        }

        return { fullText: full, streamed };
      },
      push: (delta: string) => {
        if (!delta) return;
        streamed = true;
        full += delta;
        void send({ delta, turnId: turn.id, type: "assistant_delta" });
        buffer += delta;
        let boundary = nextSpeakableBoundary(buffer);
        while (boundary !== -1) {
          flush(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary);
          boundary = nextSpeakableBoundary(buffer);
        }
        const cut = softCutBoundary(buffer);
        if (cut !== -1) {
          flush(buffer.slice(0, cut));
          buffer = buffer.slice(cut);
        }
        // Arm the idle-flush so a complete-but-unterminated-by-space sentence
        // (a short whole reply) doesn't wait on a slow stream close. Re-armed on
        // every delta, so it only fires once the model has actually gone quiet.
        clearIdleFlush();
        if (buffer.trim()) {
          idleFlushTimer = setTimeout(flushOnIdle, STREAM_IDLE_FLUSH_MS);
        }
      },
    };
  };

  const completeTurn = async (
    session: TSession,
    turn: VoiceTurnRecord<TResult>,
  ) => {
    console.error(
      `[voice] completeTurn ENTER session=${options.id} turn=${turn.id} textLen=${turn.text?.length ?? 0}`,
    );
    const liveOpsControl = await options.liveOps?.getControl(options.id);
    if (liveOpsControl?.assistantPaused || liveOpsControl?.operatorTakeover) {
      await appendTrace({
        metadata: {
          source: "voice-live-ops",
        },
        payload: {
          action: "turn.skipped",
          control: liveOpsControl,
          reason: liveOpsControl.operatorTakeover
            ? "operator-takeover"
            : "assistant-paused",
          status: "skipped",
        },
        session,
        turnId: turn.id,
        type: "operator.action",
      });

      return;
    }
    const injectedInstruction = liveOpsControl?.injectedInstruction?.trim();
    // Stream the reply to TTS: the model pushes prose deltas through
    // ttsStreamer.push (via onTextDelta) during the run, so the caller hears the
    // first sentence while the model is still generating.
    const ttsStreamer = options.tts
      ? createTurnTTSStreamer(turn, session)
      : undefined;

    // Schedule a filler ("Hmm.", "Got it.") to bridge the silence while the
    // LLM is generating. Fires once after fillerDelayMs; on the first real
    // assistant audio chunk (below) we invalidate the token + cancel any
    // in-flight filler TTS so the caller hears a brief filler then the real
    // response, with the carrier-buffer flush ensuring a clean transition.
    if (fillerPhrases.length > 0 && options.tts && !ttsStreamer) {
      // ttsStreamer path streams deltas directly — no LLM gap to fill in
      // that mode. Fillers only help the non-streaming path where we wait
      // for the full assistant text before TTS starts.
    }
    if ((fillerPhrases.length > 0 || fillerFor) && options.tts) {
      fillerToken += 1;
      const myToken = fillerToken;
      if (fillerTimer) clearTimeout(fillerTimer);
      // Kick the content-aware acknowledgement call off RIGHT NOW (parallel
      // to the main LLM call) so by the time the static-filler timer fires
      // it's typically already resolved. Race against fillerForTimeoutMs so
      // a slow / hung acknowledgement call never blocks the filler audio.
      const fillerForPromise: Promise<string | null> | null = fillerFor
        ? Promise.race<string | null>([
            (async () => {
              try {
                const v = await fillerFor({
                  sessionId: options.id,
                  turnId: turn.id,
                  userText: turn.text ?? "",
                });

                return v && v.trim().length > 0 ? v : null;
              } catch {
                return null;
              }
            })(),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), fillerForTimeoutMs),
            ),
          ])
        : null;

      fillerTimer = setTimeout(() => {
        fillerTimer = null;
        // Token mismatch means a newer turn started; abandon this filler.
        if (myToken !== fillerToken) return;
        // If real TTS for this turn has already started flowing, skip.
        if (activeTTSTurnId === turn.id) return;
        void runSerial("filler.send", async () => {
          // Re-check inside the queue — between schedule and run the real
          // assistant TTS may have started.
          if (myToken !== fillerToken || activeTTSTurnId === turn.id) return;
          // Prefer the content-aware phrase. If it's still pending we wait
          // for the remaining timeout budget; if it returned null we fall
          // through to a static random phrase.
          let phrase: string | null = null;
          let source: "fillerFor" | "static" = "static";
          if (fillerForPromise) {
            phrase = await fillerForPromise;
            if (phrase) source = "fillerFor";
            if (myToken !== fillerToken || activeTTSTurnId === turn.id) return;
          }
          if (!phrase && fillerPhrases.length > 0) {
            phrase =
              fillerPhrases[Math.floor(Math.random() * fillerPhrases.length)] ??
              null;
            source = "static";
          }
          if (!phrase) return;
          const adapterSession = await ensureTTSSession();
          if (!adapterSession) return;
          fillerActive = true;
          // Trace BEFORE the send so hosts can correlate against
          // tts_send_started / barge_in events even if the send itself
          // throws. `phrase` is small (≤ ~30 chars) — fine to inline.
          void appendTurnLatencyStage({
            metadata: { phrase, source },
            stage: "filler_sent",
            turnId: turn.id,
          }).catch(() => {});
          try {
            await adapterSession.send(phrase);
          } catch {
            // TTS errors on a filler are non-fatal — the real response still plays.
            fillerActive = false;
          }
        });
      }, fillerDelayMs);
    }

    // Wrap onTurn in try/catch + a HARD TIMEOUT + log to stderr so a
    // thrown/hung LLM call is VISIBLE (silent failures here mean the caller
    // sits in dead air). Anything we catch here also lets the safeguard
    // below fire its default ack rather than just leaving the turn
    // dangling.
    //
    // The hard timeout (default 45s) is defensive — the OpenAI/Anthropic
    // model layers have their own 60s timeouts, but those have been
    // observed to NOT fire in some hang scenarios (operationQueue
    // serialization races, AbortController-doesn't-propagate-to-stream
    // edge cases). This outer race guarantees a turn always resolves,
    // pass or fail, within `routeOnTurnTimeoutMs` so the safeguard can
    // speak. Set to 0 to disable.
    const onTurnTimeoutMs = options.routeOnTurnTimeoutMs ?? 45_000;
    let committedOutput:
      | Awaited<ReturnType<typeof options.route.onTurn>>
      | undefined;
    const onTurnStartedAt = Date.now();
    // How long between the user's turn committing and us actually invoking the
    // route — if THIS is the slow part, the delay is upstream of the model (e.g.
    // operationQueue serialization behind the greeting audio), not the LLM.
    logVoiceTiming(
      session.id,
      "session.commit-to-onturn",
      onTurnStartedAt - (turn.committedAt || onTurnStartedAt),
      { fillerScheduled: fillerTimer !== null },
    );
    // P3: if eager generation ran during the silence window and the caller
    // stayed quiet (the committed text equals what we speculated on), hand the
    // pre-generated reply to onTurn so it can skip its own model call. Any
    // divergence (the caller resumed and said more) leaves it undefined and the
    // turn generates normally. Consumed either way.
    const reusableSpeculation =
      speculativeReply && speculativeReply.pendingText === turn.text
        ? { text: speculativeReply.text }
        : undefined;
    clearSpeculation();
    try {
      const onTurnPromise = options.route.onTurn({
        api: api,
        context: options.context,
        liveOps: liveOpsControl
          ? {
              control: liveOpsControl,
              injectedInstruction,
            }
          : undefined,
        onTextDelta: ttsStreamer?.push,
        session,
        speculativeReply: reusableSpeculation,
        turn,
      });
      if (onTurnTimeoutMs > 0) {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(
              new Error(`route.onTurn hard-timeout after ${onTurnTimeoutMs}ms`),
            );
          }, onTurnTimeoutMs);
        });
        try {
          committedOutput = await Promise.race([onTurnPromise, timeoutPromise]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      } else {
        committedOutput = await onTurnPromise;
      }
    } catch (error) {
      const message = toError(error).message;
      logger.warn("voice route.onTurn failed", {
        elapsedMs: Date.now() - onTurnStartedAt,
        error: message,
        sessionId: options.id,
        turnId: turn.id,
      });
      // Also log to console.error so the failure shows up in stdout-only
      // hosting (systemd journals, Docker logs) where the structured logger
      // backend may swallow it.
      console.error(
        `[voice] onTurn failed for session ${options.id} turn ${turn.id} after ${Date.now() - onTurnStartedAt}ms:`,
        message,
      );
      await appendTrace({
        payload: {
          elapsedMs: Date.now() - onTurnStartedAt,
          error: message,
          stage: "route.onTurn",
        },
        session,
        turnId: turn.id,
        type: "session.error",
      });
      committedOutput = undefined;
      // Don't rethrow — fall through to the audio-wasn't-sent safeguard
      // below so the caller hears the defaultSilentTurnAck instead of dead
      // air.
    }
    const output = {
      assistantText: committedOutput?.assistantText,
      citations: committedOutput?.citations,
      complete: committedOutput?.complete,
      escalate: committedOutput?.escalate,
      noAnswer: committedOutput?.noAnswer,
      result: committedOutput?.result,
      transfer: committedOutput?.transfer,
      voicemail: committedOutput?.voicemail,
    };

    if (output.citations && output.citations.length > 0) {
      const turnCitations = output.citations;
      await writeSession((currentSession) => {
        setTurnResult(currentSession, turn.id, { citations: turnCitations });
      });
    }

    // Flush the streamed reply (tail + pending sends). `streamed` is false when
    // the model never called onTextDelta (a non-streaming adapter) — those fall
    // through to the one-shot send below.
    const streamResult = ttsStreamer ? await ttsStreamer.finish() : undefined;

    if (streamResult?.streamed) {
      output.assistantText = streamResult.fullText || output.assistantText;
      if (output.assistantText) {
        const finalText = output.assistantText;
        await writeSession((currentSession) => {
          setTurnResult(currentSession, turn.id, { assistantText: finalText });
        });
        await send({ text: finalText, turnId: turn.id, type: "assistant" });
        await appendTrace({
          payload: {
            assistantMode: resolveVoiceAssistantMode(options),
            realtimeConfigured: Boolean(options.realtime),
            text: finalText,
            ttsConfigured: Boolean(options.tts),
          },
          session,
          turnId: turn.id,
          type: "turn.assistant",
        });
      }
    } else if (output?.assistantText) {
      const assistantTextStartedAt = Date.now();
      await writeSession((currentSession) => {
        setTurnResult(currentSession, turn.id, {
          assistantText: output.assistantText,
        });
      });
      await send({
        text: output.assistantText,
        turnId: turn.id,
        type: "assistant",
      });
      await appendTurnLatencyStage({
        at: assistantTextStartedAt,
        session,
        stage: "assistant_text_started",
        turnId: turn.id,
      });
      await appendTrace({
        payload: {
          assistantMode: resolveVoiceAssistantMode(options),
          realtimeConfigured: Boolean(options.realtime),
          text: output.assistantText,
          ttsConfigured: Boolean(options.tts),
        },
        session,
        turnId: turn.id,
        type: "turn.assistant",
      });

      try {
        const activeTTSSession = await ensureTTSSession();
        if (activeTTSSession) {
          // Real assistant audio is about to start — invalidate any pending
          // filler timer + flush any in-flight filler TTS via the carrier
          // clear, so the caller hears the filler-end then the real reply
          // instead of a stacked overlap. fillerActive is also cleared.
          fillerToken += 1;
          if (fillerTimer) {
            clearTimeout(fillerTimer);
            fillerTimer = null;
          }
          if (fillerActive) {
            await cancelActiveTTS("filler-superseded").catch(() => {});
            fillerActive = false;
          }
          const ttsStartedAt = Date.now();
          activeTTSTurnId = turn.id;
          await appendTurnLatencyStage({
            at: ttsStartedAt,
            session,
            stage: "tts_send_started",
            turnId: turn.id,
          });
          await activeTTSSession.send(output.assistantText);
          lastTtsSendAt = Date.now();
          if (options.costAccountant) {
            options.costAccountant.recordTTS({
              characters: output.assistantText.length,
            });
          }
          await appendTurnLatencyStage({
            session,
            stage: "tts_send_completed",
            turnId: turn.id,
          });
          await appendTrace({
            payload: {
              elapsedMs: Date.now() - ttsStartedAt,
              status: "sent",
            },
            session,
            turnId: turn.id,
            type: "turn.assistant",
          });
        } else if (options.realtime) {
          const activeRealtimeSession =
            (await ensureAdapter()) as RealtimeAdapterSession;
          const realtimeStartedAt = Date.now();
          activeTTSTurnId = turn.id;
          await appendTurnLatencyStage({
            at: realtimeStartedAt,
            session,
            stage: "tts_send_started",
            turnId: turn.id,
          });
          await activeRealtimeSession.send(output.assistantText);
          await appendTurnLatencyStage({
            session,
            stage: "tts_send_completed",
            turnId: turn.id,
          });
          await appendTrace({
            payload: {
              elapsedMs: Date.now() - realtimeStartedAt,
              mode: "realtime",
              status: "sent",
            },
            session,
            turnId: turn.id,
            type: "turn.assistant",
          });
        }
      } catch (error) {
        logger.warn("voice assistant audio send failed", {
          error: toError(error).message,
          sessionId: options.id,
          turnId: turn.id,
        });
        await appendTrace({
          payload: {
            error: toError(error).message,
            status: options.realtime
              ? "realtime-send-failed"
              : "tts-send-failed",
          },
          session,
          turnId: turn.id,
          type: "session.error",
        });
      }
    }

    // SAFEGUARD: NEVER leave a turn with no spoken response.
    //
    // If the model returned ONLY tool calls (no assistantText, no streamed
    // text) AND isn't ending the call (no complete/transfer/escalate/
    // voicemail/noAnswer signal), the caller would hear silence after their
    // turn — which they always read as "the line dropped" and bail out of
    // the conversation. Speak a minimal default ack so there's something on
    // the wire. Operators can configure this via `defaultSilentTurnAck`
    // (default "Sorry, one moment.") — set to "" to opt out.
    const audioWasSent =
      Boolean(streamResult?.streamed) || Boolean(output?.assistantText?.trim());
    const turnIsEnding =
      Boolean(output?.complete) ||
      Boolean(output?.transfer) ||
      Boolean(output?.escalate) ||
      Boolean(output?.voicemail) ||
      Boolean(output?.noAnswer);
    if (!audioWasSent && !turnIsEnding) {
      const fallback =
        typeof options.defaultSilentTurnAck === "string"
          ? options.defaultSilentTurnAck
          : "Sorry, one moment.";
      if (fallback.trim() && options.tts) {
        try {
          const activeTTSSession = await ensureTTSSession();
          if (activeTTSSession) {
            // Same filler-cancel dance as the normal text path — we're now
            // about to send real audio, so any in-flight filler should yield.
            fillerToken += 1;
            if (fillerTimer) {
              clearTimeout(fillerTimer);
              fillerTimer = null;
            }
            if (fillerActive) {
              await cancelActiveTTS("filler-superseded").catch(() => {});
              fillerActive = false;
            }
            activeTTSTurnId = turn.id;
            await activeTTSSession.send(fallback);
            await appendTrace({
              payload: {
                assistantMode: resolveVoiceAssistantMode(options),
                fallback: true,
                realtimeConfigured: Boolean(options.realtime),
                reason: "model-returned-no-text",
                text: fallback,
                ttsConfigured: Boolean(options.tts),
              },
              session,
              turnId: turn.id,
              type: "turn.assistant",
            });
            if (options.costAccountant) {
              options.costAccountant.recordTTS({
                characters: fallback.length,
              });
            }
          }
        } catch (error) {
          logger.warn("voice default-silent-turn-ack fallback send failed", {
            error: toError(error).message,
            sessionId: options.id,
            turnId: turn.id,
          });
        }
      }
    }

    if (output?.result !== undefined) {
      await writeSession((currentSession) => {
        setTurnResult(currentSession, turn.id, {
          result: output.result,
        });
      });
    }

    if (output?.transfer) {
      await transferInternal({
        metadata: output.transfer.metadata,
        reason: output.transfer.reason,
        result: output.result,
        target: output.transfer.target,
      });

      return;
    }

    if (output?.escalate) {
      await escalateInternal({
        metadata: output.escalate.metadata,
        reason: output.escalate.reason,
        result: output.result,
      });

      return;
    }

    if (output?.voicemail) {
      await markVoicemailInternal({
        metadata: output.voicemail.metadata,
        result: output.result,
      });

      return;
    }

    if (output?.noAnswer) {
      await markNoAnswerInternal({
        metadata: output.noAnswer.metadata,
        result: output.result,
      });

      return;
    }

    if (output?.complete) {
      await completeInternal(output.result);
    }
  };

  const commitTurnInternal = async (
    reason: VoiceEndOfTurnEvent["reason"] = "manual",
  ) => {
    clearSilenceTimer();
    lastTurnCompleteConfidence = null;
    // The caller's turn is ending — clear the backchannel speech window so cues
    // don't carry over into (or fire at the seam of) the next turn.
    backchannelDriver?.reset();
    amdLastTurnCommitAt = Date.now();

    const session = await readSession();
    if (session.status === "completed" || session.status === "failed") {
      return;
    }

    const text = buildTurnText(
      session.currentTurn.transcripts,
      session.currentTurn.partialText,
      {
        partialEndedAtMs: session.currentTurn.partialEndedAt,
        partialStartedAtMs: session.currentTurn.partialStartedAt,
      },
    );
    let transcripts = session.currentTurn.transcripts.length
      ? session.currentTurn.transcripts.map(cloneTranscript)
      : [];
    let finalText = text;
    const transcriptStabilityAge =
      session.currentTurn.lastTranscriptAt !== undefined
        ? Date.now() - session.currentTurn.lastTranscriptAt
        : undefined;

    const fallbackSelection = await runFallbackTranscription(
      text,
      session.currentTurn.transcripts,
    );

    const source: "fallback" | "primary" =
      fallbackSelection?.source ?? "primary";
    const fallbackUsed = fallbackSelection?.fallbackUsed ?? false;
    const fallbackDiagnostics = fallbackSelection?.diagnostics;
    if (fallbackSelection) {
      finalText = fallbackSelection.text;
      transcripts = fallbackSelection.transcripts.length
        ? fallbackSelection.transcripts.map(cloneTranscript)
        : transcripts.length
          ? transcripts
          : [
              {
                id: createId(),
                isFinal: false,
                text: finalText,
              },
            ];

      if (fallbackSelection.fallbackUsed) {
        logger.info("voice fallback turn selected", {
          reason,
          sessionId: options.id,
          text: finalText,
        });
      }
    }

    const correctionSelection = await runTurnCorrection({
      fallbackDiagnostics,
      fallbackUsed,
      session,
      source,
      text: finalText,
      transcripts,
    });
    const correctionDiagnostics = correctionSelection?.diagnostics;
    if (correctionSelection) {
      finalText = correctionSelection.text;
    }

    if (!finalText) {
      return;
    }

    if (isDuplicateTurnCommit(session, finalText)) {
      logger.debug("voice turn commit deduped", {
        reason,
        sessionId: options.id,
      });

      return;
    }

    if (
      typeof transcriptStabilityAge === "number" &&
      transcriptStabilityAge < turnDetection.transcriptStabilityMs &&
      reason !== "manual"
    ) {
      scheduleTurnCommit(
        turnDetection.transcriptStabilityMs - transcriptStabilityAge,
        reason,
        false,
      );

      return;
    }

    const costEstimate = createTurnCostEstimate({
      fallbackAttemptCount: fallbackAttemptsForCurrentTurn,
      fallbackPassCostUnit: options.costTelemetry?.fallbackPassCostUnit,
      fallbackReplayAudioMs: fallbackReplayAudioMsForCurrentTurn,
      primaryAudioMs: getBufferedAudioDurationMs(
        currentTurnAudio.map((audio) => audio.chunk),
      ),
      primaryPassCostUnit: options.costTelemetry?.primaryPassCostUnit,
    });
    if (options.costAccountant && costEstimate.totalBillableAudioMs > 0) {
      options.costAccountant.recordSTT({
        audioMs: costEstimate.totalBillableAudioMs,
      });
    }

    const drainedAttachments =
      pendingUserAttachments.length > 0
        ? pendingUserAttachments.splice(0, pendingUserAttachments.length)
        : undefined;
    const turn: VoiceTurnRecord<TResult> = {
      attachments: drainedAttachments,
      committedAt: Date.now(),
      id: createId(),
      text: finalText,
      quality: createTurnQuality(
        transcripts,
        source,
        fallbackUsed,
        fallbackDiagnostics,
        correctionDiagnostics,
        costEstimate,
      ),
      transcripts:
        transcripts.length > 0
          ? transcripts
          : [
              {
                id: createId(),
                isFinal: false,
                text: finalText,
              },
            ],
    };

    const updatedSession = await writeSession((currentSession) => {
      currentSession.committedTurnIds = [
        ...currentSession.committedTurnIds,
        turn.id,
      ];
      currentSession.currentTurn = createEmptyCurrentTurn();
      currentSession.lastActivityAt = Date.now();
      currentSession.status = "active";
      currentSession.turns = [...currentSession.turns, turn];
      markTurnCommitted(currentSession, finalText, transcripts);
    });
    speechDetected = false;
    rewindFallbackTurnAudio();

    logger.info("voice turn committed", {
      reason,
      sessionId: options.id,
      turnId: turn.id,
    });

    await options.costTelemetry?.onTurnCost?.({
      api,
      context: options.context,
      estimate: costEstimate,
      session: updatedSession,
      turn,
    });
    await appendTrace({
      payload: {
        correctionChanged: correctionDiagnostics?.changed,
        correctionProvider: correctionDiagnostics?.provider,
        fallbackUsed,
        reason,
        source,
        text: turn.text,
        transcriptCount: turn.transcripts.length,
      },
      session: updatedSession,
      turnId: turn.id,
      type: "turn.committed",
    });
    await appendTrace({
      payload: {
        ...costEstimate,
      },
      session: updatedSession,
      turnId: turn.id,
      type: "turn.cost",
    });
    const firstTranscriptAt = turn.transcripts
      .map((transcript) => transcript.endedAtMs ?? transcript.startedAtMs)
      .filter((value): value is number => typeof value === "number")
      .sort((left, right) => left - right)[0];
    const finalTranscriptAt = turn.transcripts
      .filter((transcript) => transcript.isFinal)
      .map((transcript) => transcript.endedAtMs ?? transcript.startedAtMs)
      .filter((value): value is number => typeof value === "number")
      .sort((left, right) => left - right)[0];
    if (firstTranscriptAt !== undefined) {
      await appendTurnLatencyStage({
        at: firstTranscriptAt,
        session: updatedSession,
        stage: "speech_detected",
        turnId: turn.id,
      });
    }
    if (finalTranscriptAt !== undefined) {
      await appendTurnLatencyStage({
        at: finalTranscriptAt,
        session: updatedSession,
        stage: "final_transcript",
        turnId: turn.id,
      });
    }
    await appendTurnLatencyStage({
      at: turn.committedAt,
      session: updatedSession,
      stage: "turn_committed",
      turnId: turn.id,
    });

    await send({
      turn,
      type: "turn",
    });
    if (options.stt && options.sttLifecycle === "turn-scoped") {
      await closeAdapter("turn-commit");
    }
    await completeTurn(updatedSession, turn);
  };

  const connectInternal = async (nextSocket: {
    close: (code?: number, reason?: string) => void | Promise<void>;
    send: (data: string | Uint8Array | ArrayBuffer) => void | Promise<void>;
  }) => {
    socket = nextSocket;

    const existingSession = await options.store.get(options.id);
    let session =
      existingSession ??
      createVoiceSessionRecord<TSession>(options.id, options.scenarioId);

    if (options.scenarioId && session.scenarioId !== options.scenarioId) {
      session.scenarioId = options.scenarioId;
    }

    if (options.sessionMetadata) {
      session.metadata = {
        ...((session.metadata && typeof session.metadata === "object"
          ? session.metadata
          : {}) as Record<string, unknown>),
        ...options.sessionMetadata,
      } as TSession["metadata"];
    }

    ensureCommittedTurnGuard(session);
    let shouldFireOnSession = !existingSession;
    if (
      existingSession?.scenarioId &&
      options.scenarioId &&
      existingSession.scenarioId !== options.scenarioId
    ) {
      session = resetVoiceSessionRecord<TSession>(
        options.id,
        existingSession,
        options.scenarioId,
      );
      shouldFireOnSession = true;
    }
    rewindFallbackTurnAudio();

    if (existingSession?.status === "reconnecting") {
      const nextAttempts = existingSession.reconnect.attempts + 1;
      const reconnectExpired =
        existingSession.reconnect.lastDisconnectAt !== undefined &&
        Date.now() - existingSession.reconnect.lastDisconnectAt >
          reconnect.timeout;
      const tooManyAttempts = nextAttempts > reconnect.maxAttempts;

      if (
        reconnect.strategy === "fail" &&
        (reconnectExpired || tooManyAttempts)
      ) {
        await failInternal(
          new Error("Voice session reconnect policy exhausted"),
        );

        return;
      }

      if (
        reconnect.strategy === "restart" &&
        (reconnectExpired || tooManyAttempts)
      ) {
        session = resetVoiceSessionRecord<TSession>(
          options.id,
          existingSession,
          options.scenarioId,
        );
        shouldFireOnSession = true;
      } else {
        session = {
          ...existingSession,
          reconnect: {
            ...existingSession.reconnect,
            attempts: nextAttempts,
          },
          status: "active",
        };
      }
    }

    if (shouldFireOnSession) {
      pushCallLifecycleEvent(session, {
        type: "start",
      });
    }

    await options.store.set(options.id, session);
    if (shouldFireOnSession) {
      await appendTrace({
        payload: {
          type: "start",
        },
        session,
        type: "call.lifecycle",
      });
      await sendCallLifecycle(session);
    }
    await send({
      sessionId: options.id,
      status: session.status,
      sessionMetadata:
        session.metadata && typeof session.metadata === "object"
          ? session.metadata
          : undefined,
      scenarioId: session.scenarioId,
      type: "session",
    });
    await sendReplay(session);

    // shouldFireOnSession === false means we're CONTINUING an existing session
    // (a reconnect, or a fresh process resuming it from a persistent store).
    const isResume = !shouldFireOnSession;
    if (shouldFireOnSession) {
      await options.route.onCallStart?.({
        api,
        context: options.context,
        session,
      });
      await options.route.onSession?.({
        api,
        context: options.context,
        session,
      });
    } else {
      // onCallStart/onSession don't re-fire on a resume — give the app a chance
      // to rebuild per-session in-memory state (caller context, paced flags)
      // that didn't survive a process restart, BEFORE any resume re-greeting.
      await options.route.onResume?.({
        api,
        context: options.context,
        session,
      });
    }

    if (session.status === "completed") {
      await send({
        sessionId: options.id,
        type: "complete",
      });

      return;
    }

    resumePendingTurnCommit(session);

    await ensureAdapter();
    warmTTSSession();
    kickCallSilenceWatchdog();
    startAmdEvaluationTimer();

    // Emit one assistant-spoken line (greeting or resume re-orientation) as an
    // opening assistant message + synthesize it. A synthesis failure here must
    // never abort the session.
    const speakAssistantLine = async (text: string) => {
      if (!text.trim()) {
        return;
      }

      const lineTurnId = createId();
      await send({ text, turnId: lineTurnId, type: "assistant" });
      try {
        const lineTTSSession = await ensureTTSSession();
        if (lineTTSSession) {
          activeTTSTurnId = lineTurnId;
          await lineTTSSession.send(text);
          lastTtsSendAt = Date.now();
        } else if (options.realtime) {
          const lineRealtimeSession =
            (await ensureAdapter()) as RealtimeAdapterSession;
          activeTTSTurnId = lineTurnId;
          await lineRealtimeSession.send(text);
          lastTtsSendAt = Date.now();
        }
      } catch {
        // A synthesis failure must not abort the session.
      }
    };

    const resolveLine = async (
      line:
        | string
        | ((input: { session: TSession }) => string | Promise<string>),
    ) => (typeof line === "function" ? line({ session }) : line);

    // Assistant speaks first. With no committed turns the conversation hasn't
    // started, so (re-)greet — covers a fresh call AND a restart that landed
    // before the first answer. With turns already committed it's a resume after
    // a real exchange: the in-flight audio was lost, so speak the (optional)
    // re-orientation line instead of repeating the greeting.
    if (options.greeting && session.turns.length === 0) {
      await speakAssistantLine(await resolveLine(options.greeting));
    } else if (
      isResume &&
      options.resumeGreeting &&
      session.turns.length > 0
    ) {
      await speakAssistantLine(await resolveLine(options.resumeGreeting));
    }
  };

  const disconnectInternal = async (event?: VoiceCloseEvent) => {
    clearSilenceTimer();
    await closeTTSSession(event?.reason);
    await closeAdapter(event?.reason);
    rewindFallbackTurnAudio();

    if (reconnect.strategy === "fail") {
      await failInternal(
        new Error(event?.reason ?? "Voice socket disconnected"),
      );

      return;
    }

    await writeSession((session) => {
      if (session.status === "completed" || session.status === "failed") {
        return;
      }

      session.lastActivityAt = Date.now();
      session.reconnect.lastDisconnectAt = Date.now();
      session.status = "reconnecting";
    });
    speechDetected = false;
  };

  const receiveAudioInternal = async (audio: ArrayBuffer | ArrayBufferView) => {
    const session = await readSession();
    if (session.status === "completed" || session.status === "failed") {
      return;
    }

    const adapter = await ensureAdapter();
    let inboundAudio = audio;
    if (options.noiseSuppressor) {
      try {
        const suppressed = await options.noiseSuppressor.process({
          format: options.noiseSuppressorFormat ?? DEFAULT_FORMAT,
          pcm: audio,
        });
        inboundAudio = suppressed.bytes;
      } catch (error) {
        options.logger?.warn?.(
          `noise suppression failed, passing raw audio through: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    const conditionedAudio = conditionAudioChunk(
      inboundAudio,
      options.audioConditioning,
    );
    const audioLevel = measureAudioLevel(conditionedAudio);
    const shouldStoreAudio =
      speechDetected || audioLevel >= turnDetection.speechThreshold;

    await writeSession((currentSession) => {
      currentSession.currentTurn.lastAudioAt = Date.now();
      currentSession.lastActivityAt = Date.now();
      currentSession.status = "active";

      if (audioLevel >= turnDetection.speechThreshold) {
        currentSession.currentTurn.lastSpeechAt = Date.now();
        currentSession.currentTurn.silenceStartedAt = undefined;
      } else if (
        speechDetected &&
        currentSession.currentTurn.silenceStartedAt === undefined
      ) {
        currentSession.currentTurn.silenceStartedAt = Date.now();
      }
    });

    if (shouldStoreAudio) {
      pushTurnAudio(conditionedAudio);
    }

    if (recordingConfig?.userInputFormat) {
      const userBytes =
        conditionedAudio instanceof Uint8Array
          ? conditionedAudio
          : conditionedAudio instanceof ArrayBuffer
            ? new Uint8Array(conditionedAudio)
            : new Uint8Array(
                conditionedAudio.buffer,
                conditionedAudio.byteOffset,
                conditionedAudio.byteLength,
              );
      captureRecordingChunk("user", userBytes, recordingConfig.userInputFormat);
    }

    amdLastAudioLevel = audioLevel;
    if (audioLevel >= turnDetection.speechThreshold) {
      if (amdFirstAudioAt === undefined) {
        amdFirstAudioAt = Date.now();
      }
      // Barge-in (interrupting the assistant) is gated on a real STT partial
      // below, NOT on raw audio energy: a telephony line's continuous comfort
      // noise crosses speechThreshold and would falsely flush the assistant's
      // current utterance (e.g. cut the greeting). Energy still drives turn
      // detection (speechDetected / silence timers) here.
      speechDetected = true;
      kickCallSilenceWatchdog();
      // Track the caller's ongoing speech so a backchannel cue can fire once
      // they've been talking long enough (no-op unless backchannel is enabled).
      backchannelDriver?.noteSpeech();
      // Energy above threshold normally means the caller is mid-utterance, so we
      // clear the pending silence commit to defer end-of-turn. But raw energy
      // WITHOUT new STT words is almost always background/line noise — on a noisy
      // mic it crosses the threshold continuously and would defer the commit for
      // many seconds (observed: 12–13s after a terse answer like "no"). So only
      // treat energy as "still talking" while STT is actually producing words:
      // once we already have turn text and STT has gone quiet (no new transcript)
      // for >= silenceMs, the turn is over even though noise persists — fire the
      // silence commit instead of clearing it. STT word cadence (Deepgram emits
      // partials every ~100-300ms during real speech) is the truth signal; a
      // >= silenceMs gap in transcripts means they stopped, noise or not.
      const latest = await readSession();
      const sttQuietMs =
        latest.currentTurn.lastTranscriptAt !== undefined
          ? Date.now() - latest.currentTurn.lastTranscriptAt
          : Number.POSITIVE_INFINITY;
      const hasTurnTextDespiteNoise = Boolean(
        buildTurnText(
          latest.currentTurn.transcripts,
          latest.currentTurn.partialText,
          {
            partialEndedAtMs: latest.currentTurn.partialEndedAt,
            partialStartedAtMs: latest.currentTurn.partialStartedAt,
          },
        ),
      );
      if (
        hasTurnTextDespiteNoise &&
        sttQuietMs >= turnDetection.silenceMs
      ) {
        if (!silenceTimer) {
          scheduleSilenceCommit(0);
        }
      } else {
        clearSilenceTimer();
      }

      // ── STT-health watchdog ──────────────────────────────────────────────
      // The caller is producing speech energy. Track the continuous-speech phase
      // (a gap > STT_HEALTH_SPEECH_GAP_MS starts a new one), and if the phase has
      // run STT_HEALTH_STALE_MS with NO transcript landing in it, the STT stream
      // is dead — not merely quiet. Force-reconnect it (flap-budgeted, shared with
      // handleClose): closeAdapter nulls the session so the next inbound packet
      // re-opens a fresh stream, and we skip this chunk's send into the dead one.
      // Only the discrete-STT path can wedge like this; realtime adapters manage
      // their own transport.
      const nowMs = Date.now();
      if (nowMs - lastSpeechEnergyAt > STT_HEALTH_SPEECH_GAP_MS) {
        sttHealthPhaseStart = nowMs;
      }
      lastSpeechEnergyAt = nowMs;
      const lastTranscriptAt = latest.currentTurn.lastTranscriptAt ?? 0;
      if (
        !options.realtime &&
        sttSession &&
        lastTranscriptAt < sttHealthPhaseStart &&
        nowMs - sttHealthPhaseStart >= STT_HEALTH_STALE_MS
      ) {
        sttReconnectCount =
          nowMs - lastSttReconnectAt < STT_RECONNECT_FLAP_WINDOW_MS
            ? sttReconnectCount + 1
            : 1;
        lastSttReconnectAt = nowMs;
        sttHealthPhaseStart = nowMs; // give the fresh stream a clean window
        if (sttReconnectCount <= MAX_STT_RECONNECTS_IN_FLAP_WINDOW) {
          await appendTrace({
            payload: {
              action: "stt-health-reconnect",
              attempt: sttReconnectCount,
              reason: `no transcript for ${STT_HEALTH_STALE_MS}ms of continuous speech`,
            },
            session: latest,
            type: "session.error",
          });
          await closeAdapter("stt stale; health-reconnect");

          return; // skip the send into the now-closed stream; next packet re-opens
        }
      }
    } else if (speechDetected) {
      backchannelDriver?.noteSilence();
      const currentSession = await readSession();
      const hasTurnText = Boolean(
        buildTurnText(
          currentSession.currentTurn.transcripts,
          currentSession.currentTurn.partialText,
          {
            partialEndedAtMs: currentSession.currentTurn.partialEndedAt,
            partialStartedAtMs: currentSession.currentTurn.partialStartedAt,
          },
        ),
      );

      if (hasTurnText) {
        scheduleSilenceCommit(turnDetection.silenceMs, false);
      }
    }

    await adapter.send(conditionedAudio);
  };

  const closeInternal = async (
    reason: string | undefined,
    disposition: VoiceCallDisposition = "closed",
  ) => {
    const session = await writeSession((currentSession) => {
      if (
        currentSession.status !== "completed" &&
        currentSession.status !== "failed" &&
        !currentSession.call?.endedAt
      ) {
        currentSession.lastActivityAt = Date.now();
        currentSession.status = "completed";
        pushCallLifecycleEvent(currentSession, {
          disposition,
          reason,
          type: "end",
        });
      }
    });
    clearSilenceTimer();
    clearCallSilenceWatchdog();
    clearAmdEvaluationTimer();
    if (options.noiseSuppressor?.close) {
      try {
        await options.noiseSuppressor.close();
      } catch {
        // suppressor teardown is best-effort
      }
    }
    await closeTTSSession(reason);
    await closeAdapter(reason);
    await persistRecordings();
    await finalizeCostReport(session);
    await Promise.resolve(socket.close(1000, reason));
    if (session.call?.endedAt && session.call.disposition === disposition) {
      await appendTrace({
        payload: {
          disposition,
          reason,
          type: "end",
        },
        session,
        type: "call.lifecycle",
      });
      await options.route.onCallEnd?.({
        api,
        context: options.context,
        disposition,
        reason,
        session,
      });
    }
  };

  const api: VoiceSessionHandle<TContext, TSession, TResult> = {
    id: options.id,
    attachUserMedia: async (attachment) => {
      pendingUserAttachments.push(attachment);
    },
    close: async (reason?: string) => {
      await runSerial("api.close", async () => {
        const disposition: VoiceCallDisposition =
          reason === "silence-timeout" ? "silence-timeout" : "closed";
        await closeInternal(reason, disposition);
      });
    },
    commitTurn: async (reason: VoiceEndOfTurnEvent["reason"] = "manual") =>
      runSerial("api.commitTurn", async () => {
        await commitTurnInternal(reason);
      }),
    complete: async (result?: unknown) =>
      runSerial("api.complete", async () => {
        await completeInternal(result);
      }),
    connect: async (nextSocket) =>
      runSerial("api.connect", async () => {
        await connectInternal(nextSocket);
      }),
    disconnect: async (event?: VoiceCloseEvent) =>
      runSerial("api.disconnect", async () => {
        await disconnectInternal(event);
      }),
    escalate: async (input) =>
      runSerial("api.escalate", async () => {
        await escalateInternal(input);
      }),
    fail: async (error: unknown) =>
      runSerial("api.fail", async () => {
        await failInternal(error);
      }),
    markNoAnswer: async (input) =>
      runSerial("api.markNoAnswer", async () => {
        await markNoAnswerInternal(input);
      }),
    markVoicemail: async (input) =>
      runSerial("api.markVoicemail", async () => {
        await markVoicemailInternal(input);
      }),
    receiveAudio: async (audio: ArrayBuffer | ArrayBufferView) =>
      runSerial("api.receiveAudio", async () => {
        await receiveAudioInternal(audio);
      }),
    snapshot: async () => runSerial("api.snapshot", async () => readSession()),
    transfer: async (input) =>
      runSerial("api.transfer", async () => {
        await transferInternal(input);
      }),
    // Live-mutate turn detection. `turnDetection` is a mutable object held in
    // closure; every silence-timer scheduler reads through it, so the patch
    // takes effect on the next schedule. We clamp values defensively — a
    // tool-call gone rogue shouldn't be able to set silenceMs to 0 (instant
    // cut-off) or 5 minutes (effectively dead bot).
    setTurnDetection: async (patch) =>
      runSerial("api.setTurnDetection", async () => {
        if (patch.silenceMs !== undefined && Number.isFinite(patch.silenceMs)) {
          turnDetection.silenceMs = Math.max(
            300,
            Math.min(15000, Math.round(patch.silenceMs)),
          );
        }
        if (
          patch.speechThreshold !== undefined &&
          Number.isFinite(patch.speechThreshold)
        ) {
          turnDetection.speechThreshold = Math.max(
            0,
            Math.min(1, patch.speechThreshold),
          );
        }
        if (
          patch.transcriptStabilityMs !== undefined &&
          Number.isFinite(patch.transcriptStabilityMs)
        ) {
          turnDetection.transcriptStabilityMs = Math.max(
            0,
            Math.min(5000, Math.round(patch.transcriptStabilityMs)),
          );
        }

        return {
          silenceMs: turnDetection.silenceMs,
          speechThreshold: turnDetection.speechThreshold,
          transcriptStabilityMs: turnDetection.transcriptStabilityMs,
        };
      }),
  };

  return api;
};
