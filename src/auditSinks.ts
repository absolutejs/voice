import type { S3Client, S3Options } from 'bun';
import type {
	StoredVoiceAuditEvent,
	VoiceAuditEventStore,
	VoiceAuditEventType
} from './audit';
import { redactVoiceAuditEvents } from './auditExport';
import type {
	VoiceIdempotencyStore,
	VoiceRedisTaskLeaseCoordinator
} from './queue';
import type { VoiceTraceRedactionConfig } from './trace';

export type VoiceAuditSinkDeliveryStatus = 'delivered' | 'failed' | 'skipped';
export type VoiceAuditSinkDeliveryQueueStatus =
	| VoiceAuditSinkDeliveryStatus
	| 'pending';

export type VoiceAuditSinkDeliveryResult = {
	attempts: number;
	deliveredAt?: number;
	deliveredTo?: string;
	error?: string;
	eventCount: number;
	responseBody?: unknown;
	status: VoiceAuditSinkDeliveryStatus;
};

export type VoiceAuditSink = {
	deliver: (input: {
		events: StoredVoiceAuditEvent[];
	}) => Promise<VoiceAuditSinkDeliveryResult> | VoiceAuditSinkDeliveryResult;
	eventTypes?: VoiceAuditEventType[];
	id: string;
	kind?: string;
};

export type VoiceAuditSinkFanoutResult = {
	deliveredAt: number;
	eventCount: number;
	sinkDeliveries: Record<string, VoiceAuditSinkDeliveryResult>;
	status: VoiceAuditSinkDeliveryStatus;
};

export type VoiceAuditSinkDeliveryRecord = {
	createdAt: number;
	deliveredAt?: number;
	deliveryAttempts?: number;
	deliveryError?: string;
	deliveryStatus: VoiceAuditSinkDeliveryQueueStatus;
	events: StoredVoiceAuditEvent[];
	id: string;
	sinkDeliveries?: Record<string, VoiceAuditSinkDeliveryResult>;
	updatedAt: number;
};

export type VoiceAuditSinkDeliveryStore<
	TDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord
> = {
	get: (id: string) => Promise<TDelivery | undefined> | TDelivery | undefined;
	list: () => Promise<TDelivery[]> | TDelivery[];
	remove: (id: string) => Promise<void> | void;
	set: (id: string, delivery: TDelivery) => Promise<void> | void;
};

export type VoiceAuditHTTPSinkOptions<
	TBody extends Record<string, unknown> = Record<string, unknown>
> = {
	backoffMs?: number;
	body?: (input: {
		events: StoredVoiceAuditEvent[];
	}) => Promise<TBody> | TBody;
	eventTypes?: VoiceAuditEventType[];
	fetch?: typeof fetch;
	headers?: Record<string, string>;
	id: string;
	kind?: string;
	method?: 'POST' | 'PUT' | 'PATCH';
	retries?: number;
	signingSecret?: string;
	timeoutMs?: number;
	url: string;
};

export type VoiceS3AuditSinkFile = {
	write: (data: string, options?: BlobPropertyBag) => Promise<number> | number;
};

export type VoiceS3AuditSinkClient = Pick<S3Client, 'file'>;

export type VoiceAuditS3SinkOptions<
	TBody extends Record<string, unknown> = Record<string, unknown>
> = S3Options & {
	body?: (input: {
		events: StoredVoiceAuditEvent[];
		key: string;
	}) => Promise<TBody> | TBody;
	client?: VoiceS3AuditSinkClient;
	contentType?: string;
	eventTypes?: VoiceAuditEventType[];
	id: string;
	keyPrefix?: string;
	kind?: string;
};

export type VoiceAuditSinkStoreOptions<
	TEvent extends StoredVoiceAuditEvent = StoredVoiceAuditEvent
> = {
	awaitDelivery?: boolean;
	deliveryQueue?: VoiceAuditSinkDeliveryStore;
	onDelivery?: (result: VoiceAuditSinkFanoutResult) => Promise<void> | void;
	onError?: (error: unknown) => Promise<void> | void;
	redact?: VoiceTraceRedactionConfig;
	sinks: VoiceAuditSink[];
	store: VoiceAuditEventStore<TEvent>;
};

export type VoiceAuditSinkDeliveryWorkerOptions<
	TDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord
> = {
	deadLetters?: VoiceAuditSinkDeliveryStore<TDelivery>;
	deliveries: VoiceAuditSinkDeliveryStore<TDelivery>;
	idempotency?: VoiceIdempotencyStore;
	idempotencyTtlSeconds?: number;
	leaseMs?: number;
	leases: VoiceRedisTaskLeaseCoordinator;
	maxFailures?: number;
	onDeadLetter?: (delivery: TDelivery) => Promise<void> | void;
	redact?: VoiceTraceRedactionConfig;
	sinks: VoiceAuditSink[];
	statuses?: VoiceAuditSinkDeliveryQueueStatus[];
	workerId: string;
};

export type VoiceAuditSinkDeliveryWorkerResult = {
	alreadyProcessed: number;
	attempted: number;
	deadLettered: number;
	delivered: number;
	failed: number;
	skipped: number;
};

export type VoiceAuditSinkDeliveryWorkerLoopOptions<
	TDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord
> = {
	onError?: (error: unknown) => Promise<void> | void;
	pollIntervalMs?: number;
	worker: ReturnType<typeof createVoiceAuditSinkDeliveryWorker<TDelivery>>;
};

export type VoiceAuditSinkDeliveryWorkerLoop = {
	isRunning: () => boolean;
	start: () => void;
	stop: () => void;
	tick: () => Promise<VoiceAuditSinkDeliveryWorkerResult>;
};

export type VoiceAuditSinkDeliveryQueueSummary = {
	deadLettered: number;
	delivered: number;
	failed: number;
	pending: number;
	retryEligible: number;
	skipped: number;
	total: number;
};

const sleep = async (delayMs: number) => {
	if (delayMs <= 0) {
		return;
	}

	await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const toHex = (bytes: Uint8Array) =>
	Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const signVoiceAuditSinkBody = async (input: {
	body: string;
	secret: string;
	timestamp: string;
}) => {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(input.secret),
		{
			hash: 'SHA-256',
			name: 'HMAC'
		},
		false,
		['sign']
	);
	const payload = encoder.encode(`${input.timestamp}.${input.body}`);
	const signature = await crypto.subtle.sign('HMAC', key, payload);

	return `sha256=${toHex(new Uint8Array(signature))}`;
};

const createVoiceAuditSinkDeliveryError = (input: {
	attempt: number;
	error?: unknown;
	response?: Response;
}) => {
	if (input.response) {
		const statusText = input.response.statusText?.trim();
		return `Attempt ${input.attempt} failed with audit sink response ${input.response.status}${statusText ? ` ${statusText}` : ''}.`;
	}

	if (input.error instanceof Error) {
		return `Attempt ${input.attempt} failed: ${input.error.message}`;
	}

	return `Attempt ${input.attempt} failed: ${String(input.error)}`;
};

const normalizeVoiceAuditS3KeyPrefix = (prefix?: string) =>
	prefix?.trim().replace(/^\/+|\/+$/g, '') ?? 'voice/audit-deliveries';

const createVoiceAuditS3ObjectKey = (
	prefix: string,
	events: StoredVoiceAuditEvent[]
) => {
	const firstEvent = events[0];
	const safeSessionId = encodeURIComponent(firstEvent?.sessionId ?? 'audit');
	const safeEventId = encodeURIComponent(firstEvent?.id ?? crypto.randomUUID());
	return `${prefix}/${safeSessionId}/${Date.now()}-${safeEventId}.json`;
};

const resolveVoiceS3DeliveredTo = (options: S3Options, key: string) => {
	const bucket = (options as { bucket?: string }).bucket;
	return bucket ? `s3://${bucket}/${key}` : `s3://${key}`;
};

const aggregateVoiceAuditSinkDeliveryStatus = (
	deliveries: Record<string, VoiceAuditSinkDeliveryResult>
): VoiceAuditSinkDeliveryStatus => {
	const statuses = Object.values(deliveries).map((delivery) => delivery.status);
	if (statuses.length === 0 || statuses.every((status) => status === 'skipped')) {
		return 'skipped';
	}

	if (statuses.some((status) => status === 'failed')) {
		return 'failed';
	}

	return 'delivered';
};

export const createVoiceAuditSinkDeliveryId = (
	events: StoredVoiceAuditEvent[]
) => {
	const firstEvent = events[0];
	return [
		firstEvent?.sessionId ?? 'audit',
		firstEvent?.traceId ?? 'sink',
		String(firstEvent?.at ?? Date.now()),
		crypto.randomUUID()
	]
		.map(encodeURIComponent)
		.join(':');
};

export const createVoiceAuditSinkDeliveryRecord = (
	input: {
		createdAt?: number;
		events: StoredVoiceAuditEvent[];
		id?: string;
	} & Partial<
		Omit<
			VoiceAuditSinkDeliveryRecord,
			'createdAt' | 'events' | 'id'
		>
	>
): VoiceAuditSinkDeliveryRecord => {
	const createdAt = input.createdAt ?? Date.now();
	return {
		createdAt,
		deliveredAt: input.deliveredAt,
		deliveryAttempts: input.deliveryAttempts,
		deliveryError: input.deliveryError,
		deliveryStatus: input.deliveryStatus ?? 'pending',
		events: input.events,
		id: input.id ?? createVoiceAuditSinkDeliveryId(input.events),
		sinkDeliveries: input.sinkDeliveries,
		updatedAt: input.updatedAt ?? createdAt
	};
};

export const createVoiceAuditHTTPSink = <
	TBody extends Record<string, unknown> = Record<string, unknown>
>(
	options: VoiceAuditHTTPSinkOptions<TBody>
): VoiceAuditSink => ({
	deliver: async ({ events }) => {
		const fetchImpl = options.fetch ?? globalThis.fetch;
		if (typeof fetchImpl !== 'function') {
			return {
				attempts: 0,
				deliveredTo: options.url,
				error: 'Audit sink delivery failed: fetch is not available in this runtime.',
				eventCount: events.length,
				status: 'failed'
			};
		}

		const maxRetries = Math.max(0, options.retries ?? 0);
		const backoffMs = Math.max(0, options.backoffMs ?? 250);
		const timeoutMs = Math.max(0, options.timeoutMs ?? 10_000);
		const payload = options.body
			? await options.body({ events })
			: {
					eventCount: events.length,
					events,
					source: 'absolutejs-voice'
				};
		const body = JSON.stringify(payload);
		let lastError = 'Audit sink delivery failed.';

		for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
			let controller: AbortController | undefined;
			let timeout: ReturnType<typeof setTimeout> | undefined;

			try {
				const headers: Record<string, string> = {
					'content-type': 'application/json',
					...options.headers
				};

				if (options.signingSecret) {
					const timestamp = String(Date.now());
					headers['x-absolutejs-timestamp'] = timestamp;
					headers['x-absolutejs-signature'] = await signVoiceAuditSinkBody({
						body,
						secret: options.signingSecret,
						timestamp
					});
				}

				controller = timeoutMs > 0 ? new AbortController() : undefined;
				if (controller && timeoutMs > 0) {
					timeout = setTimeout(() => controller?.abort(), timeoutMs);
				}

				const response = await fetchImpl(options.url, {
					body,
					headers,
					method: options.method ?? 'POST',
					signal: controller?.signal
				});
				if (response.ok) {
					let responseBody: unknown;
					try {
						responseBody = await response.clone().json();
					} catch {
						responseBody = undefined;
					}

					return {
						attempts: attempt,
						deliveredAt: Date.now(),
						deliveredTo: options.url,
						eventCount: events.length,
						responseBody,
						status: 'delivered'
					};
				}

				lastError = createVoiceAuditSinkDeliveryError({
					attempt,
					response
				});
			} catch (error) {
				lastError = createVoiceAuditSinkDeliveryError({
					attempt,
					error
				});
			} finally {
				if (timeout) {
					clearTimeout(timeout);
				}
			}

			if (attempt <= maxRetries) {
				await sleep(backoffMs * attempt);
			}
		}

		return {
			attempts: maxRetries + 1,
			deliveredTo: options.url,
			error: lastError,
			eventCount: events.length,
			status: 'failed'
		};
	},
	eventTypes: options.eventTypes,
	id: options.id,
	kind: options.kind ?? 'http'
});

export const createVoiceAuditS3Sink = <
	TBody extends Record<string, unknown> = Record<string, unknown>
>(
	options: VoiceAuditS3SinkOptions<TBody>
): VoiceAuditSink => {
	const client = options.client ?? new Bun.S3Client(options);
	const keyPrefix = normalizeVoiceAuditS3KeyPrefix(options.keyPrefix);

	return {
		deliver: async ({ events }) => {
			const key = createVoiceAuditS3ObjectKey(keyPrefix, events);
			const payload = options.body
				? await options.body({ events, key })
				: {
						eventCount: events.length,
						events,
						key,
						source: 'absolutejs-voice'
					};

			try {
				const file = client.file(key, options) as VoiceS3AuditSinkFile;
				await file.write(JSON.stringify(payload), {
					type: options.contentType ?? 'application/json'
				});

				return {
					attempts: 1,
					deliveredAt: Date.now(),
					deliveredTo: resolveVoiceS3DeliveredTo(options, key),
					eventCount: events.length,
					responseBody: { key },
					status: 'delivered'
				};
			} catch (error) {
				return {
					attempts: 1,
					deliveredTo: resolveVoiceS3DeliveredTo(options, key),
					error: error instanceof Error ? error.message : String(error),
					eventCount: events.length,
					status: 'failed'
				};
			}
		},
		eventTypes: options.eventTypes,
		id: options.id,
		kind: options.kind ?? 's3'
	};
};

export const deliverVoiceAuditEventsToSinks = async (input: {
	events: StoredVoiceAuditEvent[];
	redact?: VoiceTraceRedactionConfig;
	sinks: VoiceAuditSink[];
}): Promise<VoiceAuditSinkFanoutResult> => {
	const events =
		input.redact === false
			? input.events
			: redactVoiceAuditEvents(input.events, input.redact ?? true);
	const sinkDeliveries: Record<string, VoiceAuditSinkDeliveryResult> = {};

	for (const sink of input.sinks) {
		const sinkEvents = sink.eventTypes?.length
			? events.filter((event) => sink.eventTypes?.includes(event.type))
			: events;

		if (sinkEvents.length === 0) {
			sinkDeliveries[sink.id] = {
				attempts: 0,
				eventCount: 0,
				status: 'skipped'
			};
			continue;
		}

		try {
			sinkDeliveries[sink.id] = await sink.deliver({
				events: sinkEvents
			});
		} catch (error) {
			sinkDeliveries[sink.id] = {
				attempts: 1,
				error: error instanceof Error ? error.message : String(error),
				eventCount: sinkEvents.length,
				status: 'failed'
			};
		}
	}

	return {
		deliveredAt: Date.now(),
		eventCount: events.length,
		sinkDeliveries,
		status: aggregateVoiceAuditSinkDeliveryStatus(sinkDeliveries)
	};
};

export const createVoiceAuditSinkStore = <
	TEvent extends StoredVoiceAuditEvent = StoredVoiceAuditEvent
>(
	options: VoiceAuditSinkStoreOptions<TEvent>
): VoiceAuditEventStore<TEvent> => {
	const deliver = async (event: TEvent) => {
		const result = await deliverVoiceAuditEventsToSinks({
			events: [event],
			redact: options.redact,
			sinks: options.sinks
		});
		await options.onDelivery?.(result);
	};

	return {
		append: async (event) => {
			const stored = await options.store.append(event);

			if (options.deliveryQueue) {
				const delivery = createVoiceAuditSinkDeliveryRecord({
					events: [stored]
				});
				await options.deliveryQueue.set(delivery.id, delivery);
				return stored;
			}

			const delivery = deliver(stored);

			if (options.awaitDelivery) {
				await delivery;
			} else {
				delivery.catch((error) => {
					void options.onError?.(error);
				});
			}

			return stored;
		},
		get: (id) => options.store.get(id),
		list: (filter) => options.store.list(filter)
	};
};

export const createVoiceMemoryAuditSinkDeliveryStore = <
	TDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord
>(): VoiceAuditSinkDeliveryStore<TDelivery> => {
	const deliveries = new Map<string, TDelivery>();

	return {
		get: async (id) => deliveries.get(id),
		list: async () =>
			[...deliveries.values()].sort(
				(left, right) =>
					left.createdAt - right.createdAt || left.id.localeCompare(right.id)
			),
		remove: async (id) => {
			deliveries.delete(id);
		},
		set: async (id, delivery) => {
			deliveries.set(id, delivery);
		}
	};
};

const shouldProcessAuditDeliveryStatus = (
	status: VoiceAuditSinkDeliveryQueueStatus,
	allowed: VoiceAuditSinkDeliveryQueueStatus[]
) => allowed.includes(status);

const shouldDeadLetterAuditDelivery = (
	delivery: VoiceAuditSinkDeliveryRecord,
	maxFailures: number | undefined
) =>
	typeof maxFailures === 'number' &&
	maxFailures > 0 &&
	(delivery.deliveryAttempts ?? 0) >= maxFailures;

export const summarizeVoiceAuditSinkDeliveries = <
	TDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord
>(
	deliveries: TDelivery[],
	input: {
		deadLetters?: VoiceAuditSinkDeliveryStore<TDelivery>;
	} = {}
): Promise<VoiceAuditSinkDeliveryQueueSummary> | VoiceAuditSinkDeliveryQueueSummary => {
	const buildSummary = async () => {
		const deadLetterIds = new Set(
			input.deadLetters ? (await input.deadLetters.list()).map((delivery) => delivery.id) : []
		);
		const summary: VoiceAuditSinkDeliveryQueueSummary = {
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

	return input.deadLetters ? buildSummary() : buildSummary();
};

export const createVoiceAuditSinkDeliveryWorker = <
	TDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord
>(
	options: VoiceAuditSinkDeliveryWorkerOptions<TDelivery>
) => {
	const allowedStatuses = options.statuses ?? ['pending', 'failed'];
	const leaseMs = Math.max(1, options.leaseMs ?? 30_000);

	return {
		drain: async (): Promise<VoiceAuditSinkDeliveryWorkerResult> => {
			const result: VoiceAuditSinkDeliveryWorkerResult = {
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
					!shouldProcessAuditDeliveryStatus(
						delivery.deliveryStatus,
						allowedStatuses
					)
				) {
					continue;
				}

				if (shouldDeadLetterAuditDelivery(delivery, options.maxFailures)) {
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
					const idempotencyKey = `${delivery.id}:audit-sinks`;
					if (
						options.idempotency &&
						(await options.idempotency.has(idempotencyKey))
					) {
						result.alreadyProcessed += 1;
						continue;
					}

					result.attempted += 1;
					const fanout = await deliverVoiceAuditEventsToSinks({
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
							shouldDeadLetterAuditDelivery(
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

export const createVoiceAuditSinkDeliveryWorkerLoop = <
	TDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord
>(
	options: VoiceAuditSinkDeliveryWorkerLoopOptions<TDelivery>
): VoiceAuditSinkDeliveryWorkerLoop => {
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
