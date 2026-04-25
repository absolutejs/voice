import { expect, test } from 'bun:test';
import {
	createVoiceCRMActivitySink,
	createStoredVoiceIntegrationEvent,
	createStoredVoiceOpsTask,
	createVoiceOpsRuntime,
	createVoiceRedisTaskLeaseCoordinator,
	createVoiceSessionRecord
} from '../src';
import type {
	StoredVoiceCallReviewArtifact,
	StoredVoiceIntegrationEvent,
	StoredVoiceOpsTask,
	VoiceRedisTaskLeaseClient,
	VoiceSessionHandle,
	VoiceSessionRecord
} from '../src';

const createStore = <T extends { id: string }>() => {
	const values = new Map<string, T>();

	return {
		get: (id: string) => values.get(id),
		list: () => [...values.values()],
		remove: (id: string) => {
			values.delete(id);
		},
		set: (id: string, value: T) => {
			values.set(id, value);
		}
	};
};

const createFakeRedisClient = (): VoiceRedisTaskLeaseClient => {
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
			const ttlMs = pxIndex >= 0 ? Number(options[pxIndex + 1]) : 0;
			values.set(normalizedKey, {
				expiresAt: Date.now() + ttlMs,
				value: String(value)
			});
			return 'OK';
		}
	};
};

const createFakeHandle = () =>
	({
		close: async () => {},
		commitTurn: async () => {},
		complete: async () => {},
		connect: async () => {},
		disconnect: async () => {},
		escalate: async () => {},
		fail: async () => {},
		id: 'session-1',
		markNoAnswer: async () => {},
		markVoicemail: async () => {},
		receiveAudio: async () => {},
		snapshot: async () => createVoiceSessionRecord('session-1'),
		transfer: async () => {}
	}) as VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>;

test('createVoiceOpsRuntime records runtime artifacts and summarizes queue state', async () => {
	const reviews = createStore<StoredVoiceCallReviewArtifact>();
	const tasks = createStore<StoredVoiceOpsTask>();
	const events = createStore<StoredVoiceIntegrationEvent>();
	const runtime = createVoiceOpsRuntime({
		ops: {
			events,
			reviews,
			tasks
		}
	});

	const session = createVoiceSessionRecord('session-runtime', 'voice-demo');
	session.status = 'completed';
	session.lastActivityAt = session.createdAt + 1_000;
	session.turns.push({
		committedAt: session.createdAt + 500,
		id: 'turn-1',
		text: 'Please transfer me to billing.',
		transcripts: []
	});
	session.call = {
		disposition: 'transferred',
		endedAt: session.createdAt + 1_000,
		events: [
			{ at: session.createdAt, type: 'start' },
			{
				at: session.createdAt + 800,
				target: 'billing',
				type: 'transfer'
			},
			{
				at: session.createdAt + 1_000,
				disposition: 'transferred',
				target: 'billing',
				type: 'end'
			}
		],
		lastEventAt: session.createdAt + 1_000,
		startedAt: session.createdAt
	};

	await runtime.record({
		api: createFakeHandle(),
		context: {},
		disposition: 'transferred',
		reason: 'billing-request',
		session,
		target: 'billing'
	});

	const summary = await runtime.summarize();

	expect(reviews.list()).toHaveLength(1);
	expect(tasks.list()).toHaveLength(1);
	expect(events.list()).toHaveLength(3);
	expect(summary.tasks?.total).toBe(1);
	expect(summary.tasks?.open).toBe(1);
	expect(summary.webhooks?.total).toBe(3);
	expect(summary.webhooks?.pending).toBe(3);
});

test('createVoiceOpsRuntime drives webhook and task workers through tick and loop lifecycle', async () => {
	const events = createStore<StoredVoiceIntegrationEvent>();
	const tasks = createStore<StoredVoiceOpsTask>();
	const taskDeadLetters = createStore<StoredVoiceOpsTask>();
	const eventDeadLetters = createStore<StoredVoiceIntegrationEvent>();
	events.set(
		'event-1',
		createStoredVoiceIntegrationEvent('event-1', {
			createdAt: 100,
			deliveryStatus: 'pending',
			payload: {
				reviewId: 'review-1'
			},
			type: 'review.saved'
		})
	);
	tasks.set(
		'task-1',
		createStoredVoiceOpsTask('task-1', {
			createdAt: 100,
			description: 'Failing callback',
			history: [],
			kind: 'callback',
			recommendedAction: 'Call back',
			status: 'open',
			title: 'Failing callback',
			updatedAt: 100
		})
	);

	const runtime = createVoiceOpsRuntime({
		ops: {
			events,
			sinks: [
				createVoiceCRMActivitySink({
					fetch: async () =>
						new Response(null, {
							status: 202
						}),
					id: 'crm',
					url: 'https://example.test/crm/runtime'
				})
			],
			tasks
		},
		sinks: {
			autoStart: true,
			deadLetters: eventDeadLetters,
			leases: createVoiceRedisTaskLeaseCoordinator({
				client: createFakeRedisClient(),
				keyPrefix: 'voice:test:sink'
			}),
			maxFailures: 2,
			workerId: 'sink-worker'
		},
		tasks: {
			autoStart: true,
			deadLetters: taskDeadLetters,
			leases: createVoiceRedisTaskLeaseCoordinator({
				client: createFakeRedisClient(),
				keyPrefix: 'voice:test:task'
			}),
			maxFailures: 1,
			process: async () => {
				throw new Error('Downstream CRM unavailable');
			},
			workerId: 'task-worker'
		},
		webhooks: {
			autoStart: true,
			deadLetters: eventDeadLetters,
			fetch: async () =>
				new Response(null, {
					status: 200
				}),
			leases: createVoiceRedisTaskLeaseCoordinator({
				client: createFakeRedisClient(),
				keyPrefix: 'voice:test:event'
			}),
			url: 'https://example.test/hooks/runtime',
			workerId: 'event-worker'
		}
	});

	expect(runtime.isRunning()).toBe(false);
	runtime.start();
	expect(runtime.isRunning()).toBe(true);
	runtime.stop();
	expect(runtime.isRunning()).toBe(false);

	const result = await runtime.tick();
	const summary = await runtime.summarize();

	expect(result.webhooks?.delivered).toBe(1);
	expect(result.sinks?.delivered).toBe(1);
	expect(result.tasks?.deadLettered).toBe(1);
	expect(events.get('event-1')?.deliveryStatus).toBe('delivered');
	expect(events.get('event-1')?.sinkDeliveries?.crm?.status).toBe('delivered');
	expect(tasks.get('task-1')?.deadLetteredAt).toBeTruthy();
	expect(taskDeadLetters.get('task-1')?.deadLetteredAt).toBeTruthy();
	expect(summary.webhooks?.delivered).toBe(1);
	expect(summary.sinks?.delivered).toBe(1);
	expect(summary.tasks?.deadLettered).toBe(1);
});

test('createVoiceOpsRuntime checkSLA marks overdue tasks and creates follow-up work', async () => {
	const events = createStore<StoredVoiceIntegrationEvent>();
	const tasks = createStore<StoredVoiceOpsTask>();
	tasks.set(
		'task-overdue',
		createStoredVoiceOpsTask('task-overdue', {
			assignee: 'callbacks',
			createdAt: 100,
			description: 'Overdue voicemail callback',
			dueAt: 200,
			history: [],
			kind: 'callback',
			priority: 'high',
			queue: 'callback-pool',
			recommendedAction: 'Call back now',
			status: 'open',
			title: 'Overdue callback',
			updatedAt: 100
		})
	);

	const runtime = createVoiceOpsRuntime({
		ops: {
			events,
			tasks
		},
		sla: {
			followUpTask: {
				assignee: 'supervisors',
				name: 'sla-escalation',
				priority: 'urgent',
				queue: 'supervisor-queue'
			}
		}
	});

	const result = await runtime.checkSLA({
		at: 300
	});

	expect(result).toEqual({
		breached: 1,
		events: 1,
		followUpTasks: 1
	});
	expect(tasks.get('task-overdue')?.slaBreachedAt).toBe(300);
	expect(tasks.get('task-overdue:sla')?.assignee).toBe('supervisors');
	expect(tasks.get('task-overdue:sla')?.queue).toBe('supervisor-queue');
	expect(events.list().map((event) => event.type)).toEqual([
		'task.sla_breached',
		'task.created'
	]);
});
