import { Elysia } from 'elysia';
import type {
	StoredVoiceAuditEvent,
	VoiceAuditEventFilter,
	VoiceAuditEventStore,
	VoiceAuditEventType,
	VoiceAuditOutcome
} from './audit';
import {
	exportVoiceAuditTrail,
	renderVoiceAuditHTML,
	renderVoiceAuditMarkdown
} from './auditExport';

export type VoiceAuditTrailSummary = {
	byActor: Array<[string, number]>;
	byOutcome: Array<[string, number]>;
	byResourceType: Array<[string, number]>;
	byType: Array<[VoiceAuditEventType, number]>;
	errors: number;
	latestAt?: number;
	total: number;
};

export type VoiceAuditTrailReport = {
	checkedAt: number;
	events: StoredVoiceAuditEvent[];
	filter: VoiceAuditEventFilter;
	summary: VoiceAuditTrailSummary;
};

export type VoiceAuditTrailOptions = {
	filter?: VoiceAuditEventFilter;
	limit?: number;
	store: VoiceAuditEventStore;
};

export type VoiceAuditTrailRoutesOptions = VoiceAuditTrailOptions & {
	exportHtmlPath?: false | string;
	exportPath?: false | string;
	headers?: HeadersInit;
	htmlPath?: false | string;
	name?: string;
	path?: string;
	render?: (report: VoiceAuditTrailReport) => string | Promise<string>;
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
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

const getNumber = (value: unknown) => {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	return undefined;
};

const parseType = (value: unknown): VoiceAuditEventType | undefined => {
	const text = getString(value);
	return text &&
		[
			'handoff',
			'operator.action',
			'provider.call',
			'retention.policy',
			'tool.call'
		].includes(text)
		? (text as VoiceAuditEventType)
		: undefined;
};

const parseOutcome = (value: unknown): VoiceAuditOutcome | undefined => {
	const text = getString(value);
	return text && ['error', 'skipped', 'success'].includes(text)
		? (text as VoiceAuditOutcome)
		: undefined;
};

const parseBoolean = (value: unknown, fallback = false) => {
	const text = getString(value)?.toLowerCase();
	if (['1', 'true', 'yes'].includes(text ?? '')) {
		return true;
	}
	if (['0', 'false', 'no'].includes(text ?? '')) {
		return false;
	}
	return fallback;
};

const parseExportFormat = (value: unknown) => {
	const text = getString(value)?.toLowerCase();
	return text === 'markdown' || text === 'md'
		? 'markdown'
		: text === 'html'
			? 'html'
			: 'json';
};

const increment = <TKey extends string>(
	counts: Map<TKey, number>,
	key: TKey | undefined
) => {
	if (!key) {
		return;
	}

	counts.set(key, (counts.get(key) ?? 0) + 1);
};

const sortedCounts = <TKey extends string>(counts: Map<TKey, number>) =>
	[...counts.entries()].sort(
		([leftKey, leftCount], [rightKey, rightCount]) =>
			rightCount - leftCount || leftKey.localeCompare(rightKey)
	);

export const resolveVoiceAuditTrailFilter = (
	query: Record<string, unknown> = {},
	base: VoiceAuditEventFilter = {}
): VoiceAuditEventFilter => ({
	...base,
	actorId: getString(query.actorId) ?? base.actorId,
	after: getNumber(query.after) ?? base.after,
	afterOrAt: getNumber(query.afterOrAt) ?? base.afterOrAt,
	before: getNumber(query.before) ?? base.before,
	beforeOrAt: getNumber(query.beforeOrAt) ?? base.beforeOrAt,
	limit: getNumber(query.limit) ?? base.limit,
	outcome: parseOutcome(query.outcome) ?? base.outcome,
	resourceId: getString(query.resourceId) ?? base.resourceId,
	resourceType: getString(query.resourceType) ?? base.resourceType,
	sessionId: getString(query.sessionId) ?? base.sessionId,
	traceId: getString(query.traceId) ?? base.traceId,
	type: parseType(query.type) ?? base.type
});

export const summarizeVoiceAuditTrail = (
	events: StoredVoiceAuditEvent[]
): VoiceAuditTrailSummary => {
	const byActor = new Map<string, number>();
	const byOutcome = new Map<string, number>();
	const byResourceType = new Map<string, number>();
	const byType = new Map<VoiceAuditEventType, number>();

	for (const event of events) {
		increment(byActor, event.actor?.id);
		increment(byOutcome, event.outcome);
		increment(byResourceType, event.resource?.type);
		increment(byType, event.type);
	}

	return {
		byActor: sortedCounts(byActor),
		byOutcome: sortedCounts(byOutcome),
		byResourceType: sortedCounts(byResourceType),
		byType: sortedCounts(byType),
		errors: events.filter((event) => event.outcome === 'error').length,
		latestAt: events.at(-1)?.at,
		total: events.length
	};
};

export const buildVoiceAuditTrailReport = async (
	options: VoiceAuditTrailOptions
): Promise<VoiceAuditTrailReport> => {
	const filter = {
		...options.filter,
		limit: options.filter?.limit ?? options.limit
	};
	const events = await options.store.list(filter);

	return {
		checkedAt: Date.now(),
		events,
		filter,
		summary: summarizeVoiceAuditTrail(events)
	};
};

export const renderVoiceAuditTrailHTML = (
	report: VoiceAuditTrailReport,
	options: {
		title?: string;
	} = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Audit Trail';
	const chips = report.summary.byType
		.map(([type, count]) => `<span>${escapeHtml(type)} <strong>${count}</strong></span>`)
		.join('');
	const rows = report.events
		.map((event) => {
			const actor = event.actor
				? `${event.actor.kind}:${event.actor.id}`
				: 'unknown';
			const resource = event.resource
				? `${event.resource.type}${event.resource.id ? `:${event.resource.id}` : ''}`
				: '';
			const payload = event.payload
				? JSON.stringify(event.payload, null, 2)
				: '';

			return `<article class="event ${escapeHtml(event.outcome ?? 'unknown')}"><div><span>${escapeHtml(event.type)}</span><h2>${escapeHtml(event.action)}</h2><p>${escapeHtml(new Date(event.at).toLocaleString())}</p><p>Actor: ${escapeHtml(actor)}${resource ? ` · Resource: ${escapeHtml(resource)}` : ''}</p>${event.sessionId ? `<p>Session: ${escapeHtml(event.sessionId)}</p>` : ''}</div><strong>${escapeHtml(event.outcome ?? 'recorded')}</strong>${payload ? `<pre>${escapeHtml(payload)}</pre>` : ''}</article>`;
		})
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#11140f;color:#f7f1df;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1120px;padding:32px}.hero{background:linear-gradient(135deg,rgba(34,197,94,.18),rgba(245,158,11,.12));border:1px solid #2c3327;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#facc15;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,4.8rem);line-height:.92;margin:.2rem 0 1rem}.chips{display:flex;flex-wrap:wrap;gap:10px}.chips span{border:1px solid #46513b;border-radius:999px;padding:8px 12px}.events{display:grid;gap:14px}.event{background:#181d15;border:1px solid #2c3327;border-radius:22px;display:grid;gap:16px;grid-template-columns:1fr auto;padding:18px}.event.error{border-color:rgba(239,68,68,.75)}.event.skipped{border-color:rgba(245,158,11,.7)}.event.success{border-color:rgba(34,197,94,.55)}.event span{color:#facc15;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.event h2{margin:.2rem 0}.event p{color:#c8ccb8;margin:.2rem 0}.event strong{text-transform:uppercase}pre{background:#0c0f0a;border-radius:14px;grid-column:1/-1;overflow:auto;padding:14px;white-space:pre-wrap}@media(max-width:760px){main{padding:20px}.event{grid-template-columns:1fr}}</style></head><body><main><section class="hero"><p class="eyebrow">Self-hosted evidence</p><h1>${escapeHtml(title)}</h1><p>${report.summary.total} event(s), ${report.summary.errors} error(s). Latest ${report.summary.latestAt ? escapeHtml(new Date(report.summary.latestAt).toLocaleString()) : 'never'}.</p><div class="chips">${chips}</div></section><section class="events">${rows || '<p>No audit events match this filter.</p>'}</section></main></body></html>`;
};

export const createVoiceAuditTrailRoutes = (
	options: VoiceAuditTrailRoutesOptions
) => {
	const path = options.path ?? '/api/voice-audit';
	const htmlPath = options.htmlPath ?? '/audit';
	const exportPath = options.exportPath ?? `${path}/export`;
	const exportHtmlPath =
		options.exportHtmlPath ?? (htmlPath === false ? false : `${htmlPath}/export`);
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-audit-trail'
	});

	routes.get(path, async ({ query }) =>
		buildVoiceAuditTrailReport({
			filter: resolveVoiceAuditTrailFilter(query, options.filter),
			limit: options.limit,
			store: options.store
		})
	);
	if (htmlPath !== false) {
		routes.get(htmlPath, async ({ query }) => {
			const report = await buildVoiceAuditTrailReport({
				filter: resolveVoiceAuditTrailFilter(query, options.filter),
				limit: options.limit,
				store: options.store
			});
			const body = await (options.render ?? ((value) =>
				renderVoiceAuditTrailHTML(value, { title: options.title })))(report);

			return new Response(body, {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		});
	}
	if (exportPath !== false) {
		routes.get(exportPath, async ({ query }) => {
			const filter = resolveVoiceAuditTrailFilter(query, options.filter);
			const redact = parseBoolean(query.redact, true);
			const exported = await exportVoiceAuditTrail({
				filter: {
					...filter,
					limit: filter.limit ?? options.limit
				},
				redact,
				store: options.store
			});
			const format = parseExportFormat(query.format);

			if (format === 'markdown') {
				return new Response(
					renderVoiceAuditMarkdown(exported.events, {
						title: options.title
					}),
					{
						headers: {
							'Content-Type': 'text/markdown; charset=utf-8',
							...options.headers
						}
					}
				);
			}

			if (format === 'html') {
				return new Response(
					renderVoiceAuditHTML(exported.events, {
						title: options.title
					}),
					{
						headers: {
							'Content-Type': 'text/html; charset=utf-8',
							...options.headers
						}
					}
				);
			}

			return exported;
		});
	}
	if (exportHtmlPath !== false) {
		routes.get(exportHtmlPath, async ({ query }) => {
			const filter = resolveVoiceAuditTrailFilter(query, options.filter);
			const exported = await exportVoiceAuditTrail({
				filter: {
					...filter,
					limit: filter.limit ?? options.limit
				},
				redact: parseBoolean(query.redact, true),
				store: options.store
			});

			return new Response(
				renderVoiceAuditHTML(exported.events, {
					title: options.title
				}),
				{
					headers: {
						'Content-Type': 'text/html; charset=utf-8',
						...options.headers
					}
				}
			);
		});
	}

	return routes;
};
