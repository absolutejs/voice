import { Elysia } from 'elysia';
import {
	evaluateVoiceTrace,
	exportVoiceTrace,
	filterVoiceTraceEvents,
	redactVoiceTraceEvents,
	renderVoiceTraceHTML,
	renderVoiceTraceMarkdown,
	summarizeVoiceTrace,
	type StoredVoiceTraceEvent,
	type VoiceTraceEventFilter,
	type VoiceTraceEventStore,
	type VoiceTraceEventType,
	type VoiceTraceRedactionConfig
} from './trace';

export type VoiceDiagnosticsRoutesOptions = {
	evaluation?: Parameters<typeof evaluateVoiceTrace>[1];
	headers?: HeadersInit;
	name?: string;
	path?: string;
	redact?: VoiceTraceRedactionConfig;
	store: VoiceTraceEventStore;
	title?: string;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const getString = (value: unknown) =>
	typeof value === 'string' && value.trim() ? value : undefined;

const getNumber = (value: unknown) => {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string'
				? Number(value)
				: undefined;
	return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
};

const getBoolean = (value: unknown) =>
	value === true || value === 'true' || value === '1';

const parseTraceTypeFilter = (value: unknown): VoiceTraceEventType | VoiceTraceEventType[] | undefined => {
	if (typeof value !== 'string' || !value.trim()) {
		return undefined;
	}
	const types = value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean) as VoiceTraceEventType[];
	return types.length <= 1 ? types[0] : types;
};

export const resolveVoiceDiagnosticsTraceFilter = (
	query: Record<string, unknown>
): VoiceTraceEventFilter => ({
	limit: getNumber(query.limit),
	scenarioId: getString(query.scenarioId),
	sessionId: getString(query.sessionId),
	traceId: getString(query.traceId),
	turnId: getString(query.turnId),
	type: parseTraceTypeFilter(query.type)
});

const filterByDiagnosticsQuery = (
	events: StoredVoiceTraceEvent[],
	query: Record<string, unknown>
) => {
	const provider = getString(query.provider);
	const status = getString(query.status);
	const since = getNumber(query.since);
	const until = getNumber(query.until);
	return filterVoiceTraceEvents(events, resolveVoiceDiagnosticsTraceFilter(query)).filter(
		(event) =>
			(!provider || event.payload.provider === provider) &&
			(!status || event.payload.providerStatus === status || event.payload.status === status) &&
			(since === undefined || event.at >= since) &&
			(until === undefined || event.at <= until)
	);
};

export const buildVoiceDiagnosticsMarkdown = (
	events: StoredVoiceTraceEvent[],
	options: {
		evaluation?: Parameters<typeof evaluateVoiceTrace>[1];
		title?: string;
	} = {}
) => {
	const summary = summarizeVoiceTrace(events);
	const evaluation = evaluateVoiceTrace(events, options.evaluation);
	const trace = renderVoiceTraceMarkdown(events, {
		evaluation: options.evaluation,
		title: options.title ?? `Voice Diagnostics ${summary.sessionId ?? ''}`.trim()
	});

	return [
		`# ${options.title ?? 'Voice Diagnostics Bug Report'}`,
		'',
		`Session: ${summary.sessionId ?? 'unknown'}`,
		`Pass: ${evaluation.pass ? 'yes' : 'no'}`,
		`Events: ${summary.eventCount}`,
		`Turns: ${summary.turnCount}`,
		`Errors: ${summary.errorCount}`,
		`Tool errors: ${summary.toolErrorCount}`,
		`Estimated cost units: ${summary.cost.estimatedRelativeCostUnits}`,
		'',
		'## Issues',
		'',
		evaluation.issues.length
			? evaluation.issues
					.map((issue) => `- [${issue.severity}] ${issue.code}: ${issue.message}`)
					.join('\n')
			: '- none',
		'',
		'## Trace',
		'',
		trace
	].join('\n');
};

const renderDiagnosticsIndex = (input: {
	basePath: string;
	events: StoredVoiceTraceEvent[];
	title: string;
}) => {
	const sessions = new Map<string, StoredVoiceTraceEvent[]>();
	for (const event of input.events) {
		sessions.set(event.sessionId, [...(sessions.get(event.sessionId) ?? []), event]);
	}
	const rows = [...sessions.entries()]
		.sort(([, left], [, right]) => (right.at(-1)?.at ?? 0) - (left.at(-1)?.at ?? 0))
		.slice(0, 50)
		.map(([sessionId, events]) => {
			const summary = summarizeVoiceTrace(events);
			const encoded = encodeURIComponent(sessionId);
			return `<tr><td>${escapeHtml(sessionId)}</td><td>${summary.eventCount}</td><td>${summary.turnCount}</td><td>${summary.errorCount}</td><td><a href="${input.basePath}/html?sessionId=${encoded}&redact=true">HTML</a> · <a href="${input.basePath}/markdown?sessionId=${encoded}&redact=true">Markdown</a> · <a href="${input.basePath}/json?sessionId=${encoded}&redact=true">JSON</a></td></tr>`;
		})
		.join('');
	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(input.title)}</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:2rem;background:#f8f7f2;color:#181713}main{max-width:1100px;margin:auto}table{width:100%;border-collapse:collapse;background:white}td,th{border-bottom:1px solid #eee;padding:.7rem;text-align:left}a{color:#9a3412}</style></head><body><main><h1>${escapeHtml(input.title)}</h1><p>Recent voice trace diagnostics. Exports support filters: sessionId, traceId, turnId, scenarioId, type, provider, status, since, until, limit, redact.</p><table><thead><tr><th>Session</th><th>Events</th><th>Turns</th><th>Errors</th><th>Exports</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
};

const withRedaction = (
	events: StoredVoiceTraceEvent[],
	query: Record<string, unknown>,
	defaultRedact: VoiceTraceRedactionConfig | undefined
) => {
	const shouldRedact =
		query.redact === undefined ? defaultRedact : getBoolean(query.redact);
	return shouldRedact ? redactVoiceTraceEvents(events, shouldRedact) : events;
};

export const createVoiceDiagnosticsRoutes = (
	options: VoiceDiagnosticsRoutesOptions
) => {
	const path = options.path ?? '/diagnostics';
	const title = options.title ?? 'AbsoluteJS Voice Diagnostics';
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-diagnostics'
	});

	routes.get(path, async () => {
		const events = await options.store.list();
		return new Response(renderDiagnosticsIndex({ basePath: path, events, title }), {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				...options.headers
			}
		});
	});
	routes.get(`${path}/json`, async ({ query }) => {
		const events = filterByDiagnosticsQuery(await options.store.list(), query);
		const redacted = withRedaction(events, query, options.redact);
		return Response.json({
			...(await exportVoiceTrace({
				filter: resolveVoiceDiagnosticsTraceFilter(query),
				redact: false,
				store: {
					...options.store,
					list: async () => redacted
				}
			})),
			filteredCount: events.length,
			redacted: redacted !== events
		});
	});
	routes.get(`${path}/markdown`, async ({ query }) => {
		const events = withRedaction(
			filterByDiagnosticsQuery(await options.store.list(), query),
			query,
			options.redact ?? true
		);
		const body = buildVoiceDiagnosticsMarkdown(events, {
			evaluation: options.evaluation,
			title
		});
		return new Response(body, {
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				...options.headers
			}
		});
	});
	routes.get(`${path}/html`, async ({ query }) => {
		const events = withRedaction(
			filterByDiagnosticsQuery(await options.store.list(), query),
			query,
			options.redact ?? true
		);
		const body = renderVoiceTraceHTML(events, {
			evaluation: options.evaluation,
			title
		});
		return new Response(body, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				...options.headers
			}
		});
	});

	return routes;
};
