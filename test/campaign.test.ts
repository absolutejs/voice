import { expect, test } from 'bun:test';
import {
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
