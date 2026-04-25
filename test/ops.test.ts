import { expect, test } from 'bun:test';
import {
	assignVoiceOpsTask,
	applyVoiceOpsTaskAssignmentRule,
	applyVoiceOpsTaskPolicy,
	buildVoiceOpsTaskFromReview,
	buildVoiceOpsTaskFromSLABreach,
	claimVoiceOpsTask,
	completeVoiceOpsTask,
	createVoiceTaskSLABreachedEvent,
	createStoredVoiceCallReviewArtifact,
	createVoiceCallCompletedEvent,
	deadLetterVoiceOpsTask,
	deliverVoiceIntegrationEvent,
	failVoiceOpsTask,
	hasVoiceOpsTaskSLABreach,
	heartbeatVoiceOpsTask,
	isVoiceOpsTaskOverdue,
	matchesVoiceOpsTaskAssignmentRule,
	markVoiceOpsTaskSLABreached,
	createVoiceReviewSavedEvent,
	resolveVoiceOpsTaskAgeBucket,
	resolveVoiceOpsTaskAssignment,
	resolveVoiceOpsTaskPolicy,
	requeueVoiceOpsTask,
	createVoiceSessionRecord,
	createVoiceTaskCreatedEvent,
	createVoiceTaskUpdatedEvent,
	reopenVoiceOpsTask,
	startVoiceOpsTask,
	summarizeVoiceOpsTaskAnalytics,
	summarizeVoiceOpsTasks
} from '../src';

test('buildVoiceOpsTaskFromReview derives an escalation task from review outcome', () => {
	const review = createStoredVoiceCallReviewArtifact('review-1', {
		errors: [],
		generatedAt: 100,
		latencyBreakdown: [],
		notes: [],
		postCall: {
			label: 'Escalated',
			recommendedAction: 'Review the transcript and assign a human follow-up task.',
			reason: 'caller-requested-escalation',
			summary:
				'This call was marked for human escalation instead of finishing in the automated flow.'
		},
		summary: {
			outcome: 'escalated',
			pass: true,
			turnCount: 1
		},
		title: 'Escalated review',
		timeline: [],
		transcript: {
			actual: 'escalate this to a human'
		}
	});

	const task = buildVoiceOpsTaskFromReview(review);

	expect(task?.kind).toBe('escalation');
	expect(task?.status).toBe('open');
	expect(task?.history[0]?.type).toBe('created');
});

test('voice ops task helpers update assignment, status, and history', () => {
	const task = {
		createdAt: 100,
		description: 'Call the lead back',
		history: [],
		id: 'task-1',
		kind: 'callback' as const,
		recommendedAction: 'Call back within SLA',
		status: 'open' as const,
		title: 'Callback lead',
		updatedAt: 100
	};

	const assigned = assignVoiceOpsTask(task, 'alex', {
		at: 110
	});
	const started = startVoiceOpsTask(assigned, {
		at: 120
	});
	const completed = completeVoiceOpsTask(started, {
		at: 130
	});
	const reopened = reopenVoiceOpsTask(completed, {
		at: 140
	});

	expect(assigned.assignee).toBe('alex');
	expect(started.status).toBe('in-progress');
	expect(completed.status).toBe('done');
	expect(reopened.status).toBe('open');
	expect(reopened.history.map((entry) => entry.type)).toEqual([
		'assigned',
		'started',
		'completed',
		'reopened'
	]);
});

test('voice ops task claim helpers manage leases, heartbeats, and requeue state', () => {
	const task = {
		createdAt: 100,
		description: 'Review failed call',
		history: [],
		id: 'task-claim',
		kind: 'retry-review' as const,
		recommendedAction: 'Inspect call before retrying',
		status: 'open' as const,
		title: 'Review failed call',
		updatedAt: 100
	};

	const claimed = claimVoiceOpsTask(task, 'worker-a', {
		at: 110,
		leaseMs: 5_000
	});
	const heartbeated = heartbeatVoiceOpsTask(claimed, 'worker-a', {
		at: 120,
		leaseMs: 10_000
	});
	const requeued = requeueVoiceOpsTask(heartbeated, {
		at: 130
	});
	const completed = completeVoiceOpsTask(claimed, {
		at: 140
	});

	expect(claimed.status).toBe('in-progress');
	expect(claimed.claimedBy).toBe('worker-a');
	expect(claimed.claimedAt).toBe(110);
	expect(claimed.claimExpiresAt).toBe(5_110);
	expect(heartbeated.claimExpiresAt).toBe(10_120);
	expect(requeued.status).toBe('open');
	expect(requeued.claimedBy).toBeUndefined();
	expect(requeued.claimedAt).toBeUndefined();
	expect(requeued.claimExpiresAt).toBeUndefined();
	expect(completed.status).toBe('done');
	expect(completed.claimedBy).toBeUndefined();
	expect(completed.history.map((entry) => entry.type)).toEqual([
		'claimed',
		'completed'
	]);
	expect(() =>
		heartbeatVoiceOpsTask(claimed, 'worker-b', {
			at: 150,
			leaseMs: 10_000
		})
	).toThrow(/claimed by worker-a/);
});

test('voice ops task failure helpers track retry state and dead-lettering', () => {
	const task = {
		createdAt: 100,
		description: 'Callback failed twice',
		history: [],
		id: 'task-failure',
		kind: 'callback' as const,
		recommendedAction: 'Retry callback',
		status: 'in-progress' as const,
		title: 'Retry callback',
		updatedAt: 100
	};

	const claimed = claimVoiceOpsTask(task, 'worker-a', {
		at: 110,
		leaseMs: 5_000
	});
	const failed = failVoiceOpsTask(claimed, {
		at: 120,
		error: 'CRM timeout'
	});
	const deadLettered = deadLetterVoiceOpsTask(failed, {
		at: 130
	});

	expect(failed.status).toBe('open');
	expect(failed.processingAttempts).toBe(1);
	expect(failed.processingError).toBe('CRM timeout');
	expect(failed.lastProcessedAt).toBe(120);
	expect(failed.history.at(-1)?.type).toBe('failed');
	expect(deadLettered.deadLetteredAt).toBe(130);
	expect(deadLettered.claimedBy).toBeUndefined();
	expect(deadLettered.history.at(-1)?.type).toBe('dead-lettered');
});

test('voice ops task policies apply default SLA and priority by disposition', () => {
	const task = {
		createdAt: 100,
		description: 'Callback voicemail lead',
		history: [],
		id: 'task-policy',
		kind: 'callback' as const,
		recommendedAction: 'Call back',
		status: 'open' as const,
		title: 'Callback lead',
		updatedAt: 100
	};

	const policy = resolveVoiceOpsTaskPolicy({
		disposition: 'voicemail'
	});
	const updated = applyVoiceOpsTaskPolicy(task, policy!, {
		at: 200
	});

	expect(policy?.name).toBe('voicemail-callback');
	expect(updated.priority).toBe('high');
	expect(updated.dueAt).toBe(200 + 30 * 60_000);
	expect(updated.policyName).toBe('voicemail-callback');
	expect(updated.history.at(-1)?.type).toBe('policy-applied');
	expect(isVoiceOpsTaskOverdue(updated, { at: updated.dueAt! + 1 })).toBe(true);
	expect(resolveVoiceOpsTaskAgeBucket(updated, { at: updated.dueAt! - 1 })).toBe(
		'due-soon'
	);
});

test('voice ops task assignment rules match and apply routing changes', () => {
	const task = {
		assignee: 'support-callbacks',
		createdAt: 100,
		description: 'High priority callback',
		history: [],
		id: 'task-assignment',
		kind: 'callback' as const,
		priority: 'high' as const,
		queue: 'support-callbacks',
		recommendedAction: 'Call back now',
		status: 'open' as const,
		title: 'Callback',
		updatedAt: 100
	};
	const rule = {
		assign: 'support-priority-callbacks',
		name: 'priority-callback-routing',
		queue: 'support-priority-callbacks',
		when: {
			kind: 'callback' as const,
			priority: 'high' as const
		}
	};

	expect(matchesVoiceOpsTaskAssignmentRule(task, rule)).toBe(true);
	expect(
		resolveVoiceOpsTaskAssignment({
			rules: [rule],
			task
		})
	).toEqual(rule);

	const updated = applyVoiceOpsTaskAssignmentRule(task, rule, {
		at: 200
	});
	expect(updated.assignee).toBe('support-priority-callbacks');
	expect(updated.queue).toBe('support-priority-callbacks');
	expect(updated.history.at(-1)?.type).toBe('assigned');
});

test('voice ops SLA helpers mark breaches and create follow-up artifacts', () => {
	const task = {
		assignee: 'callbacks',
		createdAt: 100,
		description: 'Callback voicemail lead',
		dueAt: 200,
		history: [],
		id: 'task-sla',
		kind: 'callback' as const,
		priority: 'high' as const,
		queue: 'callback-pool',
		recommendedAction: 'Call back',
		status: 'open' as const,
		title: 'Callback lead',
		updatedAt: 100
	};

	const breached = markVoiceOpsTaskSLABreached(task, {
		at: 300
	});
	const event = createVoiceTaskSLABreachedEvent(breached);
	const followUp = buildVoiceOpsTaskFromSLABreach(breached, {
		assignee: 'supervisors',
		name: 'sla-escalation',
		priority: 'urgent',
		queue: 'supervisor-queue'
	});

	expect(hasVoiceOpsTaskSLABreach(breached)).toBe(true);
	expect(breached.slaBreachedAt).toBe(300);
	expect(breached.history.at(-1)?.type).toBe('sla-breached');
	expect(event.type).toBe('task.sla_breached');
	expect(event.payload.taskId).toBe('task-sla');
	expect(followUp.id).toBe('task-sla:sla');
	expect(followUp.assignee).toBe('supervisors');
	expect(followUp.priority).toBe('urgent');
	expect(followUp.queue).toBe('supervisor-queue');
});

test('summarizeVoiceOpsTaskAnalytics reports assignee throughput and worker activity', () => {
	const now = Date.now();
	const analytics = summarizeVoiceOpsTaskAnalytics([
		{
			assignee: 'callbacks',
			createdAt: now - 60_000,
			description: 'Call back voicemail',
			dueAt: now - 1_000,
			history: [
				{
					actor: 'worker-a',
					at: now - 50_000,
					type: 'claimed'
				},
				{
					actor: 'worker-a',
					at: now - 40_000,
					type: 'heartbeat'
				},
				{
					actor: 'worker-a',
					at: now - 30_000,
					type: 'failed'
				}
			],
			id: 'task-analytics-1',
			kind: 'callback',
			outcome: 'voicemail',
			priority: 'high',
			processingAttempts: 1,
			processingError: 'CRM timeout',
			recommendedAction: 'Call back',
			status: 'open',
			title: 'Voicemail callback',
			updatedAt: now - 30_000
		},
		{
			assignee: 'callbacks',
			claimExpiresAt: now + 5_000,
			claimedAt: now - 2_000,
			claimedBy: 'worker-a',
			createdAt: now - 120_000,
			description: 'Second callback',
			history: [
				{
					actor: 'worker-a',
					at: now - 2_000,
					type: 'claimed'
				}
			],
			id: 'task-analytics-2',
			kind: 'callback',
			outcome: 'no-answer',
			priority: 'normal',
			recommendedAction: 'Retry',
			status: 'in-progress',
			title: 'Second callback',
			updatedAt: now - 2_000
		},
		{
			assignee: 'escalations',
			createdAt: now - 300_000,
			description: 'Escalated call',
			history: [
				{
					actor: 'worker-b',
					at: now - 250_000,
					type: 'claimed'
				},
				{
					actor: 'worker-b',
					at: now - 240_000,
					type: 'completed'
				}
			],
			id: 'task-analytics-3',
			kind: 'escalation',
			outcome: 'escalated',
			priority: 'urgent',
			recommendedAction: 'Review',
			status: 'done',
			title: 'Escalated review',
			updatedAt: now - 240_000
		}
	]);

	expect(analytics.totalTasks).toBe(3);
	expect(analytics.totalOverdue).toBe(1);
	expect(analytics.totalCompleted).toBe(1);
	expect(analytics.assignees[0]?.assignee).toBe('callbacks');
	expect(analytics.assignees[0]?.overdue).toBe(1);
	expect(analytics.assignees[0]?.claimed).toBe(1);
	expect(analytics.workers.find((worker) => worker.workerId === 'worker-a')?.totalClaims).toBe(2);
	expect(analytics.workers.find((worker) => worker.workerId === 'worker-a')?.failed).toBe(1);
	expect(analytics.workers.find((worker) => worker.workerId === 'worker-b')?.completed).toBe(1);
	expect(analytics.agingBuckets.some(([bucket]) => bucket === 'overdue')).toBe(true);
});

test('summarizeVoiceOpsTasks aggregates queue metrics', () => {
	const summary = summarizeVoiceOpsTasks([
		{
			assignee: 'alex',
			createdAt: 100,
			description: 'Callback',
			history: [],
			id: 'task-1',
			kind: 'callback',
			priority: 'high',
			queue: 'callbacks',
			outcome: 'voicemail',
			recommendedAction: 'Call back',
			status: 'open',
			target: 'billing',
			title: 'Callback lead',
			updatedAt: 100
		},
		{
			assignee: 'alex',
			claimExpiresAt: Date.now() + 5_000,
			claimedAt: Date.now(),
			claimedBy: 'worker-a',
			createdAt: 200,
			description: 'Escalate',
			dueAt: Date.now() - 1,
			history: [],
			id: 'task-2',
			kind: 'escalation',
			outcome: 'escalated',
			priority: 'urgent',
			queue: 'callbacks',
			recommendedAction: 'Review',
			status: 'in-progress',
			title: 'Review escalated call',
			updatedAt: 200
		},
		{
			createdAt: 300,
			description: 'Verify transfer',
			history: [],
			id: 'task-3',
			kind: 'transfer-check',
			outcome: 'transferred',
			queue: 'transfers',
			recommendedAction: 'Verify handoff',
			status: 'done',
			target: 'billing',
			title: 'Verify transfer',
			updatedAt: 300
		}
	]);

	expect(summary.total).toBe(3);
	expect(summary.open).toBe(1);
	expect(summary.inProgress).toBe(1);
	expect(summary.done).toBe(1);
	expect(summary.claimed).toBe(1);
	expect(summary.overdue).toBe(1);
	expect(summary.byKind[0]).toEqual(['callback', 1]);
	expect(summary.byPriority[0]).toEqual(['high', 1]);
	expect(summary.byQueue[0]).toEqual(['callbacks', 2]);
	expect(summary.byClaimedBy[0]).toEqual(['worker-a', 1]);
	expect(summary.topAssignees[0]).toEqual(['alex', 2]);
	expect(summary.topQueues[0]).toEqual(['callbacks', 2]);
	expect(summary.topTargets[0]).toEqual(['billing', 2]);
});

test('voice integration event helpers create portable event payloads', () => {
	const session = createVoiceSessionRecord('session-1');
	session.call = {
		disposition: 'completed',
		events: [],
		lastEventAt: 100,
		startedAt: 100
	};
	const review = createStoredVoiceCallReviewArtifact('review-1', {
		errors: [],
		generatedAt: 100,
		latencyBreakdown: [],
		notes: [],
		postCall: {
			label: 'Transferred to billing',
			recommendedAction: 'Verify the downstream queue or agent actually received the handoff.',
			summary: 'This call exited the flow by transferring to billing.',
			target: 'billing'
		},
		summary: {
			outcome: 'transferred',
			pass: true,
			turnCount: 1
		},
		title: 'Transfer review',
		timeline: [],
		transcript: {
			actual: 'transfer me to billing'
		}
	});
	const task = buildVoiceOpsTaskFromReview(review);

	expect(
		createVoiceCallCompletedEvent({
			session
		}).type
	).toBe('call.completed');
	expect(createVoiceReviewSavedEvent(review).type).toBe('review.saved');
	expect(task && createVoiceTaskCreatedEvent(task).type).toBe('task.created');
	expect(task && createVoiceTaskUpdatedEvent(task).type).toBe('task.updated');
});

test('deliverVoiceIntegrationEvent posts the event and records delivery metadata', async () => {
	const event = createVoiceCallCompletedEvent({
		session: createVoiceSessionRecord('session-webhook')
	});
	const requests: Array<{
		body: string;
		headers: Headers;
		url: string;
	}> = [];

	const delivered = await deliverVoiceIntegrationEvent({
		event,
		webhook: {
			fetch: async (url, init) => {
				requests.push({
					body: String(init?.body ?? ''),
					headers: new Headers(init?.headers),
					url: String(url)
				});

				return new Response(null, {
					status: 202
				});
			},
			headers: {
				'x-demo-source': 'voice-test'
			},
			signingSecret: 'top-secret',
			url: 'https://example.test/hooks/voice'
		}
	});

	expect(delivered.deliveryStatus).toBe('delivered');
	expect(delivered.deliveredTo).toBe('https://example.test/hooks/voice');
	expect(delivered.deliveryAttempts).toBe(1);
	expect(requests).toHaveLength(1);
	expect(requests[0]?.headers.get('content-type')).toBe('application/json');
	expect(requests[0]?.headers.get('x-demo-source')).toBe('voice-test');
	expect(requests[0]?.headers.get('x-absolutejs-timestamp')).toBeTruthy();
	expect(requests[0]?.headers.get('x-absolutejs-signature')).toMatch(/^sha256=/);
	expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({
		createdAt: event.createdAt,
		id: event.id,
		payload: event.payload,
		type: event.type
	});
});

test('deliverVoiceIntegrationEvent retries failures and can skip filtered events', async () => {
	let attempts = 0;
	const failedEvent = await deliverVoiceIntegrationEvent({
		event: createVoiceCallCompletedEvent({
			session: createVoiceSessionRecord('session-retry')
		}),
		webhook: {
			backoffMs: 0,
			fetch: async () => {
				attempts += 1;
				return new Response(null, {
					status: 500,
					statusText: 'Nope'
				});
			},
			retries: 2,
			url: 'https://example.test/hooks/retry'
		}
	});

	const skippedEvent = await deliverVoiceIntegrationEvent({
		event: createVoiceCallCompletedEvent({
			session: createVoiceSessionRecord('session-skip')
		}),
		webhook: {
			eventTypes: ['review.saved'],
			fetch: async () =>
				new Response(null, {
					status: 204
				}),
			url: 'https://example.test/hooks/skip'
		}
	});

	expect(attempts).toBe(3);
	expect(failedEvent.deliveryStatus).toBe('failed');
	expect(failedEvent.deliveryAttempts).toBe(3);
	expect(failedEvent.deliveryError).toContain('Attempt 3 failed');
	expect(skippedEvent.deliveryStatus).toBe('skipped');
	expect(skippedEvent.deliveryAttempts).toBe(0);
	expect(skippedEvent.deliveredTo).toBeUndefined();
});
