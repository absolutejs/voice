import { Elysia } from 'elysia';
import type {
	VoiceFailureReplayReport,
	VoiceOperationsRecord
} from './operationsRecord';
import type { VoiceOperationalStatusReport } from './operationalStatus';
import type { VoiceOpsRecoveryReport } from './opsRecovery';
import type { VoiceMonitorIssue } from './voiceMonitoring';

export type VoiceIncidentTimelineStatus = 'fail' | 'pass' | 'warn';

export type VoiceIncidentTimelineSeverity = 'critical' | 'info' | 'warn';

export type VoiceIncidentTimelineAction = {
	href?: string;
	label: string;
	method?: 'GET' | 'POST';
};

export type VoiceIncidentTimelineEvent = {
	action?: VoiceIncidentTimelineAction;
	at: number;
	category:
		| 'call'
		| 'delivery'
		| 'failure-replay'
		| 'monitor'
		| 'operational-status'
		| 'readiness'
		| 'recovery';
	detail?: string;
	href?: string;
	id: string;
	label: string;
	sessionId?: string;
	severity: VoiceIncidentTimelineSeverity;
	source: string;
	value?: number | string;
};

export type VoiceIncidentTimelineReport = {
	events: VoiceIncidentTimelineEvent[];
	generatedAt: number;
	links: VoiceIncidentTimelineLinks;
	status: VoiceIncidentTimelineStatus;
	summary: {
		critical: number;
		info: number;
		total: number;
		warn: number;
	};
	windowMs?: number;
};

export type VoiceIncidentTimelineValue<TValue> =
	| TValue
	| (() => Promise<TValue> | TValue);

export type VoiceIncidentTimelineLinks = {
	callDebugger?: string | ((sessionId: string) => string);
	deliveryRuntime?: string;
	failureReplay?: string | ((sessionId: string) => string);
	monitorIssues?: string;
	operationalStatus?: string;
	operationsRecords?: string | ((sessionId: string) => string);
	productionReadiness?: string;
	proofPack?: string;
	supportBundle?: string | ((sessionId: string) => string);
};

export type VoiceIncidentTimelineOptions = {
	failureReplays?: VoiceIncidentTimelineValue<
		readonly VoiceFailureReplayReport[]
	>;
	links?: VoiceIncidentTimelineLinks;
	limit?: number;
	monitorIssues?: VoiceIncidentTimelineValue<readonly VoiceMonitorIssue[]>;
	now?: number;
	operationalStatus?: VoiceIncidentTimelineValue<VoiceOperationalStatusReport>;
	operationsRecords?: VoiceIncidentTimelineValue<
		readonly VoiceOperationsRecord[]
	>;
	opsRecovery?: VoiceIncidentTimelineValue<VoiceOpsRecoveryReport>;
	windowMs?: number;
};

export type VoiceIncidentTimelineRoutesOptions =
	VoiceIncidentTimelineOptions & {
		headers?: HeadersInit;
		htmlPath?: false | string;
		markdownPath?: false | string;
		name?: string;
		path?: string;
		render?: (report: VoiceIncidentTimelineReport) => string | Promise<string>;
		title?: string;
	};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const resolveValue = async <TValue>(
	value: VoiceIncidentTimelineValue<TValue> | undefined
) =>
	typeof value === 'function'
		? await (value as () => Promise<TValue> | TValue)()
		: value;

const linkForSession = (
	link: string | ((sessionId: string) => string) | undefined,
	sessionId: string | undefined
) => {
	if (!link || !sessionId) {
		return undefined;
	}

	return typeof link === 'function' ? link(sessionId) : link;
};

const statusToSeverity = (
	status: 'fail' | 'failed' | 'healthy' | 'pass' | 'recovered' | 'warn' | 'warning'
): VoiceIncidentTimelineSeverity =>
	status === 'fail' || status === 'failed'
		? 'critical'
		: status === 'warn' || status === 'warning' || status === 'recovered'
			? 'warn'
			: 'info';

const failureReplayStatusToSeverity = (
	status: VoiceFailureReplayReport['status']
): VoiceIncidentTimelineSeverity =>
	status === 'failed' ? 'critical' : status === 'healthy' ? 'info' : 'warn';

const withinWindow = (
	event: VoiceIncidentTimelineEvent,
	now: number,
	windowMs: number | undefined
) => !windowMs || event.at >= now - windowMs;

const eventStatus = (
	event: VoiceIncidentTimelineEvent
): VoiceIncidentTimelineStatus =>
	event.severity === 'critical'
		? 'fail'
		: event.severity === 'warn'
			? 'warn'
			: 'pass';

const worstStatus = (
	statuses: readonly VoiceIncidentTimelineStatus[]
): VoiceIncidentTimelineStatus =>
	statuses.includes('fail')
		? 'fail'
		: statuses.includes('warn')
			? 'warn'
			: 'pass';

const pushOperationalStatusEvents = (
	events: VoiceIncidentTimelineEvent[],
	report: VoiceOperationalStatusReport | undefined,
	links: VoiceIncidentTimelineLinks
) => {
	if (!report) {
		return;
	}

	for (const check of report.checks) {
		if (check.status === 'pass') {
			continue;
		}

		events.push({
			action: {
				href: check.href ?? links.operationalStatus,
				label: 'Open source'
			},
			at: report.checkedAt,
			category:
				check.label.toLowerCase().includes('readiness') ? 'readiness' : 'operational-status',
			detail: check.detail,
			href: check.href ?? links.operationalStatus,
			id: `operational:${check.label}`,
			label: check.label,
			severity: statusToSeverity(check.status),
			source: 'operational-status',
			value: check.value
		});
	}
};

const pushOpsRecoveryEvents = (
	events: VoiceIncidentTimelineEvent[],
	report: VoiceOpsRecoveryReport | undefined,
	links: VoiceIncidentTimelineLinks
) => {
	if (!report) {
		return;
	}

	for (const issue of report.issues) {
		events.push({
			action: {
				href: issue.href ?? links.operationalStatus,
				label: 'Inspect recovery issue'
			},
			at: report.checkedAt,
			category: 'recovery',
			detail: issue.detail,
			href: issue.href,
			id: `ops-recovery:${issue.code}`,
			label: issue.label,
			severity: issue.severity === 'fail' ? 'critical' : 'warn',
			source: 'ops-recovery',
			value: issue.value
		});
	}

	for (const session of report.failedSessions) {
		events.push({
			action: {
				href:
					session.operationsRecordHref ??
					linkForSession(links.operationsRecords, session.sessionId) ??
					linkForSession(links.callDebugger, session.sessionId),
				label: 'Open affected call'
			},
			at: session.at,
			category: 'call',
			detail: session.error,
			href:
				session.operationsRecordHref ??
				linkForSession(links.operationsRecords, session.sessionId),
			id: `failed-session:${session.sessionId}:${session.at}`,
			label: 'Failed session',
			sessionId: session.sessionId,
			severity: 'critical',
			source: 'ops-recovery',
			value: session.provider
		});
	}
};

const pushMonitorEvents = (
	events: VoiceIncidentTimelineEvent[],
	issues: readonly VoiceMonitorIssue[] | undefined,
	links: VoiceIncidentTimelineLinks
) => {
	if (!issues) {
		return;
	}

	for (const issue of issues) {
		if (issue.status === 'resolved') {
			continue;
		}
		const sessionId = issue.impactedSessions[0];

		events.push({
			action: {
				href:
					issue.operationsRecordHrefs[0] ??
					linkForSession(links.operationsRecords, sessionId) ??
					links.monitorIssues,
				label: 'Open monitor evidence'
			},
			at: issue.lastSeenAt,
			category: 'monitor',
			detail: issue.detail,
			href:
				issue.operationsRecordHrefs[0] ??
				linkForSession(links.operationsRecords, sessionId) ??
				links.monitorIssues,
			id: `monitor:${issue.id}`,
			label: issue.label,
			sessionId,
			severity:
				issue.severity === 'critical'
					? 'critical'
					: issue.severity === 'warn'
						? 'warn'
						: 'info',
			source: `monitor:${issue.monitorId}`,
			value: issue.value
		});
	}
};

const pushOperationsRecordEvents = (
	events: VoiceIncidentTimelineEvent[],
	records: readonly VoiceOperationsRecord[] | undefined,
	links: VoiceIncidentTimelineLinks
) => {
	if (!records) {
		return;
	}

	for (const record of records) {
		if (record.status === 'healthy') {
			continue;
		}

		const href = linkForSession(links.operationsRecords, record.sessionId);
		const debuggerHref = linkForSession(links.callDebugger, record.sessionId);
		events.push({
			action: {
				href: debuggerHref ?? href,
				label: debuggerHref ? 'Open call debugger' : 'Open operations record'
			},
			at: record.checkedAt,
			category: 'call',
			detail:
				record.status === 'failed'
					? 'Call operations record failed.'
					: 'Call operations record has warnings.',
			href,
			id: `operations-record:${record.sessionId}`,
			label: `Operations record ${record.status}`,
			sessionId: record.sessionId,
			severity: statusToSeverity(record.status),
			source: 'operations-record',
			value: record.outcome.complete ? 'complete' : 'incomplete'
		});
	}
};

const pushFailureReplayEvents = (
	events: VoiceIncidentTimelineEvent[],
	replays: readonly VoiceFailureReplayReport[] | undefined,
	links: VoiceIncidentTimelineLinks
) => {
	if (!replays) {
		return;
	}

	for (const replay of replays) {
		if (replay.status === 'healthy') {
			continue;
		}

		const href =
			replay.operationsRecordHref ??
			linkForSession(links.failureReplay, replay.sessionId) ??
			linkForSession(links.callDebugger, replay.sessionId);
		events.push({
			action: {
				href:
					linkForSession(links.callDebugger, replay.sessionId) ??
					href ??
					linkForSession(links.supportBundle, replay.sessionId),
				label: 'Open replay/debug artifact'
			},
			at:
				replay.providers.steps[0]?.at ??
				replay.media.steps[0]?.at ??
				Date.now(),
			category: 'failure-replay',
			detail:
				replay.summary.issues.join('; ') ||
				replay.summary.userHeard.join(' ') ||
				`Failure replay is ${replay.status}.`,
			href,
			id: `failure-replay:${replay.sessionId}`,
			label: `Failure replay ${replay.status}`,
			sessionId: replay.sessionId,
			severity: failureReplayStatusToSeverity(replay.status),
			source: 'failure-replay',
			value: `${replay.providers.errors} provider errors / ${replay.media.errors} media errors`
		});
	}
};

export const buildVoiceIncidentTimelineReport = async (
	options: VoiceIncidentTimelineOptions
): Promise<VoiceIncidentTimelineReport> => {
	const now = options.now ?? Date.now();
	const links = options.links ?? {};
	const [
		operationalStatus,
		opsRecovery,
		monitorIssues,
		operationsRecords,
		failureReplays
	] = await Promise.all([
		resolveValue(options.operationalStatus),
		resolveValue(options.opsRecovery),
		resolveValue(options.monitorIssues),
		resolveValue(options.operationsRecords),
		resolveValue(options.failureReplays)
	]);
	const events: VoiceIncidentTimelineEvent[] = [];

	pushOperationalStatusEvents(events, operationalStatus, links);
	pushOpsRecoveryEvents(events, opsRecovery, links);
	pushMonitorEvents(events, monitorIssues, links);
	pushOperationsRecordEvents(events, operationsRecords, links);
	pushFailureReplayEvents(events, failureReplays, links);

	const filtered = events
		.filter((event) => withinWindow(event, now, options.windowMs))
		.sort((left, right) => right.at - left.at)
		.slice(0, options.limit ?? 50);
	const summary = {
		critical: filtered.filter((event) => event.severity === 'critical').length,
		info: filtered.filter((event) => event.severity === 'info').length,
		total: filtered.length,
		warn: filtered.filter((event) => event.severity === 'warn').length
	};

	return {
		events: filtered,
		generatedAt: now,
		links,
		status: worstStatus(filtered.map(eventStatus)),
		summary,
		windowMs: options.windowMs
	};
};

export const renderVoiceIncidentTimelineMarkdown = (
	report: VoiceIncidentTimelineReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Incident Timeline';
	const rows = report.events
		.map((event) => {
			const when = new Date(event.at).toISOString();
			const target = event.href ? ` [open](${event.href})` : '';
			const session = event.sessionId ? ` session=${event.sessionId}` : '';
			const value = event.value === undefined ? '' : ` value=${event.value}`;

			return `- ${when} ${event.severity.toUpperCase()} ${event.label}${session}${value}${target}${event.detail ? ` - ${event.detail}` : ''}`;
		})
		.join('\n');

	return `# ${title}

Status: ${report.status}

Generated: ${new Date(report.generatedAt).toISOString()}

Summary: ${report.summary.critical} critical, ${report.summary.warn} warn, ${report.summary.info} info, ${report.summary.total} total.

## Events

${rows || '- No incident timeline events.'}
`;
};

export const renderVoiceIncidentTimelineHTML = (
	report: VoiceIncidentTimelineReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Incident Timeline';
	const events = report.events
		.map(
			(event) => `<article class="${escapeHtml(event.severity)}">
  <span>${escapeHtml(event.severity.toUpperCase())} / ${escapeHtml(event.category)}</span>
  <h2>${escapeHtml(event.label)}</h2>
  <p>${escapeHtml(new Date(event.at).toLocaleString())}${event.sessionId ? ` · session ${escapeHtml(event.sessionId)}` : ''}</p>
  ${event.value === undefined ? '' : `<strong>${escapeHtml(String(event.value))}</strong>`}
  ${event.detail ? `<p>${escapeHtml(event.detail)}</p>` : ''}
  <div>${event.href ? `<a href="${escapeHtml(event.href)}">Open source</a>` : ''}${event.action?.href ? `<a href="${escapeHtml(event.action.href)}">${escapeHtml(event.action.label)}</a>` : ''}</div>
</article>`
		)
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#11110d;color:#faf4df;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1100px;padding:32px}.hero{background:linear-gradient(135deg,rgba(248,113,113,.2),rgba(245,158,11,.13),rgba(34,197,94,.12));border:1px solid #39301d;border-radius:30px;margin-bottom:18px;padding:28px}.eyebrow{color:#fcd34d;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}.status{border:1px solid #575030;border-radius:999px;display:inline-flex;font-weight:900;padding:8px 12px}.status.pass{border-color:rgba(34,197,94,.65)}.status.warn{border-color:rgba(245,158,11,.75)}.status.fail{border-color:rgba(239,68,68,.85)}.grid{display:grid;gap:14px}.summary{display:flex;flex-wrap:wrap;gap:10px}.summary span{background:#181711;border:1px solid #39301d;border-radius:999px;padding:8px 12px}article{background:#181711;border:1px solid #39301d;border-radius:22px;padding:18px}article.critical{border-color:rgba(239,68,68,.85)}article.warn{border-color:rgba(245,158,11,.75)}article.info{border-color:rgba(34,197,94,.55)}article span{color:#fcd34d;font-size:.78rem;font-weight:900;letter-spacing:.08em}article h2{margin:.35rem 0}.muted,article p{color:#cfc5a8}article strong{display:block;font-size:1.3rem;margin:.5rem 0}a{color:#fde68a;margin-right:12px}</style></head><body><main><section class="hero"><p class="eyebrow">Operational triage</p><h1>${escapeHtml(title)}</h1><p class="status ${escapeHtml(report.status)}">Overall: ${escapeHtml(report.status.toUpperCase())}</p><p class="muted">Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())}</p><div class="summary"><span>${String(report.summary.critical)} critical</span><span>${String(report.summary.warn)} warn</span><span>${String(report.summary.info)} info</span><span>${String(report.summary.total)} total</span></div></section><section class="grid">${events || '<article class="info"><span>INFO</span><h2>No incident events</h2><p>No non-pass operational events were found in this window.</p></article>'}</section></main></body></html>`;
};

export const createVoiceIncidentTimelineRoutes = (
	options: VoiceIncidentTimelineRoutesOptions
) => {
	const path = options.path ?? '/api/voice/incident-timeline';
	const htmlPath =
		options.htmlPath === undefined ? '/voice/incident-timeline' : options.htmlPath;
	const markdownPath =
		options.markdownPath === undefined
			? '/voice/incident-timeline.md'
			: options.markdownPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-incident-timeline'
	}).get(path, async () => {
		const report = await buildVoiceIncidentTimelineReport(options);

		return new Response(JSON.stringify(report), {
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				...options.headers
			},
			status: report.status === 'fail' ? 503 : 200
		});
	});

	if (htmlPath !== false) {
		routes.get(htmlPath, async () => {
			const report = await buildVoiceIncidentTimelineReport(options);
			const body = await (options.render ?? ((input) =>
				renderVoiceIncidentTimelineHTML(input, { title: options.title })))(report);

			return new Response(body, {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		});
	}

	if (markdownPath !== false) {
		routes.get(markdownPath, async () => {
			const report = await buildVoiceIncidentTimelineReport(options);

			return new Response(
				renderVoiceIncidentTimelineMarkdown(report, {
					title: options.title
				}),
				{
					headers: {
						'Content-Type': 'text/markdown; charset=utf-8',
						...options.headers
					}
				}
			);
		});
	}

	return routes;
};
