import {
	withVoiceIntegrationEventId,
	withVoiceOpsTaskId
} from './ops';
import { createVoiceSessionRecord, toVoiceSessionSummary } from './store';
import { withVoiceCallReviewId } from './testing/review';
import {
	createVoiceTraceEvent,
	filterVoiceTraceEvents,
	type StoredVoiceTraceEvent,
	type VoiceTraceSinkDeliveryRecord,
	type VoiceTraceSinkDeliveryStore,
	type VoiceTraceEvent,
	type VoiceTraceEventStore
} from './trace';
import type {
	StoredVoiceIntegrationEvent,
	StoredVoiceExternalObjectMap,
	StoredVoiceOpsTask,
	VoiceExternalObjectMapStore,
	VoiceIntegrationEvent,
	VoiceIntegrationEventStore,
	VoiceOpsTask,
	VoiceOpsTaskStore
} from './ops';
import type {
	StoredVoiceCallReviewArtifact,
	VoiceCallReviewArtifact,
	VoiceCallReviewStore
} from './testing/review';
import type {
	StoredVoiceTelephonyWebhookDecision,
	VoiceTelephonyWebhookIdempotencyStore
} from './telephonyOutcome';
import type { VoiceSessionRecord, VoiceSessionStore } from './types';

export type VoicePostgresClient = {
	unsafe: <TRow extends Record<string, unknown> = Record<string, unknown>>(
		query: string,
		parameters?: unknown[]
	) => Promise<TRow[]>;
};

export type VoicePostgresStoreOptions = {
	connectionString?: string;
	schemaName?: string;
	sql?: VoicePostgresClient;
	tableName?: string;
	tablePrefix?: string;
};

export type VoicePostgresRuntimeStorage<
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TReview extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact,
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask,
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent,
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap,
	TTrace extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
	TTraceDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
> = {
	events: VoiceIntegrationEventStore<TEvent>;
	externalObjects: VoiceExternalObjectMapStore<TMapping>;
	reviews: VoiceCallReviewStore<TReview>;
	session: VoiceSessionStore<TSession>;
	tasks: VoiceOpsTaskStore<TTask>;
	traceDeliveries: VoiceTraceSinkDeliveryStore<TTraceDelivery>;
	traces: VoiceTraceEventStore<TTrace>;
};

const normalizeIdentifierSegment = (value: string) =>
	value
		.trim()
		.replace(/[^a-zA-Z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '') || 'voice';

const quoteIdentifier = (value: string) =>
	`"${value.replace(/"/g, '""')}"`;

const resolveStoreTableName = (input: {
	fallback: string;
	options: Pick<VoicePostgresStoreOptions, 'tableName' | 'tablePrefix'>;
}) => {
	if (input.options.tableName) {
		return normalizeIdentifierSegment(input.options.tableName);
	}

	return `${normalizeIdentifierSegment(input.options.tablePrefix ?? 'voice')}_${normalizeIdentifierSegment(input.fallback)}`;
};

const resolveQualifiedTableName = (input: {
	fallback: string;
	options: Pick<
		VoicePostgresStoreOptions,
		'schemaName' | 'tableName' | 'tablePrefix'
	>;
}) => {
	const schema = normalizeIdentifierSegment(input.options.schemaName ?? 'public');
	const table = resolveStoreTableName({
		fallback: input.fallback,
		options: input.options
	});

	return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
};

const createVoicePostgresClient = async (
	options: VoicePostgresStoreOptions
): Promise<VoicePostgresClient> => {
	if (options.sql) {
		return options.sql;
	}

	if (!options.connectionString) {
		throw new Error(
			'createVoicePostgresRuntimeStorage requires either options.sql or options.connectionString.'
		);
	}
	const sql = new Bun.SQL(options.connectionString);
	return {
		unsafe: sql.unsafe.bind(sql)
	};
};

const createPostgresRecordStore = <T>(input: {
	decorate: (id: string, value: T) => T;
	getSortAt: (value: T) => number;
	qualifiedTableName: string;
	sql: Promise<VoicePostgresClient>;
}) => {
	const schemaMatch = input.qualifiedTableName.match(/^"([^"]+)"\./);
	const ensureTable = async () => {
		const client = await input.sql;
		if (schemaMatch?.[1]) {
			await client.unsafe(
				`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaMatch[1])}`
			);
		}
		await client.unsafe(
			`CREATE TABLE IF NOT EXISTS ${input.qualifiedTableName} (
				id TEXT PRIMARY KEY,
				sort_at BIGINT NOT NULL,
				payload JSONB NOT NULL
			)`
		);
	};

	const initialized = ensureTable();

	const get = async (id: string) => {
		await initialized;
		const client = await input.sql;
		const rows = await client.unsafe<{ payload: T }>(
			`SELECT payload FROM ${input.qualifiedTableName} WHERE id = $1 LIMIT 1`,
			[id]
		);
		return rows[0]?.payload;
	};

	const list = async () => {
		await initialized;
		const client = await input.sql;
		const rows = await client.unsafe<{ payload: T }>(
			`SELECT payload FROM ${input.qualifiedTableName} ORDER BY sort_at DESC, id DESC`
		);
		return rows.map((row) => row.payload);
	};

	const set = async (id: string, value: T) => {
		await initialized;
		const client = await input.sql;
		const decorated = input.decorate(id, value);
		await client.unsafe(
			`INSERT INTO ${input.qualifiedTableName} (id, sort_at, payload)
			 VALUES ($1, $2, $3::jsonb)
			 ON CONFLICT (id) DO UPDATE SET sort_at = EXCLUDED.sort_at, payload = EXCLUDED.payload`,
			[id, input.getSortAt(decorated), JSON.stringify(decorated)]
		);
	};

	const remove = async (id: string) => {
		await initialized;
		const client = await input.sql;
		await client.unsafe(
			`DELETE FROM ${input.qualifiedTableName} WHERE id = $1`,
			[id]
		);
	};

	return {
		get,
		list,
		remove,
		set
	};
};

const createPostgresSessionStoreWithClient = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord
>(
	client: Promise<VoicePostgresClient>,
	options: VoicePostgresStoreOptions
): VoiceSessionStore<TSession> => {
	const store = createPostgresRecordStore<TSession>({
		decorate: (_id, value) => value,
		getSortAt: (value) => value.lastActivityAt ?? value.createdAt,
		qualifiedTableName: resolveQualifiedTableName({
			fallback: 'sessions',
			options
		}),
		sql: client
	});

	const getOrCreate = async (id: string) => {
		const existing = await store.get(id);
		if (existing) {
			return existing;
		}

		const session = createVoiceSessionRecord<TSession>(id);
		await store.set(id, session);
		return session;
	};

	return {
		get: store.get,
		getOrCreate,
		list: async () =>
			(await store.list())
				.map((session) => toVoiceSessionSummary(session))
				.sort(
					(first, second) =>
						(second.lastActivityAt ?? second.createdAt) -
						(first.lastActivityAt ?? first.createdAt)
				),
		remove: store.remove,
		set: store.set
	};
};

const createPostgresReviewStoreWithClient = <
	TArtifact extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact
>(
	client: Promise<VoicePostgresClient>,
	options: VoicePostgresStoreOptions
): VoiceCallReviewStore<TArtifact> =>
	createPostgresRecordStore<TArtifact>({
		decorate: (id, value) =>
			withVoiceCallReviewId(id, value as TArtifact & VoiceCallReviewArtifact),
		getSortAt: (value) => value.generatedAt ?? 0,
		qualifiedTableName: resolveQualifiedTableName({
			fallback: 'reviews',
			options
		}),
		sql: client
	});

const createPostgresTaskStoreWithClient = <
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
>(
	client: Promise<VoicePostgresClient>,
	options: VoicePostgresStoreOptions
): VoiceOpsTaskStore<TTask> =>
	createPostgresRecordStore<TTask>({
		decorate: (id, value) =>
			withVoiceOpsTaskId(id, value as TTask & Omit<VoiceOpsTask, 'id'>),
		getSortAt: (value) => value.createdAt,
		qualifiedTableName: resolveQualifiedTableName({
			fallback: 'tasks',
			options
		}),
		sql: client
	});

const createPostgresEventStoreWithClient = <
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
>(
	client: Promise<VoicePostgresClient>,
	options: VoicePostgresStoreOptions
): VoiceIntegrationEventStore<TEvent> =>
	createPostgresRecordStore<TEvent>({
		decorate: (id, value) =>
			withVoiceIntegrationEventId(
				id,
				value as TEvent & Omit<VoiceIntegrationEvent, 'id'>
			),
		getSortAt: (value) => value.createdAt,
		qualifiedTableName: resolveQualifiedTableName({
			fallback: 'events',
			options
		}),
		sql: client
	});

const createPostgresExternalObjectMapStoreWithClient = <
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap
>(
	client: Promise<VoicePostgresClient>,
	options: VoicePostgresStoreOptions
): VoiceExternalObjectMapStore<TMapping> => {
	const store = createPostgresRecordStore<TMapping>({
		decorate: (id, value) =>
			({
				...value,
				id
			}) as TMapping,
		getSortAt: (value) => value.updatedAt,
		qualifiedTableName: resolveQualifiedTableName({
			fallback: 'external_objects',
			options
		}),
		sql: client
	});

	const find: VoiceExternalObjectMapStore<TMapping>['find'] = async (input) =>
		(await store.list()).find(
			(mapping) =>
				mapping.provider === input.provider &&
				mapping.sourceId === input.sourceId &&
				(input.sinkId === undefined || mapping.sinkId === input.sinkId) &&
				(input.sourceType === undefined ||
					mapping.sourceType === input.sourceType)
		);

	return {
		...store,
		find
	};
};

const createPostgresTraceEventStoreWithClient = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(
	client: Promise<VoicePostgresClient>,
	options: VoicePostgresStoreOptions
): VoiceTraceEventStore<TEvent> => {
	const store = createPostgresRecordStore<TEvent>({
		decorate: (_id, value) => value,
		getSortAt: (value) => value.at,
		qualifiedTableName: resolveQualifiedTableName({
			fallback: 'traces',
			options
		}),
		sql: client
	});

	const append: VoiceTraceEventStore<TEvent>['append'] = async (event) => {
		const stored = createVoiceTraceEvent(event as VoiceTraceEvent) as TEvent;
		await store.set(stored.id, stored);
		return stored;
	};

	return {
		append,
		get: store.get,
		list: async (filter) => filterVoiceTraceEvents(await store.list(), filter),
		remove: store.remove
	};
};

const createPostgresTraceSinkDeliveryStoreWithClient = <
	TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
>(
	client: Promise<VoicePostgresClient>,
	options: VoicePostgresStoreOptions
): VoiceTraceSinkDeliveryStore<TDelivery> =>
	createPostgresRecordStore<TDelivery>({
		decorate: (id, value) =>
			({
				...value,
				id
			}) as TDelivery,
		getSortAt: (value) => value.createdAt,
		qualifiedTableName: resolveQualifiedTableName({
			fallback: 'trace_deliveries',
			options
		}),
		sql: client
	});

const createPostgresTelephonyWebhookIdempotencyStoreWithClient = <
	TResult = unknown
>(
	client: Promise<VoicePostgresClient>,
	options: VoicePostgresStoreOptions
): VoiceTelephonyWebhookIdempotencyStore<TResult> =>
	createPostgresRecordStore<StoredVoiceTelephonyWebhookDecision<TResult>>({
		decorate: (_id, value) => value,
		getSortAt: (value) => value.updatedAt,
		qualifiedTableName: resolveQualifiedTableName({
			fallback: 'telephony_webhook_idempotency',
			options
		}),
		sql: client
	});

export const createVoicePostgresSessionStore = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord
>(
	options: VoicePostgresStoreOptions
): VoiceSessionStore<TSession> =>
	createPostgresSessionStoreWithClient(
		createVoicePostgresClient(options),
		options
	);

export const createVoicePostgresReviewStore = <
	TArtifact extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact
>(
	options: VoicePostgresStoreOptions
): VoiceCallReviewStore<TArtifact> =>
	createPostgresReviewStoreWithClient(createVoicePostgresClient(options), options);

export const createVoicePostgresTaskStore = <
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
>(
	options: VoicePostgresStoreOptions
): VoiceOpsTaskStore<TTask> =>
	createPostgresTaskStoreWithClient(createVoicePostgresClient(options), options);

export const createVoicePostgresIntegrationEventStore = <
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
>(
	options: VoicePostgresStoreOptions
): VoiceIntegrationEventStore<TEvent> =>
	createPostgresEventStoreWithClient(createVoicePostgresClient(options), options);

export const createVoicePostgresExternalObjectMapStore = <
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap
>(
	options: VoicePostgresStoreOptions
): VoiceExternalObjectMapStore<TMapping> =>
	createPostgresExternalObjectMapStoreWithClient(
		createVoicePostgresClient(options),
		options
	);

export const createVoicePostgresTraceEventStore = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(
	options: VoicePostgresStoreOptions
): VoiceTraceEventStore<TEvent> =>
	createPostgresTraceEventStoreWithClient(createVoicePostgresClient(options), options);

export const createVoicePostgresTraceSinkDeliveryStore = <
	TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
>(
	options: VoicePostgresStoreOptions
): VoiceTraceSinkDeliveryStore<TDelivery> =>
	createPostgresTraceSinkDeliveryStoreWithClient(
		createVoicePostgresClient(options),
		options
	);

export const createVoicePostgresTelephonyWebhookIdempotencyStore = <
	TResult = unknown
>(
	options: VoicePostgresStoreOptions
): VoiceTelephonyWebhookIdempotencyStore<TResult> =>
	createPostgresTelephonyWebhookIdempotencyStoreWithClient<TResult>(
		createVoicePostgresClient(options),
		options
	);

export const createVoicePostgresRuntimeStorage = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TReview extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact,
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask,
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent,
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap,
	TTrace extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
	TTraceDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
>(
	options: VoicePostgresStoreOptions
): VoicePostgresRuntimeStorage<
	TSession,
	TReview,
	TTask,
	TEvent,
	TMapping,
	TTrace,
	TTraceDelivery
> => {
	const client = createVoicePostgresClient(options);

	return {
		events: createPostgresEventStoreWithClient<TEvent>(client, options),
		externalObjects: createPostgresExternalObjectMapStoreWithClient<TMapping>(
			client,
			options
		),
		reviews: createPostgresReviewStoreWithClient<TReview>(client, options),
		session: createPostgresSessionStoreWithClient<TSession>(client, options),
		tasks: createPostgresTaskStoreWithClient<TTask>(client, options),
		traceDeliveries: createPostgresTraceSinkDeliveryStoreWithClient<TTraceDelivery>(
			client,
			options
		),
		traces: createPostgresTraceEventStoreWithClient<TTrace>(client, options)
	};
};
