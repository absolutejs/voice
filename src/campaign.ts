import { Elysia } from 'elysia';
import type { VoiceRedisTaskLeaseCoordinator } from './queue';
import type {
	VoiceTelephonyOutcomeDecision,
	VoiceTelephonyOutcomeProviderEvent,
	VoiceTelephonyWebhookDecision
} from './telephonyOutcome';

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

export type VoiceCampaignTimeWindow = {
	daysOfWeek?: number[];
	endHour: number;
	startHour: number;
	timeZoneOffsetMinutes?: number;
};

export type VoiceCampaignRateLimit = {
	maxAttempts: number;
	windowMs: number;
};

export type VoiceCampaignRetryPolicy = {
	backoffMs?: number | number[];
	maxBackoffMs?: number;
};

export type VoiceCampaignSchedule = {
	attemptWindow?: VoiceCampaignTimeWindow;
	quietHours?: VoiceCampaignTimeWindow;
	rateLimit?: VoiceCampaignRateLimit;
	retryPolicy?: VoiceCampaignRetryPolicy;
};

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
	schedule?: VoiceCampaignSchedule;
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
	schedule?: VoiceCampaignSchedule;
};

export type VoiceCampaignRecipientInput = {
	id?: string;
	metadata?: Record<string, unknown>;
	name?: string;
	phone: string;
	variables?: VoiceCampaignRecipient['variables'];
};

export type VoiceCampaignRecipientImportRow = Record<string, unknown>;

export type VoiceCampaignRecipientImportIssueCode =
	| 'duplicate'
	| 'missing-consent'
	| 'missing-phone'
	| 'invalid-phone';

export type VoiceCampaignRecipientImportIssue = {
	code: VoiceCampaignRecipientImportIssueCode;
	message: string;
	row: number;
	value?: unknown;
};

export type VoiceCampaignRecipientImportOptions = {
	consentColumn?: string;
	csv?: string;
	dedupe?: boolean;
	idColumn?: string;
	metadataColumns?: string[];
	nameColumn?: string;
	phoneColumn?: string;
	requireConsent?: boolean;
	rows?: VoiceCampaignRecipientImportRow[];
	variableColumns?: string[];
};

export type VoiceCampaignRecipientImportResult = {
	accepted: VoiceCampaignRecipientInput[];
	duplicates: number;
	rejected: VoiceCampaignRecipientImportIssue[];
	total: number;
};

export type VoiceCampaignAttemptResultInput = {
	error?: string;
	externalCallId?: string;
	metadata?: Record<string, unknown>;
	status: 'failed' | 'succeeded';
};

export type VoiceCampaignTickResult = {
	attempted: number;
	blocked: Array<{
		reason:
			| 'outside-attempt-window'
			| 'quiet-hours'
			| 'rate-limit'
			| 'retry-backoff';
		recipientId?: string;
		until?: number;
	}>;
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

export type VoiceCampaignReadinessCheck = {
	details?: Record<string, unknown>;
	name: string;
	status: 'fail' | 'pass';
};

export type VoiceCampaignReadinessProofOptions = {
	store?: VoiceCampaignStore;
};

export type VoiceCampaignReadinessProofReport = {
	campaigns: {
		retry: VoiceCampaignRecord;
		scheduled: VoiceCampaignRecord;
	};
	checks: VoiceCampaignReadinessCheck[];
	generatedAt: number;
	import: VoiceCampaignRecipientImportResult;
	ok: boolean;
	proof: 'voice-campaign-readiness';
	ticks: {
		allowed: VoiceCampaignTickResult;
		quietHours: VoiceCampaignTickResult;
		rateLimited: VoiceCampaignTickResult;
		retryAllowed: VoiceCampaignTickResult;
		retryBackoff: VoiceCampaignTickResult;
		retryInitial: VoiceCampaignTickResult;
		windowBlocked: VoiceCampaignTickResult;
	};
};

export type VoiceCampaignReadinessAssertionInput = {
	maxFailedChecks?: number;
	minAcceptedImports?: number;
	minRejectedImports?: number;
	minTotalImports?: number;
	requiredBlockedReasons?: VoiceCampaignTickResult['blocked'][number]['reason'][];
	requiredChecks?: string[];
	requireOk?: boolean;
};

export type VoiceCampaignReadinessAssertionReport = {
	acceptedImports: number;
	blockedReasons: VoiceCampaignTickResult['blocked'][number]['reason'][];
	failed: number;
	issues: string[];
	ok: boolean;
	passed: number;
	rejectedImports: number;
	total: number;
	totalImports: number;
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
	now?: () => number;
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
	importRecipients: (
		campaignId: string,
		input: VoiceCampaignRecipientImportOptions
	) => Promise<VoiceCampaignRecord & { import: VoiceCampaignRecipientImportResult }>;
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
	operationsRecordHref?:
		| false
		| string
		| ((input: {
				attempt: VoiceCampaignAttempt;
				campaign: VoiceCampaign;
				recipient?: VoiceCampaignRecipient;
				sessionId?: string;
		  }) => string | undefined);
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

export type VoiceCampaignTelephonyOutcomeInput<TResult = unknown> = {
	campaignId?: string;
	decision: VoiceTelephonyOutcomeDecision;
	event?: VoiceTelephonyOutcomeProviderEvent;
	externalCallId?: string;
	routeResult?: TResult;
	sessionId?: string;
	attemptId?: string;
};

export type VoiceCampaignTelephonyOutcomeStatus =
	| 'failed'
	| 'ignore'
	| 'succeeded';

export type VoiceCampaignTelephonyOutcomeOptions<TResult = unknown> = {
	resolveCampaignId?: (
		input: VoiceCampaignTelephonyOutcomeInput<TResult>
	) => Promise<string | undefined> | string | undefined;
	resolveExternalCallId?: (
		input: VoiceCampaignTelephonyOutcomeInput<TResult>
	) => Promise<string | undefined> | string | undefined;
	resolveAttemptId?: (
		input: VoiceCampaignTelephonyOutcomeInput<TResult>
	) => Promise<string | undefined> | string | undefined;
	runtime?: VoiceCampaignRuntime;
	statusForDecision?: (
		input: VoiceCampaignTelephonyOutcomeInput<TResult>
	) =>
		| Promise<VoiceCampaignTelephonyOutcomeStatus>
		| VoiceCampaignTelephonyOutcomeStatus;
	store?: VoiceCampaignStore;
};

export type VoiceCampaignTelephonyOutcomeResult = {
	applied: boolean;
	campaignId?: string;
	error?: string;
	externalCallId?: string;
	reason?:
		| 'ignored'
		| 'missing-attempt'
		| 'missing-campaign'
		| 'missing-runtime'
		| 'terminal-attempt';
	status?: 'failed' | 'succeeded';
	attemptId?: string;
};

export type VoiceCampaignTelephonyOutcomeSnapshot<TResult = unknown> = {
	action: VoiceTelephonyOutcomeDecision['action'];
	at: number;
	campaignOutcome: VoiceCampaignTelephonyOutcomeResult;
	disposition?: VoiceTelephonyOutcomeDecision['disposition'];
	duplicate?: boolean;
	idempotencyKey?: string;
	provider?: string;
	routeResult?: TResult;
	sessionId?: string;
	source?: VoiceTelephonyOutcomeDecision['source'];
};

export type VoiceCampaignTelephonyOutcomeRecorderOptions<TResult = unknown> =
	VoiceCampaignTelephonyOutcomeOptions<TResult> & {
		maxSnapshots?: number;
		now?: () => number;
	};

export type VoiceCampaignTelephonyOutcomeRecorderRecordInput<TResult = unknown> =
	VoiceTelephonyWebhookDecision<TResult> & {
		provider?: string;
	};

export type VoiceCampaignTelephonyOutcomeRecorder<TResult = unknown> = {
	clear: () => void;
	handler: (
		provider?: string
	) => (input: VoiceTelephonyWebhookDecision<TResult>) => Promise<void>;
	list: () => VoiceCampaignTelephonyOutcomeSnapshot<TResult>[];
	record: (
		input: VoiceCampaignTelephonyOutcomeRecorderRecordInput<TResult>
	) => Promise<VoiceCampaignTelephonyOutcomeSnapshot<TResult>>;
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

const normalizeHour = (hour: number) => {
	if (!Number.isFinite(hour)) {
		return 0;
	}
	return Math.min(24, Math.max(0, hour));
};

const getCampaignWindowMinute = (at: number, offsetMinutes = 0) => {
	const date = new Date(at + offsetMinutes * 60_000);
	return {
		dayOfWeek: date.getUTCDay(),
		minuteOfDay: date.getUTCHours() * 60 + date.getUTCMinutes()
	};
};

const isWithinCampaignTimeWindow = (window: VoiceCampaignTimeWindow, at: number) => {
	const { dayOfWeek, minuteOfDay } = getCampaignWindowMinute(
		at,
		window.timeZoneOffsetMinutes ?? 0
	);
	if (window.daysOfWeek && !window.daysOfWeek.includes(dayOfWeek)) {
		return false;
	}
	const start = normalizeHour(window.startHour) * 60;
	const end = normalizeHour(window.endHour) * 60;
	if (start === end) {
		return true;
	}
	if (start < end) {
		return minuteOfDay >= start && minuteOfDay < end;
	}
	return minuteOfDay >= start || minuteOfDay < end;
};

const getCampaignRetryBackoffMs = (
	policy: VoiceCampaignRetryPolicy | undefined,
	attemptNumber: number
) => {
	const backoff = policy?.backoffMs;
	if (Array.isArray(backoff)) {
		return Math.max(0, backoff[Math.min(backoff.length - 1, attemptNumber - 1)] ?? 0);
	}
	const value = Math.max(0, backoff ?? 0);
	if (policy?.maxBackoffMs === undefined) {
		return value;
	}
	return Math.min(value, Math.max(0, policy.maxBackoffMs));
};

const getLastCampaignAttempt = (
	record: VoiceCampaignRecord,
	recipientId: string
) =>
	record.attempts
		.filter((attempt) => attempt.recipientId === recipientId)
		.sort((left, right) => right.createdAt - left.createdAt)[0];

const parseCsvLine = (line: string) => {
	const values: string[] = [];
	let current = '';
	let quoted = false;

	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];
		const next = line[index + 1];
		if (character === '"' && quoted && next === '"') {
			current += '"';
			index += 1;
			continue;
		}
		if (character === '"') {
			quoted = !quoted;
			continue;
		}
		if (character === ',' && !quoted) {
			values.push(current.trim());
			current = '';
			continue;
		}
		current += character;
	}
	values.push(current.trim());
	return values;
};

const parseVoiceCampaignCSVRows = (csv: string): VoiceCampaignRecipientImportRow[] => {
	const lines = csv
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length === 0) {
		return [];
	}
	const headers = parseCsvLine(lines[0] ?? '');
	return lines.slice(1).map((line) => {
		const values = parseCsvLine(line);
		const row: VoiceCampaignRecipientImportRow = {};
		headers.forEach((header, index) => {
			row[header] = values[index] ?? '';
		});
		return row;
	});
};

const normalizeCampaignPhone = (value: unknown) => {
	if (typeof value !== 'string' && typeof value !== 'number') {
		return undefined;
	}
	const raw = String(value).trim();
	if (!raw) {
		return undefined;
	}
	const hasPlus = raw.startsWith('+');
	const digits = raw.replace(/\D/g, '');
	if (digits.length < 8 || digits.length > 15) {
		return undefined;
	}
	return hasPlus ? `+${digits}` : `+${digits}`;
};

const toCampaignScalar = (value: unknown) => {
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value;
	}
	return undefined;
};

const truthyConsent = (value: unknown) => {
	if (value === true) {
		return true;
	}
	if (typeof value === 'number') {
		return value > 0;
	}
	if (typeof value !== 'string') {
		return false;
	}
	return ['1', 'true', 'yes', 'y', 'consented', 'opt-in', 'opted-in'].includes(
		value.trim().toLowerCase()
	);
};

export const importVoiceCampaignRecipients = (
	options: VoiceCampaignRecipientImportOptions
): VoiceCampaignRecipientImportResult => {
	const rows = options.rows ?? (options.csv ? parseVoiceCampaignCSVRows(options.csv) : []);
	const phoneColumn = options.phoneColumn ?? 'phone';
	const nameColumn = options.nameColumn ?? 'name';
	const idColumn = options.idColumn ?? 'id';
	const consentColumn = options.consentColumn ?? 'consent';
	const dedupe = options.dedupe ?? true;
	const seenPhones = new Set<string>();
	const accepted: VoiceCampaignRecipientInput[] = [];
	const rejected: VoiceCampaignRecipientImportIssue[] = [];
	let duplicates = 0;

	rows.forEach((row, index) => {
		const rowNumber = index + 1;
		const phoneValue = row[phoneColumn];
		if (phoneValue === undefined || phoneValue === null || phoneValue === '') {
			rejected.push({
				code: 'missing-phone',
				message: `Campaign recipient row ${rowNumber} is missing a phone number.`,
				row: rowNumber,
				value: phoneValue
			});
			return;
		}
		const phone = normalizeCampaignPhone(phoneValue);
		if (!phone) {
			rejected.push({
				code: 'invalid-phone',
				message: `Campaign recipient row ${rowNumber} has an invalid phone number.`,
				row: rowNumber,
				value: phoneValue
			});
			return;
		}
		if (options.requireConsent && !truthyConsent(row[consentColumn])) {
			rejected.push({
				code: 'missing-consent',
				message: `Campaign recipient row ${rowNumber} is missing required consent.`,
				row: rowNumber,
				value: row[consentColumn]
			});
			return;
		}
		if (dedupe && seenPhones.has(phone)) {
			duplicates += 1;
			rejected.push({
				code: 'duplicate',
				message: `Campaign recipient row ${rowNumber} duplicates ${phone}.`,
				row: rowNumber,
				value: phone
			});
			return;
		}
		seenPhones.add(phone);

		const variables = Object.fromEntries(
			(options.variableColumns ?? [])
				.map((column) => [column, toCampaignScalar(row[column])] as const)
				.filter(([, value]) => value !== undefined)
		);
		const metadata = Object.fromEntries(
			(options.metadataColumns ?? [])
				.map((column) => [column, row[column]] as const)
				.filter(([, value]) => value !== undefined)
		);
		const id = toCampaignScalar(row[idColumn]);
		const name = toCampaignScalar(row[nameColumn]);

		accepted.push({
			id: typeof id === 'string' ? id : undefined,
			metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
			name: typeof name === 'string' ? name : undefined,
			phone,
			variables:
				Object.keys(variables).length > 0
					? (variables as VoiceCampaignRecipient['variables'])
					: undefined
		});
	});

	return {
		accepted,
		duplicates,
		rejected,
		total: rows.length
	};
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

const runtimeAddRecipients = async (
	store: VoiceCampaignStore,
	record: VoiceCampaignRecord,
	recipients: VoiceCampaignRecipientInput[]
) => {
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
};

export const createVoiceCampaign = (
	options: VoiceCampaignRuntimeOptions
): VoiceCampaignRuntime => {
	const { store } = options;
	const now = options.now ?? Date.now;

	return {
		addRecipients: async (campaignId, recipients) => {
			const record = await ensureRecord(store, campaignId);
			return runtimeAddRecipients(store, record, recipients);
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
			const at = now();
			const campaign: VoiceCampaign = {
				createdAt: at,
				description: input.description,
				id: input.id ?? createId(),
				maxAttempts: input.maxAttempts ?? 1,
				maxConcurrentAttempts: input.maxConcurrentAttempts ?? 1,
				metadata: input.metadata,
				name: input.name,
				schedule: input.schedule,
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
		importRecipients: async (campaignId, input) => {
			const result = importVoiceCampaignRecipients(input);
			const record = await ensureRecord(store, campaignId);
			const updated =
				result.accepted.length > 0
					? await runtimeAddRecipients(store, record, result.accepted)
					: record;
			return {
				...updated,
				import: result
			};
		},
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
				blocked: [],
				campaignId,
				errors: [],
				started: []
			};
			if (record.campaign.status !== 'running') {
				return result;
			}
			const at = now();
			const schedule = record.campaign.schedule;
			if (
				schedule?.attemptWindow &&
				!isWithinCampaignTimeWindow(schedule.attemptWindow, at)
			) {
				result.blocked.push({
					reason: 'outside-attempt-window'
				});
				return result;
			}
			if (schedule?.quietHours && isWithinCampaignTimeWindow(schedule.quietHours, at)) {
				result.blocked.push({
					reason: 'quiet-hours'
				});
				return result;
			}
			const capacity = Math.max(
				0,
				record.campaign.maxConcurrentAttempts - activeAttemptCount(record)
			);
			const rateLimit = schedule?.rateLimit;
			const rateRemaining = rateLimit
				? Math.max(
						0,
						rateLimit.maxAttempts -
							record.attempts.filter(
								(attempt) =>
									(attempt.startedAt ?? attempt.createdAt) >=
									at - rateLimit.windowMs
							).length
					)
				: Number.MAX_SAFE_INTEGER;
			const availableCapacity = Math.min(capacity, rateRemaining);
			if (capacity > 0 && rateLimit && rateRemaining === 0) {
				result.blocked.push({
					reason: 'rate-limit'
				});
			}
			const candidates: VoiceCampaignRecipient[] = [];
			for (const recipient of record.recipients) {
				if (candidates.length >= availableCapacity) {
					break;
				}
				if (
					recipient.status !== 'queued' &&
					recipient.status !== 'pending'
				) {
					continue;
				}
				if (recipient.attempts >= record.campaign.maxAttempts) {
					continue;
				}
				const backoffMs = getCampaignRetryBackoffMs(
					schedule?.retryPolicy,
					recipient.attempts
				);
				const lastAttempt = getLastCampaignAttempt(record, recipient.id);
				const retryAt =
					lastAttempt && recipient.attempts > 0
						? (lastAttempt.completedAt ?? lastAttempt.updatedAt) + backoffMs
						: undefined;
				if (retryAt !== undefined && retryAt > at) {
					result.blocked.push({
						reason: 'retry-backoff',
						recipientId: recipient.id,
						until: retryAt
					});
					continue;
				}
				candidates.push(recipient);
			}
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
						attempt.updatedAt = now();
					} catch (error) {
						const failedAt = now();
						attempt.completedAt = failedAt;
						attempt.error = error instanceof Error ? error.message : String(error);
						attempt.status = 'failed';
						attempt.updatedAt = failedAt;
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

const firstOutcomeString = (
	values: Array<unknown>
): string | undefined => {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
		if (typeof value === 'number' && Number.isFinite(value)) {
			return String(value);
		}
	}
};

const resolveDefaultCampaignOutcomeIds = <TResult = unknown>(
	input: VoiceCampaignTelephonyOutcomeInput<TResult>
) => {
	const metadata = input.event?.metadata ?? {};
	const decisionMetadata = input.decision.metadata ?? {};
	const routeResult =
		typeof input.routeResult === 'object' && input.routeResult !== null
			? (input.routeResult as Record<string, unknown>)
			: {};
	return {
		campaignId:
			input.campaignId ??
			firstOutcomeString([
				metadata.campaignId,
				metadata.voiceCampaignId,
				decisionMetadata.campaignId,
				decisionMetadata.voiceCampaignId,
				routeResult.campaignId,
				routeResult.voiceCampaignId
			]),
		externalCallId:
			input.externalCallId ??
			firstOutcomeString([
				metadata.externalCallId,
				metadata.callId,
				metadata.callSid,
				metadata.callUuid,
				decisionMetadata.externalCallId,
				decisionMetadata.callId,
				decisionMetadata.callSid,
				decisionMetadata.callUuid,
				routeResult.externalCallId,
				routeResult.callId,
				routeResult.callSid,
				routeResult.callUuid,
				input.sessionId
			]),
		attemptId:
			input.attemptId ??
			firstOutcomeString([
				metadata.attemptId,
				metadata.voiceCampaignAttemptId,
				decisionMetadata.attemptId,
				decisionMetadata.voiceCampaignAttemptId,
				routeResult.attemptId,
				routeResult.voiceCampaignAttemptId
			])
	};
};

const defaultCampaignOutcomeStatus = <TResult = unknown>(
	input: VoiceCampaignTelephonyOutcomeInput<TResult>
): VoiceCampaignTelephonyOutcomeStatus => {
	switch (input.decision.action) {
		case 'complete':
		case 'transfer':
			return 'succeeded';
		case 'escalate':
		case 'no-answer':
		case 'voicemail':
			return 'failed';
		default:
			return 'ignore';
	}
};

const findCampaignAttempt = async (input: {
	attemptId?: string;
	campaignId?: string;
	externalCallId?: string;
	runtime: VoiceCampaignRuntime;
}) => {
	const records = input.campaignId
		? [await input.runtime.get(input.campaignId)].filter(Boolean)
		: await input.runtime.list();
	for (const record of records as VoiceCampaignRecord[]) {
		const attempt = record.attempts.find(
			(item) =>
				(input.attemptId && item.id === input.attemptId) ||
				(input.externalCallId && item.externalCallId === input.externalCallId)
		);
		if (attempt) {
			return {
				attempt,
				record
			};
		}
	}
};

export const applyVoiceCampaignTelephonyOutcome = async <TResult = unknown>(
	input: VoiceCampaignTelephonyOutcomeInput<TResult>,
	options: VoiceCampaignTelephonyOutcomeOptions<TResult> = {}
): Promise<VoiceCampaignTelephonyOutcomeResult> => {
	const runtime =
		options.runtime ??
		(options.store
			? createVoiceCampaign({
					store: options.store
				})
			: undefined);
	if (!runtime) {
		return {
			applied: false,
			reason: 'missing-runtime'
		};
	}

	const defaults = resolveDefaultCampaignOutcomeIds(input);
	const campaignId = (await options.resolveCampaignId?.(input)) ?? defaults.campaignId;
	const attemptId = (await options.resolveAttemptId?.(input)) ?? defaults.attemptId;
	const externalCallId =
		(await options.resolveExternalCallId?.(input)) ?? defaults.externalCallId;
	const status =
		(await options.statusForDecision?.(input)) ??
		defaultCampaignOutcomeStatus(input);
	if (status === 'ignore') {
		return {
			applied: false,
			campaignId,
			externalCallId,
			reason: 'ignored',
			attemptId
		};
	}

	const match = await findCampaignAttempt({
		attemptId,
		campaignId,
		externalCallId,
		runtime
	});
	if (!match) {
		return {
			applied: false,
			campaignId,
			externalCallId,
			reason: campaignId ? 'missing-attempt' : 'missing-campaign',
			attemptId
		};
	}
	if (match.attempt.status === 'failed' || match.attempt.status === 'succeeded') {
		return {
			applied: false,
			campaignId: match.record.campaign.id,
			externalCallId: match.attempt.externalCallId ?? externalCallId,
			reason: 'terminal-attempt',
			status: match.attempt.status,
			attemptId: match.attempt.id
		};
	}

	await runtime.completeAttempt(match.record.campaign.id, match.attempt.id, {
		error:
			status === 'failed'
				? input.decision.reason ??
					input.decision.disposition ??
					input.event?.reason ??
					input.event?.status ??
					input.decision.action
				: undefined,
		externalCallId: externalCallId ?? match.attempt.externalCallId,
		metadata: {
			telephonyAction: input.decision.action,
			telephonyConfidence: input.decision.confidence,
			telephonyDisposition: input.decision.disposition,
			telephonyProvider: input.event?.provider,
			telephonySource: input.decision.source,
			telephonyStatus: input.event?.status
		},
		status
	});

	return {
		applied: true,
		campaignId: match.record.campaign.id,
		externalCallId: externalCallId ?? match.attempt.externalCallId,
		status,
		attemptId: match.attempt.id
	};
};

export const createVoiceCampaignTelephonyOutcomeHandler = <TResult = unknown>(
	options: VoiceCampaignTelephonyOutcomeOptions<TResult>
) => (input: VoiceTelephonyWebhookDecision<TResult>) =>
	applyVoiceCampaignTelephonyOutcome(
		{
			decision: input.decision,
			event: input.event,
			routeResult: input.routeResult as TResult,
			sessionId: input.sessionId
		},
		options
	);

export const createVoiceCampaignTelephonyOutcomeRecorder = <TResult = unknown>(
	options: VoiceCampaignTelephonyOutcomeRecorderOptions<TResult> = {}
): VoiceCampaignTelephonyOutcomeRecorder<TResult> => {
	const snapshots: VoiceCampaignTelephonyOutcomeSnapshot<TResult>[] = [];
	const maxSnapshots = Math.max(0, options.maxSnapshots ?? 20);
	const now = options.now ?? Date.now;

	const record = async (
		input: VoiceCampaignTelephonyOutcomeRecorderRecordInput<TResult>
	) => {
		const campaignOutcome = await applyVoiceCampaignTelephonyOutcome(
			{
				decision: input.decision,
				event: input.event,
				routeResult: input.routeResult as TResult,
				sessionId: input.sessionId
			},
			options
		);
		const snapshot: VoiceCampaignTelephonyOutcomeSnapshot<TResult> = {
			action: input.decision.action,
			at: now(),
			campaignOutcome,
			disposition: input.decision.disposition,
			duplicate: input.duplicate,
			idempotencyKey: input.idempotencyKey,
			provider: input.provider ?? input.event.provider,
			routeResult: input.routeResult as TResult,
			sessionId: input.sessionId,
			source: input.decision.source
		};

		if (maxSnapshots > 0) {
			snapshots.unshift(snapshot);
			snapshots.splice(maxSnapshots);
		}
		return snapshot;
	};

	return {
		clear: () => {
			snapshots.splice(0);
		},
		handler: (provider) => async (input) => {
			await record({
				...input,
				provider: provider ?? input.event.provider
			});
		},
		list: () => snapshots.map((snapshot) => ({ ...snapshot })),
		record
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

const pushCampaignReadinessCheck = (
	checks: VoiceCampaignReadinessCheck[],
	name: string,
	condition: boolean,
	details?: Record<string, unknown>
) => {
	checks.push({
		details,
		name,
		status: condition ? 'pass' : 'fail'
	});
};

export const runVoiceCampaignReadinessProof = async (
	options: VoiceCampaignReadinessProofOptions = {}
): Promise<VoiceCampaignReadinessProofReport> => {
	const checks: VoiceCampaignReadinessCheck[] = [];
	const store = options.store ?? createVoiceMemoryCampaignStore();
	let now = Date.UTC(2026, 0, 5, 8, 0, 0);
	const runtime = createVoiceCampaign({
		dialer: ({ attempt }) => ({
			externalCallId: `campaign-readiness-${attempt.id}`,
			metadata: {
				mode: 'readiness-proof'
			},
			status: 'running'
		}),
		now: () => now,
		store
	});
	const scheduled = await runtime.create({
		id: `campaign-readiness-schedule-${crypto.randomUUID()}`,
		maxConcurrentAttempts: 3,
		name: 'Campaign Readiness Schedule Proof',
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
	const imported = await runtime.importRecipients(scheduled.campaign.id, {
		csv: `id,name,phone,consent,segment
recipient-1,Ada,+15550001001,yes,alpha
recipient-duplicate,Grace,+15550001001,yes,beta
recipient-bad,Linus,not-a-phone,yes,gamma
recipient-no-consent,Barbara,+15550001004,no,delta`,
		requireConsent: true,
		variableColumns: ['segment']
	});
	await runtime.enqueue(scheduled.campaign.id);
	const windowBlocked = await runtime.tick(scheduled.campaign.id);
	now = Date.UTC(2026, 0, 5, 12, 30, 0);
	const quietHours = await runtime.tick(scheduled.campaign.id);
	now = Date.UTC(2026, 0, 5, 14, 0, 0);
	const allowed = await runtime.tick(scheduled.campaign.id);
	const rateLimited = await runtime.tick(scheduled.campaign.id);

	let retryNow = 1_000;
	const retryRuntime = createVoiceCampaign({
		dialer: () => {
			throw new Error('carrier busy');
		},
		now: () => retryNow,
		store
	});
	const retry = await retryRuntime.create({
		id: `campaign-readiness-retry-${crypto.randomUUID()}`,
		maxAttempts: 2,
		name: 'Campaign Readiness Retry Proof',
		schedule: {
			retryPolicy: {
				backoffMs: 5_000
			}
		}
	});
	await retryRuntime.addRecipients(retry.campaign.id, [
		{
			id: 'readiness-retry-recipient',
			phone: '+15550002001'
		}
	]);
	await retryRuntime.enqueue(retry.campaign.id);
	const retryInitial = await retryRuntime.tick(retry.campaign.id);
	retryNow = 3_000;
	const retryBackoff = await retryRuntime.tick(retry.campaign.id);
	retryNow = 6_000;
	const retryAllowed = await retryRuntime.tick(retry.campaign.id);

	const finalScheduled = await runtime.get(scheduled.campaign.id);
	const finalRetry = await retryRuntime.get(retry.campaign.id);
	if (!finalScheduled || !finalRetry) {
		throw new Error('Campaign readiness proof did not persist campaign records.');
	}

	pushCampaignReadinessCheck(checks, 'recipient-import-validation', imported.import.accepted.length === 1 && imported.import.rejected.length === 3, {
		accepted: imported.import.accepted.length,
		rejected: imported.import.rejected.length
	});
	pushCampaignReadinessCheck(checks, 'attempt-window-block', windowBlocked.blocked.some((block) => block.reason === 'outside-attempt-window'), {
		blocked: windowBlocked.blocked
	});
	pushCampaignReadinessCheck(checks, 'quiet-hours-block', quietHours.blocked.some((block) => block.reason === 'quiet-hours'), {
		blocked: quietHours.blocked
	});
	pushCampaignReadinessCheck(checks, 'allowed-attempt', allowed.attempted === 1, {
		attempted: allowed.attempted
	});
	pushCampaignReadinessCheck(checks, 'rate-limit-block', rateLimited.blocked.some((block) => block.reason === 'rate-limit'), {
		blocked: rateLimited.blocked
	});
	pushCampaignReadinessCheck(checks, 'retry-backoff-block', retryInitial.attempted === 1 && retryBackoff.blocked.some((block) => block.reason === 'retry-backoff'), {
		blocked: retryBackoff.blocked
	});
	pushCampaignReadinessCheck(checks, 'retry-to-max-attempts', retryAllowed.attempted === 1 && finalRetry.recipients[0]?.status === 'failed', {
		attempted: retryAllowed.attempted,
		recipientStatus: finalRetry.recipients[0]?.status
	});

	return {
		campaigns: {
			retry: finalRetry,
			scheduled: finalScheduled
		},
		checks,
		generatedAt: Date.now(),
		import: imported.import,
		ok: checks.every((check) => check.status === 'pass'),
		proof: 'voice-campaign-readiness',
		ticks: {
			allowed,
			quietHours,
			rateLimited,
			retryAllowed,
			retryBackoff,
			retryInitial,
			windowBlocked
		}
	};
};

export const evaluateVoiceCampaignReadinessEvidence = (
	report: VoiceCampaignReadinessProofReport,
	input: VoiceCampaignReadinessAssertionInput = {}
): VoiceCampaignReadinessAssertionReport => {
	const issues: string[] = [];
	const maxFailedChecks = input.maxFailedChecks ?? 0;
	const requireOk = input.requireOk ?? true;
	const failed = report.checks.filter((check) => check.status === 'fail').length;
	const passed = report.checks.length - failed;
	const checkNames = new Set(report.checks.map((check) => check.name));
	const blockedReasons = [
		...new Set(
			Object.values(report.ticks).flatMap((tick) =>
				tick.blocked.map((block) => block.reason)
			)
		)
	].sort();

	if (requireOk && !report.ok) {
		issues.push('Expected campaign readiness proof to pass.');
	}
	if (failed > maxFailedChecks) {
		issues.push(
			`Expected at most ${String(maxFailedChecks)} failing campaign readiness check(s), found ${String(failed)}.`
		);
	}
	if (
		input.minTotalImports !== undefined &&
		report.import.total < input.minTotalImports
	) {
		issues.push(
			`Expected at least ${String(input.minTotalImports)} campaign import row(s), found ${String(report.import.total)}.`
		);
	}
	if (
		input.minAcceptedImports !== undefined &&
		report.import.accepted.length < input.minAcceptedImports
	) {
		issues.push(
			`Expected at least ${String(input.minAcceptedImports)} accepted campaign import(s), found ${String(report.import.accepted.length)}.`
		);
	}
	if (
		input.minRejectedImports !== undefined &&
		report.import.rejected.length < input.minRejectedImports
	) {
		issues.push(
			`Expected at least ${String(input.minRejectedImports)} rejected campaign import(s), found ${String(report.import.rejected.length)}.`
		);
	}
	for (const check of input.requiredChecks ?? []) {
		if (!checkNames.has(check)) {
			issues.push(`Missing campaign readiness check: ${check}.`);
		}
	}
	for (const reason of input.requiredBlockedReasons ?? []) {
		if (!blockedReasons.includes(reason)) {
			issues.push(`Missing campaign readiness blocked reason: ${reason}.`);
		}
	}

	return {
		acceptedImports: report.import.accepted.length,
		blockedReasons,
		failed,
		issues,
		ok: issues.length === 0,
		passed,
		rejectedImports: report.import.rejected.length,
		total: report.checks.length,
		totalImports: report.import.total
	};
};

export const assertVoiceCampaignReadinessEvidence = (
	report: VoiceCampaignReadinessProofReport,
	input: VoiceCampaignReadinessAssertionInput = {}
): VoiceCampaignReadinessAssertionReport => {
	const assertion = evaluateVoiceCampaignReadinessEvidence(report, input);
	if (!assertion.ok) {
		throw new Error(
			`Voice campaign readiness evidence assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const getString = (value: unknown) =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

const campaignAttemptSessionId = (attempt: VoiceCampaignAttempt) =>
	getString(attempt.metadata?.sessionId) ??
	getString(attempt.metadata?.voiceSessionId) ??
	getString(attempt.metadata?.callSessionId);

const resolveCampaignOperationsRecordHref = (
	value: VoiceCampaignRoutesOptions['operationsRecordHref'],
	input: {
		attempt: VoiceCampaignAttempt;
		campaign: VoiceCampaign;
		recipient?: VoiceCampaignRecipient;
		sessionId?: string;
	}
) => {
	if (value === false || !input.sessionId) {
		return undefined;
	}
	if (typeof value === 'function') {
		return value(input);
	}
	if (typeof value === 'string') {
		const encoded = encodeURIComponent(input.sessionId);
		return value.includes(':sessionId') ? value.replace(':sessionId', encoded) : `${value.replace(/\/$/, '')}/${encoded}`;
	}
	return undefined;
};

export const renderVoiceCampaignsHTML = (
	records: VoiceCampaignRecord[],
	options: Pick<VoiceCampaignRoutesOptions, 'operationsRecordHref' | 'title'> = {}
) => {
	const title = options.title ?? 'Voice Campaigns';
	const rows = records
		.map(
			(record) => `<tr><td>${escapeHtml(record.campaign.name)}</td><td>${escapeHtml(record.campaign.status)}</td><td>${String(record.recipients.length)}</td><td>${String(record.attempts.length)}</td><td>${new Date(record.campaign.updatedAt).toLocaleString()}</td></tr>`
		)
		.join('');
	const summary = summarizeVoiceCampaigns(records);
	const attemptRows = records
		.flatMap((record) =>
			record.attempts
				.slice(-8)
				.reverse()
				.map((attempt) => {
					const recipient = record.recipients.find(
						(item) => item.id === attempt.recipientId
					);
					const sessionId = campaignAttemptSessionId(attempt);
					const href = resolveCampaignOperationsRecordHref(
						options.operationsRecordHref,
						{
							attempt,
							campaign: record.campaign,
							recipient,
							sessionId
						}
					);
					return `<tr><td>${escapeHtml(record.campaign.name)}</td><td>${escapeHtml(attempt.status)}</td><td>${escapeHtml(recipient?.phone ?? attempt.recipientId)}</td><td>${escapeHtml(sessionId ?? '')}</td><td>${href ? `<a href="${escapeHtml(href)}">Open operations record</a>` : ''}</td></tr>`;
				})
		)
		.slice(0, 20)
		.join('');
	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#111827;color:#f9fafb;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1080px;padding:32px}.hero{background:linear-gradient(135deg,rgba(251,146,60,.18),rgba(45,212,191,.12));border:1px solid #334155;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#fdba74;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:.9;margin:.2rem 0 1rem}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin:18px 0}.grid article,table{background:#172033;border:1px solid #334155;border-radius:18px}.grid article{padding:16px}.grid span{color:#aab5c0}.grid strong{display:block;font-size:2rem;margin:.25rem 0}table{border-collapse:collapse;margin-top:18px;overflow:hidden;width:100%}td,th{border-bottom:1px solid #334155;padding:12px;text-align:left}a{color:#fdba74}</style></head><body><main><section class="hero"><p class="eyebrow">Self-hosted outbound</p><h1>${escapeHtml(title)}</h1><p>Campaign orchestration, recipients, attempts, retries, and outcomes without a hosted dialer dashboard.</p><section class="grid"><article><span>Campaigns</span><strong>${String(summary.campaigns.total)}</strong></article><article><span>Recipients</span><strong>${String(summary.recipients.total)}</strong></article><article><span>Attempts</span><strong>${String(summary.attempts.total)}</strong></article><article><span>Running</span><strong>${String(summary.campaigns.running)}</strong></article></section></section><table><thead><tr><th>Name</th><th>Status</th><th>Recipients</th><th>Attempts</th><th>Updated</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No campaigns yet.</td></tr>'}</tbody></table><h2>Recent attempts</h2><table><thead><tr><th>Campaign</th><th>Status</th><th>Recipient</th><th>Session</th><th>Debug</th></tr></thead><tbody>${attemptRows || '<tr><td colspan="5">No attempts yet.</td></tr>'}</tbody></table></main></body></html>`;
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
		.get(`${path}/readiness-proof`, () => runVoiceCampaignReadinessProof())
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
		.post(`${path}/:campaignId/recipients/import`, async ({ params, request }) =>
			runtime.importRecipients(
				params.campaignId,
				await readJsonBody<VoiceCampaignRecipientImportOptions>(request)
			)
		)
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
