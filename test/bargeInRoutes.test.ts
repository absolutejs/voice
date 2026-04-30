import { expect, test } from 'bun:test';
import {
	createVoiceBargeInRoutes,
	createVoiceMemoryTraceEventStore,
	summarizeVoiceBargeIn
} from '../src';

test('summarizeVoiceBargeIn reports pass fail latency from trace events', async () => {
	const store = createVoiceMemoryTraceEventStore();
	await store.append({
		at: 100,
		payload: {
			at: 100,
			id: 'barge-1',
			latencyMs: 90,
			reason: 'manual-audio',
			sessionId: 'session-1',
			status: 'stopped',
			thresholdMs: 250
		},
		sessionId: 'session-1',
		type: 'client.barge_in'
	});
	await store.append({
		at: 200,
		payload: {
			at: 200,
			id: 'barge-2',
			latencyMs: 310,
			reason: 'partial-transcript',
			sessionId: 'session-1',
			status: 'stopped',
			thresholdMs: 250
		},
		sessionId: 'session-1',
		type: 'client.barge_in'
	});

	const report = summarizeVoiceBargeIn(await store.list(), {
		thresholdMs: 250
	});

	expect(report).toMatchObject({
		averageLatencyMs: 200,
		failed: 1,
		passed: 1,
		status: 'fail',
		total: 2
	});
	expect(report.sessions[0]).toMatchObject({
		failed: 1,
		passed: 1,
		sessionId: 'session-1'
	});
});

test('createVoiceBargeInRoutes accepts monitor events and renders dashboard', async () => {
	const store = createVoiceMemoryTraceEventStore();
	const app = createVoiceBargeInRoutes({ store });

	const posted = await app.handle(
		new Request('http://localhost/api/voice-barge-in', {
			body: JSON.stringify({
				at: 100,
				id: 'barge-post',
				latencyMs: 80,
				reason: 'input-level',
				sessionId: 'session-post',
				status: 'stopped',
				thresholdMs: 250
			}),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST'
		})
	);
	expect(posted.status).toBe(200);

	const json = await app.handle(
		new Request('http://localhost/api/voice-barge-in')
	);
	await expect(json.json()).resolves.toMatchObject({
		passed: 1,
		status: 'pass',
		total: 1
	});

	const html = await app.handle(new Request('http://localhost/barge-in'));
	const htmlText = await html.text();
	expect(htmlText).toContain('Voice Barge-In');
	expect(htmlText).toContain('Copy into your app');
	expect(htmlText).toContain('createVoiceBargeInRoutes');
	expect(htmlText).toContain('createVoiceBargeInMonitor');
});
