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

const normalizeToken = (value: unknown) =>
	typeof value === 'string'
		? value.trim().toLowerCase().replace(/\s+/g, '-').replace(/_+/g, '-')
		: undefined;

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
