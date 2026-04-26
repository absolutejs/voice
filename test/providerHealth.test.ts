import { expect, test } from 'bun:test';
import {
	createVoiceMemoryTraceEventStore,
	createVoiceTraceEvent,
	renderVoiceProviderHealthHTML,
	summarizeVoiceProviderHealth
} from '../src';

test('summarizeVoiceProviderHealth reports suppression and recovery status', async () => {
	const events = [
		createVoiceTraceEvent({
			at: 1_000,
			payload: {
				error: 'OpenAI voice assistant model failed: HTTP 429',
				fallbackProvider: 'anthropic',
				provider: 'openai',
				providerHealth: {
					consecutiveFailures: 1,
					provider: 'openai',
					status: 'suppressed',
					suppressedUntil: 121_000
				},
				providerStatus: 'error',
				rateLimited: true,
				selectedProvider: 'openai',
				suppressionRemainingMs: 120_000,
				suppressedUntil: 121_000
			},
			sessionId: 'session-provider',
			type: 'session.error'
		}),
		createVoiceTraceEvent({
			at: 1_010,
			payload: {
				elapsedMs: 10,
				fallbackProvider: 'anthropic',
				provider: 'anthropic',
				providerHealth: {
					consecutiveFailures: 0,
					provider: 'anthropic',
					status: 'healthy'
				},
				providerStatus: 'fallback',
				recovered: true,
				selectedProvider: 'openai'
			},
			sessionId: 'session-provider',
			type: 'session.error'
		})
	];

	expect(
		await summarizeVoiceProviderHealth({
			events,
			now: 2_000,
			providers: ['openai', 'anthropic', 'gemini']
		})
	).toMatchObject([
		{
			errorCount: 1,
			fallbackCount: 1,
			provider: 'openai',
			rateLimited: true,
			status: 'suppressed',
			suppressionRemainingMs: 119_000
		},
		{
			averageElapsedMs: 10,
			provider: 'anthropic',
			recommended: true,
			runCount: 1,
			status: 'healthy'
		},
		{
			provider: 'gemini',
			status: 'idle'
		}
	]);

	expect(
		await summarizeVoiceProviderHealth({
			events,
			now: 122_000,
			providers: ['openai', 'anthropic']
		})
	).toMatchObject([
		{
			provider: 'openai',
			status: 'recoverable',
			suppressionRemainingMs: undefined
		},
		{
			provider: 'anthropic',
			status: 'healthy'
		}
	]);
});

test('summarizeVoiceProviderHealth clears degraded status after newer success', async () => {
	const store = createVoiceMemoryTraceEventStore();
	await store.append(
		createVoiceTraceEvent({
			at: 1_000,
			payload: {
				error: 'Gemini voice assistant model failed: HTTP 500',
				provider: 'gemini',
				providerStatus: 'error',
				selectedProvider: 'gemini'
			},
			sessionId: 'session-provider',
			type: 'session.error'
		})
	);
	await store.append(
		createVoiceTraceEvent({
			at: 2_000,
			payload: {
				elapsedMs: 20,
				provider: 'gemini',
				providerStatus: 'success',
				selectedProvider: 'gemini'
			},
			sessionId: 'session-provider',
			type: 'session.error'
		})
	);

	expect(
		await summarizeVoiceProviderHealth({
			providers: ['gemini'],
			store
		})
	).toMatchObject([
		{
			errorCount: 1,
			lastError: undefined,
			provider: 'gemini',
			rateLimited: false,
			runCount: 1,
			status: 'healthy'
		}
	]);
});

test('renderVoiceProviderHealthHTML renders portable provider cards', () => {
	expect(
		renderVoiceProviderHealthHTML([
			{
				errorCount: 1,
				fallbackCount: 1,
				lastError: 'HTTP 429',
				provider: 'openai',
				rateLimited: true,
				recommended: false,
				runCount: 0,
				status: 'suppressed',
				suppressionRemainingMs: 60_000
			}
		])
	).toContain('Temporarily suppressed for 60s.');
});
