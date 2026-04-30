import { expect, test } from 'bun:test';
import {
	createVoiceOpsActionCenterActions,
	createVoiceOpsActionCenterStore,
	createVoiceOpsActionCenterViewModel,
	createVoiceOpsActionHistoryStore,
	mountVoiceOpsActionCenter,
	mountVoiceOpsActionHistory,
	renderVoiceOpsActionCenterHTML
} from '../src/client';

test('createVoiceOpsActionCenterActions builds production operator actions', () => {
	const actions = createVoiceOpsActionCenterActions({
		providers: ['deepgram']
	});

	expect(actions.map((action) => action.id)).toEqual(
		expect.arrayContaining([
			'production-readiness',
			'delivery-runtime.tick',
			'delivery-runtime.requeue-dead-letters',
			'turn-latency.proof',
			'provider.deepgram.failure',
			'provider.deepgram.recovery'
		])
	);
	expect(actions.find((action) => action.id === 'provider.deepgram.failure')?.path).toBe(
		'/api/stt-simulate/failure?provider=deepgram'
	);
});

test('createVoiceOpsActionCenterStore runs configured actions', async () => {
	const calls: Array<{ method?: string; path: string }> = [];
	const store = createVoiceOpsActionCenterStore({
		actions: [
			{
				id: 'proof',
				label: 'Run proof',
				method: 'POST',
				path: '/proof'
			}
		],
		auditPath: false,
		fetch: async (path, init) => {
			calls.push({ method: init?.method, path: String(path) });
			return Response.json({ ok: true });
		}
	});

	const result = await store.run('proof');

	expect(result?.status).toBe(200);
	expect(calls).toEqual([{ method: 'POST', path: '/proof' }]);
	expect(store.getSnapshot().lastResult?.actionId).toBe('proof');
	store.close();
});

test('voice ops action center widget renders actions', () => {
	const snapshot = {
		actions: [
			{
				description: 'Run a proof',
				id: 'proof',
				label: 'Run proof',
				path: '/proof'
			}
		],
		error: null,
		isRunning: false
	};
	const model = createVoiceOpsActionCenterViewModel(snapshot);

	expect(model.label).toBe('Ready');
	expect(renderVoiceOpsActionCenterHTML(snapshot)).toContain('Run proof');
});

test('mountVoiceOpsActionCenter attaches to lightweight elements', () => {
	const element = { innerHTML: '' } as Element & { innerHTML: string };
	const mounted = mountVoiceOpsActionCenter(element, {
		auditPath: false,
		actions: [
			{
				id: 'proof',
				label: 'Run proof',
				path: '/proof'
			}
		]
	});

	expect(element.innerHTML).toContain('Run proof');
	mounted.close();
});

test('createVoiceOpsActionHistoryStore fetches recent operator actions', async () => {
	const store = createVoiceOpsActionHistoryStore('/history', {
		fetch: async () =>
			Response.json({
				checkedAt: 123,
				entries: [],
				failed: 0,
				passed: 0,
				total: 0
			})
	});

	await store.refresh();

	expect(store.getSnapshot().report?.total).toBe(0);
	store.close();
});

test('mountVoiceOpsActionHistory renders lightweight elements', async () => {
	const element = { innerHTML: '' } as Element & { innerHTML: string };
	const mounted = mountVoiceOpsActionHistory(element, '/history', {
		fetch: async () =>
			Response.json({
				checkedAt: 123,
				entries: [
					{
						actionId: 'delivery-runtime.tick',
						at: 123,
						eventId: 'event-1',
						ok: true,
						status: 200
					}
				],
				failed: 0,
				passed: 1,
				total: 1
			})
	});

	await mounted.refresh();

	expect(element.innerHTML).toContain('delivery-runtime.tick');
	mounted.close();
});
