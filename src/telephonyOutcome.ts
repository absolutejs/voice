import { Elysia } from 'elysia';
import type {
	VoiceCallDisposition,
	VoiceRouteResult,
	VoiceSessionHandle,
	VoiceSessionRecord
} from './types';

export type VoiceTelephonyOutcomeAction =
	| 'complete'
	| 'escalate'
	| 'ignore'
	| 'no-answer'
	| 'transfer'
	| 'voicemail';

export type VoiceTelephonyOutcomeProviderEvent = {
	answeredBy?: string;
	durationMs?: number;
	from?: string;
	metadata?: Record<string, unknown>;
	provider?: string;
	reason?: string;
	sipCode?: number;
	status?: string;
	target?: string;
	to?: string;
};

export type VoiceTelephonyOutcomeDecision = {
	action: VoiceTelephonyOutcomeAction;
	confidence: 'high' | 'low' | 'medium';
	disposition?: VoiceCallDisposition;
	metadata?: Record<string, unknown>;
	reason?: string;
	source: 'answered-by' | 'duration' | 'explicit-target' | 'policy' | 'sip' | 'status';
	target?: string;
};

export type VoiceTelephonyOutcomeStatusDecision =
	| VoiceTelephonyOutcomeAction
	| Omit<VoiceTelephonyOutcomeDecision, 'confidence' | 'source'> & {
			confidence?: VoiceTelephonyOutcomeDecision['confidence'];
			source?: VoiceTelephonyOutcomeDecision['source'];
	  };

export type VoiceTelephonyOutcomePolicy = {
	completedStatuses?: string[];
	escalationStatuses?: string[];
	failedAsNoAnswer?: boolean;
	failedStatuses?: string[];
	includeProviderPayload?: boolean;
	machineDetectionVoicemailValues?: string[];
	metadata?: Record<string, unknown>;
	minAnsweredDurationMs?: number;
	noAnswerOnZeroDuration?: boolean;
	noAnswerSipCodes?: number[];
	noAnswerStatuses?: string[];
	statusMap?: Record<string, VoiceTelephonyOutcomeStatusDecision>;
	transferStatuses?: string[];
	transferTarget?: string | ((event: VoiceTelephonyOutcomeProviderEvent) => string | undefined);
	voicemailStatuses?: string[];
};

export type VoiceTelephonyOutcomeRouteResult<TResult = unknown> =
	VoiceRouteResult<TResult>;

export type VoiceTelephonyWebhookProvider =
	| 'generic'
	| 'plivo'
	| 'telnyx'
	| 'twilio';

export type VoiceTelephonyWebhookParseInput = {
	body: unknown;
	headers: Headers;
	provider: VoiceTelephonyWebhookProvider;
	query: Record<string, unknown>;
	request: Request;
};

export type VoiceTelephonyWebhookDecision<TResult = unknown> = {
	applied: boolean;
	decision: VoiceTelephonyOutcomeDecision;
	duplicate?: boolean;
	event: VoiceTelephonyOutcomeProviderEvent;
	idempotencyKey?: string;
	routeResult: VoiceTelephonyOutcomeRouteResult<TResult>;
	sessionId?: string;
};

export type StoredVoiceTelephonyWebhookDecision<TResult = unknown> =
	VoiceTelephonyWebhookDecision<TResult> & {
		createdAt: number;
		updatedAt: number;
	};

export type VoiceTelephonyWebhookNormalizationEvidenceDecision = {
	action?: VoiceTelephonyOutcomeAction | string;
	applied?: boolean;
	decision?: {
		action?: VoiceTelephonyOutcomeAction | string;
		disposition?: VoiceCallDisposition | string;
		source?: VoiceTelephonyOutcomeDecision['source'] | string;
	};
	disposition?: VoiceCallDisposition | string;
	duplicate?: boolean;
	campaignOutcome?: unknown;
	event?: VoiceTelephonyOutcomeProviderEvent;
	idempotencyKey?: string;
	provider?: VoiceTelephonyWebhookProvider | string;
	routeResult?: unknown;
	sessionId?: string;
	source?: VoiceTelephonyOutcomeDecision['source'] | string;
};

export type VoiceTelephonyWebhookVerificationEvidenceAttempt = {
	decisions?: number;
	provider?: VoiceTelephonyWebhookProvider | string;
	rejected?: boolean;
	replayRejected?: boolean;
	sideEffects?: number;
	status?: number;
	verification?: VoiceTelephonyWebhookVerificationResult;
};

export type VoiceTelephonyWebhookNormalizationEvidenceInput = {
	decisions?: VoiceTelephonyWebhookNormalizationEvidenceDecision[];
	maxMissingSessionIds?: number;
	minApplied?: number;
	minDecisions?: number;
	minDuplicateIdempotencyKeys?: number;
	minDuplicates?: number;
	maxDuplicateCampaignOutcomesApplied?: number;
	maxRejectedVerificationSideEffects?: number;
	minRejectedVerificationAttempts?: number;
	minReplayRejectedVerificationAttempts?: number;
	requiredActions?: VoiceTelephonyOutcomeAction[];
	requiredDispositions?: VoiceCallDisposition[];
	requiredDuplicateProviders?: VoiceTelephonyWebhookProvider[];
	requiredProviders?: VoiceTelephonyWebhookProvider[];
	requiredReplayRejectedVerificationProviders?: VoiceTelephonyWebhookProvider[];
	requiredRejectedVerificationProviders?: VoiceTelephonyWebhookProvider[];
	requireRouteResults?: boolean;
	verificationAttempts?: VoiceTelephonyWebhookVerificationEvidenceAttempt[];
};

export type VoiceTelephonyWebhookNormalizationEvidenceReport = {
	actions: VoiceTelephonyOutcomeAction[];
	applied: number;
	decisions: number;
	dispositions: VoiceCallDisposition[];
	duplicateCampaignOutcomesApplied: number;
	duplicateIdempotencyKeys: number;
	duplicateOutcomeReasons: string[];
	duplicateProviders: VoiceTelephonyWebhookProvider[];
	duplicates: number;
	issues: string[];
	missingSessionIds: number;
	ok: boolean;
	providers: VoiceTelephonyWebhookProvider[];
	rejectedVerificationAttempts: number;
	rejectedVerificationProviders: VoiceTelephonyWebhookProvider[];
	rejectedVerificationSideEffects: number;
	replayRejectedVerificationAttempts: number;
	replayRejectedVerificationProviders: VoiceTelephonyWebhookProvider[];
	routeResults: number;
	sources: string[];
	verificationAttempts: number;
};

export type VoiceTelephonyWebhookIdempotencyStore<
	TResult = unknown
> = {
	get: (
		key: string
	) =>
		| Promise<StoredVoiceTelephonyWebhookDecision<TResult> | undefined>
		| StoredVoiceTelephonyWebhookDecision<TResult>
		| undefined;
	set: (
		key: string,
		decision: StoredVoiceTelephonyWebhookDecision<TResult>
	) => Promise<void> | void;
};

export type VoiceTelephonyWebhookVerificationResult =
	| {
			ok: true;
	  }
	| {
			ok: false;
			reason:
				| 'invalid-signature'
				| 'missing-secret'
				| 'missing-signature'
				| 'unsupported-provider';
	  };

export type VoiceTelephonyWebhookHandlerOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	apply?: boolean | ((input: VoiceTelephonyWebhookDecision<TResult>) => boolean);
	context?: TContext;
	getSessionHandle?: (input: {
		context: TContext;
		decision: VoiceTelephonyOutcomeDecision;
		event: VoiceTelephonyOutcomeProviderEvent;
		request: Request;
		sessionId?: string;
	}) =>
		| Promise<VoiceSessionHandle<TContext, TSession, TResult> | undefined>
		| VoiceSessionHandle<TContext, TSession, TResult>
		| undefined;
	idempotency?: {
		enabled?: boolean;
		key?: (input: {
			body: unknown;
			event: VoiceTelephonyOutcomeProviderEvent;
			provider: VoiceTelephonyWebhookProvider;
			query: Record<string, unknown>;
			request: Request;
			sessionId?: string;
		}) => Promise<string | undefined> | string | undefined;
		store?: VoiceTelephonyWebhookIdempotencyStore<TResult>;
	};
	onDecision?: (input: VoiceTelephonyWebhookDecision<TResult> & {
		context: TContext;
		request: Request;
	}) => Promise<void> | void;
	parse?: (
		input: VoiceTelephonyWebhookParseInput
	) =>
		| Promise<VoiceTelephonyOutcomeProviderEvent>
		| VoiceTelephonyOutcomeProviderEvent;
	policy?: VoiceTelephonyOutcomePolicy;
	provider?: VoiceTelephonyWebhookProvider;
	requireVerification?: boolean;
	resolveSessionId?: (input: {
		body: unknown;
		event: VoiceTelephonyOutcomeProviderEvent;
		query: Record<string, unknown>;
		request: Request;
	}) => Promise<string | undefined> | string | undefined;
	result?: TResult | ((input: {
		decision: VoiceTelephonyOutcomeDecision;
		event: VoiceTelephonyOutcomeProviderEvent;
		sessionId?: string;
	}) => Promise<TResult | undefined> | TResult | undefined);
	signingSecret?: string;
	verificationUrl?:
		| string
		| ((input: { query: Record<string, unknown>; request: Request }) => string);
	verify?: (input: {
		body: unknown;
		headers: Headers;
		provider: VoiceTelephonyWebhookProvider;
		query: Record<string, unknown>;
		rawBody: string;
		request: Request;
	}) =>
		| Promise<VoiceTelephonyWebhookVerificationResult>
		| VoiceTelephonyWebhookVerificationResult;
};

export type VoiceTelephonyWebhookRoutesOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = VoiceTelephonyWebhookHandlerOptions<TContext, TSession, TResult> & {
	name?: string;
	path?: string;
};

const DEFAULT_COMPLETED_STATUSES = [
	'answered',
	'completed',
	'complete',
	'connected',
	'in-progress',
	'live'
];

const DEFAULT_NO_ANSWER_STATUSES = [
	'busy',
	'canceled',
	'cancelled',
	'failed',
	'no-answer',
	'no_answer',
	'not-answered',
	'ring-no-answer',
	'timeout',
	'unanswered'
];

const DEFAULT_VOICEMAIL_STATUSES = [
	'answering-machine',
	'machine',
	'voicemail',
	'voice-mail'
];

const DEFAULT_TRANSFER_STATUSES = ['bridged', 'forwarded', 'transferred'];

const DEFAULT_ESCALATION_STATUSES = ['escalated', 'human-required', 'operator'];

const DEFAULT_FAILED_STATUSES = ['busy', 'failed', 'no-answer'];

const DEFAULT_MACHINE_VOICEMAIL_VALUES = [
	'answering-machine',
	'fax',
	'machine',
	'machine-end-beep',
	'machine-end-other',
	'machine-start',
	'voicemail'
];

const DEFAULT_NO_ANSWER_SIP_CODES = [408, 480, 486, 487, 603];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const uniqueSorted = <Value extends string>(values: Value[]): Value[] =>
	Array.from(new Set(values)).sort();

const findMissing = <Value extends string>(
	values: Value[],
	required: Value[] | undefined
): Value[] => {
	if (!required?.length) {
		return [];
	}
	const valueSet = new Set(values);
	return required.filter((value) => !valueSet.has(value));
};

export class VoiceTelephonyWebhookVerificationError extends Error {
	result: VoiceTelephonyWebhookVerificationResult;

	constructor(result: VoiceTelephonyWebhookVerificationResult) {
		super(result.ok ? 'telephony webhook verified' : result.reason);
		this.name = 'VoiceTelephonyWebhookVerificationError';
		this.result = result;
	}
}

export const createMemoryVoiceTelephonyWebhookIdempotencyStore = <
	TResult = unknown
>(): VoiceTelephonyWebhookIdempotencyStore<TResult> => {
	const decisions = new Map<string, StoredVoiceTelephonyWebhookDecision<TResult>>();

	return {
		get: (key) => decisions.get(key),
		set: (key, decision) => {
			decisions.set(key, decision);
		}
	};
};

const isTelephonyWebhookProvider = (
	value: unknown
): value is VoiceTelephonyWebhookProvider =>
	value === 'generic' ||
	value === 'plivo' ||
	value === 'telnyx' ||
	value === 'twilio';

const isTelephonyOutcomeAction = (
	value: unknown
): value is VoiceTelephonyOutcomeAction =>
	value === 'complete' ||
	value === 'escalate' ||
	value === 'ignore' ||
	value === 'no-answer' ||
	value === 'transfer' ||
	value === 'voicemail';

const isCallDisposition = (value: unknown): value is VoiceCallDisposition =>
	value === 'completed' ||
	value === 'escalated' ||
	value === 'failed' ||
	value === 'no-answer' ||
	value === 'transferred' ||
	value === 'voicemail';

export const evaluateVoiceTelephonyWebhookNormalizationEvidence = (
	input: VoiceTelephonyWebhookNormalizationEvidenceInput = {}
): VoiceTelephonyWebhookNormalizationEvidenceReport => {
	const issues: string[] = [];
	const decisions = input.decisions ?? [];
	const verificationAttempts = input.verificationAttempts ?? [];
	const actions = uniqueSorted(
		decisions
			.map((decision) => decision.decision?.action ?? decision.action)
			.filter(isTelephonyOutcomeAction)
	);
	const dispositions = uniqueSorted(
		decisions
			.map((decision) => decision.decision?.disposition ?? decision.disposition)
			.filter(isCallDisposition)
	);
	const providers = uniqueSorted(
		decisions
			.map((decision) => decision.provider ?? decision.event?.provider)
			.filter(isTelephonyWebhookProvider)
	);
	const sources = uniqueSorted(
		decisions
			.map((decision) => decision.decision?.source ?? decision.source)
			.filter((source): source is string => typeof source === 'string')
	);
	const applied = decisions.filter((decision) => decision.applied === true).length;
	const duplicateDecisions = decisions.filter(
		(decision) => decision.duplicate === true
	);
	const duplicateProviders = uniqueSorted(
		duplicateDecisions
			.map((decision) => decision.provider ?? decision.event?.provider)
			.filter(isTelephonyWebhookProvider)
	);
	const duplicateIdempotencyKeys = new Set(
		duplicateDecisions
			.map((decision) => decision.idempotencyKey)
			.filter((key): key is string => typeof key === 'string' && key.length > 0)
	).size;
	const duplicateCampaignOutcomesApplied = duplicateDecisions.filter(
		(decision) =>
			isRecord(decision.campaignOutcome) &&
			decision.campaignOutcome.applied === true
	).length;
	const duplicateOutcomeReasons = uniqueSorted(
		duplicateDecisions
			.map((decision) =>
				isRecord(decision.campaignOutcome)
					? decision.campaignOutcome.reason
					: undefined
			)
			.filter((reason): reason is string => typeof reason === 'string')
	);
	const routeResults = decisions.filter((decision) =>
		isRecord(decision.routeResult)
	).length;
	const missingSessionIds = decisions.filter(
		(decision) => !decision.sessionId
	).length;
	const rejectedVerificationAttempts = verificationAttempts.filter(
		(attempt) =>
			attempt.rejected === true ||
			attempt.status === 401 ||
			(attempt.verification?.ok === false &&
				attempt.verification.reason === 'invalid-signature')
	);
	const rejectedVerificationProviders = uniqueSorted(
		rejectedVerificationAttempts
			.map((attempt) => attempt.provider)
			.filter(isTelephonyWebhookProvider)
	);
	const replayRejectedVerificationAttempts = rejectedVerificationAttempts.filter(
		(attempt) => attempt.replayRejected === true
	);
	const replayRejectedVerificationProviders = uniqueSorted(
		replayRejectedVerificationAttempts
			.map((attempt) => attempt.provider)
			.filter(isTelephonyWebhookProvider)
	);
	const rejectedVerificationSideEffects = rejectedVerificationAttempts.reduce(
		(total, attempt) => total + Math.max(0, attempt.sideEffects ?? 0),
		0
	);

	if (
		input.minDecisions !== undefined &&
		decisions.length < input.minDecisions
	) {
		issues.push(
			`Expected at least ${String(input.minDecisions)} telephony webhook decision(s), found ${String(decisions.length)}.`
		);
	}
	if (input.minApplied !== undefined && applied < input.minApplied) {
		issues.push(
			`Expected at least ${String(input.minApplied)} applied telephony webhook decision(s), found ${String(applied)}.`
		);
	}
	if (
		input.minDuplicates !== undefined &&
		duplicateDecisions.length < input.minDuplicates
	) {
		issues.push(
			`Expected at least ${String(input.minDuplicates)} duplicate telephony webhook decision(s), found ${String(duplicateDecisions.length)}.`
		);
	}
	if (
		input.minDuplicateIdempotencyKeys !== undefined &&
		duplicateIdempotencyKeys < input.minDuplicateIdempotencyKeys
	) {
		issues.push(
			`Expected at least ${String(input.minDuplicateIdempotencyKeys)} duplicate telephony webhook idempotency key(s), found ${String(duplicateIdempotencyKeys)}.`
		);
	}
	if (
		input.maxDuplicateCampaignOutcomesApplied !== undefined &&
		duplicateCampaignOutcomesApplied >
			input.maxDuplicateCampaignOutcomesApplied
	) {
		issues.push(
			`Expected at most ${String(input.maxDuplicateCampaignOutcomesApplied)} duplicate telephony webhook campaign outcome application(s), found ${String(duplicateCampaignOutcomesApplied)}.`
		);
	}
	if (
		input.minRejectedVerificationAttempts !== undefined &&
		rejectedVerificationAttempts.length <
			input.minRejectedVerificationAttempts
	) {
		issues.push(
			`Expected at least ${String(input.minRejectedVerificationAttempts)} rejected telephony webhook verification attempt(s), found ${String(rejectedVerificationAttempts.length)}.`
		);
	}
	if (
		input.maxRejectedVerificationSideEffects !== undefined &&
		rejectedVerificationSideEffects >
			input.maxRejectedVerificationSideEffects
	) {
		issues.push(
			`Expected at most ${String(input.maxRejectedVerificationSideEffects)} rejected telephony webhook side effect(s), found ${String(rejectedVerificationSideEffects)}.`
		);
	}
	if (
		input.minReplayRejectedVerificationAttempts !== undefined &&
		replayRejectedVerificationAttempts.length <
			input.minReplayRejectedVerificationAttempts
	) {
		issues.push(
			`Expected at least ${String(input.minReplayRejectedVerificationAttempts)} replay-rejected telephony webhook verification attempt(s), found ${String(replayRejectedVerificationAttempts.length)}.`
		);
	}
	if (
		input.maxMissingSessionIds !== undefined &&
		missingSessionIds > input.maxMissingSessionIds
	) {
		issues.push(
			`Expected at most ${String(input.maxMissingSessionIds)} telephony webhook decision(s) without sessionId, found ${String(missingSessionIds)}.`
		);
	}
	if (input.requireRouteResults && routeResults < decisions.length) {
		issues.push(
			`Expected every telephony webhook decision to include a route result, found ${String(routeResults)} of ${String(decisions.length)}.`
		);
	}
	for (const provider of findMissing(providers, input.requiredProviders)) {
		issues.push(`Missing telephony webhook provider: ${provider}.`);
	}
	for (const provider of findMissing(
		duplicateProviders,
		input.requiredDuplicateProviders
	)) {
		issues.push(`Missing duplicate telephony webhook provider: ${provider}.`);
	}
	for (const provider of findMissing(
		rejectedVerificationProviders,
		input.requiredRejectedVerificationProviders
	)) {
		issues.push(
			`Missing rejected telephony webhook verification provider: ${provider}.`
		);
	}
	for (const provider of findMissing(
		replayRejectedVerificationProviders,
		input.requiredReplayRejectedVerificationProviders
	)) {
		issues.push(
			`Missing replay-rejected telephony webhook verification provider: ${provider}.`
		);
	}
	for (const action of findMissing(actions, input.requiredActions)) {
		issues.push(`Missing telephony webhook action: ${action}.`);
	}
	for (const disposition of findMissing(
		dispositions,
		input.requiredDispositions
	)) {
		issues.push(`Missing telephony webhook disposition: ${disposition}.`);
	}

	return {
		actions,
		applied,
		decisions: decisions.length,
		dispositions,
		duplicateCampaignOutcomesApplied,
		duplicateIdempotencyKeys,
		duplicateOutcomeReasons,
		duplicateProviders,
		duplicates: duplicateDecisions.length,
		issues,
		missingSessionIds,
		ok: issues.length === 0,
		providers,
		rejectedVerificationAttempts: rejectedVerificationAttempts.length,
		rejectedVerificationProviders,
		rejectedVerificationSideEffects,
		replayRejectedVerificationAttempts:
			replayRejectedVerificationAttempts.length,
		replayRejectedVerificationProviders,
		routeResults,
		sources,
		verificationAttempts: verificationAttempts.length
	};
};

export const assertVoiceTelephonyWebhookNormalizationEvidence = (
	input: VoiceTelephonyWebhookNormalizationEvidenceInput = {}
): VoiceTelephonyWebhookNormalizationEvidenceReport => {
	const assertion = evaluateVoiceTelephonyWebhookNormalizationEvidence(input);
	if (!assertion.ok) {
		throw new Error(
			`Voice telephony webhook normalization evidence assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
};

const normalizeToken = (value: unknown) =>
	typeof value === 'string'
		? value.trim().toLowerCase().replace(/\s+/g, '-').replace(/_+/g, '-')
		: undefined;

const firstString = (
	source: Record<string, unknown>,
	keys: string[]
): string | undefined => {
	for (const key of keys) {
		const value = source[key];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
		if (typeof value === 'number' && Number.isFinite(value)) {
			return String(value);
		}
	}
};

const firstNumber = (
	source: Record<string, unknown>,
	keys: string[]
): number | undefined => {
	for (const key of keys) {
		const value = source[key];
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === 'string' && value.trim()) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}
	}
};

const parseMaybeJSON = (value: string) => {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return undefined;
	}
};

const flattenPayload = (value: unknown): Record<string, unknown> => {
	if (!isRecord(value)) {
		return {};
	}

	const data = isRecord(value.data) ? value.data : undefined;
	const payload = isRecord(value.payload) ? value.payload : undefined;
	const event = isRecord(value.event) ? value.event : undefined;

	return {
		...value,
		...payload,
		...event,
		...data,
		...(isRecord(data?.payload) ? data.payload : undefined)
	};
};

const toBase64 = (bytes: ArrayBuffer) =>
	Buffer.from(new Uint8Array(bytes)).toString('base64');

const timingSafeEqual = (left: string, right: string) => {
	const encoder = new TextEncoder();
	const leftBytes = encoder.encode(left);
	const rightBytes = encoder.encode(right);
	if (leftBytes.length !== rightBytes.length) {
		return false;
	}

	let diff = 0;
	for (let index = 0; index < leftBytes.length; index += 1) {
		diff |= leftBytes[index]! ^ rightBytes[index]!;
	}

	return diff === 0;
};

const signHmacSHA1Base64 = async (secret: string, payload: string) => {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{
			hash: 'SHA-1',
			name: 'HMAC'
		},
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

	return toBase64(signature);
};

const sortedParamsForSignature = (body: unknown) =>
	Object.entries(flattenPayload(body))
		.filter(([, value]) => value !== undefined && value !== null)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => `${key}${String(value)}`)
		.join('');

const normalizeList = (values: string[] | undefined, fallback: string[]) =>
	new Set((values ?? fallback).map(normalizeToken).filter(Boolean) as string[]);

const metadataValue = (
	metadata: Record<string, unknown> | undefined,
	keys: string[]
) => {
	for (const key of keys) {
		const value = metadata?.[key];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
};

const resolveTransferTarget = (
	event: VoiceTelephonyOutcomeProviderEvent,
	policy: VoiceTelephonyOutcomePolicy
) => {
	if (typeof event.target === 'string' && event.target.trim()) {
		return event.target.trim();
	}

	const metadataTarget = metadataValue(event.metadata, [
		'transferTarget',
		'target',
		'queue',
		'department'
	]);
	if (metadataTarget) {
		return metadataTarget;
	}

	if (typeof policy.transferTarget === 'function') {
		const target = policy.transferTarget(event);
		return typeof target === 'string' && target.trim() ? target.trim() : undefined;
	}

	return typeof policy.transferTarget === 'string' && policy.transferTarget.trim()
		? policy.transferTarget.trim()
		: undefined;
};

const mergeMetadata = (
	event: VoiceTelephonyOutcomeProviderEvent,
	policy: VoiceTelephonyOutcomePolicy
) => ({
	...(policy.includeProviderPayload
		? {
				answeredBy: event.answeredBy,
				durationMs: event.durationMs,
				provider: event.provider,
				reason: event.reason,
				sipCode: event.sipCode,
				status: event.status
			}
		: undefined),
	...policy.metadata,
	...event.metadata
});

const withDecisionDefaults = (
	decision: VoiceTelephonyOutcomeStatusDecision,
	input: {
		event: VoiceTelephonyOutcomeProviderEvent;
		policy: VoiceTelephonyOutcomePolicy;
		source: VoiceTelephonyOutcomeDecision['source'];
	}
): VoiceTelephonyOutcomeDecision => {
	if (typeof decision === 'string') {
		return buildDecision(decision, input);
	}

	return {
		...buildDecision(decision.action, input),
		...decision,
		confidence: decision.confidence ?? 'high',
		metadata: {
			...mergeMetadata(input.event, input.policy),
			...decision.metadata
		},
		source: decision.source ?? input.source,
		target:
			decision.target ??
			(decision.action === 'transfer'
				? resolveTransferTarget(input.event, input.policy)
				: undefined)
	};
};

const dispositionForAction = (
	action: VoiceTelephonyOutcomeAction
): VoiceCallDisposition | undefined => {
	switch (action) {
		case 'complete':
			return 'completed';
		case 'escalate':
			return 'escalated';
		case 'no-answer':
			return 'no-answer';
		case 'transfer':
			return 'transferred';
		case 'voicemail':
			return 'voicemail';
		default:
			return undefined;
	}
};

const buildDecision = (
	action: VoiceTelephonyOutcomeAction,
	input: {
		event: VoiceTelephonyOutcomeProviderEvent;
		policy: VoiceTelephonyOutcomePolicy;
		source: VoiceTelephonyOutcomeDecision['source'];
	}
): VoiceTelephonyOutcomeDecision => ({
	action,
	confidence: action === 'ignore' ? 'low' : 'high',
	disposition: dispositionForAction(action),
	metadata: mergeMetadata(input.event, input.policy),
	reason: input.event.reason,
	source: input.source,
	target:
		action === 'transfer'
			? resolveTransferTarget(input.event, input.policy)
			: undefined
});

export const createVoiceTelephonyOutcomePolicy = (
	policy: VoiceTelephonyOutcomePolicy = {}
): Required<
	Pick<
		VoiceTelephonyOutcomePolicy,
		| 'completedStatuses'
		| 'escalationStatuses'
		| 'failedAsNoAnswer'
		| 'failedStatuses'
		| 'includeProviderPayload'
		| 'machineDetectionVoicemailValues'
		| 'noAnswerOnZeroDuration'
		| 'noAnswerSipCodes'
		| 'noAnswerStatuses'
		| 'transferStatuses'
		| 'voicemailStatuses'
	>
> &
	VoiceTelephonyOutcomePolicy => ({
	completedStatuses: policy.completedStatuses ?? DEFAULT_COMPLETED_STATUSES,
	escalationStatuses: policy.escalationStatuses ?? DEFAULT_ESCALATION_STATUSES,
	failedAsNoAnswer: policy.failedAsNoAnswer ?? true,
	failedStatuses: policy.failedStatuses ?? DEFAULT_FAILED_STATUSES,
	includeProviderPayload: policy.includeProviderPayload ?? true,
	machineDetectionVoicemailValues:
		policy.machineDetectionVoicemailValues ?? DEFAULT_MACHINE_VOICEMAIL_VALUES,
	metadata: policy.metadata,
	minAnsweredDurationMs: policy.minAnsweredDurationMs,
	noAnswerOnZeroDuration: policy.noAnswerOnZeroDuration ?? true,
	noAnswerSipCodes: policy.noAnswerSipCodes ?? DEFAULT_NO_ANSWER_SIP_CODES,
	noAnswerStatuses: policy.noAnswerStatuses ?? DEFAULT_NO_ANSWER_STATUSES,
	statusMap: policy.statusMap,
	transferStatuses: policy.transferStatuses ?? DEFAULT_TRANSFER_STATUSES,
	transferTarget: policy.transferTarget,
	voicemailStatuses: policy.voicemailStatuses ?? DEFAULT_VOICEMAIL_STATUSES
});

export const resolveVoiceTelephonyOutcome = (
	event: VoiceTelephonyOutcomeProviderEvent,
	policyInput: VoiceTelephonyOutcomePolicy = {}
): VoiceTelephonyOutcomeDecision => {
	const policy = createVoiceTelephonyOutcomePolicy(policyInput);
	const status = normalizeToken(event.status);
	const provider = normalizeToken(event.provider);
	const answeredBy = normalizeToken(event.answeredBy);
	const target = resolveTransferTarget(event, policy);

	if (status) {
		const mapped = policy.statusMap?.[status] ??
			(provider ? policy.statusMap?.[`${provider}:${status}`] : undefined);
		if (mapped) {
			return withDecisionDefaults(mapped, {
				event,
				policy,
				source: 'policy'
			});
		}
	}

	if (answeredBy && normalizeList(policy.machineDetectionVoicemailValues, []).has(answeredBy)) {
		return buildDecision('voicemail', { event, policy, source: 'answered-by' });
	}

	if (
		typeof event.sipCode === 'number' &&
		policy.noAnswerSipCodes.includes(event.sipCode)
	) {
		return buildDecision('no-answer', { event, policy, source: 'sip' });
	}

	if (target && status && normalizeList(policy.transferStatuses, []).has(status)) {
		return buildDecision('transfer', { event, policy, source: 'status' });
	}

	if (status && normalizeList(policy.voicemailStatuses, []).has(status)) {
		return buildDecision('voicemail', { event, policy, source: 'status' });
	}

	if (status && normalizeList(policy.escalationStatuses, []).has(status)) {
		return buildDecision('escalate', { event, policy, source: 'status' });
	}

	if (
		status &&
		(policy.failedAsNoAnswer
			? normalizeList(policy.noAnswerStatuses, []).has(status) ||
				normalizeList(policy.failedStatuses, []).has(status)
			: normalizeList(policy.noAnswerStatuses, []).has(status))
	) {
		return buildDecision('no-answer', { event, policy, source: 'status' });
	}

	if (
		policy.noAnswerOnZeroDuration &&
		typeof event.durationMs === 'number' &&
		event.durationMs <= 0
	) {
		return buildDecision('no-answer', { event, policy, source: 'duration' });
	}

	if (
		typeof policy.minAnsweredDurationMs === 'number' &&
		typeof event.durationMs === 'number' &&
		event.durationMs < policy.minAnsweredDurationMs
	) {
		return {
			...buildDecision('no-answer', { event, policy, source: 'duration' }),
			confidence: 'medium'
		};
	}

	if (status && normalizeList(policy.completedStatuses, []).has(status)) {
		return buildDecision('complete', { event, policy, source: 'status' });
	}

	if (target) {
		return {
			...buildDecision('transfer', { event, policy, source: 'explicit-target' }),
			confidence: 'medium'
		};
	}

	return buildDecision('ignore', { event, policy, source: 'status' });
};

export const voiceTelephonyOutcomeToRouteResult = <TResult = unknown>(
	decision: VoiceTelephonyOutcomeDecision,
	result?: TResult
): VoiceTelephonyOutcomeRouteResult<TResult> => {
	switch (decision.action) {
		case 'complete':
			return { complete: true, result };
		case 'escalate':
			return {
				escalate: {
					metadata: decision.metadata,
					reason: decision.reason ?? 'telephony-escalation'
				},
				result
			};
		case 'no-answer':
			return {
				noAnswer: {
					metadata: decision.metadata
				},
				result
			};
		case 'transfer':
			if (!decision.target) {
				return { result };
			}

			return {
				result,
				transfer: {
					metadata: decision.metadata,
					reason: decision.reason,
					target: decision.target
				}
			};
		case 'voicemail':
			return {
				result,
				voicemail: {
					metadata: decision.metadata
				}
			};
		default:
			return { result };
	}
};

export const applyVoiceTelephonyOutcome = async <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	api: VoiceSessionHandle<TContext, TSession, TResult>,
	decision: VoiceTelephonyOutcomeDecision,
	result?: TResult
) => {
	switch (decision.action) {
		case 'complete':
			await api.complete(result);
			break;
		case 'escalate':
			await api.escalate({
				metadata: decision.metadata,
				reason: decision.reason ?? 'telephony-escalation',
				result
			});
			break;
		case 'no-answer':
			await api.markNoAnswer({
				metadata: decision.metadata,
				result
			});
			break;
		case 'transfer':
			if (!decision.target) {
				return;
			}

			await api.transfer({
				metadata: decision.metadata,
				reason: decision.reason,
				result,
				target: decision.target
			});
			break;
		case 'voicemail':
			await api.markVoicemail({
				metadata: decision.metadata,
				result
			});
			break;
		default:
			break;
	}
};

const parseRequestBodyText = (input: { contentType: string; text: string }) => {
	const { contentType, text } = input;
	if (!text) {
		return {};
	}

	if (contentType.includes('application/json')) {
		return parseMaybeJSON(text) ?? {};
	}

	if (
		contentType.includes('application/x-www-form-urlencoded') ||
		contentType.includes('multipart/form-data')
	) {
		return Object.fromEntries(new URLSearchParams(text));
	}

	return parseMaybeJSON(text) ?? Object.fromEntries(new URLSearchParams(text));
};

const readRequestBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') ?? '';
	const text = await request.text();

	return {
		body: parseRequestBodyText({ contentType, text }),
		rawBody: text
	};
};

export const signVoiceTwilioWebhook = async (input: {
	authToken: string;
	body?: unknown;
	url: string;
}) =>
	signHmacSHA1Base64(
		input.authToken,
		`${input.url}${sortedParamsForSignature(input.body ?? {})}`
	);

export const verifyVoiceTwilioWebhookSignature = async (input: {
	authToken?: string;
	body?: unknown;
	headers: Headers;
	url: string;
}): Promise<VoiceTelephonyWebhookVerificationResult> => {
	if (!input.authToken) {
		return { ok: false, reason: 'missing-secret' };
	}

	const signature = input.headers.get('x-twilio-signature');
	if (!signature) {
		return { ok: false, reason: 'missing-signature' };
	}

	const expected = await signVoiceTwilioWebhook({
		authToken: input.authToken,
		body: input.body,
		url: input.url
	});

	return timingSafeEqual(signature, expected)
		? { ok: true }
		: { ok: false, reason: 'invalid-signature' };
};

const resolveVerificationUrl = (
	option: VoiceTelephonyWebhookHandlerOptions['verificationUrl'],
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => (typeof option === 'function' ? option(input) : option ?? input.request.url);

const verifyVoiceTelephonyWebhook = async <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(input: {
	body: unknown;
	options: VoiceTelephonyWebhookHandlerOptions<TContext, TSession, TResult>;
	provider: VoiceTelephonyWebhookProvider;
	query: Record<string, unknown>;
	rawBody: string;
	request: Request;
}): Promise<VoiceTelephonyWebhookVerificationResult> => {
	if (input.options.verify) {
		return input.options.verify({
			body: input.body,
			headers: input.request.headers,
			provider: input.provider,
			query: input.query,
			rawBody: input.rawBody,
			request: input.request
		});
	}

	if (!input.options.signingSecret) {
		return input.options.requireVerification
			? { ok: false, reason: 'missing-secret' }
			: { ok: true };
	}

	if (input.provider !== 'twilio') {
		return { ok: false, reason: 'unsupported-provider' };
	}

	return verifyVoiceTwilioWebhookSignature({
		authToken: input.options.signingSecret,
		body: input.body,
		headers: input.request.headers,
		url: resolveVerificationUrl(input.options.verificationUrl, {
			query: input.query,
			request: input.request
		})
	});
};

const durationMsFromSeconds = (value: number | undefined) =>
	typeof value === 'number' ? value * 1000 : undefined;

export const parseVoiceTelephonyWebhookEvent = (
	input: VoiceTelephonyWebhookParseInput
): VoiceTelephonyOutcomeProviderEvent => {
	const payload = flattenPayload(input.body);
	const provider =
		firstString(payload, ['provider', 'Provider']) ?? input.provider;
	const status = firstString(payload, [
		'CallStatus',
		'call_status',
		'callStatus',
		'DialCallStatus',
		'dial_call_status',
		'status',
		'event_type',
		'type'
	]);
	const durationMs =
		firstNumber(payload, ['durationMs', 'duration_ms']) ??
		durationMsFromSeconds(
			firstNumber(payload, [
				'CallDuration',
				'call_duration',
				'callDuration',
				'DialCallDuration',
				'dial_call_duration',
				'duration'
			])
		);
	const sipCode = firstNumber(payload, [
		'SipResponseCode',
		'sip_response_code',
		'sipCode',
		'sip_code',
		'hangupCauseCode'
	]);
	const from = firstString(payload, ['From', 'from', 'caller_id', 'callerId']);
	const to = firstString(payload, ['To', 'to', 'called_number', 'calledNumber']);
	const target = firstString(payload, [
		'transferTarget',
		'TransferTarget',
		'target',
		'queue',
		'department'
	]);

	return {
		answeredBy: firstString(payload, [
			'AnsweredBy',
			'answered_by',
			'answeredBy',
			'machineDetection',
			'machine_detection'
		]),
		durationMs,
		from,
		metadata: {
			...input.query,
			...payload
		},
		provider,
		reason: firstString(payload, [
			'Reason',
			'reason',
			'HangupCause',
			'hangup_cause',
			'hangupCause'
		]),
		sipCode,
		status,
		target,
		to
	};
};

const defaultSessionId = (input: {
	body: unknown;
	event: VoiceTelephonyOutcomeProviderEvent;
	query: Record<string, unknown>;
}) => {
	const payload = flattenPayload(input.body);
	const metadataSessionId = input.event.metadata?.sessionId;
	return firstString(input.query, ['sessionId', 'session_id']) ??
		firstString(payload, [
			'sessionId',
			'session_id',
			'SessionId',
			'CallSid',
			'call_sid',
			'callSid',
			'CallUUID',
			'call_uuid',
			'callControlId',
			'call_control_id'
		]) ??
		(typeof metadataSessionId === 'string' ? metadataSessionId : undefined);
};

const defaultIdempotencyKey = (input: {
	body: unknown;
	event: VoiceTelephonyOutcomeProviderEvent;
	provider: VoiceTelephonyWebhookProvider;
	sessionId?: string;
}) => {
	const payload = flattenPayload(input.body);
	const eventId = firstString(payload, [
		'id',
		'event_id',
		'eventId',
		'EventSid',
		'event_sid',
		'MessageSid',
		'message_sid',
		'CallSid',
		'call_sid',
		'CallUUID',
		'call_uuid',
		'callControlId',
		'call_control_id'
	]);
	const status = normalizeToken(input.event.status) ?? 'unknown';

	if (eventId) {
		return `${input.provider}:${eventId}:${status}`;
	}

	if (input.sessionId) {
		return `${input.provider}:${input.sessionId}:${status}`;
	}
};

export const createVoiceTelephonyWebhookHandler =
	<
		TContext = unknown,
		TSession extends VoiceSessionRecord = VoiceSessionRecord,
		TResult = unknown
	>(
		options: VoiceTelephonyWebhookHandlerOptions<TContext, TSession, TResult> = {}
	) =>
	async (input: {
		query?: Record<string, unknown>;
		request: Request;
	}): Promise<VoiceTelephonyWebhookDecision<TResult>> => {
		const provider = options.provider ?? 'generic';
		const query = input.query ?? {};
		const { body, rawBody } = await readRequestBody(input.request);
		const verification = await verifyVoiceTelephonyWebhook({
			body,
			options,
			provider,
			query,
			rawBody,
			request: input.request
		});
		if (!verification.ok) {
			throw new VoiceTelephonyWebhookVerificationError(verification);
		}
		const event = options.parse
			? await options.parse({
					body,
					headers: input.request.headers,
					provider,
					query,
					request: input.request
				})
			: parseVoiceTelephonyWebhookEvent({
					body,
					headers: input.request.headers,
					provider,
					query,
					request: input.request
				});
		const sessionId = await (options.resolveSessionId?.({
			body,
			event,
			query,
			request: input.request
		}) ?? defaultSessionId({ body, event, query }));
		const idempotencyEnabled = options.idempotency?.enabled !== false;
		const idempotencyKey = idempotencyEnabled
			? await (options.idempotency?.key?.({
					body,
					event,
					provider,
					query,
					request: input.request,
					sessionId
				}) ?? defaultIdempotencyKey({ body, event, provider, sessionId }))
			: undefined;
		const idempotencyStore = options.idempotency?.store;
		if (idempotencyKey && idempotencyStore) {
			const existing = await idempotencyStore.get(idempotencyKey);
			if (existing) {
				const duplicateDecision = {
					...existing,
					duplicate: true
				};
				await options.onDecision?.({
					...duplicateDecision,
					context: options.context as TContext,
					request: input.request
				});

				return duplicateDecision;
			}
		}
		const decision = resolveVoiceTelephonyOutcome(event, options.policy);
		const resultResolver = options.result as
			| ((
					input: {
						decision: VoiceTelephonyOutcomeDecision;
						event: VoiceTelephonyOutcomeProviderEvent;
						sessionId?: string;
					}
			  ) => Promise<TResult | undefined> | TResult | undefined)
			| TResult
			| undefined;
		const result =
			typeof resultResolver === 'function'
				? await (resultResolver as (input: {
						decision: VoiceTelephonyOutcomeDecision;
						event: VoiceTelephonyOutcomeProviderEvent;
						sessionId?: string;
					}) => Promise<TResult | undefined> | TResult | undefined)({
						decision,
						event,
						sessionId
					})
				: resultResolver;
		const routeResult = voiceTelephonyOutcomeToRouteResult(decision, result);
		const shouldApply =
			typeof options.apply === 'function'
				? options.apply({
						applied: false,
						decision,
						event,
						routeResult,
						sessionId
					})
				: options.apply === true;
		let applied = false;

		if (shouldApply && decision.action !== 'ignore' && options.getSessionHandle) {
			const api = await options.getSessionHandle({
				context: options.context as TContext,
				decision,
				event,
				request: input.request,
				sessionId
			});
			if (api) {
				await applyVoiceTelephonyOutcome(api, decision, result);
				applied = true;
			}
		}

		const webhookDecision = {
			applied,
			decision,
			event,
			idempotencyKey,
			routeResult,
			sessionId
		};
		if (idempotencyKey && idempotencyStore) {
			const now = Date.now();
			await idempotencyStore.set(idempotencyKey, {
				...webhookDecision,
				createdAt: now,
				updatedAt: now
			});
		}

		await options.onDecision?.({
			...webhookDecision,
			context: options.context as TContext,
			request: input.request
		});

		return webhookDecision;
	};

export const createVoiceTelephonyWebhookRoutes = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: VoiceTelephonyWebhookRoutesOptions<TContext, TSession, TResult> = {}
) => {
	const path = options.path ?? '/api/voice/telephony/webhook';
	const handler = createVoiceTelephonyWebhookHandler(options);

	return new Elysia({
		name: options.name ?? 'absolutejs-voice-telephony-webhooks'
	}).post(
		path,
		async ({ query, request }) => {
			try {
				return await handler({ query, request });
			} catch (error) {
				if (error instanceof VoiceTelephonyWebhookVerificationError) {
					return new Response(JSON.stringify({ verification: error.result }), {
						headers: {
							'content-type': 'application/json'
						},
						status: 401
					});
				}

				throw error;
			}
		},
		{
			parse: 'none'
		}
	);
};
