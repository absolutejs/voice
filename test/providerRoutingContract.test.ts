import { expect, test } from 'bun:test';
import {
	evaluateVoiceProviderRoutingContractEvidence,
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

test('evaluateVoiceProviderRoutingContractEvidence accepts complete routing proof', () => {
	const report = evaluateVoiceProviderRoutingContractEvidence(
		[
			{
				contractId: 'openai-anthropic-fallback',
				events: [
					{
						at: 100,
						fallbackProvider: 'anthropic',
						kind: 'llm',
						provider: 'openai',
						selectedProvider: 'openai',
						sessionId: 'call-1',
						status: 'error',
						timedOut: true
					},
					{
						at: 110,
						kind: 'llm',
						provider: 'anthropic',
						selectedProvider: 'openai',
						sessionId: 'call-1',
						status: 'fallback',
						timedOut: false
					}
				],
				issues: [],
				pass: true,
				scenarioId: 'provider-routing-contract'
			}
		],
		{
			maxFailed: 0,
			maxIssues: 0,
			minContracts: 1,
			minEvents: 2,
			requiredContractIds: ['openai-anthropic-fallback'],
			requiredFallbackProviders: ['anthropic'],
			requiredKinds: ['llm'],
			requiredProviders: ['anthropic', 'openai'],
			requiredScenarioIds: ['provider-routing-contract'],
			requiredSelectedProviders: ['openai'],
			requiredStatuses: ['error', 'fallback']
		}
	);

	expect(report.ok).toBe(true);
	expect(report.events).toBe(2);
	expect(report.providers).toEqual(['anthropic', 'openai']);
});

test('evaluateVoiceProviderRoutingContractEvidence reports missing routing proof', () => {
	const report = evaluateVoiceProviderRoutingContractEvidence(
		[
			{
				contractId: 'openai-success',
				events: [
					{
						at: 100,
						kind: 'llm',
						provider: 'openai',
						selectedProvider: 'openai',
						sessionId: 'call-1',
						status: 'success',
						timedOut: false
					}
				],
				issues: [{ code: 'provider_routing.expected_event_missing', message: 'Missing fallback.' }],
				pass: false
			}
		],
		{
			maxFailed: 0,
			maxIssues: 0,
			minEvents: 2,
			requiredFallbackProviders: ['anthropic'],
			requiredStatuses: ['fallback']
		}
	);

	expect(report.ok).toBe(false);
	expect(report.issues).toEqual(
		expect.arrayContaining([
			'Expected at most 0 failing provider routing contract(s), found 1.',
			'Expected at most 0 provider routing contract issue(s), found 1.',
			'Expected at least 2 provider routing event(s), found 1.',
			'Missing fallback provider: anthropic.',
			'Missing provider routing status: fallback.'
		])
	);
});
