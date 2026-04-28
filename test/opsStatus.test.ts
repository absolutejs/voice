import { expect, test } from 'bun:test';
import {
	createVoiceMemoryTraceEventStore,
	createVoiceOpsStatusRoutes,
	createVoiceTraceEvent,
	summarizeVoiceOpsStatus
} from '../src';

test('summarizeVoiceOpsStatus reports compact ops readiness', async () => {
	const store = createVoiceMemoryTraceEventStore();
	await store.append(
		createVoiceTraceEvent({
			payload: {
				type: 'start'
			},
			sessionId: 'session-ops-status',
			type: 'call.lifecycle'
		})
	);

	const report = await summarizeVoiceOpsStatus({
		evals: false,
		llmProviders: ['openai'],
		store
	});

	expect(report).toMatchObject({
		status: 'pass',
		surfaces: {
			providers: {
				total: 1
			},
			quality: {
				status: 'pass'
			},
			sessions: {
				total: 1
			}
		}
	});
	expect(report.links.map((link) => link.href)).toContain('/production-readiness');
});

test('createVoiceOpsStatusRoutes exposes json and html status', async () => {
	const routes = createVoiceOpsStatusRoutes({
		evals: false,
		include: {
			sessions: false
		},
		store: createVoiceMemoryTraceEventStore()
	});

	const json = await routes.handle(
		new Request('http://localhost/api/voice/ops-status')
	);
	const html = await routes.handle(
		new Request('http://localhost/api/voice/ops-status/html')
	);

	expect(json.status).toBe(200);
	await expect(json.json()).resolves.toMatchObject({
		status: 'pass'
	});
	expect(await html.text()).toContain('AbsoluteJS Voice Ops Status');
});
