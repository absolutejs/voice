import { expect, test } from 'bun:test';
import { serverMessageToAction } from '../src/client/actions';
import { createVoiceAppKitStatusStore } from '../src/client/appKitStatus';
import {
	createVoiceOpsStatusViewModel,
	renderVoiceOpsStatusHTML
} from '../src/client/opsStatusWidget';
import { createVoiceProviderStatusStore } from '../src/client/providerStatus';
import { createVoiceProviderCapabilitiesStore } from '../src/client/providerCapabilities';
import {
	createVoiceProviderCapabilitiesViewModel,
	renderVoiceProviderCapabilitiesHTML
} from '../src/client/providerCapabilitiesWidget';
import {
	createVoiceProviderStatusViewModel,
	renderVoiceProviderStatusHTML
} from '../src/client/providerStatusWidget';
import { createVoiceProviderSimulationControlsStore } from '../src/client/providerSimulationControls';
import {
	createVoiceProviderSimulationControlsViewModel,
	renderVoiceProviderSimulationControlsHTML
} from '../src/client/providerSimulationControlsWidget';
import { createVoiceRoutingStatusStore } from '../src/client/routingStatus';
import { createVoiceTurnQualityStore } from '../src/client/turnQuality';
import {
	createVoiceRoutingStatusViewModel,
	renderVoiceRoutingStatusHTML
} from '../src/client/routingStatusWidget';
import {
	createVoiceTurnQualityViewModel,
	renderVoiceTurnQualityHTML
} from '../src/client/turnQualityWidget';
import { createVoiceWorkflowStatusStore } from '../src/client/workflowStatus';
import { createVoiceStreamStore } from '../src/client/store';

test('voice client store tracks call lifecycle server messages', () => {
	const store = createVoiceStreamStore();
	const start = serverMessageToAction({
		event: {
			at: 100,
			type: 'start'
		},
		sessionId: 'session-client-lifecycle',
		type: 'call_lifecycle'
	});
	const transfer = serverMessageToAction({
		event: {
			at: 150,
			reason: 'caller-requested-transfer',
			target: 'billing',
			type: 'transfer'
		},
		sessionId: 'session-client-lifecycle',
		type: 'call_lifecycle'
	});
	const end = serverMessageToAction({
		event: {
			at: 180,
			disposition: 'transferred',
			reason: 'caller-requested-transfer',
			target: 'billing',
			type: 'end'
		},
		sessionId: 'session-client-lifecycle',
		type: 'call_lifecycle'
	});

	store.dispatch(start);
	store.dispatch(transfer);
	store.dispatch(end);

	expect(store.getSnapshot().call).toMatchObject({
		disposition: 'transferred',
		endedAt: 180,
		lastEventAt: 180,
		startedAt: 100
	});
	expect(store.getSnapshot().call?.events.map((event) => event.type)).toEqual([
		'start',
		'transfer',
		'end'
	]);
});

test('voice workflow status store fetches scenario eval reports', async () => {
	const store = createVoiceWorkflowStatusStore('/evals/scenarios/json', {
		fetch: async () =>
			new Response(
				JSON.stringify({
					checkedAt: 100,
					failed: 0,
					passed: 1,
					scenarios: [
						{
							failed: 0,
							id: 'support-triage',
							issues: [],
							label: 'Support triage',
							matchedSessions: 1,
							passed: 1,
							sessions: [],
							status: 'pass'
						}
					],
					status: 'pass',
					total: 1
				})
			)
	});

	const report = await store.refresh();

	expect(report?.status).toBe('pass');
	expect(store.getSnapshot()).toMatchObject({
		error: null,
		isLoading: false,
		report: {
			total: 1
		}
	});
	store.close();
});

test('voice ops status widget renders app-kit readiness', () => {
	const snapshot = {
		error: null,
		isLoading: false,
		report: {
			checkedAt: 100,
			failed: 0,
			links: [{ href: '/ops-console', label: 'Ops Console' }],
			passed: 3,
			status: 'pass' as const,
			surfaces: {
				handoffs: { failed: 0, status: 'pass' as const, total: 0 },
				providers: { degraded: 0, status: 'pass' as const, total: 2 },
				workflows: {
					failed: 0,
					source: 'fixtures' as const,
					status: 'pass' as const,
					total: 1
				}
			},
			total: 3
		},
		updatedAt: 110
	};
	const model = createVoiceOpsStatusViewModel(snapshot);
	const html = renderVoiceOpsStatusHTML(snapshot);

	expect(model.label).toBe('Passing');
	expect(model.surfaces.map((surface) => surface.label)).toEqual([
		'Handoffs',
		'Providers',
		'Workflows'
	]);
	expect(html).toContain('Voice Ops Status');
	expect(html).toContain('1 passing from fixtures');
	expect(html).toContain('/ops-console');
});

test('voice app kit status store fetches integrated status reports', async () => {
	const store = createVoiceAppKitStatusStore('/app-kit/status', {
		fetch: async () =>
			new Response(
				JSON.stringify({
					checkedAt: 100,
					failed: 0,
					links: [],
					passed: 3,
					status: 'pass',
					surfaces: {
						providers: { degraded: 0, status: 'pass', total: 2 },
						quality: { status: 'pass' },
						workflows: { failed: 0, status: 'pass', total: 1 }
					},
					total: 3
				})
			)
	});

	const report = await store.refresh();

	expect(report?.status).toBe('pass');
	expect(store.getSnapshot()).toMatchObject({
		error: null,
		isLoading: false,
		report: {
			passed: 3,
			status: 'pass'
		}
	});
	store.close();
});

test('voice routing status store fetches latest provider decision', async () => {
	const store = createVoiceRoutingStatusStore('/api/routing/latest', {
		fetch: async () =>
			new Response(
				JSON.stringify({
					at: 100,
					fallbackProvider: 'assemblyai',
					kind: 'stt',
					latencyBudgetMs: 6000,
					provider: 'assemblyai',
					routing: 'balanced',
					selectedProvider: 'deepgram',
					sessionId: 'session-1',
					status: 'fallback',
					timedOut: false
				})
			)
	});

	const decision = await store.refresh();

	expect(decision).toMatchObject({
		fallbackProvider: 'assemblyai',
		kind: 'stt',
		provider: 'assemblyai',
		status: 'fallback'
	});
	expect(store.getSnapshot()).toMatchObject({
		decision: {
			selectedProvider: 'deepgram'
		},
		error: null,
		isLoading: false
	});
	store.close();
});

test('voice routing status widget renders latest provider decision', () => {
	const snapshot = {
		decision: {
			at: 100,
			fallbackProvider: 'assemblyai',
			kind: 'stt' as const,
			latencyBudgetMs: 6000,
			provider: 'assemblyai',
			routing: 'balanced',
			selectedProvider: 'deepgram',
			sessionId: 'session-1',
			status: 'fallback',
			timedOut: false
		},
		error: null,
		isLoading: false,
		updatedAt: 110
	};
	const model = createVoiceRoutingStatusViewModel(snapshot);
	const html = renderVoiceRoutingStatusHTML(snapshot);

	expect(model.label).toBe('STT fallback');
	expect(model.rows.map((row) => row.label)).toContain('Selected');
	expect(html).toContain('Voice Routing');
	expect(html).toContain('assemblyai');
	expect(html).toContain('6000ms');
});

test('voice provider status store fetches provider health summaries', async () => {
	const store = createVoiceProviderStatusStore('/api/provider-status', {
		fetch: async () =>
			new Response(
				JSON.stringify([
					{
						averageElapsedMs: 420,
						errorCount: 0,
						fallbackCount: 2,
						provider: 'deepgram',
						rateLimited: false,
						recommended: true,
						runCount: 8,
						status: 'healthy',
						timeoutCount: 0
					}
				])
			)
	});

	const providers = await store.refresh();

	expect(providers[0]).toMatchObject({
		provider: 'deepgram',
		recommended: true,
		status: 'healthy'
	});
	expect(store.getSnapshot()).toMatchObject({
		error: null,
		isLoading: false,
		providers: [
			{
				averageElapsedMs: 420,
				fallbackCount: 2
			}
		]
	});
	store.close();
});

test('voice provider status widget renders fallback and suppression state', () => {
	const snapshot = {
		error: null,
		isLoading: false,
		providers: [
			{
				averageElapsedMs: 420,
				errorCount: 0,
				fallbackCount: 2,
				provider: 'deepgram',
				rateLimited: false,
				recommended: true,
				runCount: 8,
				status: 'healthy' as const,
				timeoutCount: 0
			},
			{
				errorCount: 3,
				fallbackCount: 0,
				lastError: 'timeout',
				provider: 'assemblyai',
				rateLimited: false,
				recommended: false,
				runCount: 1,
				status: 'suppressed' as const,
				suppressionRemainingMs: 12_000,
				timeoutCount: 3
			}
		],
		updatedAt: 110
	};
	const model = createVoiceProviderStatusViewModel(snapshot);
	const html = renderVoiceProviderStatusHTML(snapshot);

	expect(model.label).toBe('1 needs attention');
	expect(model.providers[0]?.label).toBe('Deepgram recommended');
	expect(model.providers[1]?.detail).toBe('Suppressed for 12s after timeout.');
	expect(html).toContain('Voice Providers');
	expect(html).toContain('Deepgram recommended');
	expect(html).toContain('timeout');
});

test('voice provider capabilities store and widget render selected provider coverage', async () => {
	const store = createVoiceProviderCapabilitiesStore('/api/provider-capabilities', {
		fetch: async () =>
			new Response(
				JSON.stringify({
					capabilities: [
						{
							configured: true,
							features: ['tool calling', 'fallback routing'],
							health: {
								errorCount: 0,
								fallbackCount: 0,
								provider: 'openai',
								rateLimited: false,
								recommended: true,
								runCount: 3,
								status: 'healthy',
								timeoutCount: 0
							},
							kind: 'llm',
							model: 'gpt-4.1-mini',
							provider: 'openai',
							selected: true,
							status: 'selected'
						},
						{
							configured: true,
							features: ['realtime STT'],
							kind: 'stt',
							model: 'flux-general-en',
							provider: 'deepgram',
							selected: true,
							status: 'selected'
						}
					],
					checkedAt: 100,
					configured: 2,
					selected: 2,
					total: 2,
					unconfigured: 0
				})
			)
	});

	await store.refresh();
	const snapshot = store.getSnapshot();
	const model = createVoiceProviderCapabilitiesViewModel(snapshot);
	const html = renderVoiceProviderCapabilitiesHTML(snapshot);

	expect(model.label).toBe('2 selected');
	expect(model.capabilities[0]?.label).toBe('Openai LLM');
	expect(model.capabilities[0]?.detail).toBe(
		'Selected LLM provider for new sessions.'
	);
	expect(html).toContain('Provider Capabilities');
	expect(html).toContain('gpt-4.1-mini');
	expect(html).toContain('tool calling, fallback routing');
});

test('voice turn quality store and widget render fallback diagnostics', async () => {
	const store = createVoiceTurnQualityStore('/api/turn-quality', {
		fetch: async () =>
			new Response(
				JSON.stringify({
					checkedAt: 100,
					failed: 0,
					sessions: 1,
					status: 'warn',
					total: 1,
					turns: [
						{
							averageConfidence: 0.93,
							committedAt: 100,
							correctionChanged: false,
							fallbackSelectionReason: 'confidence-margin',
							fallbackUsed: true,
							finalTranscriptCount: 1,
							partialTranscriptCount: 0,
							selectedTranscriptCount: 1,
							sessionId: 'session-1',
							source: 'fallback',
							status: 'warn',
							text: 'book a demo',
							turnId: 'turn-1'
						}
					],
					warnings: 1
				})
			)
	});

	await store.refresh();
	const snapshot = store.getSnapshot();
	const model = createVoiceTurnQualityViewModel(snapshot);
	const html = renderVoiceTurnQualityHTML(snapshot);

	expect(model.label).toBe('1 warnings');
	expect(model.turns[0]?.detail).toBe(
		'Fallback STT selected by confidence-margin.'
	);
	expect(html).toContain('book a demo');
	expect(html).toContain('93%');
});

test('voice provider simulation controls posts failure and recovery requests', async () => {
	const requests: Array<{ method: string; url: string }> = [];
	const store = createVoiceProviderSimulationControlsStore({
		fetch: async (input, init) => {
			requests.push({
				method: init?.method ?? 'GET',
				url: String(input)
			});
			return new Response(
				JSON.stringify({
					mode: String(input).includes('/recovery') ? 'recovery' : 'failure',
					provider: 'deepgram',
					sessionId: 'sim-1',
					status: 'simulated'
				})
			);
		},
		kind: 'stt',
		providers: [{ provider: 'deepgram' }, { provider: 'assemblyai' }]
	});

	await store.run('deepgram', 'failure');
	await store.run('deepgram', 'recovery');

	expect(requests).toEqual([
		{
			method: 'POST',
			url: '/api/stt-simulate/failure?provider=deepgram'
		},
		{
			method: 'POST',
			url: '/api/stt-simulate/recovery?provider=deepgram'
		}
	]);
	expect(store.getSnapshot()).toMatchObject({
		error: null,
		isRunning: false,
		lastResult: {
			mode: 'recovery',
			provider: 'deepgram'
		}
	});
	store.close();
});

test('voice provider simulation controls widget renders configured actions', () => {
	const snapshot = {
		error: null,
		isRunning: false,
		lastResult: null,
		mode: null,
		provider: null
	};
	const options = {
		failureProviders: ['deepgram'] as const,
		fallbackRequiredProvider: 'assemblyai',
		kind: 'stt',
		providers: [{ provider: 'deepgram' }, { provider: 'assemblyai' }]
	};
	const model = createVoiceProviderSimulationControlsViewModel(
		snapshot,
		options
	);
	const html = renderVoiceProviderSimulationControlsHTML(snapshot, options);

	expect(model.canSimulateFailure).toBe(true);
	expect(model.label).toBe('2 configured');
	expect(html).toContain('Simulate deepgram STT failure');
	expect(html).toContain('Mark assemblyai recovered');
});
