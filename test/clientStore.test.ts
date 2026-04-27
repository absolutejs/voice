import { expect, test } from 'bun:test';
import { serverMessageToAction } from '../src/client/actions';
import { createVoiceAppKitStatusStore } from '../src/client/appKitStatus';
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
