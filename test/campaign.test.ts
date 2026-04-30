import { expect, test } from 'bun:test';
import {
	applyVoiceCampaignTelephonyOutcome,
	buildVoiceCampaignObservabilityReport,
	createVoiceCampaign,
	createVoiceCampaignRoutes,
	createVoiceCampaignWorker,
	createVoiceCampaignWorkerLoop,
	createVoiceMemoryCampaignStore,
	evaluateVoiceCampaignReadinessEvidence,
	importVoiceCampaignRecipients,
	runVoiceCampaignReadinessProof
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

test('importVoiceCampaignRecipients validates csv rows consent dedupe and variable mapping', () => {
	const result = importVoiceCampaignRecipients({
		csv: `id,name,phone,consent,city,source
recipient-1,Ada,+15550001001,yes,Austin,web
recipient-2,Grace,+15550001001,yes,London,web
recipient-3,Linus,not-a-phone,yes,Helsinki,upload
recipient-4,Barbara,+15550001004,no,New York,upload
recipient-5,Ken,+15550001005,true,Arlington,partner`,
		metadataColumns: ['source'],
		requireConsent: true,
		variableColumns: ['city']
	});

	expect(result).toMatchObject({
		duplicates: 1,
		total: 5
	});
	expect(result.accepted).toEqual([
		{
			id: 'recipient-1',
			metadata: {
				source: 'web'
			},
			name: 'Ada',
			phone: '+15550001001',
			variables: {
				city: 'Austin'
			}
		},
		{
			id: 'recipient-5',
			metadata: {
				source: 'partner'
			},
			name: 'Ken',
			phone: '+15550001005',
			variables: {
				city: 'Arlington'
			}
		}
	]);
	expect(result.rejected.map((issue) => issue.code)).toEqual([
		'duplicate',
		'invalid-phone',
		'missing-consent'
	]);
});

test('campaign runtime imports accepted recipients and returns rejected row evidence', async () => {
	const runtime = createVoiceCampaign({
		store: createVoiceMemoryCampaignStore()
	});
	const campaign = await runtime.create({
		id: 'campaign-import-proof',
		name: 'Import proof'
	});

	const imported = await runtime.importRecipients(campaign.campaign.id, {
		rows: [
			{
				consent: true,
				name: 'Ada',
				phone: '+15550001001'
			},
			{
				consent: true,
				name: 'Bad Phone',
				phone: 'nope'
			}
		],
		requireConsent: true
	});

	expect(imported.import).toMatchObject({
		total: 2
	});
	expect(imported.import.accepted).toHaveLength(1);
	expect(imported.import.rejected).toEqual([
		expect.objectContaining({
			code: 'invalid-phone',
			row: 2
		})
	]);
	expect(imported.recipients).toMatchObject([
		{
			name: 'Ada',
			phone: '+15550001001',
			status: 'pending'
		}
	]);
});

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

test('campaign tick retries pending failed recipients until max attempts', async () => {
	const runtime = createVoiceCampaign({
		dialer: () => {
			throw new Error('carrier busy');
		},
		store: createVoiceMemoryCampaignStore()
	});
	const campaign = await runtime.create({
		id: 'campaign-retry-proof',
		maxAttempts: 2,
		name: 'Retry proof'
	});
	await runtime.addRecipients(campaign.campaign.id, [
		{
			id: 'recipient-retry',
			phone: '+15550001001'
		}
	]);
	await runtime.enqueue(campaign.campaign.id);

	const firstTick = await runtime.tick(campaign.campaign.id);
	const afterFirst = await runtime.get(campaign.campaign.id);
	const secondTick = await runtime.tick(campaign.campaign.id);
	const afterSecond = await runtime.get(campaign.campaign.id);

	expect(firstTick).toMatchObject({
		attempted: 1,
		errors: [
			{
				error: 'carrier busy',
				recipientId: 'recipient-retry'
			}
		]
	});
	expect(afterFirst?.recipients[0]).toMatchObject({
		attempts: 1,
		status: 'pending'
	});
	expect(secondTick.attempted).toBe(1);
	expect(afterSecond?.recipients[0]).toMatchObject({
		attempts: 2,
		status: 'failed'
	});
	expect(afterSecond?.campaign.status).toBe('completed');
});

test('campaign tick enforces attempt windows quiet hours and rate limits', async () => {
	let now = Date.UTC(2026, 0, 5, 8, 0, 0);
	const runtime = createVoiceCampaign({
		now: () => now,
		store: createVoiceMemoryCampaignStore()
	});
	const campaign = await runtime.create({
		id: 'campaign-schedule-proof',
		maxConcurrentAttempts: 3,
		name: 'Schedule proof',
		schedule: {
			attemptWindow: {
				endHour: 17,
				startHour: 9
			},
			quietHours: {
				endHour: 13,
				startHour: 12
			},
			rateLimit: {
				maxAttempts: 1,
				windowMs: 60_000
			}
		}
	});
	await runtime.addRecipients(campaign.campaign.id, [
		{
			id: 'recipient-1',
			phone: '+15550001001'
		},
		{
			id: 'recipient-2',
			phone: '+15550001002'
		}
	]);
	await runtime.enqueue(campaign.campaign.id);

	const beforeWindow = await runtime.tick(campaign.campaign.id);
	now = Date.UTC(2026, 0, 5, 12, 30, 0);
	const duringQuietHours = await runtime.tick(campaign.campaign.id);
	now = Date.UTC(2026, 0, 5, 14, 0, 0);
	const firstAllowedTick = await runtime.tick(campaign.campaign.id);
	const rateLimitedTick = await runtime.tick(campaign.campaign.id);

	expect(beforeWindow).toMatchObject({
		attempted: 0,
		blocked: [
			{
				reason: 'outside-attempt-window'
			}
		]
	});
	expect(duringQuietHours).toMatchObject({
		attempted: 0,
		blocked: [
			{
				reason: 'quiet-hours'
			}
		]
	});
	expect(firstAllowedTick.attempted).toBe(1);
	expect(rateLimitedTick).toMatchObject({
		attempted: 0,
		blocked: [
			{
				reason: 'rate-limit'
			}
		]
	});
});

test('campaign tick enforces retry backoff before another attempt', async () => {
	let now = 1_000;
	const runtime = createVoiceCampaign({
		dialer: () => {
			throw new Error('carrier busy');
		},
		now: () => now,
		store: createVoiceMemoryCampaignStore()
	});
	const campaign = await runtime.create({
		id: 'campaign-backoff-proof',
		maxAttempts: 2,
		name: 'Backoff proof',
		schedule: {
			retryPolicy: {
				backoffMs: 5_000
			}
		}
	});
	await runtime.addRecipients(campaign.campaign.id, [
		{
			id: 'recipient-backoff',
			phone: '+15550001001'
		}
	]);
	await runtime.enqueue(campaign.campaign.id);

	const firstTick = await runtime.tick(campaign.campaign.id);
	now = 3_000;
	const blockedTick = await runtime.tick(campaign.campaign.id);
	now = 6_000;
	const retryTick = await runtime.tick(campaign.campaign.id);
	const afterRetry = await runtime.get(campaign.campaign.id);

	expect(firstTick.attempted).toBe(1);
	expect(blockedTick).toMatchObject({
		attempted: 0,
		blocked: [
			{
				reason: 'retry-backoff',
				recipientId: 'recipient-backoff',
				until: 6_000
			}
		]
	});
	expect(retryTick.attempted).toBe(1);
	expect(afterRetry?.recipients[0]).toMatchObject({
		attempts: 2,
		status: 'failed'
	});
});

test('runVoiceCampaignReadinessProof certifies campaign import scheduling and retry paths without live dialing', async () => {
	const report = await runVoiceCampaignReadinessProof();

	expect(report).toMatchObject({
		ok: true,
		proof: 'voice-campaign-readiness'
	});
	expect(report.checks.map((check) => [check.name, check.status])).toEqual([
		['recipient-import-validation', 'pass'],
		['attempt-window-block', 'pass'],
		['quiet-hours-block', 'pass'],
		['allowed-attempt', 'pass'],
		['rate-limit-block', 'pass'],
		['retry-backoff-block', 'pass'],
		['retry-to-max-attempts', 'pass']
	]);
	expect(report.import).toMatchObject({
		duplicates: 1,
		total: 4
	});
	expect(report.ticks.windowBlocked.blocked[0]?.reason).toBe(
		'outside-attempt-window'
	);
	expect(report.ticks.quietHours.blocked[0]?.reason).toBe('quiet-hours');
	expect(report.ticks.rateLimited.blocked[0]?.reason).toBe('rate-limit');
	expect(report.ticks.retryBackoff.blocked[0]).toMatchObject({
		reason: 'retry-backoff',
		recipientId: 'readiness-retry-recipient',
		until: 6000
	});
	expect(report.campaigns.retry.recipients[0]).toMatchObject({
		attempts: 2,
		status: 'failed'
	});
});

test('createVoiceCampaignRoutes exposes campaign readiness proof', async () => {
	const app = createVoiceCampaignRoutes({
		store: createVoiceMemoryCampaignStore()
	});
	const response = await app.handle(
		new Request('http://localhost/api/voice/campaigns/readiness-proof')
	);
	const report = (await response.json()) as Awaited<
		ReturnType<typeof runVoiceCampaignReadinessProof>
	>;

	expect(response.status).toBe(200);
	expect(report.ok).toBe(true);
	expect(report.checks.every((check) => check.status === 'pass')).toBe(true);
});

test('evaluateVoiceCampaignReadinessEvidence accepts complete readiness proof', async () => {
	const readiness = await runVoiceCampaignReadinessProof();
	const report = evaluateVoiceCampaignReadinessEvidence(readiness, {
		maxFailedChecks: 0,
		minAcceptedImports: 1,
		minRejectedImports: 3,
		minTotalImports: 4,
		requiredBlockedReasons: [
			'outside-attempt-window',
			'quiet-hours',
			'rate-limit',
			'retry-backoff'
		],
		requiredChecks: [
			'recipient-import-validation',
			'attempt-window-block',
			'quiet-hours-block',
			'allowed-attempt',
			'rate-limit-block',
			'retry-backoff-block',
			'retry-to-max-attempts'
		]
	});

	expect(report.ok).toBe(true);
	expect(report.failed).toBe(0);
	expect(report.total).toBe(7);
});

test('evaluateVoiceCampaignReadinessEvidence reports missing readiness proof', async () => {
	const readiness = await runVoiceCampaignReadinessProof();
	const report = evaluateVoiceCampaignReadinessEvidence(
		{
			...readiness,
			checks: [{ name: 'recipient-import-validation', status: 'fail' }],
			import: {
				...readiness.import,
				accepted: [],
				rejected: [],
				total: 1
			},
			ok: false,
			ticks: {
				...readiness.ticks,
				quietHours: { ...readiness.ticks.quietHours, blocked: [] },
				rateLimited: { ...readiness.ticks.rateLimited, blocked: [] }
			}
		},
		{
			maxFailedChecks: 0,
			minAcceptedImports: 1,
			minRejectedImports: 3,
			minTotalImports: 4,
			requiredBlockedReasons: ['quiet-hours', 'rate-limit'],
			requiredChecks: ['allowed-attempt']
		}
	);

	expect(report.ok).toBe(false);
	expect(report.issues).toEqual(
		expect.arrayContaining([
			'Expected campaign readiness proof to pass.',
			'Expected at most 0 failing campaign readiness check(s), found 1.',
			'Expected at least 4 campaign import row(s), found 1.',
			'Expected at least 1 accepted campaign import(s), found 0.',
			'Expected at least 3 rejected campaign import(s), found 0.',
			'Missing campaign readiness check: allowed-attempt.',
			'Missing campaign readiness blocked reason: quiet-hours.',
			'Missing campaign readiness blocked reason: rate-limit.'
		])
	);
});

test('createVoiceCampaignRoutes links recent attempts to operations records', async () => {
	const store = createVoiceMemoryCampaignStore();
	await store.set('campaign-ops-records', {
		attempts: [
			{
				campaignId: 'campaign-ops-records',
				createdAt: 100,
				id: 'attempt-1',
				metadata: {
					sessionId: 'campaign-session-1'
				},
				recipientId: 'recipient-1',
				startedAt: 100,
				status: 'running',
				updatedAt: 100
			}
		],
		campaign: {
			createdAt: 100,
			id: 'campaign-ops-records',
			maxAttempts: 2,
			maxConcurrentAttempts: 1,
			name: 'Ops record campaign',
			status: 'running',
			updatedAt: 100
		},
		recipients: [
			{
				attempts: 1,
				createdAt: 100,
				id: 'recipient-1',
				phone: '+15550001001',
				status: 'running',
				updatedAt: 100
			}
		]
	});
	const app = createVoiceCampaignRoutes({
		operationsRecordHref: '/voice-operations/:sessionId',
		store
	});

	const response = await app.handle(new Request('http://localhost/voice/campaigns'));
	const html = await response.text();

	expect(html).toContain('Recent attempts');
	expect(html).toContain('/voice-operations/campaign-session-1');
	expect(html).toContain('Open operations record');
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
