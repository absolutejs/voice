import { expect, test } from 'bun:test';
import {
	applyVoiceDataRetentionPolicy,
	buildVoiceDataRetentionPlan,
	createVoiceAuditEvent,
	createVoiceAuditSinkDeliveryRecord,
	createVoiceMemoryAuditSinkDeliveryStore,
	createVoiceMemoryTraceSinkDeliveryStore,
	createVoiceMemoryTraceEventStore,
	createVoiceTraceEvent,
	createVoiceTraceSinkDeliveryRecord,
	type StoredVoiceIntegrationEvent,
	type StoredVoiceOpsTask,
	type StoredVoiceTraceEvent,
	type VoiceCallReviewStore,
	type VoiceCampaignRecord,
	type VoiceCampaignStore,
	type VoiceIntegrationEventStore,
	type VoiceOpsTaskStore,
	type VoiceSessionStore
} from '../src';

const createMemoryStore = <TRecord extends { id: string }>(
	records: TRecord[]
) => {
	const stored = new Map(records.map((record) => [record.id, record]));

	return {
		get: (id: string) => stored.get(id),
		list: () => [...stored.values()],
		remove: (id: string) => {
			stored.delete(id);
		},
		set: (id: string, record: TRecord) => {
			stored.set(id, record);
		}
	};
};

const createCampaignStore = (
	records: VoiceCampaignRecord[]
): VoiceCampaignStore => {
	const stored = new Map(
		records.map((record) => [record.campaign.id, record])
	);

	return {
		get: (id) => stored.get(id),
		list: () => [...stored.values()],
		remove: (id) => {
			stored.delete(id);
		},
		set: (id, record) => {
			stored.set(id, record);
		}
	};
};

const createSessionStore = (
	records: Array<{
		createdAt: number;
		id: string;
		lastActivityAt?: number;
		status: 'active' | 'completed';
		turnCount: number;
	}>
): VoiceSessionStore =>
	createMemoryStore(records) as unknown as VoiceSessionStore;

const createTask = (id: string, updatedAt: number): StoredVoiceOpsTask => ({
	createdAt: updatedAt - 10,
	description: `Task ${id}`,
	history: [],
	id,
	kind: 'callback',
	recommendedAction: 'Call back',
	status: 'open',
	title: `Task ${id}`,
	updatedAt
});

const createEvent = (
	id: string,
	createdAt: number
): StoredVoiceIntegrationEvent => ({
	createdAt,
	id,
	payload: {},
	type: 'task.created'
});

const createCampaign = (
	id: string,
	updatedAt: number
): VoiceCampaignRecord => ({
	attempts: [],
	campaign: {
		createdAt: updatedAt - 10,
		id,
		maxAttempts: 1,
		maxConcurrentAttempts: 1,
		name: id,
		status: 'completed',
		updatedAt
	},
	recipients: []
});

test('buildVoiceDataRetentionPlan dry-runs retention across runtime stores', async () => {
	const events = createMemoryStore([
		createEvent('event-old', 100),
		createEvent('event-new', 300)
	]) as VoiceIntegrationEventStore;
	const reviews = createMemoryStore([
		{
			errors: [],
			generatedAt: 100,
			id: 'review-old',
			latencyBreakdown: [],
			notes: [],
			summary: { pass: true },
			title: 'old',
			timeline: [],
			transcript: { actual: '' }
		},
		{
			errors: [],
			generatedAt: 300,
			id: 'review-new',
			latencyBreakdown: [],
			notes: [],
			summary: { pass: true },
			title: 'new',
			timeline: [],
			transcript: { actual: '' }
		}
	]) as VoiceCallReviewStore;
	const sessions = createSessionStore([
		{
			createdAt: 50,
			id: 'session-old',
			lastActivityAt: 100,
			status: 'completed',
			turnCount: 1
		},
		{
			createdAt: 300,
			id: 'session-new',
			lastActivityAt: 300,
			status: 'active',
			turnCount: 1
		}
	]);
	const tasks = createMemoryStore([
		createTask('task-old', 100),
		createTask('task-new', 300)
	]) as VoiceOpsTaskStore;

	const report = await buildVoiceDataRetentionPlan({
		beforeOrAt: 200,
		events,
		reviews,
		scopes: ['events', 'reviews', 'sessions', 'tasks'],
		session: sessions,
		tasks
	});

	expect(report.dryRun).toBe(true);
	expect(report.deletedCount).toBe(4);
	expect(
		report.scopes.flatMap((scope) => scope.deletedIds).sort()
	).toEqual(['event-old', 'review-old', 'session-old', 'task-old']);
	expect((await events.list()).map((event) => event.id).sort()).toEqual([
		'event-new',
		'event-old'
	]);
});

test('applyVoiceDataRetentionPolicy removes selected records and keeps newest per scope', async () => {
	const campaigns = createCampaignStore([
		createCampaign('campaign-100', 100),
		createCampaign('campaign-200', 200),
		createCampaign('campaign-300', 300)
	]);
	const traces = createVoiceMemoryTraceEventStore();
	const traceEvents: StoredVoiceTraceEvent[] = [
		createVoiceTraceEvent({
			at: 100,
			id: 'trace-100',
			payload: {},
			sessionId: 'session-a',
			type: 'turn.transcript'
		}),
		createVoiceTraceEvent({
			at: 200,
			id: 'trace-200',
			payload: {},
			sessionId: 'session-a',
			type: 'turn.assistant'
		}),
		createVoiceTraceEvent({
			at: 300,
			id: 'trace-300',
			payload: {},
			sessionId: 'session-a',
			type: 'turn.cost'
		})
	];
	await Promise.all(traceEvents.map((event) => traces.append(event)));

	const report = await applyVoiceDataRetentionPolicy({
		campaigns,
		keepNewest: {
			campaigns: 1,
			traces: 1
		},
		scopes: ['campaigns', 'traces'],
		traces
	});

	expect(report.dryRun).toBe(false);
	expect(report.deletedCount).toBe(4);
	expect((await campaigns.list()).map((record) => record.campaign.id)).toEqual([
		'campaign-300'
	]);
	expect((await traces.list()).map((event) => event.id)).toEqual(['trace-300']);
});

test('applyVoiceDataRetentionPolicy prunes trace and audit delivery queues', async () => {
	const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
	const traceDeliveries = createVoiceMemoryTraceSinkDeliveryStore();
	const auditEvent = createVoiceAuditEvent({
		action: 'provider.call',
		at: 100,
		type: 'provider.call'
	});
	const traceEvent = createVoiceTraceEvent({
		at: 100,
		payload: {},
		sessionId: 'session-a',
		type: 'turn.assistant'
	});
	await auditDeliveries.set(
		'audit-delivery-old',
		createVoiceAuditSinkDeliveryRecord({
			createdAt: 90,
			events: [auditEvent],
			id: 'audit-delivery-old',
			updatedAt: 100
		})
	);
	await auditDeliveries.set(
		'audit-delivery-new',
		createVoiceAuditSinkDeliveryRecord({
			createdAt: 290,
			events: [auditEvent],
			id: 'audit-delivery-new',
			updatedAt: 300
		})
	);
	await traceDeliveries.set(
		'trace-delivery-old',
		createVoiceTraceSinkDeliveryRecord({
			createdAt: 90,
			events: [traceEvent],
			id: 'trace-delivery-old',
			updatedAt: 100
		})
	);
	await traceDeliveries.set(
		'trace-delivery-new',
		createVoiceTraceSinkDeliveryRecord({
			createdAt: 290,
			events: [traceEvent],
			id: 'trace-delivery-new',
			updatedAt: 300
		})
	);

	const report = await applyVoiceDataRetentionPolicy({
		auditDeliveries,
		beforeOrAt: 200,
		scopes: ['auditDeliveries', 'traceDeliveries'],
		traceDeliveries
	});

	expect(report.deletedCount).toBe(2);
	expect(report.scopes.map((scope) => scope.scope)).toEqual([
		'auditDeliveries',
		'traceDeliveries'
	]);
	expect((await auditDeliveries.list()).map((delivery) => delivery.id)).toEqual([
		'audit-delivery-new'
	]);
	expect((await traceDeliveries.list()).map((delivery) => delivery.id)).toEqual([
		'trace-delivery-new'
	]);
});

test('applyVoiceDataRetentionPolicy skips scopes without explicit selectors', async () => {
	const traces = createVoiceMemoryTraceEventStore();
	await traces.append(
		createVoiceTraceEvent({
			at: 100,
			id: 'trace-100',
			payload: {},
			sessionId: 'session-a',
			type: 'turn.transcript'
		})
	);

	const report = await applyVoiceDataRetentionPolicy({
		scopes: ['events', 'traces'],
		traces
	});

	expect(report.deletedCount).toBe(0);
	expect(report.scopes).toEqual([
		{
			deletedCount: 0,
			deletedIds: [],
			dryRun: false,
			scannedCount: 0,
			scope: 'events',
			skippedReason: 'missing-selector'
		},
		{
			deletedCount: 0,
			deletedIds: [],
			dryRun: false,
			scannedCount: 1,
			scope: 'traces',
			skippedReason: 'missing-selector'
		}
	]);
	expect((await traces.list()).map((event) => event.id)).toEqual(['trace-100']);
});
