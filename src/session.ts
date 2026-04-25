import { Buffer } from 'node:buffer';
import { conditionAudioChunk } from './audioConditioning';
import { resolveLogger } from './logger';
import {
	createId,
	createVoiceSessionRecord,
	resetVoiceSessionRecord
} from './store';
import {
	DEFAULT_SILENCE_MS,
	DEFAULT_SPEECH_THRESHOLD,
	buildTurnText,
	measureAudioLevel,
	selectPreferredTranscriptText
} from './turnDetection';
import type {
	CreateVoiceSessionOptions,
	AudioChunk,
	STTAdapterSession,
	TTSAdapterSession,
	Transcript,
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
	VoiceTurnCorrectionDiagnostics,
	VoiceTurnRecord,
	VoiceTranscriptQuality
} from './types';

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

const DEFAULT_FORMAT = {
	channels: 1,
	container: 'raw',
	encoding: 'pcm_s16le',
	sampleRateHz: 16_000
} as const;

type BufferedAudioChunk = {
	chunk: Uint8Array;
	recordedAt: number;
};

const toError = (value: unknown) =>
	value instanceof Error ? value : new Error(String(value));

const createEmptyCurrentTurn = (): VoiceSessionRecord['currentTurn'] => ({
	finalText: '',
	lastSpeechAt: undefined,
	lastTranscriptAt: undefined,
	partialEndedAt: undefined,
	partialStartedAt: undefined,
	partialText: '',
	silenceStartedAt: undefined,
	transcripts: []
});

const cloneTranscript = (transcript: Transcript) => ({ ...transcript });
const encodeBase64 = (chunk: Uint8Array) => Buffer.from(chunk).toString('base64');

const countWords = (text: string) =>
	text.trim().split(/\s+/).filter(Boolean).length;

const normalizeText = (text: string) => text.trim().replace(/\s+/g, ' ');

const getAudioChunkDurationMs = (chunk: Uint8Array) =>
	(chunk.byteLength / (DEFAULT_FORMAT.sampleRateHz * DEFAULT_FORMAT.channels * 2)) *
	1_000;

const getBufferedAudioDurationMs = (chunks: Uint8Array[]) =>
	chunks.reduce((total, chunk) => total + getAudioChunkDurationMs(chunk), 0);

const calculateMeanConfidence = (transcripts: Transcript[]) => {
	let sum = 0;
	let total = 0;

	for (const transcript of transcripts) {
		if (typeof transcript.confidence === 'number') {
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
	source: VoiceTranscriptQuality['source'],
	fallbackUsed: boolean,
	fallbackDiagnostics?: VoiceFallbackDiagnostics,
	correctionDiagnostics?: VoiceTurnCorrectionDiagnostics,
	costEstimate?: VoiceTurnCostEstimate
): VoiceTranscriptQuality => {
	const sampledTranscripts = transcripts.filter(
		(transcript) => typeof transcript.confidence === 'number'
	);
	const confidenceSampleCount = sampledTranscripts.length;

	return {
		averageConfidence:
			confidenceSampleCount > 0
				? sampledTranscripts.reduce(
						(sum, transcript) => sum + transcript.confidence!,
						0
					) / confidenceSampleCount
				: undefined,
		confidenceSampleCount,
		correction: correctionDiagnostics,
		cost: costEstimate,
		fallback: fallbackDiagnostics,
		fallbackUsed,
		finalTranscriptCount: transcripts.filter((transcript) => transcript.isFinal).length,
		partialTranscriptCount: transcripts.filter(
			(transcript) => !transcript.isFinal
		).length,
		selectedTranscriptCount: transcripts.length,
		source
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
			Math.max(0, input.primaryAudioMs) + Math.max(0, input.fallbackReplayAudioMs)
	};
};

type TurnTranscriptionSelection = {
	diagnostics: VoiceFallbackDiagnostics;
	source: 'fallback' | 'primary';
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
	config: VoiceResolvedSTTFallbackConfig
) => {
	const trimmed = normalizeText(candidate.text);
	const wordCount = countWords(trimmed);

	if (config.trigger === 'always') {
		return true;
	}

	if (config.trigger === 'empty-turn') {
		return wordCount < config.minTextLength;
	}

	const averageConfidence = calculateMeanConfidence(candidate.transcripts);

	if (config.trigger === 'low-confidence') {
		return averageConfidence > 0 && averageConfidence < config.confidenceThreshold;
	}

	return (
		(averageConfidence > 0 &&
			averageConfidence < config.confidenceThreshold) ||
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
	}
): {
	reason: VoiceFallbackSelectionReason;
	winner: typeof candidate | typeof fallback;
} => {
	if (!fallback.text) {
		return {
			reason: 'fallback-empty',
			winner: candidate
		};
	}

	if (!candidate.text) {
		return {
			reason: 'primary-empty',
			winner: fallback
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
			reason: 'word-count-margin',
			winner: wordCountDelta > 0 ? fallback : candidate
		};
	}

	if (
		fallback.confidence >
		candidate.confidence + FALLBACK_CONFIDENCE_SELECTION_DELTA
	) {
		return {
			reason: 'confidence-margin',
			winner: fallback
		};
	}

	if (
		candidate.confidence >
		fallback.confidence + FALLBACK_CONFIDENCE_SELECTION_DELTA
	) {
		return {
			reason: 'kept-primary',
			winner: candidate
		};
	}

	if (fallback.wordCount > candidate.wordCount) {
		return {
			reason: 'word-count-tiebreak',
			winner: fallback
		};
	}

	return {
		reason: 'kept-primary',
		winner: candidate
	};
};

const setTurnResult = <
	TSession extends VoiceSessionRecord,
	TResult = unknown
>(
	session: TSession,
	turnId: string,
	input: {
		assistantText?: string;
		result?: TResult;
	}
) => {
	session.turns = session.turns.map((turn) =>
		turn.id === turnId
			? {
					...turn,
					assistantText: input.assistantText ?? turn.assistantText,
					result: input.result ?? turn.result
				}
			: turn
	);
};

const ensureCallLifecycleState = <TSession extends VoiceSessionRecord>(
	session: TSession
) => {
	const startedAt = session.createdAt;

	session.call ??= {
		events: [],
		lastEventAt: startedAt,
		startedAt
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
		type: 'start' | 'end' | 'transfer' | 'escalation' | 'voicemail' | 'no-answer';
	}
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
			type: input.type
		}
	];
	lifecycle.lastEventAt = at;

	if (input.type === 'end') {
		lifecycle.disposition = input.disposition;
		lifecycle.endedAt = at;
	}

	return lifecycle;
};

export const createVoiceSession = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: CreateVoiceSessionOptions<TContext, TSession, TResult>
): VoiceSessionHandle<TContext, TSession, TResult> => {
	const logger = resolveLogger(options.logger);
	const reconnect = {
		maxAttempts:
			options.reconnect.maxAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
		strategy: options.reconnect.strategy ?? 'resume-last-turn',
		timeout: options.reconnect.timeout ?? DEFAULT_RECONNECT_TIMEOUT
	};
	const turnDetection = {
		silenceMs: options.turnDetection.silenceMs ?? DEFAULT_SILENCE_MS,
		speechThreshold:
			options.turnDetection.speechThreshold ?? DEFAULT_SPEECH_THRESHOLD,
		transcriptStabilityMs:
			options.turnDetection.transcriptStabilityMs ??
			DEFAULT_TRANSCRIPT_STABILITY_MS
	};
	const sttFallback: VoiceResolvedSTTFallbackConfig | undefined = options.sttFallback
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
					options.sttFallback.replayWindowMs ??
					DEFAULT_FALLBACK_REPLAY_MS,
				settleMs:
					options.sttFallback.settleMs ??
					DEFAULT_FALLBACK_SETTLE_MS,
				trigger: options.sttFallback.trigger ?? 'empty-or-low-confidence'
		}
		: undefined;

	const appendTrace = async (input: {
		metadata?: Record<string, unknown>;
		payload: Record<string, unknown>;
		session?: TSession;
		turnId?: string;
		type:
			| 'call.lifecycle'
			| 'session.error'
			| 'turn.assistant'
			| 'turn.committed'
			| 'turn.cost'
			| 'turn.transcript';
	}) => {
		await options.trace?.append({
			at: Date.now(),
			metadata: input.metadata,
			payload: input.payload,
			scenarioId: input.session?.scenarioId ?? options.scenarioId,
			sessionId: options.id,
			turnId: input.turnId,
			type: input.type
		});
	};
	const phraseHints = options.phraseHints ?? [];
	const lexicon = options.lexicon ?? [];

	let socket = options.socket;
	let sttSession: STTAdapterSession | null = null;
	let ttsSession: TTSAdapterSession | null = null;
	let ttsSessionPromise: Promise<TTSAdapterSession | null> | null = null;
	let silenceTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingCommitReason: VoiceEndOfTurnEvent['reason'] | null = null;
	let speechDetected = false;
	let operationQueue = Promise.resolve();
	let adapterGenerationCounter = 0;
	let activeAdapterGeneration = 0;
	let activeTTSTurnId: string | undefined;
	const currentTurnAudio: BufferedAudioChunk[] = [];
	let fallbackAttemptsForCurrentTurn = 0;
	let fallbackReplayAudioMsForCurrentTurn = 0;

	const pruneTurnAudio = () => {
		const replayWindowMs = sttFallback?.replayWindowMs ?? DEFAULT_FALLBACK_REPLAY_MS;
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
							audio.byteOffset + audio.byteLength
						)
					);

		currentTurnAudio.push({
			chunk,
			recordedAt: Date.now()
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
			turnDetection.transcriptStabilityMs < EXTENDED_VENDOR_COMMIT_SILENCE_THRESHOLD_MS
		) {
			return turnDetection.transcriptStabilityMs;
		}

		return Math.max(
			turnDetection.transcriptStabilityMs,
			Math.min(MAX_VENDOR_COMMIT_GRACE_MS, turnDetection.silenceMs * 2)
		);
	};

	const send = async (message: VoiceServerMessage) => {
		try {
			await Promise.resolve(socket.send(JSON.stringify(message)));
		} catch (error) {
			logger.warn('voice socket send failed', {
				error: toError(error).message,
				sessionId: options.id,
				type: message.type
			});
		}
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
		operation: () => Promise<T> | T
	): Promise<T> => {
		const result = operationQueue.then(async () => {
			logger.debug('voice session operation', {
				phase,
				sessionId: options.id
			});

			return await operation();
		});

		operationQueue = result.then(
			() => undefined,
			() => undefined
		);

		return result;
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
			logger.warn('voice stt close failed', {
				error: toError(error).message,
				sessionId: options.id
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
			logger.warn('voice tts adapter close failed', {
				error: toError(error).message,
				reason,
				sessionId: options.id
			});
		}
	};

	const scheduleTurnCommit = (
		delayMs: number,
		reason: VoiceEndOfTurnEvent['reason'],
		reset = true
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
			void api.commitTurn(reason);
		}, delayMs);
	};

	const scheduleSilenceCommit = (
		delayMs = turnDetection.silenceMs,
		reset = true
	) => scheduleTurnCommit(delayMs, 'silence', reset);

	const requestTurnCommit = async (reason: VoiceEndOfTurnEvent['reason']) => {
		const session = await readSession();
		const text = buildTurnText(
			session.currentTurn.transcripts,
			session.currentTurn.partialText,
			{
				partialEndedAtMs: session.currentTurn.partialEndedAt,
				partialStartedAtMs: session.currentTurn.partialStartedAt
			}
		);

		if (!text) {
			return;
		}

		const transcriptStabilityAge =
			session.currentTurn.lastTranscriptAt !== undefined
				? Date.now() - session.currentTurn.lastTranscriptAt
				: undefined;

		if (reason === 'vendor') {
			scheduleTurnCommit(getVendorCommitDelayMs(), reason);
			return;
		}

		if (
			reason !== 'manual' &&
			typeof transcriptStabilityAge === 'number' &&
			transcriptStabilityAge < turnDetection.transcriptStabilityMs
		) {
			scheduleTurnCommit(
				turnDetection.transcriptStabilityMs - transcriptStabilityAge,
				reason
			);
			return;
		}

		await commitTurnInternal(reason);
	};

	const failInternal = async (error: unknown) => {
		clearSilenceTimer();
		let didFail = false;

		const session = await writeSession((currentSession) => {
			if (currentSession.status === 'failed') {
				return;
			}

			didFail = true;
			currentSession.lastActivityAt = Date.now();
			currentSession.status = 'failed';
			if (!currentSession.call?.endedAt) {
				pushCallLifecycleEvent(currentSession, {
					disposition: 'failed',
					reason: toError(error).message,
					type: 'end'
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
				recoverable: false
			},
			session,
			type: 'session.error'
		});
		await appendTrace({
			payload: {
				disposition: 'failed',
				reason: resolvedError.message,
				type: 'end'
			},
			session,
			type: 'call.lifecycle'
		});

		await send({
			message: resolvedError.message,
			recoverable: false,
			type: 'error'
		});
		await closeTTSSession('failed');
		await closeAdapter('failed');
		speechDetected = false;
		rewindFallbackTurnAudio();
		await options.route.onError?.({
			api,
			context: options.context,
			error: resolvedError,
			session,
			sessionId: options.id
		});
		await options.route.onCallEnd?.({
			api,
			context: options.context,
			disposition: 'failed',
			reason: resolvedError.message,
			session
		});
	};

	const completeInternal = async (
		result?: unknown,
		input: {
			disposition?: VoiceCallDisposition;
			invokeOnComplete?: boolean;
			metadata?: Record<string, unknown>;
			reason?: string;
			target?: string;
		} = {}
	) => {
		clearSilenceTimer();
		const disposition = input.disposition ?? 'completed';
		const shouldInvokeOnComplete = input.invokeOnComplete ?? disposition === 'completed';
		let didComplete = false;

		const session = await writeSession((currentSession) => {
			if (
				currentSession.status === 'completed' ||
				currentSession.status === 'failed'
			) {
				return;
			}

			didComplete = true;

			currentSession.lastActivityAt = Date.now();
			currentSession.status = 'completed';

			if (result !== undefined && currentSession.turns.length > 0) {
				const lastTurn = currentSession.turns.at(-1);
				if (lastTurn) {
					setTurnResult(currentSession, lastTurn.id, {
						result
					});
				}
			}

			if (!currentSession.call?.endedAt) {
				pushCallLifecycleEvent(currentSession, {
					disposition,
					metadata: input.metadata,
					reason: input.reason,
					target: input.target,
					type: 'end'
				});
			}
		});

		if (!didComplete) {
			return;
		}

		await appendTrace({
			payload: {
				disposition,
				reason: input.reason,
				target: input.target,
				type: 'end'
			},
			session,
			type: 'call.lifecycle'
		});
		await send({
			sessionId: options.id,
			type: 'complete'
		});
		await closeTTSSession('complete');
		await closeAdapter('complete');
		speechDetected = false;
		rewindFallbackTurnAudio();
		if (disposition === 'transferred' && input.target) {
			await options.route.onTransfer?.({
				api,
				context: options.context,
				metadata: input.metadata,
				reason: input.reason,
				session,
				target: input.target
			});
		}
		if (disposition === 'escalated' && input.reason) {
			await options.route.onEscalation?.({
				api,
				context: options.context,
				metadata: input.metadata,
				reason: input.reason,
				session
			});
		}
		if (disposition === 'voicemail') {
			await options.route.onVoicemail?.({
				api,
				context: options.context,
				metadata: input.metadata,
				session
			});
		}
		if (disposition === 'no-answer') {
			await options.route.onNoAnswer?.({
				api,
				context: options.context,
				metadata: input.metadata,
				session
			});
		}
		if (shouldInvokeOnComplete) {
			await options.route.onComplete({
				api,
				context: options.context,
				session
			});
		}
		await options.route.onCallEnd?.({
			api,
			context: options.context,
			disposition,
			metadata: input.metadata,
			reason: input.reason,
			session,
			target: input.target
		});
	};

	const transferInternal = async (input: {
		metadata?: Record<string, unknown>;
		reason?: string;
		result?: TResult;
		target: string;
	}) => {
		const session = await writeSession((currentSession) => {
			pushCallLifecycleEvent(currentSession, {
				metadata: input.metadata,
				reason: input.reason,
				target: input.target,
				type: 'transfer'
			});
		});
		await appendTrace({
			metadata: input.metadata,
			payload: {
				reason: input.reason,
				target: input.target,
				type: 'transfer'
			},
			session,
			type: 'call.lifecycle'
		});
		await completeInternal(input.result, {
			disposition: 'transferred',
			invokeOnComplete: false,
			metadata: input.metadata,
			reason: input.reason,
			target: input.target
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
				type: 'escalation'
			});
		});
		await appendTrace({
			metadata: input.metadata,
			payload: {
				reason: input.reason,
				type: 'escalation'
			},
			session,
			type: 'call.lifecycle'
		});
		await completeInternal(input.result, {
			disposition: 'escalated',
			invokeOnComplete: false,
			metadata: input.metadata,
			reason: input.reason
		});
	};

	const markNoAnswerInternal = async (input?: {
		metadata?: Record<string, unknown>;
		result?: TResult;
	}) => {
		const session = await writeSession((currentSession) => {
			pushCallLifecycleEvent(currentSession, {
				metadata: input?.metadata,
				type: 'no-answer'
			});
		});
		await appendTrace({
			metadata: input?.metadata,
			payload: {
				type: 'no-answer'
			},
			session,
			type: 'call.lifecycle'
		});
		await completeInternal(input?.result, {
			disposition: 'no-answer',
			invokeOnComplete: false,
			metadata: input?.metadata
		});
	};

	const markVoicemailInternal = async (input?: {
		metadata?: Record<string, unknown>;
		result?: TResult;
	}) => {
		const session = await writeSession((currentSession) => {
			pushCallLifecycleEvent(currentSession, {
				metadata: input?.metadata,
				type: 'voicemail'
			});
		});
		await appendTrace({
			metadata: input?.metadata,
			payload: {
				type: 'voicemail'
			},
			session,
			type: 'call.lifecycle'
		});
		await completeInternal(input?.result, {
			disposition: 'voicemail',
			invokeOnComplete: false,
			metadata: input?.metadata
		});
	};

	const handleError = async (event: VoiceErrorEvent) => {
		await appendTrace({
			payload: {
				code: event.code,
				error: event.error.message,
				recoverable: event.recoverable
			},
			type: 'session.error'
		});
		await send({
			message: event.error.message,
			recoverable: event.recoverable,
			type: 'error'
		});

		if (!event.recoverable) {
			await failInternal(event.error);
		}
	};

	const handleClose = async (event: VoiceCloseEvent) => {
		if (event.recoverable === false) {
			await failInternal(
				new Error(event.reason ?? 'Speech-to-text session closed')
			);
			return;
		}

		if (!event.reason) {
			await closeAdapter('provider stream closed');
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
		primaryTranscripts: Transcript[]
	): Promise<TurnTranscriptionSelection | null> => {
		if (
			!sttFallback?.adapter ||
			fallbackAttemptsForCurrentTurn >= sttFallback.maxAttemptsPerTurn
		) {
			return null;
		}

		const candidate = {
			text: primaryText,
			transcripts: primaryTranscripts
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
				sessionId: `${options.id}:fallback:${fallbackAttemptsForCurrentTurn}`
			});
		} catch (error) {
			logger.warn('voice stt fallback open failed', {
				error: toError(error).message,
				sessionId: options.id
			});
			return null;
		}

		const unsubscribers = [
			fallbackSession.on('final', ({ transcript }) => {
				fallbackFinalReceived = true;
				lastFallbackTranscriptAt = Date.now();
				fallbackTranscripts.push(cloneTranscript(transcript));
			}),
			fallbackSession.on('partial', ({ transcript }) => {
				lastFallbackTranscriptAt = Date.now();
				fallbackTranscripts.push(cloneTranscript(transcript));
			}),
			fallbackSession.on('endOfTurn', () => {
				fallbackEndOfTurnReceived = true;
			}),
			fallbackSession.on('error', (event) => {
				logger.warn('voice stt fallback error', {
					error: toError(event.error).message,
					sessionId: options.id
				});
			}),
			fallbackSession.on('close', () => {
				fallbackClosed = true;
			})
		];

		const closeFallback = async (reason: string) => {
			if (!fallbackSession) {
				return;
			}

			try {
				await fallbackSession.close(reason);
			} catch (error) {
				logger.warn('voice stt fallback close failed', {
					error: toError(error).message,
					sessionId: options.id
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
					Math.max(sttFallback.settleMs * 4, Math.round(replayDurationMs * 0.18))
				)
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
			logger.warn('voice stt fallback failed', {
				error: toError(error).message,
				sessionId: options.id
			});
		} finally {
			await closeFallback('fallback-complete');
			for (const unsubscribe of unsubscribers) {
				unsubscribe();
			}
		}

		if (fallbackTranscripts.length === 0) {
			return null;
		}

		const fallbackText = buildTurnText(
			fallbackTranscripts,
			'',
			{}
		);
		const fallbackConfidence = calculateMeanConfidence(fallbackTranscripts);
		const fallbackCandidate = {
			confidence: fallbackConfidence,
			text: fallbackText,
			wordCount: countWords(normalizeText(fallbackText))
		};
		const primaryCandidate = {
			confidence: calculateMeanConfidence(primaryTranscripts),
			text: primaryText,
			wordCount: countWords(normalizeText(primaryText))
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
			trigger: sttFallback.trigger
		};
		if (selection.winner.text === primaryCandidate.text) {
			return {
				diagnostics,
				fallbackUsed: false,
				source: 'primary',
				text: primaryText,
				transcripts: primaryTranscripts.map((transcript) => ({
					...transcript,
					isFinal: true
				}))
			};
		}

		const candidateTranscripts =
			fallbackText === fallbackCandidate.text ? fallbackTranscripts : [];

		return {
			diagnostics,
			fallbackUsed: true,
			source: 'fallback',
			text: selection.winner.text,
			transcripts:
				candidateTranscripts.length > 0
					? candidateTranscripts.map((transcript) => ({
							...transcript,
							isFinal: true
					  }))
					: [{ id: createId(), isFinal: false, text: selection.winner.text }]
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
		source: 'fallback' | 'primary';
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
			transcripts: input.transcripts.map(cloneTranscript)
		});

		const nextText =
			typeof result === 'string'
				? result
				: typeof result?.text === 'string'
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
				metadata: typeof result === 'object' ? result.metadata : undefined,
				originalText,
				provider: typeof result === 'object' ? result.provider : undefined,
				reason: typeof result === 'object' ? result.reason : undefined
			} satisfies VoiceTurnCorrectionDiagnostics,
			text: correctedText.length > 0 ? correctedText : originalText
		};
	};

	const ensureCommittedTurnGuard = (session: TSession) => {
		if (!session.lastCommittedTurn) {
			session.lastCommittedTurn = {
				committedAt: 0,
				signature: '',
				text: '',
				transcriptIds: []
			};
		}

		return session;
	};

	const buildTurnSignature = (
		session: TSession,
		finalText: string,
		transcriptIdsOverride?: string[]
	) => {
		const finalTranscriptIds = transcriptIdsOverride
			?? getFinalTranscriptIds(session.currentTurn.transcripts);
		return `${normalizeText(finalText)}|${finalTranscriptIds.join(',')}`;
	};

	const isDuplicateTurnCommit = (
		session: TSession,
		finalText: string
	) => {
		const signature = buildTurnSignature(session, finalText);
		const committedTurn = session.lastCommittedTurn;
		const isRecent =
			committedTurn &&
			committedTurn.committedAt > 0 &&
			Date.now() - committedTurn.committedAt < DEFAULT_DUPLICATE_TURN_WINDOW_MS;
		const committedSignature = committedTurn?.signature ?? '';
		const committedTranscriptIds = committedTurn?.transcriptIds ?? [];
		const committedText = normalizeText(committedTurn?.text ?? '');
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

		const lastSignatureIds = new Set(
			committedTranscriptIds
		);
		const hasNoNewFinalIds = session.currentTurn.transcripts.every(
			(transcript) =>
				!transcript.isFinal || lastSignatureIds.has(transcript.id)
		);

		return isRecent && hasNoNewFinalIds;
	};

	const markTurnCommitted = (
		session: TSession,
		finalText: string,
		committedTranscripts: Transcript[]
	) => {
		session.lastCommittedTurn = {
			...((session.lastCommittedTurn as object | undefined) ?? {}),
			committedAt: Date.now(),
			signature: buildTurnSignature(
				session,
				finalText,
				getFinalTranscriptIds(committedTranscripts)
			),
			text: normalizeText(finalText),
			transcriptIds: getFinalTranscriptIds(committedTranscripts)
		};
	};

	const handlePartial = async (transcript: Transcript) => {
		const session = await writeSession((session) => {
			const nextPartialStartedAt =
				transcript.startedAtMs ?? session.currentTurn.partialStartedAt;
			const nextPartialEndedAt =
				transcript.endedAtMs ?? session.currentTurn.partialEndedAt;
			const preferredPartial = selectPreferredTranscriptText(
				session.currentTurn.partialText,
				transcript.text
			);

			session.currentTurn.lastTranscriptAt = Date.now();
			session.currentTurn.partialStartedAt = nextPartialStartedAt;
			session.currentTurn.partialEndedAt = nextPartialEndedAt;
			session.currentTurn.partialText = buildTurnText(
				session.currentTurn.transcripts,
				preferredPartial,
				{
					partialEndedAtMs: nextPartialEndedAt,
					partialStartedAtMs: nextPartialStartedAt
				}
			);
			session.lastActivityAt = Date.now();
			session.status = 'active';
		});

		if (silenceTimer && pendingCommitReason === 'vendor') {
			scheduleTurnCommit(getVendorCommitDelayMs(), 'vendor');
		}

		await send({
			transcript,
			type: 'partial'
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
				vendor: transcript.vendor
			},
			session,
			type: 'turn.transcript'
		});
	};

	const handleFinal = async (transcript: Transcript) => {
		const session = await writeSession((session) => {
			const alreadyPresent = session.currentTurn.transcripts.some(
				(existing) => existing.id === transcript.id
			);

			if (!alreadyPresent) {
				session.currentTurn.transcripts = [
					...session.currentTurn.transcripts,
					cloneTranscript(transcript)
				];
				session.transcripts = [
					...session.transcripts,
					cloneTranscript(transcript)
				];
			}

			session.currentTurn.finalText = buildTurnText(
				session.currentTurn.transcripts,
				session.currentTurn.partialText,
				{
					partialEndedAtMs: session.currentTurn.partialEndedAt,
					partialStartedAtMs: session.currentTurn.partialStartedAt
				}
			);
			session.currentTurn.lastTranscriptAt = Date.now();
			session.lastActivityAt = Date.now();
			session.status = 'active';
		});

		if (silenceTimer && pendingCommitReason === 'vendor') {
			scheduleTurnCommit(getVendorCommitDelayMs(), 'vendor');
		}

		await send({
			transcript,
			type: 'final'
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
				vendor: transcript.vendor
			},
			session,
			type: 'turn.transcript'
		});
	};

	const resumePendingTurnCommit = (session: TSession) => {
		const pendingText = buildTurnText(
			session.currentTurn.transcripts,
			session.currentTurn.partialText,
			{
				partialEndedAtMs: session.currentTurn.partialEndedAt,
				partialStartedAtMs: session.currentTurn.partialStartedAt
			}
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
			turnDetection.transcriptStabilityMs - transcriptAge
		);

		scheduleSilenceCommit(delayMs);
	};

	const ensureAdapter = async () => {
		if (sttSession) {
			return sttSession;
		}

		const openedSession = await options.stt.open({
			format: DEFAULT_FORMAT,
			languageStrategy: options.languageStrategy,
			lexicon,
			phraseHints,
			sessionId: options.id
		});
		const generation = ++adapterGenerationCounter;
		sttSession = openedSession;
		activeAdapterGeneration = generation;

		const runAdapterEvent = (
			phase: string,
			handler: () => Promise<void> | void
		) => {
			void runSerial(phase, async () => {
				if (activeAdapterGeneration !== generation) {
					return;
				}

				await handler();
			});
		};

		openedSession.on('partial', ({ transcript }) => {
			runAdapterEvent('adapter.partial', () => handlePartial(transcript));
		});
		openedSession.on('final', ({ transcript }) => {
			runAdapterEvent('adapter.final', () => handleFinal(transcript));
		});
		openedSession.on('endOfTurn', ({ reason }) => {
			runAdapterEvent('adapter.endOfTurn', async () => {
				clearSilenceTimer();
				await requestTurnCommit(reason);
			});
		});
		openedSession.on('error', (event) => {
			runAdapterEvent('adapter.error', () => handleError(event));
		});
		openedSession.on('close', (event) => {
			runAdapterEvent('adapter.close', () => handleClose(event));
		});

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
				sessionId: options.id
			});
			ttsSession = openedSession;

			openedSession.on('audio', ({ chunk, format, receivedAt }) => {
				void runSerial('tts.audio', async () => {
					if (ttsSession !== openedSession) {
						return;
					}

					const normalizedChunk =
						chunk instanceof Uint8Array
							? new Uint8Array(chunk)
							: chunk instanceof ArrayBuffer
								? new Uint8Array(chunk.slice(0))
								: new Uint8Array(
										chunk.buffer.slice(
											chunk.byteOffset,
											chunk.byteOffset + chunk.byteLength
										)
					);

					await send({
						chunkBase64: encodeBase64(normalizedChunk),
						format,
						receivedAt,
						turnId: activeTTSTurnId,
						type: 'audio'
					});
				});
			});
			openedSession.on('error', (event) => {
				void runSerial('tts.error', async () => {
					if (ttsSession !== openedSession) {
						return;
					}

					await send({
						message: toError(event.error).message,
						recoverable: event.recoverable,
						type: 'error'
					});
				});
			});
			openedSession.on('close', () => {
				void runSerial('tts.close', async () => {
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
			logger.warn('voice tts prewarm failed', {
				error: toError(error).message,
				sessionId: options.id
			});
		});
	};

	const completeTurn = async (
		session: TSession,
		turn: VoiceTurnRecord<TResult>
	) => {
		const committedOutput = await options.route.onTurn({
			api: api,
			context: options.context,
			session,
			turn
		});
		const output = {
			assistantText: committedOutput?.assistantText,
			complete: committedOutput?.complete,
			escalate: committedOutput?.escalate,
			noAnswer: committedOutput?.noAnswer,
			result: committedOutput?.result,
			transfer: committedOutput?.transfer,
			voicemail: committedOutput?.voicemail
		};

		if (output?.assistantText) {
			await writeSession((currentSession) => {
				setTurnResult(currentSession, turn.id, {
					assistantText: output.assistantText
				});
			});
			await send({
				text: output.assistantText,
				turnId: turn.id,
				type: 'assistant'
			});
			await appendTrace({
				payload: {
					text: output.assistantText,
					ttsConfigured: Boolean(options.tts)
				},
				session,
				turnId: turn.id,
				type: 'turn.assistant'
			});

			try {
				const activeTTSSession = await ensureTTSSession();
				if (activeTTSSession) {
					const ttsStartedAt = Date.now();
					activeTTSTurnId = turn.id;
					await activeTTSSession.send(output.assistantText);
					await appendTrace({
						payload: {
							elapsedMs: Date.now() - ttsStartedAt,
							status: 'sent'
						},
						session,
						turnId: turn.id,
						type: 'turn.assistant'
					});
				}
			} catch (error) {
				logger.warn('voice tts send failed', {
					error: toError(error).message,
					sessionId: options.id,
					turnId: turn.id
				});
				await appendTrace({
					payload: {
						error: toError(error).message,
						status: 'tts-send-failed'
					},
					session,
					turnId: turn.id,
					type: 'session.error'
				});
			}
		}

		if (output?.result !== undefined) {
			await writeSession((currentSession) => {
				setTurnResult(currentSession, turn.id, {
					result: output.result
				});
			});
		}

		if (output?.transfer) {
			await transferInternal({
				metadata: output.transfer.metadata,
				reason: output.transfer.reason,
				result: output.result,
				target: output.transfer.target
			});
			return;
		}

		if (output?.escalate) {
			await escalateInternal({
				metadata: output.escalate.metadata,
				reason: output.escalate.reason,
				result: output.result
			});
			return;
		}

		if (output?.voicemail) {
			await markVoicemailInternal({
				metadata: output.voicemail.metadata,
				result: output.result
			});
			return;
		}

		if (output?.noAnswer) {
			await markNoAnswerInternal({
				metadata: output.noAnswer.metadata,
				result: output.result
			});
			return;
		}

		if (output?.complete) {
			await completeInternal(output.result);
		}
	};

	const commitTurnInternal = async (
		reason: VoiceEndOfTurnEvent['reason'] = 'manual'
	) => {
		clearSilenceTimer();

		const session = await readSession();
		if (session.status === 'completed' || session.status === 'failed') {
			return;
		}

		const text = buildTurnText(
			session.currentTurn.transcripts,
			session.currentTurn.partialText,
			{
				partialEndedAtMs: session.currentTurn.partialEndedAt,
				partialStartedAtMs: session.currentTurn.partialStartedAt
			}
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
			session.currentTurn.transcripts
		);

		const source: 'fallback' | 'primary' = fallbackSelection?.source ?? 'primary';
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
								text: finalText
							}
					  ];

			if (fallbackSelection.fallbackUsed) {
				logger.info('voice fallback turn selected', {
					reason,
					sessionId: options.id,
					text: finalText
				});
			}
		}

		const correctionSelection = await runTurnCorrection({
			fallbackDiagnostics,
			fallbackUsed,
			session,
			source,
			text: finalText,
			transcripts
		});
		const correctionDiagnostics = correctionSelection?.diagnostics;
		if (correctionSelection) {
			finalText = correctionSelection.text;
		}

		if (!finalText) {
			return;
		}

		if (isDuplicateTurnCommit(session, finalText)) {
			logger.debug('voice turn commit deduped', {
				reason,
				sessionId: options.id
			});
			return;
		}

		if (
			typeof transcriptStabilityAge === 'number' &&
			transcriptStabilityAge < turnDetection.transcriptStabilityMs &&
			reason !== 'manual'
		) {
			scheduleTurnCommit(
				turnDetection.transcriptStabilityMs - transcriptStabilityAge,
				reason,
				false
			);
			return;
		}

		const costEstimate = createTurnCostEstimate({
			fallbackAttemptCount: fallbackAttemptsForCurrentTurn,
			fallbackPassCostUnit: options.costTelemetry?.fallbackPassCostUnit,
			fallbackReplayAudioMs: fallbackReplayAudioMsForCurrentTurn,
			primaryAudioMs: getBufferedAudioDurationMs(
				currentTurnAudio.map((audio) => audio.chunk)
			),
			primaryPassCostUnit: options.costTelemetry?.primaryPassCostUnit
		});

		const turn: VoiceTurnRecord<TResult> = {
			committedAt: Date.now(),
			id: createId(),
			text: finalText,
			quality: createTurnQuality(
				transcripts,
				source,
				fallbackUsed,
				fallbackDiagnostics,
				correctionDiagnostics,
				costEstimate
			),
			transcripts:
				transcripts.length > 0
					? transcripts
					: [
							{
								id: createId(),
								isFinal: false,
								text: finalText
							}
						]
		};

		const updatedSession = await writeSession((currentSession) => {
			currentSession.committedTurnIds = [
				...currentSession.committedTurnIds,
				turn.id
			];
			currentSession.currentTurn = createEmptyCurrentTurn();
			currentSession.lastActivityAt = Date.now();
			currentSession.status = 'active';
			currentSession.turns = [...currentSession.turns, turn];
			markTurnCommitted(currentSession, finalText, transcripts);
		});
		speechDetected = false;
		rewindFallbackTurnAudio();

		logger.info('voice turn committed', {
			reason,
			sessionId: options.id,
			turnId: turn.id
		});

		await options.costTelemetry?.onTurnCost?.({
			api,
			context: options.context,
			estimate: costEstimate,
			session: updatedSession,
			turn
		});
		await appendTrace({
			payload: {
				correctionChanged: correctionDiagnostics?.changed,
				correctionProvider: correctionDiagnostics?.provider,
				fallbackUsed,
				reason,
				source,
				text: turn.text,
				transcriptCount: turn.transcripts.length
			},
			session: updatedSession,
			turnId: turn.id,
			type: 'turn.committed'
		});
		await appendTrace({
			payload: {
				...costEstimate
			},
			session: updatedSession,
			turnId: turn.id,
			type: 'turn.cost'
		});

		await send({
			turn,
			type: 'turn'
		});
		if (options.sttLifecycle === 'turn-scoped') {
			await closeAdapter('turn-commit');
		}
		await completeTurn(updatedSession, turn);
	};

	const connectInternal = async (nextSocket: {
		close: (
			code?: number,
			reason?: string
		) => void | Promise<void>;
		send: (data: string | Uint8Array | ArrayBuffer) => void | Promise<void>;
	}) => {
		socket = nextSocket;

		const existingSession = await options.store.get(options.id);
		let session = (
			existingSession ??
			createVoiceSessionRecord<TSession>(options.id, options.scenarioId)
		) as TSession;

		if (
			options.scenarioId &&
			session.scenarioId !== options.scenarioId
		) {
			session.scenarioId = options.scenarioId;
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
				options.scenarioId
			);
			shouldFireOnSession = true;
		}
		rewindFallbackTurnAudio();

		if (existingSession?.status === 'reconnecting') {
			const nextAttempts = existingSession.reconnect.attempts + 1;
			const reconnectExpired =
				existingSession.reconnect.lastDisconnectAt !== undefined &&
				Date.now() - existingSession.reconnect.lastDisconnectAt >
					reconnect.timeout;
			const tooManyAttempts = nextAttempts > reconnect.maxAttempts;

			if (
				reconnect.strategy === 'fail' &&
				(reconnectExpired || tooManyAttempts)
			) {
				await failInternal(
					new Error('Voice session reconnect policy exhausted')
				);

				return;
			}

			if (
				reconnect.strategy === 'restart' &&
				(reconnectExpired || tooManyAttempts)
			) {
				session = resetVoiceSessionRecord<TSession>(
					options.id,
					existingSession,
					options.scenarioId
				);
				shouldFireOnSession = true;
			} else {
				session = {
					...existingSession,
					reconnect: {
						...existingSession.reconnect,
						attempts: nextAttempts
					},
					status: 'active'
				};
			}
		}

		if (shouldFireOnSession) {
			pushCallLifecycleEvent(session, {
				type: 'start'
			});
		}

		await options.store.set(options.id, session);
		if (shouldFireOnSession) {
			await appendTrace({
				payload: {
					type: 'start'
				},
				session,
				type: 'call.lifecycle'
			});
		}
		await send({
			sessionId: options.id,
			status: session.status,
			scenarioId: session.scenarioId,
			type: 'session'
		});

		if (shouldFireOnSession) {
			await options.route.onCallStart?.({
				api,
				context: options.context,
				session
			});
			await options.route.onSession?.({
				api,
				context: options.context,
				session
			});
		}

		if (session.status === 'completed') {
			await send({
				sessionId: options.id,
				type: 'complete'
			});

			return;
		}

		resumePendingTurnCommit(session);

		await ensureAdapter();
		warmTTSSession();
	};

	const disconnectInternal = async (event?: VoiceCloseEvent) => {
		clearSilenceTimer();
		await closeTTSSession(event?.reason);
		await closeAdapter(event?.reason);
		rewindFallbackTurnAudio();

		if (reconnect.strategy === 'fail') {
			await failInternal(
				new Error(event?.reason ?? 'Voice socket disconnected')
			);

			return;
		}

		await writeSession((session) => {
			if (session.status === 'completed' || session.status === 'failed') {
				return;
			}

			session.lastActivityAt = Date.now();
			session.reconnect.lastDisconnectAt = Date.now();
			session.status = 'reconnecting';
		});
		speechDetected = false;
	};

	const receiveAudioInternal = async (audio: ArrayBuffer | ArrayBufferView) => {
		const session = await readSession();
		if (session.status === 'completed' || session.status === 'failed') {
			return;
		}

		const adapter = await ensureAdapter();
		const conditionedAudio = conditionAudioChunk(
			audio,
			options.audioConditioning
		);
		const audioLevel = measureAudioLevel(conditionedAudio);
		const shouldStoreAudio =
			speechDetected || audioLevel >= turnDetection.speechThreshold;

		await writeSession((currentSession) => {
			currentSession.currentTurn.lastAudioAt = Date.now();
			currentSession.lastActivityAt = Date.now();
			currentSession.status = 'active';

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

		if (audioLevel >= turnDetection.speechThreshold) {
			speechDetected = true;
			clearSilenceTimer();
		} else if (speechDetected) {
			const currentSession = await readSession();
			const hasTurnText = Boolean(
				buildTurnText(
					currentSession.currentTurn.transcripts,
					currentSession.currentTurn.partialText,
					{
						partialEndedAtMs: currentSession.currentTurn.partialEndedAt,
						partialStartedAtMs:
							currentSession.currentTurn.partialStartedAt
					}
				)
			);

			if (hasTurnText) {
				scheduleSilenceCommit(turnDetection.silenceMs, false);
			}
		}

		await adapter.send(conditionedAudio);
	};

	const api: VoiceSessionHandle<TContext, TSession, TResult> = {
		id: options.id,
		close: async (reason?: string) => {
			await runSerial('api.close', async () => {
				const session = await writeSession((currentSession) => {
					if (
						currentSession.status !== 'completed' &&
						currentSession.status !== 'failed' &&
						!currentSession.call?.endedAt
					) {
						currentSession.lastActivityAt = Date.now();
						currentSession.status = 'completed';
						pushCallLifecycleEvent(currentSession, {
							disposition: 'closed',
							reason,
							type: 'end'
						});
					}
				});
				clearSilenceTimer();
				await closeTTSSession(reason);
				await closeAdapter(reason);
				await Promise.resolve(socket.close(1000, reason));
				if (session.call?.endedAt && session.call.disposition === 'closed') {
					await appendTrace({
						payload: {
							disposition: 'closed',
							reason,
							type: 'end'
						},
						session,
						type: 'call.lifecycle'
					});
					await options.route.onCallEnd?.({
						api,
						context: options.context,
						disposition: 'closed',
						reason,
						session
					});
				}
			});
		},
		commitTurn: async (
			reason: VoiceEndOfTurnEvent['reason'] = 'manual'
		) =>
			runSerial('api.commitTurn', async () => {
				await commitTurnInternal(reason);
			}),
		complete: async (result?: unknown) =>
			runSerial('api.complete', async () => {
				await completeInternal(result);
			}),
		connect: async (nextSocket) =>
			runSerial('api.connect', async () => {
				await connectInternal(nextSocket);
			}),
		disconnect: async (event?: VoiceCloseEvent) =>
			runSerial('api.disconnect', async () => {
				await disconnectInternal(event);
			}),
		fail: async (error: unknown) =>
			runSerial('api.fail', async () => {
				await failInternal(error);
			}),
		escalate: async (input) =>
			runSerial('api.escalate', async () => {
				await escalateInternal(input);
			}),
		markNoAnswer: async (input) =>
			runSerial('api.markNoAnswer', async () => {
				await markNoAnswerInternal(input);
			}),
		markVoicemail: async (input) =>
			runSerial('api.markVoicemail', async () => {
				await markVoicemailInternal(input);
			}),
		receiveAudio: async (audio: ArrayBuffer | ArrayBufferView) =>
			runSerial('api.receiveAudio', async () => {
				await receiveAudioInternal(audio);
			}),
		transfer: async (input) =>
			runSerial('api.transfer', async () => {
				await transferInternal(input);
			}),
		snapshot: async () => runSerial('api.snapshot', async () => readSession())
	};

	return api;
};
