import {
	buildVoiceOpsTaskFromSLABreach,
	createVoiceTaskCreatedEvent,
	createVoiceTaskSLABreachedEvent,
	hasVoiceOpsTaskSLABreach,
	isVoiceOpsTaskOverdue,
	markVoiceOpsTaskSLABreached
} from './ops';
import {
	createVoiceIntegrationSinkWorker,
	createVoiceIntegrationSinkWorkerLoop,
	createVoiceOpsTaskProcessorWorker,
	createVoiceOpsTaskProcessorWorkerLoop,
	createVoiceOpsTaskWorker,
	createVoiceWebhookDeliveryWorker,
	createVoiceWebhookDeliveryWorkerLoop,
	summarizeVoiceIntegrationEvents,
	summarizeVoiceOpsTaskQueue
} from './queue';
import { recordVoiceRuntimeOps } from './runtimeOps';
import type {
	StoredVoiceIntegrationEvent,
	StoredVoiceOpsTask,
	VoiceIntegrationWebhookConfig,
	VoiceOpsSLABreachPolicy
} from './ops';
import type {
	VoiceIntegrationSinkWorkerLoop,
	VoiceIntegrationSinkWorkerOptions,
	VoiceIntegrationSinkWorkerResult,
	VoiceIntegrationEventQueueSummary,
	VoiceOpsTaskProcessorWorkerLoop,
	VoiceOpsTaskProcessorWorkerOptions,
	VoiceOpsTaskProcessorWorkerResult,
	VoiceOpsTaskQueueSummary,
	VoiceRedisTaskLeaseCoordinator,
	VoiceWebhookDeliveryWorkerLoop,
	VoiceWebhookDeliveryWorkerOptions,
	VoiceWebhookDeliveryWorkerResult
} from './queue';
import type {
	VoiceCallDisposition,
	VoiceRuntimeOpsConfig,
	VoiceSessionHandle,
	VoiceSessionRecord
} from './types';

export type VoiceOpsRuntimeWebhookWorkerConfig<
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
> = Omit<
	VoiceWebhookDeliveryWorkerOptions<StoredVoiceIntegrationEvent>,
	'events' | 'webhook'
> &
	VoiceIntegrationWebhookConfig & {
	autoStart?: boolean;
	pollIntervalMs?: number;
};

export type VoiceOpsRuntimeSinkWorkerConfig<
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
> = Omit<
	VoiceIntegrationSinkWorkerOptions<StoredVoiceIntegrationEvent>,
	'events' | 'sinks'
> & {
	autoStart?: boolean;
	pollIntervalMs?: number;
};

export type VoiceOpsRuntimeTaskWorkerConfig<
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
> = Omit<
	VoiceOpsTaskProcessorWorkerOptions<StoredVoiceOpsTask>,
	'tasks' | 'worker'
> & {
	autoStart?: boolean;
	leaseMs?: number;
	leases: VoiceRedisTaskLeaseCoordinator;
	pollIntervalMs?: number;
	workerId: string;
};

export type VoiceOpsRuntimeConfig<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	ops: VoiceRuntimeOpsConfig<TContext, TSession, TResult>;
	sla?: {
		followUpTask?: VoiceOpsSLABreachPolicy;
	};
	sinks?: VoiceOpsRuntimeSinkWorkerConfig;
	tasks?: VoiceOpsRuntimeTaskWorkerConfig;
	webhooks?: VoiceOpsRuntimeWebhookWorkerConfig;
};

export type VoiceOpsRuntimeTickResult = {
	sla?: {
		breached: number;
		events: number;
		followUpTasks: number;
	};
	sinks?: VoiceIntegrationSinkWorkerResult;
	tasks?: VoiceOpsTaskProcessorWorkerResult;
	webhooks?: VoiceWebhookDeliveryWorkerResult;
};

export type VoiceOpsRuntimeSummary = {
	sinks?: VoiceIntegrationEventQueueSummary;
	tasks?: VoiceOpsTaskQueueSummary;
	webhooks?: VoiceIntegrationEventQueueSummary;
};

export type VoiceOpsRuntime<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	isRunning: () => boolean;
	checkSLA: (input?: { at?: number }) => Promise<{
		breached: number;
		events: number;
		followUpTasks: number;
	}>;
	record: (input: {
		api: VoiceSessionHandle<TContext, TSession, TResult>;
		context: TContext;
		disposition: VoiceCallDisposition;
		metadata?: Record<string, unknown>;
		reason?: string;
		session: TSession;
		target?: string;
	}) => Promise<void>;
	start: () => void;
	stop: () => void;
	summarize: () => Promise<VoiceOpsRuntimeSummary>;
	tick: () => Promise<VoiceOpsRuntimeTickResult>;
};

const resolveTaskStores = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(config: VoiceOpsRuntimeConfig<TContext, TSession, TResult>) => {
	if (!config.ops.tasks) {
		throw new Error(
			'Voice ops runtime task workers require ops.tasks to be configured.'
		);
	}

	return config.ops.tasks;
};

const resolveEventStores = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(config: VoiceOpsRuntimeConfig<TContext, TSession, TResult>) => {
	if (!config.ops.events) {
		throw new Error(
			'Voice ops runtime webhook workers require ops.events to be configured.'
		);
	}

	return config.ops.events;
};

export const createVoiceOpsRuntime = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	config: VoiceOpsRuntimeConfig<TContext, TSession, TResult>
): VoiceOpsRuntime<TContext, TSession, TResult> => {
	let webhookLoop: VoiceWebhookDeliveryWorkerLoop | undefined;
	let sinkLoop: VoiceIntegrationSinkWorkerLoop | undefined;
	let taskLoop: VoiceOpsTaskProcessorWorkerLoop | undefined;

	if (config.webhooks) {
		const events = resolveEventStores(config);
		const {
			autoStart: _autoStart,
			pollIntervalMs: _pollIntervalMs,
			backoffMs,
			eventTypes,
			fetch,
			headers,
			retries,
			signingSecret,
			timeoutMs,
			url,
			...workerConfig
		} = config.webhooks;
		const worker = createVoiceWebhookDeliveryWorker({
			...workerConfig,
			events,
			webhook: {
				backoffMs,
				eventTypes,
				fetch,
				headers,
				retries,
				signingSecret,
				timeoutMs,
				url
			}
		});
		webhookLoop = createVoiceWebhookDeliveryWorkerLoop({
			pollIntervalMs: config.webhooks.pollIntervalMs,
			worker
		});
	}

	if (config.sinks) {
		const events = resolveEventStores(config);
		if (!config.ops.sinks?.length) {
			throw new Error(
				'Voice ops runtime sink workers require ops.sinks to be configured.'
			);
		}
		const {
			autoStart: _autoStart,
			pollIntervalMs: _pollIntervalMs,
			...workerConfig
		} = config.sinks;
		const worker = createVoiceIntegrationSinkWorker({
			...workerConfig,
			events,
			sinks: config.ops.sinks
		});
		sinkLoop = createVoiceIntegrationSinkWorkerLoop({
			pollIntervalMs: config.sinks.pollIntervalMs,
			worker
		});
	}

	if (config.tasks) {
		const tasks = resolveTaskStores(config);
		const taskWorker = createVoiceOpsTaskWorker({
			leaseMs: config.tasks.leaseMs,
			leases: config.tasks.leases,
			tasks,
			workerId: config.tasks.workerId
		});
		const processor = createVoiceOpsTaskProcessorWorker({
			...config.tasks,
			tasks,
			worker: taskWorker
		});
		taskLoop = createVoiceOpsTaskProcessorWorkerLoop({
			pollIntervalMs: config.tasks.pollIntervalMs,
			worker: processor
		});
	}

	const start = () => {
		if (config.webhooks?.autoStart) {
			webhookLoop?.start();
		}
		if (config.sinks?.autoStart) {
			sinkLoop?.start();
		}
		if (config.tasks?.autoStart) {
			taskLoop?.start();
		}
	};

	const stop = () => {
		webhookLoop?.stop();
		sinkLoop?.stop();
		taskLoop?.stop();
	};

	const checkSLA = async (input: { at?: number } = {}) => {
		const result = {
			breached: 0,
			events: 0,
			followUpTasks: 0
		};

		if (!config.ops.tasks) {
			return result;
		}

		const at = input.at ?? Date.now();
		const tasks = await config.ops.tasks.list();
		for (const task of tasks) {
			if (!isVoiceOpsTaskOverdue(task, { at }) || hasVoiceOpsTaskSLABreach(task)) {
				continue;
			}

			const breachedTask = markVoiceOpsTaskSLABreached(task, {
				at
			});
			await config.ops.tasks.set(breachedTask.id, breachedTask);
			result.breached += 1;

			if (config.ops.events) {
				const event = createVoiceTaskSLABreachedEvent(breachedTask);
				await config.ops.events.set(event.id, event);
				result.events += 1;
			}

			if (config.sla?.followUpTask) {
				const followUpTask = buildVoiceOpsTaskFromSLABreach(
					breachedTask,
					config.sla.followUpTask
				);
				await config.ops.tasks.set(followUpTask.id, followUpTask);
				result.followUpTasks += 1;

				if (config.ops.events) {
					const event = createVoiceTaskCreatedEvent(followUpTask);
					await config.ops.events.set(event.id, event);
				}
			}
		}

		return result;
	};

	return {
		checkSLA,
		isRunning: () =>
			Boolean(
				webhookLoop?.isRunning() ||
					sinkLoop?.isRunning() ||
					taskLoop?.isRunning()
			),
		record: async (input) => {
			await recordVoiceRuntimeOps({
				...input,
				config: config.ops
			});
		},
		start,
		stop,
		summarize: async () => {
			const summary: VoiceOpsRuntimeSummary = {};

			if (config.ops.events) {
				summary.webhooks = await summarizeVoiceIntegrationEvents(
					await config.ops.events.list(),
					{
						deadLetters: config.webhooks?.deadLetters
					}
				);
				summary.sinks = await summarizeVoiceIntegrationEvents(
					await config.ops.events.list(),
					{
						deadLetters: config.sinks?.deadLetters
					}
				);
			}

			if (config.ops.tasks) {
				summary.tasks = await summarizeVoiceOpsTaskQueue(
					await config.ops.tasks.list(),
					{
						deadLetters: config.tasks?.deadLetters
					}
				);
			}

			return summary;
		},
		tick: async () => {
			const result: VoiceOpsRuntimeTickResult = {};

			if (config.sla) {
				result.sla = await checkSLA();
			}

			if (webhookLoop) {
				result.webhooks = await webhookLoop.tick();
			}

			if (sinkLoop) {
				result.sinks = await sinkLoop.tick();
			}

			if (taskLoop) {
				result.tasks = await taskLoop.tick();
			}

			return result;
		}
	};
};
