import { Elysia } from 'elysia';
import {
	listVoiceRoutingEvents,
	type VoiceRoutingEvent,
	type VoiceRoutingEventKind
} from './resilienceRoutes';
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from './trace';

export type VoiceProviderSloStatus = 'fail' | 'pass' | 'warn';

export type VoiceProviderSloThresholds = {
	maxAverageElapsedMs?: number;
	maxErrorRate?: number;
	maxFallbackRate?: number;
	maxP95ElapsedMs?: number;
	maxTimeoutRate?: number;
	minSamples?: number;
};

export type VoiceProviderSloThresholdConfig = Partial<
	Record<VoiceRoutingEventKind, VoiceProviderSloThresholds>
>;

export type VoiceProviderSloMetric = {
	actual: number;
	label: string;
	pass: boolean;
	threshold: number;
	unit: 'count' | 'ms' | 'rate';
};

export type VoiceProviderSloIssue = {
	code: string;
	detail?: string;
	kind?: VoiceRoutingEventKind;
	label: string;
	sessionId?: string;
	status: Exclude<VoiceProviderSloStatus, 'pass'>;
	value?: number | string;
};

export type VoiceProviderSloKindReport = {
	events: number;
	eventsWithLatency: number;
	fallbacks: number;
	issues: VoiceProviderSloIssue[];
	kind: VoiceRoutingEventKind;
	metrics: Record<string, VoiceProviderSloMetric>;
	providers: string[];
	status: VoiceProviderSloStatus;
	thresholds: Required<VoiceProviderSloThresholds>;
	timeouts: number;
	unresolvedErrors: number;
};

export type VoiceProviderSloSessionReport = {
	errorCount: number;
	fallbackCount: number;
	kinds: VoiceRoutingEventKind[];
	lastEventAt: number;
	maxElapsedMs?: number;
	sessionId: string;
	status: VoiceProviderSloStatus;
	timeoutCount: number;
};

export type VoiceProviderSloReport = {
	checkedAt: number;
	events: number;
	eventsWithLatency: number;
	issues: VoiceProviderSloIssue[];
	kinds: Record<VoiceRoutingEventKind, VoiceProviderSloKindReport>;
	sessions: VoiceProviderSloSessionReport[];
	status: VoiceProviderSloStatus;
	thresholds: Record<VoiceRoutingEventKind, Required<VoiceProviderSloThresholds>>;
};

export type VoiceProviderSloReportOptions = {
	events?: StoredVoiceTraceEvent[] | VoiceRoutingEvent[];
	maxAgeMs?: number;
	now?: number;
	requiredKinds?: readonly VoiceRoutingEventKind[];
	scenarioId?: string;
	sessionId?: string;
	store?: VoiceTraceEventStore;
	thresholds?: VoiceProviderSloThresholdConfig;
};

export type VoiceProviderSloRoutesOptions = VoiceProviderSloReportOptions & {
	headers?: HeadersInit;
	htmlPath?: false | string;
	markdownPath?: false | string;
	name?: string;
	path?: string;
	render?: (report: VoiceProviderSloReport) => string | Promise<string>;
	title?: string;
};

export type VoiceProviderSloAssertionInput = {
	fallbackKinds?: VoiceRoutingEventKind[];
	maxAverageElapsedMs?: Partial<Record<VoiceRoutingEventKind, number>>;
	maxIssues?: number;
	maxP95ElapsedMs?: Partial<Record<VoiceRoutingEventKind, number>>;
	maxStatus?: VoiceProviderSloStatus;
	maxTimeouts?: number;
	maxUnresolvedErrors?: number;
	minEvents?: number;
	minFallbacks?: number;
	minLatencySamples?: number;
	requiredKinds?: VoiceRoutingEventKind[];
	requiredProviders?: string[];
};

export type VoiceProviderSloAssertionReport = {
	events: number;
	eventsWithLatency: number;
	fallbacks: number;
	issues: string[];
	kinds: VoiceRoutingEventKind[];
	ok: boolean;
	providers: string[];
	status: VoiceProviderSloStatus;
	timeouts: number;
	unresolvedErrors: number;
};

const defaultThresholds: Record<
	VoiceRoutingEventKind,
	Required<VoiceProviderSloThresholds>
> = {
	llm: {
		maxAverageElapsedMs: 2500,
		maxErrorRate: 0.02,
		maxFallbackRate: 0.25,
		maxP95ElapsedMs: 4500,
		maxTimeoutRate: 0.02,
		minSamples: 1
	},
	stt: {
		maxAverageElapsedMs: 800,
		maxErrorRate: 0.02,
		maxFallbackRate: 0.25,
		maxP95ElapsedMs: 1500,
		maxTimeoutRate: 0.02,
		minSamples: 1
	},
	tts: {
		maxAverageElapsedMs: 1200,
		maxErrorRate: 0.02,
		maxFallbackRate: 0.25,
		maxP95ElapsedMs: 2200,
		maxTimeoutRate: 0.02,
		minSamples: 1
	}
};

const providerKinds: VoiceRoutingEventKind[] = ['llm', 'stt', 'tts'];

const statusRank: Record<VoiceProviderSloStatus, number> = {
	pass: 0,
	warn: 1,
	fail: 2
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const roundMetric = (value: number) => Math.round(value * 10_000) / 10_000;

const rate = (count: number, total: number) => count / Math.max(1, total);

const uniqueSorted = (values: Array<string | undefined>) =>
	[
		...new Set(
			values.filter((value): value is string => typeof value === 'string')
		)
	].sort();

const percentile = (values: number[], rank: number) => {
	if (values.length === 0) {
		return 0;
	}

	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1)
	);
	return sorted[index] ?? 0;
};

const mergeThresholds = (
	thresholds: VoiceProviderSloThresholdConfig | undefined
) =>
	Object.fromEntries(
		providerKinds.map((kind) => [
			kind,
			{
				...defaultThresholds[kind],
				...(thresholds?.[kind] ?? {})
			}
		])
	) as VoiceProviderSloReport['thresholds'];

const createMetric = (input: {
	actual: number;
	label: string;
	threshold: number;
	unit: VoiceProviderSloMetric['unit'];
}): VoiceProviderSloMetric => ({
	...input,
	actual: roundMetric(input.actual),
	pass: input.actual <= input.threshold
});

const isRoutingEvent = (event: unknown): event is VoiceRoutingEvent =>
	Boolean(
		event &&
			typeof event === 'object' &&
			'kind' in event &&
			'sessionId' in event &&
			!('payload' in event)
	);

const normalizeEvents = (
	events: StoredVoiceTraceEvent[] | VoiceRoutingEvent[]
): VoiceRoutingEvent[] =>
	events.every(isRoutingEvent)
		? [...(events as VoiceRoutingEvent[])]
		: listVoiceRoutingEvents(events as StoredVoiceTraceEvent[]);

const issueFromMetric = (
	kind: VoiceRoutingEventKind,
	code: string,
	metric: VoiceProviderSloMetric
): VoiceProviderSloIssue | undefined =>
	metric.pass
		? undefined
		: {
				code,
				detail: `${metric.label} ${formatMetricValue(metric)} exceeds ${formatMetricThreshold(metric)}.`,
				kind,
				label: metric.label,
				status: 'fail',
				value: formatMetricValue(metric)
			};

const summarizeKind = (
	kind: VoiceRoutingEventKind,
	events: VoiceRoutingEvent[],
	thresholds: Required<VoiceProviderSloThresholds>,
	required: boolean
): VoiceProviderSloKindReport => {
	const kindEvents = events.filter((event) => event.kind === kind);
	const latencies = kindEvents
		.map((event) => event.elapsedMs)
		.filter((value): value is number => typeof value === 'number');
	const errors = kindEvents.filter((event) => event.status === 'error');
	const unresolvedErrors = errors.filter(
		(event) => !kindEvents.some(
			(candidate) =>
				candidate.sessionId === event.sessionId &&
				candidate.at > event.at &&
				(candidate.status === 'fallback' || candidate.status === 'success')
		)
	);
	const fallbacks = kindEvents.filter((event) => event.status === 'fallback');
	const timeouts = kindEvents.filter((event) => event.timedOut);
	const averageElapsedMs =
		latencies.length > 0
			? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
			: 0;
	const metrics = {
		averageElapsedMs: createMetric({
			actual: averageElapsedMs,
			label: 'Average latency',
			threshold: thresholds.maxAverageElapsedMs,
			unit: 'ms'
		}),
		errorRate: createMetric({
			actual: rate(unresolvedErrors.length, kindEvents.length),
			label: 'Unresolved provider error rate',
			threshold: thresholds.maxErrorRate,
			unit: 'rate'
		}),
		fallbackRate: createMetric({
			actual: rate(fallbacks.length, kindEvents.length),
			label: 'Fallback rate',
			threshold: thresholds.maxFallbackRate,
			unit: 'rate'
		}),
		p95ElapsedMs: createMetric({
			actual: percentile(latencies, 95),
			label: 'P95 latency',
			threshold: thresholds.maxP95ElapsedMs,
			unit: 'ms'
		}),
		timeoutRate: createMetric({
			actual: rate(timeouts.length, kindEvents.length),
			label: 'Timeout rate',
			threshold: thresholds.maxTimeoutRate,
			unit: 'rate'
		})
	} satisfies Record<string, VoiceProviderSloMetric>;
	const issues = [
		(required || kindEvents.length > 0) && latencies.length < thresholds.minSamples
			? {
					code: 'provider_slo.insufficient_latency_samples',
					detail: `${kind.toUpperCase()} needs ${thresholds.minSamples} latency sample(s), saw ${latencies.length}.`,
					kind,
					label: 'Provider latency samples',
					status: required ? 'fail' : 'warn',
					value: latencies.length
				}
			: undefined,
		issueFromMetric(kind, 'provider_slo.average_latency', metrics.averageElapsedMs),
		issueFromMetric(kind, 'provider_slo.p95_latency', metrics.p95ElapsedMs),
		issueFromMetric(kind, 'provider_slo.error_rate', metrics.errorRate),
		issueFromMetric(kind, 'provider_slo.timeout_rate', metrics.timeoutRate),
		issueFromMetric(kind, 'provider_slo.fallback_rate', metrics.fallbackRate)
	].filter((issue): issue is VoiceProviderSloIssue => issue !== undefined);
	const providers = new Set<string>();

	for (const event of kindEvents) {
		if (event.provider) {
			providers.add(event.provider);
		}
		if (event.selectedProvider) {
			providers.add(event.selectedProvider);
		}
		if (event.fallbackProvider) {
			providers.add(event.fallbackProvider);
		}
	}

	return {
		events: kindEvents.length,
		eventsWithLatency: latencies.length,
		fallbacks: fallbacks.length,
		issues,
		kind,
		metrics,
		providers: [...providers].sort(),
		status: issues.some((issue) => issue.status === 'fail')
			? 'fail'
			: issues.some((issue) => issue.status === 'warn')
				? 'warn'
				: 'pass',
		thresholds,
		timeouts: timeouts.length,
		unresolvedErrors: unresolvedErrors.length
	};
};

const summarizeSessions = (
	events: VoiceRoutingEvent[]
): VoiceProviderSloSessionReport[] => {
	const sessions = new Map<string, VoiceProviderSloSessionReport>();

	for (const event of events) {
		const session =
			sessions.get(event.sessionId) ??
			({
				errorCount: 0,
				fallbackCount: 0,
				kinds: [],
				lastEventAt: event.at,
				sessionId: event.sessionId,
				status: 'pass',
				timeoutCount: 0
			} satisfies VoiceProviderSloSessionReport);

		session.lastEventAt = Math.max(session.lastEventAt, event.at);
		if (!session.kinds.includes(event.kind)) {
			session.kinds.push(event.kind);
		}
		if (typeof event.elapsedMs === 'number') {
			session.maxElapsedMs =
				session.maxElapsedMs === undefined
					? event.elapsedMs
					: Math.max(session.maxElapsedMs, event.elapsedMs);
		}
		if (event.status === 'error') {
			session.errorCount += 1;
		}
		if (event.status === 'fallback') {
			session.fallbackCount += 1;
		}
		if (event.timedOut) {
			session.timeoutCount += 1;
		}
		session.status =
			session.errorCount > 0 || session.timeoutCount > 0
				? 'fail'
				: session.fallbackCount > 0
					? 'warn'
					: 'pass';
		sessions.set(event.sessionId, session);
	}

	return [...sessions.values()].sort(
		(left, right) => right.lastEventAt - left.lastEventAt
	);
};

export const buildVoiceProviderSloReport = async (
	options: VoiceProviderSloReportOptions = {}
): Promise<VoiceProviderSloReport> => {
	const rawEvents = options.events ?? (await options.store?.list()) ?? [];
	const now = options.now ?? Date.now();
	const events = normalizeEvents(rawEvents).filter(
		(event) =>
			(typeof options.maxAgeMs !== 'number' ||
				now - event.at <= options.maxAgeMs) &&
			(!options.sessionId || event.sessionId === options.sessionId) &&
			(!options.scenarioId || event.scenarioId === options.scenarioId)
	);
	const thresholds = mergeThresholds(options.thresholds);
	const observedKinds = new Set(events.map((event) => event.kind));
	const requiredKinds = new Set(options.requiredKinds ?? [...observedKinds]);
	const kindReports = Object.fromEntries(
		providerKinds.map((kind) => [
			kind,
			summarizeKind(kind, events, thresholds[kind], requiredKinds.has(kind))
		])
	) as VoiceProviderSloReport['kinds'];
	const issues = Object.values(kindReports).flatMap((report) => report.issues);
	const eventsWithLatency = events.filter(
		(event) => typeof event.elapsedMs === 'number'
	).length;

	if (events.length === 0) {
		issues.push({
			code: 'provider_slo.no_routing_events',
			detail:
				'No provider routing events are recorded yet. Run a live turn, smoke, or provider simulation before certifying latency.',
			label: 'Provider routing evidence',
			status: 'warn',
			value: 0
		});
	}

	return {
		checkedAt: Date.now(),
		events: events.length,
		eventsWithLatency,
		issues,
		kinds: kindReports,
		sessions: summarizeSessions(events),
		status: issues.some((issue) => issue.status === 'fail')
			? 'fail'
			: issues.some((issue) => issue.status === 'warn')
				? 'warn'
				: 'pass',
		thresholds
	};
};

export const evaluateVoiceProviderSloEvidence = (
	report: VoiceProviderSloReport,
	input: VoiceProviderSloAssertionInput = {}
): VoiceProviderSloAssertionReport => {
	const issues: string[] = [];
	const kindReports = Object.values(report.kinds);
	const providers = uniqueSorted(kindReports.flatMap((kind) => kind.providers));
	const kinds = providerKinds.filter((kind) => report.kinds[kind].events > 0);
	const fallbacks = kindReports.reduce((total, kind) => total + kind.fallbacks, 0);
	const timeouts = kindReports.reduce((total, kind) => total + kind.timeouts, 0);
	const unresolvedErrors = kindReports.reduce(
		(total, kind) => total + kind.unresolvedErrors,
		0
	);
	const maxStatus = input.maxStatus ?? 'pass';

	if (statusRank[report.status] > statusRank[maxStatus]) {
		issues.push(
			`Expected provider SLO status at most ${maxStatus}, found ${report.status}.`
		);
	}
	if (input.minEvents !== undefined && report.events < input.minEvents) {
		issues.push(
			`Expected at least ${String(input.minEvents)} provider routing events, found ${String(report.events)}.`
		);
	}
	if (
		input.minLatencySamples !== undefined &&
		report.eventsWithLatency < input.minLatencySamples
	) {
		issues.push(
			`Expected at least ${String(input.minLatencySamples)} provider latency samples, found ${String(report.eventsWithLatency)}.`
		);
	}
	if (input.minFallbacks !== undefined && fallbacks < input.minFallbacks) {
		issues.push(
			`Expected at least ${String(input.minFallbacks)} provider fallback events, found ${String(fallbacks)}.`
		);
	}
	if (
		input.maxUnresolvedErrors !== undefined &&
		unresolvedErrors > input.maxUnresolvedErrors
	) {
		issues.push(
			`Expected at most ${String(input.maxUnresolvedErrors)} unresolved provider errors, found ${String(unresolvedErrors)}.`
		);
	}
	if (input.maxTimeouts !== undefined && timeouts > input.maxTimeouts) {
		issues.push(
			`Expected at most ${String(input.maxTimeouts)} provider timeouts, found ${String(timeouts)}.`
		);
	}
	if (input.maxIssues !== undefined && report.issues.length > input.maxIssues) {
		issues.push(
			`Expected at most ${String(input.maxIssues)} provider SLO issues, found ${String(report.issues.length)}.`
		);
	}

	for (const kind of input.requiredKinds ?? []) {
		if (report.kinds[kind].events === 0) {
			issues.push(`Missing provider SLO kind evidence: ${kind}.`);
		}
	}
	for (const kind of input.fallbackKinds ?? []) {
		if (report.kinds[kind].fallbacks === 0) {
			issues.push(`Missing provider fallback evidence for kind: ${kind}.`);
		}
	}
	for (const provider of input.requiredProviders ?? []) {
		if (!providers.includes(provider)) {
			issues.push(`Missing provider SLO provider evidence: ${provider}.`);
		}
	}
	for (const [kind, maxAverageElapsedMs] of Object.entries(
		input.maxAverageElapsedMs ?? {}
	) as Array<[VoiceRoutingEventKind, number]>) {
		const metric = report.kinds[kind].metrics.averageElapsedMs;
		const actual = metric?.actual ?? 0;
		if (actual > maxAverageElapsedMs) {
			issues.push(
				`Expected ${kind} average provider latency <= ${String(maxAverageElapsedMs)}ms, found ${String(actual)}ms.`
			);
		}
	}
	for (const [kind, maxP95ElapsedMs] of Object.entries(
		input.maxP95ElapsedMs ?? {}
	) as Array<[VoiceRoutingEventKind, number]>) {
		const metric = report.kinds[kind].metrics.p95ElapsedMs;
		const actual = metric?.actual ?? 0;
		if (actual > maxP95ElapsedMs) {
			issues.push(
				`Expected ${kind} p95 provider latency <= ${String(maxP95ElapsedMs)}ms, found ${String(actual)}ms.`
			);
		}
	}

	return {
		events: report.events,
		eventsWithLatency: report.eventsWithLatency,
		fallbacks,
		issues,
		kinds,
		ok: issues.length === 0,
		providers,
		status: report.status,
		timeouts,
		unresolvedErrors
	};
};

export const assertVoiceProviderSloEvidence = (
	report: VoiceProviderSloReport,
	input: VoiceProviderSloAssertionInput = {}
): VoiceProviderSloAssertionReport => {
	const assertion = evaluateVoiceProviderSloEvidence(report, input);
	if (!assertion.ok) {
		throw new Error(
			`Voice provider SLO assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
};

const formatMetricValue = (metric: VoiceProviderSloMetric) =>
	metric.unit === 'rate'
		? `${(metric.actual * 100).toFixed(2)}%`
		: metric.unit === 'ms'
			? `${Math.round(metric.actual)}ms`
			: String(metric.actual);

const formatMetricThreshold = (metric: VoiceProviderSloMetric) =>
	metric.unit === 'rate'
		? `${(metric.threshold * 100).toFixed(2)}%`
		: metric.unit === 'ms'
			? `${Math.round(metric.threshold)}ms`
			: String(metric.threshold);

const getMetric = (
	report: VoiceProviderSloKindReport,
	key: keyof VoiceProviderSloKindReport['metrics']
) => report.metrics[key] as VoiceProviderSloMetric;

export const renderVoiceProviderSloMarkdown = (
	report: VoiceProviderSloReport
) => {
	const rows = providerKinds
		.map((kind) => {
			const kindReport = report.kinds[kind];
			return `| ${kind.toUpperCase()} | ${kindReport.status} | ${kindReport.events} | ${kindReport.eventsWithLatency} | ${formatMetricValue(getMetric(kindReport, 'averageElapsedMs'))} | ${formatMetricValue(getMetric(kindReport, 'p95ElapsedMs'))} | ${formatMetricValue(getMetric(kindReport, 'errorRate'))} | ${formatMetricValue(getMetric(kindReport, 'timeoutRate'))} | ${formatMetricValue(getMetric(kindReport, 'fallbackRate'))} |`;
		})
		.join('\n');
	const issues =
		report.issues
			.map(
				(issue) =>
					`- ${issue.status}: ${issue.kind ? `${issue.kind.toUpperCase()} ` : ''}${issue.label}${issue.detail ? ` - ${issue.detail}` : ''}`
			)
			.join('\n') || 'No provider SLO issues.';

	return `# Voice Provider SLO Report

Generated: ${new Date(report.checkedAt).toISOString()}

Overall: **${report.status}**

Events: ${report.events}

Events with latency: ${report.eventsWithLatency}

| Kind | Status | Events | Latency Samples | Avg | P95 | Error Rate | Timeout Rate | Fallback Rate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## Issues

${issues}
`;
};

export const renderVoiceProviderSloHTML = (
	report: VoiceProviderSloReport,
	options: {
		title?: string;
	} = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Provider SLOs';
	const kindCards = providerKinds
		.map((kind) => {
			const kindReport = report.kinds[kind];
			const metrics = Object.values(kindReport.metrics)
				.map(
					(metric) =>
						`<div><dt>${escapeHtml(metric.label)}</dt><dd>${escapeHtml(formatMetricValue(metric))}</dd><small>budget ${escapeHtml(formatMetricThreshold(metric))}</small></div>`
				)
				.join('');
			const providers = kindReport.providers.length
				? kindReport.providers.join(', ')
				: 'none recorded';
			return `<article class="${escapeHtml(kindReport.status)}"><h2>${kind.toUpperCase()} <span>${escapeHtml(kindReport.status)}</span></h2><p>${kindReport.events} routing event(s), ${kindReport.eventsWithLatency} latency sample(s), providers: ${escapeHtml(providers)}.</p><dl>${metrics}</dl></article>`;
		})
		.join('');
	const issues =
		report.issues.length > 0
			? `<ul>${report.issues
					.map(
						(issue) =>
							`<li class="${escapeHtml(issue.status)}"><strong>${escapeHtml(issue.kind ? `${issue.kind.toUpperCase()} ${issue.label}` : issue.label)}</strong><span>${escapeHtml(issue.detail ?? '')}</span></li>`
					)
					.join('')}</ul>`
			: '<p>No provider SLO issues.</p>';
	const snippet = `createVoiceProviderSloRoutes({
	store: runtimeStorage.traces,
	requiredKinds: ['llm', 'stt', 'tts'],
	thresholds: {
		llm: { maxAverageElapsedMs: 2500, maxP95ElapsedMs: 4500 },
		stt: { maxAverageElapsedMs: 800, maxP95ElapsedMs: 1500 },
		tts: { maxAverageElapsedMs: 1200, maxP95ElapsedMs: 2200 }
	}
})`;

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101318;color:#f8f4e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}.hero,article,.primitive{background:#171b22;border:1px solid #2c3340;border-radius:24px;margin-bottom:16px;padding:22px}.hero{background:linear-gradient(135deg,rgba(14,165,233,.2),rgba(245,158,11,.12))}.eyebrow{color:#7dd3fc;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,4.9rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}.status,article h2 span{border:1px solid #475569;border-radius:999px;display:inline-flex;font-size:.85rem;padding:6px 10px}.pass{border-color:rgba(34,197,94,.65)}.warn{border-color:rgba(245,158,11,.7)}.fail{border-color:rgba(239,68,68,.75)}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}dl{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}dt{color:#cbd5e1;font-size:.78rem;text-transform:uppercase}dd{font-size:1.7rem;font-weight:900;margin:0}small{color:#a8b3c2}ul{display:grid;gap:10px;list-style:none;padding:0}li{background:#101318;border:1px solid #2c3340;border-radius:16px;padding:12px}li span{color:#cbd5e1;display:block;margin-top:4px}.primitive{background:#11161d}.primitive code{color:#bae6fd}.primitive pre{background:#070b10;border:1px solid #243041;border-radius:16px;color:#e0f2fe;overflow:auto;padding:16px}</style></head><body><main><section class="hero"><p class="eyebrow">Provider latency and fallback proof</p><h1>${escapeHtml(title)}</h1><p class="status ${escapeHtml(report.status)}">${escapeHtml(report.status)}</p><p>${report.events} provider routing event(s), ${report.eventsWithLatency} latency sample(s).</p></section><section class="grid">${kindCards}</section><section class="primitive"><p class="eyebrow">Copy into your app</p><h2><code>createVoiceProviderSloRoutes(...)</code> turns provider speed into release evidence</h2><p>Pair this report with production readiness so LLM/STT/TTS latency, timeout, fallback, and unresolved error regressions block deploys.</p><pre><code>${escapeHtml(snippet)}</code></pre></section><section><h2>Issues</h2>${issues}</section></main></body></html>`;
};

export const createVoiceProviderSloRoutes = (
	options: VoiceProviderSloRoutesOptions
) => {
	const path = options.path ?? '/api/voice/provider-slos';
	const htmlPath = options.htmlPath ?? '/voice/provider-slos';
	const markdownPath = options.markdownPath ?? '/voice/provider-slos.md';
	const headers = {
		'cache-control': 'no-store',
		...(options.headers ?? {})
	};
	const buildReport = () => buildVoiceProviderSloReport(options);
	const app = new Elysia({ name: options.name ?? 'absolute-voice-provider-slos' });

	app.get(path, async () => Response.json(await buildReport(), { headers }));

	if (markdownPath !== false) {
		app.get(markdownPath, async () => {
			const report = await buildReport();
			return new Response(renderVoiceProviderSloMarkdown(report), {
				headers: {
					...headers,
					'content-type': 'text/markdown; charset=utf-8'
				}
			});
		});
	}

	if (htmlPath !== false) {
		app.get(htmlPath, async () => {
			const report = await buildReport();
			const html = options.render
				? await options.render(report)
				: renderVoiceProviderSloHTML(report, {
						title: options.title
					});
			return new Response(html, {
				headers: {
					...headers,
					'content-type': 'text/html; charset=utf-8'
				}
			});
		});
	}

	return app;
};
