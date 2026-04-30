import { Elysia } from 'elysia';
import type { VoiceTraceEventStore } from './trace';

export type VoiceLiveLatencyStatus = 'empty' | 'fail' | 'pass' | 'warn';

export type VoiceLiveLatencySample = {
	at: number;
	latencyMs: number;
	sessionId: string;
	status?: string;
	traceId?: string;
};

export type VoiceLiveLatencyReport = {
	averageLatencyMs?: number;
	checkedAt: number;
	failed: number;
	p50LatencyMs?: number;
	p95LatencyMs?: number;
	recent: VoiceLiveLatencySample[];
	status: VoiceLiveLatencyStatus;
	total: number;
	warnings: number;
};

export type VoiceLiveLatencyOptions = {
	failAfterMs?: number;
	limit?: number;
	store: VoiceTraceEventStore;
	warnAfterMs?: number;
};

export type VoiceLiveLatencyRoutesOptions = VoiceLiveLatencyOptions & {
	headers?: HeadersInit;
	htmlPath?: false | string;
	name?: string;
	path?: string;
	title?: string;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const percentile = (values: number[], percentileValue: number) => {
	if (values.length === 0) {
		return undefined;
	}
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)
	);
	return Math.round(sorted[index] ?? 0);
};

const getLatency = (payload: Record<string, unknown>) =>
	typeof payload.latencyMs === 'number'
		? payload.latencyMs
		: typeof payload.elapsedMs === 'number'
			? payload.elapsedMs
			: undefined;

export const summarizeVoiceLiveLatency = async (
	options: VoiceLiveLatencyOptions
): Promise<VoiceLiveLatencyReport> => {
	const warnAfterMs = options.warnAfterMs ?? 1800;
	const failAfterMs = options.failAfterMs ?? 3200;
	const events = await options.store.list({
		limit: options.limit ?? 100,
		type: 'client.live_latency'
	});
	const recent = events
		.map((event): VoiceLiveLatencySample | undefined => {
			const latencyMs = getLatency(event.payload);
			if (latencyMs === undefined) {
				return undefined;
			}
			return {
				at: event.at,
				latencyMs,
				sessionId: event.sessionId,
				status:
					typeof event.payload.status === 'string' ? event.payload.status : undefined,
				traceId: event.traceId
			};
		})
		.filter((sample): sample is VoiceLiveLatencySample => Boolean(sample))
		.sort((left, right) => right.at - left.at);
	const latencies = recent.map((sample) => sample.latencyMs);
	const failed = latencies.filter((value) => value > failAfterMs).length;
	const warnings = latencies.filter(
		(value) => value > warnAfterMs && value <= failAfterMs
	).length;

	return {
		averageLatencyMs:
			latencies.length > 0
				? Math.round(
						latencies.reduce((total, value) => total + value, 0) /
							latencies.length
					)
				: undefined,
		checkedAt: Date.now(),
		failed,
		p50LatencyMs: percentile(latencies, 50),
		p95LatencyMs: percentile(latencies, 95),
		recent,
		status:
			latencies.length === 0
				? 'empty'
				: failed > 0
					? 'fail'
					: warnings > 0
						? 'warn'
						: 'pass',
		total: latencies.length,
		warnings
	};
};

const formatMs = (value?: number) =>
	typeof value === 'number' ? `${Math.round(value)}ms` : 'n/a';

export const renderVoiceLiveLatencyHTML = (
	report: VoiceLiveLatencyReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'Voice Live Latency';
	const snippet = `app.use(
  createVoiceLiveLatencyRoutes({
    failAfterMs: 3200,
    htmlPath: '/live-latency',
    path: '/api/live-latency',
    store: traceStore,
    warnAfterMs: 1800
  })
);

await traceStore.append({
  at: Date.now(),
  payload: {
    latencyMs,
    status: 'assistant_audio_started'
  },
  sessionId,
  type: 'client.live_latency'
});`;
	const rows = report.recent
		.map(
			(sample) => `<tr><td>${escapeHtml(sample.sessionId)}</td><td>${escapeHtml(formatMs(sample.latencyMs))}</td><td>${escapeHtml(sample.status ?? 'unknown')}</td><td>${escapeHtml(new Date(sample.at).toLocaleString())}</td></tr>`
		)
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0c0f14;color:#f6f2e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1060px;padding:32px}.hero{background:linear-gradient(135deg,rgba(94,234,212,.16),rgba(245,158,11,.1));border:1px solid #26313d;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:.9;margin:.2rem 0 1rem}.status{border:1px solid #3f3f46;border-radius:999px;display:inline-flex;padding:8px 12px}.pass{color:#86efac}.warn,.empty{color:#fbbf24}.fail{color:#fca5a5}.metrics{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin:18px 0}.metrics article,table,.primitive{background:#141922;border:1px solid #26313d;border-radius:18px}.metrics article,.primitive{padding:16px}.metrics span{color:#a8b0b8}.metrics strong{display:block;font-size:2rem;margin-top:.25rem}.primitive{margin:0 0 18px}.primitive h2{margin:.2rem 0 .5rem}.primitive p{color:#cbd5e1}.primitive pre{background:#080b10;border:1px solid #26313d;border-radius:16px;color:#d9fff7;overflow:auto;padding:16px}table{border-collapse:collapse;overflow:hidden;width:100%}td,th{border-bottom:1px solid #26313d;padding:12px;text-align:left}@media(max-width:760px){main{padding:20px}}</style></head><body><main><section class="hero"><p class="eyebrow">Browser proof</p><h1>${escapeHtml(title)}</h1><p>Recent real browser speech-to-assistant response measurements from persisted <code>client.live_latency</code> traces.</p><p class="status ${escapeHtml(report.status)}">Status: ${escapeHtml(report.status)}</p><section class="metrics"><article><span>p50</span><strong>${escapeHtml(formatMs(report.p50LatencyMs))}</strong></article><article><span>p95</span><strong>${escapeHtml(formatMs(report.p95LatencyMs))}</strong></article><article><span>Average</span><strong>${escapeHtml(formatMs(report.averageLatencyMs))}</strong></article><article><span>Samples</span><strong>${String(report.total)}</strong></article></section></section><section class="primitive"><p class="eyebrow">Copy into your app</p><h2><code>createVoiceLiveLatencyRoutes(...)</code> turns real browser timing into a release gate</h2><p>Persist live timing samples into the trace store so readiness, simulations, and trace timelines all point at the same self-hosted proof.</p><pre><code>${escapeHtml(snippet)}</code></pre></section><table><thead><tr><th>Session</th><th>Latency</th><th>Status</th><th>Measured</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No live latency samples yet.</td></tr>'}</tbody></table></main></body></html>`;
};

export const createVoiceLiveLatencyRoutes = (
	options: VoiceLiveLatencyRoutesOptions
) => {
	const path = options.path ?? '/api/live-latency';
	const htmlPath = options.htmlPath === undefined ? '/live-latency' : options.htmlPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-live-latency'
	}).get(path, () => summarizeVoiceLiveLatency(options));

	if (htmlPath) {
		routes.get(htmlPath, async () => {
			const report = await summarizeVoiceLiveLatency(options);
			return new Response(renderVoiceLiveLatencyHTML(report, options), {
				headers: {
					'content-type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		});
	}

	return routes;
};
