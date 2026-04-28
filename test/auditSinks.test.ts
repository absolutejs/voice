import { expect, test } from 'bun:test';
import {
	createVoiceAuditEvent,
	createVoiceAuditHTTPSink,
	createVoiceAuditSinkDeliveryRecord,
	createVoiceAuditSinkDeliveryWorker,
	createVoiceAuditSinkStore,
	createVoiceMemoryAuditEventStore,
	createVoiceMemoryAuditSinkDeliveryStore,
	deliverVoiceAuditEventsToSinks,
	summarizeVoiceAuditSinkDeliveries,
	type VoiceRedisTaskLeaseCoordinator
} from '../src';

const createLeaseCoordinator = (): VoiceRedisTaskLeaseCoordinator => ({
	claim: async () => true,
	get: async () => null,
	release: async () => true,
	renew: async () => true
});

test('deliverVoiceAuditEventsToSinks redacts audit evidence by default', async () => {
	const delivered: unknown[] = [];
	const event = createVoiceAuditEvent({
		action: 'provider.call',
		metadata: {
			email: 'alex@example.com',
			phone: '415-555-1212'
		},
		payload: {
			apiKey: 'secret-key',
			message: 'Call alex@example.com at 415-555-1212'
		},
		type: 'provider.call'
	});

	const result = await deliverVoiceAuditEventsToSinks({
		events: [event],
		sinks: [
			{
				deliver: ({ events }) => {
					delivered.push(events);
					return {
						attempts: 1,
						eventCount: events.length,
						status: 'delivered'
					};
				},
				id: 'warehouse'
			}
		]
	});

	expect(result.status).toBe('delivered');
	const body = JSON.stringify(delivered);
	expect(body).not.toContain('alex@example.com');
	expect(body).not.toContain('415-555-1212');
	expect(body).not.toContain('secret-key');
	expect(body).toContain('[redacted]');
});

test('createVoiceAuditHTTPSink posts signed audit envelopes', async () => {
	const requests: Array<{ body: string; headers: Headers; method: string }> = [];
	const event = createVoiceAuditEvent({
		action: 'operator.review',
		type: 'operator.action'
	});

	const result = await deliverVoiceAuditEventsToSinks({
		events: [event],
		redact: false,
		sinks: [
			createVoiceAuditHTTPSink({
				fetch: async (url, init) => {
					expect(String(url)).toBe('https://example.com/audit');
					requests.push({
						body: String(init?.body),
						headers: new Headers(init?.headers),
						method: String(init?.method)
					});
					return new Response(JSON.stringify({ ok: true }), {
						headers: { 'content-type': 'application/json' },
						status: 200
					});
				},
				id: 'audit-http',
				signingSecret: 'test-secret',
				url: 'https://example.com/audit'
			})
		]
	});

	expect(result.status).toBe('delivered');
	expect(requests).toHaveLength(1);
	expect(requests[0].method).toBe('POST');
	expect(requests[0].headers.get('x-absolutejs-timestamp')).toBeTruthy();
	expect(requests[0].headers.get('x-absolutejs-signature')).toStartWith(
		'sha256='
	);
	expect(JSON.parse(requests[0].body)).toMatchObject({
		eventCount: 1,
		source: 'absolutejs-voice'
	});
});

test('createVoiceAuditSinkStore can queue delivery records for workers', async () => {
	const store = createVoiceMemoryAuditEventStore();
	const deliveryQueue = createVoiceMemoryAuditSinkDeliveryStore();
	const audit = createVoiceAuditSinkStore({
		deliveryQueue,
		sinks: [],
		store
	});

	const stored = await audit.append({
		action: 'provider.call',
		type: 'provider.call'
	});

	expect(await store.get(stored.id)).toBeTruthy();
	const deliveries = await deliveryQueue.list();
	expect(deliveries).toHaveLength(1);
	expect(deliveries[0].deliveryStatus).toBe('pending');
	expect(deliveries[0].events[0].id).toBe(stored.id);
});

test('createVoiceAuditSinkDeliveryWorker retries queued audit deliveries', async () => {
	const deliveries = createVoiceMemoryAuditSinkDeliveryStore();
	const event = createVoiceAuditEvent({
		action: 'tool.call',
		type: 'tool.call'
	});
	const delivery = createVoiceAuditSinkDeliveryRecord({
		events: [event]
	});
	await deliveries.set(delivery.id, delivery);

	const worker = createVoiceAuditSinkDeliveryWorker({
		deliveries,
		leases: createLeaseCoordinator(),
		sinks: [
			{
				deliver: ({ events }) => ({
					attempts: 1,
					deliveredAt: Date.now(),
					eventCount: events.length,
					status: 'delivered'
				}),
				id: 'warehouse'
			}
		],
		workerId: 'worker-1'
	});

	const result = await worker.drain();
	const updated = await deliveries.get(delivery.id);
	const summary = await summarizeVoiceAuditSinkDeliveries(await deliveries.list());

	expect(result).toMatchObject({
		attempted: 1,
		delivered: 1,
		failed: 0
	});
	expect(updated?.deliveryStatus).toBe('delivered');
	expect(summary.delivered).toBe(1);
});
