import { Elysia } from 'elysia';
import {
	evaluateVoiceQuality,
	type VoiceQualityReport,
	type VoiceQualityThresholds
} from './qualityRoutes';
import {
	filterVoiceTraceEvents,
	summarizeVoiceTrace,
	type StoredVoiceTraceEvent,
	type VoiceTraceEventStore
} from './trace';

export type VoiceEvalStatus = 'pass' | 'fail';

export type VoiceEvalSessionReport = {
	endedAt?: number;
	eventCount: number;
	quality: VoiceQualityReport;
	scenarioId?: string;
	sessionId: string;
	startedAt?: number;
	status: VoiceEvalStatus;
	summary: ReturnType<typeof summarizeVoiceTrace>;
};

export type VoiceEvalTrendBucket = {
	endedAt: number;
	failed: number;
	key: string;
	passed: number;
	total: number;
};

export type VoiceEvalReport = {
	checkedAt: number;
	failed: number;
	passed: number;
	sessions: VoiceEvalSessionReport[];
	status: VoiceEvalStatus;
	total: number;
	trend: VoiceEvalTrendBucket[];
};

export type VoiceEvalLink = {
	href: string;
	label: string;
};

export type VoiceEvalRoutesOptions = {
	events?: StoredVoiceTraceEvent[];
	headers?: HeadersInit;
	links?: VoiceEvalLink[];
	limit?: number;
	name?: string;
	path?: string;
	store?: VoiceTraceEventStore;
	thresholds?: VoiceQualityThresholds;
	title?: string;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const sessionTime = (events: StoredVoiceTraceEvent[]) => {
	const sorted = filterVoiceTraceEvents(events);
	return {
		endedAt: sorted.at(-1)?.at,
		startedAt: sorted[0]?.at
	};
};

const bucketKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

const buildTrend = (
	sessions: VoiceEvalSessionReport[]
): VoiceEvalTrendBucket[] => {
	const buckets = new Map<string, VoiceEvalTrendBucket>();
	for (const session of sessions) {
		const endedAt = session.endedAt ?? session.startedAt ?? session.quality.checkedAt;
		const key = bucketKey(endedAt);
		const bucket =
			buckets.get(key) ??
			({
				endedAt,
				failed: 0,
				key,
				passed: 0,
				total: 0
			} satisfies VoiceEvalTrendBucket);
		bucket.endedAt = Math.max(bucket.endedAt, endedAt);
		bucket.total += 1;
		if (session.status === 'pass') {
			bucket.passed += 1;
		} else {
			bucket.failed += 1;
		}
		buckets.set(key, bucket);
	}

	return [...buckets.values()].sort((left, right) => right.endedAt - left.endedAt);
};

export const runVoiceSessionEvals = async (
	options: {
		events?: StoredVoiceTraceEvent[];
		limit?: number;
		store?: VoiceTraceEventStore;
		thresholds?: VoiceQualityThresholds;
	} = {}
): Promise<VoiceEvalReport> => {
	const events = filterVoiceTraceEvents(
		options.events ?? (await options.store?.list()) ?? []
	);
	const grouped = new Map<string, StoredVoiceTraceEvent[]>();
	for (const event of events) {
		grouped.set(event.sessionId, [...(grouped.get(event.sessionId) ?? []), event]);
	}
	const sessions = await Promise.all(
		[...grouped.entries()].map(async ([sessionId, sessionEvents]) => {
			const sorted = filterVoiceTraceEvents(sessionEvents);
			const quality = await evaluateVoiceQuality({
				events: sorted,
				thresholds: options.thresholds
			});
			const { endedAt, startedAt } = sessionTime(sorted);
			const summary = summarizeVoiceTrace(sorted);
			const scenarioId = sorted.find((event) => event.scenarioId)?.scenarioId;

			return {
				endedAt,
				eventCount: sorted.length,
				quality,
				scenarioId,
				sessionId,
				startedAt,
				status: quality.status,
				summary
			} satisfies VoiceEvalSessionReport;
		})
	);
	const limitedSessions = sessions
		.sort(
			(left, right) =>
				(right.endedAt ?? right.startedAt ?? 0) -
				(left.endedAt ?? left.startedAt ?? 0)
		)
		.slice(0, options.limit ?? 100);
	const failed = limitedSessions.filter((session) => session.status === 'fail').length;
	const passed = limitedSessions.length - failed;

	return {
		checkedAt: Date.now(),
		failed,
		passed,
		sessions: limitedSessions,
		status: failed > 0 ? 'fail' : 'pass',
		total: limitedSessions.length,
		trend: buildTrend(limitedSessions)
	};
};

const formatTime = (value: number | undefined) =>
	value === undefined ? 'unknown' : new Date(value).toLocaleString();

export const renderVoiceEvalHTML = (
	report: VoiceEvalReport,
	options: { links?: VoiceEvalLink[]; title?: string } = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Evals';
	const links = options.links?.length
		? `<nav>${options.links
				.map(
					(link) =>
						`<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`
				)
				.join('')}</nav>`
		: '';
	const trend = report.trend.length
		? report.trend
				.map(
					(bucket) =>
						`<tr><td>${escapeHtml(bucket.key)}</td><td>${bucket.total}</td><td>${bucket.passed}</td><td>${bucket.failed}</td></tr>`
				)
				.join('')
		: '<tr><td colspan="4">No eval buckets yet.</td></tr>';
	const sessions = report.sessions.length
		? report.sessions
				.map((session) => {
					const failedMetrics = Object.entries(session.quality.metrics)
						.filter(([, metric]) => !metric.pass)
						.map(([, metric]) => metric.label)
						.join(', ');
					return `<tr class="${session.status}"><td>${escapeHtml(session.sessionId)}</td><td>${escapeHtml(session.status)}</td><td>${session.eventCount}</td><td>${session.summary.turnCount}</td><td>${session.summary.errorCount}</td><td>${escapeHtml(formatTime(session.endedAt))}</td><td>${escapeHtml(failedMetrics || 'none')}</td></tr>`;
				})
				.join('')
		: '<tr><td colspan="7">No sessions found.</td></tr>';

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:2rem;background:#f8f7f2;color:#181713}main{max-width:1180px;margin:auto}nav{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem}nav a{background:#181713;border-radius:999px;color:white;padding:.35rem .7rem;text-decoration:none}.status{border-radius:999px;display:inline-flex;font-weight:800;padding:.35rem .75rem}.pass{color:#166534}.fail{color:#991b1b}.status.pass{background:#dcfce7}.status.fail{background:#fee2e2}.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin:1rem 0}.card{background:white;border:1px solid #e7e5e4;border-radius:1rem;padding:1rem}.card strong{display:block;font-size:2rem}table{border-collapse:collapse;background:white;width:100%;margin:1rem 0 2rem}td,th{border-bottom:1px solid #eee;padding:.75rem;text-align:left}tr.fail td{border-left:4px solid #dc2626}tr.pass td{border-left:4px solid #16a34a}</style></head><body><main>${links}<h1>${escapeHtml(title)}</h1><p class="status ${report.status}">${report.status}</p><div class="grid"><article class="card"><span>Total</span><strong>${report.total}</strong></article><article class="card"><span>Passed</span><strong>${report.passed}</strong></article><article class="card"><span>Failed</span><strong>${report.failed}</strong></article></div><h2>Trend</h2><table><thead><tr><th>Day</th><th>Total</th><th>Passed</th><th>Failed</th></tr></thead><tbody>${trend}</tbody></table><h2>Session Eval Results</h2><table><thead><tr><th>Session</th><th>Status</th><th>Events</th><th>Turns</th><th>Errors</th><th>Last event</th><th>Failed metrics</th></tr></thead><tbody>${sessions}</tbody></table></main></body></html>`;
};

export const createVoiceEvalRoutes = (options: VoiceEvalRoutesOptions) => {
	const path = options.path ?? '/evals';
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-evals'
	});
	const getReport = () =>
		runVoiceSessionEvals({
			events: options.events,
			limit: options.limit,
			store: options.store,
			thresholds: options.thresholds
		});

	routes.get(path, async () => {
		const report = await getReport();
		return new Response(
			renderVoiceEvalHTML(report, {
				links: options.links,
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
