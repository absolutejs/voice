import { expect, test } from 'bun:test';
import { createVoiceProviderFailureSimulator } from '../src/testing';

test('createVoiceProviderFailureSimulator falls back on simulated provider failure', async () => {
	const events: Array<Record<string, unknown>> = [];
	const simulator = createVoiceProviderFailureSimulator({
		onProviderEvent: (event) => {
			events.push(event);
		},
		providers: ['openai', 'anthropic']
	});

	await expect(simulator.run('openai', 'failure')).resolves.toMatchObject({
		mode: 'failure',
		provider: 'openai',
		replayHref: expect.stringContaining('/api/voice-sessions/provider-sim-'),
		result: {
			assistantText: 'Simulated anthropic provider recovered.'
		},
		sessionId: expect.stringContaining('provider-sim-'),
		status: 'simulated'
	});
	expect(events).toMatchObject([
		{
			fallbackProvider: 'anthropic',
			provider: 'openai',
			rateLimited: true,
			selectedProvider: 'openai',
			status: 'error'
		},
		{
			provider: 'anthropic',
			recovered: true,
			selectedProvider: 'openai',
			status: 'fallback'
		}
	]);
});

test('createVoiceProviderFailureSimulator can force provider recovery', async () => {
	const events: Array<Record<string, unknown>> = [];
	const simulator = createVoiceProviderFailureSimulator({
		onProviderEvent: (event) => {
			events.push(event);
		},
		providers: ['openai', 'anthropic']
	});

	await simulator.run('openai', 'failure');
	await expect(simulator.run('openai', 'recovery')).resolves.toMatchObject({
		mode: 'recovery',
		provider: 'openai',
		result: {
			assistantText: 'Simulated openai provider recovered.'
		},
		status: 'simulated'
	});
	expect(events.at(-1)).toMatchObject({
		provider: 'openai',
		selectedProvider: 'openai',
		status: 'success'
	});
});

test('createVoiceProviderFailureSimulator supports custom replay hrefs', async () => {
	const simulator = createVoiceProviderFailureSimulator({
		providers: ['openai'],
		replayHref: ({ sessionId }) => `/debug/${sessionId}`
	});

	await expect(simulator.run('openai', 'recovery')).resolves.toMatchObject({
		replayHref: expect.stringContaining('/debug/provider-sim-')
	});
});
