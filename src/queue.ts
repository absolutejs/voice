import type { RedisClient } from 'bun';
import { deliverVoiceHandoffDelivery } from './handoff';
import { deliverVoiceIntegrationEvent } from './ops';
import { deliverVoiceIntegrationEventToSinks } from './opsSinks';
import { deliverVoiceTraceEventsToSinks } from './trace';
import {
	assignVoiceOpsTask,
	claimVoiceOpsTask,
	completeVoiceOpsTask,
	deadLetterVoiceOpsTask,
	failVoiceOpsTask,
	heartbeatVoiceOpsTask,
	isVoiceOpsTaskOverdue,
	listVoiceOpsTasks,
	requeueVoiceOpsTask
} from './ops';
import type { VoiceIntegrationSink } from './opsSinks';
import type {
	VoiceTraceRedactionConfig,
	VoiceTraceSink,
	VoiceTraceSinkDeliveryRecord,
	VoiceTraceSinkDeliveryStore,
	VoiceTraceSinkDeliveryQueueStatus
} from './trace';
import type {
	StoredVoiceHandoffDelivery,
	VoiceHandoffAdapter,
	VoiceHandoffDeliveryQueueStatus,
	VoiceHandoffDeliveryStore,
	VoiceSessionHandle,
	VoiceSessionRecord
} from './types';
import type {
	VoiceOpsTaskPriority,
	StoredVoiceOpsTask,
	StoredVoiceIntegrationEvent,
	VoiceIntegrationDeliveryStatus,
	VoiceIntegrationEventStore,
	VoiceIntegrationWebhookConfig,
	VoiceOpsTaskKind,
	VoiceOpsTaskStatus,
	VoiceOpsTaskStore
} from './ops';

export type VoiceOpsTaskLease = {
	expiresAt: number;
	taskId: string;
	workerId: string;
};

export type VoiceRedisTaskLeaseClient = Pick<RedisClient, 'get' | 'send' | 'set'>;

export type VoiceRedisTaskLeaseCoordinatorOptions = {
	client?: VoiceRedisTaskLeaseClient;
	keyPrefix?: string;
	url?: string;
};

export type VoiceRedisTaskLeaseCoordinator = {
	claim: (input: {
		leaseMs: number;
		taskId: string;
		workerId: string;
	}) => Promise<boolean>;
	get: (taskId: string) => Promise<VoiceOpsTaskLease | null>;
	release: (input: { taskId: string; workerId: string }) => Promise<boolean>;
	renew: (input: {
		leaseMs: number;
		taskId: string;
		workerId: string;
	}) => Promise<boolean>;
};

export type VoiceIdempotencyStore = {
	has: (key: string) => Promise<boolean> | boolean;
	remove: (key: string) => Promise<void> | void;
	set: (key: string, input?: { ttlSeconds?: number }) => Promise<void> | void;
};

export type VoiceRedisIdempotencyClient = Pick<RedisClient, 'del' | 'exists' | 'set'>;

export type VoiceRedisIdempotencyStoreOptions = {
	client?: VoiceRedisIdempotencyClient;
	keyPrefix?: string;
	ttlSeconds?: number;
	url?: string;
};

export type VoiceWebhookDeliveryWorkerOptions<
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
> = {
	deadLetters?: VoiceIntegrationEventStore<TEvent>;
	events: VoiceIntegrationEventStore<TEvent>;
	idempotency?: VoiceIdempotencyStore;
	idempotencyTtlSeconds?: number;
	leaseMs?: number;
	leases: VoiceRedisTaskLeaseCoordinator;
	maxFailures?: number;
	onDeadLetter?: (event: TEvent) => Promise<void> | void;
	statuses?: VoiceIntegrationDeliveryStatus[];
	webhook: VoiceIntegrationWebhookConfig;
	workerId: string;
};

export type VoiceWebhookDeliveryWorkerResult = {
	alreadyProcessed: number;
	attempted: number;
	deadLettered: number;
	delivered: number;
	failed: number;
	skipped: number;
};

export type VoiceIntegrationEventQueueSummary = {
	byType: Array<[StoredVoiceIntegrationEvent['type'], number]>;
	deadLettered: number;
	delivered: number;
	failed: number;
	pending: number;
	retryEligible: number;
	skipped: number;
	total: number;
};

export type VoiceWebhookDeliveryWorkerLoopOptions<
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
> = {
	onError?: (error: unknown) => Promise<void> | void;
	pollIntervalMs?: number;
	worker: ReturnType<typeof createVoiceWebhookDeliveryWorker<TEvent>>;
};

export type VoiceWebhookDeliveryWorkerLoop = {
	isRunning: () => boolean;
	start: () => void;
	stop: () => void;
	tick: () => Promise<VoiceWebhookDeliveryWorkerResult>;
};

export type VoiceIntegrationSinkWorkerOptions<
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
> = {
	deadLetters?: VoiceIntegrationEventStore<TEvent>;
	events: VoiceIntegrationEventStore<TEvent>;
	idempotency?: VoiceIdempotencyStore;
	idempotencyTtlSeconds?: number;
	leaseMs?: number;
	leases: VoiceRedisTaskLeaseCoordinator;
	maxFailures?: number;
	onDeadLetter?: (event: TEvent) => Promise<void> | void;
	sinks: VoiceIntegrationSink[];
	workerId: string;
};

export type VoiceIntegrationSinkWorkerResult = {
	alreadyProcessed: number;
	attempted: number;
	deadLettered: number;
	delivered: number;
	failed: number;
	skipped: number;
};

export type VoiceIntegrationSinkWorkerLoopOptions<
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
> = {
	onError?: (error: unknown) => Promise<void> | void;
	pollIntervalMs?: number;
	worker: ReturnType<typeof createVoiceIntegrationSinkWorker<TEvent>>;
};

export type VoiceIntegrationSinkWorkerLoop = {
	isRunning: () => boolean;
	start: () => void;
	stop: () => void;
	tick: () => Promise<VoiceIntegrationSinkWorkerResult>;
};

export type VoiceTraceSinkDeliveryWorkerOptions<
	TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
> = {
	deadLetters?: VoiceTraceSinkDeliveryStore<TDelivery>;
	deliveries: VoiceTraceSinkDeliveryStore<TDelivery>;
	idempotency?: VoiceIdempotencyStore;
	idempotencyTtlSeconds?: number;
	leaseMs?: number;
	leases: VoiceRedisTaskLeaseCoordinator;
	maxFailures?: number;
	onDeadLetter?: (delivery: TDelivery) => Promise<void> | void;
	redact?: VoiceTraceRedactionConfig;
	sinks: VoiceTraceSink[];
	statuses?: VoiceTraceSinkDeliveryQueueStatus[];
	workerId: string;
};

export type VoiceTraceSinkDeliveryWorkerResult = {
	alreadyProcessed: number;
	attempted: number;
	deadLettered: number;
	delivered: number;
	failed: number;
	skipped: number;
};

export type VoiceTraceSinkDeliveryWorkerLoopOptions<
	TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
> = {
	onError?: (error: unknown) => Promise<void> | void;
	pollIntervalMs?: number;
	worker: ReturnType<typeof createVoiceTraceSinkDeliveryWorker<TDelivery>>;
};

export type VoiceTraceSinkDeliveryWorkerLoop = {
	isRunning: () => boolean;
	start: () => void;
	stop: () => void;
	tick: () => Promise<VoiceTraceSinkDeliveryWorkerResult>;
};

export type VoiceTraceSinkDeliveryQueueSummary = {
	deadLettered: number;
	delivered: number;
	failed: number;
	pending: number;
	retryEligible: number;
	skipped: number;
	total: number;
};

export type VoiceHandoffDeliveryWorkerOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown,
	TDelivery extends StoredVoiceHandoffDelivery<TContext, TSession, TResult> = StoredVoiceHandoffDelivery<TContext, TSession, TResult>
> = {
	adapters: VoiceHandoffAdapter<TContext, TSession, TResult>[];
	api: VoiceSessionHandle<TContext, TSession, TResult>;
	deadLetters?: VoiceHandoffDeliveryStore<TDelivery>;
	deliveries: VoiceHandoffDeliveryStore<TDelivery>;
	failMode?: 'record' | 'throw';
	idempotency?: VoiceIdempotencyStore;
	idempotencyTtlSeconds?: number;
	leaseMs?: number;
	leases: VoiceRedisTaskLeaseCoordinator;
	maxFailures?: number;
	onDeadLetter?: (delivery: TDelivery) => Promise<void> | void;
	statuses?: VoiceHandoffDeliveryQueueStatus[];
	workerId: string;
};

export type VoiceHandoffDeliveryWorkerResult = {
	alreadyProcessed: number;
	attempted: number;
	deadLettered: number;
	delivered: number;
	failed: number;
	skipped: number;
};

export type VoiceHandoffDeliveryWorkerLoopOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown,
	TDelivery extends StoredVoiceHandoffDelivery<TContext, TSession, TResult> = StoredVoiceHandoffDelivery<TContext, TSession, TResult>
> = {
	onError?: (error: unknown) => Promise<void> | void;
	pollIntervalMs?: number;
	worker: ReturnType<
		typeof createVoiceHandoffDeliveryWorker<
			TContext,
			TSession,
			TResult,
			TDelivery
		>
	>;
};

export type VoiceHandoffDeliveryWorkerLoop = {
	isRunning: () => boolean;
	start: () => void;
	stop: () => void;
	tick: () => Promise<VoiceHandoffDeliveryWorkerResult>;
};

export type VoiceHandoffDeliveryQueueSummary = {
	byAction: Array<[StoredVoiceHandoffDelivery['action'], number]>;
	deadLettered: number;
	delivered: number;
	failed: number;
	pending: number;
	retryEligible: number;
	skipped: number;
	total: number;
};

export type VoiceOpsTaskWorkerOptions<
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
> = {
	leaseMs?: number;
	leases: VoiceRedisTaskLeaseCoordinator;
	tasks: VoiceOpsTaskStore<TTask>;
	workerId: string;
};

export type VoiceOpsTaskClaimFilters = {
	assignee?: string;
	excludeTaskIds?: string[];
	kinds?: VoiceOpsTaskKind[];
};

export type VoiceOpsTaskWorker<
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
> = {
	assign: (
		taskId: string,
		assignee: string,
		input?: { actor?: string; at?: number }
	) => Promise<TTask>;
	claimNext: (filters?: VoiceOpsTaskClaimFilters) => Promise<TTask | null>;
	complete: (
		taskId: string,
		input?: { actor?: string; at?: number; detail?: string }
	) => Promise<TTask>;
	heartbeat: (
		taskId: string,
		input?: { actor?: string; at?: number; detail?: string; leaseMs?: number }
	) => Promise<TTask>;
	requeue: (
		taskId: string,
		input?: { actor?: string; at?: number; detail?: string }
	) => Promise<TTask>;
	release: (taskId: string) => Promise<boolean>;
};

export type VoiceOpsTaskQueueSummary = {
	byAssignee: Array<[string, number]>;
	byClaimedBy: Array<[string, number]>;
	claimed: number;
	deadLettered: number;
	byKind: Array<[VoiceOpsTaskKind, number]>;
	byPriority: Array<[VoiceOpsTaskPriority, number]>;
	byStatus: Array<[VoiceOpsTaskStatus, number]>;
	failed: number;
	inProgress: number;
	open: number;
	overdue: number;
	retryEligible: number;
	total: number;
	unclaimed: number;
};

export type VoiceOpsTaskProcessorWorkerOptions<
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
> = {
	deadLetters?: VoiceOpsTaskStore<TTask>;
	filters?: VoiceOpsTaskClaimFilters;
	leaseMs?: number;
	maxFailures?: number;
	onDeadLetter?: (task: TTask) => Promise<void> | void;
	onError?: (error: unknown, task: TTask) => Promise<void> | void;
	process: (
		task: TTask
	) =>
		| Promise<void | 'complete' | 'requeue' | { action?: 'complete' | 'requeue'; detail?: string }>
		| void
		| 'complete'
		| 'requeue'
		| { action?: 'complete' | 'requeue'; detail?: string };
	tasks: VoiceOpsTaskStore<TTask>;
	worker: VoiceOpsTaskWorker<TTask>;
};

export type VoiceOpsTaskProcessorWorkerResult = {
	attempted: number;
	completed: number;
	deadLettered: number;
	failed: number;
	idle: number;
	requeued: number;
};

export type VoiceOpsTaskProcessorWorkerLoopOptions<
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
> = {
	onError?: (error: unknown) => Promise<void> | void;
	pollIntervalMs?: number;
	worker: ReturnType<typeof createVoiceOpsTaskProcessorWorker<TTask>>;
};

export type VoiceOpsTaskProcessorWorkerLoop = {
	isRunning: () => boolean;
	start: () => void;
	stop: () => void;
	tick: () => Promise<VoiceOpsTaskProcessorWorkerResult>;
};

const releaseLeaseScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0
`;

const renewLeaseScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

const getLeaseKey = (prefix: string, taskId: string) => `${prefix}:${taskId}`;
const getIdempotencyKey = (prefix: string, key: string) => `${prefix}:${key}`;

const parseLeaseValue = (taskId: string, value: string | null, ttlMs: number) => {
	if (!value || ttlMs <= 0) {
		return null;
	}

	return {
		expiresAt: Date.now() + ttlMs,
		taskId,
		workerId: value
	} satisfies VoiceOpsTaskLease;
};

const shouldProcessEventStatus = (
	status: VoiceIntegrationDeliveryStatus | undefined,
	allowed: VoiceIntegrationDeliveryStatus[]
) => {
	if (status === undefined) {
		return true;
	}

	return allowed.includes(status);
};

const shouldDeadLetterEvent = (
	event: StoredVoiceIntegrationEvent,
	maxFailures: number | undefined
) =>
	typeof maxFailures === 'number' &&
	maxFailures > 0 &&
	(event.deliveryAttempts ?? 0) >= maxFailures;

const resolveEligibleIntegrationSinks = (
	event: StoredVoiceIntegrationEvent,
	sinks: VoiceIntegrationSink[],
	maxFailures: number | undefined
) =>
	sinks.filter((sink) => {
		if (sink.eventTypes && !sink.eventTypes.includes(event.type)) {
			return false;
		}

		const delivery = event.sinkDeliveries?.[sink.id];
		if (!delivery) {
			return true;
		}

		if (delivery.status === 'delivered' || delivery.status === 'skipped') {
			return false;
		}

		if (
			delivery.status === 'failed' &&
			typeof maxFailures === 'number' &&
			maxFailures > 0 &&
			delivery.attempts >= maxFailures
		) {
			return false;
		}

		return delivery.status === 'pending' || delivery.status === 'failed';
	});

const resolveIntegrationSinkOutcome = (
	event: StoredVoiceIntegrationEvent,
	sinks: VoiceIntegrationSink[]
): 'delivered' | 'failed' | 'skipped' | 'pending' => {
	if (sinks.length === 0) {
		return 'skipped';
	}

	const deliveries = sinks.map((sink) => event.sinkDeliveries?.[sink.id]);
	if (deliveries.every((delivery) => delivery?.status === 'skipped')) {
		return 'skipped';
	}

	if (
		deliveries.every(
			(delivery) =>
				delivery?.status === 'delivered' || delivery?.status === 'skipped'
		)
	) {
		return 'delivered';
	}

	if (deliveries.some((delivery) => delivery?.status === 'failed')) {
		return 'failed';
	}

	return 'pending';
};

const shouldDeadLetterSinkEvent = (
	event: StoredVoiceIntegrationEvent,
	sinks: VoiceIntegrationSink[],
	maxFailures: number | undefined
) =>
	typeof maxFailures === 'number' &&
	maxFailures > 0 &&
	sinks.some((sink) => {
		const delivery = event.sinkDeliveries?.[sink.id];
		return (
			delivery?.status === 'failed' &&
			delivery.attempts >= maxFailures
		);
	});

const shouldDeadLetterTask = (
	task: StoredVoiceOpsTask,
	maxFailures: number | undefined
) =>
	typeof maxFailures === 'number' &&
	maxFailures > 0 &&
	(task.processingAttempts ?? 0) >= maxFailures;

const shouldProcessTraceDeliveryStatus = (
	status: VoiceTraceSinkDeliveryQueueStatus,
	allowed: VoiceTraceSinkDeliveryQueueStatus[]
) => allowed.includes(status);

const shouldDeadLetterTraceDelivery = (
	delivery: VoiceTraceSinkDeliveryRecord,
	maxFailures: number | undefined
) =>
	typeof maxFailures === 'number' &&
	maxFailures > 0 &&
	(delivery.deliveryAttempts ?? 0) >= maxFailures;

const shouldProcessHandoffDeliveryStatus = (
	status: VoiceHandoffDeliveryQueueStatus,
	allowed: VoiceHandoffDeliveryQueueStatus[]
) => allowed.includes(status);

const shouldDeadLetterHandoffDelivery = (
	delivery: StoredVoiceHandoffDelivery,
	maxFailures: number | undefined
) =>
	typeof maxFailures === 'number' &&
	maxFailures > 0 &&
	(delivery.deliveryAttempts ?? 0) >= maxFailures;

export const summarizeVoiceIntegrationEvents = <
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
>(
	events: TEvent[],
	input: {
		deadLetters?: VoiceIntegrationEventStore<TEvent>;
	} = {}
): Promise<VoiceIntegrationEventQueueSummary> | VoiceIntegrationEventQueueSummary => {
	const buildSummary = async () => {
		const deadLetterIds = new Set(
			input.deadLetters ? (await input.deadLetters.list()).map((event) => event.id) : []
		);
		const byType = new Map<TEvent['type'], number>();
		const summary: VoiceIntegrationEventQueueSummary = {
			byType: [],
			deadLettered: 0,
			delivered: 0,
			failed: 0,
			pending: 0,
			retryEligible: 0,
			skipped: 0,
			total: events.length
		};

		for (const event of events) {
			byType.set(event.type, (byType.get(event.type) ?? 0) + 1);
			if (deadLetterIds.has(event.id)) {
				summary.deadLettered += 1;
			}

			switch (event.deliveryStatus) {
				case 'delivered':
					summary.delivered += 1;
					break;
				case 'failed':
					summary.failed += 1;
					if ((event.deliveryAttempts ?? 0) > 0) {
						summary.retryEligible += 1;
					}
					break;
				case 'skipped':
					summary.skipped += 1;
					break;
				case 'pending':
				case undefined:
					summary.pending += 1;
					break;
			}
		}

		summary.byType = [...byType.entries()].sort((left, right) => right[1] - left[1]);
		return summary;
	};

	return buildSummary();
};

export const summarizeVoiceTraceSinkDeliveries = <
	TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
>(
	deliveries: TDelivery[],
	input: {
		deadLetters?: VoiceTraceSinkDeliveryStore<TDelivery>;
	} = {}
):
	| Promise<VoiceTraceSinkDeliveryQueueSummary>
	| VoiceTraceSinkDeliveryQueueSummary => {
	const buildSummary = async () => {
		const deadLetterIds = new Set(
			input.deadLetters
				? (await input.deadLetters.list()).map((delivery) => delivery.id)
				: []
		);
		const summary: VoiceTraceSinkDeliveryQueueSummary = {
			deadLettered: 0,
			delivered: 0,
			failed: 0,
			pending: 0,
			retryEligible: 0,
			skipped: 0,
			total: deliveries.length
		};

		for (const delivery of deliveries) {
			if (deadLetterIds.has(delivery.id)) {
				summary.deadLettered += 1;
			}

			switch (delivery.deliveryStatus) {
				case 'delivered':
					summary.delivered += 1;
					break;
				case 'failed':
					summary.failed += 1;
					if ((delivery.deliveryAttempts ?? 0) > 0) {
						summary.retryEligible += 1;
					}
					break;
				case 'skipped':
					summary.skipped += 1;
					break;
				case 'pending':
					summary.pending += 1;
					break;
			}
		}

		return summary;
	};

	return buildSummary();
};

export const summarizeVoiceHandoffDeliveries = <
	TDelivery extends StoredVoiceHandoffDelivery = StoredVoiceHandoffDelivery
>(
	deliveries: TDelivery[],
	input: {
		deadLetters?: VoiceHandoffDeliveryStore<TDelivery>;
	} = {}
):
	| Promise<VoiceHandoffDeliveryQueueSummary>
	| VoiceHandoffDeliveryQueueSummary => {
	const buildSummary = async () => {
		const deadLetterIds = new Set(
			input.deadLetters
				? (await input.deadLetters.list()).map((delivery) => delivery.id)
				: []
		);
		const byAction = new Map<TDelivery['action'], number>();
		const summary: VoiceHandoffDeliveryQueueSummary = {
			byAction: [],
			deadLettered: 0,
			delivered: 0,
			failed: 0,
			pending: 0,
			retryEligible: 0,
			skipped: 0,
			total: deliveries.length
		};

		for (const delivery of deliveries) {
			byAction.set(
				delivery.action,
				(byAction.get(delivery.action) ?? 0) + 1
			);
			if (deadLetterIds.has(delivery.id)) {
				summary.deadLettered += 1;
			}

			switch (delivery.deliveryStatus) {
				case 'delivered':
					summary.delivered += 1;
					break;
				case 'failed':
					summary.failed += 1;
					if ((delivery.deliveryAttempts ?? 0) > 0) {
						summary.retryEligible += 1;
					}
					break;
				case 'skipped':
					summary.skipped += 1;
					break;
				case 'pending':
					summary.pending += 1;
					break;
			}
		}

		summary.byAction = [...byAction.entries()].sort(
			(left, right) => right[1] - left[1]
		);
		return summary;
	};

	return buildSummary();
};

export const summarizeVoiceOpsTaskQueue = <
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
>(
	tasks: TTask[],
	input: {
		deadLetters?: VoiceOpsTaskStore<TTask>;
	} = {}
): Promise<VoiceOpsTaskQueueSummary> | VoiceOpsTaskQueueSummary => {
	const buildSummary = async () => {
		const deadLetterIds = new Set(
			input.deadLetters ? (await input.deadLetters.list()).map((task) => task.id) : []
		);
		const byAssignee = new Map<string, number>();
		const byClaimedBy = new Map<string, number>();
		const byKind = new Map<VoiceOpsTaskKind, number>();
		const byPriority = new Map<VoiceOpsTaskPriority, number>();
		const byStatus = new Map<VoiceOpsTaskStatus, number>();
		const summary: VoiceOpsTaskQueueSummary = {
			byAssignee: [],
			byClaimedBy: [],
			claimed: 0,
			deadLettered: 0,
			byKind: [],
			byPriority: [],
			byStatus: [],
			failed: 0,
			inProgress: 0,
			open: 0,
			overdue: 0,
			retryEligible: 0,
			total: tasks.length,
			unclaimed: 0
		};

		for (const task of tasks) {
			byKind.set(task.kind, (byKind.get(task.kind) ?? 0) + 1);
			byStatus.set(task.status, (byStatus.get(task.status) ?? 0) + 1);

			if (deadLetterIds.has(task.id) || task.deadLetteredAt) {
				summary.deadLettered += 1;
			}

			if (task.claimedBy && (!task.claimExpiresAt || task.claimExpiresAt > Date.now())) {
				summary.claimed += 1;
				byClaimedBy.set(
					task.claimedBy,
					(byClaimedBy.get(task.claimedBy) ?? 0) + 1
				);
			} else {
				summary.unclaimed += 1;
			}

			if (task.processingAttempts && task.processingAttempts > 0) {
				summary.retryEligible += 1;
			}

			if (task.processingError) {
				summary.failed += 1;
			}

			if (task.assignee) {
				byAssignee.set(task.assignee, (byAssignee.get(task.assignee) ?? 0) + 1);
			}

			if (task.priority) {
				byPriority.set(task.priority, (byPriority.get(task.priority) ?? 0) + 1);
			}

			if (isVoiceOpsTaskOverdue(task)) {
				summary.overdue += 1;
			}

			if (task.status === 'open') {
				summary.open += 1;
			} else if (task.status === 'in-progress') {
				summary.inProgress += 1;
			}
		}

		summary.byKind = [...byKind.entries()].sort((left, right) => right[1] - left[1]);
		summary.byAssignee = [...byAssignee.entries()].sort(
			(left, right) => right[1] - left[1]
		);
		summary.byClaimedBy = [...byClaimedBy.entries()].sort(
			(left, right) => right[1] - left[1]
		);
		summary.byPriority = [...byPriority.entries()].sort(
			(left, right) => right[1] - left[1]
		);
		summary.byStatus = [...byStatus.entries()].sort(
			(left, right) => right[1] - left[1]
		);
		return summary;
	};

	return buildSummary();
};

export const createVoiceRedisTaskLeaseCoordinator = (
	options: VoiceRedisTaskLeaseCoordinatorOptions = {}
): VoiceRedisTaskLeaseCoordinator => {
	const client = options.client ?? new Bun.RedisClient(options.url);
	const keyPrefix = options.keyPrefix?.trim() || 'voice:task-lease';

	return {
		claim: async ({ leaseMs, taskId, workerId }) => {
			const key = getLeaseKey(keyPrefix, taskId);
			const result = await client.set(
				key,
				workerId,
				'PX',
				String(Math.max(1, leaseMs)),
				'NX'
			);
			return result === 'OK';
		},
		get: async (taskId) => {
			const key = getLeaseKey(keyPrefix, taskId);
			const [workerId, ttlMs] = await Promise.all([
				client.get(key),
				client.send('PTTL', [key]).then((value) => Number(value))
			]);
			return parseLeaseValue(taskId, workerId, ttlMs);
		},
		release: async ({ taskId, workerId }) => {
			const key = getLeaseKey(keyPrefix, taskId);
			const released = await client.send('EVAL', [
				releaseLeaseScript,
				'1',
				key,
				workerId
			]);
			return Number(released) > 0;
		},
		renew: async ({ leaseMs, taskId, workerId }) => {
			const key = getLeaseKey(keyPrefix, taskId);
			const renewed = await client.send('EVAL', [
				renewLeaseScript,
				'1',
				key,
				workerId,
				String(Math.max(1, leaseMs))
			]);
			return Number(renewed) > 0;
		}
	};
};

export const createVoiceRedisIdempotencyStore = (
	options: VoiceRedisIdempotencyStoreOptions = {}
): VoiceIdempotencyStore => {
	const client = options.client ?? new Bun.RedisClient(options.url);
	const keyPrefix = options.keyPrefix?.trim() || 'voice:idempotency';
	const defaultTtlSeconds = options.ttlSeconds;

	return {
		has: async (key) => Boolean(await client.exists(getIdempotencyKey(keyPrefix, key))),
		remove: async (key) => {
			await client.del(getIdempotencyKey(keyPrefix, key));
		},
		set: async (key, input = {}) => {
			const ttlSeconds = input.ttlSeconds ?? defaultTtlSeconds;
			const redisKey = getIdempotencyKey(keyPrefix, key);
			if (typeof ttlSeconds === 'number' && ttlSeconds > 0) {
				await client.set(redisKey, '1', 'EX', String(Math.ceil(ttlSeconds)));
				return;
			}

			await client.set(redisKey, '1');
		}
	};
};

export const createVoiceWebhookDeliveryWorker = <
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
>(
	options: VoiceWebhookDeliveryWorkerOptions<TEvent>
) => {
	const allowedStatuses = options.statuses ?? ['pending', 'failed'];
	const leaseMs = Math.max(1, options.leaseMs ?? 30_000);

	return {
		drain: async (): Promise<VoiceWebhookDeliveryWorkerResult> => {
			const result: VoiceWebhookDeliveryWorkerResult = {
				alreadyProcessed: 0,
				attempted: 0,
				deadLettered: 0,
				delivered: 0,
				failed: 0,
				skipped: 0
			};
			const events = [...(await options.events.list())].sort(
				(left, right) => left.createdAt - right.createdAt
			);

			for (const event of events) {
				if (!shouldProcessEventStatus(event.deliveryStatus, allowedStatuses)) {
					continue;
				}

				const claimed = await options.leases.claim({
					leaseMs,
					taskId: event.id,
					workerId: options.workerId
				});
				if (!claimed) {
					continue;
				}

				try {
					if (options.idempotency && (await options.idempotency.has(event.id))) {
						result.alreadyProcessed += 1;
						continue;
					}

					result.attempted += 1;
					const updatedEvent = (await deliverVoiceIntegrationEvent({
						event,
						webhook: options.webhook
					})) as TEvent;
					await options.events.set(updatedEvent.id, updatedEvent);

					if (
						updatedEvent.deliveryStatus === 'delivered' ||
						updatedEvent.deliveryStatus === 'skipped'
					) {
						await options.idempotency?.set(updatedEvent.id, {
							ttlSeconds: options.idempotencyTtlSeconds
						});
					}

					if (updatedEvent.deliveryStatus === 'delivered') {
						result.delivered += 1;
					} else if (updatedEvent.deliveryStatus === 'failed') {
						result.failed += 1;
						if (shouldDeadLetterEvent(updatedEvent, options.maxFailures)) {
							await options.deadLetters?.set(updatedEvent.id, updatedEvent);
							await options.onDeadLetter?.(updatedEvent);
							result.deadLettered += 1;
						}
					} else if (updatedEvent.deliveryStatus === 'skipped') {
						result.skipped += 1;
					}
				} finally {
					await options.leases.release({
						taskId: event.id,
						workerId: options.workerId
					});
				}
			}

			return result;
		}
	};
};

export const createVoiceWebhookDeliveryWorkerLoop = <
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
>(
	options: VoiceWebhookDeliveryWorkerLoopOptions<TEvent>
): VoiceWebhookDeliveryWorkerLoop => {
	const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 1_000);
	let timer: ReturnType<typeof setInterval> | undefined;
	let running = false;

	const tick = async () => options.worker.drain();

	return {
		isRunning: () => running,
		start: () => {
			if (timer) {
				return;
			}

			running = true;
			timer = setInterval(() => {
				void tick().catch((error) => {
					void options.onError?.(error);
				});
			}, pollIntervalMs);
		},
		stop: () => {
			if (timer) {
				clearInterval(timer);
				timer = undefined;
			}
			running = false;
		},
		tick
	};
};

export const createVoiceIntegrationSinkWorker = <
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
>(
	options: VoiceIntegrationSinkWorkerOptions<TEvent>
) => {
	const leaseMs = Math.max(1, options.leaseMs ?? 30_000);

	return {
		drain: async (): Promise<VoiceIntegrationSinkWorkerResult> => {
			const result: VoiceIntegrationSinkWorkerResult = {
				alreadyProcessed: 0,
				attempted: 0,
				deadLettered: 0,
				delivered: 0,
				failed: 0,
				skipped: 0
			};
			const events = [...(await options.events.list())].sort(
				(left, right) => left.createdAt - right.createdAt
			);

			for (const event of events) {
				const eligibleSinks = resolveEligibleIntegrationSinks(
					event,
					options.sinks,
					options.maxFailures
				);

				if (eligibleSinks.length === 0) {
					if (
						shouldDeadLetterSinkEvent(event, options.sinks, options.maxFailures)
					) {
						await options.deadLetters?.set(event.id, event as TEvent);
						await options.onDeadLetter?.(event as TEvent);
						result.deadLettered += 1;
					}
					continue;
				}

				const claimed = await options.leases.claim({
					leaseMs,
					taskId: event.id,
					workerId: options.workerId
				});
				if (!claimed) {
					continue;
				}

				try {
					const idempotencyKey = `${event.id}:sinks`;
					if (
						options.idempotency &&
						(await options.idempotency.has(idempotencyKey))
					) {
						result.alreadyProcessed += 1;
						continue;
					}

					result.attempted += 1;
					const updatedEvent = (await deliverVoiceIntegrationEventToSinks({
						event,
						sinks: eligibleSinks
					})) as TEvent;
					await options.events.set(updatedEvent.id, updatedEvent);

					const sinkOutcome = resolveIntegrationSinkOutcome(
						updatedEvent,
						options.sinks
					);
					if (sinkOutcome === 'delivered' || sinkOutcome === 'skipped') {
						await options.idempotency?.set(idempotencyKey, {
							ttlSeconds: options.idempotencyTtlSeconds
						});
					}

					if (sinkOutcome === 'delivered') {
						result.delivered += 1;
					} else if (sinkOutcome === 'skipped') {
						result.skipped += 1;
					} else if (sinkOutcome === 'failed') {
						result.failed += 1;
						if (
							shouldDeadLetterSinkEvent(
								updatedEvent,
								options.sinks,
								options.maxFailures
							)
						) {
							await options.deadLetters?.set(updatedEvent.id, updatedEvent);
							await options.onDeadLetter?.(updatedEvent);
							result.deadLettered += 1;
						}
					}
				} finally {
					await options.leases.release({
						taskId: event.id,
						workerId: options.workerId
					});
				}
			}

			return result;
		}
	};
};

export const createVoiceIntegrationSinkWorkerLoop = <
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
>(
	options: VoiceIntegrationSinkWorkerLoopOptions<TEvent>
): VoiceIntegrationSinkWorkerLoop => {
	const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 1_000);
	let timer: ReturnType<typeof setInterval> | undefined;
	let running = false;

	const tick = async () => options.worker.drain();

	return {
		isRunning: () => running,
		start: () => {
			if (timer) {
				return;
			}

			running = true;
			timer = setInterval(() => {
				void tick().catch((error) => {
					void options.onError?.(error);
				});
			}, pollIntervalMs);
		},
		stop: () => {
			if (timer) {
				clearInterval(timer);
				timer = undefined;
			}
			running = false;
		},
		tick
	};
};

export const createVoiceTraceSinkDeliveryWorker = <
	TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
>(
	options: VoiceTraceSinkDeliveryWorkerOptions<TDelivery>
) => {
	const allowedStatuses = options.statuses ?? ['pending', 'failed'];
	const leaseMs = Math.max(1, options.leaseMs ?? 30_000);

	return {
		drain: async (): Promise<VoiceTraceSinkDeliveryWorkerResult> => {
			const result: VoiceTraceSinkDeliveryWorkerResult = {
				alreadyProcessed: 0,
				attempted: 0,
				deadLettered: 0,
				delivered: 0,
				failed: 0,
				skipped: 0
			};
			const deliveries = [...(await options.deliveries.list())].sort(
				(left, right) => left.createdAt - right.createdAt
			);

			for (const delivery of deliveries) {
				if (
					!shouldProcessTraceDeliveryStatus(
						delivery.deliveryStatus,
						allowedStatuses
					)
				) {
					continue;
				}

				if (shouldDeadLetterTraceDelivery(delivery, options.maxFailures)) {
					await options.deadLetters?.set(delivery.id, delivery as TDelivery);
					await options.onDeadLetter?.(delivery as TDelivery);
					result.deadLettered += 1;
					continue;
				}

				const claimed = await options.leases.claim({
					leaseMs,
					taskId: delivery.id,
					workerId: options.workerId
				});
				if (!claimed) {
					continue;
				}

				try {
					const idempotencyKey = `${delivery.id}:trace-sinks`;
					if (
						options.idempotency &&
						(await options.idempotency.has(idempotencyKey))
					) {
						result.alreadyProcessed += 1;
						continue;
					}

					result.attempted += 1;
					const fanout = await deliverVoiceTraceEventsToSinks({
						events: delivery.events,
						redact: options.redact,
						sinks: options.sinks
					});
					const updatedDelivery = {
						...delivery,
						deliveredAt:
							fanout.status === 'delivered' || fanout.status === 'skipped'
								? fanout.deliveredAt
								: delivery.deliveredAt,
						deliveryAttempts: (delivery.deliveryAttempts ?? 0) + 1,
						deliveryError:
							fanout.status === 'failed'
								? Object.values(fanout.sinkDeliveries)
										.map((sinkDelivery) => sinkDelivery.error)
										.find(Boolean)
								: undefined,
						deliveryStatus: fanout.status,
						sinkDeliveries: fanout.sinkDeliveries,
						updatedAt: Date.now()
					} as TDelivery;

					await options.deliveries.set(updatedDelivery.id, updatedDelivery);

					if (
						updatedDelivery.deliveryStatus === 'delivered' ||
						updatedDelivery.deliveryStatus === 'skipped'
					) {
						await options.idempotency?.set(idempotencyKey, {
							ttlSeconds: options.idempotencyTtlSeconds
						});
					}

					if (updatedDelivery.deliveryStatus === 'delivered') {
						result.delivered += 1;
					} else if (updatedDelivery.deliveryStatus === 'skipped') {
						result.skipped += 1;
					} else if (updatedDelivery.deliveryStatus === 'failed') {
						result.failed += 1;
						if (
							shouldDeadLetterTraceDelivery(
								updatedDelivery,
								options.maxFailures
							)
						) {
							await options.deadLetters?.set(
								updatedDelivery.id,
								updatedDelivery
							);
							await options.onDeadLetter?.(updatedDelivery);
							result.deadLettered += 1;
						}
					}
				} finally {
					await options.leases.release({
						taskId: delivery.id,
						workerId: options.workerId
					});
				}
			}

			return result;
		}
	};
};

export const createVoiceTraceSinkDeliveryWorkerLoop = <
	TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
>(
	options: VoiceTraceSinkDeliveryWorkerLoopOptions<TDelivery>
): VoiceTraceSinkDeliveryWorkerLoop => {
	const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 1_000);
	let timer: ReturnType<typeof setInterval> | undefined;
	let running = false;

	const tick = async () => options.worker.drain();

	return {
		isRunning: () => running,
		start: () => {
			if (timer) {
				return;
			}

			running = true;
			timer = setInterval(() => {
				void tick().catch((error) => {
					void options.onError?.(error);
				});
			}, pollIntervalMs);
		},
		stop: () => {
			if (timer) {
				clearInterval(timer);
				timer = undefined;
			}
			running = false;
		},
		tick
	};
};

export const createVoiceHandoffDeliveryWorker = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown,
	TDelivery extends StoredVoiceHandoffDelivery<TContext, TSession, TResult> = StoredVoiceHandoffDelivery<TContext, TSession, TResult>
>(
	options: VoiceHandoffDeliveryWorkerOptions<
		TContext,
		TSession,
		TResult,
		TDelivery
	>
) => {
	const allowedStatuses = options.statuses ?? ['pending', 'failed'];
	const leaseMs = Math.max(1, options.leaseMs ?? 30_000);

	return {
		drain: async (): Promise<VoiceHandoffDeliveryWorkerResult> => {
			const result: VoiceHandoffDeliveryWorkerResult = {
				alreadyProcessed: 0,
				attempted: 0,
				deadLettered: 0,
				delivered: 0,
				failed: 0,
				skipped: 0
			};
			const deliveries = [...(await options.deliveries.list())].sort(
				(left, right) => left.createdAt - right.createdAt
			);

			for (const delivery of deliveries) {
				if (
					!shouldProcessHandoffDeliveryStatus(
						delivery.deliveryStatus,
						allowedStatuses
					)
				) {
					continue;
				}

				if (shouldDeadLetterHandoffDelivery(delivery, options.maxFailures)) {
					await options.deadLetters?.set(delivery.id, delivery as TDelivery);
					await options.onDeadLetter?.(delivery as TDelivery);
					result.deadLettered += 1;
					continue;
				}

				const claimed = await options.leases.claim({
					leaseMs,
					taskId: delivery.id,
					workerId: options.workerId
				});
				if (!claimed) {
					continue;
				}

				try {
					const idempotencyKey = `${delivery.id}:handoff`;
					if (
						options.idempotency &&
						(await options.idempotency.has(idempotencyKey))
					) {
						result.alreadyProcessed += 1;
						continue;
					}

					result.attempted += 1;
					const updatedDelivery = (await deliverVoiceHandoffDelivery({
						adapters: options.adapters,
						api: options.api,
						delivery,
						failMode: options.failMode
					})) as TDelivery;
					await options.deliveries.set(updatedDelivery.id, updatedDelivery);

					if (
						updatedDelivery.deliveryStatus === 'delivered' ||
						updatedDelivery.deliveryStatus === 'skipped'
					) {
						await options.idempotency?.set(idempotencyKey, {
							ttlSeconds: options.idempotencyTtlSeconds
						});
					}

					if (updatedDelivery.deliveryStatus === 'delivered') {
						result.delivered += 1;
					} else if (updatedDelivery.deliveryStatus === 'skipped') {
						result.skipped += 1;
					} else if (updatedDelivery.deliveryStatus === 'failed') {
						result.failed += 1;
						if (
							shouldDeadLetterHandoffDelivery(
								updatedDelivery,
								options.maxFailures
							)
						) {
							await options.deadLetters?.set(
								updatedDelivery.id,
								updatedDelivery
							);
							await options.onDeadLetter?.(updatedDelivery);
							result.deadLettered += 1;
						}
					}
				} finally {
					await options.leases.release({
						taskId: delivery.id,
						workerId: options.workerId
					});
				}
			}

			return result;
		}
	};
};

export const createVoiceHandoffDeliveryWorkerLoop = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown,
	TDelivery extends StoredVoiceHandoffDelivery<TContext, TSession, TResult> = StoredVoiceHandoffDelivery<TContext, TSession, TResult>
>(
	options: VoiceHandoffDeliveryWorkerLoopOptions<
		TContext,
		TSession,
		TResult,
		TDelivery
	>
): VoiceHandoffDeliveryWorkerLoop => {
	const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 1_000);
	let timer: ReturnType<typeof setInterval> | undefined;
	let running = false;

	const tick = async () => options.worker.drain();

	return {
		isRunning: () => running,
		start: () => {
			if (timer) {
				return;
			}

			running = true;
			timer = setInterval(() => {
				void tick().catch((error) => {
					void options.onError?.(error);
				});
			}, pollIntervalMs);
		},
		stop: () => {
			if (timer) {
				clearInterval(timer);
				timer = undefined;
			}
			running = false;
		},
		tick
	};
};

export const createVoiceOpsTaskWorker = <
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
>(
	options: VoiceOpsTaskWorkerOptions<TTask>
): VoiceOpsTaskWorker<TTask> => {
	const leaseMs = Math.max(1, options.leaseMs ?? 30_000);

	const getTask = async (taskId: string) => {
		const task = await options.tasks.get(taskId);
		if (!task) {
			throw new Error(`Task ${taskId} was not found.`);
		}

		return task;
	};

	const ensureOwnedByWorker = (task: StoredVoiceOpsTask) => {
		if (task.claimedBy && task.claimedBy !== options.workerId) {
			throw new Error(
				`Task ${task.id} is claimed by ${task.claimedBy}, not ${options.workerId}.`
			);
		}
	};

	return {
		assign: async (taskId, assignee, input = {}) => {
			const task = await getTask(taskId);
			const updatedTask = assignVoiceOpsTask(task, assignee, input) as TTask;
			await options.tasks.set(updatedTask.id, updatedTask);
			return updatedTask;
		},
		claimNext: async (filters = {}) => {
			const now = Date.now();
			const tasks = listVoiceOpsTasks(await options.tasks.list())
				.filter((task) => task.status !== 'done')
				.filter((task) => !task.deadLetteredAt)
				.filter((task) =>
					filters.assignee ? task.assignee === filters.assignee : true
				)
				.filter((task) =>
					filters.kinds?.length ? filters.kinds.includes(task.kind) : true
				)
				.filter((task) =>
					filters.excludeTaskIds?.length
						? !filters.excludeTaskIds.includes(task.id)
						: true
				)
				.sort((left, right) => left.createdAt - right.createdAt);

			for (const task of tasks) {
				if (
					task.claimedBy &&
					task.claimExpiresAt &&
					task.claimExpiresAt > now &&
					task.claimedBy !== options.workerId
				) {
					continue;
				}

				const claimed = await options.leases.claim({
					leaseMs,
					taskId: task.id,
					workerId: options.workerId
				});
				if (!claimed) {
					continue;
				}

				const currentTask = await getTask(task.id);
				const updatedTask = claimVoiceOpsTask(currentTask, options.workerId, {
					at: now,
					leaseMs
				}) as TTask;
				await options.tasks.set(updatedTask.id, updatedTask);
				return updatedTask;
			}

			return null;
		},
		complete: async (taskId, input = {}) => {
			const task = await getTask(taskId);
			ensureOwnedByWorker(task);
			const updatedTask = completeVoiceOpsTask(task, input) as TTask;
			await options.tasks.set(updatedTask.id, updatedTask);
			await options.leases.release({
				taskId,
				workerId: options.workerId
			});
			return updatedTask;
		},
		heartbeat: async (taskId, input = {}) => {
			const activeLeaseMs = Math.max(1, input.leaseMs ?? leaseMs);
			const renewed = await options.leases.renew({
				leaseMs: activeLeaseMs,
				taskId,
				workerId: options.workerId
			});
			if (!renewed) {
				throw new Error(
					`Task ${taskId} lease could not be renewed for worker ${options.workerId}.`
				);
			}

			const task = await getTask(taskId);
			ensureOwnedByWorker(task);
			const updatedTask = heartbeatVoiceOpsTask(task, options.workerId, {
				...input,
				leaseMs: activeLeaseMs
			}) as TTask;
			await options.tasks.set(updatedTask.id, updatedTask);
			return updatedTask;
		},
		requeue: async (taskId, input = {}) => {
			const task = await getTask(taskId);
			ensureOwnedByWorker(task);
			const updatedTask = requeueVoiceOpsTask(task, input) as TTask;
			await options.tasks.set(updatedTask.id, updatedTask);
			await options.leases.release({
				taskId,
				workerId: options.workerId
			});
			return updatedTask;
		},
		release: async (taskId) =>
			options.leases.release({
				taskId,
				workerId: options.workerId
			})
	};
};

export const createVoiceOpsTaskProcessorWorker = <
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
>(
	options: VoiceOpsTaskProcessorWorkerOptions<TTask>
) => ({
	drain: async (): Promise<VoiceOpsTaskProcessorWorkerResult> => {
		const result: VoiceOpsTaskProcessorWorkerResult = {
			attempted: 0,
			completed: 0,
			deadLettered: 0,
			failed: 0,
			idle: 0,
			requeued: 0
		};
		const processedTaskIds = new Set<string>();

		for (;;) {
			const task = await options.worker.claimNext({
				...options.filters,
				excludeTaskIds: [
					...(options.filters?.excludeTaskIds ?? []),
					...processedTaskIds
				]
			});
			if (!task) {
				result.idle += 1;
				return result;
			}

			result.attempted += 1;
			processedTaskIds.add(task.id);

			try {
				const handlerResult = await options.process(task);
				const action =
					typeof handlerResult === 'string'
						? handlerResult
						: handlerResult?.action ?? 'complete';
				const detail =
					typeof handlerResult === 'object' && handlerResult
						? handlerResult.detail
						: undefined;

				if (action === 'requeue') {
					await options.worker.requeue(task.id, {
						detail
					});
					result.requeued += 1;
					continue;
				}

				await options.worker.complete(task.id, {
					detail
				});
				result.completed += 1;
			} catch (error) {
				await options.onError?.(error, task);
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				const failedTask = failVoiceOpsTask(task, {
					actor: task.claimedBy ?? 'ops-worker',
					error: errorMessage
				}) as TTask;

				if (shouldDeadLetterTask(failedTask, options.maxFailures)) {
					const deadLetterTask = deadLetterVoiceOpsTask(failedTask, {
						actor: task.claimedBy ?? 'ops-worker',
						detail: failedTask.processingError ?? 'Task moved to dead-letter queue'
					}) as TTask;
					await options.tasks.set(deadLetterTask.id, deadLetterTask);
					await options.deadLetters?.set(deadLetterTask.id, deadLetterTask);
					await options.worker.release(task.id);
					await options.onDeadLetter?.(deadLetterTask);
					result.deadLettered += 1;
					continue;
				}

				const requeuedTask = requeueVoiceOpsTask(failedTask, {
					actor: task.claimedBy ?? 'ops-worker',
					detail: failedTask.processingError ?? 'Task requeued after processing failure'
				}) as TTask;
				await options.tasks.set(requeuedTask.id, requeuedTask);
				await options.worker.release(task.id);
				result.failed += 1;
			}
		}
	}
});

export const createVoiceOpsTaskProcessorWorkerLoop = <
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
>(
	options: VoiceOpsTaskProcessorWorkerLoopOptions<TTask>
): VoiceOpsTaskProcessorWorkerLoop => {
	const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 1_000);
	let timer: ReturnType<typeof setInterval> | undefined;
	let running = false;

	const tick = async () => options.worker.drain();

	return {
		isRunning: () => running,
		start: () => {
			if (timer) {
				return;
			}

			running = true;
			timer = setInterval(() => {
				void tick().catch((error) => {
					void options.onError?.(error);
				});
			}, pollIntervalMs);
		},
		stop: () => {
			if (timer) {
				clearInterval(timer);
				timer = undefined;
			}
			running = false;
		},
		tick
	};
};
