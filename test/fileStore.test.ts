import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	createStoredVoiceCallReviewArtifact,
	createStoredVoiceExternalObjectMap,
	createStoredVoiceIntegrationEvent,
	createStoredVoiceOpsTask,
	createVoiceAuditEvent,
	createVoiceFileExternalObjectMapStore,
	createVoiceFileAssistantMemoryStore,
	createVoiceFileIncidentBundleStore,
	createVoiceFileIntegrationEventStore,
	createVoiceFileAuditSinkDeliveryStore,
	createVoiceFileReviewStore,
	createVoiceFileRuntimeStorage,
	createVoiceFileSessionStore,
	createVoiceFileTaskStore,
	createVoiceFileTraceSinkDeliveryStore,
	createVoiceFileTraceEventStore,
	createVoiceTraceEvent,
	createVoiceAuditSinkDeliveryRecord,
	createVoiceTraceSinkDeliveryRecord
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

test('createVoiceFileIncidentBundleStore persists and filters incident artifacts', async () => {
	const directory = await createTempDirectory();
	const store = createVoiceFileIncidentBundleStore({
		directory
	});
	const artifact = {
		bundle: {
			exportedAt: 100,
			formatVersion: 1 as const,
			markdown: '# Incident',
			record: {
				checkedAt: 100,
				handoffs: [],
				outcome: {
					assistantReplies: 0,
					complete: false,
					escalated: false,
					noAnswer: false,
					transferred: false,
					voicemail: false
				},
				providers: [],
				replay: {
					evaluation: {
						issues: [],
						pass: true,
						summary: {
							assistantReplyCount: 0,
							cost: {
								estimatedRelativeCostUnits: 0,
								totalBillableAudioMs: 0
							},
							errorCount: 0,
							eventCount: 0,
							failed: false,
							handoffCount: 0,
							modelCallCount: 0,
							toolCallCount: 0,
							toolErrorCount: 0,
							transcriptCount: 0,
							turnCount: 0
						}
					},
					events: [],
					html: '',
					markdown: '',
					sessionId: 'incident-session',
					summary: {
						assistantReplyCount: 0,
						cost: {
							estimatedRelativeCostUnits: 0,
							totalBillableAudioMs: 0
						},
						errorCount: 0,
						eventCount: 0,
						failed: false,
						handoffCount: 0,
						modelCallCount: 0,
						toolCallCount: 0,
						toolErrorCount: 0,
						transcriptCount: 0,
						turnCount: 0
					},
					timeline: [],
					turns: []
				},
				sessionId: 'incident-session',
				status: 'healthy' as const,
				summary: {
					assistantReplyCount: 0,
					cost: {
						estimatedRelativeCostUnits: 0,
						totalBillableAudioMs: 0
					},
					errorCount: 0,
					eventCount: 0,
					failed: false,
					handoffCount: 0,
					modelCallCount: 0,
					toolCallCount: 0,
					toolErrorCount: 0,
					transcriptCount: 0,
					turnCount: 0
				},
				timeline: [],
				tools: [],
				traceEvents: []
			},
			redacted: true,
			sessionId: 'incident-session',
			summary: {
				auditEvents: 0,
				errors: 0,
				handoffs: 0,
				providers: [],
				sessionId: 'incident-session',
				status: 'healthy' as const,
				tools: 0,
				traceEvents: 0,
				turns: 0
			},
			traceMarkdown: ''
		},
		createdAt: 100,
		expiresAt: 150,
		id: 'incident-file',
		redacted: true,
		sessionId: 'incident-session'
	};
	await store.set('incident-file', artifact);

	const secondStore = createVoiceFileIncidentBundleStore({
		directory
	});
	expect((await secondStore.get('incident-file'))?.sessionId).toBe(
		'incident-session'
	);
	expect((await secondStore.list({ expiredAt: 160 })).map((item) => item.id)).toEqual([
		'incident-file'
	]);
	await secondStore.remove('incident-file');
	expect(await secondStore.get('incident-file')).toBeUndefined();
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
	await runtimeStorage.traces.append({
		at: 400,
		payload: {
			agentId: 'support'
		},
		sessionId: 'session-2',
		type: 'agent.result'
	});
	await runtimeStorage.traceDeliveries.set(
		'trace-delivery-runtime',
		createVoiceTraceSinkDeliveryRecord({
			createdAt: 500,
			events: [
				createVoiceTraceEvent({
					at: 500,
					payload: {
						text: 'queued'
					},
					sessionId: 'session-2',
					type: 'turn.assistant'
				})
			],
			id: 'trace-delivery-runtime'
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
	expect((await secondRuntimeStorage.traces.list({ sessionId: 'session-2' }))[0]?.type).toBe(
		'agent.result'
	);
	expect((await secondRuntimeStorage.traceDeliveries.list())[0]?.id).toBe(
		'trace-delivery-runtime'
	);
});

test('createVoiceFileTraceEventStore persists and filters trace events', async () => {
	const directory = await createTempDirectory();
	const store = createVoiceFileTraceEventStore({
		directory
	});

	await store.append({
		at: 100,
		payload: {
			agentId: 'support'
		},
		scenarioId: 'scenario-trace',
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
		scenarioId: 'scenario-trace',
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'agent.tool'
	});

	const secondStore = createVoiceFileTraceEventStore({
		directory
	});
	const events = await secondStore.list({
		sessionId: 'session-trace',
		type: 'agent.tool'
	});

	expect(events).toHaveLength(1);
	expect(events[0]).toMatchObject({
		at: 200,
		payload: {
			agentId: 'support',
			toolName: 'lookup_order'
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'agent.tool'
	});
	expect(await secondStore.get(events[0]!.id)).toMatchObject({
		type: 'agent.tool'
	});
});

test('createVoiceFileTraceSinkDeliveryStore persists queued trace deliveries', async () => {
	const directory = await createTempDirectory();
	const store = createVoiceFileTraceSinkDeliveryStore({
		directory
	});
	const delivery = createVoiceTraceSinkDeliveryRecord({
		createdAt: 100,
		events: [
			createVoiceTraceEvent({
				at: 100,
				payload: {
					text: 'durable trace'
				},
				sessionId: 'session-delivery',
				type: 'turn.assistant'
			})
		],
		id: 'trace-delivery-1'
	});

	await store.set(delivery.id, delivery);

	const secondStore = createVoiceFileTraceSinkDeliveryStore({
		directory
	});
	const restored = await secondStore.get(delivery.id);

	expect(restored).toMatchObject({
		deliveryStatus: 'pending',
		id: 'trace-delivery-1'
	});
	expect((await secondStore.list()).map((item) => item.id)).toEqual([
		'trace-delivery-1'
	]);
});

test('createVoiceFileAuditSinkDeliveryStore persists queued audit deliveries', async () => {
	const directory = await createTempDirectory();
	const store = createVoiceFileAuditSinkDeliveryStore({
		directory
	});
	const delivery = createVoiceAuditSinkDeliveryRecord({
		createdAt: 100,
		events: [
			createVoiceAuditEvent({
				action: 'provider.call',
				at: 100,
				type: 'provider.call'
			})
		],
		id: 'audit-delivery-1'
	});

	await store.set(delivery.id, delivery);

	const secondStore = createVoiceFileAuditSinkDeliveryStore({
		directory
	});

	expect(await secondStore.get(delivery.id)).toMatchObject({
		deliveryStatus: 'pending',
		id: 'audit-delivery-1'
	});
	expect((await secondStore.list()).map((item) => item.id)).toEqual([
		'audit-delivery-1'
	]);
});

test('createVoiceFileAssistantMemoryStore persists namespaced memory records', async () => {
	const directory = join(tmpdir(), `voice-memory-${crypto.randomUUID()}`);
	const store = createVoiceFileAssistantMemoryStore({
		directory
	});

	await store.set({
		assistantId: 'support',
		key: 'caller.name',
		namespace: 'caller-1',
		value: 'Alex'
	});

	expect(await store.get({
		assistantId: 'support',
		key: 'caller.name',
		namespace: 'caller-1'
	})).toMatchObject({
		assistantId: 'support',
		key: 'caller.name',
		namespace: 'caller-1',
		value: 'Alex'
	});
	expect(await store.list({
		assistantId: 'support',
		namespace: 'caller-1'
	})).toHaveLength(1);

	await store.delete({
		assistantId: 'support',
		key: 'caller.name',
		namespace: 'caller-1'
	});

	expect(await store.list({
		assistantId: 'support',
		namespace: 'caller-1'
	})).toHaveLength(0);
});
