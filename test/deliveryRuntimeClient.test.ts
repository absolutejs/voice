import { expect, test } from 'bun:test';
import {
	createVoiceDeliveryRuntimeStore,
	createVoiceDeliveryRuntimeViewModel,
	defineVoiceDeliveryRuntimeElement,
	getVoiceDeliveryRuntimeCSS,
	mountVoiceDeliveryRuntime,
	renderVoiceDeliveryRuntimeHTML
} from '../src/client';
import type { VoiceDeliveryRuntimeReport } from '../src';

const report: VoiceDeliveryRuntimeReport = {
	checkedAt: 123,
	isRunning: true,
	summary: {
		audit: {
			deadLettered: 0,
			delivered: 2,
			failed: 0,
			pending: 1,
			retryEligible: 0,
			skipped: 0,
			total: 3
		},
		trace: {
			deadLettered: 1,
			delivered: 1,
			failed: 0,
			pending: 0,
			retryEligible: 0,
			skipped: 0,
			total: 2
		}
	}
};

test('createVoiceDeliveryRuntimeStore fetches runtime status snapshots', async () => {
	const store = createVoiceDeliveryRuntimeStore('/runtime', {
		fetch: async (url) => {
			expect(url).toBe('/runtime');
			return Response.json(report);
		}
	});

	const fetched = await store.refresh();
	expect(fetched).toEqual(report);
	expect(store.getSnapshot()).toMatchObject({
		error: null,
		isLoading: false,
		report
	});
	store.close();
});

test('delivery runtime widget renders worker health', () => {
	const snapshot = {
		actionError: null,
		actionStatus: 'idle' as const,
		error: null,
		isLoading: false,
		report,
		updatedAt: 456
	};
	const model = createVoiceDeliveryRuntimeViewModel(snapshot);
	expect(model.label).toBe('Running');
	expect(model.status).toBe('warn');
	expect(model.surfaces[0]).toMatchObject({
		detail: '2/3 delivered, 1 pending',
		status: 'pass'
	});
	expect(model.surfaces[1]).toMatchObject({
		deadLettered: 1,
		status: 'warn'
	});
	expect(renderVoiceDeliveryRuntimeHTML(snapshot)).toContain(
		'Voice Delivery Runtime'
	);
	expect(getVoiceDeliveryRuntimeCSS()).toContain(
		'absolute-voice-delivery-runtime'
	);
});

test('mountVoiceDeliveryRuntime updates an element from the store', async () => {
	const element = { innerHTML: '' } as Element & { innerHTML: string };
	const mounted = mountVoiceDeliveryRuntime(element, '/runtime', {
		fetch: async () => Response.json(report)
	});

	await mounted.refresh();
	expect(element.innerHTML).toContain('Running');
	expect(element.innerHTML).toContain('Trace delivery');
	mounted.close();
});

test('delivery runtime store runs operator actions', async () => {
	const calls: Array<{ method?: string; url: string }> = [];
	const store = createVoiceDeliveryRuntimeStore('/runtime', {
		fetch: async (url, init) => {
			calls.push({ method: init?.method, url: String(url) });
			if (String(url).endsWith('/tick')) {
				return Response.json({ result: { audit: { delivered: 1 } } });
			}
			if (String(url).endsWith('/requeue-dead-letters')) {
				return Response.json({ result: { audit: 1, trace: 0, total: 1 } });
			}
			return Response.json(report);
		}
	});

	await store.tick();
	await store.requeueDeadLetters();

	expect(calls.map((call) => call.url)).toContain('/runtime/tick');
	expect(calls.map((call) => call.url)).toContain(
		'/runtime/requeue-dead-letters'
	);
	expect(store.getSnapshot().lastAction?.action).toBe('requeue-dead-letters');
	store.close();
});

test('defineVoiceDeliveryRuntimeElement is a no-op outside the browser', () => {
	expect(defineVoiceDeliveryRuntimeElement()).toBeUndefined();
});
