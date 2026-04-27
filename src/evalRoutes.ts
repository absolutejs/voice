import { Elysia } from 'elysia';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
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

export type VoiceEvalBaselineSummary = {
	failed: number;
	failedSessionIds: string[];
	passRate: number;
	passed: number;
	total: number;
};

export type VoiceEvalBaselineComparison = {
	baseline: VoiceEvalBaselineSummary;
	checkedAt: number;
	current: VoiceEvalBaselineSummary;
	deltas: {
		failed: number;
		passRate: number;
		passed: number;
		total: number;
	};
	newFailedSessionIds: string[];
	recoveredSessionIds: string[];
	reasons: string[];
	status: VoiceEvalStatus;
};

export type VoiceEvalBaselineComparisonOptions = {
	failOnNewFailedSessions?: boolean;
	maxFailedDelta?: number;
	maxPassRateDrop?: number;
};

export type VoiceEvalBaselineStore = {
	get: () => Promise<VoiceEvalReport | undefined>;
	set: (report: VoiceEvalReport) => Promise<void>;
};

export type VoiceScenarioEvalDefinition = {
	description?: string;
	forbiddenHandoffActions?: string[];
	forbiddenLifecycleTypes?: string[];
	id: string;
	label?: string;
	maxProviderErrors?: number;
	maxSessionErrors?: number;
	minSessions?: number;
	minTurns?: number;
	requiredAssistantIncludes?: string[];
	requiredDisposition?: string;
	requiredHandoffActions?: string[];
	requiredLifecycleTypes?: string[];
	requiredPayloadPaths?: string[];
	requiredTranscriptIncludes?: string[];
	scenarioId?: string;
};

export type VoiceScenarioEvalSessionResult = {
	eventCount: number;
	issues: string[];
	sessionId: string;
	status: VoiceEvalStatus;
};

export type VoiceScenarioEvalResult = {
	description?: string;
	failed: number;
	id: string;
	issues: string[];
	label: string;
	matchedSessions: number;
	passed: number;
	sessions: VoiceScenarioEvalSessionResult[];
	status: VoiceEvalStatus;
};

export type VoiceScenarioEvalReport = {
	checkedAt: number;
	failed: number;
	passed: number;
	scenarios: VoiceScenarioEvalResult[];
	status: VoiceEvalStatus;
	total: number;
};

export type VoiceEvalLink = {
	href: string;
	label: string;
};

export type VoiceEvalRoutesOptions = {
	baseline?: VoiceEvalReport | (() => Promise<VoiceEvalReport | undefined>);
	baselineComparison?: VoiceEvalBaselineComparisonOptions;
	baselineStore?: VoiceEvalBaselineStore;
	events?: StoredVoiceTraceEvent[];
	headers?: HeadersInit;
	links?: VoiceEvalLink[];
	limit?: number;
	name?: string;
	path?: string;
	scenarios?: VoiceScenarioEvalDefinition[];
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

const rate = (count: number, total: number) => count / Math.max(1, total);

const normalizeSearchText = (value: string) => value.trim().toLowerCase();

const getString = (value: unknown) =>
	typeof value === 'string' ? value : undefined;

const getObject = (value: unknown): Record<string, unknown> | undefined =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const getPathValue = (value: unknown, path: string): unknown => {
	let current = value;
	for (const part of path.split('.').filter(Boolean)) {
		const record = getObject(current);
		if (!record || !(part in record)) {
			return undefined;
		}
		current = record[part];
	}
	return current;
};

const includesAll = (haystack: string, needles: string[]) => {
	const normalized = normalizeSearchText(haystack);
	return needles.filter(
		(needle) => !normalized.includes(normalizeSearchText(needle))
	);
};

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

const getSessionText = (
	events: StoredVoiceTraceEvent[],
	type: StoredVoiceTraceEvent['type']
) =>
	events
		.filter((event) => event.type === type)
		.map((event) => getString(event.payload.text))
		.filter((text): text is string => Boolean(text?.trim()))
		.join('\n');

const countProviderErrors = (events: StoredVoiceTraceEvent[]) =>
	events.filter(
		(event) =>
			event.type === 'session.error' &&
			(event.payload.providerStatus === 'error' ||
				typeof event.payload.provider === 'string')
	).length;

const evaluateScenarioSession = (
	scenario: VoiceScenarioEvalDefinition,
	sessionId: string,
	events: StoredVoiceTraceEvent[]
): VoiceScenarioEvalSessionResult => {
	const issues: string[] = [];
	const committedText = getSessionText(events, 'turn.committed');
	const assistantText = getSessionText(events, 'turn.assistant');
	const lifecycleTypes = events
		.filter((event) => event.type === 'call.lifecycle')
		.map((event) => getString(event.payload.type))
		.filter((type): type is string => Boolean(type));
	const dispositions = events
		.filter((event) => event.type === 'call.lifecycle')
		.map((event) => getString(event.payload.disposition))
		.filter((disposition): disposition is string => Boolean(disposition));
	const handoffActions = events
		.filter((event) => event.type === 'call.handoff')
		.map((event) => getString(event.payload.action))
		.filter((action): action is string => Boolean(action));
	const turnCount = events.filter((event) => event.type === 'turn.committed').length;
	const sessionErrorCount = events.filter(
		(event) => event.type === 'session.error'
	).length;
	const providerErrorCount = countProviderErrors(events);

	for (const missing of includesAll(
		committedText,
		scenario.requiredTranscriptIncludes ?? []
	)) {
		issues.push(`Missing transcript text: ${missing}`);
	}
	for (const missing of includesAll(
		assistantText,
		scenario.requiredAssistantIncludes ?? []
	)) {
		issues.push(`Missing assistant text: ${missing}`);
	}
	for (const type of scenario.requiredLifecycleTypes ?? []) {
		if (!lifecycleTypes.includes(type)) {
			issues.push(`Missing lifecycle event: ${type}`);
		}
	}
	for (const type of scenario.forbiddenLifecycleTypes ?? []) {
		if (lifecycleTypes.includes(type)) {
			issues.push(`Forbidden lifecycle event occurred: ${type}`);
		}
	}
	for (const action of scenario.requiredHandoffActions ?? []) {
		if (!handoffActions.includes(action)) {
			issues.push(`Missing handoff action: ${action}`);
		}
	}
	for (const action of scenario.forbiddenHandoffActions ?? []) {
		if (handoffActions.includes(action)) {
			issues.push(`Forbidden handoff action occurred: ${action}`);
		}
	}
	if (
		scenario.requiredDisposition &&
		!dispositions.includes(scenario.requiredDisposition)
	) {
		issues.push(`Missing disposition: ${scenario.requiredDisposition}`);
	}
	if (scenario.minTurns !== undefined && turnCount < scenario.minTurns) {
		issues.push(`Expected at least ${scenario.minTurns} turn(s), saw ${turnCount}.`);
	}
	if (
		scenario.maxSessionErrors !== undefined &&
		sessionErrorCount > scenario.maxSessionErrors
	) {
		issues.push(
			`Expected at most ${scenario.maxSessionErrors} session error(s), saw ${sessionErrorCount}.`
		);
	}
	if (
		scenario.maxProviderErrors !== undefined &&
		providerErrorCount > scenario.maxProviderErrors
	) {
		issues.push(
			`Expected at most ${scenario.maxProviderErrors} provider error(s), saw ${providerErrorCount}.`
		);
	}
	for (const path of scenario.requiredPayloadPaths ?? []) {
		if (events.every((event) => getPathValue(event.payload, path) === undefined)) {
			issues.push(`Missing payload path: ${path}`);
		}
	}

	return {
		eventCount: events.length,
		issues,
		sessionId,
		status: issues.length > 0 ? 'fail' : 'pass'
	};
};

export const runVoiceScenarioEvals = async (
	options: {
		events?: StoredVoiceTraceEvent[];
		scenarios?: VoiceScenarioEvalDefinition[];
		store?: VoiceTraceEventStore;
	} = {}
): Promise<VoiceScenarioEvalReport> => {
	const scenarios = options.scenarios ?? [];
	const events = filterVoiceTraceEvents(
		options.events ?? (await options.store?.list()) ?? []
	);
	const grouped = new Map<string, StoredVoiceTraceEvent[]>();
	for (const event of events) {
		grouped.set(event.sessionId, [...(grouped.get(event.sessionId) ?? []), event]);
	}
	const results = scenarios.map((scenario) => {
		const sessions = [...grouped.entries()]
			.filter(([, sessionEvents]) =>
				scenario.scenarioId
					? sessionEvents.some((event) => event.scenarioId === scenario.scenarioId)
					: true
			)
			.map(([sessionId, sessionEvents]) =>
				evaluateScenarioSession(
					scenario,
					sessionId,
					filterVoiceTraceEvents(sessionEvents)
				)
			)
			.sort((left, right) => left.sessionId.localeCompare(right.sessionId));
		const issues: string[] = [];
		const minSessions = scenario.minSessions ?? 1;
		if (sessions.length < minSessions) {
			issues.push(
				`Expected at least ${minSessions} matching session(s), saw ${sessions.length}.`
			);
		}
		const failed = sessions.filter((session) => session.status === 'fail').length;
		const passed = sessions.length - failed;

		return {
			description: scenario.description,
			failed,
			id: scenario.id,
			issues,
			label: scenario.label ?? scenario.id,
			matchedSessions: sessions.length,
			passed,
			sessions,
			status: issues.length > 0 || failed > 0 ? 'fail' : 'pass'
		} satisfies VoiceScenarioEvalResult;
	});
	const failed = results.filter((scenario) => scenario.status === 'fail').length;
	const passed = results.length - failed;

	return {
		checkedAt: Date.now(),
		failed,
		passed,
		scenarios: results,
		status: failed > 0 ? 'fail' : 'pass',
		total: results.length
	};
};

const summarizeEvalBaseline = (
	report: VoiceEvalReport
): VoiceEvalBaselineSummary => {
	const failedSessionIds = report.sessions
		.filter((session) => session.status === 'fail')
		.map((session) => session.sessionId)
		.sort();

	return {
		failed: report.failed,
		failedSessionIds,
		passRate: rate(report.passed, report.total),
		passed: report.passed,
		total: report.total
	};
};

export const compareVoiceEvalBaseline = (
	currentReport: VoiceEvalReport,
	baselineReport: VoiceEvalReport,
	options: VoiceEvalBaselineComparisonOptions = {}
): VoiceEvalBaselineComparison => {
	const baseline = summarizeEvalBaseline(baselineReport);
	const current = summarizeEvalBaseline(currentReport);
	const maxFailedDelta = options.maxFailedDelta ?? 0;
	const maxPassRateDrop = options.maxPassRateDrop ?? 0;
	const failOnNewFailedSessions = options.failOnNewFailedSessions ?? true;
	const baselineFailed = new Set(baseline.failedSessionIds);
	const currentFailed = new Set(current.failedSessionIds);
	const newFailedSessionIds = current.failedSessionIds.filter(
		(sessionId) => !baselineFailed.has(sessionId)
	);
	const recoveredSessionIds = baseline.failedSessionIds.filter(
		(sessionId) => !currentFailed.has(sessionId)
	);
	const deltas = {
		failed: current.failed - baseline.failed,
		passRate: current.passRate - baseline.passRate,
		passed: current.passed - baseline.passed,
		total: current.total - baseline.total
	};
	const reasons: string[] = [];

	if (deltas.failed > maxFailedDelta) {
		reasons.push(
			`Failed sessions increased by ${deltas.failed}, above allowed delta ${maxFailedDelta}.`
		);
	}
	if (deltas.passRate < -maxPassRateDrop) {
		reasons.push(
			`Pass rate dropped by ${Math.abs(deltas.passRate).toFixed(4)}, above allowed drop ${maxPassRateDrop}.`
		);
	}
	if (failOnNewFailedSessions && newFailedSessionIds.length > 0) {
		reasons.push(
			`${newFailedSessionIds.length} session(s) failed that were not failing in the baseline.`
		);
	}

	return {
		baseline,
		checkedAt: Date.now(),
		current,
		deltas,
		newFailedSessionIds,
		recoveredSessionIds,
		reasons,
		status: reasons.length > 0 ? 'fail' : 'pass'
	};
};

export const createVoiceFileEvalBaselineStore = (
	filePath: string
): VoiceEvalBaselineStore => ({
	get: async () => {
		const file = Bun.file(filePath);
		if (!(await file.exists())) {
			return undefined;
		}
		const text = await file.text();
		return text.trim() ? (JSON.parse(text) as VoiceEvalReport) : undefined;
	},
	set: async (report) => {
		await mkdir(dirname(filePath), { recursive: true });
		await Bun.write(filePath, JSON.stringify(report, null, 2));
	}
});

const formatTime = (value: number | undefined) =>
	value === undefined ? 'unknown' : new Date(value).toLocaleString();

const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

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

export const renderVoiceEvalBaselineHTML = (
	comparison: VoiceEvalBaselineComparison,
	options: { links?: VoiceEvalLink[]; title?: string } = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Eval Baseline';
	const links = options.links?.length
		? `<nav>${options.links
				.map(
					(link) =>
						`<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`
				)
				.join('')}</nav>`
		: '';
	const reasons = comparison.reasons.length
		? comparison.reasons
				.map((reason) => `<li>${escapeHtml(reason)}</li>`)
				.join('')
		: '<li>No baseline regressions detected.</li>';
	const newFailures = comparison.newFailedSessionIds.length
		? comparison.newFailedSessionIds.map((id) => `<li>${escapeHtml(id)}</li>`).join('')
		: '<li>none</li>';
	const recovered = comparison.recoveredSessionIds.length
		? comparison.recoveredSessionIds.map((id) => `<li>${escapeHtml(id)}</li>`).join('')
		: '<li>none</li>';

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:2rem;background:#f8f7f2;color:#181713}main{max-width:1000px;margin:auto}nav{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem}nav a{background:#181713;border-radius:999px;color:white;padding:.35rem .7rem;text-decoration:none}.status{border-radius:999px;display:inline-flex;font-weight:800;padding:.35rem .75rem}.pass{background:#dcfce7;color:#166534}.fail{background:#fee2e2;color:#991b1b}.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:1rem 0}.card{background:white;border:1px solid #e7e5e4;border-radius:1rem;padding:1rem}.card strong{display:block;font-size:2rem}section{background:white;border:1px solid #e7e5e4;border-radius:1rem;margin:1rem 0;padding:1rem}</style></head><body><main>${links}<h1>${escapeHtml(title)}</h1><p class="status ${comparison.status}">${comparison.status}</p><div class="grid"><article class="card"><span>Baseline pass rate</span><strong>${escapeHtml(formatPercent(comparison.baseline.passRate))}</strong></article><article class="card"><span>Current pass rate</span><strong>${escapeHtml(formatPercent(comparison.current.passRate))}</strong></article><article class="card"><span>Failed delta</span><strong>${comparison.deltas.failed}</strong></article><article class="card"><span>Pass rate delta</span><strong>${escapeHtml(formatPercent(comparison.deltas.passRate))}</strong></article></div><section><h2>Regression Reasons</h2><ul>${reasons}</ul></section><section><h2>New Failed Sessions</h2><ul>${newFailures}</ul></section><section><h2>Recovered Sessions</h2><ul>${recovered}</ul></section></main></body></html>`;
};

export const renderVoiceScenarioEvalHTML = (
	report: VoiceScenarioEvalReport,
	options: { links?: VoiceEvalLink[]; title?: string } = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Scenario Evals';
	const links = options.links?.length
		? `<nav>${options.links
				.map(
					(link) =>
						`<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`
				)
				.join('')}</nav>`
		: '';
	const scenarios = report.scenarios.length
		? report.scenarios
				.map((scenario) => {
					const scenarioIssues = scenario.issues.length
						? `<ul>${scenario.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>`
						: '';
					const sessions = scenario.sessions.length
						? scenario.sessions
								.map(
									(session) =>
										`<tr class="${session.status}"><td>${escapeHtml(session.sessionId)}</td><td>${escapeHtml(session.status)}</td><td>${session.eventCount}</td><td>${escapeHtml(session.issues.join(', ') || 'none')}</td></tr>`
								)
								.join('')
						: '<tr><td colspan="4">No matching sessions.</td></tr>';
					return `<section class="scenario ${scenario.status}"><h2>${escapeHtml(scenario.label)}</h2>${scenario.description ? `<p>${escapeHtml(scenario.description)}</p>` : ''}<p class="status ${scenario.status}">${scenario.status}</p><p>${scenario.passed} passed, ${scenario.failed} failed, ${scenario.matchedSessions} matched.</p>${scenarioIssues}<table><thead><tr><th>Session</th><th>Status</th><th>Events</th><th>Issues</th></tr></thead><tbody>${sessions}</tbody></table></section>`;
				})
				.join('')
		: '<section><p>No scenarios configured.</p></section>';

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:2rem;background:#f8f7f2;color:#181713}main{max-width:1180px;margin:auto}nav{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem}nav a{background:#181713;border-radius:999px;color:white;padding:.35rem .7rem;text-decoration:none}.status{border-radius:999px;display:inline-flex;font-weight:800;padding:.35rem .75rem}.status.pass{background:#dcfce7;color:#166534}.status.fail{background:#fee2e2;color:#991b1b}.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin:1rem 0}.card,section{background:white;border:1px solid #e7e5e4;border-radius:1rem;padding:1rem}.card strong{display:block;font-size:2rem}section{margin:1rem 0}table{border-collapse:collapse;width:100%;margin-top:1rem}td,th{border-bottom:1px solid #eee;padding:.75rem;text-align:left}tr.fail td{border-left:4px solid #dc2626}tr.pass td{border-left:4px solid #16a34a}</style></head><body><main>${links}<h1>${escapeHtml(title)}</h1><p class="status ${report.status}">${report.status}</p><div class="grid"><article class="card"><span>Total</span><strong>${report.total}</strong></article><article class="card"><span>Passed</span><strong>${report.passed}</strong></article><article class="card"><span>Failed</span><strong>${report.failed}</strong></article></div>${scenarios}</main></body></html>`;
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
	const getBaseline = async () =>
		typeof options.baseline === 'function'
			? options.baseline()
			: (options.baseline ?? (await options.baselineStore?.get()));
	const getBaselineComparison = async () => {
		const [current, baseline] = await Promise.all([getReport(), getBaseline()]);
		return baseline
			? compareVoiceEvalBaseline(current, baseline, options.baselineComparison)
			: undefined;
	};
	const getScenarioReport = () =>
		runVoiceScenarioEvals({
			events: options.events,
			scenarios: options.scenarios,
			store: options.store
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
	routes.get(`${path}/baseline`, async ({ set }) => {
		const comparison = await getBaselineComparison();
		if (!comparison) {
			set.status = 404;
			return Response.json({ error: 'No voice eval baseline found.' });
		}
		return new Response(
			renderVoiceEvalBaselineHTML(comparison, {
				links: options.links,
				title: `${options.title ?? 'AbsoluteJS Voice Evals'} Baseline`
			}),
			{
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					...options.headers
				}
			}
		);
	});
	routes.get(`${path}/baseline/json`, async ({ set }) => {
		const comparison = await getBaselineComparison();
		if (!comparison) {
			set.status = 404;
			return { error: 'No voice eval baseline found.' };
		}
		return comparison;
	});
	routes.get(`${path}/baseline/status`, async ({ set }) => {
		const comparison = await getBaselineComparison();
		if (!comparison) {
			set.status = 404;
			return { error: 'No voice eval baseline found.' };
		}
		if (comparison.status === 'fail') {
			set.status = 503;
		}
		return comparison;
	});
	routes.post(`${path}/baseline`, async ({ set }) => {
		if (!options.baselineStore) {
			set.status = 501;
			return { error: 'No voice eval baseline store configured.' };
		}
		const report = await getReport();
		await options.baselineStore.set(report);
		return {
			baseline: report,
			status: 'saved'
		};
	});
	routes.get(`${path}/scenarios`, async () => {
		const report = await getScenarioReport();
		return new Response(
			renderVoiceScenarioEvalHTML(report, {
				links: options.links,
				title: `${options.title ?? 'AbsoluteJS Voice Evals'} Scenarios`
			}),
			{
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					...options.headers
				}
			}
		);
	});
	routes.get(`${path}/scenarios/json`, async () => getScenarioReport());
	routes.get(`${path}/scenarios/status`, async ({ set }) => {
		const report = await getScenarioReport();
		if (report.status === 'fail') {
			set.status = 503;
		}
		return report;
	});

	return routes;
};
