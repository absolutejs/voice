import { expect, test } from 'bun:test';
import { createVoiceIOProviderFailureSimulator } from '../src/testing';

test('createVoiceIOProviderFailureSimulator emits fallback events', async () => {
	const events: Array<Record<string, unknown>> = [];
	const inputs: Array<Record<string, unknown>> = [];
	const simulator = createVoiceIOProviderFailureSimulator({
		kind: 'stt',
		latencyBudgets: {
			assemblyai: 6000,
			deepgram: 5000
		},
		now: () => 1000,
		onProviderEvent: (event, input) => {
			events.push(event);
			inputs.push(input);
		},
		providers: ['deepgram', 'assemblyai'],
		recoveryElapsedMs: {
			assemblyai: 28,
			deepgram: 18
		}
	});

	await expect(simulator.run('deepgram', 'failure')).resolves.toMatchObject({
		fallbackProvider: 'assemblyai',
		mode: 'failure',
		provider: 'deepgram',
		sessionId: 'stt-provider-sim-1000',
		status: 'simulated',
		suppressedUntil: 31_000
	});
	expect(events).toMatchObject([
		{
			attempt: 0,
			fallbackProvider: 'assemblyai',
			kind: 'stt',
			latencyBudgetMs: 5000,
			operation: 'open',
			provider: 'deepgram',
			providerHealth: {
				provider: 'deepgram',
				status: 'suppressed',
				suppressedUntil: 31_000
			},
			selectedProvider: 'deepgram',
			status: 'error',
			suppressedUntil: 31_000
		},
		{
			attempt: 1,
			elapsedMs: 28,
			fallbackProvider: 'assemblyai',
			kind: 'stt',
			latencyBudgetMs: 6000,
			operation: 'open',
			provider: 'assemblyai',
			providerHealth: {
				provider: 'assemblyai',
				status: 'healthy'
			},
			selectedProvider: 'deepgram',
			status: 'fallback'
		}
	]);
	expect(inputs).toEqual([
		{
			mode: 'failure',
			provider: 'deepgram',
			sessionId: 'stt-provider-sim-1000'
		},
		{
			mode: 'failure',
			provider: 'deepgram',
			sessionId: 'stt-provider-sim-1000'
		}
	]);
});

test('createVoiceIOProviderFailureSimulator emits recovery events', async () => {
	const events: Array<Record<string, unknown>> = [];
	const simulator = createVoiceIOProviderFailureSimulator({
		kind: 'tts',
		now: () => 2000,
		onProviderEvent: (event) => {
			events.push(event);
		},
		providers: ['elevenlabs', 'openai'],
		recoveryElapsedMs: 14
	});

	await expect(simulator.run('elevenlabs', 'recovery')).resolves.toMatchObject({
		mode: 'recovery',
		provider: 'elevenlabs',
		sessionId: 'tts-provider-sim-2000',
		status: 'simulated'
	});
	expect(events).toMatchObject([
		{
			attempt: 0,
			elapsedMs: 14,
			kind: 'tts',
			operation: 'open',
			provider: 'elevenlabs',
			providerHealth: {
				consecutiveFailures: 0,
				provider: 'elevenlabs',
				status: 'healthy'
			},
			selectedProvider: 'elevenlabs',
			status: 'success'
		}
	]);
});
