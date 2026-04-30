import { expect, test } from 'bun:test';
import {
	createVoiceReconnectContractRoutes,
	renderVoiceReconnectContractHTML,
	summarizeVoiceReconnectContractSnapshots,
	runVoiceReconnectContract
} from '../src/reconnectContract';

test('runVoiceReconnectContract passes resumed reconnect with replay-safe turns', () => {
	const report = runVoiceReconnectContract({
		snapshots: [
			{
				at: 100,
				reconnect: {
					attempts: 1,
					lastDisconnectAt: 100,
					maxAttempts: 10,
					nextAttemptAt: 600,
					status: 'reconnecting'
				},
				turnIds: ['turn-1']
			},
			{
				at: 700,
				reconnect: {
					attempts: 1,
					lastResumedAt: 700,
					maxAttempts: 10,
					status: 'resumed'
				},
				turnIds: ['turn-1', 'turn-2']
			}
		]
	});

	expect(report.pass).toBe(true);
	expect(report.summary).toMatchObject({
		attempts: 1,
		duplicateTurnIds: [],
		reconnected: true,
		resumed: true
	});
});

test('runVoiceReconnectContract fails missing resume and duplicate replayed turns', () => {
	const report = runVoiceReconnectContract({
		snapshots: [
			{
				at: 100,
				reconnect: {
					attempts: 1,
					lastDisconnectAt: 100,
					maxAttempts: 1,
					nextAttemptAt: 600,
					status: 'reconnecting'
				},
				turnIds: ['turn-1', 'turn-1']
			},
			{
				at: 700,
				reconnect: {
					attempts: 1,
					maxAttempts: 1,
					status: 'exhausted'
				},
				turnIds: ['turn-1', 'turn-1']
			}
		]
	});

	expect(report.pass).toBe(false);
	expect(report.issues.map((issue) => issue.code)).toEqual([
		'reconnect.exhausted_before_resume',
		'reconnect.duplicate_turn_ids'
	]);
});

test('createVoiceReconnectContractRoutes exposes json and html reports', async () => {
	const routes = createVoiceReconnectContractRoutes({
		getSnapshots: () => [
			{
				at: 100,
				reconnect: {
					attempts: 1,
					maxAttempts: 10,
					status: 'reconnecting'
				}
			},
			{
				at: 200,
				reconnect: {
					attempts: 1,
					maxAttempts: 10,
					status: 'resumed'
				}
			}
		]
	});

	const json = await routes.handle(
		new Request('http://localhost/api/voice/reconnect-contract')
	);
	const jsonReport = await json.json();
	expect(json.headers.get('content-type')).toContain('application/json');
	expect(jsonReport).toMatchObject({
		pass: true,
		summary: {
			reconnected: true,
			resumed: true
		}
	});

	const html = await routes.handle(
		new Request('http://localhost/voice/reconnect-contract')
	);
	const body = await html.text();
	expect(html.headers.get('content-type')).toContain('text/html');
	expect(body).toContain('Voice reconnect contract');
	expect(renderVoiceReconnectContractHTML(jsonReport).length).toBeGreaterThan(100);
});

test('summarizeVoiceReconnectContractSnapshots builds snapshots from client traces', () => {
	const snapshots = summarizeVoiceReconnectContractSnapshots([
		{
			at: 100,
			id: 'trace-1',
			payload: {
				at: 100,
				reconnect: {
					attempts: 1,
					lastDisconnectAt: 100,
					maxAttempts: 10,
					nextAttemptAt: 600,
					status: 'reconnecting'
				},
				turnIds: ['turn-1']
			},
			sessionId: 'session-1',
			type: 'client.reconnect'
		},
		{
			at: 700,
			id: 'trace-2',
			payload: {
				at: 700,
				reconnect: {
					attempts: 1,
					lastResumedAt: 700,
					maxAttempts: 10,
					status: 'resumed'
				},
				turnIds: ['turn-1', 'turn-2']
			},
			sessionId: 'session-1',
			type: 'client.reconnect'
		}
	]);

	expect(snapshots).toMatchObject([
		{
			reconnect: {
				status: 'reconnecting'
			},
			turnIds: ['turn-1']
		},
		{
			reconnect: {
				status: 'resumed'
			},
			turnIds: ['turn-1', 'turn-2']
		}
	]);
	expect(runVoiceReconnectContract({ snapshots }).pass).toBe(true);
});
