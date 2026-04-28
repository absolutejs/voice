import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	createVoiceExternalObjectMap,
	withVoiceIntegrationEventId,
	withVoiceOpsTaskId
} from './ops';
import {
	createVoiceAuditEvent,
	filterVoiceAuditEvents,
	type StoredVoiceAuditEvent,
	type VoiceAuditEvent,
	type VoiceAuditEventStore
} from './audit';
import type {
	VoiceAuditSinkDeliveryRecord,
	VoiceAuditSinkDeliveryStore
} from './auditSinks';
import { createVoiceSessionRecord, toVoiceSessionSummary } from './store';
import type { VoiceCampaignRecord, VoiceCampaignStore } from './campaign';
import {
	createVoiceAssistantMemoryRecord,
	type VoiceAssistantMemoryRecord,
	type VoiceAssistantMemoryStore
} from './assistantMemory';
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
import type { VoiceSessionRecord, VoiceSessionStore } from './types';

export type VoiceFileStoreOptions = {
	directory: string;
	pretty?: boolean;
};

export type VoiceFileRuntimeStorage<
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TReview extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact,
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask,
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent,
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap,
	TTrace extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
	TTraceDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord,
	TAudit extends StoredVoiceAuditEvent = StoredVoiceAuditEvent,
	TAuditDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord,
	TMemory extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord
> = {
	audit: VoiceAuditEventStore<TAudit>;
	auditDeliveries: VoiceAuditSinkDeliveryStore<TAuditDelivery>;
	campaigns: VoiceCampaignStore;
	events: VoiceIntegrationEventStore<TEvent>;
	externalObjects: VoiceExternalObjectMapStore<TMapping>;
	memories: VoiceAssistantMemoryStore<TMemory>;
	reviews: VoiceCallReviewStore<TReview>;
	session: VoiceSessionStore<TSession>;
	tasks: VoiceOpsTaskStore<TTask>;
	traceDeliveries: VoiceTraceSinkDeliveryStore<TTraceDelivery>;
	traces: VoiceTraceEventStore<TTrace>;
};

const listJsonFiles = async (directory: string) => {
	try {
		const entries = await readdir(directory, {
			withFileTypes: true
		});
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
			.map((entry) => join(directory, entry.name));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return [];
		}

		throw error;
	}
};

const encodeStoreId = (id: string) => `${encodeURIComponent(id)}.json`;

const resolveFilePath = (directory: string, id: string) =>
	join(directory, encodeStoreId(id));

const createMemoryStoreId = (input: {
	assistantId: string;
	key: string;
	namespace: string;
}) => `${input.assistantId}:${input.namespace}:${input.key}`;

const readJsonFile = async <T>(path: string) =>
	JSON.parse(await readFile(path, 'utf8')) as T;

const writeJsonFile = async (
	path: string,
	value: unknown,
	options: VoiceFileStoreOptions
) => {
	await mkdir(options.directory, {
		recursive: true
	});
	const tempPath = `${path}.${crypto.randomUUID()}.tmp`;
	await writeFile(
		tempPath,
		JSON.stringify(value, null, options.pretty === false ? undefined : 2)
	);
	await rename(tempPath, path);
};

export const createVoiceFileSessionStore = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord
>(
	options: VoiceFileStoreOptions
): VoiceSessionStore<TSession> => {
	const get = async (id: string) => {
		const path = resolveFilePath(options.directory, id);

		try {
			return await readJsonFile<TSession>(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}

			throw error;
		}
	};

	const getOrCreate = async (id: string) => {
		const existing = await get(id);
		if (existing) {
			return existing;
		}

		const session = createVoiceSessionRecord<TSession>(id);
		await writeJsonFile(resolveFilePath(options.directory, id), session, options);
		return session;
	};

	const set = async (id: string, value: TSession) => {
		await writeJsonFile(resolveFilePath(options.directory, id), value, options);
	};

	const list = async () => {
		const files = await listJsonFiles(options.directory);
		const sessions = await Promise.all(
			files.map((file) => readJsonFile<TSession>(file))
		);

		return sessions
			.map((session) => toVoiceSessionSummary(session))
			.sort(
				(first, second) =>
					(second.lastActivityAt ?? second.createdAt) -
					(first.lastActivityAt ?? first.createdAt)
			);
	};

	const remove = async (id: string) => {
		await rm(resolveFilePath(options.directory, id), {
			force: true
		});
	};

	return { get, getOrCreate, list, remove, set };
};

export const createVoiceFileReviewStore = <
	TArtifact extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact
>(
	options: VoiceFileStoreOptions
): VoiceCallReviewStore<TArtifact> => {
	const get = async (id: string) => {
		const path = resolveFilePath(options.directory, id);

		try {
			return await readJsonFile<TArtifact>(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}

			throw error;
		}
	};

	const list = async () => {
		const files = await listJsonFiles(options.directory);
		const reviews = await Promise.all(
			files.map((file) => readJsonFile<TArtifact>(file))
		);

		return reviews.sort(
			(left, right) => (right.generatedAt ?? 0) - (left.generatedAt ?? 0)
		);
	};

	const set = async (id: string, artifact: TArtifact) => {
		await writeJsonFile(
			resolveFilePath(options.directory, id),
			withVoiceCallReviewId(id, artifact),
			options
		);
	};

	const remove = async (id: string) => {
		await rm(resolveFilePath(options.directory, id), {
			force: true
		});
	};

	return { get, list, remove, set };
};

export const createVoiceFileTaskStore = <
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask
>(
	options: VoiceFileStoreOptions
): VoiceOpsTaskStore<TTask> => {
	const get = async (id: string) => {
		const path = resolveFilePath(options.directory, id);

		try {
			return await readJsonFile<TTask>(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}

			throw error;
		}
	};

	const list = async () => {
		const files = await listJsonFiles(options.directory);
		const tasks = await Promise.all(files.map((file) => readJsonFile<TTask>(file)));

		return tasks.sort((left, right) => right.createdAt - left.createdAt);
	};

	const set = async (id: string, task: TTask) => {
		await writeJsonFile(
			resolveFilePath(options.directory, id),
			withVoiceOpsTaskId(id, task as TTask & Omit<VoiceOpsTask, 'id'>),
			options
		);
	};

	const remove = async (id: string) => {
		await rm(resolveFilePath(options.directory, id), {
			force: true
		});
	};

	return { get, list, remove, set };
};

export const createVoiceFileCampaignStore = (
	options: VoiceFileStoreOptions
): VoiceCampaignStore => {
	const get = async (id: string) => {
		const path = resolveFilePath(options.directory, id);

		try {
			return await readJsonFile<VoiceCampaignRecord>(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}

			throw error;
		}
	};

	const list = async () => {
		const files = await listJsonFiles(options.directory);
		const campaigns = await Promise.all(
			files.map((file) => readJsonFile<VoiceCampaignRecord>(file))
		);

		return campaigns.sort(
			(left, right) => right.campaign.createdAt - left.campaign.createdAt
		);
	};

	const set = async (id: string, record: VoiceCampaignRecord) => {
		await writeJsonFile(resolveFilePath(options.directory, id), record, options);
	};

	const remove = async (id: string) => {
		await rm(resolveFilePath(options.directory, id), {
			force: true
		});
	};

	return { get, list, remove, set };
};

export const createVoiceFileIntegrationEventStore = <
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent
>(
	options: VoiceFileStoreOptions
): VoiceIntegrationEventStore<TEvent> => {
	const get = async (id: string) => {
		const path = resolveFilePath(options.directory, id);

		try {
			return await readJsonFile<TEvent>(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}

			throw error;
		}
	};

	const list = async () => {
		const files = await listJsonFiles(options.directory);
		const events = await Promise.all(
			files.map((file) => readJsonFile<TEvent>(file))
		);

		return events.sort((left, right) => right.createdAt - left.createdAt);
	};

	const set = async (id: string, event: TEvent) => {
		await writeJsonFile(
			resolveFilePath(options.directory, id),
			withVoiceIntegrationEventId(
				id,
				event as TEvent & Omit<VoiceIntegrationEvent, 'id'>
			),
			options
		);
	};

	const remove = async (id: string) => {
		await rm(resolveFilePath(options.directory, id), {
			force: true
		});
	};

	return { get, list, remove, set };
};

export const createVoiceFileExternalObjectMapStore = <
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap
>(
	options: VoiceFileStoreOptions
): VoiceExternalObjectMapStore<TMapping> => {
	const get = async (id: string) => {
		const path = resolveFilePath(options.directory, id);

		try {
			return await readJsonFile<TMapping>(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}

			throw error;
		}
	};

	const list = async () => {
		const files = await listJsonFiles(options.directory);
		const mappings = await Promise.all(
			files.map((file) => readJsonFile<TMapping>(file))
		);

		return mappings.sort((left, right) => right.updatedAt - left.updatedAt);
	};

	const set = async (id: string, mapping: TMapping) => {
		await writeJsonFile(
			resolveFilePath(options.directory, id),
			{
				...mapping,
				id
			},
			options
		);
	};

	const remove = async (id: string) => {
		await rm(resolveFilePath(options.directory, id), {
			force: true
		});
	};

	const find: VoiceExternalObjectMapStore<TMapping>['find'] = async (input) => {
		const mappings = await list();
		return mappings.find(
			(mapping) =>
				mapping.provider === input.provider &&
				mapping.sourceId === input.sourceId &&
				(input.sinkId === undefined || mapping.sinkId === input.sinkId) &&
				(input.sourceType === undefined ||
					mapping.sourceType === input.sourceType)
		);
	};

	return { find, get, list, remove, set };
};

export const createVoiceFileTraceEventStore = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(
	options: VoiceFileStoreOptions
): VoiceTraceEventStore<TEvent> => {
	const append: VoiceTraceEventStore<TEvent>['append'] = async (event) => {
		const stored = createVoiceTraceEvent(event as VoiceTraceEvent) as TEvent;
		await writeJsonFile(resolveFilePath(options.directory, stored.id), stored, options);
		return stored;
	};

	const get = async (id: string) => {
		const path = resolveFilePath(options.directory, id);

		try {
			return await readJsonFile<TEvent>(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}

			throw error;
		}
	};

	const list = async (filter = {}) => {
		const files = await listJsonFiles(options.directory);
		const events = await Promise.all(
			files.map((file) => readJsonFile<TEvent>(file))
		);

		return filterVoiceTraceEvents(events, filter);
	};

	const remove = async (id: string) => {
		await rm(resolveFilePath(options.directory, id), {
			force: true
		});
	};

	return { append, get, list, remove };
};

export const createVoiceFileTraceSinkDeliveryStore = <
	TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord
>(
	options: VoiceFileStoreOptions
): VoiceTraceSinkDeliveryStore<TDelivery> => {
	const get = async (id: string) => {
		const path = resolveFilePath(options.directory, id);

		try {
			return await readJsonFile<TDelivery>(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}

			throw error;
		}
	};

	const list = async () => {
		const files = await listJsonFiles(options.directory);
		const deliveries = await Promise.all(
			files.map((file) => readJsonFile<TDelivery>(file))
		);

		return deliveries.sort(
			(left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id)
		);
	};

	const set = async (id: string, delivery: TDelivery) => {
		await writeJsonFile(
			resolveFilePath(options.directory, id),
			{
				...delivery,
				id
			},
			options
		);
	};

	const remove = async (id: string) => {
		await rm(resolveFilePath(options.directory, id), {
			force: true
		});
	};

	return { get, list, remove, set };
};

export const createVoiceFileAuditEventStore = <
	TEvent extends StoredVoiceAuditEvent = StoredVoiceAuditEvent
>(
	options: VoiceFileStoreOptions
): VoiceAuditEventStore<TEvent> => {
	const get = async (id: string) => {
		const path = resolveFilePath(options.directory, id);

		try {
			return await readJsonFile<TEvent>(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}

			throw error;
		}
	};

	const append = async (event: VoiceAuditEvent | TEvent) => {
		const stored = createVoiceAuditEvent(event) as TEvent;
		await writeJsonFile(resolveFilePath(options.directory, stored.id), stored, options);
		return stored;
	};

	const list = async (filter?: Parameters<VoiceAuditEventStore['list']>[0]) => {
		const files = await listJsonFiles(options.directory);
		const events = await Promise.all(files.map((file) => readJsonFile<TEvent>(file)));

		return filterVoiceAuditEvents(events, filter);
	};

	return { append, get, list };
};

export const createVoiceFileAuditSinkDeliveryStore = <
	TDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord
>(
	options: VoiceFileStoreOptions
): VoiceAuditSinkDeliveryStore<TDelivery> => {
	const get = async (id: string) => {
		const path = resolveFilePath(options.directory, id);

		try {
			return await readJsonFile<TDelivery>(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}

			throw error;
		}
	};

	const list = async () => {
		const files = await listJsonFiles(options.directory);
		const deliveries = await Promise.all(
			files.map((file) => readJsonFile<TDelivery>(file))
		);

		return deliveries.sort(
			(left, right) =>
				left.createdAt - right.createdAt || left.id.localeCompare(right.id)
		);
	};

	const set = async (id: string, delivery: TDelivery) => {
		await writeJsonFile(
			resolveFilePath(options.directory, id),
			{
				...delivery,
				id
			},
			options
		);
	};

	const remove = async (id: string) => {
		await rm(resolveFilePath(options.directory, id), {
			force: true
		});
	};

	return { get, list, remove, set };
};

export const createVoiceFileAssistantMemoryStore = <
	TRecord extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord
>(
	options: VoiceFileStoreOptions
): VoiceAssistantMemoryStore<TRecord> => {
	const get = async (input: {
		assistantId: string;
		key: string;
		namespace: string;
	}) => {
		const path = resolveFilePath(options.directory, createMemoryStoreId(input));

		try {
			return await readJsonFile<TRecord>(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}

			throw error;
		}
	};

	const list = async (input: { assistantId: string; namespace?: string }) => {
		const files = await listJsonFiles(options.directory);
		const records = await Promise.all(
			files.map((file) => readJsonFile<TRecord>(file))
		);

		return records
			.filter(
				(record) =>
					record.assistantId === input.assistantId &&
					(input.namespace === undefined || record.namespace === input.namespace)
			)
			.sort((left, right) => right.updatedAt - left.updatedAt);
	};

	const set: VoiceAssistantMemoryStore<TRecord>['set'] = async (input) => {
		const existing = await get(input);
		const record = createVoiceAssistantMemoryRecord({
			...input,
			createdAt: input.createdAt ?? existing?.createdAt,
			updatedAt: input.updatedAt
		}) as TRecord;
		await writeJsonFile(
			resolveFilePath(options.directory, createMemoryStoreId(record)),
			record,
			options
		);
		return record;
	};

	const remove: VoiceAssistantMemoryStore<TRecord>['delete'] = async (input) => {
		await rm(resolveFilePath(options.directory, createMemoryStoreId(input)), {
			force: true
		});
	};

	return { delete: remove, get, list, set };
};

export const createVoiceFileRuntimeStorage = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TReview extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact,
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask,
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent,
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap,
	TTrace extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
	TTraceDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord,
	TAudit extends StoredVoiceAuditEvent = StoredVoiceAuditEvent,
	TAuditDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord,
	TMemory extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord
>(
	options: VoiceFileStoreOptions
): VoiceFileRuntimeStorage<
	TSession,
	TReview,
	TTask,
	TEvent,
	TMapping,
	TTrace,
	TTraceDelivery,
	TAudit,
	TAuditDelivery,
	TMemory
> => ({
	audit: createVoiceFileAuditEventStore<TAudit>({
		...options,
		directory: join(options.directory, 'audit')
	}),
	auditDeliveries: createVoiceFileAuditSinkDeliveryStore<TAuditDelivery>({
		...options,
		directory: join(options.directory, 'audit-deliveries')
	}),
	campaigns: createVoiceFileCampaignStore({
		...options,
		directory: join(options.directory, 'campaigns')
	}),
	events: createVoiceFileIntegrationEventStore<TEvent>({
		...options,
		directory: join(options.directory, 'events')
	}),
	externalObjects: createVoiceFileExternalObjectMapStore<TMapping>({
		...options,
		directory: join(options.directory, 'external-objects')
	}),
	memories: createVoiceFileAssistantMemoryStore<TMemory>({
		...options,
		directory: join(options.directory, 'memories')
	}),
	reviews: createVoiceFileReviewStore<TReview>({
		...options,
		directory: join(options.directory, 'reviews')
	}),
	session: createVoiceFileSessionStore<TSession>({
		...options,
		directory: join(options.directory, 'sessions')
	}),
	tasks: createVoiceFileTaskStore<TTask>({
		...options,
		directory: join(options.directory, 'tasks')
	}),
	traceDeliveries: createVoiceFileTraceSinkDeliveryStore<TTraceDelivery>({
		...options,
		directory: join(options.directory, 'trace-deliveries')
	}),
	traces: createVoiceFileTraceEventStore<TTrace>({
		...options,
		directory: join(options.directory, 'traces')
	})
});

export const createStoredVoiceCallReviewArtifact = <
	TArtifact extends VoiceCallReviewArtifact = VoiceCallReviewArtifact
>(
	id: string,
	artifact: TArtifact
) => withVoiceCallReviewId(id, artifact);

export const createStoredVoiceOpsTask = <
	TTask extends Omit<VoiceOpsTask, 'id'> = Omit<VoiceOpsTask, 'id'>
>(
	id: string,
	task: TTask
) => withVoiceOpsTaskId(id, task);

export const createStoredVoiceIntegrationEvent = <
	TEvent extends Omit<VoiceIntegrationEvent, 'id'> = Omit<
		VoiceIntegrationEvent,
		'id'
	>
>(
	id: string,
	event: TEvent
) => withVoiceIntegrationEventId(id, event);

export const createStoredVoiceExternalObjectMap = <
	TMapping extends Omit<VoiceExternalObjectMap, 'id' | 'createdAt' | 'updatedAt'> =
		Omit<VoiceExternalObjectMap, 'id' | 'createdAt' | 'updatedAt'>
>(
	mapping: TMapping & { at?: number }
) =>
	createVoiceExternalObjectMap({
		at: mapping.at,
		externalId: mapping.externalId,
		provider: mapping.provider,
		sinkId: mapping.sinkId,
		sourceId: mapping.sourceId,
		sourceType: mapping.sourceType
	});
