import { afterEach, expect, test } from 'bun:test';
import {
	createStoredVoiceCallReviewArtifact,
	createStoredVoiceExternalObjectMap,
	createStoredVoiceIntegrationEvent,
	createStoredVoiceOpsTask,
	createVoicePostgresExternalObjectMapStore,
	createVoicePostgresIntegrationEventStore,
	createVoicePostgresReviewStore,
	createVoicePostgresRuntimeStorage,
	createVoicePostgresSessionStore,
	createVoicePostgresTaskStore,
	createVoicePostgresTraceEventStore
} from '../src';
import type { VoicePostgresClient } from '../src';

type StoredRow = {
	id: string;
	payload: unknown;
	sortAt: number;
};

const createFakePostgresClient = (): VoicePostgresClient => {
	const tables = new Map<string, Map<string, StoredRow>>();

	const getTable = (qualifiedName: string) => {
		let table = tables.get(qualifiedName);
		if (!table) {
			table = new Map<string, StoredRow>();
			tables.set(qualifiedName, table);
		}
		return table;
	};

	const parseTableName = (query: string, keyword: 'FROM' | 'INTO' | 'TABLE') => {
		const keywordPattern =
			keyword === 'TABLE' ? 'TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?' : keyword;
		const match = query.match(
			new RegExp(`${keywordPattern}\\s+("[^"]+"\\."[^"]+"|"[^"]+")`, 'i')
		);
		if (!match?.[1]) {
			throw new Error(`Could not parse table name from query: ${query}`);
		}
		return match[1];
	};

	return {
		unsafe: async (query, parameters = []) => {
			const normalized = query.replace(/\s+/g, ' ').trim().toUpperCase();

			if (normalized.startsWith('CREATE TABLE IF NOT EXISTS')) {
				getTable(parseTableName(query, 'TABLE'));
				return [];
			}

			if (normalized.startsWith('CREATE SCHEMA IF NOT EXISTS')) {
				return [];
			}

			if (normalized.startsWith('SELECT PAYLOAD FROM')) {
				const table = getTable(parseTableName(query, 'FROM'));
				if (normalized.includes('WHERE ID = $1')) {
					const row = table.get(String(parameters[0]));
					return row ? ([{ payload: row.payload }] as Array<Record<string, unknown>>) : [];
				}

				return [...table.values()]
					.sort((left, right) =>
						right.sortAt === left.sortAt
							? right.id.localeCompare(left.id)
							: right.sortAt - left.sortAt
					)
					.map((row) => ({
						payload: row.payload
					})) as Array<Record<string, unknown>>;
			}

			if (normalized.startsWith('INSERT INTO')) {
				const table = getTable(parseTableName(query, 'INTO'));
				table.set(String(parameters[0]), {
					id: String(parameters[0]),
					payload: JSON.parse(String(parameters[2])),
					sortAt: Number(parameters[1])
				});
				return [];
			}

			if (normalized.startsWith('DELETE FROM')) {
				const table = getTable(parseTableName(query, 'FROM'));
				table.delete(String(parameters[0]));
				return [];
			}

			throw new Error(`Unsupported fake postgres query: ${query}`);
		}
	};
};

afterEach(() => {
	// No shared process state outside each fake client instance.
});

test('createVoicePostgresSessionStore persists sessions across instances', async () => {
	const sql = createFakePostgresClient();
	const firstStore = createVoicePostgresSessionStore({
		sql
	});

	const session = await firstStore.getOrCreate('session-1');
	session.lastActivityAt = 1234;
	await firstStore.set('session-1', session);

	const secondStore = createVoicePostgresSessionStore({
		sql
	});
	const restored = await secondStore.get('session-1');
	const summaries = await secondStore.list();

	expect(restored?.id).toBe('session-1');
	expect(restored?.lastActivityAt).toBe(1234);
	expect(summaries).toHaveLength(1);
	expect(summaries[0]?.id).toBe('session-1');
});

test('createVoicePostgresReviewStore persists and sorts review artifacts', async () => {
	const sql = createFakePostgresClient();
	const store = createVoicePostgresReviewStore({
		sql
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

	const reviews = await store.list();
	expect(reviews.map((review) => review.id)).toEqual(['review-2', 'review-1']);
});

test('createVoicePostgresTaskStore persists tasks across instances', async () => {
	const sql = createFakePostgresClient();
	const store = createVoicePostgresTaskStore({
		sql
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

	const secondStore = createVoicePostgresTaskStore({
		sql
	});
	expect((await secondStore.get('task-1'))?.kind).toBe('callback');
	expect((await secondStore.list()).map((task) => task.id)).toEqual(['task-1']);
});

test('createVoicePostgresIntegrationEventStore persists and sorts events', async () => {
	const sql = createFakePostgresClient();
	const store = createVoicePostgresIntegrationEventStore({
		sql
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

	expect((await store.list()).map((event) => event.id)).toEqual([
		'event-2',
		'event-1'
	]);
});

test('createVoicePostgresExternalObjectMapStore persists and finds vendor object mappings', async () => {
	const sql = createFakePostgresClient();
	const store = createVoicePostgresExternalObjectMapStore({
		sql
	});

	const mapping = createStoredVoiceExternalObjectMap({
		at: 100,
		externalId: 'zendesk-123',
		provider: 'zendesk',
		sinkId: 'zendesk',
		sourceId: 'task-1',
		sourceType: 'task'
	});

	await store.set(mapping.id, mapping);

	const secondStore = createVoicePostgresExternalObjectMapStore({
		sql
	});
	const restored = await secondStore.find({
		provider: 'zendesk',
		sinkId: 'zendesk',
		sourceId: 'task-1',
		sourceType: 'task'
	});

	expect(restored?.externalId).toBe('zendesk-123');
	expect((await secondStore.list()).map((item) => item.id)).toEqual([mapping.id]);
});

test('createVoicePostgresTraceEventStore persists and filters trace events', async () => {
	const sql = createFakePostgresClient();
	const store = createVoicePostgresTraceEventStore({
		sql
	});

	await store.append({
		at: 100,
		payload: {
			agentId: 'support'
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'agent.model'
	});
	await store.append({
		at: 200,
		payload: {
			agentId: 'support',
			toolName: 'lookup_order'
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'agent.tool'
	});

	const secondStore = createVoicePostgresTraceEventStore({
		sql
	});
	expect((await secondStore.list({ type: 'agent.tool' }))[0]).toMatchObject({
		payload: {
			toolName: 'lookup_order'
		},
		sessionId: 'session-trace',
		type: 'agent.tool'
	});
});

test('createVoicePostgresRuntimeStorage exposes persistent sessions, reviews, tasks, events, and external object maps', async () => {
	const sql = createFakePostgresClient();
	const runtimeStorage = createVoicePostgresRuntimeStorage({
		sql
	});

	const session = await runtimeStorage.session.getOrCreate('session-runtime');
	await runtimeStorage.session.set('session-runtime', {
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
				sessionId: 'session-runtime'
			},
			type: 'call.completed'
		})
	);
	await runtimeStorage.externalObjects.set(
		'zendesk:zendesk:task-runtime',
		createStoredVoiceExternalObjectMap({
			at: 100,
			externalId: 'zendesk-task-runtime',
			provider: 'zendesk',
			sinkId: 'zendesk',
			sourceId: 'task-runtime',
			sourceType: 'task'
		})
	);
	await runtimeStorage.traces.append({
		at: 400,
		payload: {
			agentId: 'support'
		},
		sessionId: 'session-runtime',
		type: 'agent.result'
	});

	const secondRuntimeStorage = createVoicePostgresRuntimeStorage({
		sql
	});

	expect((await secondRuntimeStorage.session.get('session-runtime'))?.lastActivityAt).toBe(
		2222
	);
	expect((await secondRuntimeStorage.reviews.get('review-runtime'))?.title).toBe(
		'Runtime review'
	);
	expect((await secondRuntimeStorage.tasks.get('task-runtime'))?.title).toBe(
		'Verify transfer'
	);
	expect((await secondRuntimeStorage.events.get('event-runtime'))?.type).toBe(
		'call.completed'
	);
	expect(
		(
			await secondRuntimeStorage.externalObjects.find({
				provider: 'zendesk',
				sourceId: 'task-runtime',
				sourceType: 'task'
			})
		)?.externalId
	).toBe('zendesk-task-runtime');
	expect((await secondRuntimeStorage.traces.list({ sessionId: 'session-runtime' }))[0]?.type).toBe(
		'agent.result'
	);
});
