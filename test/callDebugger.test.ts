import { expect, test } from 'bun:test';
import {
	buildVoiceCallDebuggerReport,
	createVoiceCallDebuggerRoutes,
	createVoiceMemoryTraceEventStore,
	createVoiceProviderDecisionTraceEvent,
	createVoiceTraceEvent,
	renderVoiceCallDebuggerHTML
} from '../src';

const createEvents = () => [
	createVoiceTraceEvent({
		at: 100,
		payload: {
			text: 'I need help with billing.'
		},
		sessionId: 'session-debug',
		turnId: 'turn-1',
		type: 'turn.committed'
	}),
	createVoiceProviderDecisionTraceEvent({
		at: 120,
		elapsedMs: 80,
		fallbackProvider: 'anthropic',
		kind: 'llm',
		provider: 'openai',
		reason: 'Recovered after primary timeout.',
		selectedProvider: 'anthropic',
		sessionId: 'session-debug',
		status: 'fallback',
		surface: 'live-call',
		turnId: 'turn-1'
	}),
	createVoiceTraceEvent({
		at: 130,
		payload: {
			text: 'Billing can help with that.'
		},
		sessionId: 'session-debug',
		turnId: 'turn-1',
		type: 'turn.assistant'
	})
];

test('buildVoiceCallDebuggerReport composes snapshot operations and failure replay', async () => {
	const store = createVoiceMemoryTraceEventStore();
	for (const event of createEvents()) {
		await store.append(event);
	}

	const report = await buildVoiceCallDebuggerReport(
		{
			operationsRecordHref: '/voice-operations/:sessionId',
			snapshot: ({ sessionId }) => ({
				artifacts: [
					{
						href: `/voice-operations/${sessionId}`,
						kind: 'operations-record',
						label: 'Operations record',
						status: 'pass'
					}
				],
				sessionId
			}),
			store
		},
		{
			request: new Request('http://localhost/debug'),
			sessionId: 'session-debug'
		}
	);

	expect(report.sessionId).toBe('session-debug');
	expect(report.operationsRecord.providerDecisionSummary.fallbacks).toBe(1);
	expect(report.failureReplay.providers.fallbacks).toBe(1);
	expect(report.snapshot.artifacts).toHaveLength(1);
	expect(renderVoiceCallDebuggerHTML(report)).toContain('One-call support artifact');
});

test('createVoiceCallDebuggerRoutes exposes json html and incident markdown', async () => {
	const store = createVoiceMemoryTraceEventStore();
	for (const event of createEvents()) {
		await store.append(event);
	}
	const routes = createVoiceCallDebuggerRoutes({
		operationsRecordHref: '/voice-operations/:sessionId',
		snapshot: ({ sessionId }) => ({ sessionId }),
		store
	});

	const json = await routes.handle(
		new Request('http://localhost/api/voice-call-debugger/session-debug')
	);
	expect(json.status).toBe(200);
	expect((await json.json()).sessionId).toBe('session-debug');

	const html = await routes.handle(
		new Request('http://localhost/voice-call-debugger/session-debug')
	);
	expect(await html.text()).toContain('Voice Call Debugger');

	const markdown = await routes.handle(
		new Request('http://localhost/voice-call-debugger/session-debug/incident.md')
	);
	expect(markdown.headers.get('content-type')).toContain('text/markdown');
	expect(await markdown.text()).toContain('session-debug');
});
