import { Elysia } from 'elysia';

export type VoiceMonitorStatus = 'fail' | 'pass' | 'warn';
export type VoiceMonitorSeverity = 'critical' | 'info' | 'warn';
export type VoiceMonitorIssueStatus =
	| 'acknowledged'
	| 'muted'
	| 'open'
	| 'resolved';

export type VoiceMonitorEvaluationInput<TEvidence = unknown> = {
	evidence: TEvidence;
	now: number;
};

export type VoiceMonitorEvaluation = {
	detail?: string;
	impactedSessions?: readonly string[];
	operationsRecordHrefs?: readonly string[];
	status: VoiceMonitorStatus;
	threshold?: number | string;
	value?: number | string;
};

export type VoiceMonitorDefinition<TEvidence = unknown> = {
	description?: string;
	id: string;
	label: string;
	severity?: VoiceMonitorSeverity;
	windowMs?: number;
	evaluate: (
		input: VoiceMonitorEvaluationInput<TEvidence>
	) => Promise<VoiceMonitorEvaluation> | VoiceMonitorEvaluation;
};

export type VoiceMonitorRun = VoiceMonitorEvaluation & {
	checkedAt: number;
	description?: string;
	id: string;
	label: string;
	severity: VoiceMonitorSeverity;
	windowMs?: number;
};

export type VoiceMonitorIssue = {
	acknowledgedAt?: number;
	acknowledgedBy?: string;
	createdAt: number;
	detail?: string;
	id: string;
	impactedSessions: string[];
	label: string;
	lastSeenAt: number;
	monitorId: string;
	mutedAt?: number;
	mutedBy?: string;
	operationsRecordHrefs: string[];
	resolvedAt?: number;
	resolvedBy?: string;
	severity: VoiceMonitorSeverity;
	status: VoiceMonitorIssueStatus;
	threshold?: number | string;
	value?: number | string;
};

export type VoiceMonitorIssueStore = {
	list: () => Promise<VoiceMonitorIssue[]> | VoiceMonitorIssue[];
	upsert: (
		issue: VoiceMonitorIssue
	) => Promise<VoiceMonitorIssue> | VoiceMonitorIssue;
	update: (
		id: string,
		patch: Partial<VoiceMonitorIssue>
	) => Promise<VoiceMonitorIssue | undefined> | VoiceMonitorIssue | undefined;
};

export type VoiceMonitorNotifier = {
	deliver: (
		input: VoiceMonitorNotifierDeliveryInput
	) => Promise<VoiceMonitorNotifierDeliveryResult> | VoiceMonitorNotifierDeliveryResult;
	id: string;
	label: string;
};

export type VoiceMonitorNotifierDeliveryInput = {
	issue: VoiceMonitorIssue;
	now: number;
};

export type VoiceMonitorNotifierDeliveryResult = {
	detail?: string;
	status: 'failed' | 'sent' | 'skipped';
};

export type VoiceMonitorNotifierDeliveryReceipt = {
	detail?: string;
	id: string;
	issueId: string;
	notifierId: string;
	notifierLabel: string;
	sentAt: number;
	status: 'failed' | 'sent' | 'skipped';
};

export type VoiceMonitorNotifierDeliveryReceiptStore = {
	list: () =>
		| Promise<VoiceMonitorNotifierDeliveryReceipt[]>
		| VoiceMonitorNotifierDeliveryReceipt[];
	set: (
		id: string,
		receipt: VoiceMonitorNotifierDeliveryReceipt
	) =>
		| Promise<VoiceMonitorNotifierDeliveryReceipt>
		| VoiceMonitorNotifierDeliveryReceipt;
};

export type VoiceMonitorNotifierDeliveryReport = {
	checkedAt: number;
	elapsedMs: number;
	receipts: VoiceMonitorNotifierDeliveryReceipt[];
	status: VoiceMonitorStatus;
	summary: {
		failed: number;
		notifiers: number;
		sent: number;
		skipped: number;
		total: number;
	};
};

export type VoiceMonitorRunReport = {
	checkedAt: number;
	elapsedMs: number;
	issues: VoiceMonitorIssue[];
	runs: VoiceMonitorRun[];
	status: VoiceMonitorStatus;
	summary: {
		acknowledged: number;
		criticalOpen: number;
		failed: number;
		muted: number;
		open: number;
		passed: number;
		resolved: number;
		total: number;
		warned: number;
	};
};

export type VoiceMonitorRunOptions<TEvidence = unknown> = {
	evidence: TEvidence;
	issueStore?: VoiceMonitorIssueStore;
	monitors: readonly VoiceMonitorDefinition<TEvidence>[];
	now?: number;
};

export type VoiceMonitorNotifierDeliveryOptions = {
	issueStore: VoiceMonitorIssueStore;
	notifiers: readonly VoiceMonitorNotifier[];
	now?: number;
	receiptStore?: VoiceMonitorNotifierDeliveryReceiptStore;
	statuses?: readonly VoiceMonitorIssueStatus[];
};

export type VoiceMonitorWebhookNotifierOptions = {
	fetch?: typeof fetch;
	headers?: HeadersInit;
	id: string;
	label?: string;
	mapIssue?: (issue: VoiceMonitorIssue) => unknown;
	url: string;
};

export type VoiceMonitorRoutesOptions<TEvidence = unknown> =
	VoiceMonitorRunOptions<TEvidence> & {
		headers?: HeadersInit;
		htmlPath?: false | string;
		issuePath?: string;
		name?: string;
		notifierPath?: false | string;
		notifiers?: readonly VoiceMonitorNotifier[];
		path?: string;
		receiptStore?: VoiceMonitorNotifierDeliveryReceiptStore;
		render?: (
			report: VoiceMonitorRunReport
		) => Promise<string> | string;
		title?: string;
	};

export type VoiceMonitorRunnerTickResult = {
	completedAt: number;
	monitoring: VoiceMonitorRunReport;
	notifierDelivery?: VoiceMonitorNotifierDeliveryReport;
	startedAt: number;
};

export type VoiceMonitorRunner = {
	isRunning: () => boolean;
	start: () => void;
	stop: () => void;
	tick: () => Promise<VoiceMonitorRunnerTickResult>;
};

export type VoiceMonitorRunnerOptions<TEvidence = unknown> = {
	evidence?: TEvidence;
	issueStore?: VoiceMonitorIssueStore;
	loadEvidence?: () => Promise<TEvidence> | TEvidence;
	monitors: readonly VoiceMonitorDefinition<TEvidence>[];
	notifiers?: readonly VoiceMonitorNotifier[];
	now?: () => number;
	pollIntervalMs?: number;
	receiptStore?: VoiceMonitorNotifierDeliveryReceiptStore;
};

export type VoiceMonitorRunnerRoutesOptions = {
	headers?: HeadersInit;
	name?: string;
	path?: string;
	runner: VoiceMonitorRunner;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const issueIdForRun = (run: VoiceMonitorRun) =>
	`voice-monitor:${run.id}:${run.impactedSessions?.[0] ?? 'global'}`;

const rollupStatus = (runs: VoiceMonitorRun[]): VoiceMonitorStatus =>
	runs.some((run) => run.status === 'fail')
		? 'fail'
		: runs.some((run) => run.status === 'warn')
			? 'warn'
			: 'pass';

export const createVoiceMemoryMonitorIssueStore = (
	initial: readonly VoiceMonitorIssue[] = []
): VoiceMonitorIssueStore => {
	const issues = new Map(initial.map((issue) => [issue.id, { ...issue }]));

	return {
		list: () => Array.from(issues.values()).map((issue) => ({ ...issue })),
		upsert: (issue) => {
			const previous = issues.get(issue.id);
			const next = previous
				? {
						...previous,
						...issue,
						createdAt: previous.createdAt,
						status:
							previous.status === 'resolved' || previous.status === 'muted'
								? previous.status
								: issue.status
					}
				: issue;
			issues.set(issue.id, { ...next });
			return { ...next };
		},
		update: (id, patch) => {
			const previous = issues.get(id);
			if (!previous) {
				return undefined;
			}
			const next = { ...previous, ...patch };
			issues.set(id, next);
			return { ...next };
		}
	};
};

export const createVoiceMemoryMonitorNotifierDeliveryReceiptStore = (
	initial: readonly VoiceMonitorNotifierDeliveryReceipt[] = []
): VoiceMonitorNotifierDeliveryReceiptStore => {
	const receipts = new Map(initial.map((receipt) => [receipt.id, { ...receipt }]));

	return {
		list: () => Array.from(receipts.values()).map((receipt) => ({ ...receipt })),
		set: (id, receipt) => {
			receipts.set(id, { ...receipt });
			return { ...receipt };
		}
	};
};

export const buildVoiceMonitorRunReport = async <TEvidence = unknown>(
	options: VoiceMonitorRunOptions<TEvidence>
): Promise<VoiceMonitorRunReport> => {
	const startedAt = Date.now();
	const checkedAt = options.now ?? startedAt;
	const runs = await Promise.all(
		options.monitors.map(async (monitor): Promise<VoiceMonitorRun> => {
			const evaluation = await monitor.evaluate({
				evidence: options.evidence,
				now: checkedAt
			});
			return {
				...evaluation,
				checkedAt,
				description: monitor.description,
				id: monitor.id,
				label: monitor.label,
				severity: monitor.severity ?? 'warn',
				windowMs: monitor.windowMs
			};
		})
	);

	for (const run of runs) {
		if (run.status === 'pass') {
			continue;
		}
		await options.issueStore?.upsert({
			createdAt: checkedAt,
			detail: run.detail,
			id: issueIdForRun(run),
			impactedSessions: [...(run.impactedSessions ?? [])],
			label: run.label,
			lastSeenAt: checkedAt,
			monitorId: run.id,
			operationsRecordHrefs: [...(run.operationsRecordHrefs ?? [])],
			severity: run.status === 'fail' ? run.severity : 'warn',
			status: 'open',
			threshold: run.threshold,
			value: run.value
		});
	}

	const issues = (await options.issueStore?.list()) ?? [];
	const openIssues = issues.filter((issue) => issue.status === 'open');
	const criticalOpen = openIssues.filter(
		(issue) => issue.severity === 'critical'
	).length;

	return {
		checkedAt,
		elapsedMs: Math.max(0, Date.now() - startedAt),
		issues,
		runs,
		status:
			criticalOpen > 0
				? 'fail'
				: openIssues.length > 0 || rollupStatus(runs) === 'warn'
					? 'warn'
					: rollupStatus(runs),
		summary: {
			acknowledged: issues.filter((issue) => issue.status === 'acknowledged')
				.length,
			criticalOpen,
			failed: runs.filter((run) => run.status === 'fail').length,
			muted: issues.filter((issue) => issue.status === 'muted').length,
			open: openIssues.length,
			passed: runs.filter((run) => run.status === 'pass').length,
			resolved: issues.filter((issue) => issue.status === 'resolved').length,
			total: runs.length,
			warned: runs.filter((run) => run.status === 'warn').length
		}
	};
};

export const acknowledgeVoiceMonitorIssue = async (
	store: VoiceMonitorIssueStore,
	id: string,
	input: { actorId?: string; now?: number } = {}
) =>
	store.update(id, {
		acknowledgedAt: input.now ?? Date.now(),
		acknowledgedBy: input.actorId,
		status: 'acknowledged'
	});

export const resolveVoiceMonitorIssue = async (
	store: VoiceMonitorIssueStore,
	id: string,
	input: { actorId?: string; now?: number } = {}
) =>
	store.update(id, {
		resolvedAt: input.now ?? Date.now(),
		resolvedBy: input.actorId,
		status: 'resolved'
	});

export const muteVoiceMonitorIssue = async (
	store: VoiceMonitorIssueStore,
	id: string,
	input: { actorId?: string; now?: number } = {}
) =>
	store.update(id, {
		mutedAt: input.now ?? Date.now(),
		mutedBy: input.actorId,
		status: 'muted'
	});

export const createVoiceMonitorWebhookNotifier = (
	options: VoiceMonitorWebhookNotifierOptions
): VoiceMonitorNotifier => ({
	id: options.id,
	label: options.label ?? options.id,
	deliver: async ({ issue }) => {
		const response = await (options.fetch ?? fetch)(options.url, {
			body: JSON.stringify(
				options.mapIssue?.(issue) ?? {
					detail: issue.detail,
					impactedSessions: issue.impactedSessions,
					issueId: issue.id,
					label: issue.label,
					monitorId: issue.monitorId,
					operationsRecordHrefs: issue.operationsRecordHrefs,
					severity: issue.severity,
					status: issue.status,
					value: issue.value
				}
			),
			headers: {
				'content-type': 'application/json',
				...options.headers
			},
			method: 'POST'
		});

		return {
			detail: `HTTP ${response.status}`,
			status: response.ok ? 'sent' : 'failed'
		};
	}
});

export const deliverVoiceMonitorIssueNotifications = async (
	options: VoiceMonitorNotifierDeliveryOptions
): Promise<VoiceMonitorNotifierDeliveryReport> => {
	const startedAt = Date.now();
	const checkedAt = options.now ?? startedAt;
	const statuses = new Set(options.statuses ?? ['open']);
	const issues = (await options.issueStore.list()).filter((issue) =>
		statuses.has(issue.status)
	);
	const receipts: VoiceMonitorNotifierDeliveryReceipt[] = [];

	for (const issue of issues) {
		for (const notifier of options.notifiers) {
			const result = await notifier.deliver({ issue, now: checkedAt });
			const receipt = {
				detail: result.detail,
				id: `voice-monitor-notifier:${notifier.id}:${issue.id}:${checkedAt}`,
				issueId: issue.id,
				notifierId: notifier.id,
				notifierLabel: notifier.label,
				sentAt: checkedAt,
				status: result.status
			} satisfies VoiceMonitorNotifierDeliveryReceipt;
			receipts.push(receipt);
			await options.receiptStore?.set(receipt.id, receipt);
		}
	}

	const allReceipts = options.receiptStore
		? await options.receiptStore.list()
		: receipts;
	const failed = allReceipts.filter((receipt) => receipt.status === 'failed').length;
	const sent = allReceipts.filter((receipt) => receipt.status === 'sent').length;
	const skipped = allReceipts.filter(
		(receipt) => receipt.status === 'skipped'
	).length;

	return {
		checkedAt,
		elapsedMs: Math.max(0, Date.now() - startedAt),
		receipts: allReceipts,
		status: failed > 0 ? 'fail' : allReceipts.length === 0 ? 'warn' : 'pass',
		summary: {
			failed,
			notifiers: options.notifiers.length,
			sent,
			skipped,
			total: allReceipts.length
		}
	};
};

export const createVoiceMonitorRunner = <TEvidence = unknown>(
	options: VoiceMonitorRunnerOptions<TEvidence>
): VoiceMonitorRunner => {
	const issueStore = options.issueStore ?? createVoiceMemoryMonitorIssueStore();
	const receiptStore =
		options.receiptStore ??
		createVoiceMemoryMonitorNotifierDeliveryReceiptStore();
	const pollIntervalMs = options.pollIntervalMs ?? 60_000;
	let timer: ReturnType<typeof setInterval> | undefined;

	const loadEvidence = async () => {
		if (options.loadEvidence) {
			return options.loadEvidence();
		}
		if (options.evidence !== undefined) {
			return options.evidence;
		}
		throw new Error(
			'createVoiceMonitorRunner requires evidence or loadEvidence.'
		);
	};

	const tick = async () => {
		const startedAt = options.now?.() ?? Date.now();
		const monitoring = await buildVoiceMonitorRunReport({
			evidence: await loadEvidence(),
			issueStore,
			monitors: options.monitors,
			now: startedAt
		});
		const notifierDelivery = options.notifiers
			? await deliverVoiceMonitorIssueNotifications({
					issueStore,
					notifiers: options.notifiers,
					now: options.now?.() ?? Date.now(),
					receiptStore
				})
			: undefined;

		return {
			completedAt: options.now?.() ?? Date.now(),
			monitoring,
			notifierDelivery,
			startedAt
		};
	};

	return {
		isRunning: () => timer !== undefined,
		start: () => {
			if (timer) {
				return;
			}
			timer = setInterval(() => {
				void tick();
			}, pollIntervalMs);
		},
		stop: () => {
			if (!timer) {
				return;
			}
			clearInterval(timer);
			timer = undefined;
		},
		tick
	};
};

export const renderVoiceMonitorMarkdown = (report: VoiceMonitorRunReport) => {
	const rows = report.runs
		.map(
			(run) =>
				`| ${run.id} | ${run.status} | ${run.severity} | ${run.value ?? ''} | ${run.threshold ?? ''} | ${run.detail ?? ''} |`
		)
		.join('\n');
	return `# Voice Monitor Report

- Status: ${report.status}
- Checks: ${report.summary.passed}/${report.summary.total} passing
- Open issues: ${report.summary.open}
- Critical open issues: ${report.summary.criticalOpen}

| Monitor | Status | Severity | Value | Threshold | Detail |
| --- | --- | --- | --- | --- | --- |
${rows || '| none | pass | info | | | No monitors configured. |'}
`;
};

export const renderVoiceMonitorHTML = (
	report: VoiceMonitorRunReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'Voice Monitors';
	const runs = report.runs
		.map(
			(run) =>
				`<tr><td>${escapeHtml(run.label)}</td><td class="${escapeHtml(run.status)}">${escapeHtml(run.status)}</td><td>${escapeHtml(run.severity)}</td><td>${escapeHtml(String(run.value ?? ''))}</td><td>${escapeHtml(String(run.threshold ?? ''))}</td><td>${escapeHtml(run.detail ?? '')}</td></tr>`
		)
		.join('');
	const issues = report.issues
		.map(
			(issue) =>
				`<li><strong>${escapeHtml(issue.label)}</strong> <span class="${escapeHtml(issue.status)}">${escapeHtml(issue.status)}</span> ${escapeHtml(issue.detail ?? '')}</li>`
		)
		.join('');
	const snippet = escapeHtml(`app.use(createVoiceMonitorRoutes({
  evidence,
  issueStore,
  monitors: [defineVoiceMonitor(...)]
}));`);

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#10141b;color:#f8f2df;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1100px;padding:32px}.hero,.card{background:#171f2b;border:1px solid #2e3a4b;border-radius:24px;margin-bottom:16px;padding:22px}.eyebrow{color:#93c5fd;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.2rem,6vw,4.7rem);line-height:.92;margin:.2rem 0 1rem}.pill{border:1px solid #64748b;border-radius:999px;display:inline-flex;font-weight:900;margin-right:8px;padding:8px 12px}.pass{color:#86efac}.warn,.acknowledged{color:#fde68a}.fail,.open{color:#fca5a5}.resolved,.muted{color:#cbd5e1}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #2e3a4b;padding:12px;text-align:left;vertical-align:top}pre{background:#0c1118;border:1px solid #2e3a4b;border-radius:16px;color:#dbeafe;overflow:auto;padding:16px}</style></head><body><main><section class="hero"><p class="eyebrow">Code-owned monitoring</p><h1>${escapeHtml(title)}</h1><p class="pill ${escapeHtml(report.status)}">Status: ${escapeHtml(report.status)}</p><p class="pill">Open issues: ${String(report.summary.open)}</p><p class="pill">Critical: ${String(report.summary.criticalOpen)}</p></section><section class="card"><h2>Monitor Runs</h2><table><thead><tr><th>Monitor</th><th>Status</th><th>Severity</th><th>Value</th><th>Threshold</th><th>Detail</th></tr></thead><tbody>${runs}</tbody></table></section><section class="card"><h2>Issues</h2>${issues ? `<ul>${issues}</ul>` : '<p class="pass">No monitor issues.</p>'}</section><section class="card"><p class="eyebrow">Copy into your app</p><h2><code>createVoiceMonitorRoutes(...)</code></h2><pre><code>${snippet}</code></pre></section></main></body></html>`;
};

const actorFromRequest = async (request: Request) => {
	if (!request.headers.get('content-type')?.includes('application/json')) {
		return undefined;
	}
	const body = (await request.json().catch(() => undefined)) as
		| { actorId?: unknown }
		| undefined;
	return typeof body?.actorId === 'string' ? body.actorId : undefined;
};

export const createVoiceMonitorRoutes = <TEvidence = unknown>(
	options: VoiceMonitorRoutesOptions<TEvidence>
) => {
	const path = options.path ?? '/api/voice/monitors';
	const htmlPath = options.htmlPath === undefined ? '/voice/monitors' : options.htmlPath;
	const issuePath = options.issuePath ?? '/api/voice/monitor-issues';
	const notifierPath =
		options.notifierPath === undefined
			? '/api/voice/monitor-notifications'
			: options.notifierPath;
	const issueStore = options.issueStore ?? createVoiceMemoryMonitorIssueStore();
	const receiptStore =
		options.receiptStore ??
		createVoiceMemoryMonitorNotifierDeliveryReceiptStore();
	const report = () =>
		buildVoiceMonitorRunReport({
			evidence: options.evidence,
			issueStore,
			monitors: options.monitors,
			now: options.now
		});
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-monitoring'
	})
		.get(path, report)
		.get(`${path}.md`, async () => {
			return new Response(renderVoiceMonitorMarkdown(await report()), {
				headers: {
					'Content-Type': 'text/markdown; charset=utf-8',
					...options.headers
				}
			});
			})
			.get(issuePath, () => issueStore.list())
			.get(`${issuePath}/notifications`, () => receiptStore.list())
			.post(`${issuePath}/:id/acknowledge`, async ({ params, request }) => {
			const issue = await acknowledgeVoiceMonitorIssue(issueStore, params.id, {
				actorId: await actorFromRequest(request)
			});
			return issue ?? new Response('Issue not found', { status: 404 });
		})
		.post(`${issuePath}/:id/resolve`, async ({ params, request }) => {
			const issue = await resolveVoiceMonitorIssue(issueStore, params.id, {
				actorId: await actorFromRequest(request)
			});
			return issue ?? new Response('Issue not found', { status: 404 });
		})
		.post(`${issuePath}/:id/mute`, async ({ params, request }) => {
			const issue = await muteVoiceMonitorIssue(issueStore, params.id, {
				actorId: await actorFromRequest(request)
			});
				return issue ?? new Response('Issue not found', { status: 404 });
			});

	if (notifierPath !== false) {
		routes.post(notifierPath, () =>
			deliverVoiceMonitorIssueNotifications({
				issueStore,
				notifiers: options.notifiers ?? [],
				receiptStore
			})
		);
	}

	if (htmlPath !== false) {
		routes.get(htmlPath, async () => {
			const body = await (options.render ?? renderVoiceMonitorHTML)(
				await report(),
				{ title: options.title }
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

export const createVoiceMonitorRunnerRoutes = (
	options: VoiceMonitorRunnerRoutesOptions
) => {
	const path = options.path ?? '/api/voice/monitor-runner';
	return new Elysia({
		name: options.name ?? 'absolutejs-voice-monitor-runner'
	})
		.get(path, () => ({
			isRunning: options.runner.isRunning()
		}))
		.post(`${path}/tick`, async () => options.runner.tick())
		.post(`${path}/start`, () => {
			options.runner.start();
			return {
				isRunning: options.runner.isRunning()
			};
		})
		.post(`${path}/stop`, () => {
			options.runner.stop();
			return {
				isRunning: options.runner.isRunning()
			};
		});
};
