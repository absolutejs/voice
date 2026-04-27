import { Elysia } from 'elysia';
import { summarizeVoiceHandoffHealth } from './handoffHealth';
import { summarizeVoiceProviderHealth } from './providerHealth';
import { evaluateVoiceQuality } from './qualityRoutes';
import {
	listVoiceRoutingEvents,
	summarizeVoiceRoutingSessions
} from './resilienceRoutes';
import { summarizeVoiceSessions } from './sessionReplay';
import {
	createVoiceTelephonyCarrierMatrix,
	type VoiceTelephonyCarrierMatrix,
	type VoiceTelephonyCarrierMatrixInput
} from './telephony/matrix';
import type { VoiceTraceEventStore } from './trace';

export type VoiceProductionReadinessStatus = 'fail' | 'pass' | 'warn';

export type VoiceProductionReadinessAction = {
	description?: string;
	href: string;
	label: string;
	method?: 'GET' | 'POST';
};

export type VoiceProductionReadinessCheck = {
	actions?: VoiceProductionReadinessAction[];
	detail?: string;
	href?: string;
	label: string;
	status: VoiceProductionReadinessStatus;
	value?: number | string;
};

export type VoiceProductionReadinessReport = {
	checkedAt: number;
	checks: VoiceProductionReadinessCheck[];
	links: {
		carriers?: string;
		handoffs?: string;
		handoffRetry?: string;
		quality?: string;
		resilience?: string;
		sessions?: string;
	};
	status: VoiceProductionReadinessStatus;
	summary: {
		carriers?: {
			failing: number;
			providers: number;
			ready: number;
			status: VoiceProductionReadinessStatus;
			warnings: number;
		};
		handoffs: {
			failed: number;
			total: number;
		};
		providers: {
			degraded: number;
			total: number;
		};
		quality: {
			status: 'fail' | 'pass';
		};
		routing: {
			events: number;
			sessions: number;
		};
		sessions: {
			failed: number;
			total: number;
		};
	};
};

export type VoiceProductionReadinessRoutesOptions = {
	carriers?:
		| false
		| readonly VoiceTelephonyCarrierMatrixInput[]
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<readonly VoiceTelephonyCarrierMatrixInput[]>
				| readonly VoiceTelephonyCarrierMatrixInput[]);
	headers?: HeadersInit;
	htmlPath?: false | string;
	links?: VoiceProductionReadinessReport['links'];
	llmProviders?: readonly string[];
	name?: string;
	path?: string;
	render?: (report: VoiceProductionReadinessReport) => string | Promise<string>;
	store: VoiceTraceEventStore;
	sttProviders?: readonly string[];
	title?: string;
	ttsProviders?: readonly string[];
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const rollupStatus = (
	checks: VoiceProductionReadinessCheck[]
): VoiceProductionReadinessStatus =>
	checks.some((check) => check.status === 'fail')
		? 'fail'
		: checks.some((check) => check.status === 'warn')
			? 'warn'
			: 'pass';

const carrierStatus = (
	matrix: VoiceTelephonyCarrierMatrix
): VoiceProductionReadinessStatus =>
	matrix.summary.failing > 0
		? 'fail'
		: matrix.summary.warnings > 0 ||
			  matrix.summary.ready < matrix.summary.providers
			? 'warn'
			: 'pass';

const resolveCarriers = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (options.carriers === false || options.carriers === undefined) {
		return undefined;
	}

	const providers =
		typeof options.carriers === 'function'
			? await options.carriers(input)
			: options.carriers;

	return createVoiceTelephonyCarrierMatrix({
		providers: [...providers]
	});
};

export const buildVoiceProductionReadinessReport = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query?: Record<string, unknown>;
		request?: Request;
	} = {}
): Promise<VoiceProductionReadinessReport> => {
	const request = input.request ?? new Request('http://localhost/');
	const query = input.query ?? {};
	const events = await options.store.list();
	const routingEvents = listVoiceRoutingEvents(events);
	const routingSessions = summarizeVoiceRoutingSessions(routingEvents);
	const [quality, providers, sessions, handoffs, carriers] = await Promise.all([
		evaluateVoiceQuality({ events }),
		Promise.all([
			summarizeVoiceProviderHealth({
				events,
				providers: options.llmProviders ?? []
			}),
			summarizeVoiceProviderHealth({
				events: events.filter((event) => event.payload.kind === 'stt'),
				providers: options.sttProviders ?? []
			}),
			summarizeVoiceProviderHealth({
				events: events.filter((event) => event.payload.kind === 'tts'),
				providers: options.ttsProviders ?? []
			})
		]).then((groups) => groups.flat()),
		summarizeVoiceSessions({ events, status: 'all' }),
		summarizeVoiceHandoffHealth({ events }),
		resolveCarriers(options, { query, request })
	]);
	const degradedProviders = providers.filter(
		(provider) =>
			provider.status === 'degraded' ||
			provider.status === 'rate-limited' ||
			provider.status === 'suppressed'
	).length;
	const failedSessions = sessions.filter(
		(session) => session.status === 'failed'
	).length;
	const checks: VoiceProductionReadinessCheck[] = [
		{
			detail:
				quality.status === 'pass'
					? 'Quality gates are passing.'
					: 'Quality gates need attention.',
			href: options.links?.quality ?? '/quality',
			label: 'Quality gates',
			status: quality.status,
			value: quality.status,
			actions:
				quality.status === 'pass'
					? []
					: [
							{
								description: 'Open the quality report to inspect failing gates.',
								href: options.links?.quality ?? '/quality',
								label: 'Inspect quality gates'
							}
						]
		},
		{
			detail:
				degradedProviders === 0
					? 'No configured providers are currently degraded.'
					: `${degradedProviders} provider(s) are degraded, suppressed, or rate-limited.`,
			href: options.links?.resilience ?? '/resilience',
			label: 'Provider health',
			status: degradedProviders > 0 ? 'fail' : 'pass',
			value: degradedProviders,
			actions:
				degradedProviders > 0
					? [
							{
								description:
									'Open provider health, fallback state, and recovery controls.',
								href: options.links?.resilience ?? '/resilience',
								label: 'Open provider recovery'
							}
						]
					: []
		},
		{
			detail:
				failedSessions === 0
					? sessions.length > 0
						? 'Recent sessions have no recorded provider/session failures.'
						: 'No sessions have been recorded yet; run a smoke or live session for proof.'
					: `${failedSessions} recent session(s) have failures.`,
			href: options.links?.sessions ?? '/sessions',
			label: 'Session health',
			status: failedSessions > 0 ? 'fail' : sessions.length === 0 ? 'warn' : 'pass',
			value: `${sessions.length - failedSessions}/${sessions.length}`,
			actions:
				failedSessions > 0
					? [
							{
								description: 'Open failed sessions and replay traces.',
								href: `${options.links?.sessions ?? '/sessions'}?status=failed`,
								label: 'Replay failed sessions'
							}
						]
					: sessions.length === 0
						? [
								{
									description: 'Open sessions after running a smoke or live call.',
									href: options.links?.sessions ?? '/sessions',
									label: 'Open sessions'
								}
							]
						: []
		},
		{
			detail:
				handoffs.failed === 0
					? 'No failed handoff deliveries are recorded.'
					: `${handoffs.failed} handoff delivery failure(s) are recorded.`,
			href: options.links?.handoffs ?? '/handoffs',
			label: 'Handoff delivery',
			status: handoffs.failed > 0 ? 'fail' : 'pass',
			value: `${handoffs.total - handoffs.failed}/${handoffs.total}`,
			actions:
				handoffs.failed > 0
					? [
							{
								description: 'Retry queued or failed handoff deliveries.',
								href:
									options.links?.handoffRetry ?? '/api/voice-handoffs/retry',
								label: 'Retry handoff deliveries',
								method: 'POST'
							},
							{
								description: 'Inspect handoff queue and delivery errors.',
								href: options.links?.handoffs ?? '/handoffs',
								label: 'Open handoff queue'
							}
						]
					: []
		},
		{
			detail:
				routingEvents.length > 0
					? `${routingSessions.length} session(s) have provider routing evidence.`
					: 'No provider routing traces are recorded yet.',
			href: options.links?.resilience ?? '/resilience',
			label: 'Routing evidence',
			status: routingEvents.length > 0 ? 'pass' : 'warn',
			value: routingEvents.length,
			actions:
				routingEvents.length > 0
					? []
					: [
							{
								description:
									'Open provider routing and run a smoke or simulation to create evidence.',
								href: options.links?.resilience ?? '/resilience',
								label: 'Open routing evidence'
							}
						]
		}
	];
	const carrierSummary = carriers
		? {
				failing: carriers.summary.failing,
				providers: carriers.summary.providers,
				ready: carriers.summary.ready,
				status: carrierStatus(carriers),
				warnings: carriers.summary.warnings
			}
		: undefined;

	if (carriers && carrierSummary) {
		checks.push({
			detail:
				carrierSummary.status === 'pass'
					? 'Configured carrier setup and contract checks are passing.'
					: `${carrierSummary.failing} carrier(s) failing, ${carrierSummary.warnings} warning(s).`,
			href: options.links?.carriers ?? '/carriers',
			label: 'Carrier readiness',
			status: carrierSummary.status,
			value: `${carrierSummary.ready}/${carrierSummary.providers}`,
			actions:
				carrierSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open the carrier matrix for exact missing env, signing, and URL issues.',
								href: options.links?.carriers ?? '/carriers',
								label: 'Open carrier matrix'
							}
						]
		});
	}

	return {
		checkedAt: Date.now(),
		checks,
		links: {
			carriers: '/carriers',
			handoffs: '/handoffs',
			handoffRetry: '/api/voice-handoffs/retry',
			quality: '/quality',
			resilience: '/resilience',
			sessions: '/sessions',
			...options.links
		},
		status: rollupStatus(checks),
		summary: {
			carriers: carrierSummary,
			handoffs: {
				failed: handoffs.failed,
				total: handoffs.total
			},
			providers: {
				degraded: degradedProviders,
				total: providers.length
			},
			quality: {
				status: quality.status
			},
			routing: {
				events: routingEvents.length,
				sessions: routingSessions.length
			},
			sessions: {
				failed: failedSessions,
				total: sessions.length
			}
		}
	};
};

export const renderVoiceProductionReadinessHTML = (
	report: VoiceProductionReadinessReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Production Readiness';
	const checks = report.checks
		.map(
			(check, index) => {
				const actions = (check.actions ?? [])
					.map((action) =>
						action.method === 'POST'
							? `<button type="button" data-readiness-action="${index}" data-action-url="${escapeHtml(action.href)}">${escapeHtml(action.label)}</button>`
							: `<a href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`
					)
					.join('');

				return `<article class="check ${escapeHtml(check.status)}">
        <div>
          <span>${escapeHtml(check.status.toUpperCase())}</span>
          <h2>${escapeHtml(check.label)}</h2>
          ${check.detail ? `<p>${escapeHtml(check.detail)}</p>` : ''}
          ${actions ? `<p class="actions">${actions}</p>` : ''}
        </div>
        <strong>${escapeHtml(String(check.value ?? check.status))}</strong>
        ${check.href ? `<a href="${escapeHtml(check.href)}">Open surface</a>` : ''}
      </article>`;
			}
		)
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0c0f14;color:#f6f2e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1060px;padding:32px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.18),rgba(245,158,11,.12));border:1px solid #26313d;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#fbbf24;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:.9;margin:.2rem 0 1rem}.status{display:inline-flex;border:1px solid #3f3f46;border-radius:999px;padding:8px 12px}.status.pass,.check.pass{border-color:rgba(34,197,94,.55)}.status.warn,.check.warn{border-color:rgba(245,158,11,.65)}.status.fail,.check.fail{border-color:rgba(239,68,68,.75)}.checks{display:grid;gap:14px}.check{align-items:center;background:#141922;border:1px solid #26313d;border-radius:22px;display:grid;gap:16px;grid-template-columns:1fr auto auto;padding:18px}.check span{color:#a8b0b8;font-size:.78rem;font-weight:900;letter-spacing:.08em}.check h2{margin:.2rem 0}.check p{color:#b9c0c8;margin:.2rem 0 0}.check strong{font-size:1.5rem}.actions{display:flex;flex-wrap:wrap;gap:10px}.check a,a{color:#fbbf24}button{background:#fbbf24;border:0;border-radius:999px;color:#111827;cursor:pointer;font-weight:800;padding:9px 12px}button:disabled{cursor:wait;opacity:.65}@media(max-width:760px){main{padding:20px}.check{grid-template-columns:1fr}}</style></head><body><main><section class="hero"><p class="eyebrow">Self-hosted readiness</p><h1>${escapeHtml(title)}</h1><p>One deployable pass/fail report for quality gates, provider failover, session health, handoffs, routing evidence, and optional carrier readiness.</p><p class="status ${escapeHtml(report.status)}">Overall: ${escapeHtml(report.status.toUpperCase())}</p><p>Checked ${escapeHtml(new Date(report.checkedAt).toLocaleString())}</p></section><section class="checks">${checks}</section></main><script>document.querySelectorAll("[data-readiness-action]").forEach((button)=>{button.addEventListener("click",async()=>{const url=button.getAttribute("data-action-url");if(!url)return;button.disabled=true;const original=button.textContent;button.textContent="Running...";try{const response=await fetch(url,{method:"POST"});button.textContent=response.ok?"Done. Reloading...":"Failed";if(response.ok)setTimeout(()=>location.reload(),500)}catch{button.textContent="Failed"}finally{setTimeout(()=>{button.disabled=false;button.textContent=original},1500)}})});</script></body></html>`;
};

export const createVoiceProductionReadinessRoutes = (
	options: VoiceProductionReadinessRoutesOptions
) => {
	const path = options.path ?? '/api/production-readiness';
	const htmlPath = options.htmlPath ?? '/production-readiness';
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-production-readiness'
	});

	routes.get(path, async ({ query, request }) =>
		buildVoiceProductionReadinessReport(options, { query, request })
	);
	if (htmlPath !== false) {
		routes.get(htmlPath, async ({ query, request }) => {
			const report = await buildVoiceProductionReadinessReport(options, {
				query,
				request
			});
			const body = await (options.render ?? renderVoiceProductionReadinessHTML)(
				report
			);

			return new Response(body, {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		});
	}

	return routes;
};
