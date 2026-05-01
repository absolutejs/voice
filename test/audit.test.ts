import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from 'bun:test';
import {
	applyVoiceDataRetentionPolicy,
	createVoiceAuditLogger,
	createVoiceFileRuntimeStorage,
	createVoiceMemoryAuditEventStore,
	createVoiceScopedAuditEventStore,
	recordVoiceProviderAuditEvent,
	type StoredVoiceOpsTask
} from '../src';

test('voice audit logger records and filters provider tool handoff and operator evidence', async () => {
	const store = createVoiceMemoryAuditEventStore();
	const audit = createVoiceAuditLogger(store);

	await audit.providerCall({
		kind: 'llm',
		model: 'gpt-4.1',
		outcome: 'success',
		provider: 'openai',
		sessionId: 'session-1'
	});
	await audit.toolCall({
		outcome: 'error',
		toolCallId: 'tool-call-1',
		toolName: 'book_meeting',
		traceId: 'trace-1'
	});
	await audit.handoff({
		fromAgentId: 'front-desk',
		outcome: 'success',
		toAgentId: 'billing'
	});
	await audit.operatorAction({
		action: 'review.approve',
		actor: {
			id: 'operator-1',
			kind: 'operator'
		},
		resource: {
			id: 'review-1',
			type: 'review'
		}
	});

	expect((await store.list()).map((event) => event.type).sort()).toEqual([
		'handoff',
		'operator.action',
		'provider.call',
		'tool.call'
	]);
	expect(await store.list({ outcome: 'error' })).toMatchObject([
		{
			payload: {
				toolCallId: 'tool-call-1',
				toolName: 'book_meeting'
			},
			type: 'tool.call'
		}
	]);
	expect(await store.list({ actorId: 'operator-1' })).toHaveLength(1);
	expect(await store.list({ resourceType: 'provider' })).toHaveLength(1);
});

test('createVoiceScopedAuditEventStore enforces session scope after listing', async () => {
	const store = createVoiceMemoryAuditEventStore();
	await store.append({
		action: 'proof.generated',
		outcome: 'success',
		sessionId: 'session-a',
		type: 'operator.action'
	});
	await store.append({
		action: 'proof.generated',
		outcome: 'success',
		sessionId: 'session-b',
		type: 'operator.action'
	});

	const scoped = createVoiceScopedAuditEventStore(store, {
		sessionId: 'session-a'
	});

	await expect(scoped.list()).resolves.toMatchObject([
		{ sessionId: 'session-a' }
	]);
	await expect(scoped.list({ sessionId: 'session-b' })).resolves.toMatchObject([
		{ sessionId: 'session-a' }
	]);
});

test('retention policy can append audit evidence for dry-runs and deletes', async () => {
	const audit = createVoiceMemoryAuditEventStore();
	const tasks = new Map<string, StoredVoiceOpsTask>([
		[
			'task-old',
			{
				createdAt: 100,
				description: 'Old task',
				history: [],
				id: 'task-old',
				kind: 'callback' as const,
				recommendedAction: 'Call back',
				status: 'open' as const,
				title: 'Old task',
				updatedAt: 100
			}
		]
	]);
	const taskStore = {
		get: (id: string) => tasks.get(id),
		list: () => [...tasks.values()],
		remove: (id: string) => {
			tasks.delete(id);
		},
		set: (id: string, task: StoredVoiceOpsTask) => {
			tasks.set(id, task);
		}
	};

	const report = await applyVoiceDataRetentionPolicy({
		audit,
		beforeOrAt: 200,
		scopes: ['tasks'],
		tasks: taskStore
	});

	expect(report.deletedCount).toBe(1);
	expect(tasks.size).toBe(0);
	expect(await audit.list({ type: 'retention.policy' })).toMatchObject([
		{
			action: 'retention.apply',
			payload: {
				deletedCount: 1,
				dryRun: false
			}
		}
	]);
});

test('file runtime storage persists audit events', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'voice-audit-'));

	try {
		const first = createVoiceFileRuntimeStorage({ directory });
		const event = await recordVoiceProviderAuditEvent({
			kind: 'tts',
			outcome: 'success',
			provider: 'elevenlabs',
			store: first.audit
		});
		const second = createVoiceFileRuntimeStorage({ directory });

		expect(await second.audit.get(event.id)).toMatchObject({
			id: event.id,
			type: 'provider.call'
		});
		expect(await second.audit.list({ resourceId: 'elevenlabs' })).toHaveLength(1);
	} finally {
		await rm(directory, {
			force: true,
			recursive: true
		});
	}
});
