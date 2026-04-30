import { Elysia } from 'elysia';
import {
	filterVoiceAuditEvents,
	type StoredVoiceAuditEvent,
	type VoiceAuditEventStore,
	type VoiceAuditOutcome
} from './audit';
import { redactVoiceAuditEvents } from './auditExport';
import type {
	StoredVoiceIntegrationEvent,
	StoredVoiceOpsTask,
	VoiceIntegrationEventStore,
	VoiceOpsTaskStore
} from './ops';
import {
	summarizeVoiceSessionReplay,
	type VoiceSessionReplay
} from './sessionReplay';
import type {
	StoredVoiceCallReviewArtifact,
	VoiceCallReviewStore
} from './testing/review';
import {
	summarizeVoiceTraceTimeline,
	type VoiceTraceTimelineEvent,
	type VoiceTraceTimelineProviderSummary
} from './traceTimeline';
import {
	filterVoiceTraceEvents,
	redactVoiceTraceEvents,
	type StoredVoiceTraceEvent,
	type VoiceTraceEvaluationOptions,
	type VoiceTraceEventStore,
	type VoiceTraceRedactionConfig,
	type VoiceTraceSummary
} from './trace';

export type VoiceOperationsRecordStatus = 'failed' | 'healthy' | 'warning';

export type VoiceOperationsRecordOutcome = {
	assistantReplies: number;
	complete: boolean;
	escalated: boolean;
	noAnswer: boolean;
	transferred: boolean;
	voicemail: boolean;
};

export type VoiceOperationsRecordAgentHandoff = {
	at: number;
	fromAgentId?: string;
	metadata?: Record<string, unknown>;
	reason?: string;
	status?: string;
	summary?: string;
	targetAgentId?: string;
	turnId?: string;
};

export type VoiceOperationsRecordTool = {
	at: number;
	elapsedMs?: number;
	error?: string;
	status?: string;
	toolCallId?: string;
	toolName?: string;
	turnId?: string;
};

export type VoiceOperationsRecordTranscriptTurn = {
	assistantReplies: string[];
	committedText?: string;
	errors: string[];
	id: string;
	transcripts: string[];
};

export type VoiceOperationsRecordProviderDecision = {
	at: number;
	elapsedMs?: number;
	error?: string;
	fallbackProvider?: string;
	kind?: string;
	provider?: string;
	reason?: string;
	selectedProvider?: string;
	status?: string;
	surface?: string;
	type: StoredVoiceTraceEvent['type'];
	turnId?: string;
};

export type VoiceOperationsRecordProviderDecisionRecoveryStatus =
	| 'degraded'
	| 'failed'
	| 'none'
	| 'recovered'
	| 'selected';

export type VoiceOperationsRecordProviderDecisionSummary = {
	degraded: number;
	errors: number;
	fallbacks: number;
	providers: string[];
	recoveryStatus: VoiceOperationsRecordProviderDecisionRecoveryStatus;
	selected: number;
	surfaces: string[];
	total: number;
};

export type VoiceOperationsRecordAuditSummary = {
	error: number;
	events: StoredVoiceAuditEvent[];
	skipped: number;
	success: number;
	total: number;
};

export type VoiceOperationsRecordReviewSummary = {
	failed: number;
	reviews: StoredVoiceCallReviewArtifact[];
	total: number;
};

export type VoiceOperationsRecordTaskSummary = {
	done: number;
	inProgress: number;
	open: number;
	overdue: number;
	tasks: StoredVoiceOpsTask[];
	total: number;
};

export type VoiceOperationsRecordIntegrationEventSummary = {
	delivered: number;
	events: StoredVoiceIntegrationEvent[];
	failed: number;
	pending: number;
	sinkDeliveries: number;
	skipped: number;
	total: number;
};

export type VoiceOperationsRecordGuardrailFinding = {
	action?: string;
	label?: string;
	ruleId?: string;
};

export type VoiceOperationsRecordGuardrailDecision = {
	allowed?: boolean;
	at: number;
	findings: VoiceOperationsRecordGuardrailFinding[];
	metadata?: Record<string, unknown>;
	proof?: string;
	stage?: string;
	status?: string;
	toolName?: string;
	turnId?: string;
};

export type VoiceOperationsRecordGuardrailSummary = {
	blocked: number;
	decisions: VoiceOperationsRecordGuardrailDecision[];
	passed: number;
	stages: string[];
	total: number;
	warned: number;
};

export type VoiceOperationsRecordTelephonyMediaEvent = {
	at: number;
	audioBytes: number;
	callSid?: string;
	carrier?: string;
	direction?: string;
	event: string;
	sequenceNumber?: string;
	streamId?: string;
};

export type VoiceOperationsRecordTelephonyMediaSummary = {
	audioBytes: number;
	carriers: string[];
	errors: number;
	events: VoiceOperationsRecordTelephonyMediaEvent[];
	media: number;
	starts: number;
	stops: number;
	streamIds: string[];
	total: number;
};

export type VoiceOperationsRecordGuardrailAssertionInput = {
	minBlocked?: number;
	minDecisions?: number;
	minPassed?: number;
	minWarned?: number;
	proofs?: string[];
	ruleIds?: string[];
	stages?: string[];
	statuses?: string[];
	toolNames?: string[];
};

export type VoiceOperationsRecordGuardrailAssertionReport = {
	blocked: number;
	decisions: number;
	issues: string[];
	ok: boolean;
	passed: number;
	proofs: string[];
	ruleIds: string[];
	stages: string[];
	statuses: string[];
	toolNames: string[];
	warned: number;
};

export type VoiceOperationsRecordProviderRecoveryAssertionInput = {
	minDegraded?: number;
	minErrors?: number;
	minFallbacks?: number;
	minSelected?: number;
	minTotal?: number;
	recoveryStatus?: VoiceOperationsRecordProviderDecisionRecoveryStatus;
	requiredFallbackProviders?: string[];
	requiredProviders?: string[];
	requiredReasonIncludes?: string[];
	requiredSelectedProviders?: string[];
	requiredStatuses?: string[];
	requiredSurfaces?: string[];
};

export type VoiceOperationsRecordProviderRecoveryAssertionReport = {
	degraded: number;
	errors: number;
	fallbacks: number;
	issues: string[];
	ok: boolean;
	providers: string[];
	recoveryStatus: VoiceOperationsRecordProviderDecisionRecoveryStatus;
	selected: number;
	selectedProviders: string[];
	statuses: string[];
	surfaces: string[];
	total: number;
};

export type VoiceOperationsRecord = {
	audit?: VoiceOperationsRecordAuditSummary;
	checkedAt: number;
	guardrails: VoiceOperationsRecordGuardrailSummary;
	handoffs: VoiceOperationsRecordAgentHandoff[];
	integrationEvents?: VoiceOperationsRecordIntegrationEventSummary;
	outcome: VoiceOperationsRecordOutcome;
	providerDecisions: VoiceOperationsRecordProviderDecision[];
	providerDecisionSummary: VoiceOperationsRecordProviderDecisionSummary;
	providers: VoiceTraceTimelineProviderSummary[];
	replay: VoiceSessionReplay;
	reviews?: VoiceOperationsRecordReviewSummary;
	sessionId: string;
	status: VoiceOperationsRecordStatus;
	summary: VoiceTraceSummary;
	tasks?: VoiceOperationsRecordTaskSummary;
	telephonyMedia: VoiceOperationsRecordTelephonyMediaSummary;
	timeline: VoiceTraceTimelineEvent[];
	tools: VoiceOperationsRecordTool[];
	traceEvents: StoredVoiceTraceEvent[];
	transcript: VoiceOperationsRecordTranscriptTurn[];
};

export type VoiceOperationsRecordOptions = {
	audit?: VoiceAuditEventStore;
	evaluation?: VoiceTraceEvaluationOptions;
	events?: StoredVoiceTraceEvent[];
	integrationEvents?: VoiceIntegrationEventStore;
	redact?: VoiceTraceRedactionConfig;
	reviews?: VoiceCallReviewStore;
	sessionId: string;
	store?: VoiceTraceEventStore;
	tasks?: VoiceOpsTaskStore;
};

export type VoiceOperationsRecordRoutesOptions = Omit<
	VoiceOperationsRecordOptions,
	'sessionId'
> & {
	headers?: HeadersInit;
	htmlPath?: false | string;
	incidentHtmlPath?: false | string;
	incidentPath?: false | string;
	name?: string;
	path?: string;
	render?: (record: VoiceOperationsRecord) => string | Promise<string>;
	renderIncidentMarkdown?: (
		record: VoiceOperationsRecord
	) => string | Promise<string>;
	title?: string;
};

const getString = (value: unknown) =>
	typeof value === 'string' ? value : undefined;

const getNumber = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const getBoolean = (value: unknown) =>
	typeof value === 'boolean' ? value : undefined;

const getRecord = (value: unknown) =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const countOutcome = (
	events: StoredVoiceAuditEvent[],
	outcome: VoiceAuditOutcome
) => events.filter((event) => event.outcome === outcome).length;

const matchesSessionScopedId = (id: string, sessionId: string) =>
	id === sessionId || id.startsWith(`${sessionId}:`);

const hasPayloadValue = (
	payload: Record<string, unknown>,
	key: string,
	values: Set<string>
) => {
	const value = payload[key];
	return typeof value === 'string' && values.has(value);
};

const countIntegrationDeliveryStatus = (
	events: StoredVoiceIntegrationEvent[],
	status: StoredVoiceIntegrationEvent['deliveryStatus']
) => events.filter((event) => event.deliveryStatus === status).length;

const uniqueSorted = (values: Array<string | undefined>) =>
	[
		...new Set(
			values.filter((value): value is string => typeof value === 'string')
		)
	].sort();

const pushMissingValuesIssue = (input: {
	actual: string[];
	expected?: string[];
	issues: string[];
	label: string;
	prefix?: string;
}) => {
	const missing = (input.expected ?? []).filter(
		(value) => !input.actual.includes(value)
	);
	if (missing.length > 0) {
		input.issues.push(
			`Missing ${input.prefix ?? 'guardrail'} ${input.label}: ${missing.join(', ')}`
		);
	}
};

const resolveRoutePath = (path: string, sessionId: string) =>
	path.replace(':sessionId', encodeURIComponent(sessionId));

const toHandoff = (
	event: StoredVoiceTraceEvent
): VoiceOperationsRecordAgentHandoff => ({
	at: event.at,
	fromAgentId: getString(event.payload.fromAgentId),
	metadata:
		event.payload.metadata &&
		typeof event.payload.metadata === 'object' &&
		!Array.isArray(event.payload.metadata)
			? (event.payload.metadata as Record<string, unknown>)
			: undefined,
	reason: getString(event.payload.reason),
	status: getString(event.payload.status),
	summary: getString(event.payload.summary),
	targetAgentId: getString(event.payload.targetAgentId),
	turnId: event.turnId
});

const toTool = (event: StoredVoiceTraceEvent): VoiceOperationsRecordTool => ({
	at: event.at,
	elapsedMs: getNumber(event.payload.elapsedMs),
	error: getString(event.payload.error),
	status: getString(event.payload.status),
	toolCallId: getString(event.payload.toolCallId),
	toolName: getString(event.payload.toolName),
	turnId: event.turnId
});

const toGuardrailFinding = (
	value: unknown
): VoiceOperationsRecordGuardrailFinding | undefined => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const record = value as Record<string, unknown>;
	return {
		action: getString(record.action),
		label: getString(record.label),
		ruleId: getString(record.ruleId)
	};
};

const toGuardrailDecision = (
	event: StoredVoiceTraceEvent
): VoiceOperationsRecordGuardrailDecision => ({
	allowed: getBoolean(event.payload.allowed),
	at: event.at,
	findings: Array.isArray(event.payload.findings)
		? event.payload.findings
				.map(toGuardrailFinding)
				.filter(
					(
						finding
					): finding is VoiceOperationsRecordGuardrailFinding =>
						finding !== undefined
				)
		: [],
	metadata:
		event.metadata &&
		typeof event.metadata === 'object' &&
		!Array.isArray(event.metadata)
			? event.metadata
			: undefined,
	proof: getString(event.metadata?.proof),
	stage: getString(event.payload.stage),
	status: getString(event.payload.status),
	toolName: getString(event.payload.toolName),
	turnId: event.turnId
});

const decodeBase64Bytes = (value: unknown) => {
	if (typeof value !== 'string') {
		return 0;
	}
	try {
		return Buffer.from(value, 'base64').byteLength;
	} catch {
		return 0;
	}
};

const toTelephonyMediaEvent = (
	event: StoredVoiceTraceEvent
): VoiceOperationsRecordTelephonyMediaEvent | undefined => {
	if (event.type !== 'client.telephony_media') {
		return undefined;
	}
	const envelope = getRecord(event.payload.envelope);
	const start = getRecord(envelope?.start);
	const media = getRecord(envelope?.media);
	const stop = getRecord(envelope?.stop);
	const error = getRecord(envelope?.error);
	const eventName =
		getString(event.payload.event) ??
		getString(envelope?.event) ??
		getString(event.payload.kind) ??
		'unknown';
	const streamId =
		getString(event.payload.streamId) ??
		getString(envelope?.streamSid) ??
		getString(start?.streamSid);
	const callSid =
		getString(event.payload.callSid) ??
		getString(start?.callSid) ??
		getString(stop?.callSid);
	const sequenceNumber =
		getString(media?.sequenceNumber) ?? getString(envelope?.sequenceNumber);
	const direction =
		getString(media?.track) ??
		getString(media?.direction) ??
		getString(event.payload.direction);

	return {
		at: event.at,
		audioBytes:
			getNumber(event.payload.audioBytes) ??
			getNumber(media?.audioBytes) ??
			decodeBase64Bytes(media?.payload),
		callSid,
		carrier: getString(event.payload.carrier),
		direction,
		event: eventName,
		sequenceNumber,
		streamId
	};
};

const summarizeTelephonyMedia = (
	events: StoredVoiceTraceEvent[]
): VoiceOperationsRecordTelephonyMediaSummary => {
	const mediaEvents = events
		.map(toTelephonyMediaEvent)
		.filter(
			(
				event
			): event is VoiceOperationsRecordTelephonyMediaEvent =>
				event !== undefined
		);
	const eventNames = mediaEvents.map((event) => event.event.toLowerCase());

	return {
		audioBytes: mediaEvents.reduce((total, event) => total + event.audioBytes, 0),
		carriers: uniqueSorted(mediaEvents.map((event) => event.carrier)),
		errors: eventNames.filter((event) => event === 'error').length,
		events: mediaEvents,
		media: eventNames.filter((event) => event === 'media').length,
		starts: eventNames.filter((event) => event === 'start').length,
		stops: eventNames.filter((event) => event === 'stop').length,
		streamIds: uniqueSorted(mediaEvents.map((event) => event.streamId)),
		total: mediaEvents.length
	};
};

const summarizeGuardrails = (
	events: StoredVoiceTraceEvent[]
): VoiceOperationsRecordGuardrailSummary => {
	const decisions = events
		.filter((event) => event.type === 'assistant.guardrail')
		.map(toGuardrailDecision);
	const isBlocked = (decision: VoiceOperationsRecordGuardrailDecision) =>
		decision.allowed === false || decision.status === 'fail';
	const isWarned = (decision: VoiceOperationsRecordGuardrailDecision) =>
		decision.status === 'warn' ||
		decision.findings.some((finding) => finding.action === 'warn');
	const stages = [
		...new Set(
			decisions
				.map((decision) => decision.stage)
				.filter((stage): stage is string => typeof stage === 'string')
		)
	].sort();

	return {
		blocked: decisions.filter(isBlocked).length,
		decisions,
		passed: decisions.filter(
			(decision) => !isBlocked(decision) && !isWarned(decision)
		).length,
		stages,
		total: decisions.length,
		warned: decisions.filter(isWarned).length
	};
};

const toProviderDecision = (
	event: StoredVoiceTraceEvent
): VoiceOperationsRecordProviderDecision | undefined => {
	const provider =
		getString(event.payload.provider) ??
		getString(event.payload.selectedProvider) ??
		getString(event.payload.fallbackProvider) ??
		getString(event.payload.variantId);
	const status =
		getString(event.payload.providerStatus) ??
		getString(event.payload.status);
	const error = getString(event.payload.error);
	const elapsedMs =
		getNumber(event.payload.elapsedMs) ??
		getNumber(event.payload.latencyMs) ??
		getNumber(event.payload.durationMs);
	const hasProviderSignal =
		event.type === 'provider.decision' ||
		provider !== undefined ||
		getString(event.payload.selectedProvider) !== undefined ||
		getString(event.payload.fallbackProvider) !== undefined ||
		getString(event.payload.variantId) !== undefined;

	if (!hasProviderSignal) {
		return undefined;
	}

	return {
		at: event.at,
		elapsedMs,
		error,
		fallbackProvider: getString(event.payload.fallbackProvider),
		kind: getString(event.payload.kind),
		provider,
		reason: getString(event.payload.reason),
		selectedProvider: getString(event.payload.selectedProvider),
		status,
		surface: getString(event.payload.surface),
		type: event.type,
		turnId: event.turnId
	};
};

const summarizeProviderDecisions = (
	decisions: VoiceOperationsRecordProviderDecision[]
): VoiceOperationsRecordProviderDecisionSummary => {
	const providers = uniqueSorted(
		decisions.flatMap((decision) => [
			decision.provider,
			decision.selectedProvider,
			decision.fallbackProvider
		])
	);
	const surfaces = uniqueSorted(decisions.map((decision) => decision.surface));
	const degraded = decisions.filter(
		(decision) => decision.status === 'degraded'
	).length;
	const errors = decisions.filter((decision) => decision.status === 'error').length;
	const fallbacks = decisions.filter(
		(decision) => decision.status === 'fallback'
	).length;
	const selected = decisions.filter(
		(decision) =>
			decision.status === 'selected' || decision.status === 'success'
	).length;
	const recoveryStatus: VoiceOperationsRecordProviderDecisionRecoveryStatus =
		errors > 0
			? 'failed'
			: degraded > 0
				? 'degraded'
				: fallbacks > 0
					? 'recovered'
					: selected > 0
						? 'selected'
						: 'none';

	return {
		degraded,
		errors,
		fallbacks,
		providers,
		recoveryStatus,
		selected,
		surfaces,
		total: decisions.length
	};
};

const buildTranscript = (
	replay: VoiceSessionReplay
): VoiceOperationsRecordTranscriptTurn[] =>
	replay.turns
		.map((turn) => ({
			assistantReplies: turn.assistantReplies,
			committedText: turn.committedText,
			errors: turn.errors
				.map((error) => getString(error.error) ?? JSON.stringify(error))
				.filter((error): error is string => typeof error === 'string'),
			id: turn.id,
			transcripts: turn.transcripts
				.map((transcript) => transcript.text)
				.filter(
					(text): text is string => typeof text === 'string' && text.length > 0
				)
		}))
		.filter(
			(turn) =>
				turn.committedText ||
				turn.assistantReplies.length > 0 ||
				turn.transcripts.length > 0 ||
				turn.errors.length > 0
		);

const resolveOutcome = (
	events: StoredVoiceTraceEvent[]
): VoiceOperationsRecordOutcome => {
	const agentResults = events.filter((event) => event.type === 'agent.result');
	return {
		assistantReplies: events.filter((event) => event.type === 'turn.assistant')
			.length,
		complete: agentResults.some((event) => event.payload.complete === true),
		escalated: agentResults.some((event) => event.payload.escalated === true),
		noAnswer: agentResults.some((event) => event.payload.noAnswer === true),
		transferred: agentResults.some((event) => event.payload.transferred === true),
		voicemail: agentResults.some((event) => event.payload.voicemail === true)
	};
};

export const buildVoiceOperationsRecord = async (
	options: VoiceOperationsRecordOptions
): Promise<VoiceOperationsRecord> => {
	const sourceEvents =
		options.events ??
		(await options.store?.list({ sessionId: options.sessionId })) ??
		[];
	const rawTraceEvents = filterVoiceTraceEvents(sourceEvents, {
		sessionId: options.sessionId
	});
	const traceEvents = options.redact
		? redactVoiceTraceEvents(rawTraceEvents, options.redact)
		: rawTraceEvents;
	const timelineReport = summarizeVoiceTraceTimeline(traceEvents, {
		evaluation: options.evaluation,
		limit: 1
	});
	const timelineSession = timelineReport.sessions[0];
	const replay = await summarizeVoiceSessionReplay({
		evaluation: options.evaluation,
		events: traceEvents,
		sessionId: options.sessionId
	});
	const rawAuditEvents = options.audit
		? filterVoiceAuditEvents(await options.audit.list({ sessionId: options.sessionId }))
		: undefined;
	const auditEvents =
		options.redact && rawAuditEvents
			? redactVoiceAuditEvents(rawAuditEvents, options.redact)
			: rawAuditEvents;
	const reviews = options.reviews
		? (await options.reviews.list()).filter((review) =>
				matchesSessionScopedId(review.id, options.sessionId)
			)
		: undefined;
	const reviewIds = new Set(reviews?.map((review) => review.id) ?? []);
	const tasks = options.tasks
		? (await options.tasks.list()).filter(
				(task) =>
					matchesSessionScopedId(task.id, options.sessionId) ||
					(typeof task.reviewId === 'string' && reviewIds.has(task.reviewId))
			)
		: undefined;
	const taskIds = new Set(tasks?.map((task) => task.id) ?? []);
	const integrationEvents = options.integrationEvents
		? (await options.integrationEvents.list()).filter(
				(event) =>
					hasPayloadValue(
						event.payload,
						'sessionId',
						new Set([options.sessionId])
					) ||
					hasPayloadValue(event.payload, 'reviewId', reviewIds) ||
					hasPayloadValue(event.payload, 'taskId', taskIds)
			)
		: undefined;
	const sinkDeliveries =
		integrationEvents?.reduce(
			(total, event) =>
				total + Object.keys(event.sinkDeliveries ?? {}).length,
			0
		) ?? 0;
	const providerDecisions = traceEvents
		.map(toProviderDecision)
		.filter(
			(decision): decision is VoiceOperationsRecordProviderDecision =>
				decision !== undefined
		);

	return {
		audit: auditEvents
			? {
					error: countOutcome(auditEvents, 'error'),
					events: auditEvents,
					skipped: countOutcome(auditEvents, 'skipped'),
					success: countOutcome(auditEvents, 'success'),
					total: auditEvents.length
				}
			: undefined,
		checkedAt: Date.now(),
		guardrails: summarizeGuardrails(traceEvents),
		handoffs: traceEvents
			.filter((event) => event.type === 'agent.handoff')
			.map(toHandoff),
		integrationEvents: integrationEvents
			? {
					delivered: countIntegrationDeliveryStatus(
						integrationEvents,
						'delivered'
					),
					events: integrationEvents,
					failed: countIntegrationDeliveryStatus(integrationEvents, 'failed'),
					pending: countIntegrationDeliveryStatus(
						integrationEvents,
						'pending'
					),
					sinkDeliveries,
					skipped: countIntegrationDeliveryStatus(
						integrationEvents,
						'skipped'
					),
					total: integrationEvents.length
				}
			: undefined,
		outcome: resolveOutcome(traceEvents),
		providerDecisions,
		providerDecisionSummary: summarizeProviderDecisions(providerDecisions),
		providers: timelineSession?.providers ?? [],
		replay,
		reviews: reviews
			? {
					failed: reviews.filter((review) => !review.summary.pass).length,
					reviews,
					total: reviews.length
				}
			: undefined,
		sessionId: options.sessionId,
		status: timelineSession?.status ?? 'healthy',
		summary: timelineSession?.summary ?? replay.summary,
		tasks: tasks
			? {
					done: tasks.filter((task) => task.status === 'done').length,
					inProgress: tasks.filter((task) => task.status === 'in-progress')
						.length,
					open: tasks.filter((task) => task.status === 'open').length,
					overdue: tasks.filter(
						(task) =>
							typeof task.dueAt === 'number' &&
							task.status !== 'done' &&
							task.dueAt <= Date.now()
					).length,
					tasks,
					total: tasks.length
				}
			: undefined,
		telephonyMedia: summarizeTelephonyMedia(traceEvents),
		timeline: timelineSession?.events ?? [],
		tools: traceEvents.filter((event) => event.type === 'agent.tool').map(toTool),
		traceEvents,
		transcript: buildTranscript(replay)
	};
};

export const evaluateVoiceOperationsRecordGuardrails = (
	record: VoiceOperationsRecord,
	input: VoiceOperationsRecordGuardrailAssertionInput = {}
): VoiceOperationsRecordGuardrailAssertionReport => {
	const issues: string[] = [];
	const decisions = record.guardrails.decisions;
	const proofs = uniqueSorted(decisions.map((decision) => decision.proof));
	const ruleIds = uniqueSorted(
		decisions.flatMap((decision) =>
			decision.findings.map((finding) => finding.ruleId)
		)
	);
	const stages = uniqueSorted(decisions.map((decision) => decision.stage));
	const statuses = uniqueSorted(decisions.map((decision) => decision.status));
	const toolNames = uniqueSorted(decisions.map((decision) => decision.toolName));

	const minDecisions = input.minDecisions ?? 1;
	if (record.guardrails.total < minDecisions) {
		issues.push(
			`Expected at least ${String(minDecisions)} guardrail decisions, found ${String(record.guardrails.total)}.`
		);
	}
	if (
		input.minBlocked !== undefined &&
		record.guardrails.blocked < input.minBlocked
	) {
		issues.push(
			`Expected at least ${String(input.minBlocked)} blocked guardrail decisions, found ${String(record.guardrails.blocked)}.`
		);
	}
	if (input.minWarned !== undefined && record.guardrails.warned < input.minWarned) {
		issues.push(
			`Expected at least ${String(input.minWarned)} warned guardrail decisions, found ${String(record.guardrails.warned)}.`
		);
	}
	if (input.minPassed !== undefined && record.guardrails.passed < input.minPassed) {
		issues.push(
			`Expected at least ${String(input.minPassed)} passed guardrail decisions, found ${String(record.guardrails.passed)}.`
		);
	}

	pushMissingValuesIssue({
		actual: proofs,
		expected: input.proofs,
		issues,
		label: 'proofs'
	});
	pushMissingValuesIssue({
		actual: ruleIds,
		expected: input.ruleIds,
		issues,
		label: 'rule IDs'
	});
	pushMissingValuesIssue({
		actual: stages,
		expected: input.stages,
		issues,
		label: 'stages'
	});
	pushMissingValuesIssue({
		actual: statuses,
		expected: input.statuses,
		issues,
		label: 'statuses'
	});
	pushMissingValuesIssue({
		actual: toolNames,
		expected: input.toolNames,
		issues,
		label: 'tool names'
	});

	return {
		blocked: record.guardrails.blocked,
		decisions: record.guardrails.total,
		issues,
		ok: issues.length === 0,
		passed: record.guardrails.passed,
		proofs,
		ruleIds,
		stages,
		statuses,
		toolNames,
		warned: record.guardrails.warned
	};
};

export const assertVoiceOperationsRecordGuardrails = (
	record: VoiceOperationsRecord,
	input: VoiceOperationsRecordGuardrailAssertionInput = {}
): VoiceOperationsRecordGuardrailAssertionReport => {
	const report = evaluateVoiceOperationsRecordGuardrails(record, input);
	if (!report.ok) {
		throw new Error(
			`Voice operations record guardrail assertion failed for ${record.sessionId}: ${report.issues.join(' ')}`
		);
	}
	return report;
};

export const evaluateVoiceOperationsRecordProviderRecovery = (
	record: VoiceOperationsRecord,
	input: VoiceOperationsRecordProviderRecoveryAssertionInput = {}
): VoiceOperationsRecordProviderRecoveryAssertionReport => {
	const issues: string[] = [];
	const summary = record.providerDecisionSummary;
	const decisions = record.providerDecisions;
	const providers = uniqueSorted(
		decisions.flatMap((decision) => [
			decision.provider,
			decision.selectedProvider,
			decision.fallbackProvider
		])
	);
	const selectedProviders = uniqueSorted(
		decisions.map((decision) => decision.selectedProvider)
	);
	const fallbackProviders = uniqueSorted(
		decisions.map((decision) => decision.fallbackProvider)
	);
	const statuses = uniqueSorted(decisions.map((decision) => decision.status));
	const surfaces = uniqueSorted(decisions.map((decision) => decision.surface));

	if (input.recoveryStatus && summary.recoveryStatus !== input.recoveryStatus) {
		issues.push(
			`Expected provider recovery status ${input.recoveryStatus}, got ${summary.recoveryStatus}.`
		);
	}
	if (input.minTotal !== undefined && summary.total < input.minTotal) {
		issues.push(
			`Expected at least ${String(input.minTotal)} provider decision(s), found ${String(summary.total)}.`
		);
	}
	if (input.minSelected !== undefined && summary.selected < input.minSelected) {
		issues.push(
			`Expected at least ${String(input.minSelected)} selected provider decision(s), found ${String(summary.selected)}.`
		);
	}
	if (input.minFallbacks !== undefined && summary.fallbacks < input.minFallbacks) {
		issues.push(
			`Expected at least ${String(input.minFallbacks)} provider fallback decision(s), found ${String(summary.fallbacks)}.`
		);
	}
	if (input.minDegraded !== undefined && summary.degraded < input.minDegraded) {
		issues.push(
			`Expected at least ${String(input.minDegraded)} degraded provider decision(s), found ${String(summary.degraded)}.`
		);
	}
	if (input.minErrors !== undefined && summary.errors < input.minErrors) {
		issues.push(
			`Expected at least ${String(input.minErrors)} provider error decision(s), found ${String(summary.errors)}.`
		);
	}

	pushMissingValuesIssue({
		actual: providers,
		expected: input.requiredProviders,
		issues,
		label: 'providers',
		prefix: 'provider recovery'
	});
	pushMissingValuesIssue({
		actual: selectedProviders,
		expected: input.requiredSelectedProviders,
		issues,
		label: 'selected providers',
		prefix: 'provider recovery'
	});
	pushMissingValuesIssue({
		actual: fallbackProviders,
		expected: input.requiredFallbackProviders,
		issues,
		label: 'fallback providers',
		prefix: 'provider recovery'
	});
	pushMissingValuesIssue({
		actual: statuses,
		expected: input.requiredStatuses,
		issues,
		label: 'statuses',
		prefix: 'provider recovery'
	});
	pushMissingValuesIssue({
		actual: surfaces,
		expected: input.requiredSurfaces,
		issues,
		label: 'surfaces',
		prefix: 'provider recovery'
	});

	for (const phrase of input.requiredReasonIncludes ?? []) {
		if (!decisions.some((decision) => decision.reason?.includes(phrase))) {
			issues.push(
				`Missing provider recovery reason containing: ${phrase}.`
			);
		}
	}

	return {
		degraded: summary.degraded,
		errors: summary.errors,
		fallbacks: summary.fallbacks,
		issues,
		ok: issues.length === 0,
		providers,
		recoveryStatus: summary.recoveryStatus,
		selected: summary.selected,
		selectedProviders,
		statuses,
		surfaces,
		total: summary.total
	};
};

export const assertVoiceOperationsRecordProviderRecovery = (
	record: VoiceOperationsRecord,
	input: VoiceOperationsRecordProviderRecoveryAssertionInput = {}
): VoiceOperationsRecordProviderRecoveryAssertionReport => {
	const report = evaluateVoiceOperationsRecordProviderRecovery(record, input);
	if (!report.ok) {
		throw new Error(
			`Voice operations record provider recovery assertion failed for ${record.sessionId}: ${report.issues.join(' ')}`
		);
	}
	return report;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const formatMs = (value: number | undefined) =>
	value === undefined ? 'n/a' : `${String(value)}ms`;

const outcomeLabels = (outcome: VoiceOperationsRecordOutcome) =>
	[
		outcome.complete ? 'complete' : undefined,
		outcome.escalated ? 'escalated' : undefined,
		outcome.transferred ? 'transferred' : undefined,
		outcome.voicemail ? 'voicemail' : undefined,
		outcome.noAnswer ? 'no-answer' : undefined
	].filter((label): label is string => label !== undefined);

export const renderVoiceOperationsRecordIncidentMarkdown = (
	record: VoiceOperationsRecord
) => {
	const outcomes = outcomeLabels(record.outcome);
	const topErrors = record.traceEvents
		.filter((event) => event.type === 'session.error')
		.map((event) => getString(event.payload.error))
		.filter((error): error is string => typeof error === 'string')
		.slice(0, 3);
	const openTasks = record.tasks?.tasks
		.filter((task) => task.status !== 'done')
		.map((task) => task.title)
		.slice(0, 3) ?? [];
	const providerDecisions = record.providerDecisions
		.filter(
			(decision) =>
				decision.provider ||
				decision.selectedProvider ||
				decision.fallbackProvider ||
				decision.reason
		)
		.slice(0, 5);
	const providerDecisionLines = providerDecisions.length
		? providerDecisions.map((decision) => {
				const provider =
					decision.provider ??
					decision.selectedProvider ??
					decision.fallbackProvider ??
					'provider';
				const parts = [
					decision.surface ? `surface=${decision.surface}` : undefined,
					decision.status ? `status=${decision.status}` : undefined,
					decision.selectedProvider
						? `selected=${decision.selectedProvider}`
						: undefined,
					decision.fallbackProvider
						? `fallback=${decision.fallbackProvider}`
						: undefined,
					decision.reason ? `reason=${decision.reason}` : undefined
				].filter((part): part is string => typeof part === 'string');
				return `- ${provider}: ${parts.join('; ') || 'decision recorded'}`;
			})
		: ['- none recorded'];
	const providerDecisionSummary = record.providerDecisionSummary;
	const providerRecoveryLine = [
		`status=${providerDecisionSummary.recoveryStatus}`,
		`selected=${String(providerDecisionSummary.selected)}`,
		`fallbacks=${String(providerDecisionSummary.fallbacks)}`,
		`degraded=${String(providerDecisionSummary.degraded)}`,
		`errors=${String(providerDecisionSummary.errors)}`
	].join('; ');
	const telephonyMediaLine = [
		`events=${String(record.telephonyMedia.total)}`,
		`starts=${String(record.telephonyMedia.starts)}`,
		`media=${String(record.telephonyMedia.media)}`,
		`stops=${String(record.telephonyMedia.stops)}`,
		`errors=${String(record.telephonyMedia.errors)}`,
		`audioBytes=${String(record.telephonyMedia.audioBytes)}`,
		`carriers=${record.telephonyMedia.carriers.join(', ') || 'none'}`,
		`streams=${record.telephonyMedia.streamIds.join(', ') || 'none'}`
	].join('; ');
	const telephonyMediaLines = record.telephonyMedia.events.length
		? record.telephonyMedia.events.slice(0, 12).map((event) => {
				const parts = [
					event.carrier ? `carrier=${event.carrier}` : undefined,
					event.streamId ? `stream=${event.streamId}` : undefined,
					event.callSid ? `call=${event.callSid}` : undefined,
					event.direction ? `direction=${event.direction}` : undefined,
					event.sequenceNumber ? `seq=${event.sequenceNumber}` : undefined,
					`audioBytes=${String(event.audioBytes)}`
				].filter((part): part is string => typeof part === 'string');
				return `- ${event.event}: ${parts.join('; ')}`;
			})
		: ['- none recorded'];

	return [
		`# Voice incident handoff: ${record.sessionId}`,
		'',
		`- Status: ${record.status}`,
		`- Duration: ${formatMs(record.summary.callDurationMs)}`,
		`- Turns: ${String(record.summary.turnCount)}`,
		`- Errors: ${String(record.summary.errorCount)}`,
		`- Outcome: ${outcomes.join(', ') || 'unknown'}`,
		`- Providers: ${record.providers.map((provider) => provider.provider).join(', ') || 'none recorded'}`,
		`- Open tasks: ${openTasks.join('; ') || 'none'}`,
		`- Top errors: ${topErrors.join('; ') || 'none'}`,
		`- Guardrails: ${String(record.guardrails.blocked)} blocked / ${String(record.guardrails.warned)} warned / ${String(record.guardrails.total)} decisions`,
		`- Provider recovery: ${providerRecoveryLine}`,
		`- Telephony media: ${telephonyMediaLine}`,
		'',
		'## Provider decisions',
		'',
		...providerDecisionLines,
		'',
		'## Telephony media',
		'',
		...telephonyMediaLines,
		'',
		renderVoiceOperationsRecordGuardrailMarkdown(record),
		'',
		'## Next checks',
		'- Review provider decisions and fallback status.',
		'- Review transcript and assistant replies.',
		'- Review handoffs, tools, audit, tasks, and integration delivery.'
	].join('\n');
};

export const renderVoiceOperationsRecordGuardrailMarkdown = (
	record: VoiceOperationsRecord
) => {
	if (record.guardrails.total === 0) {
		return [
			'## Guardrail evidence',
			'',
			'- No assistant.guardrail events were recorded for this session.'
		].join('\n');
	}

	return [
		'## Guardrail evidence',
		'',
		...record.guardrails.decisions.map((decision) => {
			const findings = decision.findings
				.map(
					(finding) =>
						[finding.action, finding.ruleId, finding.label]
							.filter((value): value is string => typeof value === 'string')
							.join(':')
				)
				.filter(Boolean)
				.join(', ');
			return `- assistant.guardrail ${decision.stage ?? 'unknown'}: ${decision.status ?? 'unknown'}; allowed=${String(decision.allowed ?? 'unknown')}; proof=${decision.proof ?? 'runtime'}; findings=${findings || 'none'}`;
		})
	].join('\n');
};

export const renderVoiceOperationsRecordHTML = (
	record: VoiceOperationsRecord,
	options: { incidentHref?: string; title?: string } = {}
) => {
	const providers = record.providers.length
		? record.providers
				.map(
					(provider) =>
						`<article><strong>${escapeHtml(provider.provider)}</strong><span>${String(provider.eventCount)} events</span><span>${formatMs(provider.averageElapsedMs)} avg</span><span>${String(provider.errorCount)} errors</span></article>`
				)
				.join('')
		: '<p class="muted">No provider events recorded.</p>';
	const transcript = record.transcript.length
		? record.transcript
				.map(
					(turn) =>
						`<li><strong>${escapeHtml(turn.id)}</strong>${turn.committedText ? `<p><span class="label">Caller</span>${escapeHtml(turn.committedText)}</p>` : ''}${turn.assistantReplies.map((reply) => `<p><span class="label">Assistant</span>${escapeHtml(reply)}</p>`).join('')}${turn.errors.map((error) => `<p class="error"><span class="label">Error</span>${escapeHtml(error)}</p>`).join('')}</li>`
				)
				.join('')
		: '<li>No transcript turns recorded.</li>';
	const providerDecisions = record.providerDecisions.length
		? record.providerDecisions
				.map(
					(decision) =>
						`<li><strong>${escapeHtml(decision.provider ?? decision.selectedProvider ?? decision.fallbackProvider ?? 'provider')}</strong> <span>${escapeHtml(decision.status ?? decision.type)}</span> ${formatMs(decision.elapsedMs)}${decision.surface ? `<p><span class="label">Surface</span>${escapeHtml(decision.surface)}</p>` : ''}${decision.kind ? `<p><span class="label">Kind</span>${escapeHtml(decision.kind)}</p>` : ''}${decision.selectedProvider ? `<p>Selected: ${escapeHtml(decision.selectedProvider)}</p>` : ''}${decision.fallbackProvider ? `<p>Fallback: ${escapeHtml(decision.fallbackProvider)}</p>` : ''}${decision.error ? `<p class="error">${escapeHtml(decision.error)}</p>` : ''}${decision.reason ? `<p>${escapeHtml(decision.reason)}</p>` : ''}</li>`
				)
				.join('')
		: '<li>No provider decisions recorded.</li>';
	const providerDecisionSummary = record.providerDecisionSummary;
	const handoffs = record.handoffs.length
		? record.handoffs
				.map(
					(handoff) =>
						`<li><strong>${escapeHtml(handoff.fromAgentId ?? 'unknown')}</strong> to <strong>${escapeHtml(handoff.targetAgentId ?? 'unknown')}</strong> <span>${escapeHtml(handoff.status ?? '')}</span><p>${escapeHtml(handoff.summary ?? handoff.reason ?? '')}</p></li>`
				)
				.join('')
		: '<li>No agent handoffs recorded.</li>';
	const tools = record.tools.length
		? record.tools
				.map(
					(tool) =>
						`<li><strong>${escapeHtml(tool.toolName ?? 'tool')}</strong> <span>${escapeHtml(tool.status ?? '')}</span> ${formatMs(tool.elapsedMs)} ${tool.error ? `<p>${escapeHtml(tool.error)}</p>` : ''}</li>`
				)
				.join('')
		: '<li>No tool calls recorded.</li>';
	const reviews = record.reviews?.reviews.length
		? record.reviews.reviews
				.map(
					(review) =>
						`<li><strong>${escapeHtml(review.title)}</strong> <span>${escapeHtml(review.summary.outcome ?? '')}</span><p>${escapeHtml(review.postCall?.summary ?? review.transcript.actual)}</p></li>`
				)
				.join('')
		: '<li>No call reviews recorded.</li>';
	const tasks = record.tasks?.tasks.length
		? record.tasks.tasks
				.map(
					(task) =>
						`<li><strong>${escapeHtml(task.title)}</strong> <span>${escapeHtml(task.status)}</span><p>${escapeHtml(task.recommendedAction)}</p></li>`
				)
				.join('')
		: '<li>No ops tasks recorded.</li>';
	const integrationEvents = record.integrationEvents?.events.length
		? record.integrationEvents.events
				.map(
					(event) =>
						`<li><strong>${escapeHtml(event.type)}</strong> <span>${escapeHtml(event.deliveryStatus ?? 'local')}</span><p>${escapeHtml(event.deliveryError ?? event.deliveredTo ?? '')}</p></li>`
				)
				.join('')
		: '<li>No integration events recorded.</li>';
	const guardrails = record.guardrails.total
		? record.guardrails.decisions
				.map((decision) => {
					const findings =
						decision.findings
							.map((finding) => finding.label ?? finding.ruleId ?? finding.action)
							.filter(
								(value): value is string => typeof value === 'string'
							)
							.join(', ') || 'none';
					return `<li><strong>assistant.guardrail ${escapeHtml(decision.stage ?? 'unknown')}</strong> <span>${escapeHtml(decision.status ?? '')}</span><p>Allowed: ${escapeHtml(String(decision.allowed ?? 'unknown'))} · Proof: ${escapeHtml(decision.proof ?? 'runtime')}${decision.turnId ? ` · Turn: ${escapeHtml(decision.turnId)}` : ''}</p><p>${escapeHtml(findings)}</p></li>`;
				})
				.join('')
		: '<li>No assistant.guardrail events recorded.</li>';
	const telephonyMedia = record.telephonyMedia.events.length
		? record.telephonyMedia.events
				.slice(0, 50)
				.map((event) => {
					const details = [
						event.carrier ? `Carrier: ${event.carrier}` : undefined,
						event.streamId ? `Stream: ${event.streamId}` : undefined,
						event.callSid ? `Call: ${event.callSid}` : undefined,
						event.direction ? `Direction: ${event.direction}` : undefined,
						event.sequenceNumber ? `Seq: ${event.sequenceNumber}` : undefined,
						`Audio bytes: ${String(event.audioBytes)}`
					].filter((detail): detail is string => typeof detail === 'string');
					return `<li><strong>${escapeHtml(event.event)}</strong> <span>${escapeHtml(new Date(event.at).toLocaleString())}</span><p>${escapeHtml(details.join(' · '))}</p></li>`;
				})
				.join('')
		: '<li>No telephony media trace events recorded.</li>';
	const snippet = escapeHtml(`app.use(
	createVoiceOperationsRecordRoutes({
		audit: auditStore,
		integrationEvents: opsEvents,
		htmlPath: '/voice-ops/:sessionId',
		path: '/api/voice-ops/:sessionId',
		redact: {
			keys: ['authorization', 'apiKey', 'token']
		},
		reviews: callReviews,
		store: traceStore,
		tasks: opsTasks
	})
);`);
	const incidentMarkdown = escapeHtml(
		renderVoiceOperationsRecordIncidentMarkdown(record)
	);
	const incidentLink = options.incidentHref
		? `<a href="${escapeHtml(options.incidentHref)}">Download incident.md</a>`
		: '';

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(options.title ?? 'Voice Operations Record')}</title><style>body{background:#101417;color:#f9f4e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1120px;padding:32px}.eyebrow{color:#fbbf24;font-size:.8rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,4.8rem);line-height:.9;margin:.2rem 0 1rem}.status{border:1px solid #475569;border-radius:999px;display:inline-flex;padding:8px 12px}.healthy{color:#86efac}.warning{color:#fbbf24}.failed,.error{color:#fca5a5}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:20px 0}.card,.primitive{background:#182025;border:1px solid #2d3a43;border-radius:20px;padding:16px}.card span,.muted,.label{color:#a9b4bd}.label{display:block;font-size:.72rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.card strong{display:block;font-size:2rem}section{margin-top:28px}article{display:grid;gap:8px}ul{display:grid;gap:10px;list-style:none;padding:0}li{background:#182025;border:1px solid #2d3a43;border-radius:16px;padding:14px}pre{background:#080d10;border:1px solid #2d3a43;border-radius:16px;color:#dbeafe;overflow:auto;padding:14px}.hero-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.hero-actions a{background:#fbbf24;border-radius:999px;color:#111827;font-weight:900;padding:10px 14px;text-decoration:none}.two-column{display:grid;gap:18px;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr)}@media(max-width:860px){main{padding:20px}.two-column{grid-template-columns:1fr}}</style></head><body><main><p class="eyebrow">Call log replacement</p><h1>${escapeHtml(options.title ?? 'Voice Operations Record')}</h1><p class="status ${escapeHtml(record.status)}">${escapeHtml(record.status)}</p><div class="hero-actions"><a href="#transcript">Transcript</a><a href="#provider-decisions">Provider decisions</a><a href="#telephony-media">Telephony media</a><a href="#guardrails">Guardrails</a><a href="#incident-handoff">Incident handoff</a>${incidentLink}</div><section class="grid"><div class="card"><span>Events</span><strong>${String(record.summary.eventCount)}</strong></div><div class="card"><span>Turns</span><strong>${String(record.summary.turnCount)}</strong></div><div class="card"><span>Errors</span><strong>${String(record.summary.errorCount)}</strong></div><div class="card"><span>Duration</span><strong>${formatMs(record.summary.callDurationMs)}</strong></div><div class="card"><span>Provider recovery</span><strong>${escapeHtml(providerDecisionSummary.recoveryStatus)}</strong><span>${String(providerDecisionSummary.fallbacks)} fallback / ${String(providerDecisionSummary.degraded)} degraded / ${String(providerDecisionSummary.errors)} errors</span></div><div class="card"><span>Telephony media</span><strong>${String(record.telephonyMedia.media)}</strong><span>${String(record.telephonyMedia.starts)} start / ${String(record.telephonyMedia.stops)} stop / ${String(record.telephonyMedia.errors)} errors</span></div><div class="card"><span>Guardrails</span><strong>${String(record.guardrails.blocked)}</strong></div><div class="card"><span>Audit</span><strong>${String(record.audit?.total ?? 0)}</strong></div><div class="card"><span>Reviews</span><strong>${String(record.reviews?.total ?? 0)}</strong></div><div class="card"><span>Tasks</span><strong>${String(record.tasks?.total ?? 0)}</strong></div><div class="card"><span>Integrations</span><strong>${String(record.integrationEvents?.total ?? 0)}</strong></div></section><section class="two-column"><div><h2 id="transcript">Transcript</h2><ul>${transcript}</ul></div><div><h2 id="provider-decisions">Provider Decisions</h2><ul>${providerDecisions}</ul></div></section><section id="telephony-media"><h2>Telephony Media</h2><p class="muted">Live <code>client.telephony_media</code> stream lifecycle evidence attached to this session. Carriers: ${escapeHtml(record.telephonyMedia.carriers.join(', ') || 'none')}. Streams: ${escapeHtml(record.telephonyMedia.streamIds.join(', ') || 'none')}.</p><ul>${telephonyMedia}</ul></section><section id="guardrails"><h2>Guardrail Evidence</h2><p class="muted">Live <code>assistant.guardrail</code> decisions attached to this session.</p><ul>${guardrails}</ul></section><section id="incident-handoff"><h2>Copyable Incident Handoff</h2><p class="muted">Paste this into Slack, Linear, Zendesk, or an incident review. ${incidentLink}</p><pre><code>${incidentMarkdown}</code></pre></section><section class="primitive"><p class="eyebrow">Copy into your app</p><h2><code>createVoiceOperationsRecordRoutes(...)</code> gives every call one debuggable object</h2><p class="muted">Use this as the support/debug payload across traces, provider routing, tools, handoffs, guardrails, audit, latency, replay, reviews, tasks, media streams, and webhook delivery.</p><pre><code>${snippet}</code></pre></section><section><h2>Provider Summary</h2><div class="grid">${providers}</div></section><section><h2>Handoffs</h2><ul>${handoffs}</ul></section><section><h2>Tools</h2><ul>${tools}</ul></section><section><h2>Reviews</h2><ul>${reviews}</ul></section><section><h2>Tasks</h2><ul>${tasks}</ul></section><section><h2>Integration Events</h2><ul>${integrationEvents}</ul></section></main></body></html>`;
};

export const createVoiceOperationsRecordRoutes = (
	options: VoiceOperationsRecordRoutesOptions
) => {
	const path = options.path ?? '/api/voice-operations/:sessionId';
	const htmlPath =
		options.htmlPath === undefined ? '/voice-operations/:sessionId' : options.htmlPath;
	const incidentPath =
		options.incidentPath === undefined ? `${path}/incident.md` : options.incidentPath;
	const incidentHtmlPath =
		options.incidentHtmlPath === undefined && htmlPath
			? `${htmlPath}/incident.md`
			: options.incidentHtmlPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-operations-record'
	});
	const buildRecord = (sessionId: string) =>
		buildVoiceOperationsRecord({
			audit: options.audit,
			evaluation: options.evaluation,
			events: options.events,
			integrationEvents: options.integrationEvents,
			redact: options.redact,
			reviews: options.reviews,
			sessionId,
			store: options.store,
			tasks: options.tasks
		});
	const getSessionId = (params: Record<string, string | undefined>) =>
		params.sessionId ?? '';

	routes.get(path, async ({ params }: { params: Record<string, string | undefined> }) =>
		Response.json(await buildRecord(getSessionId(params)))
	);
	const incidentHandler = async ({
		params
	}: {
		params: Record<string, string | undefined>;
	}) => {
		const record = await buildRecord(getSessionId(params));
		const body = await (
			options.renderIncidentMarkdown ??
			renderVoiceOperationsRecordIncidentMarkdown
		)(record);

		return new Response(body, {
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				...options.headers
			}
		});
	};

	if (incidentPath) {
		routes.get(incidentPath, incidentHandler);
	}

	if (htmlPath) {
		routes.get(htmlPath, async ({ params }: { params: Record<string, string | undefined> }) => {
			const record = await buildRecord(getSessionId(params));
			const body = await (
				options.render ??
				((input) =>
					renderVoiceOperationsRecordHTML(input, {
						incidentHref: incidentHtmlPath
							? resolveRoutePath(incidentHtmlPath, input.sessionId)
							: undefined,
						title: options.title
					}))
			)(record);
			return new Response(body, {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		});
	}
	if (incidentHtmlPath && incidentHtmlPath !== incidentPath) {
		routes.get(incidentHtmlPath, incidentHandler);
	}

	return routes;
};
