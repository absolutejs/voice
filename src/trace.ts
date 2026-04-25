export type VoiceTraceEventType =
	| 'agent.handoff'
	| 'agent.model'
	| 'agent.result'
	| 'agent.tool'
	| 'call.lifecycle'
	| 'session.error'
	| 'turn.assistant'
	| 'turn.committed'
	| 'turn.cost'
	| 'turn.transcript';

export type VoiceTraceEvent<
	TPayload extends Record<string, unknown> = Record<string, unknown>
> = {
	at: number;
	id?: string;
	metadata?: Record<string, unknown>;
	payload: TPayload;
	scenarioId?: string;
	sessionId: string;
	traceId?: string;
	turnId?: string;
	type: VoiceTraceEventType;
};

export type StoredVoiceTraceEvent<
	TPayload extends Record<string, unknown> = Record<string, unknown>
> = VoiceTraceEvent<TPayload> & {
	id: string;
};

export type VoiceTraceEventFilter = {
	limit?: number;
	scenarioId?: string;
	sessionId?: string;
	traceId?: string;
	turnId?: string;
	type?: VoiceTraceEventType | VoiceTraceEventType[];
};

export type VoiceTraceEventStore<
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
> = {
	append: (event: VoiceTraceEvent | TEvent) => Promise<TEvent>;
	get: (id: string) => Promise<TEvent | undefined>;
	list: (filter?: VoiceTraceEventFilter) => Promise<TEvent[]>;
	remove: (id: string) => Promise<void>;
};

export type VoiceTraceSummary = {
	assistantReplyCount: number;
	callDurationMs?: number;
	cost: {
		estimatedRelativeCostUnits: number;
		totalBillableAudioMs: number;
	};
	endedAt?: number;
	errorCount: number;
	eventCount: number;
	failed: boolean;
	handoffCount: number;
	modelCallCount: number;
	sessionId?: string;
	startedAt?: number;
	toolCallCount: number;
	toolErrorCount: number;
	traceId?: string;
	transcriptCount: number;
	turnCount: number;
};

export type VoiceTraceIssueSeverity = 'error' | 'warning';

export type VoiceTraceIssue = {
	code: string;
	message: string;
	severity: VoiceTraceIssueSeverity;
};

export type VoiceTraceEvaluationOptions = {
	maxHandoffs?: number;
	maxModelCallsPerTurn?: number;
	maxToolErrors?: number;
	requireAssistantReply?: boolean;
	requireCompletedCall?: boolean;
	requireTranscript?: boolean;
	requireTurn?: boolean;
};

export type VoiceTraceEvaluation = {
	issues: VoiceTraceIssue[];
	pass: boolean;
	summary: VoiceTraceSummary;
};

export const createVoiceTraceEventId = (event: {
	at?: number;
	sessionId: string;
	turnId?: string;
	type: VoiceTraceEventType;
}) =>
	[
		event.sessionId,
		event.turnId ?? 'session',
		event.type,
		String(event.at ?? Date.now()),
		crypto.randomUUID()
	]
		.map(encodeURIComponent)
		.join(':');

export const createVoiceTraceEvent = <
	TEvent extends VoiceTraceEvent = VoiceTraceEvent
>(
	event: TEvent
): StoredVoiceTraceEvent<TEvent['payload']> => ({
	...event,
	at: event.at,
	id:
		event.id ??
		createVoiceTraceEventId({
			at: event.at,
			sessionId: event.sessionId,
			turnId: event.turnId,
			type: event.type
		})
});

const matchesTraceFilter = (
	event: StoredVoiceTraceEvent,
	filter: VoiceTraceEventFilter
) => {
	if (filter.sessionId !== undefined && event.sessionId !== filter.sessionId) {
		return false;
	}

	if (filter.turnId !== undefined && event.turnId !== filter.turnId) {
		return false;
	}

	if (filter.scenarioId !== undefined && event.scenarioId !== filter.scenarioId) {
		return false;
	}

	if (filter.traceId !== undefined && event.traceId !== filter.traceId) {
		return false;
	}

	if (filter.type !== undefined) {
		const types = Array.isArray(filter.type) ? filter.type : [filter.type];
		if (!types.includes(event.type)) {
			return false;
		}
	}

	return true;
};

export const filterVoiceTraceEvents = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(
	events: TEvent[],
	filter: VoiceTraceEventFilter = {}
) => {
	const sorted = events
		.filter((event) => matchesTraceFilter(event, filter))
		.sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));

	return typeof filter.limit === 'number' && filter.limit >= 0
		? sorted.slice(0, filter.limit)
		: sorted;
};

export const createVoiceMemoryTraceEventStore = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(): VoiceTraceEventStore<TEvent> => {
	const events = new Map<string, TEvent>();

	const append: VoiceTraceEventStore<TEvent>['append'] = async (event) => {
		const stored = createVoiceTraceEvent(event) as TEvent;
		events.set(stored.id, stored);
		return stored;
	};

	const get = async (id: string) => events.get(id);

	const list = async (filter?: VoiceTraceEventFilter) =>
		filterVoiceTraceEvents([...events.values()], filter);

	const remove = async (id: string) => {
		events.delete(id);
	};

	return { append, get, list, remove };
};

export const exportVoiceTrace = async (input: {
	filter?: VoiceTraceEventFilter;
	store: VoiceTraceEventStore;
}) => ({
	exportedAt: Date.now(),
	events: await input.store.list(input.filter),
	filter: input.filter
});

const toNumber = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : 0;

const toOptionalNumber = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

const formatTraceValue = (value: unknown): string => {
	if (value === undefined || value === null) {
		return '';
	}

	if (typeof value === 'string') {
		return value;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

export const summarizeVoiceTrace = (
	events: StoredVoiceTraceEvent[]
): VoiceTraceSummary => {
	const sorted = filterVoiceTraceEvents(events);
	const firstEvent = sorted[0];
	const lastEvent = sorted.at(-1);
	const lifecycleEvents = sorted.filter((event) => event.type === 'call.lifecycle');
	const startEvent = lifecycleEvents.find((event) => event.payload.type === 'start');
	const endEvent = lifecycleEvents
		.toReversed()
		.find((event) => event.payload.type === 'end');
	const costEvents = sorted.filter((event) => event.type === 'turn.cost');
	const toolEvents = sorted.filter((event) => event.type === 'agent.tool');
	const startedAt = startEvent?.at ?? firstEvent?.at;
	const endedAt = endEvent?.at ?? lastEvent?.at;
	const failed =
		sorted.some((event) => event.type === 'session.error') ||
		endEvent?.payload.disposition === 'failed';

	return {
		assistantReplyCount: sorted.filter((event) => event.type === 'turn.assistant')
			.length,
		callDurationMs:
			startedAt !== undefined && endedAt !== undefined
				? Math.max(0, endedAt - startedAt)
				: undefined,
		cost: {
			estimatedRelativeCostUnits: costEvents.reduce(
				(total, event) =>
					total + toNumber(event.payload.estimatedRelativeCostUnits),
				0
			),
			totalBillableAudioMs: costEvents.reduce(
				(total, event) => total + toNumber(event.payload.totalBillableAudioMs),
				0
			)
		},
		endedAt,
		errorCount: sorted.filter((event) => event.type === 'session.error').length,
		eventCount: sorted.length,
		failed,
		handoffCount: sorted.filter((event) => event.type === 'agent.handoff').length,
		modelCallCount: sorted.filter((event) => event.type === 'agent.model').length,
		sessionId: firstEvent?.sessionId,
		startedAt,
		toolCallCount: toolEvents.length,
		toolErrorCount: toolEvents.filter((event) => event.payload.status === 'error')
			.length,
		traceId: firstEvent?.traceId,
		transcriptCount: sorted.filter((event) => event.type === 'turn.transcript')
			.length,
		turnCount: sorted.filter((event) => event.type === 'turn.committed').length
	};
};

export const evaluateVoiceTrace = (
	events: StoredVoiceTraceEvent[],
	options: VoiceTraceEvaluationOptions = {}
): VoiceTraceEvaluation => {
	const summary = summarizeVoiceTrace(events);
	const issues: VoiceTraceIssue[] = [];
	const maxHandoffs = options.maxHandoffs ?? 3;
	const maxToolErrors = options.maxToolErrors ?? 0;
	const maxModelCallsPerTurn = options.maxModelCallsPerTurn ?? 6;
	const turnCountForRatio = Math.max(1, summary.turnCount);

	if (options.requireCompletedCall !== false && !summary.endedAt) {
		issues.push({
			code: 'call-not-ended',
			message: 'Trace does not include a call end lifecycle event.',
			severity: 'warning'
		});
	}

	if (summary.failed) {
		issues.push({
			code: 'session-error',
			message: 'Trace contains a session error or failed call disposition.',
			severity: 'error'
		});
	}

	if (options.requireTranscript !== false && summary.transcriptCount === 0) {
		issues.push({
			code: 'missing-transcript',
			message: 'Trace does not include any transcript events.',
			severity: 'error'
		});
	}

	if (options.requireTurn !== false && summary.turnCount === 0) {
		issues.push({
			code: 'missing-turn',
			message: 'Trace does not include any committed turns.',
			severity: 'error'
		});
	}

	if (
		options.requireAssistantReply !== false &&
		summary.turnCount > 0 &&
		summary.assistantReplyCount === 0
	) {
		issues.push({
			code: 'missing-assistant-reply',
			message: 'Trace has committed turns but no assistant replies.',
			severity: 'warning'
		});
	}

	if (summary.toolErrorCount > maxToolErrors) {
		issues.push({
			code: 'tool-errors',
			message: `Trace has ${summary.toolErrorCount} tool error(s), above the allowed ${maxToolErrors}.`,
			severity: 'error'
		});
	}

	if (summary.handoffCount > maxHandoffs) {
		issues.push({
			code: 'too-many-handoffs',
			message: `Trace has ${summary.handoffCount} handoff(s), above the allowed ${maxHandoffs}.`,
			severity: 'warning'
		});
	}

	if (summary.modelCallCount / turnCountForRatio > maxModelCallsPerTurn) {
		issues.push({
			code: 'too-many-model-calls',
			message: `Trace averages more than ${maxModelCallsPerTurn} model calls per committed turn.`,
			severity: 'warning'
		});
	}

	return {
		issues,
		pass: !issues.some((issue) => issue.severity === 'error'),
		summary
	};
};

const renderTraceEventMarkdown = (
	event: StoredVoiceTraceEvent,
	startedAt: number | undefined
) => {
	const offset =
		startedAt === undefined ? `${event.at}` : `+${Math.max(0, event.at - startedAt)}ms`;
	const label = `- ${offset} [${event.type}]`;
	switch (event.type) {
		case 'turn.transcript':
			return `${label} ${event.payload.isFinal ? 'final' : 'partial'} "${formatTraceValue(event.payload.text)}"`;
		case 'turn.committed':
			return `${label} committed "${formatTraceValue(event.payload.text)}"`;
		case 'turn.assistant':
			return event.payload.text
				? `${label} assistant "${formatTraceValue(event.payload.text)}"`
				: `${label} ${formatTraceValue(event.payload.status)}`;
		case 'agent.tool':
			return `${label} ${formatTraceValue(event.payload.toolName)} ${formatTraceValue(event.payload.status)}`;
		case 'agent.handoff':
			return `${label} ${formatTraceValue(event.payload.fromAgentId)} -> ${formatTraceValue(event.payload.targetAgentId)}`;
		case 'session.error':
			return `${label} ${formatTraceValue(event.payload.error)}`;
		case 'call.lifecycle':
			return `${label} ${formatTraceValue(event.payload.type)} ${formatTraceValue(event.payload.disposition)}`.trim();
		default:
			return `${label} ${formatTraceValue(event.payload)}`;
	}
};

export const renderVoiceTraceMarkdown = (
	events: StoredVoiceTraceEvent[],
	options: {
		title?: string;
		evaluation?: VoiceTraceEvaluationOptions;
	} = {}
) => {
	const sorted = filterVoiceTraceEvents(events);
	const summary = summarizeVoiceTrace(sorted);
	const evaluation = evaluateVoiceTrace(sorted, options.evaluation);
	const lines = [
		`# ${options.title ?? `Voice Trace ${summary.sessionId ?? ''}`.trim()}`,
		'',
		`Pass: ${evaluation.pass ? 'yes' : 'no'}`,
		`Session: ${summary.sessionId ?? 'unknown'}`,
		`Events: ${summary.eventCount}`,
		`Turns: ${summary.turnCount}`,
		`Transcripts: ${summary.transcriptCount}`,
		`Assistant replies: ${summary.assistantReplyCount}`,
		`Model calls: ${summary.modelCallCount}`,
		`Tool calls: ${summary.toolCallCount}`,
		`Handoffs: ${summary.handoffCount}`,
		`Errors: ${summary.errorCount}`,
		`Estimated cost units: ${summary.cost.estimatedRelativeCostUnits}`,
		''
	];

	if (evaluation.issues.length > 0) {
		lines.push('## Issues', '');
		for (const issue of evaluation.issues) {
			lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
		}
		lines.push('');
	}

	lines.push('## Timeline', '');
	for (const event of sorted) {
		lines.push(renderTraceEventMarkdown(event, summary.startedAt));
	}

	return lines.join('\n');
};

export const renderVoiceTraceHTML = (
	events: StoredVoiceTraceEvent[],
	options: {
		title?: string;
		evaluation?: VoiceTraceEvaluationOptions;
	} = {}
) => {
	const markdown = renderVoiceTraceMarkdown(events, options);
	const summary = summarizeVoiceTrace(events);
	const evaluation = evaluateVoiceTrace(events, options.evaluation);
	const eventRows = filterVoiceTraceEvents(events)
		.map((event) => {
			const offset =
				summary.startedAt === undefined
					? event.at
					: Math.max(0, event.at - summary.startedAt);
			return [
				'<tr>',
				`<td>${escapeHtml(String(offset))}</td>`,
				`<td>${escapeHtml(event.type)}</td>`,
				`<td>${escapeHtml(event.turnId ?? '')}</td>`,
				`<td><code>${escapeHtml(JSON.stringify(event.payload))}</code></td>`,
				'</tr>'
			].join('');
		})
		.join('\n');

	return [
		'<!doctype html>',
		'<html lang="en">',
		'<head>',
		'<meta charset="utf-8" />',
		'<meta name="viewport" content="width=device-width, initial-scale=1" />',
		`<title>${escapeHtml(options.title ?? 'Voice Trace')}</title>`,
		'<style>',
		'body{font-family:ui-sans-serif,system-ui,sans-serif;margin:2rem;line-height:1.45;background:#f8f7f2;color:#181713}',
		'main{max-width:1100px;margin:auto}',
		'.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.75rem;margin:1rem 0}',
		'.card{background:white;border:1px solid #ded9cc;border-radius:12px;padding:1rem}',
		'.pass{color:#126b3a}.fail{color:#9d2222}',
		'table{border-collapse:collapse;width:100%;background:white;border:1px solid #ded9cc}',
		'th,td{border-bottom:1px solid #eee8dc;padding:.65rem;text-align:left;vertical-align:top}',
		'code{white-space:pre-wrap;word-break:break-word}',
		'pre{background:#181713;color:#f8f7f2;padding:1rem;border-radius:12px;overflow:auto}',
		'</style>',
		'</head>',
		'<body><main>',
		`<h1>${escapeHtml(options.title ?? `Voice Trace ${summary.sessionId ?? ''}`.trim())}</h1>`,
		`<p class="${evaluation.pass ? 'pass' : 'fail'}">QA: ${evaluation.pass ? 'pass' : 'fail'}</p>`,
		'<section class="summary">',
		`<div class="card"><strong>Events</strong><br>${summary.eventCount}</div>`,
		`<div class="card"><strong>Turns</strong><br>${summary.turnCount}</div>`,
		`<div class="card"><strong>Transcripts</strong><br>${summary.transcriptCount}</div>`,
		`<div class="card"><strong>Tool errors</strong><br>${summary.toolErrorCount}</div>`,
		`<div class="card"><strong>Cost units</strong><br>${summary.cost.estimatedRelativeCostUnits}</div>`,
		'</section>',
		'<h2>Timeline</h2>',
		'<table><thead><tr><th>Offset ms</th><th>Type</th><th>Turn</th><th>Payload</th></tr></thead><tbody>',
		eventRows,
		'</tbody></table>',
		'<h2>Markdown Export</h2>',
		`<pre>${escapeHtml(markdown)}</pre>`,
		'</main></body></html>'
	].join('\n');
};

export const buildVoiceTraceReplay = (
	events: StoredVoiceTraceEvent[],
	options: {
		evaluation?: VoiceTraceEvaluationOptions;
		title?: string;
	} = {}
) => ({
	evaluation: evaluateVoiceTrace(events, options.evaluation),
	html: renderVoiceTraceHTML(events, options),
	markdown: renderVoiceTraceMarkdown(events, options),
	summary: summarizeVoiceTrace(events)
});
