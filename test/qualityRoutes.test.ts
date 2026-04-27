import { expect, test } from 'bun:test';
import {
	createVoiceMemoryTraceEventStore,
	createVoiceQualityRoutes,
	evaluateVoiceQuality,
	renderVoiceQualityHTML
} from '../src';

const createQualityEvents = () => [
	{
		at: 100,
		id: 'turn-1',
		payload: { text: 'hello' },
		sessionId: 'session-quality',
		turnId: 'turn-1',
		type: 'turn.committed' as const
	},
	{
		at: 110,
		id: 'turn-2',
		payload: { text: 'hello' },
		sessionId: 'session-quality',
		turnId: 'turn-2',
		type: 'turn.committed' as const
	},
	{
		at: 120,
		id: 'assistant-1',
		payload: { text: 'hi' },
		sessionId: 'session-quality',
		turnId: 'turn-1',
		type: 'turn.assistant' as const
	},
	{
		at: 130,
		id: 'provider-1',
		payload: {
			elapsedMs: 4000,
			provider: 'deepgram',
			providerStatus: 'error',
			timedOut: true
		},
		sessionId: 'session-quality',
		type: 'session.error' as const
	},
	{
		at: 140,
		id: 'provider-2',
		payload: {
			elapsedMs: 1000,
			provider: 'assemblyai',
			providerStatus: 'fallback'
		},
		sessionId: 'session-quality',
		type: 'session.error' as const
	},
	{
		at: 150,
		id: 'handoff-1',
		payload: {
			deliveries: {
				webhook: { status: 'failed' }
			},
			status: 'failed'
		},
		sessionId: 'session-quality',
		type: 'call.handoff' as const
	}
];

test('evaluateVoiceQuality fails exceeded quality thresholds', async () => {
	const report = await evaluateVoiceQuality({
		events: createQualityEvents(),
		thresholds: {
			maxDuplicateTurnRate: 0,
			maxHandoffFailureRate: 0,
			maxProviderAverageLatencyMs: 2000,
			maxProviderErrorRate: 0.1,
			maxProviderFallbackRate: 0.1,
			maxProviderTimeoutRate: 0
		}
	});

	expect(report.status).toBe('fail');
	expect(report.metrics.duplicateTurnRate.pass).toBe(false);
	expect(report.metrics.providerAverageLatencyMs.pass).toBe(false);
	expect(report.metrics.handoffFailureRate.pass).toBe(false);
});

test('renderVoiceQualityHTML renders quality gate status', async () => {
	const report = await evaluateVoiceQuality({
		events: []
	});
	const html = renderVoiceQualityHTML(report, {
		links: [{ href: '/diagnostics', label: 'Diagnostics' }]
	});

	expect(html).toContain('Voice quality gates');
	expect(html).toContain('/diagnostics');
	expect(html).toContain('Provider error rate');
});

test('createVoiceQualityRoutes exposes json html and failing status endpoint', async () => {
	const store = createVoiceMemoryTraceEventStore();
	for (const event of createQualityEvents()) {
		await store.append(event);
	}
	const app = createVoiceQualityRoutes({
		store,
		thresholds: {
			maxProviderErrorRate: 0
		}
	});

	const json = await app.handle(new Request('http://localhost/quality/json'));
	await expect(json.json()).resolves.toMatchObject({
		status: 'fail'
	});

	const html = await app.handle(new Request('http://localhost/quality'));
	expect(await html.text()).toContain('Voice quality gates');

	const status = await app.handle(new Request('http://localhost/quality/status'));
	expect(status.status).toBe(503);
});
