import { expect, test } from 'bun:test';
import {
	createVoiceEvalRoutes,
	createVoiceMemoryTraceEventStore,
	renderVoiceEvalHTML,
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
});

test('createVoiceEvalRoutes exposes html json and failing status endpoint', async () => {
	const store = createVoiceMemoryTraceEventStore();
	for (const event of createEvalEvents()) {
		await store.append(event);
	}
	const routes = createVoiceEvalRoutes({
		store
	});

	const html = await routes.handle(new Request('http://localhost/evals'));
	expect(html.status).toBe(200);
	await expect(html.text()).resolves.toContain('Session Eval Results');

	const json = await routes.handle(new Request('http://localhost/evals/json'));
	await expect(json.json()).resolves.toMatchObject({
		failed: 1,
		status: 'fail'
	});

	const status = await routes.handle(new Request('http://localhost/evals/status'));
	expect(status.status).toBe(503);
});
