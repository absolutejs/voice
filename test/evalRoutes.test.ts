import { expect, test } from 'bun:test';
import {
	compareVoiceEvalBaseline,
	createVoiceFileEvalBaselineStore,
	createVoiceFileScenarioFixtureStore,
	createVoiceEvalRoutes,
	createVoiceMemoryTraceEventStore,
	renderVoiceEvalBaselineHTML,
	renderVoiceEvalHTML,
	renderVoiceScenarioEvalHTML,
	renderVoiceScenarioFixtureEvalHTML,
	runVoiceScenarioEvals,
	runVoiceScenarioFixtureEvals,
	runVoiceSessionEvals
} from '../src';

const createEvalEvents = () => [
	{
		at: Date.parse('2026-04-25T10:00:00.000Z'),
		id: 'session-good-start',
		payload: {},
		scenarioId: 'happy-path',
		sessionId: 'session-good',
		type: 'session.started' as const
	},
	{
		at: Date.parse('2026-04-25T10:00:01.000Z'),
		id: 'session-good-turn',
		payload: { text: 'hello' },
		scenarioId: 'happy-path',
		sessionId: 'session-good',
		turnId: 'turn-1',
		type: 'turn.committed' as const
	},
	{
		at: Date.parse('2026-04-25T10:00:02.000Z'),
		id: 'session-good-assistant',
		payload: { text: 'hi' },
		scenarioId: 'happy-path',
		sessionId: 'session-good',
		turnId: 'turn-1',
		type: 'turn.assistant' as const
	},
	{
		at: Date.parse('2026-04-25T10:00:03.000Z'),
		id: 'session-good-end',
		payload: { disposition: 'completed', type: 'end' },
		scenarioId: 'happy-path',
		sessionId: 'session-good',
		type: 'call.lifecycle' as const
	},
	{
		at: Date.parse('2026-04-26T10:00:00.000Z'),
		id: 'session-bad-start',
		payload: {},
		scenarioId: 'regression',
		sessionId: 'session-bad',
		type: 'session.started' as const
	},
	{
		at: Date.parse('2026-04-26T10:00:01.000Z'),
		id: 'session-bad-turn-1',
		payload: { text: 'repeat' },
		scenarioId: 'regression',
		sessionId: 'session-bad',
		turnId: 'turn-1',
		type: 'turn.committed' as const
	},
	{
		at: Date.parse('2026-04-26T10:00:02.000Z'),
		id: 'session-bad-turn-2',
		payload: { text: 'repeat' },
		scenarioId: 'regression',
		sessionId: 'session-bad',
		turnId: 'turn-2',
		type: 'turn.committed' as const
	},
	{
		at: Date.parse('2026-04-26T10:00:03.000Z'),
		id: 'session-bad-provider',
		payload: {
			elapsedMs: 5000,
			provider: 'openai',
			providerStatus: 'error',
			timedOut: true
		},
		scenarioId: 'regression',
		sessionId: 'session-bad',
		type: 'session.error' as const
	},
	{
		at: Date.parse('2026-04-26T10:00:04.000Z'),
		id: 'session-bad-end',
		payload: { disposition: 'failed', type: 'end' },
		scenarioId: 'regression',
		sessionId: 'session-bad',
		type: 'call.lifecycle' as const
	}
];

test('runVoiceSessionEvals replays stored sessions against quality gates', async () => {
	const report = await runVoiceSessionEvals({
		events: createEvalEvents()
	});

	expect(report.status).toBe('fail');
	expect(report.total).toBe(2);
	expect(report.failed).toBe(1);
	expect(report.passed).toBe(1);
	expect(report.trend).toHaveLength(2);
	expect(report.sessions[0]?.sessionId).toBe('session-bad');
	expect(report.sessions[0]?.operationsRecordHref).toBe(
		'/voice-operations/session-bad'
	);
	expect(report.sessions[0]?.quality.metrics.duplicateTurnRate.pass).toBe(false);
});

test('renderVoiceEvalHTML renders session eval results and nav links', async () => {
	const report = await runVoiceSessionEvals({
		events: createEvalEvents()
	});
	const html = renderVoiceEvalHTML(report, {
		links: [{ href: '/ops-console', label: 'Ops Console' }]
	});

	expect(html).toContain('AbsoluteJS Voice Evals');
	expect(html).toContain('/ops-console');
	expect(html).toContain('session-bad');
	expect(html).toContain('/voice-operations/session-bad');
	expect(html).toContain('Copy into your app');
	expect(html).toContain('createVoiceEvalRoutes');
});

test('createVoiceEvalRoutes exposes html json and failing status endpoint', async () => {
	const store = createVoiceMemoryTraceEventStore();
	for (const event of createEvalEvents()) {
		await store.append(event);
	}
	const routes = createVoiceEvalRoutes({
		operationsRecordHref: '/ops/records/:sessionId',
		store
	});

	const html = await routes.handle(new Request('http://localhost/evals'));
	expect(html.status).toBe(200);
	await expect(html.text()).resolves.toContain('Session Eval Results');

	const json = await routes.handle(new Request('http://localhost/evals/json'));
	const jsonReport = await json.json();
	expect(jsonReport).toMatchObject({
		failed: 1,
		status: 'fail'
	});
	expect(jsonReport.sessions[0]).toMatchObject({
		operationsRecordHref: '/ops/records/session-bad',
		sessionId: 'session-bad'
	});

	const status = await routes.handle(new Request('http://localhost/evals/status'));
	expect(status.status).toBe(503);
});

test('compareVoiceEvalBaseline reports regressions from a saved baseline', async () => {
	const baseline = await runVoiceSessionEvals({
		events: createEvalEvents().filter((event) => event.sessionId === 'session-good')
	});
	const current = await runVoiceSessionEvals({
		events: createEvalEvents()
	});
	const comparison = compareVoiceEvalBaseline(current, baseline);

	expect(comparison.status).toBe('fail');
	expect(comparison.deltas.failed).toBe(1);
	expect(comparison.newFailedSessionIds).toEqual(['session-bad']);
	expect(comparison.reasons.join(' ')).toContain('failed');
	expect(renderVoiceEvalBaselineHTML(comparison)).toContain('New Failed Sessions');
});

test('createVoiceEvalRoutes exposes baseline comparison and capture endpoints', async () => {
	const store = createVoiceMemoryTraceEventStore();
	for (const event of createEvalEvents()) {
		await store.append(event);
	}
	let baseline = await runVoiceSessionEvals({
		events: createEvalEvents().filter((event) => event.sessionId === 'session-good')
	});
	const routes = createVoiceEvalRoutes({
		baselineStore: {
			get: async () => baseline,
			set: async (report) => {
				baseline = report;
			}
		},
		store
	});

	const json = await routes.handle(
		new Request('http://localhost/evals/baseline/json')
	);
	await expect(json.json()).resolves.toMatchObject({
		status: 'fail',
		newFailedSessionIds: ['session-bad']
	});

	const status = await routes.handle(
		new Request('http://localhost/evals/baseline/status')
	);
	expect(status.status).toBe(503);

	const saved = await routes.handle(
		new Request('http://localhost/evals/baseline', { method: 'POST' })
	);
	expect(saved.status).toBe(200);

	const afterSave = await routes.handle(
		new Request('http://localhost/evals/baseline/status')
	);
	expect(afterSave.status).toBe(200);
});

test('createVoiceFileEvalBaselineStore persists baseline reports', async () => {
	const filePath = `/tmp/voice-eval-baseline-${crypto.randomUUID()}.json`;
	const store = createVoiceFileEvalBaselineStore(filePath);
	const report = await runVoiceSessionEvals({
		events: createEvalEvents()
	});

	expect(await store.get()).toBeUndefined();
	await store.set(report);
	expect(await store.get()).toMatchObject({
		failed: 1,
		total: 2
	});
});

test('runVoiceScenarioEvals evaluates workflow scenario packs', async () => {
	const report = await runVoiceScenarioEvals({
		events: createEvalEvents(),
		scenarios: [
			{
				id: 'happy-path-completes',
				label: 'Happy path completes',
				maxProviderErrors: 0,
				minSessions: 1,
				minTurns: 1,
				requiredAssistantIncludes: ['hi'],
				requiredDisposition: 'completed',
				requiredTranscriptIncludes: ['hello'],
				scenarioId: 'happy-path'
			},
			{
				id: 'regression-does-not-fail',
				maxProviderErrors: 0,
				requiredDisposition: 'completed',
				scenarioId: 'regression'
			}
		]
	});

	expect(report.status).toBe('fail');
	expect(report.passed).toBe(1);
	expect(report.failed).toBe(1);
	expect(report.scenarios[0]?.status).toBe('pass');
	expect(report.scenarios[1]?.sessions[0]?.operationsRecordHref).toBe(
		'/voice-operations/session-bad'
	);
	expect(report.scenarios[1]?.sessions[0]?.issues.join(' ')).toContain(
		'provider error'
	);
	expect(renderVoiceScenarioEvalHTML(report)).toContain(
		'/voice-operations/session-bad'
	);
	expect(renderVoiceScenarioEvalHTML(report)).toContain('Happy path completes');
});

test('createVoiceEvalRoutes exposes scenario html json and status endpoints', async () => {
	const store = createVoiceMemoryTraceEventStore();
	for (const event of createEvalEvents()) {
		await store.append(event);
	}
	const routes = createVoiceEvalRoutes({
		operationsRecordHref: (sessionId) => `/support/calls/${sessionId}`,
		scenarios: [
			{
				id: 'happy-path-completes',
				requiredDisposition: 'completed',
				scenarioId: 'happy-path'
			}
		],
		store
	});

	const html = await routes.handle(new Request('http://localhost/evals/scenarios'));
	expect(html.status).toBe(200);
	const htmlText = await html.text();
	expect(htmlText).toContain('happy-path-completes');
	expect(htmlText).toContain('/support/calls/session-good');
	expect(htmlText).toContain('createVoiceEvalRoutes');

	const json = await routes.handle(
		new Request('http://localhost/evals/scenarios/json')
	);
	await expect(json.json()).resolves.toMatchObject({
		status: 'pass',
		total: 1
	});

	const status = await routes.handle(
		new Request('http://localhost/evals/scenarios/status')
	);
	expect(status.status).toBe(200);
});

test('runVoiceScenarioFixtureEvals certifies seeded scenario fixtures', async () => {
	const report = await runVoiceScenarioFixtureEvals({
		fixtures: [
			{
				events: createEvalEvents().filter(
					(event) => event.sessionId === 'session-good'
				),
				id: 'fixture-good',
				label: 'Good fixture'
			}
		],
		scenarios: [
			{
				id: 'happy-path-completes',
				requiredDisposition: 'completed',
				requiredTranscriptIncludes: ['hello'],
				scenarioId: 'happy-path'
			}
		]
	});

	expect(report.status).toBe('pass');
	expect(report.total).toBe(1);
	expect(report.fixtures[0]?.report.scenarios[0]?.status).toBe('pass');
	expect(renderVoiceScenarioFixtureEvalHTML(report)).toContain('Good fixture');
});

test('createVoiceEvalRoutes exposes fixture html json and status endpoints', async () => {
	const routes = createVoiceEvalRoutes({
		fixtures: [
			{
				events: createEvalEvents().filter(
					(event) => event.sessionId === 'session-good'
				),
				id: 'fixture-good'
			}
		],
		scenarios: [
			{
				id: 'happy-path-completes',
				requiredDisposition: 'completed',
				scenarioId: 'happy-path'
			}
		]
	});

	const html = await routes.handle(new Request('http://localhost/evals/fixtures'));
	expect(html.status).toBe(200);
	const htmlText = await html.text();
	expect(htmlText).toContain('fixture-good');
	expect(htmlText).toContain('createVoiceEvalRoutes');

	const json = await routes.handle(
		new Request('http://localhost/evals/fixtures/json')
	);
	await expect(json.json()).resolves.toMatchObject({
		status: 'pass',
		total: 1
	});

	const status = await routes.handle(
		new Request('http://localhost/evals/fixtures/status')
	);
	expect(status.status).toBe(200);
});

test('createVoiceFileScenarioFixtureStore loads fixture packs', async () => {
	const filePath = `/tmp/voice-scenario-fixtures-${crypto.randomUUID()}.json`;
	await Bun.write(
		filePath,
		JSON.stringify({
			fixtures: [
				{
					events: createEvalEvents().filter(
						(event) => event.sessionId === 'session-good'
					),
					id: 'fixture-good'
				}
			]
		})
	);
	const store = createVoiceFileScenarioFixtureStore(filePath);

	await expect(store.list()).resolves.toMatchObject([
		{
			id: 'fixture-good'
		}
	]);
});
