import { expect, test } from 'bun:test';
import {
	createStoredVoiceOpsTask,
	createVoiceOpsTaskProcessorWorker,
	createVoiceOpsTaskProcessorWorkerLoop,
	createVoiceOpsTaskWorker,
	createVoiceCRMActivitySink,
	createStoredVoiceIntegrationEvent,
	createVoiceHelpdeskTicketSink,
	createVoiceIntegrationSinkWorker,
	createVoiceIntegrationSinkWorkerLoop,
	createVoiceMemoryTraceSinkDeliveryStore,
	createVoiceRedisIdempotencyStore,
	createVoiceRedisTelephonyWebhookIdempotencyStore,
	createVoiceRedisTaskLeaseCoordinator,
	createVoiceTraceSinkDeliveryRecord,
	createVoiceTraceSinkDeliveryWorker,
	createVoiceTraceSinkDeliveryWorkerLoop,
	createVoiceTraceEvent,
	createVoiceWebhookDeliveryWorker,
	createVoiceWebhookDeliveryWorkerLoop,
	summarizeVoiceOpsTaskQueue,
	summarizeVoiceIntegrationEvents,
	summarizeVoiceTraceSinkDeliveries
} from '../src';
import type {
	StoredVoiceOpsTask,
	StoredVoiceIntegrationEvent,
	VoiceRedisIdempotencyClient,
	VoiceRedisTaskLeaseClient
} from '../src';

const createFakeRedisClient = (): VoiceRedisTaskLeaseClient & VoiceRedisIdempotencyClient => {
	const values = new Map<string, { expiresAt: number; value: string }>();

	const getRecord = (key: string) => {
		const record = values.get(key);
		if (!record) {
			return null;
		}

		if (record.expiresAt <= Date.now()) {
			values.delete(key);
			return null;
		}

		return record;
	};

	return {
		exists: async (key) => (getRecord(String(key)) ? 1 : 0),
		del: async (...keys) => {
			let deleted = 0;
			for (const key of keys.map(String)) {
				if (values.delete(key)) {
					deleted += 1;
				}
			}
			return deleted;
		},
		get: async (key) => getRecord(String(key))?.value ?? null,
		send: async (command, args) => {
			const normalized = command.toUpperCase();
			if (normalized === 'PTTL') {
				const key = String(args[0]);
				const record = getRecord(key);
				return record ? record.expiresAt - Date.now() : -2;
			}

			if (normalized === 'EVAL') {
				const key = String(args[2]);
				const workerId = String(args[3]);
				const record = getRecord(key);
				if (!record || record.value !== workerId) {
					return 0;
				}

				if (args.length === 4) {
					values.delete(key);
					return 1;
				}

				record.expiresAt = Date.now() + Number(args[4]);
				values.set(key, record);
				return 1;
			}

			throw new Error(`Unsupported fake Redis command: ${command}`);
		},
		set: async (key, value, ...options) => {
			const normalizedKey = String(key);
			const existing = getRecord(normalizedKey);
			if (options.includes('NX') && existing) {
				return null;
			}

			const pxIndex = options.findIndex((option) => option === 'PX');
			const exIndex = options.findIndex((option) => option === 'EX');
			const ttlMs = pxIndex >= 0
				? Number(options[pxIndex + 1])
				: exIndex >= 0
					? Number(options[exIndex + 1]) * 1000
					: 0;
			values.set(normalizedKey, {
				expiresAt: Date.now() + ttlMs,
				value: String(value)
			});
			return 'OK';
		}
	};
};

const createTaskStore = (tasks: Map<string, StoredVoiceOpsTask>) => ({
	get: async (id: string) => tasks.get(id),
	list: async () => [...tasks.values()],
	remove: async (id: string) => {
		tasks.delete(id);
	},
	set: async (id: string, task: StoredVoiceOpsTask) => {
		tasks.set(id, task);
	}
});

test('createVoiceRedisTaskLeaseCoordinator claims, renews, and releases leases', async () => {
	const client = createFakeRedisClient();
	const coordinator = createVoiceRedisTaskLeaseCoordinator({
		client
	});

	expect(
		await coordinator.claim({
			leaseMs: 1_000,
			taskId: 'task-1',
			workerId: 'worker-a'
		})
	).toBe(true);
	expect(
		await coordinator.claim({
			leaseMs: 1_000,
			taskId: 'task-1',
			workerId: 'worker-b'
		})
	).toBe(false);

	const lease = await coordinator.get('task-1');
	expect(lease?.workerId).toBe('worker-a');

	expect(
		await coordinator.renew({
			leaseMs: 2_000,
			taskId: 'task-1',
			workerId: 'worker-a'
		})
	).toBe(true);
	expect(
		await coordinator.release({
			taskId: 'task-1',
			workerId: 'worker-b'
		})
	).toBe(false);
	expect(
		await coordinator.release({
			taskId: 'task-1',
			workerId: 'worker-a'
		})
	).toBe(true);
	expect(await coordinator.get('task-1')).toBeNull();
});

test('createVoiceRedisIdempotencyStore records processed keys', async () => {
	const store = createVoiceRedisIdempotencyStore({
		client: createFakeRedisClient(),
		ttlSeconds: 60
	});

	expect(await store.has('event-1')).toBe(false);
	await store.set('event-1');
	expect(await store.has('event-1')).toBe(true);
	await store.remove('event-1');
	expect(await store.has('event-1')).toBe(false);
});

test('createVoiceRedisTelephonyWebhookIdempotencyStore stores duplicate decisions', async () => {
	const store = createVoiceRedisTelephonyWebhookIdempotencyStore({
		client: createFakeRedisClient(),
		ttlSeconds: 60
	});

	await store.set('twilio:CA123:busy', {
		applied: true,
		createdAt: 100,
		decision: {
			action: 'no-answer',
			confidence: 'high',
			disposition: 'no-answer',
			source: 'sip'
		},
		event: {
			provider: 'twilio',
			sipCode: 486,
			status: 'busy'
		},
		idempotencyKey: 'twilio:CA123:busy',
		routeResult: {
			noAnswer: {}
		},
		sessionId: 'CA123',
		updatedAt: 100
	});

	expect(await store.get('twilio:CA123:busy')).toMatchObject({
		applied: true,
		decision: {
			action: 'no-answer'
		},
		sessionId: 'CA123'
	});
});

test('createVoiceWebhookDeliveryWorker drains pending events with leases and idempotency', async () => {
	const events = new Map<string, StoredVoiceIntegrationEvent>();
	const setEvent = (event: StoredVoiceIntegrationEvent) => {
		events.set(event.id, event);
	};

	setEvent(
		createStoredVoiceIntegrationEvent('event-pending', {
			createdAt: 100,
			deliveryStatus: 'pending',
			payload: {
				reviewId: 'review-1'
			},
			type: 'review.saved'
		})
	);
	setEvent(
		createStoredVoiceIntegrationEvent('event-delivered', {
			createdAt: 50,
			deliveredAt: 50,
			deliveryStatus: 'delivered',
			payload: {
				taskId: 'task-1'
			},
			type: 'task.created'
		})
	);

	const redis = createFakeRedisClient();
	const worker = createVoiceWebhookDeliveryWorker({
		events: {
			get: async (id) => events.get(id),
			list: async () => [...events.values()],
			remove: async (id) => {
				events.delete(id);
			},
			set: async (id, event) => {
				events.set(id, event);
			}
		},
		idempotency: createVoiceRedisIdempotencyStore({
			client: redis,
			ttlSeconds: 120
		}),
		leases: createVoiceRedisTaskLeaseCoordinator({
			client: redis
		}),
		webhook: {
			fetch: async () =>
				new Response(null, {
					status: 200
				}),
			url: 'https://example.test/hooks/voice'
		},
		workerId: 'worker-a'
	});

	const firstPass = await worker.drain();
	const secondPass = await worker.drain();

	expect(firstPass).toEqual({
		alreadyProcessed: 0,
		attempted: 1,
		deadLettered: 0,
		delivered: 1,
		failed: 0,
		skipped: 0
	});
	expect(secondPass).toEqual({
		alreadyProcessed: 0,
		attempted: 0,
		deadLettered: 0,
		delivered: 0,
		failed: 0,
		skipped: 0
	});
	expect(events.get('event-pending')?.deliveryStatus).toBe('delivered');
	expect(events.get('event-delivered')?.deliveryStatus).toBe('delivered');
});

test('createVoiceWebhookDeliveryWorker dead-letters repeated failures', async () => {
	const deadLetters = new Map<string, StoredVoiceIntegrationEvent>();
	const events = new Map<string, StoredVoiceIntegrationEvent>();
	events.set(
		'event-failed',
		createStoredVoiceIntegrationEvent('event-failed', {
			createdAt: 100,
			deliveryAttempts: 2,
			deliveryStatus: 'failed',
			payload: {
				reviewId: 'review-failed'
			},
			type: 'review.saved'
		})
	);

	const redis = createFakeRedisClient();
	const worker = createVoiceWebhookDeliveryWorker({
		deadLetters: {
			get: async (id) => deadLetters.get(id),
			list: async () => [...deadLetters.values()],
			remove: async (id) => {
				deadLetters.delete(id);
			},
			set: async (id, event) => {
				deadLetters.set(id, event);
			}
		},
		events: {
			get: async (id) => events.get(id),
			list: async () => [...events.values()],
			remove: async (id) => {
				events.delete(id);
			},
			set: async (id, event) => {
				events.set(id, event);
			}
		},
		leases: createVoiceRedisTaskLeaseCoordinator({
			client: redis
		}),
		maxFailures: 3,
		webhook: {
			fetch: async () =>
				new Response(null, {
					status: 500
				}),
			retries: 0,
			url: 'https://example.test/hooks/fail'
		},
		workerId: 'worker-a'
	});

	const result = await worker.drain();

	expect(result).toEqual({
		alreadyProcessed: 0,
		attempted: 1,
		deadLettered: 1,
		delivered: 0,
		failed: 1,
		skipped: 0
	});
	expect(deadLetters.get('event-failed')?.deliveryStatus).toBe('failed');
	expect(deadLetters.get('event-failed')?.deliveryAttempts).toBe(3);
});

test('summarizeVoiceIntegrationEvents reports queue metrics including dead letters', async () => {
	const events = [
		createStoredVoiceIntegrationEvent('event-1', {
			createdAt: 100,
			deliveryStatus: 'pending',
			payload: {},
			type: 'review.saved'
		}),
		createStoredVoiceIntegrationEvent('event-2', {
			createdAt: 200,
			deliveryAttempts: 2,
			deliveryStatus: 'failed',
			payload: {},
			type: 'task.created'
		}),
		createStoredVoiceIntegrationEvent('event-3', {
			createdAt: 300,
			deliveryStatus: 'delivered',
			payload: {},
			type: 'task.updated'
		})
	];

	const summary = await summarizeVoiceIntegrationEvents(events, {
		deadLetters: {
			get: async () => undefined,
			list: async () => [events[1]!],
			remove: async () => {},
			set: async () => {}
		}
	});

	expect(summary.total).toBe(3);
	expect(summary.pending).toBe(1);
	expect(summary.failed).toBe(1);
	expect(summary.delivered).toBe(1);
	expect(summary.deadLettered).toBe(1);
	expect(summary.retryEligible).toBe(1);
});

test('createVoiceWebhookDeliveryWorkerLoop exposes manual ticks and lifecycle state', async () => {
	const worker = createVoiceWebhookDeliveryWorker({
		events: {
			get: async () => undefined,
			list: async () => [],
			remove: async () => {},
			set: async () => {}
		},
		leases: createVoiceRedisTaskLeaseCoordinator({
			client: createFakeRedisClient()
		}),
		webhook: {
			fetch: async () =>
				new Response(null, {
					status: 200
				}),
			url: 'https://example.test/hooks/empty'
		},
		workerId: 'worker-loop'
	});
	const loop = createVoiceWebhookDeliveryWorkerLoop({
		pollIntervalMs: 10_000,
		worker
	});

	expect(loop.isRunning()).toBe(false);
	const result = await loop.tick();
	expect(result).toEqual({
		alreadyProcessed: 0,
		attempted: 0,
		deadLettered: 0,
		delivered: 0,
		failed: 0,
		skipped: 0
	});
	loop.start();
	expect(loop.isRunning()).toBe(true);
	loop.stop();
	expect(loop.isRunning()).toBe(false);
});

test('createVoiceIntegrationSinkWorker retries pending sink deliveries and dead-letters exhausted failures', async () => {
	const deadLetters = new Map<string, StoredVoiceIntegrationEvent>();
	const events = new Map<string, StoredVoiceIntegrationEvent>();
	events.set(
		'event-sink-pending',
		createStoredVoiceIntegrationEvent('event-sink-pending', {
			createdAt: 100,
			deliveryStatus: 'delivered',
			payload: {
				reviewId: 'review-1',
				title: 'Pending review'
			},
			type: 'review.saved'
		})
	);
	events.set(
		'event-sink-failed',
		createStoredVoiceIntegrationEvent('event-sink-failed', {
			createdAt: 200,
			deliveryStatus: 'delivered',
			payload: {
				taskId: 'task-1',
				title: 'Failed task'
			},
			sinkDeliveries: {
				helpdesk: {
					attempts: 2,
					error: 'Attempt 2 failed',
					sinkId: 'helpdesk',
					sinkKind: 'helpdesk-ticket',
					status: 'failed'
				}
			},
			type: 'task.created'
		})
	);

	const redis = createFakeRedisClient();
	const worker = createVoiceIntegrationSinkWorker({
		deadLetters: {
			get: async (id) => deadLetters.get(id),
			list: async () => [...deadLetters.values()],
			remove: async (id) => {
				deadLetters.delete(id);
			},
			set: async (id, event) => {
				deadLetters.set(id, event);
			}
		},
		events: {
			get: async (id) => events.get(id),
			list: async () => [...events.values()],
			remove: async (id) => {
				events.delete(id);
			},
			set: async (id, event) => {
				events.set(id, event);
			}
		},
		idempotency: createVoiceRedisIdempotencyStore({
			client: redis,
			ttlSeconds: 120
		}),
		leases: createVoiceRedisTaskLeaseCoordinator({
			client: redis
		}),
		maxFailures: 3,
		sinks: [
			createVoiceHelpdeskTicketSink({
				fetch: async (_url, init) => {
					const body = JSON.parse(String(init?.body ?? '{}'));
					if (body.ticket?.taskId === 'task-1') {
						return new Response(null, {
							status: 500
						});
					}
					return new Response(null, {
						status: 201
					});
				},
				id: 'helpdesk',
				url: 'https://example.test/helpdesk'
			})
		],
		workerId: 'sink-worker'
	});

	const result = await worker.drain();

	expect(result).toEqual({
		alreadyProcessed: 0,
		attempted: 2,
		deadLettered: 1,
		delivered: 1,
		failed: 1,
		skipped: 0
	});
	expect(events.get('event-sink-pending')?.sinkDeliveries?.helpdesk?.status).toBe(
		'delivered'
	);
	expect(deadLetters.get('event-sink-failed')?.sinkDeliveries?.helpdesk?.attempts).toBe(
		3
	);
});

test('createVoiceIntegrationSinkWorkerLoop exposes manual ticks and lifecycle state', async () => {
	const worker = createVoiceIntegrationSinkWorker({
		events: {
			get: async () => undefined,
			list: async () => [],
			remove: async () => {},
			set: async () => {}
		},
		leases: createVoiceRedisTaskLeaseCoordinator({
			client: createFakeRedisClient()
		}),
		sinks: [
			createVoiceCRMActivitySink({
				fetch: async () =>
					new Response(null, {
						status: 202
					}),
				id: 'crm',
				url: 'https://example.test/crm'
			})
		],
		workerId: 'sink-loop'
	});
	const loop = createVoiceIntegrationSinkWorkerLoop({
		pollIntervalMs: 10_000,
		worker
	});

	expect(loop.isRunning()).toBe(false);
	const result = await loop.tick();
	expect(result).toEqual({
		alreadyProcessed: 0,
		attempted: 0,
		deadLettered: 0,
		delivered: 0,
		failed: 0,
		skipped: 0
	});
	loop.start();
	expect(loop.isRunning()).toBe(true);
	loop.stop();
	expect(loop.isRunning()).toBe(false);
});

test('createVoiceTraceSinkDeliveryWorker retries queued trace deliveries and dead-letters failures', async () => {
	const deliveries = createVoiceMemoryTraceSinkDeliveryStore();
	const deadLetters = createVoiceMemoryTraceSinkDeliveryStore();
	const success = createVoiceTraceSinkDeliveryRecord({
		createdAt: 100,
		events: [
			createVoiceTraceEvent({
				at: 100,
				payload: {
					text: 'Email alex@example.com'
				},
				sessionId: 'session-success',
				type: 'turn.assistant'
			})
		],
		id: 'trace-delivery-success'
	});
	const failed = createVoiceTraceSinkDeliveryRecord({
		createdAt: 200,
		deliveryAttempts: 1,
		deliveryStatus: 'failed',
		events: [
			createVoiceTraceEvent({
				at: 200,
				payload: {
					text: 'fail me'
				},
				sessionId: 'session-failed',
				type: 'turn.assistant'
			})
		],
		id: 'trace-delivery-failed'
	});
	await deliveries.set(success.id, success);
	await deliveries.set(failed.id, failed);

	const redis = createFakeRedisClient();
	const deliveredPayloads: string[] = [];
	const worker = createVoiceTraceSinkDeliveryWorker({
		deadLetters,
		deliveries,
		idempotency: createVoiceRedisIdempotencyStore({
			client: redis,
			ttlSeconds: 120
		}),
		leases: createVoiceRedisTaskLeaseCoordinator({
			client: redis
		}),
		maxFailures: 2,
		redact: true,
		sinks: [
			{
				deliver: async ({ events }) => {
					const text = String(events[0]?.payload.text ?? '');
					deliveredPayloads.push(text);
					return {
						attempts: 1,
						error: text.includes('fail') ? 'failed trace sink' : undefined,
						eventCount: events.length,
						status: text.includes('fail') ? 'failed' : 'delivered'
					};
				},
				id: 'warehouse'
			}
		],
		workerId: 'trace-sink-worker'
	});

	const result = await worker.drain();

	expect(result).toEqual({
		alreadyProcessed: 0,
		attempted: 2,
		deadLettered: 1,
		delivered: 1,
		failed: 1,
		skipped: 0
	});
	expect(deliveredPayloads).toEqual(['Email [redacted]', 'fail me']);
	expect((await deliveries.get(success.id))?.deliveryStatus).toBe('delivered');
	expect((await deliveries.get(failed.id))?.deliveryAttempts).toBe(2);
	expect((await deadLetters.get(failed.id))?.deliveryStatus).toBe('failed');
	expect(await summarizeVoiceTraceSinkDeliveries(await deliveries.list(), { deadLetters }))
		.toMatchObject({
			deadLettered: 1,
			delivered: 1,
			failed: 1,
			retryEligible: 1,
			total: 2
		});
});

test('createVoiceTraceSinkDeliveryWorkerLoop exposes manual ticks and lifecycle state', async () => {
	const worker = createVoiceTraceSinkDeliveryWorker({
		deliveries: createVoiceMemoryTraceSinkDeliveryStore(),
		leases: createVoiceRedisTaskLeaseCoordinator({
			client: createFakeRedisClient()
		}),
		sinks: [],
		workerId: 'trace-sink-loop'
	});
	const loop = createVoiceTraceSinkDeliveryWorkerLoop({
		pollIntervalMs: 10_000,
		worker
	});

	expect(loop.isRunning()).toBe(false);
	const result = await loop.tick();
	expect(result).toEqual({
		alreadyProcessed: 0,
		attempted: 0,
		deadLettered: 0,
		delivered: 0,
		failed: 0,
		skipped: 0
	});
	loop.start();
	expect(loop.isRunning()).toBe(true);
	loop.stop();
	expect(loop.isRunning()).toBe(false);
});

test('createVoiceOpsTaskWorker claims, heartbeats, and completes queued tasks', async () => {
	const tasks = new Map([
		[
			'task-older',
			createStoredVoiceOpsTask('task-older', {
				createdAt: 100,
				description: 'Older callback',
				history: [],
				kind: 'callback',
				recommendedAction: 'Call back first',
				status: 'open',
				title: 'Older callback',
				updatedAt: 100
			})
		],
		[
			'task-newer',
			createStoredVoiceOpsTask('task-newer', {
				createdAt: 200,
				description: 'Newer escalation',
				history: [],
				kind: 'escalation',
				recommendedAction: 'Escalate second',
				status: 'open',
				title: 'Newer escalation',
				updatedAt: 200
			})
		]
	]);

	const worker = createVoiceOpsTaskWorker({
		leases: createVoiceRedisTaskLeaseCoordinator({
			client: createFakeRedisClient()
		}),
		tasks: createTaskStore(tasks),
		workerId: 'worker-a'
	});

	const claimed = await worker.claimNext();
	expect(claimed?.id).toBe('task-older');
	expect(claimed?.claimedBy).toBe('worker-a');
	expect(claimed?.status).toBe('in-progress');

	const heartbeated = await worker.heartbeat('task-older', {
		leaseMs: 60_000
	});
	expect(heartbeated.claimExpiresAt).toBeGreaterThan(
		claimed?.claimExpiresAt ?? 0
	);
	expect(heartbeated.history.at(-1)?.type).toBe('heartbeat');

	const completed = await worker.complete('task-older');
	expect(completed.status).toBe('done');
	expect(completed.claimedBy).toBeUndefined();

	const nextClaimed = await worker.claimNext();
	expect(nextClaimed?.id).toBe('task-newer');
});

test('createVoiceOpsTaskWorker can assign and requeue claimed tasks', async () => {
	const tasks = new Map([
		[
			'task-1',
			createStoredVoiceOpsTask('task-1', {
				createdAt: 100,
				description: 'Transfer verification',
				history: [],
				kind: 'transfer-check',
				recommendedAction: 'Verify the downstream handoff',
				status: 'open',
				title: 'Transfer verification',
				updatedAt: 100
			})
		]
	]);

	const leases = createVoiceRedisTaskLeaseCoordinator({
		client: createFakeRedisClient()
	});
	const workerA = createVoiceOpsTaskWorker({
		leases,
		tasks: createTaskStore(tasks),
		workerId: 'worker-a'
	});
	const workerB = createVoiceOpsTaskWorker({
		leases,
		tasks: createTaskStore(tasks),
		workerId: 'worker-b'
	});

	const assigned = await workerA.assign('task-1', 'alex');
	expect(assigned.assignee).toBe('alex');

	const claimed = await workerA.claimNext({
		assignee: 'alex',
		kinds: ['transfer-check']
	});
	expect(claimed?.id).toBe('task-1');

	await expect(workerB.requeue('task-1')).rejects.toThrow(/worker-a/);

	const requeued = await workerA.requeue('task-1');
	expect(requeued.status).toBe('open');
	expect(requeued.claimedBy).toBeUndefined();
	expect(requeued.history.at(-1)?.type).toBe('requeued');

	const claimedAgain = await workerB.claimNext();
	expect(claimedAgain?.id).toBe('task-1');
	expect(claimedAgain?.claimedBy).toBe('worker-b');
});

test('summarizeVoiceOpsTaskQueue reports claimed, retry, and dead-letter metrics', async () => {
	const tasks = [
		createStoredVoiceOpsTask('task-open', {
			createdAt: 100,
			description: 'Open callback',
			history: [],
			kind: 'callback',
			recommendedAction: 'Call back',
			status: 'open',
			title: 'Open callback',
			updatedAt: 100
		}),
		createStoredVoiceOpsTask('task-claimed', {
			claimExpiresAt: Date.now() + 5_000,
			claimedAt: Date.now(),
			claimedBy: 'worker-a',
			createdAt: 200,
			description: 'Claimed escalation',
			history: [],
			kind: 'escalation',
			processingAttempts: 1,
			processingError: 'CRM timeout',
			recommendedAction: 'Escalate',
			status: 'in-progress',
			title: 'Claimed escalation',
			updatedAt: 200
		}),
		createStoredVoiceOpsTask('task-dead', {
			createdAt: 300,
			deadLetteredAt: 350,
			description: 'Dead-letter transfer',
			history: [],
			kind: 'transfer-check',
			recommendedAction: 'Verify transfer',
			status: 'open',
			title: 'Dead transfer',
			updatedAt: 300
		})
	];

	const summary = await summarizeVoiceOpsTaskQueue(tasks, {
		deadLetters: createTaskStore(new Map([[tasks[2]!.id, tasks[2]!]]))
	});

	expect(summary.total).toBe(3);
	expect(summary.claimed).toBe(1);
	expect(summary.unclaimed).toBe(2);
	expect(summary.retryEligible).toBe(1);
	expect(summary.failed).toBe(1);
	expect(summary.deadLettered).toBe(1);
	expect(summary.byAssignee).toEqual([]);
	expect(summary.byClaimedBy[0]).toEqual(['worker-a', 1]);
	expect(summary.byPriority).toEqual([]);
	expect(summary.overdue).toBe(0);
});

test('createVoiceOpsTaskProcessorWorker completes handled tasks and requeues explicit retries', async () => {
	const tasks = new Map([
		[
			'task-1',
			createStoredVoiceOpsTask('task-1', {
				createdAt: 100,
				description: 'Callback',
				history: [],
				kind: 'callback',
				recommendedAction: 'Call back',
				status: 'open',
				title: 'Callback',
				updatedAt: 100
			})
		],
		[
			'task-2',
			createStoredVoiceOpsTask('task-2', {
				createdAt: 200,
				description: 'Escalation',
				history: [],
				kind: 'escalation',
				recommendedAction: 'Escalate',
				status: 'open',
				title: 'Escalation',
				updatedAt: 200
			})
		]
	]);
	const taskStore = createTaskStore(tasks);
	const worker = createVoiceOpsTaskWorker({
		leases: createVoiceRedisTaskLeaseCoordinator({
			client: createFakeRedisClient()
		}),
		tasks: taskStore,
		workerId: 'worker-a'
	});
	let processed = 0;
	const processor = createVoiceOpsTaskProcessorWorker({
		process: async (task) => {
			processed += 1;
			if (task.id === 'task-1') {
				return { action: 'requeue', detail: 'Need another pass' };
			}
			return { action: 'complete', detail: 'Handled cleanly' };
		},
		tasks: taskStore,
		worker
	});

	const first = await processor.drain();
	expect(first).toEqual({
		attempted: 2,
		completed: 1,
		deadLettered: 0,
		failed: 0,
		idle: 1,
		requeued: 1
	});
	expect(processed).toBe(2);
	expect(tasks.get('task-1')?.status).toBe('open');
	expect(tasks.get('task-2')?.status).toBe('done');
});

test('createVoiceOpsTaskProcessorWorker dead-letters repeated failures and loop exposes lifecycle state', async () => {
	const tasks = new Map([
		[
			'task-1',
			createStoredVoiceOpsTask('task-1', {
				createdAt: 100,
				description: 'Always failing callback',
				history: [],
				kind: 'callback',
				recommendedAction: 'Call back',
				status: 'open',
				title: 'Always failing callback',
				updatedAt: 100
			})
		]
	]);
	const deadLetters = new Map<string, StoredVoiceOpsTask>();
	const taskStore = createTaskStore(tasks);
	const worker = createVoiceOpsTaskWorker({
		leases: createVoiceRedisTaskLeaseCoordinator({
			client: createFakeRedisClient()
		}),
		tasks: taskStore,
		workerId: 'worker-a'
	});
	const processor = createVoiceOpsTaskProcessorWorker({
		deadLetters: createTaskStore(deadLetters),
		maxFailures: 1,
		process: async () => {
			throw new Error('Operator backend unavailable');
		},
		tasks: taskStore,
		worker
	});
	const loop = createVoiceOpsTaskProcessorWorkerLoop({
		pollIntervalMs: 10_000,
		worker: processor
	});

	const result = await loop.tick();
	expect(result).toEqual({
		attempted: 1,
		completed: 0,
		deadLettered: 1,
		failed: 0,
		idle: 1,
		requeued: 0
	});
	expect(deadLetters.get('task-1')?.deadLetteredAt).toBeTruthy();
	expect(tasks.get('task-1')?.deadLetteredAt).toBeTruthy();
	expect(loop.isRunning()).toBe(false);
	loop.start();
	expect(loop.isRunning()).toBe(true);
	loop.stop();
	expect(loop.isRunning()).toBe(false);
});
