import { expect, test } from 'bun:test';
import { serverMessageToAction } from '../src/client/actions';
import { createVoiceAppKitStatusStore } from '../src/client/appKitStatus';
import {
	createVoiceOpsStatusViewModel,
	renderVoiceOpsStatusHTML
} from '../src/client/opsStatusWidget';
import { createVoiceRoutingStatusStore } from '../src/client/routingStatus';
import {
	createVoiceRoutingStatusViewModel,
	renderVoiceRoutingStatusHTML
} from '../src/client/routingStatusWidget';
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
