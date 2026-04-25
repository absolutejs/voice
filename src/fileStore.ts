import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	createVoiceExternalObjectMap,
	withVoiceIntegrationEventId,
	withVoiceOpsTaskId
} from './ops';
import { createVoiceSessionRecord, toVoiceSessionSummary } from './store';
import { withVoiceCallReviewId } from './testing/review';
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
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap
> = {
	events: VoiceIntegrationEventStore<TEvent>;
	externalObjects: VoiceExternalObjectMapStore<TMapping>;
	reviews: VoiceCallReviewStore<TReview>;
	session: VoiceSessionStore<TSession>;
	tasks: VoiceOpsTaskStore<TTask>;
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

export const createVoiceFileRuntimeStorage = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TReview extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact,
	TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask,
	TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent,
	TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap
>(
	options: VoiceFileStoreOptions
): VoiceFileRuntimeStorage<TSession, TReview, TTask, TEvent, TMapping> => ({
	events: createVoiceFileIntegrationEventStore<TEvent>({
		...options,
		directory: join(options.directory, 'events')
	}),
	externalObjects: createVoiceFileExternalObjectMapStore<TMapping>({
		...options,
		directory: join(options.directory, 'external-objects')
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
