import { expect, test } from 'bun:test';
import {
	createVoiceLiveLatencyRoutes,
	createVoiceMemoryStore,
	createVoiceMemoryTraceEventStore,
	createVoiceSessionRecord,
	createVoiceTurnLatencyRoutes,
	renderVoiceLiveLatencyHTML,
	renderVoiceTurnLatencyHTML,
	summarizeVoiceLiveLatency,
	summarizeVoiceTurnLatency
} from '../src';

test('live latency routes expose copyable primitive proof', async () => {
	const store = createVoiceMemoryTraceEventStore();
	await store.append({
		at: 100,
		payload: {
			latencyMs: 640,
			status: 'assistant_audio_started'
		},
		sessionId: 'session-live',
		type: 'client.live_latency'
	});

	const report = await summarizeVoiceLiveLatency({ store });
	const html = renderVoiceLiveLatencyHTML(report);

	expect(report).toMatchObject({
		failed: 0,
		status: 'pass',
		total: 1
	});
	expect(html).toContain('Copy into your app');
	expect(html).toContain('createVoiceLiveLatencyRoutes');
	expect(html).toContain('client.live_latency');

	const routes = createVoiceLiveLatencyRoutes({
		htmlPath: '/live-latency',
		path: '/api/live-latency',
		store
	});
	const response = await routes.handle(new Request('http://localhost/live-latency'));
	expect(response.status).toBe(200);
	expect(await response.text()).toContain('createVoiceLiveLatencyRoutes');
});

test('turn latency routes expose copyable waterfall proof', async () => {
	const store = createVoiceMemoryStore();
	const traceStore = createVoiceMemoryTraceEventStore();
	const session = createVoiceSessionRecord('session-turn');
	session.turns.push({
		committedAt: 300,
		id: 'turn-1',
		text: 'book the demo',
		transcripts: [
			{
				endedAtMs: 100,
				id: 'final-1',
				isFinal: true,
				startedAtMs: 90,
				text: 'book the demo'
			}
		]
	});
	await store.set(session.id, session);
	await traceStore.append({
		at: 540,
		payload: { stage: 'assistant_audio_received' },
		sessionId: session.id,
		turnId: 'turn-1',
		type: 'turn_latency.stage'
	});

	const report = await summarizeVoiceTurnLatency({ store, traceStore });
	const html = renderVoiceTurnLatencyHTML(report);

	expect(report).toMatchObject({
		failed: 0,
		status: 'pass',
		total: 1
	});
	expect(report.turns[0]?.totalMs).toBe(440);
	expect(html).toContain('Copy into your app');
	expect(html).toContain('createVoiceTurnLatencyRoutes');
	expect(html).toContain('turn_latency.stage');

	const routes = createVoiceTurnLatencyRoutes({
		htmlPath: '/turn-latency',
		path: '/api/turn-latency',
		store,
		traceStore
	});
	const response = await routes.handle(new Request('http://localhost/turn-latency'));
	expect(response.status).toBe(200);
	expect(await response.text()).toContain('createVoiceTurnLatencyRoutes');
});
