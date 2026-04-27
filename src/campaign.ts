import { Elysia } from 'elysia';
import type { VoiceRedisTaskLeaseCoordinator } from './queue';

export type VoiceCampaignStatus =
	| 'canceled'
	| 'completed'
	| 'draft'
	| 'paused'
	| 'running';

export type VoiceCampaignRecipientStatus =
	| 'canceled'
	| 'completed'
	| 'failed'
	| 'pending'
	| 'queued';

export type VoiceCampaignAttemptStatus =
	| 'canceled'
	| 'failed'
	| 'queued'
	| 'running'
	| 'succeeded';

export type VoiceCampaignRecipient = {
	attempts: number;
	completedAt?: number;
	createdAt: number;
	error?: string;
	id: string;
	metadata?: Record<string, unknown>;
	name?: string;
	phone: string;
	status: VoiceCampaignRecipientStatus;
	updatedAt: number;
	variables?: Record<string, string | number | boolean | undefined>;
};

export type VoiceCampaignAttempt = {
	campaignId: string;
	completedAt?: number;
	createdAt: number;
	error?: string;
	externalCallId?: string;
	id: string;
	metadata?: Record<string, unknown>;
	recipientId: string;
	startedAt?: number;
	status: VoiceCampaignAttemptStatus;
	updatedAt: number;
};

export type VoiceCampaign = {
	createdAt: number;
	description?: string;
	id: string;
	maxAttempts: number;
	maxConcurrentAttempts: number;
	metadata?: Record<string, unknown>;
	name: string;
	status: VoiceCampaignStatus;
	updatedAt: number;
};

export type VoiceCampaignRecord = {
	attempts: VoiceCampaignAttempt[];
	campaign: VoiceCampaign;
	recipients: VoiceCampaignRecipient[];
};

export type VoiceCampaignStore = {
	get: (id: string) => Promise<VoiceCampaignRecord | undefined> | VoiceCampaignRecord | undefined;
	list: () => Promise<VoiceCampaignRecord[]> | VoiceCampaignRecord[];
	remove: (id: string) => Promise<void> | void;
	set: (id: string, record: VoiceCampaignRecord) => Promise<void> | void;
};

export type VoiceCampaignDialerInput = {
	attempt: VoiceCampaignAttempt;
	campaign: VoiceCampaign;
	recipient: VoiceCampaignRecipient;
};

export type VoiceCampaignDialerResult = {
	externalCallId?: string;
	metadata?: Record<string, unknown>;
	status?: 'queued' | 'running' | 'succeeded';
};

export type VoiceCampaignDialer = (
	input: VoiceCampaignDialerInput
) => Promise<VoiceCampaignDialerResult> | VoiceCampaignDialerResult;

export type VoiceCampaignCreateInput = {
	description?: string;
	id?: string;
	maxAttempts?: number;
	maxConcurrentAttempts?: number;
	metadata?: Record<string, unknown>;
	name: string;
};

export type VoiceCampaignRecipientInput = {
	id?: string;
	metadata?: Record<string, unknown>;
	name?: string;
	phone: string;
	variables?: VoiceCampaignRecipient['variables'];
};

export type VoiceCampaignAttemptResultInput = {
	error?: string;
	externalCallId?: string;
	metadata?: Record<string, unknown>;
	status: 'failed' | 'succeeded';
};

export type VoiceCampaignTickResult = {
	attempted: number;
	campaignId: string;
	errors: Array<{ error: string; recipientId: string }>;
	started: VoiceCampaignAttempt[];
};

export type VoiceCampaignProofOptions = {
	campaign?: VoiceCampaignCreateInput;
	completeAttempts?: boolean;
	recipients?: VoiceCampaignRecipientInput[];
	runtime?: VoiceCampaignRuntime;
	store?: VoiceCampaignStore;
};

export type VoiceCampaignProofReport = {
	campaign: VoiceCampaignRecord;
	created: VoiceCampaignRecord;
	final: VoiceCampaignRecord;
	proof: 'voice-campaign';
	recipients: VoiceCampaignRecord;
	summary: VoiceCampaignSummary;
	tick: VoiceCampaignTickResult;
};

export type VoiceCampaignSummary = {
	attempts: {
		failed: number;
		queued: number;
		running: number;
		succeeded: number;
		total: number;
	};
	campaigns: {
		canceled: number;
		completed: number;
		draft: number;
		paused: number;
		running: number;
		total: number;
	};
	recipients: {
		canceled: number;
		completed: number;
		failed: number;
		pending: number;
		queued: number;
		total: number;
	};
};

export type VoiceCampaignRuntimeOptions = {
	dialer?: VoiceCampaignDialer;
	store: VoiceCampaignStore;
};

export type VoiceCampaignRuntime = {
	addRecipients: (
		campaignId: string,
		recipients: VoiceCampaignRecipientInput[]
	) => Promise<VoiceCampaignRecord>;
	cancel: (campaignId: string) => Promise<VoiceCampaignRecord>;
	completeAttempt: (
		campaignId: string,
		attemptId: string,
		result: VoiceCampaignAttemptResultInput
	) => Promise<VoiceCampaignRecord>;
	create: (input: VoiceCampaignCreateInput) => Promise<VoiceCampaignRecord>;
	enqueue: (campaignId: string) => Promise<VoiceCampaignRecord>;
	get: (campaignId: string) => Promise<VoiceCampaignRecord | undefined>;
	list: () => Promise<VoiceCampaignRecord[]>;
	pause: (campaignId: string) => Promise<VoiceCampaignRecord>;
	remove: (campaignId: string) => Promise<void>;
	resume: (campaignId: string) => Promise<VoiceCampaignRecord>;
	summarize: () => Promise<VoiceCampaignSummary>;
	tick: (campaignId: string) => Promise<VoiceCampaignTickResult>;
};

export type VoiceCampaignRoutesOptions = VoiceCampaignRuntimeOptions & {
	headers?: HeadersInit;
	htmlPath?: false | string;
	observability?: VoiceCampaignObservabilityOptions;
	name?: string;
	path?: string;
	title?: string;
};

export type VoiceCampaignWorkerOptions = {
	campaignIds?: string[];
	leaseMs?: number;
	leases: VoiceRedisTaskLeaseCoordinator;
	maxCampaigns?: number;
	runtime?: VoiceCampaignRuntime;
	statuses?: VoiceCampaignStatus[];
	store?: VoiceCampaignStore;
	workerId: string;
};

export type VoiceCampaignWorkerResult = {
	attempted: number;
	campaigns: number;
	errors: Array<{ campaignId: string; error: string }>;
	skipped: number;
	started: VoiceCampaignAttempt[];
};

export type VoiceCampaignWorker = {
	drain: () => Promise<VoiceCampaignWorkerResult>;
};

export type VoiceCampaignWorkerLoopOptions = {
	onError?: (error: unknown) => void | Promise<void>;
	pollIntervalMs?: number;
	worker: VoiceCampaignWorker;
};

export type VoiceCampaignWorkerLoop = {
	isRunning: () => boolean;
	start: () => void;
	stop: () => void;
	tick: () => Promise<VoiceCampaignWorkerResult>;
};

export type VoiceCampaignObservabilityOptions = {
	leases?: VoiceRedisTaskLeaseCoordinator;
	now?: number;
	rateWindowMs?: number;
	stuckAfterMs?: number;
};

export type VoiceCampaignObservabilityReport = {
	attemptRate: {
		failed: number;
		started: number;
		succeeded: number;
		windowMs: number;
	};
	campaigns: Array<{
		activeAttempts: number;
		campaignId: string;
		lease?: {
			expiresAt: number;
			workerId: string;
		};
		name: string;
		queueDepth: number;
		status: VoiceCampaignStatus;
		stuckAttempts: number;
		stuckRecipients: number;
		updatedAt: number;
	}>;
	failureReasons: Array<{
		count: number;
		reason: string;
	}>;
	generatedAt: number;
	leases: {
		active: number;
		known: boolean;
	};
	queue: {
		activeAttempts: number;
		queuedRecipients: number;
		runningCampaigns: number;
	};
	stuck: {
		attempts: Array<{
			attemptId: string;
			campaignId: string;
			recipientId: string;
			status: VoiceCampaignAttemptStatus;
			updatedAt: number;
		}>;
		recipients: Array<{
			campaignId: string;
			recipientId: string;
			status: VoiceCampaignRecipientStatus;
			updatedAt: number;
		}>;
	};
	summary: VoiceCampaignSummary;
};

const createId = () => crypto.randomUUID();

const cloneRecord = (record: VoiceCampaignRecord): VoiceCampaignRecord => ({
	attempts: record.attempts.map((attempt) => ({ ...attempt })),
	campaign: { ...record.campaign },
	recipients: record.recipients.map((recipient) => ({ ...recipient }))
});

const ensureRecord = async (store: VoiceCampaignStore, campaignId: string) => {
	const record = await store.get(campaignId);
	if (!record) {
		throw new Error(`Voice campaign ${campaignId} was not found.`);
	}
	return cloneRecord(record);
};

const saveRecord = async (store: VoiceCampaignStore, record: VoiceCampaignRecord) => {
	record.campaign.updatedAt = Date.now();
	await store.set(record.campaign.id, record);
	return record;
};

const activeAttemptCount = (record: VoiceCampaignRecord) =>
	record.attempts.filter((attempt) =>
		attempt.status === 'queued' || attempt.status === 'running'
	).length;

const maybeCompleteCampaign = (record: VoiceCampaignRecord) => {
	const unfinished = record.recipients.some(
		(recipient) => recipient.status === 'pending' || recipient.status === 'queued'
	);
	const active = activeAttemptCount(record) > 0;
	if (!unfinished && !active && record.campaign.status === 'running') {
		record.campaign.status = 'completed';
	}
};

export const createVoiceMemoryCampaignStore = (): VoiceCampaignStore => {
	const campaigns = new Map<string, VoiceCampaignRecord>();
	return {
		get: (id) => {
			const record = campaigns.get(id);
			return record ? cloneRecord(record) : undefined;
		},
		list: () =>
			[...campaigns.values()]
				.map(cloneRecord)
				.sort((left, right) => right.campaign.createdAt - left.campaign.createdAt),
		remove: (id) => {
			campaigns.delete(id);
		},
		set: (id, record) => {
			campaigns.set(id, cloneRecord(record));
		}
	};
};

export const summarizeVoiceCampaigns = (
	records: VoiceCampaignRecord[]
): VoiceCampaignSummary => {
	const summary: VoiceCampaignSummary = {
		attempts: { failed: 0, queued: 0, running: 0, succeeded: 0, total: 0 },
		campaigns: {
			canceled: 0,
			completed: 0,
			draft: 0,
			paused: 0,
			running: 0,
			total: records.length
		},
		recipients: {
			canceled: 0,
			completed: 0,
			failed: 0,
			pending: 0,
			queued: 0,
			total: 0
		}
	};

	for (const record of records) {
		summary.campaigns[record.campaign.status] += 1;
		for (const recipient of record.recipients) {
			summary.recipients.total += 1;
			summary.recipients[recipient.status] += 1;
		}
		for (const attempt of record.attempts) {
			summary.attempts.total += 1;
			if (attempt.status === 'queued' || attempt.status === 'running') {
				summary.attempts[attempt.status] += 1;
			}
			if (attempt.status === 'failed' || attempt.status === 'succeeded') {
				summary.attempts[attempt.status] += 1;
			}
		}
	}

	return summary;
};

export const buildVoiceCampaignObservabilityReport = async (
	records: VoiceCampaignRecord[],
	options: VoiceCampaignObservabilityOptions = {}
): Promise<VoiceCampaignObservabilityReport> => {
	const now = options.now ?? Date.now();
	const stuckAfterMs = Math.max(1, options.stuckAfterMs ?? 15 * 60_000);
	const rateWindowMs = Math.max(1, options.rateWindowMs ?? 60 * 60_000);
	const rateWindowStart = now - rateWindowMs;
	const failureReasons = new Map<string, number>();
	const report: VoiceCampaignObservabilityReport = {
		attemptRate: {
			failed: 0,
			started: 0,
			succeeded: 0,
			windowMs: rateWindowMs
		},
		campaigns: [],
		failureReasons: [],
		generatedAt: now,
		leases: {
			active: 0,
			known: Boolean(options.leases)
		},
		queue: {
			activeAttempts: 0,
			queuedRecipients: 0,
			runningCampaigns: 0
		},
		stuck: {
			attempts: [],
			recipients: []
		},
		summary: summarizeVoiceCampaigns(records)
	};

	for (const record of records) {
		const campaignId = record.campaign.id;
		const queuedRecipients = record.recipients.filter(
			(recipient) => recipient.status === 'queued'
		);
		const activeAttempts = record.attempts.filter(
			(attempt) => attempt.status === 'queued' || attempt.status === 'running'
		);
		const campaignReport: VoiceCampaignObservabilityReport['campaigns'][number] = {
			activeAttempts: activeAttempts.length,
			campaignId,
			name: record.campaign.name,
			queueDepth: queuedRecipients.length,
			status: record.campaign.status,
			stuckAttempts: 0,
			stuckRecipients: 0,
			updatedAt: record.campaign.updatedAt
		};

		if (record.campaign.status === 'running') {
			report.queue.runningCampaigns += 1;
		}
		report.queue.queuedRecipients += queuedRecipients.length;
		report.queue.activeAttempts += activeAttempts.length;

		for (const recipient of record.recipients) {
			if (
				(recipient.status === 'pending' || recipient.status === 'queued') &&
				now - recipient.updatedAt >= stuckAfterMs
			) {
				campaignReport.stuckRecipients += 1;
				report.stuck.recipients.push({
					campaignId,
					recipientId: recipient.id,
					status: recipient.status,
					updatedAt: recipient.updatedAt
				});
			}
			if (recipient.error) {
				failureReasons.set(
					recipient.error,
					(failureReasons.get(recipient.error) ?? 0) + 1
				);
			}
		}

		for (const attempt of record.attempts) {
			if ((attempt.startedAt ?? attempt.createdAt) >= rateWindowStart) {
				report.attemptRate.started += 1;
			}
			if (attempt.status === 'failed' && attempt.updatedAt >= rateWindowStart) {
				report.attemptRate.failed += 1;
			}
			if (attempt.status === 'succeeded' && attempt.updatedAt >= rateWindowStart) {
				report.attemptRate.succeeded += 1;
			}
			if (attempt.error) {
				failureReasons.set(
					attempt.error,
					(failureReasons.get(attempt.error) ?? 0) + 1
				);
			}
			if (
				(attempt.status === 'queued' || attempt.status === 'running') &&
				now - attempt.updatedAt >= stuckAfterMs
			) {
				campaignReport.stuckAttempts += 1;
				report.stuck.attempts.push({
					attemptId: attempt.id,
					campaignId,
					recipientId: attempt.recipientId,
					status: attempt.status,
					updatedAt: attempt.updatedAt
				});
			}
		}

		if (options.leases) {
			const lease = await options.leases.get(getCampaignLeaseTaskId(campaignId));
			if (lease) {
				report.leases.active += 1;
				campaignReport.lease = {
					expiresAt: lease.expiresAt,
					workerId: lease.workerId
				};
			}
		}

		report.campaigns.push(campaignReport);
	}

	report.failureReasons = [...failureReasons.entries()]
		.map(([reason, count]) => ({ count, reason }))
		.sort((left, right) =>
			right.count === left.count
				? left.reason.localeCompare(right.reason)
				: right.count - left.count
		);
	report.campaigns.sort((left, right) => right.updatedAt - left.updatedAt);
	report.stuck.attempts.sort((left, right) => left.updatedAt - right.updatedAt);
	report.stuck.recipients.sort((left, right) => left.updatedAt - right.updatedAt);

	return report;
};

export const createVoiceCampaign = (
	options: VoiceCampaignRuntimeOptions
): VoiceCampaignRuntime => {
	const { store } = options;

	return {
		addRecipients: async (campaignId, recipients) => {
			const record = await ensureRecord(store, campaignId);
			const at = Date.now();
			record.recipients.push(
				...recipients.map((recipient) => ({
					attempts: 0,
					createdAt: at,
					id: recipient.id ?? createId(),
					metadata: recipient.metadata,
					name: recipient.name,
					phone: recipient.phone,
					status: 'pending' as const,
					updatedAt: at,
					variables: recipient.variables
				}))
			);
			return saveRecord(store, record);
		},
		cancel: async (campaignId) => {
			const record = await ensureRecord(store, campaignId);
			const at = Date.now();
			record.campaign.status = 'canceled';
			for (const recipient of record.recipients) {
				if (recipient.status === 'pending' || recipient.status === 'queued') {
					recipient.status = 'canceled';
					recipient.updatedAt = at;
				}
			}
			for (const attempt of record.attempts) {
				if (attempt.status === 'queued' || attempt.status === 'running') {
					attempt.status = 'canceled';
					attempt.completedAt = at;
					attempt.updatedAt = at;
				}
			}
			return saveRecord(store, record);
		},
		completeAttempt: async (campaignId, attemptId, result) => {
			const record = await ensureRecord(store, campaignId);
			const attempt = record.attempts.find((item) => item.id === attemptId);
			if (!attempt) {
				throw new Error(`Voice campaign attempt ${attemptId} was not found.`);
			}
			const recipient = record.recipients.find(
				(item) => item.id === attempt.recipientId
			);
			const at = Date.now();
			attempt.completedAt = at;
			attempt.error = result.error;
			attempt.externalCallId = result.externalCallId ?? attempt.externalCallId;
			attempt.metadata = { ...attempt.metadata, ...result.metadata };
			attempt.status = result.status === 'succeeded' ? 'succeeded' : 'failed';
			attempt.updatedAt = at;
			if (recipient) {
				recipient.completedAt = result.status === 'succeeded' ? at : undefined;
				recipient.error = result.error;
				recipient.status =
					result.status === 'succeeded'
						? 'completed'
						: recipient.attempts >= record.campaign.maxAttempts
							? 'failed'
							: 'pending';
				recipient.updatedAt = at;
			}
			maybeCompleteCampaign(record);
			return saveRecord(store, record);
		},
		create: async (input) => {
			const at = Date.now();
			const campaign: VoiceCampaign = {
				createdAt: at,
				description: input.description,
				id: input.id ?? createId(),
				maxAttempts: input.maxAttempts ?? 1,
				maxConcurrentAttempts: input.maxConcurrentAttempts ?? 1,
				metadata: input.metadata,
				name: input.name,
				status: 'draft',
				updatedAt: at
			};
			const record = { attempts: [], campaign, recipients: [] };
			await store.set(campaign.id, record);
			return record;
		},
		enqueue: async (campaignId) => {
			const record = await ensureRecord(store, campaignId);
			const at = Date.now();
			record.campaign.status = 'running';
			for (const recipient of record.recipients) {
				if (recipient.status === 'pending') {
					recipient.status = 'queued';
					recipient.updatedAt = at;
				}
			}
			return saveRecord(store, record);
		},
		get: async (campaignId) => await store.get(campaignId),
		list: async () => await store.list(),
		pause: async (campaignId) => {
			const record = await ensureRecord(store, campaignId);
			record.campaign.status = 'paused';
			return saveRecord(store, record);
		},
		remove: async (campaignId) => {
			await store.remove(campaignId);
		},
		resume: async (campaignId) => {
			const record = await ensureRecord(store, campaignId);
			record.campaign.status = 'running';
			return saveRecord(store, record);
		},
		summarize: async () => summarizeVoiceCampaigns(await store.list()),
		tick: async (campaignId) => {
			const record = await ensureRecord(store, campaignId);
			const result: VoiceCampaignTickResult = {
				attempted: 0,
				campaignId,
				errors: [],
				started: []
			};
			if (record.campaign.status !== 'running') {
				return result;
			}
			const capacity = Math.max(
				0,
				record.campaign.maxConcurrentAttempts - activeAttemptCount(record)
			);
			const candidates = record.recipients
				.filter(
					(recipient) =>
						recipient.status === 'queued' &&
						recipient.attempts < record.campaign.maxAttempts
				)
				.slice(0, capacity);
			const at = Date.now();
			for (const recipient of candidates) {
				const attempt: VoiceCampaignAttempt = {
					campaignId,
					createdAt: at,
					id: createId(),
					recipientId: recipient.id,
					startedAt: at,
					status: options.dialer ? 'running' : 'queued',
					updatedAt: at
				};
				recipient.attempts += 1;
				recipient.updatedAt = at;
				record.attempts.push(attempt);
				result.started.push(attempt);
				result.attempted += 1;
				if (options.dialer) {
					try {
						const dialerResult = await options.dialer({
							attempt,
							campaign: record.campaign,
							recipient
						});
						attempt.externalCallId = dialerResult.externalCallId;
						attempt.metadata = dialerResult.metadata;
						attempt.status = dialerResult.status ?? 'running';
						attempt.updatedAt = Date.now();
					} catch (error) {
						attempt.completedAt = Date.now();
						attempt.error = error instanceof Error ? error.message : String(error);
						attempt.status = 'failed';
						attempt.updatedAt = Date.now();
						recipient.error = attempt.error;
						recipient.status =
							recipient.attempts >= record.campaign.maxAttempts
								? 'failed'
								: 'pending';
						result.errors.push({
							error: attempt.error,
							recipientId: recipient.id
						});
					}
				}
			}
			maybeCompleteCampaign(record);
			await saveRecord(store, record);
			return result;
		}
	};
};

const getCampaignLeaseTaskId = (campaignId: string) =>
	`voice-campaign:${campaignId}`;

export const createVoiceCampaignWorker = (
	options: VoiceCampaignWorkerOptions
): VoiceCampaignWorker => {
	const leaseMs = Math.max(1, options.leaseMs ?? 30_000);
	const runtime =
		options.runtime ??
		createVoiceCampaign({
			store: options.store ?? createVoiceMemoryCampaignStore()
		});
	const statuses = options.statuses ?? ['running'];
	const campaignIds = new Set(options.campaignIds);
	const maxCampaigns = Math.max(1, options.maxCampaigns ?? Number.MAX_SAFE_INTEGER);

	return {
		drain: async () => {
			const result: VoiceCampaignWorkerResult = {
				attempted: 0,
				campaigns: 0,
				errors: [],
				skipped: 0,
				started: []
			};
			const campaigns = [...(await runtime.list())]
				.filter(
					(record) =>
						(campaignIds.size === 0 || campaignIds.has(record.campaign.id)) &&
						statuses.includes(record.campaign.status)
				)
				.sort((left, right) => left.campaign.createdAt - right.campaign.createdAt)
				.slice(0, maxCampaigns);

			for (const record of campaigns) {
				const campaignId = record.campaign.id;
				const taskId = getCampaignLeaseTaskId(campaignId);
				const claimed = await options.leases.claim({
					leaseMs,
					taskId,
					workerId: options.workerId
				});
				if (!claimed) {
					result.skipped += 1;
					continue;
				}

				try {
					const tick = await runtime.tick(campaignId);
					result.campaigns += 1;
					result.attempted += tick.attempted;
					result.started.push(...tick.started);
					result.errors.push(...tick.errors.map((error) => ({
						campaignId,
						error: error.error
					})));
				} catch (error) {
					result.errors.push({
						campaignId,
						error: error instanceof Error ? error.message : String(error)
					});
				} finally {
					await options.leases.release({
						taskId,
						workerId: options.workerId
					});
				}
			}

			return result;
		}
	};
};

export const createVoiceCampaignWorkerLoop = (
	options: VoiceCampaignWorkerLoopOptions
): VoiceCampaignWorkerLoop => {
	const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 1_000);
	let timer: ReturnType<typeof setInterval> | undefined;
	let running = false;

	const tick = async () => options.worker.drain();

	return {
		isRunning: () => running,
		start: () => {
			if (timer) {
				return;
			}

			running = true;
			timer = setInterval(() => {
				void tick().catch((error) => {
					void options.onError?.(error);
				});
			}, pollIntervalMs);
		},
		stop: () => {
			if (timer) {
				clearInterval(timer);
				timer = undefined;
			}
			running = false;
		},
		tick
	};
};

const defaultProofRecipients = (): VoiceCampaignRecipientInput[] => [
	{
		id: 'campaign-proof-recipient-1',
		name: 'Proof Recipient One',
		phone: '+15550001001',
		variables: {
			firstName: 'Ari',
			reason: 'demo'
		}
	},
	{
		id: 'campaign-proof-recipient-2',
		name: 'Proof Recipient Two',
		phone: '+15550001002',
		variables: {
			firstName: 'Sam',
			reason: 'follow-up'
		}
	}
];

export const runVoiceCampaignProof = async (
	options: VoiceCampaignProofOptions = {}
): Promise<VoiceCampaignProofReport> => {
	const runtime =
		options.runtime ??
		createVoiceCampaign({
			dialer: ({ attempt, recipient }) => ({
				externalCallId: `proof-call-${attempt.id}`,
				metadata: {
					mode: 'simulation',
					phone: recipient.phone
				},
				status: 'running'
			}),
			store: options.store ?? createVoiceMemoryCampaignStore()
		});
	const created = await runtime.create({
		description: 'Synthetic outbound campaign proof.',
		id: `campaign-proof-${crypto.randomUUID()}`,
		maxAttempts: 1,
		maxConcurrentAttempts: 10,
		name: 'AbsoluteJS Voice Campaign Proof',
		...options.campaign
	});
	const recipients = await runtime.addRecipients(
		created.campaign.id,
		options.recipients ?? defaultProofRecipients()
	);
	const campaign = await runtime.enqueue(recipients.campaign.id);
	const tick = await runtime.tick(campaign.campaign.id);

	if (options.completeAttempts !== false) {
		for (const attempt of tick.started) {
			await runtime.completeAttempt(campaign.campaign.id, attempt.id, {
				externalCallId: attempt.externalCallId,
				metadata: {
					proof: true
				},
				status: 'succeeded'
			});
		}
	}

	const final = await runtime.get(campaign.campaign.id);
	if (!final) {
		throw new Error('Campaign proof did not persist the final campaign record.');
	}

	return {
		campaign,
		created,
		final,
		proof: 'voice-campaign',
		recipients,
		summary: await runtime.summarize(),
		tick
	};
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

export const renderVoiceCampaignsHTML = (
	records: VoiceCampaignRecord[],
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'Voice Campaigns';
	const rows = records
		.map(
			(record) => `<tr><td>${escapeHtml(record.campaign.name)}</td><td>${escapeHtml(record.campaign.status)}</td><td>${String(record.recipients.length)}</td><td>${String(record.attempts.length)}</td><td>${new Date(record.campaign.updatedAt).toLocaleString()}</td></tr>`
		)
		.join('');
	const summary = summarizeVoiceCampaigns(records);
	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#111827;color:#f9fafb;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1080px;padding:32px}.hero{background:linear-gradient(135deg,rgba(251,146,60,.18),rgba(45,212,191,.12));border:1px solid #334155;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#fdba74;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:.9;margin:.2rem 0 1rem}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin:18px 0}.grid article,table{background:#172033;border:1px solid #334155;border-radius:18px}.grid article{padding:16px}.grid span{color:#aab5c0}.grid strong{display:block;font-size:2rem;margin:.25rem 0}table{border-collapse:collapse;overflow:hidden;width:100%}td,th{border-bottom:1px solid #334155;padding:12px;text-align:left}</style></head><body><main><section class="hero"><p class="eyebrow">Self-hosted outbound</p><h1>${escapeHtml(title)}</h1><p>Campaign orchestration, recipients, attempts, retries, and outcomes without a hosted dialer dashboard.</p><section class="grid"><article><span>Campaigns</span><strong>${String(summary.campaigns.total)}</strong></article><article><span>Recipients</span><strong>${String(summary.recipients.total)}</strong></article><article><span>Attempts</span><strong>${String(summary.attempts.total)}</strong></article><article><span>Running</span><strong>${String(summary.campaigns.running)}</strong></article></section></section><table><thead><tr><th>Name</th><th>Status</th><th>Recipients</th><th>Attempts</th><th>Updated</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No campaigns yet.</td></tr>'}</tbody></table></main></body></html>`;
};

export const renderVoiceCampaignObservabilityHTML = (
	report: VoiceCampaignObservabilityReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'Voice Campaign Observability';
	const campaignRows = report.campaigns
		.map(
			(campaign) =>
				`<tr><td>${escapeHtml(campaign.name)}</td><td>${escapeHtml(campaign.status)}</td><td>${String(campaign.queueDepth)}</td><td>${String(campaign.activeAttempts)}</td><td>${String(campaign.stuckRecipients + campaign.stuckAttempts)}</td><td>${campaign.lease ? escapeHtml(campaign.lease.workerId) : 'none'}</td></tr>`
		)
		.join('');
	const failureRows = report.failureReasons
		.map(
			(failure) =>
				`<tr><td>${escapeHtml(failure.reason)}</td><td>${String(failure.count)}</td></tr>`
		)
		.join('');
	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0b1220;color:#e5edf7;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1120px;padding:32px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.2),rgba(251,146,60,.14));border:1px solid #334155;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.2rem,5vw,4.6rem);line-height:.95;margin:.2rem 0 1rem}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:18px 0}.card,table{background:#111c2f;border:1px solid #334155;border-radius:18px}.card{padding:16px}.card span{color:#9fb0c5}.card strong{display:block;font-size:2rem;margin:.25rem 0}table{border-collapse:collapse;margin-top:18px;overflow:hidden;width:100%}td,th{border-bottom:1px solid #334155;padding:12px;text-align:left}.warn{color:#fde68a}.bad{color:#fecaca}</style></head><body><main><section class="hero"><p class="eyebrow">Campaign ops</p><h1>${escapeHtml(title)}</h1><p>Queue depth, active leases, attempt rates, failure reasons, and stuck work for self-hosted outbound voice.</p><section class="grid"><article class="card"><span>Queued recipients</span><strong>${String(report.queue.queuedRecipients)}</strong></article><article class="card"><span>Active attempts</span><strong>${String(report.queue.activeAttempts)}</strong></article><article class="card"><span>Running campaigns</span><strong>${String(report.queue.runningCampaigns)}</strong></article><article class="card"><span>Active leases</span><strong>${report.leases.known ? String(report.leases.active) : 'n/a'}</strong></article><article class="card"><span>Attempts/window</span><strong>${String(report.attemptRate.started)}</strong></article><article class="card"><span>Stuck work</span><strong class="${report.stuck.attempts.length + report.stuck.recipients.length > 0 ? 'bad' : ''}">${String(report.stuck.attempts.length + report.stuck.recipients.length)}</strong></article></section></section><h2>Campaigns</h2><table><thead><tr><th>Name</th><th>Status</th><th>Queued</th><th>Active</th><th>Stuck</th><th>Lease</th></tr></thead><tbody>${campaignRows || '<tr><td colspan="6">No campaigns yet.</td></tr>'}</tbody></table><h2>Failure Reasons</h2><table><thead><tr><th>Reason</th><th>Count</th></tr></thead><tbody>${failureRows || '<tr><td colspan="2">No failures recorded.</td></tr>'}</tbody></table></main></body></html>`;
};

const readJsonBody = async <T>(request: Request) => {
	const text = await request.text();
	return text.trim() ? (JSON.parse(text) as T) : ({} as T);
};

export const createVoiceCampaignRoutes = (options: VoiceCampaignRoutesOptions) => {
	const runtime = createVoiceCampaign(options);
	const path = options.path ?? '/api/voice/campaigns';
	const htmlPath =
		options.htmlPath === undefined ? '/voice/campaigns' : options.htmlPath;
	const app = new Elysia({ name: options.name ?? 'absolutejs-voice-campaigns' })
		.get(path, async () => ({
			campaigns: await runtime.list(),
			summary: await runtime.summarize()
		}))
		.get(`${path}/observability`, async () =>
			buildVoiceCampaignObservabilityReport(
				await runtime.list(),
				options.observability
			)
		)
		.post(path, async ({ request }) =>
			runtime.create(await readJsonBody<VoiceCampaignCreateInput>(request))
		)
		.get(`${path}/:campaignId`, ({ params }) => runtime.get(params.campaignId))
		.delete(`${path}/:campaignId`, async ({ params }) => {
			await runtime.remove(params.campaignId);
			return { ok: true };
		})
		.post(`${path}/:campaignId/recipients`, async ({ params, request }) => {
			const body = await readJsonBody<{ recipients: VoiceCampaignRecipientInput[] }>(
				request
			);
			return runtime.addRecipients(params.campaignId, body.recipients ?? []);
		})
		.post(`${path}/:campaignId/enqueue`, ({ params }) =>
			runtime.enqueue(params.campaignId)
		)
		.post(`${path}/:campaignId/pause`, ({ params }) =>
			runtime.pause(params.campaignId)
		)
		.post(`${path}/:campaignId/resume`, ({ params }) =>
			runtime.resume(params.campaignId)
		)
		.post(`${path}/:campaignId/cancel`, ({ params }) =>
			runtime.cancel(params.campaignId)
		)
		.post(`${path}/:campaignId/tick`, ({ params }) =>
			runtime.tick(params.campaignId)
		)
		.post(`${path}/:campaignId/attempts/:attemptId/result`, async ({
			params,
			request
		}) =>
			runtime.completeAttempt(
				params.campaignId,
				params.attemptId,
				await readJsonBody<VoiceCampaignAttemptResultInput>(request)
			)
		);

	if (htmlPath) {
		app.get(htmlPath, async () => {
			const records = await runtime.list();
			return new Response(renderVoiceCampaignsHTML(records, options), {
				headers: {
					'content-type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		}).get(`${htmlPath}/observability`, async () => {
			const report = await buildVoiceCampaignObservabilityReport(
				await runtime.list(),
				options.observability
			);
			return new Response(renderVoiceCampaignObservabilityHTML(report, options), {
				headers: {
					'content-type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		});
	}

	return app;
};
