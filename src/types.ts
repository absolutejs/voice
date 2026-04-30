import type { SessionStore } from '@absolutejs/absolute';
import type {
	MediaWebRTCStatsCollector,
	MediaWebRTCStatsReport,
	MediaWebRTCStatsReportInput,
	MediaWebRTCStreamContinuityInput,
	MediaWebRTCStreamContinuityReport
} from '@absolutejs/media';
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
	VoiceOpsTaskStore
} from './ops';
import type { VoiceIntegrationSink } from './opsSinks';
import type {
	StoredVoiceCallReviewArtifact,
	VoiceCallReviewArtifact,
	VoiceCallReviewStore
} from './testing/review';
import type { VoiceTraceEventStore } from './trace';
import type { VoiceLiveOpsControlState } from './liveOps';

export type AudioFormat = {
	container: 'raw';
	encoding: 'alaw' | 'mulaw' | 'pcm_s16le';
	sampleRateHz: number;
	channels: 1 | 2;
};

export type AudioChunk = ArrayBuffer | ArrayBufferView;

export type VoiceLanguageStrategy =
	| {
			mode: 'auto-detect';
			allowedLanguages?: string[];
	  }
	| {
			mode: 'fixed';
			primaryLanguage: string;
			secondaryLanguages?: string[];
	  }
	| {
			mode: 'allow-switching';
			primaryLanguage?: string;
			secondaryLanguages: string[];
	  };

export type VoicePhraseHint = {
	text: string;
	aliases?: string[];
	boost?: number;
	metadata?: Record<string, unknown>;
};

export type VoiceCorrectionRiskTier = 'safe' | 'balanced' | 'risky';

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

export type Transcript = {
	id: string;
	text: string;
	isFinal: boolean;
	confidence?: number;
	language?: string;
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
	source: 'fallback' | 'primary';
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
	| 'fallback-empty'
	| 'primary-empty'
	| 'word-count-margin'
	| 'confidence-margin'
	| 'word-count-tiebreak'
	| 'kept-primary';

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
	trigger: 'empty-turn' | 'low-confidence' | 'empty-or-low-confidence' | 'always';
};

export type VoicePartialEvent = {
	type: 'partial';
	transcript: Transcript;
	receivedAt: number;
};

export type VoiceFinalEvent = {
	type: 'final';
	transcript: Transcript;
	receivedAt: number;
};

export type VoiceEndOfTurnEvent = {
	type: 'endOfTurn';
	reason: 'vendor' | 'silence' | 'manual';
	receivedAt: number;
};

export type VoiceErrorEvent = {
	type: 'error';
	error: Error;
	recoverable: boolean;
	code?: string;
};

export type VoiceCloseEvent = {
	type: 'close';
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
		handler: (payload: STTSessionEventMap[K]) => void | Promise<void>
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
	TOptions extends STTAdapterOpenOptions = STTAdapterOpenOptions
> = {
	kind: 'stt';
	open: (options: TOptions) => Promise<STTAdapterSession> | STTAdapterSession;
};

export type TTSAudioEvent = {
	type: 'audio';
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
		handler: (payload: TTSSessionEventMap[K]) => void | Promise<void>
	) => () => void;
	send: (text: string) => Promise<void>;
	close: (reason?: string) => Promise<void>;
};

export type TTSAdapterOpenOptions = {
	sessionId: string;
	lexicon?: VoiceLexiconEntry[];
	signal?: AbortSignal;
};

export type TTSAdapter<
	TOptions extends TTSAdapterOpenOptions = TTSAdapterOpenOptions
> = {
	kind: 'tts';
	open: (options: TOptions) => Promise<TTSAdapterSession> | TTSAdapterSession;
};

export type RealtimeSessionEventMap = STTSessionEventMap & {
	audio: TTSAudioEvent;
};

export type RealtimeAdapterSession = {
	on: <K extends keyof RealtimeSessionEventMap>(
		event: K,
		handler: (payload: RealtimeSessionEventMap[K]) => void | Promise<void>
	) => () => void;
	send: (input: AudioChunk | string) => Promise<void>;
	close: (reason?: string) => Promise<void>;
};

export type RealtimeAdapterOpenOptions = {
	sessionId: string;
	format: AudioFormat;
	languageStrategy?: VoiceLanguageStrategy;
	lexicon?: VoiceLexiconEntry[];
	phraseHints?: VoicePhraseHint[];
	signal?: AbortSignal;
};

export type RealtimeAdapter<
	TOptions extends RealtimeAdapterOpenOptions = RealtimeAdapterOpenOptions
> = {
	kind: 'realtime';
	open: (
		options: TOptions
	) => Promise<RealtimeAdapterSession> | RealtimeAdapterSession;
};

export type VoiceSessionStatus =
	| 'active'
	| 'reconnecting'
	| 'completed'
	| 'failed';

export type VoiceReconnectClientStatus =
	| 'idle'
	| 'reconnecting'
	| 'resumed'
	| 'exhausted';

export type VoiceReconnectClientState = {
	attempts: number;
	lastDisconnectAt?: number;
	lastResumedAt?: number;
	maxAttempts: number;
	nextAttemptAt?: number;
	status: VoiceReconnectClientStatus;
};

export type VoiceTurnRecord<TResult = unknown> = {
	id: string;
	text: string;
	quality?: VoiceTranscriptQuality;
	transcripts: Transcript[];
	assistantText?: string;
	committedAt: number;
	result?: TResult;
};

export type VoiceCostTelemetryConfig<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
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
	TResult = unknown
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
	| 'completed'
	| 'transferred'
	| 'escalated'
	| 'voicemail'
	| 'no-answer'
	| 'failed'
	| 'closed';

export type VoiceCallLifecycleEvent = {
	at: number;
	type: 'start' | 'end' | 'transfer' | 'escalation' | 'voicemail' | 'no-answer';
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
	| 'escalate'
	| 'no-answer'
	| 'transfer'
	| 'voicemail';

export type VoiceHandoffStatus = 'delivered' | 'failed' | 'skipped';

export type VoiceHandoffResult = {
	deliveredAt?: number;
	deliveredTo?: string;
	error?: string;
	metadata?: Record<string, unknown>;
	status: VoiceHandoffStatus;
};

export type VoiceHandoffDeliveryQueueStatus = VoiceHandoffStatus | 'pending';

export type StoredVoiceHandoffDelivery<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
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
	TDelivery extends StoredVoiceHandoffDelivery = StoredVoiceHandoffDelivery
> = {
	get: (id: string) => Promise<TDelivery | undefined> | TDelivery | undefined;
	list: () => Promise<TDelivery[]> | TDelivery[];
	remove: (id: string) => Promise<void> | void;
	set: (id: string, delivery: TDelivery) => Promise<void> | void;
};

export type VoiceHandoffInput<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
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
	TResult = unknown
> = {
	actions?: VoiceHandoffAction[];
	handoff: (
		input: VoiceHandoffInput<TContext, TSession, TResult>
	) => Promise<VoiceHandoffResult> | VoiceHandoffResult;
	id: string;
	kind?: string;
};

export type VoiceHandoffConfig<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	adapters: VoiceHandoffAdapter<TContext, TSession, TResult>[];
	deliveryQueue?: VoiceHandoffDeliveryStore<
		StoredVoiceHandoffDelivery<TContext, TSession, TResult>
	>;
	enqueueOnly?: boolean;
	failMode?: 'record' | 'throw';
};

export type VoiceSessionStore<
	TSession extends VoiceSessionRecord = VoiceSessionRecord
> = SessionStore<TSession, VoiceSessionSummary>;

export type VoiceLogger = {
	debug?: (message: string, meta?: Record<string, unknown>) => void;
	info?: (message: string, meta?: Record<string, unknown>) => void;
	warn?: (message: string, meta?: Record<string, unknown>) => void;
	error?: (message: string, meta?: Record<string, unknown>) => void;
};

export type VoiceReconnectConfig = {
	strategy?: 'resume-last-turn' | 'restart' | 'fail';
	timeout?: number;
	maxAttempts?: number;
};

export type VoiceRuntimePreset =
	| 'default'
	| 'chat'
	| 'guided-intake'
	| 'dictation'
	| 'noisy-room'
	| 'pstn-balanced'
	| 'pstn-fast'
	| 'reliability';

export type VoiceSTTLifecycle = 'continuous' | 'turn-scoped';

export type VoiceTurnProfile = 'fast' | 'balanced' | 'long-form';

export type VoiceTurnQualityProfile =
	| 'general'
	| 'accent-heavy'
	| 'noisy-room'
	| 'short-command';

export type VoiceTurnFallbackTrigger =
	| 'empty-turn'
	| 'low-confidence'
	| 'empty-or-low-confidence'
	| 'always';

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
	silenceMs?: number;
	speechThreshold?: number;
	transcriptStabilityMs?: number;
};

export type VoiceResolvedTurnDetectionConfig = {
	qualityProfile: VoiceTurnQualityProfile;
	profile: VoiceTurnProfile;
	silenceMs: number;
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
};

export type VoiceSessionHandle<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	id: string;
	connect: (socket: VoiceSocket) => Promise<void>;
	receiveAudio: (audio: AudioChunk) => Promise<void>;
	commitTurn: (reason?: VoiceEndOfTurnEvent['reason']) => Promise<void>;
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
	}) => Promise<void>;
	close: (reason?: string) => Promise<void>;
	snapshot: () => Promise<TSession>;
};

export type VoiceRouteResult<TResult = unknown> = {
	complete?: boolean;
	result?: TResult;
	assistantText?: string;
	transfer?: {
		metadata?: Record<string, unknown>;
		reason?: string;
		target: string;
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
	TResult = unknown
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

export type VoicePhraseHintResolver<
	TContext = unknown
> = (input: {
	context: TContext;
	scenarioId?: string;
	sessionId: string;
}) => Promise<VoicePhraseHint[] | void> | VoicePhraseHint[] | void;

export type VoiceLexiconResolver<
	TContext = unknown
> = (input: {
	context: TContext;
	scenarioId?: string;
	sessionId: string;
}) => Promise<VoiceLexiconEntry[] | void> | VoiceLexiconEntry[] | void;

export type VoiceOnTurnObjectHandler<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = (input: {
	context: TContext;
	liveOps?: {
		control: VoiceLiveOpsControlState;
		injectedInstruction?: string;
	};
	session: TSession;
	turn: VoiceTurnRecord;
	api: VoiceSessionHandle<TContext, TSession, TResult>;
}) =>
	| Promise<VoiceRouteResult<TResult> | void>
	| VoiceRouteResult<TResult>
	| void;

export type VoiceOnTurnHandler<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> =
	| VoiceOnTurnObjectHandler<TContext, TSession, TResult>
	| ((
			session: TSession,
			turn: VoiceTurnRecord,
			api: VoiceSessionHandle<TContext, TSession, TResult>,
			context: TContext
	  ) =>
			| Promise<VoiceRouteResult<TResult> | void>
			| VoiceRouteResult<TResult>
			| void);

export type VoiceRouteConfig<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
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
	correctTurn?: VoiceTurnCorrectionHandler<TContext, TSession, TResult>;
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
	TResult = unknown
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
		| Promise<
				| VoiceCallReviewArtifact
				| StoredVoiceCallReviewArtifact
				| void
		  >
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
		| Promise<Omit<VoiceOpsTask, 'id'> | VoiceOpsTask | StoredVoiceOpsTask | null | void>
		| Omit<VoiceOpsTask, 'id'>
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
	}) =>
		| Promise<VoiceOpsTaskPolicy | void>
		| VoiceOpsTaskPolicy
		| void;
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
		sessionId: string
	) =>
		| Promise<VoiceLiveOpsControlState | null | undefined>
		| VoiceLiveOpsControlState
		| null
		| undefined;
};

export type VoiceNormalizedRouteConfig<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = Omit<VoiceRouteConfig<TContext, TSession, TResult>, 'onTurn'> & {
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

export type VoicePluginConfig<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	costTelemetry?: VoiceCostTelemetryConfig<TContext, TSession, TResult>;
	path: string;
	languageStrategy?: VoiceLanguageStrategy;
	lexicon?: VoiceLexiconEntry[] | VoiceLexiconResolver<TContext>;
	phraseHints?: VoicePhraseHint[] | VoicePhraseHintResolver<TContext>;
	preset?: VoiceRuntimePreset;
	stt?: STTAdapter;
	sttFallback?: VoiceSTTFallbackConfig;
	sttLifecycle?: VoiceSTTLifecycle;
	realtime?: RealtimeAdapter;
	realtimeInputFormat?: AudioFormat;
	tts?: TTSAdapter;
	session: VoiceSessionStore<NoInfer<TSession>>;
	reconnect?: VoiceReconnectConfig;
	turnDetection?: VoiceTurnDetectionConfig;
	audioConditioning?: VoiceAudioConditioningConfig;
	logger?: VoiceLogger;
	htmx?: boolean | VoiceHTMXConfig<TSession, NoInfer<TResult>>;
	handoff?: VoiceHandoffConfig<TContext, TSession, TResult>;
	ops?: VoiceRuntimeOpsConfig<TContext, TSession, TResult>;
	liveOps?: VoiceLiveOpsRuntimeConfig;
	trace?: VoiceTraceEventStore;
} & VoiceRouteConfig<TContext, TSession, TResult>;

export type CreateVoiceSessionOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	costTelemetry?: VoiceCostTelemetryConfig<TContext, TSession, TResult>;
	id: string;
	context: TContext;
	socket: VoiceSocket;
	stt?: STTAdapter;
	realtime?: RealtimeAdapter;
	realtimeInputFormat?: AudioFormat;
	tts?: TTSAdapter;
	languageStrategy?: VoiceLanguageStrategy;
	lexicon?: VoiceLexiconEntry[];
	sttFallback?: VoiceResolvedSTTFallbackConfig;
	store: VoiceSessionStore<TSession>;
	trace?: VoiceTraceEventStore;
	reconnect: Required<VoiceReconnectConfig>;
	phraseHints?: VoicePhraseHint[];
	scenarioId?: string;
	sttLifecycle: VoiceSTTLifecycle;
	turnDetection: VoiceResolvedTurnDetectionConfig;
	audioConditioning?: VoiceResolvedAudioConditioningConfig;
	handoff?: VoiceHandoffConfig<TContext, TSession, TResult>;
	liveOps?: VoiceLiveOpsRuntimeConfig;
	route: VoiceNormalizedRouteConfig<TContext, TSession, TResult>;
	logger?: VoiceLogger;
};

export type CreateVoiceSession = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: CreateVoiceSessionOptions<TContext, TSession, TResult>
) => VoiceSessionHandle<TContext, TSession, TResult>;

export type VoiceClientStartMessage = {
	type: 'start';
	sessionId?: string;
	scenarioId?: string;
};

export type VoiceClientEndTurnMessage = {
	type: 'end_turn';
};

export type VoiceClientCloseMessage = {
	type: 'close';
	reason?: string;
};

export type VoiceClientCallControlMessage = {
	type: 'call_control';
	action:
		| 'complete'
		| 'escalate'
		| 'no-answer'
		| 'transfer'
		| 'voicemail';
	metadata?: Record<string, unknown>;
	reason?: string;
	target?: string;
};

export type VoiceClientPingMessage = {
	type: 'ping';
};

export type VoiceClientMessage =
	| VoiceClientStartMessage
	| VoiceClientEndTurnMessage
	| VoiceClientCloseMessage
	| VoiceClientCallControlMessage
	| VoiceClientPingMessage;

export type VoiceServerSessionMessage = {
	type: 'session';
	sessionId: string;
	status: VoiceSessionStatus;
	scenarioId?: string;
};

export type VoiceServerReplayMessage<TResult = unknown> = {
	type: 'replay';
	assistantTexts: string[];
	call?: VoiceCallLifecycleState;
	partial: string;
	scenarioId?: string;
	sessionId: string;
	status: VoiceSessionStatus;
	turns: VoiceTurnRecord<TResult>[];
};

export type VoiceServerPartialMessage = {
	type: 'partial';
	transcript: Transcript;
};

export type VoiceServerFinalMessage = {
	type: 'final';
	transcript: Transcript;
};

export type VoiceServerTurnMessage<TResult = unknown> = {
	type: 'turn';
	turn: VoiceTurnRecord<TResult>;
};

export type VoiceServerAssistantMessage = {
	type: 'assistant';
	text: string;
	turnId?: string;
};

export type VoiceServerAudioMessage = {
	type: 'audio';
	chunkBase64: string;
	format: AudioFormat;
	receivedAt: number;
	turnId?: string;
};

export type VoiceServerCompleteMessage = {
	type: 'complete';
	sessionId: string;
};

export type VoiceServerCallLifecycleMessage = {
	type: 'call_lifecycle';
	event: VoiceCallLifecycleEvent;
	sessionId: string;
};

export type VoiceServerErrorMessage = {
	type: 'error';
	message: string;
	recoverable?: boolean;
};

export type VoiceServerPongMessage = {
	type: 'pong';
};

export type VoiceServerConnectionMessage = {
	type: 'connection';
	reconnect: VoiceReconnectClientState;
};

export type VoiceServerMessage<TResult = unknown> =
	| VoiceServerSessionMessage
	| VoiceServerReplayMessage<TResult>
	| VoiceServerPartialMessage
	| VoiceServerFinalMessage
	| VoiceServerTurnMessage<TResult>
	| VoiceServerAssistantMessage
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
	'peerConnection'
> & {
	fetch?: typeof fetch;
	getPeerConnection?:
		| (() => MediaWebRTCStatsCollector | null | undefined)
		| (() => Promise<MediaWebRTCStatsCollector | null | undefined>);
	getScenarioId?: () => string | null | undefined;
	getSessionId?: () => string | null | undefined;
	intervalMs?: number;
	continuity?: false | Omit<MediaWebRTCStreamContinuityInput, 'previousStats' | 'stats'>;
	onError?: (error: unknown) => void;
	onReport?: (payload: VoiceBrowserMediaReportPayload) => void;
	path?: string;
	peerConnection?: MediaWebRTCStatsCollector;
};

export type VoiceCaptureOptions = {
	channelCount?: 1 | 2;
	onAudio?: (
		audio: Uint8Array | ArrayBuffer,
		sendAudio: (audio: Uint8Array | ArrayBuffer) => void
	) => void;
	onLevel?: (level: number) => void;
	sampleRateHz?: number;
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
	| 'input-level'
	| 'manual-audio'
	| 'manual-interrupt'
	| 'partial-transcript';

export type VoiceBargeInMonitorEvent = {
	at: number;
	id: string;
	latencyMs?: number;
	playbackStopLatencyMs?: number;
	reason: VoiceBargeInTriggerReason;
	sessionId?: string | null;
	status: 'requested' | 'stopped' | 'skipped';
	thresholdMs?: number;
};

export type VoiceBargeInMonitorSnapshot = {
	averageLatencyMs?: number;
	events: VoiceBargeInMonitorEvent[];
	failed: number;
	lastEvent?: VoiceBargeInMonitorEvent;
	passed: number;
	status: 'empty' | 'fail' | 'pass' | 'warn';
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
};

export type VoiceDuplexControllerOptions = VoiceControllerOptions & {
	audioPlayer?: VoiceAudioPlayerOptions;
	bargeIn?: VoiceBargeInOptions;
};

export type VoiceSTTRoutingGoal = 'best' | 'low-cost';

export type VoiceSTTRoutingCorrectionMode = 'generic' | 'none' | 'risky-turn';

export type VoiceSTTRoutingStrategy = {
	benchmarkSessionTarget: 'deepgram-corrected' | 'deepgram-flux';
	correctionMode: VoiceSTTRoutingCorrectionMode;
	goal: VoiceSTTRoutingGoal;
	notes: string[];
	preset: VoiceRuntimePreset;
	sttLifecycle: VoiceSTTLifecycle;
};

export type VoiceHTMXRenderInput<
	TResult = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord
> = {
	assistantTexts: string[];
	partial: string;
	scenarioId?: string;
	result?: TResult;
	session?: TSession;
	sessionId?: string;
	status: VoiceSessionStatus | 'idle';
	turnCount: number;
	turns: VoiceTurnRecord<TResult>[];
};

export type VoiceHTMXRenderConfig<
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	metrics?: (
		input: VoiceHTMXRenderInput<TResult, TSession>
	) => string;
	status?: (
		input: VoiceHTMXRenderInput<TResult, TSession>
	) => string;
	turns?: (
		input: VoiceHTMXRenderInput<TResult, TSession>
	) => string;
	assistant?: (
		input: VoiceHTMXRenderInput<TResult, TSession>
	) => string;
	result?: (
		input: VoiceHTMXRenderInput<TResult, TSession>
	) => string;
	emptyState?: (
		kind: keyof VoiceHTMXTargets,
		input: VoiceHTMXRenderInput<TResult, TSession>
	) => string;
};

export type VoiceHTMXRenderer<
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
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
	TResult = unknown
> = VoiceHTMXRenderConfig<TSession, TResult> & {
	bootstrapRoute?: string;
	route?: string;
	targets?: Partial<VoiceHTMXTargets>;
};

export type VoiceHTMXConfig<
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> =
	| VoiceHTMXRenderer<TSession, TResult>
	| VoiceHTMXOptions<TSession, TResult>;

export type VoiceStreamState<TResult = unknown> = {
	call: VoiceCallLifecycleState | null;
	sessionId: string | null;
	scenarioId: string | null;
	status: VoiceSessionStatus | 'idle';
	reconnect: VoiceReconnectClientState;
	partial: string;
	turns: VoiceTurnRecord<TResult>[];
	assistantTexts: string[];
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
	callControl: (message: Omit<VoiceClientCallControlMessage, 'type'>) => void;
	close: () => void;
	start: (input?: {
		scenarioId?: string;
		sessionId?: string;
	}) => Promise<void>;
	endTurn: () => void;
	error: string | null;
	getServerSnapshot: () => VoiceStreamState<TResult>;
	getSnapshot: () => VoiceStreamState<TResult>;
	isConnected: boolean;
	partial: string;
	reconnect: VoiceReconnectClientState;
	sendAudio: (audio: Uint8Array | ArrayBuffer) => void;
	sessionId: string | null;
	scenarioId: string | null;
	status: VoiceSessionStatus | 'idle';
	subscribe: (subscriber: () => void) => () => void;
	turns: VoiceTurnRecord<TResult>[];
	assistantTexts: string[];
	assistantAudio: Array<{
		chunk: Uint8Array;
		format: AudioFormat;
		receivedAt: number;
		turnId?: string;
	}>;
};

export type VoiceControllerState<TResult = unknown> = VoiceStreamState<TResult> & {
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
	assistantAudio: VoiceStreamState['assistantAudio'];
	subscribe: (subscriber: () => void) => () => void;
};

export type VoiceAudioPlayer = {
	close: () => Promise<void>;
	error: string | null;
	getSnapshot: () => VoiceAudioPlayerState;
	activeSourceCount: number;
	isActive: boolean;
	isPlaying: boolean;
	interrupt: () => Promise<void>;
	lastInterruptLatencyMs?: number;
	lastPlaybackStopLatencyMs?: number;
	pause: () => Promise<void>;
	processedChunkCount: number;
	queuedChunkCount: number;
	start: () => Promise<void>;
	subscribe: (subscriber: () => void) => () => void;
};

export type VoiceBargeInBinding = {
	close: () => void;
	handleLevel: (level: number) => void;
	sendAudio: (audio: Uint8Array | ArrayBuffer) => void;
};

export type VoiceController<TResult = unknown> = {
	bindHTMX: (options: VoiceHTMXBindingOptions) => () => void;
	call: VoiceCallLifecycleState | null;
	callControl: (message: Omit<VoiceClientCallControlMessage, 'type'>) => void;
	close: () => void;
	endTurn: () => void;
	start: (input?: {
		scenarioId?: string;
		sessionId?: string;
	}) => Promise<void>;
	error: string | null;
	getServerSnapshot: () => VoiceControllerState<TResult>;
	getSnapshot: () => VoiceControllerState<TResult>;
	isConnected: boolean;
	isRecording: boolean;
	partial: string;
	reconnect: VoiceReconnectClientState;
	recordingError: string | null;
	sendAudio: (audio: Uint8Array | ArrayBuffer) => void;
	sessionId: string | null;
	scenarioId: string | null;
	startRecording: () => Promise<void>;
	status: VoiceSessionStatus | 'idle';
	stopRecording: () => void;
	subscribe: (subscriber: () => void) => () => void;
	toggleRecording: () => Promise<void>;
	turns: VoiceTurnRecord<TResult>[];
	assistantTexts: string[];
	assistantAudio: Array<{
		chunk: Uint8Array;
		format: AudioFormat;
		receivedAt: number;
		turnId?: string;
	}>;
};

export type VoiceDuplexController<TResult = unknown> = VoiceController<TResult> & {
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
			type: 'session';
			sessionId: string;
			scenarioId?: string;
			status: VoiceSessionStatus;
	  }
	| {
			type: 'replay';
			assistantTexts: string[];
			call?: VoiceCallLifecycleState;
			partial: string;
			scenarioId?: string;
			sessionId: string;
			status: VoiceSessionStatus;
			turns: VoiceTurnRecord<TResult>[];
	  }
	| {
			type: 'call_lifecycle';
			event: VoiceCallLifecycleEvent;
			sessionId: string;
	  }
	| {
			type: 'partial';
			transcript: Transcript;
	  }
	| {
			type: 'final';
			transcript: Transcript;
	  }
	| {
			type: 'turn';
			turn: VoiceTurnRecord<TResult>;
	  }
	| {
			type: 'assistant';
			text: string;
	  }
	| {
			type: 'audio';
			chunk: Uint8Array;
			format: AudioFormat;
			receivedAt: number;
			turnId?: string;
	  }
	| {
			type: 'complete';
			sessionId: string;
	  }
	| {
			type: 'error';
			message: string;
	  }
	| {
			type: 'connected';
	  }
	| {
			type: 'connection';
			reconnect: VoiceReconnectClientState;
	  }
	| {
			type: 'disconnected';
	  };
