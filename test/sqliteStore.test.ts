import { afterEach, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	createStoredVoiceCallReviewArtifact,
	createStoredVoiceExternalObjectMap,
	createStoredVoiceIntegrationEvent,
	createStoredVoiceOpsTask,
	createVoiceAuditEvent,
	createVoiceAuditSinkDeliveryRecord,
	createVoiceSQLiteAuditEventStore,
	createVoiceSQLiteAuditSinkDeliveryStore,
	createVoiceSQLiteCampaignStore,
	createVoiceSQLiteExternalObjectMapStore,
	createVoiceSQLiteIntegrationEventStore,
	createVoiceSQLiteReviewStore,
	createVoiceSQLiteRuntimeStorage,
	createVoiceSQLiteSessionStore,
	createVoiceSQLiteTaskStore,
	createVoiceSQLiteTelephonyWebhookIdempotencyStore,
	createVoiceSQLiteTraceSinkDeliveryStore,
	createVoiceSQLiteTraceEventStore,
	createVoiceTraceEvent,
	createVoiceTraceSinkDeliveryRecord,
	runVoiceCampaignProof
} from '../src';

const tempPaths: string[] = [];

const createTempSQLitePath = () => {
	const path = join(tmpdir(), `absolutejs-voice-${crypto.randomUUID()}.sqlite`);
	tempPaths.push(path);
	return path;
};

afterEach(async () => {
	await Promise.all(
		tempPaths.splice(0).map((path) =>
			rm(path, {
				force: true
			})
		)
	);
});

test('createVoiceSQLiteSessionStore persists sessions across instances', async () => {
	const path = createTempSQLitePath();
	const firstStore = createVoiceSQLiteSessionStore({
		path
	});

	const session = await firstStore.getOrCreate('session-1');
	session.lastActivityAt = 1234;
	await firstStore.set('session-1', session);

	const secondStore = createVoiceSQLiteSessionStore({
		path
	});
	const restored = await secondStore.get('session-1');
	const summaries = await secondStore.list();

	expect(restored?.id).toBe('session-1');
	expect(restored?.lastActivityAt).toBe(1234);
	expect(summaries).toHaveLength(1);
	expect(summaries[0]?.id).toBe('session-1');
});

test('createVoiceSQLiteReviewStore persists and sorts review artifacts', async () => {
	const path = createTempSQLitePath();
	const store = createVoiceSQLiteReviewStore({
		path
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

test('createVoiceSQLiteTaskStore persists tasks across instances', async () => {
	const path = createTempSQLitePath();
	const store = createVoiceSQLiteTaskStore({
		path
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

	const secondStore = createVoiceSQLiteTaskStore({
		path
	});
	expect((await secondStore.get('task-1'))?.kind).toBe('callback');
	expect((await secondStore.list()).map((task) => task.id)).toEqual(['task-1']);
});

test('createVoiceSQLiteIntegrationEventStore persists and sorts events', async () => {
	const path = createTempSQLitePath();
	const store = createVoiceSQLiteIntegrationEventStore({
		path
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

test('createVoiceSQLiteExternalObjectMapStore persists and finds vendor object mappings', async () => {
	const path = createTempSQLitePath();
	const store = createVoiceSQLiteExternalObjectMapStore({
		path
	});

	const mapping = createStoredVoiceExternalObjectMap({
		at: 100,
		externalId: 'linear-123',
		provider: 'linear',
		sinkId: 'linear',
		sourceId: 'task-1',
		sourceType: 'task'
	});

	await store.set(mapping.id, mapping);

	const secondStore = createVoiceSQLiteExternalObjectMapStore({
		path
	});
	const restored = await secondStore.find({
		provider: 'linear',
		sinkId: 'linear',
		sourceId: 'task-1',
		sourceType: 'task'
	});

	expect(restored?.externalId).toBe('linear-123');
	expect((await secondStore.list()).map((item) => item.id)).toEqual([mapping.id]);
});

test('createVoiceSQLiteTraceEventStore persists and filters trace events', async () => {
	const path = createTempSQLitePath();
	const store = createVoiceSQLiteTraceEventStore({
		path
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

	const secondStore = createVoiceSQLiteTraceEventStore({
		path
	});
	expect((await secondStore.list({ type: 'agent.tool' }))[0]).toMatchObject({
		payload: {
			toolName: 'lookup_order'
		},
		sessionId: 'session-trace',
		type: 'agent.tool'
	});
});

test('createVoiceSQLiteCampaignStore persists campaign proof records across instances', async () => {
	const path = createTempSQLitePath();
	const store = createVoiceSQLiteCampaignStore({
		path
	});

	const proof = await runVoiceCampaignProof({
		store
	});

	const secondStore = createVoiceSQLiteCampaignStore({
		path
	});
	const restored = await secondStore.get(proof.final.campaign.id);

	expect(restored?.recipients).toHaveLength(2);
	expect(restored?.attempts).toHaveLength(2);
	expect((await secondStore.list()).map((record) => record.campaign.id)).toEqual([
		proof.final.campaign.id
	]);
});

test('createVoiceSQLiteRuntimeStorage exposes persistent sessions, reviews, campaigns, tasks, events, and external object maps', async () => {
	const path = createTempSQLitePath();
	const runtimeStorage = createVoiceSQLiteRuntimeStorage({
		path
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
		'linear:linear:task-runtime',
		createStoredVoiceExternalObjectMap({
			at: 100,
			externalId: 'linear-task-runtime',
			provider: 'linear',
			sinkId: 'linear',
			sourceId: 'task-runtime',
			sourceType: 'task'
		})
	);
	const campaignProof = await runVoiceCampaignProof({
		store: runtimeStorage.campaigns
	});
	await runtimeStorage.traces.append({
		at: 400,
		payload: {
			agentId: 'support'
		},
		sessionId: 'session-runtime',
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
					sessionId: 'session-runtime',
					type: 'turn.assistant'
				})
			],
			id: 'trace-delivery-runtime'
		})
	);

	const secondRuntimeStorage = createVoiceSQLiteRuntimeStorage({
		path
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
				provider: 'linear',
				sourceId: 'task-runtime',
				sourceType: 'task'
			})
		)?.externalId
	).toBe('linear-task-runtime');
	expect(
		(await secondRuntimeStorage.campaigns.get(campaignProof.final.campaign.id))
			?.attempts
	).toHaveLength(2);
	expect((await secondRuntimeStorage.traces.list({ sessionId: 'session-runtime' }))[0]?.type).toBe(
		'agent.result'
	);
	expect((await secondRuntimeStorage.traceDeliveries.list())[0]?.id).toBe(
		'trace-delivery-runtime'
	);
});

test('createVoiceSQLiteTraceSinkDeliveryStore persists queued trace deliveries', async () => {
	const path = createTempSQLitePath();
	const store = createVoiceSQLiteTraceSinkDeliveryStore({
		path
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

	const secondStore = createVoiceSQLiteTraceSinkDeliveryStore({
		path
	});

	expect(await secondStore.get(delivery.id)).toMatchObject({
		deliveryStatus: 'pending',
		id: 'trace-delivery-1'
	});
	expect((await secondStore.list()).map((item) => item.id)).toEqual([
		'trace-delivery-1'
	]);
});

test('createVoiceSQLiteAuditSinkDeliveryStore persists queued audit deliveries', async () => {
	const path = createTempSQLitePath();
	const store = createVoiceSQLiteAuditSinkDeliveryStore({
		path
	});
	const delivery = createVoiceAuditSinkDeliveryRecord({
		createdAt: 100,
		events: [
			createVoiceAuditEvent({
				action: 'retention.policy',
				at: 100,
				type: 'retention.policy'
			})
		],
		id: 'audit-delivery-1'
	});

	await store.set(delivery.id, delivery);

	const secondStore = createVoiceSQLiteAuditSinkDeliveryStore({
		path
	});

	expect(await secondStore.get(delivery.id)).toMatchObject({
		deliveryStatus: 'pending',
		id: 'audit-delivery-1'
	});
	expect((await secondStore.list()).map((item) => item.id)).toEqual([
		'audit-delivery-1'
	]);
});

test('createVoiceSQLiteAuditEventStore persists and filters audit events', async () => {
	const path = createTempSQLitePath();
	const store = createVoiceSQLiteAuditEventStore({
		path
	});

	await store.append({
		action: 'llm.provider.call',
		at: 100,
		outcome: 'success',
		resource: {
			id: 'openai',
			type: 'provider'
		},
		sessionId: 'session-audit',
		type: 'provider.call'
	});
	await store.append({
		action: 'tool.call',
		at: 200,
		outcome: 'error',
		resource: {
			id: 'lookup_account',
			type: 'tool'
		},
		sessionId: 'session-audit',
		type: 'tool.call'
	});

	const secondStore = createVoiceSQLiteAuditEventStore({
		path
	});

	expect((await secondStore.list()).map((event) => event.type)).toEqual([
		'provider.call',
		'tool.call'
	]);
	expect(await secondStore.list({ outcome: 'error' })).toMatchObject([
		{
			action: 'tool.call',
			type: 'tool.call'
		}
	]);
	expect(await secondStore.list({ resourceType: 'provider' })).toHaveLength(1);
});

test('createVoiceSQLiteRuntimeStorage exposes persistent audit events', async () => {
	const path = createTempSQLitePath();
	const firstStorage = createVoiceSQLiteRuntimeStorage({
		path
	});
	const event = await firstStorage.audit.append({
		action: 'review.approve',
		actor: {
			id: 'operator-1',
			kind: 'operator'
		},
		at: 100,
		outcome: 'success',
		type: 'operator.action'
	});
	const secondStorage = createVoiceSQLiteRuntimeStorage({
		path
	});

	expect(await secondStorage.audit.get(event.id)).toMatchObject({
		action: 'review.approve',
		type: 'operator.action'
	});
	await firstStorage.auditDeliveries.set(
		'audit-delivery-runtime',
		createVoiceAuditSinkDeliveryRecord({
			events: [event],
			id: 'audit-delivery-runtime'
		})
	);
	expect((await secondStorage.auditDeliveries.list())[0]?.id).toBe(
		'audit-delivery-runtime'
	);
});

test('createVoiceSQLiteTelephonyWebhookIdempotencyStore persists decisions across instances', async () => {
	const path = createTempSQLitePath();
	const firstStore = createVoiceSQLiteTelephonyWebhookIdempotencyStore({
		path
	});

	await firstStore.set('twilio:CA123:busy', {
		applied: true,
		createdAt: 100,
		decision: {
			action: 'no-answer',
			confidence: 'high',
			disposition: 'no-answer',
			source: 'sip'
		},
		event: {
			provider: 'twilio',
			sipCode: 486,
			status: 'busy'
		},
		idempotencyKey: 'twilio:CA123:busy',
		routeResult: {
			noAnswer: {}
		},
		sessionId: 'CA123',
		updatedAt: 100
	});

	const secondStore = createVoiceSQLiteTelephonyWebhookIdempotencyStore({
		path
	});

	expect(await secondStore.get('twilio:CA123:busy')).toMatchObject({
		applied: true,
		decision: {
			action: 'no-answer'
		},
		sessionId: 'CA123'
	});
});
