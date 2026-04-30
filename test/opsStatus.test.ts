import { expect, test } from 'bun:test';
import {
	createVoiceMemoryAuditSinkDeliveryStore,
	createVoiceMemoryTraceEventStore,
	createVoiceMemoryTraceSinkDeliveryStore,
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

test('summarizeVoiceOpsStatus includes delivery sink surface when configured', async () => {
	const report = await summarizeVoiceOpsStatus({
		deliverySinks: {
			auditDeliveries: {
				store: createVoiceMemoryAuditSinkDeliveryStore()
			},
			traceDeliveries: {
				store: createVoiceMemoryTraceSinkDeliveryStore()
			}
		},
		evals: false,
		include: {
			handoffs: false,
			providers: false,
			quality: false,
			sessions: false
		},
		links: [
			{
				href: '/custom',
				label: 'Custom'
			}
		],
		store: createVoiceMemoryTraceEventStore()
	});

	expect(report.status).toBe('pass');
	expect(report.surfaces.deliverySinks).toEqual({
		auditTotal: 0,
		status: 'pass',
		traceTotal: 0
	});
	expect(report.links.map((link) => link.href)).toContain('/delivery-sinks');
	expect(report.links.map((link) => link.href)).toContain('/custom');
});

test('summarizeVoiceOpsStatus exposes recovered provider fallback evidence', async () => {
	const store = createVoiceMemoryTraceEventStore();
	await store.append(
		createVoiceTraceEvent({
			payload: {
				error: 'OpenAI voice assistant model failed: HTTP 400',
				provider: 'openai',
				providerStatus: 'error'
			},
			sessionId: 'session-recovered-fallback',
			turnId: 'turn-1',
			type: 'session.error'
		})
	);
	await store.append(
		createVoiceTraceEvent({
			payload: {
				fallbackProvider: 'anthropic',
				provider: 'anthropic',
				providerStatus: 'fallback',
				recovered: true,
				selectedProvider: 'openai',
				status: 'fallback'
			},
			sessionId: 'session-recovered-fallback',
			turnId: 'turn-1',
			type: 'session.error'
		})
	);

	const report = await summarizeVoiceOpsStatus({
		evals: false,
		include: {
			providers: false,
			quality: false
		},
		store
	});

	expect(report.status).toBe('pass');
	expect(report.surfaces.providerRecovery).toEqual({
		recovered: 1,
		recoveredSessions: 1,
		recoveredTurns: 1,
		status: 'pass',
		total: 1,
		unresolvedErrors: 0,
		unresolvedSessions: 0
	});
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
