import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	createStoredVoiceCallReviewArtifact,
	createStoredVoiceExternalObjectMap,
	createStoredVoiceIntegrationEvent,
	createStoredVoiceOpsTask,
	createVoiceFileExternalObjectMapStore,
	createVoiceFileIntegrationEventStore,
	createVoiceFileReviewStore,
	createVoiceFileRuntimeStorage,
	createVoiceFileSessionStore,
	createVoiceFileTaskStore
} from '../src';

const tempDirectories: string[] = [];

const createTempDirectory = async () => {
	const directory = await mkdtemp(join(tmpdir(), 'absolutejs-voice-'));
	tempDirectories.push(directory);
	return directory;
};

afterEach(async () => {
	await Promise.all(
		tempDirectories.splice(0).map((directory) =>
			rm(directory, {
				force: true,
				recursive: true
			})
		)
	);
});

test('createVoiceFileSessionStore persists sessions across instances', async () => {
	const directory = await createTempDirectory();
	const firstStore = createVoiceFileSessionStore({
		directory
	});

	const session = await firstStore.getOrCreate('session-1');
	session.lastActivityAt = 1234;
	await firstStore.set('session-1', session);

	const secondStore = createVoiceFileSessionStore({
		directory
	});
	const restored = await secondStore.get('session-1');
	const summaries = await secondStore.list();

	expect(restored?.id).toBe('session-1');
	expect(restored?.lastActivityAt).toBe(1234);
	expect(summaries).toHaveLength(1);
	expect(summaries[0]?.id).toBe('session-1');
});

test('createVoiceFileReviewStore persists and sorts review artifacts', async () => {
	const directory = await createTempDirectory();
	const store = createVoiceFileReviewStore({
		directory
	});

	await store.set(
		'review-1',
		createStoredVoiceCallReviewArtifact('review-1', {
			errors: [],
			generatedAt: 100,
			latencyBreakdown: [],
			notes: [],
			summary: {
				pass: true
			},
			title: 'Older review',
			timeline: [],
			transcript: {
				actual: 'older'
			}
		})
	);
	await store.set(
		'review-2',
		createStoredVoiceCallReviewArtifact('review-2', {
			errors: [],
			generatedAt: 200,
			latencyBreakdown: [],
			notes: [],
			summary: {
				pass: true
			},
			title: 'Newer review',
			timeline: [],
			transcript: {
				actual: 'newer'
			}
		})
	);

	const stored = await store.get('review-1');
	const reviews = await store.list();

	expect(stored?.id).toBe('review-1');
	expect(reviews.map((review) => review.id)).toEqual(['review-2', 'review-1']);
});

test('createVoiceFileRuntimeStorage exposes persistent sessions and reviews', async () => {
	const directory = await createTempDirectory();
	const runtimeStorage = createVoiceFileRuntimeStorage({
		directory
	});

	const session = await runtimeStorage.session.getOrCreate('session-2');
	await runtimeStorage.session.set('session-2', {
		...session,
		lastActivityAt: 2222
	});
	await runtimeStorage.reviews.set(
		'review-runtime',
		createStoredVoiceCallReviewArtifact('review-runtime', {
			errors: [],
			generatedAt: 300,
			latencyBreakdown: [],
			notes: [],
			summary: {
				pass: true
			},
			title: 'Runtime review',
			timeline: [],
			transcript: {
				actual: 'runtime'
			}
		})
	);

	const secondRuntimeStorage = createVoiceFileRuntimeStorage({
		directory
	});

	expect((await secondRuntimeStorage.session.get('session-2'))?.lastActivityAt).toBe(
		2222
	);
	expect((await secondRuntimeStorage.reviews.get('review-runtime'))?.title).toBe(
		'Runtime review'
	);
});

test('createVoiceFileTaskStore persists tasks across instances', async () => {
	const directory = await createTempDirectory();
	const store = createVoiceFileTaskStore({
		directory
	});

	await store.set(
		'task-1',
		createStoredVoiceOpsTask('task-1', {
			createdAt: 100,
			description: 'Follow up with the caller',
			history: [],
			intakeId: 'intake-1',
			kind: 'callback',
			recommendedAction: 'Call them back',
			status: 'open',
			title: 'Callback lead',
			updatedAt: 100
		})
	);

	const secondStore = createVoiceFileTaskStore({
		directory
	});
	const restored = await secondStore.get('task-1');

	expect(restored?.id).toBe('task-1');
	expect(restored?.kind).toBe('callback');
	expect((await secondStore.list()).map((task) => task.id)).toEqual(['task-1']);
});

test('createVoiceFileIntegrationEventStore persists and sorts events', async () => {
	const directory = await createTempDirectory();
	const store = createVoiceFileIntegrationEventStore({
		directory
	});

	await store.set(
		'event-1',
		createStoredVoiceIntegrationEvent('event-1', {
			createdAt: 100,
			payload: {
				reviewId: 'review-1'
			},
			type: 'review.saved'
		})
	);
	await store.set(
		'event-2',
		createStoredVoiceIntegrationEvent('event-2', {
			createdAt: 200,
			payload: {
				taskId: 'task-1'
			},
			type: 'task.created'
		})
	);

	const events = await store.list();

	expect(events.map((event) => event.id)).toEqual(['event-2', 'event-1']);
});

test('createVoiceFileExternalObjectMapStore persists and finds vendor object mappings', async () => {
	const directory = await createTempDirectory();
	const store = createVoiceFileExternalObjectMapStore({
		directory
	});

	const mapping = createStoredVoiceExternalObjectMap({
		at: 100,
		externalId: 'hubspot-123',
		provider: 'hubspot',
		sinkId: 'hubspot',
		sourceId: 'task-1',
		sourceType: 'task'
	});

	await store.set(mapping.id, mapping);

	const secondStore = createVoiceFileExternalObjectMapStore({
		directory
	});
	const restored = await secondStore.find({
		provider: 'hubspot',
		sinkId: 'hubspot',
		sourceId: 'task-1',
		sourceType: 'task'
	});

	expect(restored?.externalId).toBe('hubspot-123');
	expect((await secondStore.list()).map((item) => item.id)).toEqual([mapping.id]);
});

test('createVoiceFileRuntimeStorage exposes persistent tasks and events', async () => {
	const directory = await createTempDirectory();
	const runtimeStorage = createVoiceFileRuntimeStorage({
		directory
	});

	await runtimeStorage.tasks.set(
		'task-runtime',
		createStoredVoiceOpsTask('task-runtime', {
			createdAt: 100,
			description: 'Check transfer handoff',
			history: [],
			intakeId: 'intake-runtime',
			kind: 'transfer-check',
			recommendedAction: 'Verify downstream queue receipt',
			status: 'open',
			title: 'Verify transfer',
			updatedAt: 100
		})
	);
	await runtimeStorage.events.set(
		'event-runtime',
		createStoredVoiceIntegrationEvent('event-runtime', {
			createdAt: 100,
			payload: {
				sessionId: 'session-2'
			},
			type: 'call.completed'
		})
	);
	await runtimeStorage.externalObjects.set(
		'hubspot:hubspot:task-runtime',
		createStoredVoiceExternalObjectMap({
			at: 100,
			externalId: 'hubspot-task-runtime',
			provider: 'hubspot',
			sinkId: 'hubspot',
			sourceId: 'task-runtime',
			sourceType: 'task'
		})
	);

	const secondRuntimeStorage = createVoiceFileRuntimeStorage({
		directory
	});

	expect((await secondRuntimeStorage.tasks.get('task-runtime'))?.title).toBe(
		'Verify transfer'
	);
	expect((await secondRuntimeStorage.events.get('event-runtime'))?.type).toBe(
		'call.completed'
	);
	expect(
		(
			await secondRuntimeStorage.externalObjects.find({
				provider: 'hubspot',
				sourceId: 'task-runtime',
				sourceType: 'task'
			})
		)?.externalId
	).toBe('hubspot-task-runtime');
});
