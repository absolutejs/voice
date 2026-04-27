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
	event: VoiceTelephonyOutcomeProviderEvent;
	routeResult: VoiceTelephonyOutcomeRouteResult<TResult>;
	sessionId?: string;
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

const parseRequestBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') ?? '';
	const text = await request.text();
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
		metadata: payload,
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
		const body = await parseRequestBody(input.request);
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
			routeResult,
			sessionId
		};

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
	}).post(path, async ({ query, request }) => handler({ query, request }));
};
