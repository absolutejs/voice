import { Database } from 'bun:sqlite';
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
	VoiceExternalObjectMap,
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
import type { VoiceCampaignRecord, VoiceCampaignStore } from './campaign';
import type { VoiceSessionRecord, VoiceSessionStore } from './types';

export type VoiceSQLiteStoreOptions = {
	path: string;
	tableName?: string;
	tablePrefix?: string;
};

export type VoiceSQLiteRuntimeStorage<
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TReview extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact,
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask,
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent,
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap,
	TTrace extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
	TTraceDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
> = {
	campaigns: VoiceCampaignStore;
	events: VoiceIntegrationEventStore<TEvent>;
	externalObjects: VoiceExternalObjectMapStore<TMapping>;
	reviews: VoiceCallReviewStore<TReview>;
	session: VoiceSessionStore<TSession>;
	tasks: VoiceOpsTaskStore<TTask>;
	traceDeliveries: VoiceTraceSinkDeliveryStore<TTraceDelivery>;
	traces: VoiceTraceEventStore<TTrace>;
};

const normalizeTableNameSegment = (value: string) =>
	value
		.trim()
		.replace(/[^a-zA-Z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '') || 'voice';

const resolveTableName = (input: {
	fallback: string;
	options: Pick<VoiceSQLiteStoreOptions, 'tableName' | 'tablePrefix'>;
}) => {
	if (input.options.tableName) {
		return normalizeTableNameSegment(input.options.tableName);
	}

	const prefix = normalizeTableNameSegment(input.options.tablePrefix ?? 'voice');
	const fallback = normalizeTableNameSegment(input.fallback);
	return `${prefix}_${fallback}`;
};

const openVoiceSQLiteDatabase = (path: string) => {
	const database = new Database(path, {
		create: true
	});
	database.exec('PRAGMA journal_mode = WAL;');
	database.exec('PRAGMA synchronous = NORMAL;');
	database.exec('PRAGMA busy_timeout = 5000;');
	return database;
};

const ensureStoreTable = (database: Database, tableName: string) => {
	database.exec(
		`CREATE TABLE IF NOT EXISTS "${tableName}" (
			id TEXT PRIMARY KEY,
			sort_at INTEGER NOT NULL,
			payload TEXT NOT NULL
		)`
	);
};

const createSQLiteRecordStore = <T>(input: {
	database: Database;
	decorate: (id: string, value: T) => T;
	getSortAt: (value: T) => number;
	tableName: string;
}) => {
	ensureStoreTable(input.database, input.tableName);

	const selectStatement = input.database.query(
		`SELECT payload FROM "${input.tableName}" WHERE id = ?1 LIMIT 1`
	);
	const listStatement = input.database.query(
		`SELECT payload FROM "${input.tableName}" ORDER BY sort_at DESC, id DESC`
	);
	const removeStatement = input.database.query(
		`DELETE FROM "${input.tableName}" WHERE id = ?1`
	);
	const upsertStatement = input.database.query(
		`INSERT INTO "${input.tableName}" (id, sort_at, payload)
		 VALUES (?1, ?2, ?3)
		 ON CONFLICT(id) DO UPDATE SET sort_at = excluded.sort_at, payload = excluded.payload`
	);

	const get = async (id: string) => {
		const row = selectStatement.get(id) as { payload: string } | null;
		return row ? (JSON.parse(row.payload) as T) : undefined;
	};

	const list = async () =>
		(listStatement
			.all()
			.map((row) => JSON.parse((row as { payload: string }).payload) as T));

	const set = async (id: string, value: T) => {
		const decorated = input.decorate(id, value);
		upsertStatement.run(
			id,
			input.getSortAt(decorated),
			JSON.stringify(decorated)
		);
	};

	const remove = async (id: string) => {
		removeStatement.run(id);
	};

	return {
		get,
		list,
		remove,
		set
	};
};

const createSQLiteSessionStoreWithDatabase = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord
>(
	database: Database,
	tableName: string
): VoiceSessionStore<TSession> => {
	const store = createSQLiteRecordStore<TSession>({
		database,
		decorate: (_id, value) => value,
		getSortAt: (value) => value.lastActivityAt ?? value.createdAt,
		tableName
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

const createSQLiteReviewStoreWithDatabase = <
	TArtifact extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact
>(
	database: Database,
	tableName: string
): VoiceCallReviewStore<TArtifact> =>
	createSQLiteRecordStore<TArtifact>({
		database,
		decorate: (id, value) =>
			withVoiceCallReviewId(id, value as TArtifact & VoiceCallReviewArtifact),
		getSortAt: (value) => value.generatedAt ?? 0,
		tableName
	});

const createSQLiteTaskStoreWithDatabase = <
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
>(
	database: Database,
	tableName: string
): VoiceOpsTaskStore<TTask> =>
	createSQLiteRecordStore<TTask>({
		database,
		decorate: (id, value) =>
			withVoiceOpsTaskId(id, value as TTask & Omit<VoiceOpsTask, 'id'>),
		getSortAt: (value) => value.createdAt,
		tableName
	});

const createSQLiteEventStoreWithDatabase = <
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
>(
	database: Database,
	tableName: string
): VoiceIntegrationEventStore<TEvent> =>
	createSQLiteRecordStore<TEvent>({
		database,
		decorate: (id, value) =>
			withVoiceIntegrationEventId(
				id,
				value as TEvent & Omit<VoiceIntegrationEvent, 'id'>
			),
		getSortAt: (value) => value.createdAt,
		tableName
	});

const createSQLiteExternalObjectMapStoreWithDatabase = <
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap
>(
	database: Database,
	tableName: string
): VoiceExternalObjectMapStore<TMapping> => {
	const store = createSQLiteRecordStore<TMapping>({
		database,
		decorate: (id, value) =>
			({
				...value,
				id
			}) as TMapping,
		getSortAt: (value) => value.updatedAt,
		tableName
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

const createSQLiteTraceEventStoreWithDatabase = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(
	database: Database,
	tableName: string
): VoiceTraceEventStore<TEvent> => {
	const store = createSQLiteRecordStore<TEvent>({
		database,
		decorate: (_id, value) => value,
		getSortAt: (value) => value.at,
		tableName
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

const createSQLiteTraceSinkDeliveryStoreWithDatabase = <
	TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
>(
	database: Database,
	tableName: string
): VoiceTraceSinkDeliveryStore<TDelivery> =>
	createSQLiteRecordStore<TDelivery>({
		database,
		decorate: (id, value) =>
			({
				...value,
				id
			}) as TDelivery,
		getSortAt: (value) => value.createdAt,
		tableName
	});

const createSQLiteTelephonyWebhookIdempotencyStoreWithDatabase = <
	TResult = unknown
>(
	database: Database,
	tableName: string
): VoiceTelephonyWebhookIdempotencyStore<TResult> =>
	createSQLiteRecordStore<StoredVoiceTelephonyWebhookDecision<TResult>>({
		database,
		decorate: (_id, value) => value,
		getSortAt: (value) => value.updatedAt,
		tableName
	});

const createSQLiteCampaignStoreWithDatabase = (
	database: Database,
	tableName: string
): VoiceCampaignStore =>
	createSQLiteRecordStore<VoiceCampaignRecord>({
		database,
		decorate: (_id, value) => value,
		getSortAt: (value) => value.campaign.createdAt,
		tableName
	});

export const createVoiceSQLiteSessionStore = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord
>(
	options: VoiceSQLiteStoreOptions
): VoiceSessionStore<TSession> =>
	createSQLiteSessionStoreWithDatabase(
		openVoiceSQLiteDatabase(options.path),
		resolveTableName({
			fallback: 'sessions',
			options
		})
	);

export const createVoiceSQLiteReviewStore = <
	TArtifact extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact
>(
	options: VoiceSQLiteStoreOptions
): VoiceCallReviewStore<TArtifact> =>
	createSQLiteReviewStoreWithDatabase(
		openVoiceSQLiteDatabase(options.path),
		resolveTableName({
			fallback: 'reviews',
			options
		})
	);

export const createVoiceSQLiteTaskStore = <
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
>(
	options: VoiceSQLiteStoreOptions
): VoiceOpsTaskStore<TTask> =>
	createSQLiteTaskStoreWithDatabase(
		openVoiceSQLiteDatabase(options.path),
		resolveTableName({
			fallback: 'tasks',
			options
		})
	);

export const createVoiceSQLiteIntegrationEventStore = <
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
>(
	options: VoiceSQLiteStoreOptions
): VoiceIntegrationEventStore<TEvent> =>
	createSQLiteEventStoreWithDatabase(
		openVoiceSQLiteDatabase(options.path),
		resolveTableName({
			fallback: 'events',
			options
		})
	);

export const createVoiceSQLiteExternalObjectMapStore = <
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap
>(
	options: VoiceSQLiteStoreOptions
): VoiceExternalObjectMapStore<TMapping> =>
	createSQLiteExternalObjectMapStoreWithDatabase(
		openVoiceSQLiteDatabase(options.path),
		resolveTableName({
			fallback: 'external_objects',
			options
		})
	);

export const createVoiceSQLiteTraceEventStore = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(
	options: VoiceSQLiteStoreOptions
): VoiceTraceEventStore<TEvent> =>
	createSQLiteTraceEventStoreWithDatabase(
		openVoiceSQLiteDatabase(options.path),
		resolveTableName({
			fallback: 'traces',
			options
		})
	);

export const createVoiceSQLiteTraceSinkDeliveryStore = <
	TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
>(
	options: VoiceSQLiteStoreOptions
): VoiceTraceSinkDeliveryStore<TDelivery> =>
	createSQLiteTraceSinkDeliveryStoreWithDatabase(
		openVoiceSQLiteDatabase(options.path),
		resolveTableName({
			fallback: 'trace_deliveries',
			options
		})
	);

export const createVoiceSQLiteTelephonyWebhookIdempotencyStore = <
	TResult = unknown
>(
	options: VoiceSQLiteStoreOptions
): VoiceTelephonyWebhookIdempotencyStore<TResult> =>
	createSQLiteTelephonyWebhookIdempotencyStoreWithDatabase<TResult>(
		openVoiceSQLiteDatabase(options.path),
		resolveTableName({
			fallback: 'telephony_webhook_idempotency',
			options
		})
	);

export const createVoiceSQLiteCampaignStore = (
	options: VoiceSQLiteStoreOptions
): VoiceCampaignStore =>
	createSQLiteCampaignStoreWithDatabase(
		openVoiceSQLiteDatabase(options.path),
		resolveTableName({
			fallback: 'campaigns',
			options
		})
	);

export const createVoiceSQLiteRuntimeStorage = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TReview extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact,
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask,
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent,
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap,
	TTrace extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
	TTraceDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
>(
	options: VoiceSQLiteStoreOptions
): VoiceSQLiteRuntimeStorage<
	TSession,
	TReview,
	TTask,
	TEvent,
	TMapping,
	TTrace,
	TTraceDelivery
> => {
	const database = openVoiceSQLiteDatabase(options.path);

	return {
		campaigns: createSQLiteCampaignStoreWithDatabase(
			database,
			resolveTableName({
				fallback: 'campaigns',
				options
			})
		),
		events: createSQLiteEventStoreWithDatabase<TEvent>(
			database,
			resolveTableName({
				fallback: 'events',
				options
			})
		),
		externalObjects: createSQLiteExternalObjectMapStoreWithDatabase<TMapping>(
			database,
			resolveTableName({
				fallback: 'external_objects',
				options
			})
		),
		reviews: createSQLiteReviewStoreWithDatabase<TReview>(
			database,
			resolveTableName({
				fallback: 'reviews',
				options
			})
		),
		session: createSQLiteSessionStoreWithDatabase<TSession>(
			database,
			resolveTableName({
				fallback: 'sessions',
				options
			})
		),
		tasks: createSQLiteTaskStoreWithDatabase<TTask>(
			database,
			resolveTableName({
				fallback: 'tasks',
				options
			})
		),
		traceDeliveries: createSQLiteTraceSinkDeliveryStoreWithDatabase<TTraceDelivery>(
			database,
			resolveTableName({
				fallback: 'trace_deliveries',
				options
			})
		),
		traces: createSQLiteTraceEventStoreWithDatabase<TTrace>(
			database,
			resolveTableName({
				fallback: 'traces',
				options
			})
		)
	};
};
