import { Elysia } from 'elysia';
import {
	filterVoiceTraceEvents,
	type StoredVoiceTraceEvent,
	type VoiceTraceEventStore
} from './trace';
import { summarizeVoiceHandoffHealth } from './handoffHealth';

export type VoiceQualityStatus = 'pass' | 'fail';

export type VoiceQualityThresholds = {
	maxDuplicateTurnRate?: number;
	maxEmptyTurnRate?: number;
	maxHandoffFailureRate?: number;
	maxMissingAssistantReplyRate?: number;
	maxProviderAverageLatencyMs?: number;
	maxProviderErrorRate?: number;
	maxProviderFallbackRate?: number;
	maxProviderTimeoutRate?: number;
};

export type VoiceQualityMetric = {
	actual: number;
	label: string;
	pass: boolean;
	threshold: number;
	unit: 'count' | 'ms' | 'rate';
};

export type VoiceQualityReport = {
	checkedAt: number;
	eventCount: number;
	metrics: Record<string, VoiceQualityMetric>;
	status: VoiceQualityStatus;
	thresholds: Required<VoiceQualityThresholds>;
};

export type VoiceQualityRoutesOptions = {
	events?: StoredVoiceTraceEvent[];
	headers?: HeadersInit;
	name?: string;
	path?: string;
	store?: VoiceTraceEventStore;
	thresholds?: VoiceQualityThresholds;
};

const DEFAULT_THRESHOLDS: Required<VoiceQualityThresholds> = {
	maxDuplicateTurnRate: 0,
	maxEmptyTurnRate: 0.02,
	maxHandoffFailureRate: 0,
	maxMissingAssistantReplyRate: 0.05,
	maxProviderAverageLatencyMs: 3_000,
	maxProviderErrorRate: 0.05,
	maxProviderFallbackRate: 0.25,
	maxProviderTimeoutRate: 0.03
};

const getString = (value: unknown) =>
	typeof value === 'string' ? value : undefined;

const getNumber = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const rate = (count: number, total: number) => count / Math.max(1, total);

const roundMetric = (value: number) => Math.round(value * 10_000) / 10_000;

const createMetric = (input: {
	actual: number;
	label: string;
	threshold: number;
	unit: VoiceQualityMetric['unit'];
}): VoiceQualityMetric => ({
	...input,
	actual: roundMetric(input.actual),
	pass: input.actual <= input.threshold
});

export const evaluateVoiceQuality = async (input: {
	events?: StoredVoiceTraceEvent[];
	store?: VoiceTraceEventStore;
	thresholds?: VoiceQualityThresholds;
}): Promise<VoiceQualityReport> => {
	const events = filterVoiceTraceEvents(
		input.events ?? (await input.store?.list()) ?? []
	);
	const thresholds = {
		...DEFAULT_THRESHOLDS,
		...input.thresholds
	};
	const committedTurns = events.filter((event) => event.type === 'turn.committed');
	const assistantReplies = events.filter((event) => event.type === 'turn.assistant');
	const sessionIdsWithAssistantReply = new Set(
		assistantReplies.map((event) => event.sessionId)
	);
	const sessionsWithTurns = new Set(committedTurns.map((event) => event.sessionId));
	const emptyTurns = committedTurns.filter(
		(event) => !(getString(event.payload.text)?.trim())
	);
	const turnTextsBySession = new Map<string, Set<string>>();
	let duplicateTurns = 0;

	for (const turn of committedTurns) {
		const normalized = getString(turn.payload.text)?.trim().toLowerCase();
		if (!normalized) {
			continue;
		}
		const seen = turnTextsBySession.get(turn.sessionId) ?? new Set<string>();
		if (seen.has(normalized)) {
			duplicateTurns += 1;
		}
		seen.add(normalized);
		turnTextsBySession.set(turn.sessionId, seen);
	}

	const missingAssistantReplySessions = [...sessionsWithTurns].filter(
		(sessionId) => !sessionIdsWithAssistantReply.has(sessionId)
	).length;
	const providerEvents = events.filter(
		(event) =>
			event.type === 'session.error' &&
			typeof event.payload.provider === 'string' &&
			typeof event.payload.providerStatus === 'string'
	);
	const providerErrors = providerEvents.filter(
		(event) => event.payload.providerStatus === 'error'
	);
	const providerFallbacks = providerEvents.filter(
		(event) => event.payload.providerStatus === 'fallback'
	);
	const providerTimeouts = providerEvents.filter(
		(event) => event.payload.timedOut === true
	);
	const providerLatencies = providerEvents
		.map((event) => getNumber(event.payload.elapsedMs))
		.filter((value): value is number => value !== undefined);
	const averageProviderLatencyMs =
		providerLatencies.length > 0
			? providerLatencies.reduce((sum, value) => sum + value, 0) /
				providerLatencies.length
			: 0;
	const handoffHealth = await summarizeVoiceHandoffHealth({ events });
	const metrics = {
		duplicateTurnRate: createMetric({
			actual: rate(duplicateTurns, committedTurns.length),
			label: 'Duplicate turn rate',
			threshold: thresholds.maxDuplicateTurnRate,
			unit: 'rate'
		}),
		emptyTurnRate: createMetric({
			actual: rate(emptyTurns.length, committedTurns.length),
			label: 'Empty turn rate',
			threshold: thresholds.maxEmptyTurnRate,
			unit: 'rate'
		}),
		handoffFailureRate: createMetric({
			actual: rate(handoffHealth.failed, handoffHealth.total),
			label: 'Handoff failure rate',
			threshold: thresholds.maxHandoffFailureRate,
			unit: 'rate'
		}),
		missingAssistantReplyRate: createMetric({
			actual: rate(missingAssistantReplySessions, sessionsWithTurns.size),
			label: 'Missing assistant reply rate',
			threshold: thresholds.maxMissingAssistantReplyRate,
			unit: 'rate'
		}),
		providerAverageLatencyMs: createMetric({
			actual: averageProviderLatencyMs,
			label: 'Average provider latency',
			threshold: thresholds.maxProviderAverageLatencyMs,
			unit: 'ms'
		}),
		providerErrorRate: createMetric({
			actual: rate(providerErrors.length, providerEvents.length),
			label: 'Provider error rate',
			threshold: thresholds.maxProviderErrorRate,
			unit: 'rate'
		}),
		providerFallbackRate: createMetric({
			actual: rate(providerFallbacks.length, providerEvents.length),
			label: 'Provider fallback rate',
			threshold: thresholds.maxProviderFallbackRate,
			unit: 'rate'
		}),
		providerTimeoutRate: createMetric({
			actual: rate(providerTimeouts.length, providerEvents.length),
			label: 'Provider timeout rate',
			threshold: thresholds.maxProviderTimeoutRate,
			unit: 'rate'
		})
	} satisfies Record<string, VoiceQualityMetric>;
	const status: VoiceQualityStatus = Object.values(metrics).every(
		(metric) => metric.pass
	)
		? 'pass'
		: 'fail';

	return {
		checkedAt: Date.now(),
		eventCount: events.length,
		metrics,
		status,
		thresholds
	};
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const formatMetricValue = (metric: VoiceQualityMetric) =>
	metric.unit === 'rate'
		? `${(metric.actual * 100).toFixed(2)}%`
		: metric.unit === 'ms'
			? `${Math.round(metric.actual)}ms`
			: String(metric.actual);

const formatThreshold = (metric: VoiceQualityMetric) =>
	metric.unit === 'rate'
		? `${(metric.threshold * 100).toFixed(2)}%`
		: metric.unit === 'ms'
			? `${Math.round(metric.threshold)}ms`
			: String(metric.threshold);

export const renderVoiceQualityHTML = (report: VoiceQualityReport) => {
	const rows = Object.entries(report.metrics)
		.map(
			([key, metric]) =>
				`<tr class="${metric.pass ? 'pass' : 'fail'}"><td>${escapeHtml(metric.label)}</td><td>${escapeHtml(formatMetricValue(metric))}</td><td>${escapeHtml(formatThreshold(metric))}</td><td>${metric.pass ? 'pass' : 'fail'}</td><td><code>${escapeHtml(key)}</code></td></tr>`
		)
		.join('');
	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>AbsoluteJS Voice Quality</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:2rem;background:#f8f7f2;color:#181713}main{max-width:1100px;margin:auto}.status{border-radius:999px;display:inline-flex;padding:.35rem .75rem;font-weight:800}.status.pass{background:#dcfce7;color:#166534}.status.fail{background:#fee2e2;color:#991b1b}table{border-collapse:collapse;width:100%;background:white;margin-top:1rem}td,th{border-bottom:1px solid #eee;padding:.75rem;text-align:left}.pass td{border-left:4px solid #16a34a}.fail td{border-left:4px solid #dc2626}code{background:#f3f4f6;padding:.15rem .3rem;border-radius:.3rem}</style></head><body><main><h1>Voice quality gates</h1><p class="status ${report.status}">${report.status}</p><p>${report.eventCount} event(s) checked.</p><table><thead><tr><th>Metric</th><th>Actual</th><th>Threshold</th><th>Status</th><th>Key</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
};

export const createVoiceQualityRoutes = (options: VoiceQualityRoutesOptions) => {
	const path = options.path ?? '/quality';
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-quality'
	});
	const getReport = () =>
		evaluateVoiceQuality({
			events: options.events,
			store: options.store,
			thresholds: options.thresholds
		});

	routes.get(path, async () => {
		const report = await getReport();
		return new Response(renderVoiceQualityHTML(report), {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				...options.headers
			}
		});
	});
	routes.get(`${path}/json`, async () => getReport());
	routes.get(`${path}/status`, async ({ set }) => {
		const report = await getReport();
		if (report.status === 'fail') {
			set.status = 503;
		}
		return report;
	});

	return routes;
};
