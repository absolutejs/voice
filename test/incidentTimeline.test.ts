import { expect, test } from 'bun:test';
import {
	buildVoiceIncidentRecoveryOutcomeReport,
	buildVoiceIncidentRecoveryOutcomeReadinessCheck,
	buildVoiceIncidentRecoveryTrendReport,
	buildVoiceIncidentTimelineReport,
	createVoiceMemoryAuditEventStore,
	createVoiceMemoryTraceEventStore,
	createVoiceIncidentTimelineRoutes,
	renderVoiceIncidentTimelineMarkdown
} from '../src';
import type {
	VoiceFailureReplayReport,
	VoiceOperationsRecord,
	VoiceOperationalStatusReport
} from '../src';

const operationalStatus: VoiceOperationalStatusReport = {
	checkedAt: 2_000,
	checks: [
		{
			detail: 'Proof pack is stale.',
			href: '/voice/proof-pack',
			label: 'Proof pack freshness',
			status: 'warn',
			value: '90s old'
		},
		{
			detail: 'Production readiness gate is open.',
			label: 'Production readiness',
			status: 'pass'
		}
	],
	links: {},
	status: 'warn',
	summary: {
		fail: 0,
		pass: 1,
		total: 2,
		warn: 1
	}
};

const operationsRecord = {
	checkedAt: 3_000,
	guardrails: {
		decisions: [],
		findings: [],
		status: 'pass',
		total: 0
	},
	handoffs: [],
	outcome: {
		assistantReplies: 0,
		complete: false,
		escalated: false,
		noAnswer: false,
		transferred: false,
		voicemail: false
	},
	providerDecisions: [],
	providerDecisionSummary: {
		recoveredFallbacks: 0,
		status: 'failed',
		total: 0,
		unresolvedFailures: 1
	},
	providers: [],
	replay: {
		events: [],
		sessionId: 'session-1',
		turns: []
	},
	sessionId: 'session-1',
	status: 'failed',
	summary: {
		counts: {},
		durationMs: 100,
		firstAt: 1_000,
		lastAt: 1_100,
		sessionId: 'session-1',
		total: 0
	},
	telephonyMedia: {
		events: [],
		inboundFrames: 0,
		outboundFrames: 0,
		status: 'pass',
		streams: [],
		total: 0
	},
	timeline: [],
	tools: [],
	traceEvents: [],
	transcript: []
} as unknown as VoiceOperationsRecord;

const failureReplay: VoiceFailureReplayReport = {
	incidentMarkdown: '# Incident',
	media: {
		audioBytes: 0,
		clears: 0,
		errors: 0,
		issues: [],
		steps: [],
		total: 0
	},
	ok: false,
	operationsRecordHref: '/voice-operations/session-1',
	providers: {
		degraded: 0,
		errors: 1,
		fallbacks: 0,
		recoveryStatus: 'failed',
		selected: 1,
		steps: [
			{
				at: 4_000,
				error: 'timeout',
				provider: 'openai',
				userHeard: []
			}
		],
		total: 1
	},
	sessionId: 'session-1',
	status: 'failed',
	summary: {
		issues: ['openai timed out'],
		userHeard: []
	},
	turns: []
};

test('buildVoiceIncidentTimelineReport merges operational status calls and replay', async () => {
	const report = await buildVoiceIncidentTimelineReport({
		failureReplays: [failureReplay],
		links: {
			callDebugger: (sessionId) => `/voice-call-debugger/${sessionId}`,
			operationsRecords: (sessionId) => `/voice-operations/${sessionId}`
		},
		now: 5_000,
		operationalStatus,
		operationsRecords: [operationsRecord]
	});

	expect(report.status).toBe('fail');
	expect(report.summary).toMatchObject({
		critical: 2,
		total: 3,
		warn: 1
	});
	expect(report.events.map((event) => event.id)).toEqual([
		'failure-replay:session-1',
		'operations-record:session-1',
		'operational:Proof pack freshness'
	]);
	expect(report.events[1]?.action?.href).toBe('/voice-call-debugger/session-1');
	expect(report.actions.map((action) => action.id)).toContain('support.bundle');
	expect(report.actions.map((action) => action.id)).toContain('proof.rerun');
});

test('buildVoiceIncidentTimelineReport filters old events and resolved monitor issues', async () => {
	const report = await buildVoiceIncidentTimelineReport({
		monitorIssues: [
			{
				createdAt: 1_000,
				id: 'resolved',
				impactedSessions: [],
				label: 'Resolved issue',
				lastSeenAt: 1_000,
				monitorId: 'latency',
				operationsRecordHrefs: [],
				resolvedAt: 1_500,
				severity: 'critical',
				status: 'resolved'
			},
			{
				createdAt: 4_500,
				id: 'open',
				impactedSessions: ['session-2'],
				label: 'Open issue',
				lastSeenAt: 4_500,
				monitorId: 'latency',
				operationsRecordHrefs: [],
				severity: 'warn',
				status: 'open'
			}
		],
		now: 5_000,
		operationalStatus,
		windowMs: 1_000
	});

	expect(report.status).toBe('warn');
	expect(report.events).toHaveLength(1);
	expect(report.events[0]?.id).toBe('monitor:open');
});

test('createVoiceIncidentTimelineRoutes exposes json html and markdown', async () => {
	const routes = createVoiceIncidentTimelineRoutes({
		failureReplays: [failureReplay],
		htmlPath: '/voice/incidents',
		markdownPath: '/voice/incidents.md',
		now: 5_000,
		path: '/api/incidents'
	});

	const json = await routes.handle(new Request('http://localhost/api/incidents'));
	const html = await routes.handle(new Request('http://localhost/voice/incidents'));
	const markdown = await routes.handle(
		new Request('http://localhost/voice/incidents.md')
	);

	expect(json.status).toBe(503);
	await expect(json.json()).resolves.toMatchObject({
		status: 'fail'
	});
	const htmlText = await html.text();
	const markdownText = await markdown.text();

	expect(htmlText).toContain('Incident Timeline');
	expect(htmlText).toContain('Recovery actions');
	expect(markdownText).toContain('Failure replay failed');
	expect(markdownText).toContain('Recovery Actions');
});

test('createVoiceIncidentTimelineRoutes exposes and executes recovery actions', async () => {
	const audit = createVoiceMemoryAuditEventStore();
	const calls: string[] = [];
	const trace = createVoiceMemoryTraceEventStore();
	const routes = createVoiceIncidentTimelineRoutes({
		actionHandlers: {
			'proof.rerun': ({ actionId }) => {
				calls.push(actionId);

				return {
					actionId,
					ok: true,
					status: 'queued'
				};
			}
		},
		audit,
		failureReplays: [failureReplay],
		now: 5_000,
		recoveryActions: [
			{
				id: 'proof.rerun',
				label: 'Rerun proof pack',
				method: 'POST'
			},
			{
				id: 'support.open',
				label: 'Open support bundle',
				method: 'GET'
			}
		],
		trace
	});

	const actions = await routes.handle(
		new Request('http://localhost/api/voice/incident-timeline/actions')
	);
	const run = await routes.handle(
		new Request('http://localhost/api/voice/incident-timeline/actions/proof.rerun', {
			method: 'POST'
		})
	);
	const blocked = await routes.handle(
		new Request('http://localhost/api/voice/incident-timeline/actions/support.open', {
			method: 'POST'
		})
	);

	expect(actions.status).toBe(200);
	await expect(actions.json()).resolves.toMatchObject({
		actions: [
			{
				id: 'proof.rerun'
			},
			{
				id: 'support.open'
			}
		]
	});
	expect(run.status).toBe(200);
	await expect(run.json()).resolves.toMatchObject({
		beforeStatus: 'fail',
		afterStatus: 'fail',
		ok: true,
		status: 'queued'
	});
	expect(blocked.status).toBe(409);
	expect(calls).toEqual(['proof.rerun']);
	expect(await audit.list({ type: 'operator.action' })).toMatchObject([
		{
			action: 'incident.proof.rerun',
			outcome: 'success',
			payload: {
				body: {
					afterStatus: 'fail',
					beforeStatus: 'fail'
				}
			}
		}
	]);
	expect(await trace.list({ type: 'operator.action' })).toMatchObject([
		{
			payload: {
				actionId: 'incident.proof.rerun',
				ok: true,
				status: 200
			}
		}
	]);
});

test('buildVoiceIncidentRecoveryOutcomeReport summarizes audited incident action impact', async () => {
	const audit = createVoiceMemoryAuditEventStore();
	const routes = createVoiceIncidentTimelineRoutes({
		actionHandlers: {
			'proof.rerun': ({ actionId }) => ({
				actionId,
				afterStatus: 'pass',
				beforeStatus: 'fail',
				ok: true,
				status: 'refreshed'
			}),
			'readiness.refresh': ({ actionId }) => ({
				actionId,
				afterStatus: 'warn',
				beforeStatus: 'warn',
				ok: true,
				status: 'refreshed'
			}),
			'support.bundle': ({ actionId }) => ({
				actionId,
				afterStatus: 'fail',
				beforeStatus: 'warn',
				ok: true,
				status: 'generated'
			})
		},
		audit,
		failureReplays: [failureReplay],
		now: 5_000,
		recoveryActions: [
			{
				id: 'proof.rerun',
				label: 'Rerun proof pack',
				method: 'POST'
			},
			{
				id: 'readiness.refresh',
				label: 'Refresh readiness',
				method: 'POST'
			},
			{
				id: 'support.bundle',
				label: 'Generate support bundle',
				method: 'POST'
			}
		]
	});

	for (const actionId of ['proof.rerun', 'readiness.refresh', 'support.bundle']) {
		await routes.handle(
			new Request(
				`http://localhost/api/voice/incident-timeline/actions/${actionId}`,
				{
					method: 'POST'
				}
			)
		);
	}

	const report = await buildVoiceIncidentRecoveryOutcomeReport({ audit });
	const json = await routes.handle(
		new Request('http://localhost/api/voice/incident-timeline/recovery-outcomes')
	);
	const html = await routes.handle(
		new Request('http://localhost/voice/incident-recovery-outcomes')
	);

	expect(report).toMatchObject({
		failed: 0,
		improved: 1,
		regressed: 1,
		total: 3,
		unchanged: 1
	});
	expect(report.entries.map((entry) => entry.outcome).sort()).toEqual([
		'improved',
		'regressed',
		'unchanged'
	]);
	expect(json.status).toBe(200);
	await expect(json.json()).resolves.toMatchObject({
		total: 3
	});
	expect(await html.text()).toContain('Recovery Outcomes');
});

test('buildVoiceIncidentRecoveryOutcomeReadinessCheck gates failed and regressed recovery outcomes', () => {
	const check = buildVoiceIncidentRecoveryOutcomeReadinessCheck({
		checkedAt: 1_000,
		entries: [],
		failed: 1,
		improved: 2,
		regressed: 1,
		total: 4,
		unchanged: 0
	});
	const warnOnly = buildVoiceIncidentRecoveryOutcomeReadinessCheck(
		{
			checkedAt: 1_000,
			entries: [],
			failed: 0,
			improved: 1,
			regressed: 0,
			total: 3,
			unchanged: 2
		},
		{ maxUnchanged: 1 }
	);

	expect(check).toMatchObject({
		label: 'Incident recovery outcomes',
		status: 'fail',
		value: '2/4 improved'
	});
	expect(check.actions?.[0]?.href).toBe(
		'/api/voice/incident-timeline/recovery-outcomes'
	);
	expect(warnOnly.status).toBe('warn');
	expect(warnOnly.gateExplanation?.thresholdLabel).toBe(
		'Incident recovery outcome budget'
	);
});

test('buildVoiceIncidentRecoveryTrendReport summarizes recovery effectiveness history', async () => {
	const first = {
		checkedAt: 1_000,
		entries: [],
		failed: 0,
		improved: 1,
		regressed: 0,
		total: 2,
		unchanged: 1
	};
	const second = {
		checkedAt: 2_000,
		entries: [],
		failed: 0,
		improved: 3,
		regressed: 0,
		total: 3,
		unchanged: 0
	};
	const report = buildVoiceIncidentRecoveryTrendReport([second, first]);
	const routes = createVoiceIncidentTimelineRoutes({
		failureReplays: [failureReplay],
		now: 5_000,
		recoveryTrendReports: [first, second]
	});
	const json = await routes.handle(
		new Request('http://localhost/api/voice/incident-timeline/recovery-trends')
	);
	const html = await routes.handle(
		new Request('http://localhost/voice/incident-recovery-trends')
	);
	const markdown = await routes.handle(
		new Request('http://localhost/voice/incident-recovery-trends.md')
	);

	expect(report).toMatchObject({
		status: 'pass',
		summary: {
			cycles: 2,
			improved: 4,
			total: 5
		},
		trend: {
			improvementRateDelta: 0.5
		}
	});
	expect(report.cycles.map((cycle) => cycle.checkedAt)).toEqual([1_000, 2_000]);
	expect(json.status).toBe(200);
	await expect(json.json()).resolves.toMatchObject({
		status: 'pass',
		summary: {
			cycles: 2
		}
	});
	expect(await html.text()).toContain('Recovery Trend');
	expect(await markdown.text()).toContain('Improvement delta');
});

test('renderVoiceIncidentTimelineMarkdown renders empty reports', async () => {
	const report = await buildVoiceIncidentTimelineReport({
		now: 5_000
	});

	expect(renderVoiceIncidentTimelineMarkdown(report)).toContain(
		'No incident timeline events'
	);
});
