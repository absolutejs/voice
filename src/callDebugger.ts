import { Elysia } from 'elysia';
import {
	buildVoiceFailureReplay,
	buildVoiceOperationsRecord,
	renderVoiceOperationsRecordIncidentMarkdown,
	type VoiceFailureReplayReport,
	type VoiceOperationsRecord,
	type VoiceOperationsRecordOptions
} from './operationsRecord';
import {
	buildVoiceSessionSnapshot,
	parseVoiceSessionSnapshot,
	type VoiceSessionSnapshot,
	type VoiceSessionSnapshotInput,
	type VoiceSessionSnapshotRouteSource
} from './sessionSnapshot';

export type VoiceCallDebuggerReport = {
	checkedAt: number;
	failureReplay: VoiceFailureReplayReport;
	incidentMarkdown: string;
	operationsRecord: VoiceOperationsRecord;
	sessionId: string;
	snapshot: VoiceSessionSnapshot;
	status: 'failed' | 'healthy' | 'warning';
};

export type VoiceCallDebuggerRoutesOptions = Omit<
	VoiceOperationsRecordOptions,
	'sessionId'
> & {
	headers?: HeadersInit;
	htmlPath?: false | string;
	incidentPath?: false | string;
	name?: string;
	operationsRecordHref?:
		| string
		| ((input: { sessionId: string }) => string | undefined);
	path?: string;
	render?: (report: VoiceCallDebuggerReport) => string | Promise<string>;
	snapshot?: VoiceSessionSnapshotRouteSource;
	title?: string;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const resolveSessionId = (params: Record<string, unknown>) => {
	const sessionId = params.sessionId;
	return typeof sessionId === 'string' ? sessionId : '';
};

const resolveOperationsRecordHref = (
	href: VoiceCallDebuggerRoutesOptions['operationsRecordHref'],
	sessionId: string
) => {
	if (typeof href === 'function') {
		return href({ sessionId });
	}
	return href?.replaceAll(':sessionId', encodeURIComponent(sessionId));
};

const isVoiceSessionSnapshot = (
	value: VoiceSessionSnapshot | VoiceSessionSnapshotInput
): value is VoiceSessionSnapshot =>
	(value as VoiceSessionSnapshot).schema === 'absolute.voice.session.snapshot.v1';

const resolveSnapshot = async (
	options: VoiceCallDebuggerRoutesOptions,
	input: { request: Request; sessionId: string }
): Promise<VoiceSessionSnapshot> => {
	const source =
		typeof options.snapshot === 'function'
			? await options.snapshot(input)
			: (options.snapshot ?? {
					sessionId: input.sessionId
				});

	if (isVoiceSessionSnapshot(source)) {
		return parseVoiceSessionSnapshot(source);
	}

	return buildVoiceSessionSnapshot({
		...source,
		sessionId: source.sessionId ?? input.sessionId
	});
};

export const buildVoiceCallDebuggerReport = async (
	options: VoiceCallDebuggerRoutesOptions,
	input: { request: Request; sessionId: string }
): Promise<VoiceCallDebuggerReport> => {
	const [operationsRecord, snapshot] = await Promise.all([
		buildVoiceOperationsRecord({
			audit: options.audit,
			evaluation: options.evaluation,
			events: options.events,
			integrationEvents: options.integrationEvents,
			redact: options.redact,
			reviews: options.reviews,
			sessionId: input.sessionId,
			store: options.store,
			tasks: options.tasks
		}),
		resolveSnapshot(options, input)
	]);
	const failureReplay = buildVoiceFailureReplay(operationsRecord, {
		operationsRecordHref: resolveOperationsRecordHref(
			options.operationsRecordHref,
			input.sessionId
		)
	});
	const statuses = [
		operationsRecord.status,
		failureReplay.status === 'failed'
			? 'failed'
			: failureReplay.status === 'degraded'
				? 'warning'
				: 'healthy',
		snapshot.status === 'fail'
			? 'failed'
			: snapshot.status === 'warn'
				? 'warning'
				: 'healthy'
	];
	const status = statuses.includes('failed')
		? 'failed'
		: statuses.includes('warning')
			? 'warning'
			: 'healthy';

	return {
		checkedAt: Date.now(),
		failureReplay,
		incidentMarkdown: renderVoiceOperationsRecordIncidentMarkdown(operationsRecord),
		operationsRecord,
		sessionId: input.sessionId,
		snapshot,
		status
	};
};

const renderMetric = (label: string, value: string | number) =>
	`<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;

const renderArtifact = (artifact: VoiceSessionSnapshot['artifacts'][number]) => {
	const body = `<strong>${escapeHtml(artifact.label)}</strong><span>${escapeHtml(artifact.status ?? 'n/a')}</span>`;
	return artifact.href
		? `<a href="${escapeHtml(artifact.href)}">${body}</a>`
		: `<div>${body}</div>`;
};

export const renderVoiceCallDebuggerHTML = (
	report: VoiceCallDebuggerReport,
	options: Pick<VoiceCallDebuggerRoutesOptions, 'title'> = {}
) => {
	const title = options.title ?? 'Voice Call Debugger';
	const transcript = report.operationsRecord.transcript.length
		? report.operationsRecord.transcript
				.map(
					(turn) =>
						`<li><strong>${escapeHtml(turn.id)}</strong><p>${escapeHtml(turn.committedText ?? turn.transcripts.at(-1) ?? 'No transcript text.')}</p><p>${escapeHtml(turn.assistantReplies.at(-1) ?? 'No assistant reply recorded.')}</p></li>`
				)
				.join('')
		: '<li>No transcript turns recorded.</li>';
	const providerDecisions = report.operationsRecord.providerDecisions.length
		? report.operationsRecord.providerDecisions
				.slice(0, 12)
				.map(
					(decision) =>
						`<li><strong>${escapeHtml(decision.provider ?? decision.selectedProvider ?? 'provider')}</strong><p>${escapeHtml(decision.status ?? 'unknown')} ${decision.fallbackProvider ? `via ${escapeHtml(decision.fallbackProvider)}` : ''}</p><p>${escapeHtml(decision.reason ?? 'No reason recorded.')}</p></li>`
				)
				.join('')
		: '<li>No provider decisions recorded.</li>';
	const failureIssues = report.failureReplay.summary.issues.length
		? report.failureReplay.summary.issues
				.map((issue) => `<li>${escapeHtml(issue)}</li>`)
				.join('')
		: '<li>No failure or recovery issues recorded.</li>';
	const heard = report.failureReplay.summary.userHeard.length
		? report.failureReplay.summary.userHeard
				.map((text) => `<li>${escapeHtml(text)}</li>`)
				.join('')
		: '<li>No assistant output recorded.</li>';
	const artifacts = report.snapshot.artifacts.length
		? report.snapshot.artifacts.map(renderArtifact).join('')
		: '<div><strong>No linked artifacts</strong><span>empty</span></div>';
	const incidentPath = `/voice-call-debugger/${encodeURIComponent(report.sessionId)}/incident.md`;

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0d1216;color:#f8f4e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}.eyebrow{color:#5eead4;font-size:.78rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}h1{font-size:clamp(2.4rem,7vw,5rem);line-height:.9;margin:.2rem 0 1rem}.status{border:1px solid #475569;border-radius:999px;display:inline-flex;padding:8px 12px}.healthy,.pass{color:#86efac}.warning,.warn,.degraded{color:#fbbf24}.failed,.fail{color:#fca5a5}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));margin:20px 0}.card,section{background:#161f26;border:1px solid #2b3943;border-radius:20px;padding:16px}.card span,.muted{color:#a9b5bd}.card strong{display:block;font-size:1.8rem;margin-top:4px}section{margin-top:18px}.two{display:grid;gap:18px;grid-template-columns:1fr 1fr}ul{display:grid;gap:10px;list-style:none;padding:0}li{background:#0f171d;border:1px solid #2b3943;border-radius:14px;padding:12px}.actions,.artifacts{display:flex;flex-wrap:wrap;gap:10px}.actions a,.artifacts a,.artifacts div{background:#5eead4;border-radius:999px;color:#061014;font-weight:900;padding:10px 14px;text-decoration:none}.artifacts a,.artifacts div{align-items:center;background:#111a20;border:1px solid #2b3943;color:#f8f4e8;display:flex;gap:10px;justify-content:space-between}.artifacts span{color:#5eead4;text-transform:uppercase}pre{background:#090e12;border:1px solid #2b3943;border-radius:16px;color:#dbeafe;overflow:auto;padding:14px}@media(max-width:860px){main{padding:20px}.two{grid-template-columns:1fr}}</style></head><body><main><p class="eyebrow">One-call support artifact</p><h1>${escapeHtml(title)}</h1><p class="status ${escapeHtml(report.status)}">${escapeHtml(report.status)}</p><p class="muted">Session <code>${escapeHtml(report.sessionId)}</code>. Checked ${escapeHtml(new Date(report.checkedAt).toLocaleString())}.</p><div class="actions"><a href="/api/voice-call-debugger/${encodeURIComponent(report.sessionId)}">JSON</a><a href="${escapeHtml(incidentPath)}">Incident markdown</a>${report.failureReplay.operationsRecordHref ? `<a href="${escapeHtml(report.failureReplay.operationsRecordHref)}">Operations record</a>` : ''}</div><section class="grid">${renderMetric('Snapshot', report.snapshot.status)}${renderMetric('Events', report.operationsRecord.summary.eventCount)}${renderMetric('Turns', report.operationsRecord.summary.turnCount)}${renderMetric('Errors', report.operationsRecord.summary.errorCount)}${renderMetric('Provider recovery', report.operationsRecord.providerDecisionSummary.recoveryStatus)}${renderMetric('Fallbacks', report.operationsRecord.providerDecisionSummary.fallbacks)}${renderMetric('Media warnings', report.snapshot.media.filter((media) => media.report.status !== 'pass').length)}${renderMetric('Telephony media', report.operationsRecord.telephonyMedia.total)}</section><section><h2>Linked Debug Artifacts</h2><div class="artifacts">${artifacts}</div></section><section class="two"><div><h2>Provider Decisions</h2><ul>${providerDecisions}</ul></div><div><h2>Failure Replay</h2><ul>${failureIssues}</ul><h3>User Heard</h3><ul>${heard}</ul></div></section><section><h2>Transcript</h2><ul>${transcript}</ul></section><section><h2>Copyable Incident Handoff</h2><pre><code>${escapeHtml(report.incidentMarkdown)}</code></pre></section></main></body></html>`;
};

export const createVoiceCallDebuggerRoutes = (
	options: VoiceCallDebuggerRoutesOptions
) => {
	const path = options.path ?? '/api/voice-call-debugger/:sessionId';
	const htmlPath =
		options.htmlPath === undefined
			? '/voice-call-debugger/:sessionId'
			: options.htmlPath;
	const incidentPath =
		options.incidentPath === undefined
			? '/voice-call-debugger/:sessionId/incident.md'
			: options.incidentPath;
	const app = new Elysia({
		name: options.name ?? 'absolutejs-voice-call-debugger'
	});
	const build = (request: Request, sessionId: string) =>
		buildVoiceCallDebuggerReport(options, { request, sessionId });

	app.get(path, async ({ params, request }) =>
		Response.json(await build(request, resolveSessionId(params)), {
			headers: options.headers
		})
	);

	if (htmlPath) {
		app.get(htmlPath, async ({ params, request }) => {
			const report = await build(request, resolveSessionId(params));
			const html = await (options.render?.(report) ??
				renderVoiceCallDebuggerHTML(report, { title: options.title }));
			return new Response(html, {
				headers: {
					'content-type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		});
	}

	if (incidentPath) {
		app.get(incidentPath, async ({ params, request }) => {
			const report = await build(request, resolveSessionId(params));
			return new Response(report.incidentMarkdown, {
				headers: {
					'content-type': 'text/markdown; charset=utf-8',
					...options.headers
				}
			});
		});
	}

	return app;
};
