import { expect, test } from 'bun:test';
import {
	createVoiceMemoryTraceEventStore,
	runVoiceProviderRoutingContract
} from '../src';

test('runVoiceProviderRoutingContract certifies fallback routing events', async () => {
	const report = await runVoiceProviderRoutingContract({
		contract: {
			expect: [
				{
					fallbackProvider: 'anthropic',
					kind: 'llm',
					provider: 'openai',
					selectedProvider: 'openai',
					status: 'error'
				},
				{
					kind: 'llm',
					provider: 'anthropic',
					selectedProvider: 'openai',
					status: 'fallback'
				}
			],
			id: 'openai-anthropic-fallback'
		},
		events: [
			{
				at: 100,
				payload: {
					fallbackProvider: 'anthropic',
					provider: 'openai',
					providerStatus: 'error',
					selectedProvider: 'openai'
				},
				sessionId: 'call-1',
				type: 'session.error'
			},
			{
				at: 110,
				payload: {
					provider: 'anthropic',
					providerStatus: 'fallback',
					selectedProvider: 'openai'
				},
				sessionId: 'call-1',
				type: 'session.error'
			}
		]
	});

	expect(report).toMatchObject({
		contractId: 'openai-anthropic-fallback',
		pass: true
	});
	expect(report.events).toHaveLength(2);
});

test('runVoiceProviderRoutingContract reports missing routing events', async () => {
	const report = await runVoiceProviderRoutingContract({
		contract: {
			expect: [
				{
					kind: 'llm',
					provider: 'gemini',
					selectedProvider: 'openai',
					status: 'fallback'
				}
			],
			id: 'openai-gemini-fallback'
		},
		events: [
			{
				at: 100,
				kind: 'llm',
				provider: 'anthropic',
				selectedProvider: 'openai',
				sessionId: 'call-1',
				status: 'fallback',
				timedOut: false
			}
		]
	});

	expect(report.pass).toBe(false);
	expect(report.issues).toEqual([
		{
			code: 'provider_routing.expected_event_missing',
			message:
				'Expected provider routing event 1: kind=llm, provider=gemini, selectedProvider=openai, status=fallback.'
		}
	]);
});

test('runVoiceProviderRoutingContract can read routing events from a trace store', async () => {
	const store = createVoiceMemoryTraceEventStore();
	await store.append({
		at: 100,
		payload: {
			provider: 'openai',
			providerStatus: 'success',
			selectedProvider: 'openai'
		},
		sessionId: 'call-1',
		type: 'session.error'
	});

	const report = await runVoiceProviderRoutingContract({
		contract: {
			expect: [
				{
					provider: 'openai',
					selectedProvider: 'openai',
					status: 'success'
				}
			],
			id: 'openai-success'
		},
		store
	});

	expect(report.pass).toBe(true);
	expect(report.events[0]?.provider).toBe('openai');
});
