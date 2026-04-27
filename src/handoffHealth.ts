import { Elysia } from 'elysia';
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from './trace';

export type VoiceHandoffHealthStatus = 'delivered' | 'failed' | 'skipped';

export type VoiceHandoffHealthDelivery = {
	adapterId: string;
	adapterKind?: string;
	deliveredAt?: number;
	deliveredTo?: string;
	error?: string;
	status: VoiceHandoffHealthStatus;
};

export type VoiceHandoffHealthEvent = {
	action?: string;
	at: number;
	deliveries: VoiceHandoffHealthDelivery[];
	reason?: string;
	replayHref?: string;
	sessionId: string;
	status: VoiceHandoffHealthStatus;
	target?: string;
};

export type VoiceHandoffHealthSummary = {
	byAction: Record<string, number>;
	byAdapter: Record<string, Record<VoiceHandoffHealthStatus, number>>;
	byStatus: Record<VoiceHandoffHealthStatus, number>;
	events: VoiceHandoffHealthEvent[];
	failed: number;
	total: number;
};

export type VoiceHandoffHealthSummaryOptions = {
	events?: StoredVoiceTraceEvent[];
	limit?: number;
	q?: string;
	replayHref?:
		| false
		| string
		| ((event: Omit<VoiceHandoffHealthEvent, 'replayHref'>) => string);
	status?: VoiceHandoffHealthStatus | 'all';
	store?: VoiceTraceEventStore;
};

export type VoiceHandoffHealthHTMLHandlerOptions =
	VoiceHandoffHealthSummaryOptions & {
		headers?: HeadersInit;
		render?: (summary: VoiceHandoffHealthSummary) => string | Promise<string>;
	};

export type VoiceHandoffHealthRoutesOptions =
	VoiceHandoffHealthHTMLHandlerOptions & {
		htmlPath?: false | string;
		name?: string;
		path?: string;
	};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const getString = (value: unknown) =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

const isStatus = (value: unknown): value is VoiceHandoffHealthStatus =>
	value === 'delivered' || value === 'failed' || value === 'skipped';

const increment = (record: Record<string, number>, key: string) => {
	record[key] = (record[key] ?? 0) + 1;
};

const normalizeDelivery = (
	adapterId: string,
	value: unknown
): VoiceHandoffHealthDelivery => {
	const record =
		value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

	return {
		adapterId: getString(record.adapterId) ?? adapterId,
		adapterKind: getString(record.adapterKind),
		deliveredAt:
			typeof record.deliveredAt === 'number' ? record.deliveredAt : undefined,
		deliveredTo: getString(record.deliveredTo),
		error: getString(record.error),
		status: isStatus(record.status) ? record.status : 'failed'
	};
};

const normalizeDeliveries = (
	payload: Record<string, unknown>
): VoiceHandoffHealthDelivery[] => {
	const deliveries = payload.deliveries;
	if (!deliveries || typeof deliveries !== 'object') {
		return [];
	}

	return Object.entries(deliveries as Record<string, unknown>).map(
		([adapterId, value]) => normalizeDelivery(adapterId, value)
	);
};

const resolveReplayHref = (
	event: Omit<VoiceHandoffHealthEvent, 'replayHref'>,
	replayHref: VoiceHandoffHealthSummaryOptions['replayHref']
) => {
	if (replayHref === false) {
		return undefined;
	}

	if (typeof replayHref === 'function') {
		return replayHref(event);
	}

	return `${replayHref ?? '/api/voice-sessions'}/${encodeURIComponent(event.sessionId)}/replay/htmx`;
};

export const summarizeVoiceHandoffHealth = async (
	options: VoiceHandoffHealthSummaryOptions = {}
): Promise<VoiceHandoffHealthSummary> => {
	const sourceEvents = options.events ?? (await options.store?.list()) ?? [];
	const search = options.q?.trim().toLowerCase();
	const byAction: Record<string, number> = {};
	const byAdapter: Record<string, Record<VoiceHandoffHealthStatus, number>> = {};
	const byStatus: Record<VoiceHandoffHealthStatus, number> = {
		delivered: 0,
		failed: 0,
		skipped: 0
	};
	const events = sourceEvents
		.filter((event) => event.type === 'call.handoff')
		.map((event) => {
			const status = isStatus(event.payload.status)
				? event.payload.status
				: 'failed';
			const deliveries = normalizeDeliveries(event.payload);
			const item: Omit<VoiceHandoffHealthEvent, 'replayHref'> = {
				action: getString(event.payload.action),
				at: event.at,
				deliveries,
				reason: getString(event.payload.reason),
				sessionId: event.sessionId,
				status,
				target: getString(event.payload.target)
			};

			return {
				...item,
				replayHref: resolveReplayHref(item, options.replayHref)
			};
		})
		.filter((event) => {
			if (options.status && options.status !== 'all' && event.status !== options.status) {
				return false;
			}
			if (!search) {
				return true;
			}

			return [
				event.action,
				event.reason,
				event.sessionId,
				event.status,
				event.target,
				...event.deliveries.flatMap((delivery) => [
					delivery.adapterId,
					delivery.adapterKind,
					delivery.deliveredTo,
					delivery.error,
					delivery.status
				])
			].some((value) => value?.toLowerCase().includes(search));
		})
		.sort((left, right) => right.at - left.at)
		.slice(0, options.limit ?? 50);

	for (const event of events) {
		byStatus[event.status] += 1;
		if (event.action) {
			increment(byAction, event.action);
		}
		for (const delivery of event.deliveries) {
			byAdapter[delivery.adapterId] ??= {
				delivered: 0,
				failed: 0,
				skipped: 0
			};
			byAdapter[delivery.adapterId]![delivery.status] += 1;
		}
	}

	return {
		byAction,
		byAdapter,
		byStatus,
		events,
		failed: byStatus.failed,
		total: events.length
	};
};

const renderMetricGrid = (summary: VoiceHandoffHealthSummary) =>
	[
		'<section class="voice-handoff-health-grid">',
		`<article><span>Total</span><strong>${String(summary.total)}</strong></article>`,
		`<article><span>Delivered</span><strong>${String(summary.byStatus.delivered)}</strong></article>`,
		`<article><span>Failed</span><strong>${String(summary.byStatus.failed)}</strong></article>`,
		`<article><span>Skipped</span><strong>${String(summary.byStatus.skipped)}</strong></article>`,
		'</section>'
	].join('');

const renderActionSummary = (summary: VoiceHandoffHealthSummary) => {
	const actions = Object.entries(summary.byAction).sort(
		(left, right) => right[1] - left[1]
	);
	const adapters = Object.entries(summary.byAdapter).sort(([left], [right]) =>
		left.localeCompare(right)
	);

	return [
		'<section class="voice-handoff-health-columns">',
		'<article><h3>Actions</h3>',
		actions.length === 0
			? '<p>No handoff actions yet.</p>'
			: `<ul>${actions.map(([action, count]) => `<li>${escapeHtml(action)}: ${String(count)}</li>`).join('')}</ul>`,
		'</article>',
		'<article><h3>Adapters</h3>',
		adapters.length === 0
			? '<p>No adapter deliveries yet.</p>'
			: `<ul>${adapters
					.map(
						([adapterId, counts]) =>
							`<li>${escapeHtml(adapterId)}: ${String(counts.delivered)} delivered / ${String(counts.failed)} failed / ${String(counts.skipped)} skipped</li>`
					)
					.join('')}</ul>`,
		'</article>',
		'</section>'
	].join('');
};

export const renderVoiceHandoffHealthHTML = (
	summary: VoiceHandoffHealthSummary
) =>
	[
		'<div class="voice-handoff-health">',
		renderMetricGrid(summary),
		renderActionSummary(summary),
		'<section>',
		'<h3>Recent Handoffs</h3>',
		summary.events.length === 0
			? '<p class="voice-handoff-health-empty">No handoffs found.</p>'
			: [
					'<div class="voice-handoff-health-events">',
					...summary.events.map((event) =>
						[
							`<article class="${escapeHtml(event.status)}">`,
							'<div class="voice-handoff-health-event-header">',
							`<strong>${escapeHtml(event.action ?? 'handoff')}</strong>`,
							`<span>${escapeHtml(event.status)}</span>`,
							'</div>',
							`<p><small>${escapeHtml(event.sessionId)}</small></p>`,
							event.target ? `<p>Target: ${escapeHtml(event.target)}</p>` : '',
							event.reason ? `<p>Reason: ${escapeHtml(event.reason)}</p>` : '',
							event.deliveries.length
								? `<ul>${event.deliveries
										.map((delivery) =>
											[
												'<li>',
												`${escapeHtml(delivery.adapterId)}: ${escapeHtml(delivery.status)}`,
												delivery.deliveredTo
													? ` to ${escapeHtml(delivery.deliveredTo)}`
													: '',
												delivery.error
													? ` (${escapeHtml(delivery.error)})`
													: '',
												'</li>'
											].join('')
										)
										.join('')}</ul>`
								: '',
							event.replayHref
								? `<p><a href="${escapeHtml(event.replayHref)}">Open replay</a></p>`
								: '',
							'</article>'
						].join('')
					),
					'</div>'
				].join(''),
		'</section>',
		'</div>'
	].join('');

export const createVoiceHandoffHealthJSONHandler =
	(options: VoiceHandoffHealthSummaryOptions = {}) =>
	async ({ query }: { query?: Record<string, string | undefined> }) =>
		summarizeVoiceHandoffHealth({
			...options,
			limit:
				typeof query?.limit === 'string' ? Number(query.limit) : options.limit,
			q: query?.q ?? options.q,
			status:
				query?.status === 'delivered' ||
				query?.status === 'failed' ||
				query?.status === 'skipped' ||
				query?.status === 'all'
					? query.status
					: options.status
		});

export const createVoiceHandoffHealthHTMLHandler =
	(options: VoiceHandoffHealthHTMLHandlerOptions = {}) =>
	async ({ query }: { query?: Record<string, string | undefined> }) => {
		const summary = await summarizeVoiceHandoffHealth({
			...options,
			limit:
				typeof query?.limit === 'string' ? Number(query.limit) : options.limit,
			q: query?.q ?? options.q,
			status:
				query?.status === 'delivered' ||
				query?.status === 'failed' ||
				query?.status === 'skipped' ||
				query?.status === 'all'
					? query.status
					: options.status
		});
		const body = await (options.render?.(summary) ??
			renderVoiceHandoffHealthHTML(summary));

		return new Response(body, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				...options.headers
			}
		});
	};

export const createVoiceHandoffHealthRoutes = (
	options: VoiceHandoffHealthRoutesOptions = {}
) => {
	const path = options.path ?? '/api/voice-handoffs';
	const htmlPath =
		options.htmlPath === undefined ? `${path}/htmx` : options.htmlPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-handoff-health'
	}).get(path, createVoiceHandoffHealthJSONHandler(options));

	if (htmlPath) {
		routes.get(htmlPath, createVoiceHandoffHealthHTMLHandler(options));
	}

	return routes;
};
