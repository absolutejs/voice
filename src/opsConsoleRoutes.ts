import { Elysia } from 'elysia';
import {
	buildVoiceDeliverySinkReport,
	type VoiceDeliverySinkReport,
	type VoiceDeliverySinkRoutesOptions
} from './deliverySinkRoutes';
import { summarizeVoiceHandoffHealth } from './handoffHealth';
import { summarizeVoiceProviderHealth } from './providerHealth';
import { evaluateVoiceQuality, type VoiceQualityReport } from './qualityRoutes';
import { listVoiceRoutingEvents, type VoiceRoutingEvent } from './resilienceRoutes';
import {
	summarizeVoiceSessions,
	type VoiceSessionListItem
} from './sessionReplay';
import { summarizeVoiceTrace, type VoiceTraceEventStore } from './trace';

export type VoiceOpsConsoleLink = {
	description?: string;
	href: string;
	label: string;
	statusHref?: string;
};

export type VoiceOpsConsoleReport = {
	checkedAt: number;
	eventCount: number;
	handoffs: {
		failed: number;
		total: number;
	};
	links: VoiceOpsConsoleLink[];
	deliverySinks?: VoiceDeliverySinkReport;
	providers: {
		degraded: number;
		healthy: number;
		total: number;
	};
	quality: VoiceQualityReport;
	recentRoutingEvents: VoiceRoutingEvent[];
	recentSessions: VoiceSessionListItem[];
	sessions: {
		failed: number;
		healthy: number;
		total: number;
	};
	trace: ReturnType<typeof summarizeVoiceTrace>;
};

export type VoiceOpsConsoleRoutesOptions = {
	headers?: HeadersInit;
	deliverySinks?: false | VoiceDeliverySinkRoutesOptions;
	links?: VoiceOpsConsoleLink[];
	llmProviders?: readonly string[];
	name?: string;
	path?: string;
	store: VoiceTraceEventStore;
	sttProviders?: readonly string[];
	title?: string;
	ttsProviders?: readonly string[];
};

const DEFAULT_LINKS: VoiceOpsConsoleLink[] = [
	{
		description: 'Quality gates for CI, deploy checks, and production readiness.',
		href: '/quality',
		label: 'Quality',
		statusHref: '/quality/status'
	},
	{
		description: 'Replay stored sessions against acceptance gates over time.',
		href: '/evals',
		label: 'Evals',
		statusHref: '/evals/status'
	},
	{
		description: 'Provider health, fallback paths, and failure simulation.',
		href: '/resilience',
		label: 'Resilience'
	},
	{
		description: 'Redacted trace exports for debugging and support handoffs.',
		href: '/diagnostics',
		label: 'Diagnostics'
	},
	{
		description: 'Recent sessions with replay links.',
		href: '/sessions',
		label: 'Sessions'
	},
	{
		description: 'Transfer and webhook delivery health.',
		href: '/handoffs',
		label: 'Handoffs'
	}
];

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const countProviderStatuses = (
	providers: Array<{ status: string }>
): VoiceOpsConsoleReport['providers'] => {
	const degradedStatuses = new Set(['degraded', 'rate-limited', 'suppressed']);
	const healthy = providers.filter((provider) => provider.status === 'healthy').length;
	const degraded = providers.filter((provider) =>
		degradedStatuses.has(provider.status)
	).length;

	return {
		degraded,
		healthy,
		total: providers.length
	};
};

export const buildVoiceOpsConsoleReport = async (
	options: VoiceOpsConsoleRoutesOptions
): Promise<VoiceOpsConsoleReport> => {
	const events = await options.store.list();
	const providers = [
		...(await summarizeVoiceProviderHealth({
			events,
			providers: options.llmProviders
		})),
		...(await summarizeVoiceProviderHealth({
			events,
			providers: options.sttProviders
		})),
		...(await summarizeVoiceProviderHealth({
			events,
			providers: options.ttsProviders
		}))
	];
	const handoffs = await summarizeVoiceHandoffHealth({ events });
	const sessions = await summarizeVoiceSessions({
		events,
		limit: 8,
		status: 'all'
	});
	const quality = await evaluateVoiceQuality({ events });
	const routingEvents = listVoiceRoutingEvents(events).slice(0, 10);
	const trace = summarizeVoiceTrace(events);
	const deliverySinkOptions = options.deliverySinks || undefined;
	const deliverySinks = deliverySinkOptions
		? await buildVoiceDeliverySinkReport(deliverySinkOptions)
		: undefined;
	const baseLinks = options.links ?? DEFAULT_LINKS;
	const links =
		deliverySinks &&
		!baseLinks.some(
			(link) =>
				link.href === (deliverySinkOptions?.htmlPath ?? '/delivery-sinks') ||
				link.statusHref === (deliverySinkOptions?.path ?? '/api/voice-delivery-sinks')
		)
			? [
					...baseLinks,
					{
						description:
							'Configured audit and trace delivery sinks with queue health.',
						href:
							deliverySinkOptions?.htmlPath === false
								? (deliverySinkOptions.path ?? '/api/voice-delivery-sinks')
								: (deliverySinkOptions?.htmlPath ?? '/delivery-sinks'),
						label: 'Delivery Sinks',
						statusHref: deliverySinkOptions?.path ?? '/api/voice-delivery-sinks'
					}
				]
			: baseLinks;

	return {
		checkedAt: Date.now(),
		deliverySinks,
		eventCount: events.length,
		handoffs: {
			failed: handoffs.failed,
			total: handoffs.total
		},
		links,
		providers: countProviderStatuses(providers),
		quality,
		recentRoutingEvents: routingEvents,
		recentSessions: sessions,
		sessions: {
			failed: sessions.filter((session) => session.status === 'failed').length,
			healthy: sessions.filter((session) => session.status === 'healthy').length,
			total: sessions.length
		},
		trace
	};
};

const renderMetricCard = (input: {
	href?: string;
	label: string;
	status?: string;
	value: number | string;
}) =>
	`<article class="metric"><span>${escapeHtml(input.label)}</span><strong>${escapeHtml(String(input.value))}</strong>${input.status ? `<p class="${escapeHtml(input.status)}">${escapeHtml(input.status)}</p>` : ''}${input.href ? `<a href="${escapeHtml(input.href)}">Open</a>` : ''}</article>`;

export const renderVoiceOpsConsoleHTML = (
	report: VoiceOpsConsoleReport,
	options: { title?: string } = {}
) => {
	const links = report.links
		.map(
			(link) => `<article class="surface">
<div><h2>${escapeHtml(link.label)}</h2>${link.description ? `<p>${escapeHtml(link.description)}</p>` : ''}</div>
<p><a href="${escapeHtml(link.href)}">Open ${escapeHtml(link.label)}</a>${link.statusHref ? ` · <a href="${escapeHtml(link.statusHref)}">Status</a>` : ''}</p>
</article>`
		)
		.join('');
	const sessions = report.recentSessions.length
		? report.recentSessions
				.map(
					(session) =>
						`<tr><td>${escapeHtml(session.sessionId)}</td><td>${escapeHtml(session.status)}</td><td>${session.turnCount}</td><td>${session.errorCount}</td><td>${session.replayHref ? `<a href="${escapeHtml(session.replayHref)}">Replay</a>` : ''}</td></tr>`
				)
				.join('')
		: '<tr><td colspan="5">No sessions yet.</td></tr>';
	const routing = report.recentRoutingEvents.length
		? report.recentRoutingEvents
				.map(
					(event) =>
						`<tr><td>${escapeHtml(event.kind)}</td><td>${escapeHtml(event.provider ?? 'unknown')}</td><td>${escapeHtml(event.status ?? 'unknown')}</td><td>${event.elapsedMs ?? 0}ms</td><td>${escapeHtml(event.sessionId)}</td></tr>`
				)
				.join('')
		: '<tr><td colspan="5">No provider routing events yet.</td></tr>';
	const title = options.title ?? 'AbsoluteJS Voice Ops Console';

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#101316;color:#f6f2e8;margin:0}main{max-width:1180px;margin:auto;padding:32px}a{color:#fbbf24}header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:24px}.eyebrow{color:#fbbf24;font-weight:800;letter-spacing:.08em;text-transform:uppercase}h1{font-size:clamp(2.2rem,5vw,4.5rem);line-height:.95;margin:.2rem 0 1rem}.muted{color:#a8b0b8}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:20px 0}.metric,.surface{background:#181d22;border:1px solid #2a323a;border-radius:20px;padding:18px}.metric strong{display:block;font-size:2.2rem;margin:.25rem 0}.pass,.healthy{color:#86efac}.fail,.failed,.degraded{color:#fca5a5}.surfaces{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin:24px 0}table{width:100%;border-collapse:collapse;background:#181d22;border-radius:16px;overflow:hidden;margin:12px 0 28px}td,th{border-bottom:1px solid #2a323a;padding:12px;text-align:left}section{margin-top:30px}@media(max-width:700px){main{padding:20px}header{display:block}}</style></head><body><main><header><div><p class="eyebrow">Self-hosted voice operations</p><h1>${escapeHtml(title)}</h1><p class="muted">One deployable control plane for quality gates, failover, traces, sessions, handoffs, and provider health.</p></div><p class="muted">Checked ${escapeHtml(new Date(report.checkedAt).toLocaleString())}</p></header><div class="grid">${renderMetricCard({ label: 'Quality', value: report.quality.status, status: report.quality.status, href: '/quality' })}${renderMetricCard({ label: 'Events', value: report.eventCount, href: '/diagnostics' })}${renderMetricCard({ label: 'Sessions', value: report.sessions.total, status: report.sessions.failed > 0 ? 'failed' : 'healthy', href: '/sessions' })}${renderMetricCard({ label: 'Handoffs failed', value: report.handoffs.failed, status: report.handoffs.failed > 0 ? 'failed' : 'healthy', href: '/handoffs' })}${renderMetricCard({ label: 'Providers degraded', value: report.providers.degraded, status: report.providers.degraded > 0 ? 'degraded' : 'healthy', href: '/resilience' })}</div><section><h2>Operational Surfaces</h2><div class="surfaces">${links}</div></section><section><h2>Recent Sessions</h2><table><thead><tr><th>Session</th><th>Status</th><th>Turns</th><th>Errors</th><th>Replay</th></tr></thead><tbody>${sessions}</tbody></table></section><section><h2>Recent Provider Routing</h2><table><thead><tr><th>Kind</th><th>Provider</th><th>Status</th><th>Elapsed</th><th>Session</th></tr></thead><tbody>${routing}</tbody></table></section></main></body></html>`;
};

export const createVoiceOpsConsoleRoutes = (
	options: VoiceOpsConsoleRoutesOptions
) => {
	const path = options.path ?? '/ops-console';
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-ops-console'
	});
	const getReport = () => buildVoiceOpsConsoleReport(options);

	routes.get(path, async () => {
		const report = await getReport();
		return new Response(
			renderVoiceOpsConsoleHTML(report, { title: options.title }),
			{
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					...options.headers
				}
			}
		);
	});
	routes.get(`${path}/json`, async () => getReport());

	return routes;
};
