import { expect, test } from 'bun:test';
import {
	applyVoiceCampaignTelephonyOutcome,
	buildVoiceCampaignObservabilityReport,
	createVoiceCampaign,
	createVoiceCampaignWorker,
	createVoiceCampaignWorkerLoop,
	createVoiceMemoryCampaignStore
} from '../src';
import type { VoiceRedisTaskLeaseCoordinator } from '../src';

const createMemoryLeaseCoordinator = (): VoiceRedisTaskLeaseCoordinator => {
	const leases = new Map<string, { expiresAt: number; workerId: string }>();
	const getActiveLease = (taskId: string) => {
		const lease = leases.get(taskId);
		if (!lease) {
			return undefined;
		}
		if (lease.expiresAt <= Date.now()) {
			leases.delete(taskId);
			return undefined;
		}
		return lease;
	};

	return {
		claim: async ({ leaseMs, taskId, workerId }) => {
			if (getActiveLease(taskId)) {
				return false;
			}
			leases.set(taskId, {
				expiresAt: Date.now() + leaseMs,
				workerId
			});
			return true;
		},
		get: async (taskId) => {
			const lease = getActiveLease(taskId);
			return lease
				? {
						expiresAt: lease.expiresAt,
						taskId,
						workerId: lease.workerId
					}
				: null;
		},
		release: async ({ taskId, workerId }) => {
			const lease = getActiveLease(taskId);
			if (!lease || lease.workerId !== workerId) {
				return false;
			}
			leases.delete(taskId);
			return true;
		},
		renew: async ({ leaseMs, taskId, workerId }) => {
			const lease = getActiveLease(taskId);
			if (!lease || lease.workerId !== workerId) {
				return false;
			}
			leases.set(taskId, {
				expiresAt: Date.now() + leaseMs,
				workerId
			});
			return true;
		}
	};
};

test('createVoiceCampaignWorker leases campaigns so parallel workers do not double start recipients', async () => {
	const store = createVoiceMemoryCampaignStore();
	const leases = createMemoryLeaseCoordinator();
	let dialed = 0;
	let dialerStarted: () => void = () => {};
	let releaseDialer: () => void = () => {};
	const dialerStartedPromise = new Promise<void>((resolve) => {
		dialerStarted = resolve;
	});
	const releaseDialerPromise = new Promise<void>((resolve) => {
		releaseDialer = resolve;
	});
	const runtime = createVoiceCampaign({
		dialer: async () => {
			dialed += 1;
			dialerStarted();
			await releaseDialerPromise;
			return {
				status: 'running'
			};
		},
		store
	});

	const campaign = await runtime.create({
		id: 'campaign-lease-proof',
		maxConcurrentAttempts: 1,
		name: 'Lease proof'
	});
	await runtime.addRecipients(campaign.campaign.id, [
		{
			id: 'recipient-1',
			phone: '+15550001001'
		}
	]);
	await runtime.enqueue(campaign.campaign.id);

	const workerA = createVoiceCampaignWorker({
		leases,
		runtime,
		workerId: 'worker-a'
	});
	const workerB = createVoiceCampaignWorker({
		leases,
		runtime,
		workerId: 'worker-b'
	});

	const firstDrain = workerA.drain();
	await dialerStartedPromise;
	const secondDrain = await workerB.drain();
	releaseDialer();
	const firstResult = await firstDrain;

	expect(firstResult.attempted).toBe(1);
	expect(firstResult.campaigns).toBe(1);
	expect(secondDrain.skipped).toBe(1);
	expect(secondDrain.attempted).toBe(0);
	expect(dialed).toBe(1);
	expect((await runtime.get(campaign.campaign.id))?.attempts).toHaveLength(1);
});

test('buildVoiceCampaignObservabilityReport surfaces queue, leases, rates, failures, and stuck work', async () => {
	const now = 10_000;
	const store = createVoiceMemoryCampaignStore();
	const leases = createMemoryLeaseCoordinator();
	await store.set('campaign-observe', {
		attempts: [
			{
				campaignId: 'campaign-observe',
				createdAt: now - 4_000,
				id: 'attempt-running',
				recipientId: 'recipient-queued',
				startedAt: now - 4_000,
				status: 'running',
				updatedAt: now - 4_000
			},
			{
				campaignId: 'campaign-observe',
				completedAt: now - 100,
				createdAt: now - 200,
				error: 'busy',
				id: 'attempt-failed',
				recipientId: 'recipient-failed',
				startedAt: now - 200,
				status: 'failed',
				updatedAt: now - 100
			}
		],
		campaign: {
			createdAt: now - 5_000,
			id: 'campaign-observe',
			maxAttempts: 2,
			maxConcurrentAttempts: 1,
			name: 'Observe campaign',
			status: 'running',
			updatedAt: now - 100
		},
		recipients: [
			{
				attempts: 1,
				createdAt: now - 5_000,
				id: 'recipient-queued',
				phone: '+15550001001',
				status: 'queued',
				updatedAt: now - 4_000
			},
			{
				attempts: 1,
				createdAt: now - 1_000,
				error: 'busy',
				id: 'recipient-failed',
				phone: '+15550001002',
				status: 'failed',
				updatedAt: now - 100
			}
		]
	});
	await leases.claim({
		leaseMs: 30_000,
		taskId: 'voice-campaign:campaign-observe',
		workerId: 'worker-a'
	});

	const report = await buildVoiceCampaignObservabilityReport(await store.list(), {
		leases,
		now,
		rateWindowMs: 1_000,
		stuckAfterMs: 1_000
	});

	expect(report.queue).toMatchObject({
		activeAttempts: 1,
		queuedRecipients: 1,
		runningCampaigns: 1
	});
	expect(report.leases).toMatchObject({
		active: 1,
		known: true
	});
	expect(report.attemptRate).toMatchObject({
		failed: 1,
		started: 1
	});
	expect(report.failureReasons).toEqual([
		{
			count: 2,
			reason: 'busy'
		}
	]);
	expect(report.stuck.attempts).toHaveLength(1);
	expect(report.stuck.recipients).toHaveLength(1);
	expect(report.campaigns[0]).toMatchObject({
		activeAttempts: 1,
		queueDepth: 1,
		stuckAttempts: 1,
		stuckRecipients: 1
	});
	expect(report.campaigns[0]?.lease?.workerId).toBe('worker-a');
});

test('applyVoiceCampaignTelephonyOutcome completes running attempts from external call ids', async () => {
	const store = createVoiceMemoryCampaignStore();
	const runtime = createVoiceCampaign({
		dialer: ({ attempt }) => ({
			externalCallId: `call-${attempt.id}`,
			status: 'running'
		}),
		store
	});
	const campaign = await runtime.create({
		id: 'campaign-outcome-proof',
		name: 'Outcome proof'
	});
	await runtime.addRecipients(campaign.campaign.id, [
		{
			id: 'recipient-1',
			phone: '+15550001001'
		}
	]);
	await runtime.enqueue(campaign.campaign.id);
	const tick = await runtime.tick(campaign.campaign.id);
	const attempt = tick.started[0]!;

	const result = await applyVoiceCampaignTelephonyOutcome(
		{
			decision: {
				action: 'no-answer',
				confidence: 'high',
				disposition: 'no-answer',
				source: 'status'
			},
			event: {
				metadata: {
					externalCallId: attempt.externalCallId
				},
				provider: 'twilio',
				status: 'busy'
			}
		},
		{
			runtime
		}
	);
	const updated = await runtime.get(campaign.campaign.id);

	expect(result).toMatchObject({
		applied: true,
		attemptId: attempt.id,
		campaignId: campaign.campaign.id,
		status: 'failed'
	});
	expect(updated?.attempts[0]).toMatchObject({
		error: 'no-answer',
		status: 'failed'
	});
	expect(updated?.recipients[0]).toMatchObject({
		status: 'failed'
	});

	const duplicate = await applyVoiceCampaignTelephonyOutcome(
		{
			decision: {
				action: 'complete',
				confidence: 'high',
				disposition: 'completed',
				source: 'status'
			},
			event: {
				metadata: {
					externalCallId: attempt.externalCallId
				}
			}
		},
		{
			runtime
		}
	);

	expect(duplicate).toMatchObject({
		applied: false,
		reason: 'terminal-attempt',
		status: 'failed'
	});
});

test('applyVoiceCampaignTelephonyOutcome can resolve campaign attempts from webhook metadata', async () => {
	const store = createVoiceMemoryCampaignStore();
	const runtime = createVoiceCampaign({
		store
	});
	const campaign = await runtime.create({
		id: 'campaign-metadata-proof',
		name: 'Metadata proof'
	});
	await runtime.addRecipients(campaign.campaign.id, [
		{
			id: 'recipient-1',
			phone: '+15550001001'
		}
	]);
	await runtime.enqueue(campaign.campaign.id);
	const tick = await runtime.tick(campaign.campaign.id);
	const attempt = tick.started[0]!;

	const ignored = await applyVoiceCampaignTelephonyOutcome(
		{
			decision: {
				action: 'ignore',
				confidence: 'low',
				source: 'status'
			},
			event: {
				metadata: {
					campaignId: campaign.campaign.id,
					attemptId: attempt.id
				}
			}
		},
		{
			runtime
		}
	);
	expect(ignored).toMatchObject({
		applied: false,
		reason: 'ignored'
	});

	const applied = await applyVoiceCampaignTelephonyOutcome(
		{
			decision: {
				action: 'complete',
				confidence: 'high',
				disposition: 'completed',
				source: 'status'
			},
			event: {
				metadata: {
					campaignId: campaign.campaign.id,
					attemptId: attempt.id
				},
				status: 'completed'
			}
		},
		{
			runtime
		}
	);

	expect(applied).toMatchObject({
		applied: true,
		status: 'succeeded'
	});
	expect((await runtime.get(campaign.campaign.id))?.attempts[0]).toMatchObject({
		status: 'succeeded'
	});
});

test('createVoiceCampaignWorkerLoop exposes manual ticks and lifecycle state', async () => {
	const store = createVoiceMemoryCampaignStore();
	const runtime = createVoiceCampaign({
		store
	});
	const campaign = await runtime.create({
		id: 'campaign-loop-proof',
		name: 'Loop proof'
	});
	await runtime.addRecipients(campaign.campaign.id, [
		{
			id: 'recipient-1',
			phone: '+15550001001'
		}
	]);
	await runtime.enqueue(campaign.campaign.id);

	const worker = createVoiceCampaignWorker({
		leases: createMemoryLeaseCoordinator(),
		runtime,
		workerId: 'campaign-loop'
	});
	const loop = createVoiceCampaignWorkerLoop({
		worker
	});

	expect(loop.isRunning()).toBe(false);
	const result = await loop.tick();
	expect(result.attempted).toBe(1);
	loop.start();
	expect(loop.isRunning()).toBe(true);
	loop.stop();
	expect(loop.isRunning()).toBe(false);
});
