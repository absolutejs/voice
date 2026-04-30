import type { S3Client, S3Options } from 'bun';

export type VoiceTraceEventType =
	| 'assistant.guardrail'
	| 'assistant.memory'
	| 'assistant.run'
	| 'agent.context'
	| 'agent.handoff'
	| 'agent.model'
	| 'agent.result'
	| 'agent.tool'
	| 'call.handoff'
	| 'call.lifecycle'
	| 'client.barge_in'
	| 'client.browser_media'
	| 'client.live_latency'
	| 'client.reconnect'
	| 'operator.action'
	| 'provider.decision'
	| 'session.error'
	| 'turn.assistant'
	| 'turn.committed'
	| 'turn.cost'
	| 'turn_latency.stage'
	| 'turn.transcript'
	| 'workflow.contract';

export type VoiceTraceEvent<
	TPayload extends Record<string, unknown> = Record<string, unknown>
> = {
	at: number;
	id?: string;
	metadata?: Record<string, unknown>;
	payload: TPayload;
	scenarioId?: string;
	sessionId: string;
	traceId?: string;
	turnId?: string;
	type: VoiceTraceEventType;
};

export type StoredVoiceTraceEvent<
	TPayload extends Record<string, unknown> = Record<string, unknown>
> = VoiceTraceEvent<TPayload> & {
	id: string;
};

export type VoiceTraceEventFilter = {
	limit?: number;
	scenarioId?: string;
	sessionId?: string;
	traceId?: string;
	turnId?: string;
	type?: VoiceTraceEventType | VoiceTraceEventType[];
};

export type VoiceTraceEventStore<
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
> = {
	append: (event: VoiceTraceEvent | TEvent) => Promise<TEvent>;
	get: (id: string) => Promise<TEvent | undefined>;
	list: (filter?: VoiceTraceEventFilter) => Promise<TEvent[]>;
	remove: (id: string) => Promise<void>;
};

export type VoiceTracePruneFilter = Omit<VoiceTraceEventFilter, 'limit'>;

export type VoiceTracePruneOptions = {
	before?: number;
	beforeOrAt?: number;
	dryRun?: boolean;
	filter?: VoiceTracePruneFilter;
	keepNewest?: number;
	limit?: number;
	store: VoiceTraceEventStore;
};

export type VoiceTracePruneResult = {
	deleted: StoredVoiceTraceEvent[];
	deletedCount: number;
	dryRun: boolean;
	scannedCount: number;
};

export type VoiceTraceSinkDeliveryStatus = 'delivered' | 'failed' | 'skipped';
export type VoiceTraceSinkDeliveryQueueStatus =
	| VoiceTraceSinkDeliveryStatus
	| 'pending';

export type VoiceTraceSinkDeliveryResult = {
	attempts: number;
	deliveredAt?: number;
	deliveredTo?: string;
	error?: string;
	eventCount: number;
	responseBody?: unknown;
	status: VoiceTraceSinkDeliveryStatus;
};

export type VoiceTraceSink = {
	deliver: (input: {
		events: StoredVoiceTraceEvent[];
	}) => Promise<VoiceTraceSinkDeliveryResult> | VoiceTraceSinkDeliveryResult;
	eventTypes?: VoiceTraceEventType[];
	id: string;
	kind?: string;
};

export type VoiceTraceSinkFanoutResult = {
	deliveredAt: number;
	eventCount: number;
	sinkDeliveries: Record<string, VoiceTraceSinkDeliveryResult>;
	status: VoiceTraceSinkDeliveryStatus;
};

export type VoiceTraceSinkDeliveryRecord = {
	createdAt: number;
	deliveredAt?: number;
	deliveryAttempts?: number;
	deliveryError?: string;
	deliveryStatus: VoiceTraceSinkDeliveryQueueStatus;
	events: StoredVoiceTraceEvent[];
	id: string;
	sinkDeliveries?: Record<string, VoiceTraceSinkDeliveryResult>;
	updatedAt: number;
};

export type VoiceTraceSinkDeliveryStore<
	TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
> = {
	get: (id: string) => Promise<TDelivery | undefined> | TDelivery | undefined;
	list: () => Promise<TDelivery[]> | TDelivery[];
	remove: (id: string) => Promise<void> | void;
	set: (id: string, delivery: TDelivery) => Promise<void> | void;
};

export type VoiceTraceHTTPSinkOptions<
	TBody extends Record<string, unknown> = Record<string, unknown>
> = {
	backoffMs?: number;
	body?: (input: {
		events: StoredVoiceTraceEvent[];
	}) => Promise<TBody> | TBody;
	eventTypes?: VoiceTraceEventType[];
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

export type VoiceS3TraceSinkFile = {
	write: (data: string, options?: BlobPropertyBag) => Promise<number> | number;
};

export type VoiceS3TraceSinkClient = Pick<S3Client, 'file'>;

export type VoiceTraceS3SinkOptions<
	TBody extends Record<string, unknown> = Record<string, unknown>
> = S3Options & {
	body?: (input: {
		events: StoredVoiceTraceEvent[];
		key: string;
	}) => Promise<TBody> | TBody;
	client?: VoiceS3TraceSinkClient;
	contentType?: string;
	eventTypes?: VoiceTraceEventType[];
	id: string;
	keyPrefix?: string;
	kind?: string;
};

export type VoiceTraceSinkStoreOptions<
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
> = {
	awaitDelivery?: boolean;
	deliveryQueue?: VoiceTraceSinkDeliveryStore;
	onDelivery?: (result: VoiceTraceSinkFanoutResult) => Promise<void> | void;
	onError?: (error: unknown) => Promise<void> | void;
	redact?: VoiceTraceRedactionConfig;
	sinks: VoiceTraceSink[];
	store: VoiceTraceEventStore<TEvent>;
};

export type VoiceTraceSummary = {
	assistantReplyCount: number;
	callDurationMs?: number;
	cost: {
		estimatedRelativeCostUnits: number;
		totalBillableAudioMs: number;
	};
	endedAt?: number;
	errorCount: number;
	eventCount: number;
	failed: boolean;
	handoffCount: number;
	modelCallCount: number;
	sessionId?: string;
	startedAt?: number;
	toolCallCount: number;
	toolErrorCount: number;
	traceId?: string;
	transcriptCount: number;
	turnCount: number;
};

export type VoiceTraceIssueSeverity = 'error' | 'warning';

export type VoiceTraceIssue = {
	code: string;
	message: string;
	severity: VoiceTraceIssueSeverity;
};

export type VoiceTraceEvaluationOptions = {
	maxHandoffs?: number;
	maxModelCallsPerTurn?: number;
	maxToolErrors?: number;
	requireAssistantReply?: boolean;
	requireCompletedCall?: boolean;
	requireTranscript?: boolean;
	requireTurn?: boolean;
};

export type VoiceTraceEvaluation = {
	issues: VoiceTraceIssue[];
	pass: boolean;
	summary: VoiceTraceSummary;
};

export type VoiceTraceRedactionReplacement =
	| string
	| ((input: {
			key?: string;
			path: string[];
			value: string;
	  }) => string);

export type VoiceTraceRedactionOptions = {
	keys?: string[];
	redactEmails?: boolean;
	redactPhoneNumbers?: boolean;
	redactText?: boolean;
	replacement?: VoiceTraceRedactionReplacement;
	textKeys?: string[];
};

export type VoiceTraceRedactionConfig = boolean | VoiceTraceRedactionOptions;

export type VoiceResolvedTraceRedactionOptions = Required<
	Pick<
		VoiceTraceRedactionOptions,
		'redactEmails' | 'redactPhoneNumbers' | 'redactText'
	>
> & {
	keys: string[];
	replacement: VoiceTraceRedactionReplacement;
	textKeys: string[];
};

export const createVoiceTraceEventId = (event: {
	at?: number;
	sessionId: string;
	turnId?: string;
	type: VoiceTraceEventType;
}) =>
	[
		event.sessionId,
		event.turnId ?? 'session',
		event.type,
		String(event.at ?? Date.now()),
		crypto.randomUUID()
	]
		.map(encodeURIComponent)
		.join(':');

export const createVoiceTraceEvent = <
	TEvent extends VoiceTraceEvent = VoiceTraceEvent
>(
	event: TEvent
): StoredVoiceTraceEvent<TEvent['payload']> => ({
	...event,
	at: event.at,
	id:
		event.id ??
		createVoiceTraceEventId({
			at: event.at,
			sessionId: event.sessionId,
			turnId: event.turnId,
			type: event.type
		})
});

export const createVoiceTraceSinkDeliveryId = (events: StoredVoiceTraceEvent[]) => {
	const firstEvent = events[0];
	return [
		firstEvent?.sessionId ?? 'trace',
		firstEvent?.traceId ?? 'sink',
		String(firstEvent?.at ?? Date.now()),
		crypto.randomUUID()
	]
		.map(encodeURIComponent)
		.join(':');
};

export const createVoiceTraceSinkDeliveryRecord = (
	input: {
		createdAt?: number;
		events: StoredVoiceTraceEvent[];
		id?: string;
	} & Partial<
		Omit<
			VoiceTraceSinkDeliveryRecord,
			'createdAt' | 'events' | 'id'
		>
	>
): VoiceTraceSinkDeliveryRecord => {
	const createdAt = input.createdAt ?? Date.now();
	return {
		createdAt,
		deliveredAt: input.deliveredAt,
		deliveryAttempts: input.deliveryAttempts,
		deliveryError: input.deliveryError,
		deliveryStatus: input.deliveryStatus ?? 'pending',
		events: input.events,
		id: input.id ?? createVoiceTraceSinkDeliveryId(input.events),
		sinkDeliveries: input.sinkDeliveries,
		updatedAt: input.updatedAt ?? createdAt
	};
};

const matchesTraceFilter = (
	event: StoredVoiceTraceEvent,
	filter: VoiceTraceEventFilter
) => {
	if (filter.sessionId !== undefined && event.sessionId !== filter.sessionId) {
		return false;
	}

	if (filter.turnId !== undefined && event.turnId !== filter.turnId) {
		return false;
	}

	if (filter.scenarioId !== undefined && event.scenarioId !== filter.scenarioId) {
		return false;
	}

	if (filter.traceId !== undefined && event.traceId !== filter.traceId) {
		return false;
	}

	if (filter.type !== undefined) {
		const types = Array.isArray(filter.type) ? filter.type : [filter.type];
		if (!types.includes(event.type)) {
			return false;
		}
	}

	return true;
};

export const filterVoiceTraceEvents = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(
	events: TEvent[],
	filter: VoiceTraceEventFilter = {}
) => {
	const sorted = events
		.filter((event) => matchesTraceFilter(event, filter))
		.sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));

	return typeof filter.limit === 'number' && filter.limit >= 0
		? sorted.slice(0, filter.limit)
		: sorted;
};

const isPruneTimeMatch = (
	event: StoredVoiceTraceEvent,
	options: Pick<VoiceTracePruneOptions, 'before' | 'beforeOrAt'>
) => {
	if (typeof options.before === 'number' && event.at >= options.before) {
		return false;
	}

	if (typeof options.beforeOrAt === 'number' && event.at > options.beforeOrAt) {
		return false;
	}

	return true;
};

export const selectVoiceTraceEventsForPrune = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(
	events: TEvent[],
	options: Omit<VoiceTracePruneOptions, 'store'> = {}
) => {
	let candidates = filterVoiceTraceEvents(events, options.filter).filter((event) =>
		isPruneTimeMatch(event, options)
	);

	if (typeof options.keepNewest === 'number' && options.keepNewest >= 0) {
		const newestIds = new Set(
			[...candidates]
				.sort((left, right) => right.at - left.at || right.id.localeCompare(left.id))
				.slice(0, options.keepNewest)
				.map((event) => event.id)
		);
		candidates = candidates.filter((event) => !newestIds.has(event.id));
	}

	return typeof options.limit === 'number' && options.limit >= 0
		? candidates.slice(0, options.limit)
		: candidates;
};

export const pruneVoiceTraceEvents = async (
	options: VoiceTracePruneOptions
): Promise<VoiceTracePruneResult> => {
	const events = await options.store.list(options.filter);
	const deleted = selectVoiceTraceEventsForPrune(events, options);

	if (!options.dryRun) {
		await Promise.all(deleted.map((event) => options.store.remove(event.id)));
	}

	return {
		deleted,
		deletedCount: deleted.length,
		dryRun: Boolean(options.dryRun),
		scannedCount: events.length
	};
};

const sleep = async (delayMs: number) => {
	if (delayMs <= 0) {
		return;
	}

	await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const toHex = (bytes: Uint8Array) =>
	Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const signVoiceTraceSinkBody = async (input: {
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

const createVoiceTraceSinkDeliveryError = (input: {
	attempt: number;
	error?: unknown;
	response?: Response;
}) => {
	if (input.response) {
		const statusText = input.response.statusText?.trim();
		return `Attempt ${input.attempt} failed with trace sink response ${input.response.status}${statusText ? ` ${statusText}` : ''}.`;
	}

	if (input.error instanceof Error) {
		return `Attempt ${input.attempt} failed: ${input.error.message}`;
	}

	return `Attempt ${input.attempt} failed: ${String(input.error)}`;
};

const normalizeVoiceTraceS3KeyPrefix = (prefix?: string) =>
	prefix?.trim().replace(/^\/+|\/+$/g, '') ?? 'voice/trace-deliveries';

const createVoiceTraceS3ObjectKey = (
	prefix: string,
	events: StoredVoiceTraceEvent[]
) => {
	const firstEvent = events[0];
	const safeSessionId = encodeURIComponent(firstEvent?.sessionId ?? 'trace');
	const safeEventId = encodeURIComponent(firstEvent?.id ?? crypto.randomUUID());
	return `${prefix}/${safeSessionId}/${Date.now()}-${safeEventId}.json`;
};

const resolveVoiceS3DeliveredTo = (options: S3Options, key: string) => {
	const bucket = (options as { bucket?: string }).bucket;
	return bucket ? `s3://${bucket}/${key}` : `s3://${key}`;
};

const aggregateVoiceTraceSinkDeliveryStatus = (
	deliveries: Record<string, VoiceTraceSinkDeliveryResult>
): VoiceTraceSinkDeliveryStatus => {
	const statuses = Object.values(deliveries).map((delivery) => delivery.status);
	if (statuses.length === 0 || statuses.every((status) => status === 'skipped')) {
		return 'skipped';
	}

	if (statuses.some((status) => status === 'failed')) {
		return 'failed';
	}

	return 'delivered';
};

export const createVoiceTraceHTTPSink = <
	TBody extends Record<string, unknown> = Record<string, unknown>
>(
	options: VoiceTraceHTTPSinkOptions<TBody>
): VoiceTraceSink => ({
	deliver: async ({ events }) => {
		const fetchImpl = options.fetch ?? globalThis.fetch;
		if (typeof fetchImpl !== 'function') {
			return {
				attempts: 0,
				deliveredTo: options.url,
				error: 'Trace sink delivery failed: fetch is not available in this runtime.',
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
		let lastError = 'Trace sink delivery failed.';

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
					headers['x-absolutejs-signature'] = await signVoiceTraceSinkBody({
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

				lastError = createVoiceTraceSinkDeliveryError({
					attempt,
					response
				});
			} catch (error) {
				lastError = createVoiceTraceSinkDeliveryError({
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

export const createVoiceTraceS3Sink = <
	TBody extends Record<string, unknown> = Record<string, unknown>
>(
	options: VoiceTraceS3SinkOptions<TBody>
): VoiceTraceSink => {
	const client = options.client ?? new Bun.S3Client(options);
	const keyPrefix = normalizeVoiceTraceS3KeyPrefix(options.keyPrefix);

	return {
		deliver: async ({ events }) => {
			const key = createVoiceTraceS3ObjectKey(keyPrefix, events);
			const payload = options.body
				? await options.body({ events, key })
				: {
						eventCount: events.length,
						events,
						key,
						source: 'absolutejs-voice'
					};

			try {
				const file = client.file(key, options) as VoiceS3TraceSinkFile;
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

export const deliverVoiceTraceEventsToSinks = async (input: {
	events: StoredVoiceTraceEvent[];
	redact?: VoiceTraceRedactionConfig;
	sinks: VoiceTraceSink[];
}): Promise<VoiceTraceSinkFanoutResult> => {
	const events = input.redact
		? redactVoiceTraceEvents(input.events, input.redact)
		: input.events;
	const sinkDeliveries: Record<string, VoiceTraceSinkDeliveryResult> = {};

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
		status: aggregateVoiceTraceSinkDeliveryStatus(sinkDeliveries)
	};
};

export const createVoiceTraceSinkStore = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(
	options: VoiceTraceSinkStoreOptions<TEvent>
): VoiceTraceEventStore<TEvent> => {
	const deliver = async (event: TEvent) => {
		const result = await deliverVoiceTraceEventsToSinks({
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
				const delivery = createVoiceTraceSinkDeliveryRecord({
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
		list: (filter) => options.store.list(filter),
		remove: (id) => options.store.remove(id)
	};
};

export const createVoiceMemoryTraceSinkDeliveryStore = <
	TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
>(): VoiceTraceSinkDeliveryStore<TDelivery> => {
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

export const createVoiceMemoryTraceEventStore = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(): VoiceTraceEventStore<TEvent> => {
	const events = new Map<string, TEvent>();

	const append: VoiceTraceEventStore<TEvent>['append'] = async (event) => {
		const stored = createVoiceTraceEvent(event) as TEvent;
		events.set(stored.id, stored);
		return stored;
	};

	const get = async (id: string) => events.get(id);

	const list = async (filter?: VoiceTraceEventFilter) =>
		filterVoiceTraceEvents([...events.values()], filter);

	const remove = async (id: string) => {
		events.delete(id);
	};

	return { append, get, list, remove };
};

export const exportVoiceTrace = async (input: {
	filter?: VoiceTraceEventFilter;
	redact?: VoiceTraceRedactionConfig;
	store: VoiceTraceEventStore;
}) => {
	const events = await input.store.list(input.filter);
	return {
		exportedAt: Date.now(),
		events: input.redact ? redactVoiceTraceEvents(events, input.redact) : events,
		filter: input.filter,
		redacted: Boolean(input.redact)
	};
};

const toNumber = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : 0;

const toOptionalNumber = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

const formatTraceValue = (value: unknown): string => {
	if (value === undefined || value === null) {
		return '';
	}

	if (typeof value === 'string') {
		return value;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

const DEFAULT_REDACTION_KEYS = [
	'apiKey',
	'authorization',
	'creditCard',
	'email',
	'externalId',
	'password',
	'phone',
	'secret',
	'ssn',
	'token'
];

const DEFAULT_REDACTION_TEXT_KEYS = [
	'assistantText',
	'content',
	'error',
	'reason',
	'summary',
	'text'
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN =
	/(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/g;

const normalizeRedactionKey = (key: string) =>
	key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export const resolveVoiceTraceRedactionOptions = (
	options: VoiceTraceRedactionConfig = {}
): VoiceResolvedTraceRedactionOptions => ({
	keys: typeof options === 'boolean' ? DEFAULT_REDACTION_KEYS : options.keys ?? DEFAULT_REDACTION_KEYS,
	redactEmails:
		typeof options === 'boolean' ? true : options.redactEmails ?? true,
	redactPhoneNumbers:
		typeof options === 'boolean' ? true : options.redactPhoneNumbers ?? true,
	redactText: typeof options === 'boolean' ? true : options.redactText ?? true,
	replacement:
		typeof options === 'boolean' ? '[redacted]' : options.replacement ?? '[redacted]',
	textKeys:
		typeof options === 'boolean'
			? DEFAULT_REDACTION_TEXT_KEYS
			: options.textKeys ?? DEFAULT_REDACTION_TEXT_KEYS
});

const resolveReplacement = (input: {
	key?: string;
	options: VoiceResolvedTraceRedactionOptions;
	path: string[];
	value: string;
}) =>
	typeof input.options.replacement === 'function'
		? input.options.replacement({
				key: input.key,
				path: input.path,
				value: input.value
			})
		: input.options.replacement;

export const redactVoiceTraceText = (
	value: string,
	options: VoiceTraceRedactionConfig = {},
	input: {
		key?: string;
		path?: string[];
	} = {}
) => {
	const resolved = resolveVoiceTraceRedactionOptions(options);
	let redacted = value;
	const replacement = resolveReplacement({
		key: input.key,
		options: resolved,
		path: input.path ?? [],
		value
	});

	if (resolved.redactEmails) {
		redacted = redacted.replace(EMAIL_PATTERN, replacement);
	}

	if (resolved.redactPhoneNumbers) {
		redacted = redacted.replace(PHONE_PATTERN, replacement);
	}

	return redacted;
};

const redactTraceValue = (
	value: unknown,
	options: VoiceResolvedTraceRedactionOptions,
	path: string[]
): unknown => {
	const key = path.at(-1);
	const normalizedKey = key ? normalizeRedactionKey(key) : undefined;
	const sensitiveKeys = new Set(options.keys.map(normalizeRedactionKey));
	const textKeys = new Set(options.textKeys.map(normalizeRedactionKey));

	if (
		normalizedKey &&
		sensitiveKeys.has(normalizedKey) &&
		(value === null ||
			['boolean', 'number', 'string', 'undefined'].includes(typeof value))
	) {
		return resolveReplacement({
			key,
			options,
			path,
			value: String(value ?? '')
		});
	}

	if (typeof value === 'string') {
		const shouldRedactText =
			options.redactText &&
			(!normalizedKey || textKeys.has(normalizedKey) || path.length === 0);
		return shouldRedactText
			? redactVoiceTraceText(value, options, {
					key,
					path
				})
			: value;
	}

	if (Array.isArray(value)) {
		return value.map((item, index) =>
			redactTraceValue(item, options, [...path, String(index)])
		);
	}

	if (typeof value === 'object' && value) {
		return Object.fromEntries(
			Object.entries(value).map(([entryKey, entryValue]) => [
				entryKey,
				redactTraceValue(entryValue, options, [...path, entryKey])
			])
		);
	}

	return value;
};

export const redactVoiceTraceEvent = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(
	event: TEvent,
	options: VoiceTraceRedactionConfig = {}
): TEvent => {
	const resolved = resolveVoiceTraceRedactionOptions(options);
	return {
		...event,
		metadata: redactTraceValue(
			event.metadata,
			resolved,
			['metadata']
		) as TEvent['metadata'],
		payload: redactTraceValue(event.payload, resolved, ['payload']) as TEvent['payload']
	};
};

export const redactVoiceTraceEvents = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(
	events: TEvent[],
	options: VoiceTraceRedactionConfig = {}
) => events.map((event) => redactVoiceTraceEvent(event, options));

export const summarizeVoiceTrace = (
	events: StoredVoiceTraceEvent[]
): VoiceTraceSummary => {
	const sorted = filterVoiceTraceEvents(events);
	const firstEvent = sorted[0];
	const lastEvent = sorted.at(-1);
	const lifecycleEvents = sorted.filter((event) => event.type === 'call.lifecycle');
	const startEvent = lifecycleEvents.find((event) => event.payload.type === 'start');
	const endEvent = lifecycleEvents
		.toReversed()
		.find((event) => event.payload.type === 'end');
	const costEvents = sorted.filter((event) => event.type === 'turn.cost');
	const toolEvents = sorted.filter((event) => event.type === 'agent.tool');
	const startedAt = startEvent?.at ?? firstEvent?.at;
	const endedAt = endEvent?.at ?? lastEvent?.at;
	const failed =
		sorted.some((event) => event.type === 'session.error') ||
		endEvent?.payload.disposition === 'failed';

	return {
		assistantReplyCount: sorted.filter((event) => event.type === 'turn.assistant')
			.length,
		callDurationMs:
			startedAt !== undefined && endedAt !== undefined
				? Math.max(0, endedAt - startedAt)
				: undefined,
		cost: {
			estimatedRelativeCostUnits: costEvents.reduce(
				(total, event) =>
					total + toNumber(event.payload.estimatedRelativeCostUnits),
				0
			),
			totalBillableAudioMs: costEvents.reduce(
				(total, event) => total + toNumber(event.payload.totalBillableAudioMs),
				0
			)
		},
		endedAt,
		errorCount: sorted.filter((event) => event.type === 'session.error').length,
		eventCount: sorted.length,
		failed,
		handoffCount: sorted.filter((event) => event.type === 'agent.handoff').length,
		modelCallCount: sorted.filter((event) => event.type === 'agent.model').length,
		sessionId: firstEvent?.sessionId,
		startedAt,
		toolCallCount: toolEvents.length,
		toolErrorCount: toolEvents.filter((event) => event.payload.status === 'error')
			.length,
		traceId: firstEvent?.traceId,
		transcriptCount: sorted.filter((event) => event.type === 'turn.transcript')
			.length,
		turnCount: sorted.filter((event) => event.type === 'turn.committed').length
	};
};

export const evaluateVoiceTrace = (
	events: StoredVoiceTraceEvent[],
	options: VoiceTraceEvaluationOptions = {}
): VoiceTraceEvaluation => {
	const summary = summarizeVoiceTrace(events);
	const issues: VoiceTraceIssue[] = [];
	const maxHandoffs = options.maxHandoffs ?? 3;
	const maxToolErrors = options.maxToolErrors ?? 0;
	const maxModelCallsPerTurn = options.maxModelCallsPerTurn ?? 6;
	const turnCountForRatio = Math.max(1, summary.turnCount);

	if (options.requireCompletedCall !== false && !summary.endedAt) {
		issues.push({
			code: 'call-not-ended',
			message: 'Trace does not include a call end lifecycle event.',
			severity: 'warning'
		});
	}

	if (summary.failed) {
		issues.push({
			code: 'session-error',
			message: 'Trace contains a session error or failed call disposition.',
			severity: 'error'
		});
	}

	if (options.requireTranscript !== false && summary.transcriptCount === 0) {
		issues.push({
			code: 'missing-transcript',
			message: 'Trace does not include any transcript events.',
			severity: 'error'
		});
	}

	if (options.requireTurn !== false && summary.turnCount === 0) {
		issues.push({
			code: 'missing-turn',
			message: 'Trace does not include any committed turns.',
			severity: 'error'
		});
	}

	if (
		options.requireAssistantReply !== false &&
		summary.turnCount > 0 &&
		summary.assistantReplyCount === 0
	) {
		issues.push({
			code: 'missing-assistant-reply',
			message: 'Trace has committed turns but no assistant replies.',
			severity: 'warning'
		});
	}

	if (summary.toolErrorCount > maxToolErrors) {
		issues.push({
			code: 'tool-errors',
			message: `Trace has ${summary.toolErrorCount} tool error(s), above the allowed ${maxToolErrors}.`,
			severity: 'error'
		});
	}

	if (summary.handoffCount > maxHandoffs) {
		issues.push({
			code: 'too-many-handoffs',
			message: `Trace has ${summary.handoffCount} handoff(s), above the allowed ${maxHandoffs}.`,
			severity: 'warning'
		});
	}

	if (summary.modelCallCount / turnCountForRatio > maxModelCallsPerTurn) {
		issues.push({
			code: 'too-many-model-calls',
			message: `Trace averages more than ${maxModelCallsPerTurn} model calls per committed turn.`,
			severity: 'warning'
		});
	}

	return {
		issues,
		pass: !issues.some((issue) => issue.severity === 'error'),
		summary
	};
};

const renderTraceEventMarkdown = (
	event: StoredVoiceTraceEvent,
	startedAt: number | undefined
) => {
	const offset =
		startedAt === undefined ? `${event.at}` : `+${Math.max(0, event.at - startedAt)}ms`;
	const label = `- ${offset} [${event.type}]`;
	switch (event.type) {
		case 'turn.transcript':
			return `${label} ${event.payload.isFinal ? 'final' : 'partial'} "${formatTraceValue(event.payload.text)}"`;
		case 'turn.committed':
			return `${label} committed "${formatTraceValue(event.payload.text)}"`;
		case 'turn.assistant':
			return event.payload.text
				? `${label} assistant "${formatTraceValue(event.payload.text)}"`
				: `${label} ${formatTraceValue(event.payload.status)}`;
		case 'agent.tool':
			return `${label} ${formatTraceValue(event.payload.toolName)} ${formatTraceValue(event.payload.status)}`;
		case 'agent.context':
			return `${label} ${formatTraceValue(event.payload.fromAgentId)} -> ${formatTraceValue(event.payload.targetAgentId)} ${formatTraceValue(event.payload.status)}`;
		case 'agent.handoff':
			return `${label} ${formatTraceValue(event.payload.fromAgentId)} -> ${formatTraceValue(event.payload.targetAgentId)}`;
		case 'session.error':
			return `${label} ${formatTraceValue(event.payload.error)}`;
		case 'call.lifecycle':
			return `${label} ${formatTraceValue(event.payload.type)} ${formatTraceValue(event.payload.disposition)}`.trim();
		default:
			return `${label} ${formatTraceValue(event.payload)}`;
	}
};

export const renderVoiceTraceMarkdown = (
	events: StoredVoiceTraceEvent[],
	options: {
		title?: string;
		evaluation?: VoiceTraceEvaluationOptions;
		redact?: VoiceTraceRedactionConfig;
	} = {}
) => {
	const sorted = filterVoiceTraceEvents(
		options.redact ? redactVoiceTraceEvents(events, options.redact) : events
	);
	const summary = summarizeVoiceTrace(sorted);
	const evaluation = evaluateVoiceTrace(sorted, options.evaluation);
	const lines = [
		`# ${options.title ?? `Voice Trace ${summary.sessionId ?? ''}`.trim()}`,
		'',
		`Pass: ${evaluation.pass ? 'yes' : 'no'}`,
		`Session: ${summary.sessionId ?? 'unknown'}`,
		`Events: ${summary.eventCount}`,
		`Turns: ${summary.turnCount}`,
		`Transcripts: ${summary.transcriptCount}`,
		`Assistant replies: ${summary.assistantReplyCount}`,
		`Model calls: ${summary.modelCallCount}`,
		`Tool calls: ${summary.toolCallCount}`,
		`Handoffs: ${summary.handoffCount}`,
		`Errors: ${summary.errorCount}`,
		`Estimated cost units: ${summary.cost.estimatedRelativeCostUnits}`,
		''
	];

	if (evaluation.issues.length > 0) {
		lines.push('## Issues', '');
		for (const issue of evaluation.issues) {
			lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
		}
		lines.push('');
	}

	lines.push('## Timeline', '');
	for (const event of sorted) {
		lines.push(renderTraceEventMarkdown(event, summary.startedAt));
	}

	return lines.join('\n');
};

export const renderVoiceTraceHTML = (
	events: StoredVoiceTraceEvent[],
	options: {
		title?: string;
		evaluation?: VoiceTraceEvaluationOptions;
		redact?: VoiceTraceRedactionConfig;
	} = {}
) => {
	const markdown = renderVoiceTraceMarkdown(events, options);
	const renderEvents = options.redact
		? redactVoiceTraceEvents(events, options.redact)
		: events;
	const summary = summarizeVoiceTrace(renderEvents);
	const evaluation = evaluateVoiceTrace(renderEvents, options.evaluation);
	const eventRows = filterVoiceTraceEvents(renderEvents)
		.map((event) => {
			const offset =
				summary.startedAt === undefined
					? event.at
					: Math.max(0, event.at - summary.startedAt);
			return [
				'<tr>',
				`<td>${escapeHtml(String(offset))}</td>`,
				`<td>${escapeHtml(event.type)}</td>`,
				`<td>${escapeHtml(event.turnId ?? '')}</td>`,
				`<td><code>${escapeHtml(JSON.stringify(event.payload))}</code></td>`,
				'</tr>'
			].join('');
		})
		.join('\n');

	return [
		'<!doctype html>',
		'<html lang="en">',
		'<head>',
		'<meta charset="utf-8" />',
		'<meta name="viewport" content="width=device-width, initial-scale=1" />',
		`<title>${escapeHtml(options.title ?? 'Voice Trace')}</title>`,
		'<style>',
		'body{font-family:ui-sans-serif,system-ui,sans-serif;margin:2rem;line-height:1.45;background:#f8f7f2;color:#181713}',
		'main{max-width:1100px;margin:auto}',
		'.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.75rem;margin:1rem 0}',
		'.card{background:white;border:1px solid #ded9cc;border-radius:12px;padding:1rem}',
		'.pass{color:#126b3a}.fail{color:#9d2222}',
		'table{border-collapse:collapse;width:100%;background:white;border:1px solid #ded9cc}',
		'th,td{border-bottom:1px solid #eee8dc;padding:.65rem;text-align:left;vertical-align:top}',
		'code{white-space:pre-wrap;word-break:break-word}',
		'pre{background:#181713;color:#f8f7f2;padding:1rem;border-radius:12px;overflow:auto}',
		'</style>',
		'</head>',
		'<body><main>',
		`<h1>${escapeHtml(options.title ?? `Voice Trace ${summary.sessionId ?? ''}`.trim())}</h1>`,
		`<p class="${evaluation.pass ? 'pass' : 'fail'}">QA: ${evaluation.pass ? 'pass' : 'fail'}</p>`,
		'<section class="summary">',
		`<div class="card"><strong>Events</strong><br>${summary.eventCount}</div>`,
		`<div class="card"><strong>Turns</strong><br>${summary.turnCount}</div>`,
		`<div class="card"><strong>Transcripts</strong><br>${summary.transcriptCount}</div>`,
		`<div class="card"><strong>Tool errors</strong><br>${summary.toolErrorCount}</div>`,
		`<div class="card"><strong>Cost units</strong><br>${summary.cost.estimatedRelativeCostUnits}</div>`,
		'</section>',
		'<h2>Timeline</h2>',
		'<table><thead><tr><th>Offset ms</th><th>Type</th><th>Turn</th><th>Payload</th></tr></thead><tbody>',
		eventRows,
		'</tbody></table>',
		'<h2>Markdown Export</h2>',
		`<pre>${escapeHtml(markdown)}</pre>`,
		'</main></body></html>'
	].join('\n');
};

export const buildVoiceTraceReplay = (
	events: StoredVoiceTraceEvent[],
	options: {
		evaluation?: VoiceTraceEvaluationOptions;
		redact?: VoiceTraceRedactionConfig;
		title?: string;
	} = {}
) => ({
	evaluation: evaluateVoiceTrace(
		options.redact ? redactVoiceTraceEvents(events, options.redact) : events,
		options.evaluation
	),
	html: renderVoiceTraceHTML(events, options),
	markdown: renderVoiceTraceMarkdown(events, options),
	summary: summarizeVoiceTrace(
		options.redact ? redactVoiceTraceEvents(events, options.redact) : events
	)
});
