import type { VoiceCampaignRecord, VoiceCampaignStore } from './campaign';
import { Elysia } from 'elysia';
import {
	recordVoiceRetentionAuditEvent,
	type VoiceAuditActor,
	type VoiceAuditEventFilter,
	type VoiceAuditEventStore
} from './audit';
import {
	exportVoiceAuditTrail,
	renderVoiceAuditHTML,
	renderVoiceAuditMarkdown
} from './auditExport';
import type {
	VoiceAuditSinkDeliveryRecord,
	VoiceAuditSinkDeliveryStore
} from './auditSinks';
import type {
	StoredVoiceIntegrationEvent,
	StoredVoiceOpsTask,
	VoiceIntegrationEventStore,
	VoiceOpsTaskStore
} from './ops';
import type {
	StoredVoiceIncidentBundleArtifact,
	VoiceIncidentBundleStore
} from './incidentBundle';
import type {
	StoredVoiceCallReviewArtifact,
	VoiceCallReviewStore
} from './testing/review';
import type {
	StoredVoiceTraceEvent,
	VoiceTraceEventStore,
	VoiceTracePruneFilter,
	VoiceTraceSinkDeliveryRecord,
	VoiceTraceSinkDeliveryStore
} from './trace';
import { pruneVoiceTraceEvents } from './trace';
import type { VoiceSessionStore, VoiceSessionSummary } from './types';

export const voiceComplianceRedactionDefaults = {
	keys: [
		'apiKey',
		'authorization',
		'email',
		'password',
		'phone',
		'secret',
		'token'
	],
	redactEmails: true,
	redactPhoneNumbers: true
} satisfies import('./trace').VoiceTraceRedactionConfig;

export type VoiceDataRetentionScope =
	| 'auditDeliveries'
	| 'campaigns'
	| 'events'
	| 'incidentBundles'
	| 'reviews'
	| 'sessions'
	| 'tasks'
	| 'traceDeliveries'
	| 'traces';

export type VoiceDataRetentionStores = {
	campaigns?: VoiceCampaignStore;
	events?: VoiceIntegrationEventStore;
	incidentBundles?: VoiceIncidentBundleStore;
	reviews?: VoiceCallReviewStore;
	session?: VoiceSessionStore;
	sessions?: VoiceSessionStore;
	tasks?: VoiceOpsTaskStore;
	traceDeliveries?: VoiceTraceSinkDeliveryStore;
	traces?: VoiceTraceEventStore;
};

export type VoiceDataRetentionPolicy = VoiceDataRetentionStores & {
	audit?: VoiceAuditEventStore;
	auditDeliveries?: VoiceAuditSinkDeliveryStore;
	auditActor?: VoiceAuditActor;
	before?: number;
	beforeOrAt?: number;
	dryRun?: boolean;
	keepNewest?: Partial<Record<VoiceDataRetentionScope, number>>;
	limit?: number;
	scopes?: VoiceDataRetentionScope[];
	traceFilter?: VoiceTracePruneFilter;
};

export type VoiceDataRetentionScopeReport = {
	deletedIds: string[];
	deletedCount: number;
	dryRun: boolean;
	keepNewest?: number;
	scannedCount: number;
	scope: VoiceDataRetentionScope;
	skippedReason?: 'missing-store' | 'missing-selector';
};

export type VoiceDataRetentionReport = {
	checkedAt: number;
	deletedCount: number;
	dryRun: boolean;
	scopes: VoiceDataRetentionScopeReport[];
};

export type VoiceDataControlStorageSurface = {
	configured: boolean;
	control: 'audit' | 'artifact' | 'queue' | 'session' | 'workflow';
	name: string;
	selfHosted: boolean;
};

export type VoiceDataControlProviderKeySurface = {
	env?: string;
	name: string;
	recommendation: string;
	required: boolean;
};

export type VoiceDataControlReport = {
	auditExport?: Awaited<ReturnType<typeof exportVoiceAuditTrail>>;
	checkedAt: number;
	deletionProof?: VoiceDataRetentionReport;
	redaction: {
		defaults: typeof voiceComplianceRedactionDefaults;
		enabled: boolean;
	};
	retentionPlan: VoiceDataRetentionReport;
	storage: VoiceDataControlStorageSurface[];
	providerKeys: VoiceDataControlProviderKeySurface[];
	zeroRetentionAvailable: boolean;
};

export type VoiceDataControlAssertionInput = {
	maxDeletionDeleted?: number;
	maxMissingConfiguredStorage?: number;
	maxMissingSelfHostedStorage?: number;
	maxRetentionDeleted?: number;
	minAuditExportEvents?: number;
	minConfiguredStorage?: number;
	minProviderKeys?: number;
	requiredControls?: VoiceDataControlStorageSurface['control'][];
	requiredDeletionScopes?: VoiceDataRetentionScope[];
	requiredProviderKeys?: string[];
	requiredRetentionScopes?: VoiceDataRetentionScope[];
	requiredStorage?: string[];
	requireAuditExport?: boolean;
	requireDeletionDryRun?: boolean;
	requireDeletionProof?: boolean;
	requireRedaction?: boolean;
	requireRetentionDryRun?: boolean;
	requireSelfHostedStorage?: boolean;
	requireZeroRetentionAvailable?: boolean;
};

export type VoiceDataControlAssertionReport = {
	auditExportEvents: number;
	configuredStorage: string[];
	controls: VoiceDataControlStorageSurface['control'][];
	deletionDeleted: number;
	deletionDryRun?: boolean;
	deletionScopes: VoiceDataRetentionScope[];
	issues: string[];
	ok: boolean;
	providerKeys: string[];
	redactionEnabled: boolean;
	retentionDeleted: number;
	retentionDryRun: boolean;
	retentionScopes: VoiceDataRetentionScope[];
	selfHostedConfiguredStorage: string[];
	zeroRetentionAvailable: boolean;
};

export type VoiceDataControlRoutesOptions = VoiceDataRetentionStores & {
	audit?: VoiceAuditEventStore;
	auditActor?: VoiceAuditActor;
	auditDeliveries?: VoiceAuditSinkDeliveryStore;
	headers?: HeadersInit;
	name?: string;
	path?: string;
	providerKeys?: VoiceDataControlProviderKeySurface[];
	redact?: import('./trace').VoiceTraceRedactionConfig | boolean;
	title?: string;
	traceDeliveries?: VoiceTraceSinkDeliveryStore;
};

type RetentionRecord = {
	id: string;
	at: number;
};

type RetentionStore<TRecord> = {
	list: () => Promise<TRecord[]> | TRecord[];
	remove: (id: string) => Promise<void> | void;
};

const allRetentionScopes: VoiceDataRetentionScope[] = [
	'auditDeliveries',
	'campaigns',
	'events',
	'incidentBundles',
	'reviews',
	'sessions',
	'tasks',
	'traceDeliveries',
	'traces'
];

const hasRetentionSelector = (
	options: Pick<VoiceDataRetentionPolicy, 'before' | 'beforeOrAt' | 'keepNewest'>,
	scope: VoiceDataRetentionScope
) =>
	typeof options.before === 'number' ||
	typeof options.beforeOrAt === 'number' ||
	typeof options.keepNewest?.[scope] === 'number';

const isRetentionTimeMatch = (
	record: RetentionRecord,
	options: Pick<VoiceDataRetentionPolicy, 'before' | 'beforeOrAt'>
) => {
	if (typeof options.before === 'number' && record.at >= options.before) {
		return false;
	}

	if (typeof options.beforeOrAt === 'number' && record.at > options.beforeOrAt) {
		return false;
	}

	return true;
};

const selectRetentionRecords = (
	records: RetentionRecord[],
	options: Pick<VoiceDataRetentionPolicy, 'before' | 'beforeOrAt' | 'limit'> & {
		keepNewest?: number;
	}
) => {
	let candidates = records
		.filter((record) => isRetentionTimeMatch(record, options))
		.sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));

	if (typeof options.keepNewest === 'number' && options.keepNewest >= 0) {
		const newestIds = new Set(
			[...candidates]
				.sort((left, right) => right.at - left.at || right.id.localeCompare(left.id))
				.slice(0, options.keepNewest)
				.map((record) => record.id)
		);
		candidates = candidates.filter((record) => !newestIds.has(record.id));
	}

	return typeof options.limit === 'number' && options.limit >= 0
		? candidates.slice(0, options.limit)
		: candidates;
};

const reportSkippedScope = (
	scope: VoiceDataRetentionScope,
	dryRun: boolean,
	skippedReason: VoiceDataRetentionScopeReport['skippedReason']
): VoiceDataRetentionScopeReport => ({
	deletedIds: [],
	deletedCount: 0,
	dryRun,
	scannedCount: 0,
	scope,
	skippedReason
});

const runRetentionScope = async <TRecord>(
	input: {
		dryRun: boolean;
		keepNewest?: number;
		scope: VoiceDataRetentionScope;
		store: RetentionStore<TRecord>;
		toRecord: (record: TRecord) => RetentionRecord;
	} & Pick<VoiceDataRetentionPolicy, 'before' | 'beforeOrAt' | 'limit'>
): Promise<VoiceDataRetentionScopeReport> => {
	const records = await input.store.list();
	const selected = selectRetentionRecords(records.map(input.toRecord), {
		before: input.before,
		beforeOrAt: input.beforeOrAt,
		keepNewest: input.keepNewest,
		limit: input.limit
	});

	if (!input.dryRun) {
		await Promise.all(selected.map((record) => input.store.remove(record.id)));
	}

	return {
		deletedIds: selected.map((record) => record.id),
		deletedCount: selected.length,
		dryRun: input.dryRun,
		keepNewest: input.keepNewest,
		scannedCount: records.length,
		scope: input.scope
	};
};

const getCampaignRetentionRecord = (
	record: VoiceCampaignRecord
): RetentionRecord => ({
	at: record.campaign.updatedAt ?? record.campaign.createdAt,
	id: record.campaign.id
});

const getEventRetentionRecord = (
	record: StoredVoiceIntegrationEvent
): RetentionRecord => ({
	at: record.createdAt,
	id: record.id
});

const getIncidentBundleRetentionRecord = (
	record: StoredVoiceIncidentBundleArtifact
): RetentionRecord => ({
	at: record.expiresAt ?? record.createdAt,
	id: record.id
});

const getReviewRetentionRecord = (
	record: StoredVoiceCallReviewArtifact
): RetentionRecord => ({
	at: record.generatedAt ?? 0,
	id: record.id
});

const getSessionRetentionRecord = (
	record: VoiceSessionSummary
): RetentionRecord => ({
	at: record.lastActivityAt ?? record.createdAt,
	id: record.id
});

const getTaskRetentionRecord = (record: StoredVoiceOpsTask): RetentionRecord => ({
	at: record.updatedAt ?? record.createdAt,
	id: record.id
});

const getTraceDeliveryRetentionRecord = (
	record: VoiceTraceSinkDeliveryRecord
): RetentionRecord => ({
	at: record.updatedAt ?? record.createdAt,
	id: record.id
});

const getAuditDeliveryRetentionRecord = (
	record: VoiceAuditSinkDeliveryRecord
): RetentionRecord => ({
	at: record.updatedAt ?? record.createdAt,
	id: record.id
});

const buildTraceRetentionReport = async (
	options: VoiceDataRetentionPolicy & { dryRun: boolean }
): Promise<VoiceDataRetentionScopeReport> => {
	if (!options.traces) {
		return reportSkippedScope('traces', options.dryRun, 'missing-store');
	}

	if (!hasRetentionSelector(options, 'traces')) {
		const events = await options.traces.list(options.traceFilter);
		return {
			deletedIds: [],
			deletedCount: 0,
			dryRun: options.dryRun,
			scannedCount: events.length,
			scope: 'traces',
			skippedReason: 'missing-selector'
		};
	}

	const result = await pruneVoiceTraceEvents({
		before: options.before,
		beforeOrAt: options.beforeOrAt,
		dryRun: options.dryRun,
		filter: options.traceFilter,
		keepNewest: options.keepNewest?.traces,
		limit: options.limit,
		store: options.traces
	});

	return {
		deletedIds: result.deleted.map((event: StoredVoiceTraceEvent) => event.id),
		deletedCount: result.deletedCount,
		dryRun: result.dryRun,
		keepNewest: options.keepNewest?.traces,
		scannedCount: result.scannedCount,
		scope: 'traces'
	};
};

export const applyVoiceDataRetentionPolicy = async (
	options: VoiceDataRetentionPolicy
): Promise<VoiceDataRetentionReport> => {
	const dryRun = Boolean(options.dryRun);
	const scopes = options.scopes ?? allRetentionScopes;
	const reports = await Promise.all(
		scopes.map(async (scope): Promise<VoiceDataRetentionScopeReport> => {
			if (scope === 'traces') {
				return buildTraceRetentionReport({ ...options, dryRun });
			}

			if (!hasRetentionSelector(options, scope)) {
				return reportSkippedScope(scope, dryRun, 'missing-selector');
			}

			const common = {
				before: options.before,
				beforeOrAt: options.beforeOrAt,
				dryRun,
				keepNewest: options.keepNewest?.[scope],
				limit: options.limit,
				scope
			};

			if (scope === 'auditDeliveries') {
				return options.auditDeliveries
					? runRetentionScope({
							...common,
							store: options.auditDeliveries,
							toRecord: getAuditDeliveryRetentionRecord
						})
					: reportSkippedScope(scope, dryRun, 'missing-store');
			}

			if (scope === 'campaigns') {
				return options.campaigns
					? runRetentionScope({
							...common,
							store: options.campaigns,
							toRecord: getCampaignRetentionRecord
						})
					: reportSkippedScope(scope, dryRun, 'missing-store');
			}

			if (scope === 'events') {
				return options.events
					? runRetentionScope({
							...common,
							store: options.events,
							toRecord: getEventRetentionRecord
						})
					: reportSkippedScope(scope, dryRun, 'missing-store');
			}

			if (scope === 'incidentBundles') {
				return options.incidentBundles
					? runRetentionScope({
							...common,
							store: options.incidentBundles,
							toRecord: getIncidentBundleRetentionRecord
						})
					: reportSkippedScope(scope, dryRun, 'missing-store');
			}

			if (scope === 'reviews') {
				return options.reviews
					? runRetentionScope({
							...common,
							store: options.reviews,
							toRecord: getReviewRetentionRecord
						})
					: reportSkippedScope(scope, dryRun, 'missing-store');
			}

			if (scope === 'sessions') {
				const sessions = options.sessions ?? options.session;
				return sessions
					? runRetentionScope({
							...common,
							store: sessions,
							toRecord: getSessionRetentionRecord
						})
					: reportSkippedScope(scope, dryRun, 'missing-store');
			}

			if (scope === 'tasks') {
				return options.tasks
					? runRetentionScope({
							...common,
							store: options.tasks,
							toRecord: getTaskRetentionRecord
						})
					: reportSkippedScope(scope, dryRun, 'missing-store');
			}

			return options.traceDeliveries
				? runRetentionScope({
						...common,
						store: options.traceDeliveries,
						toRecord: getTraceDeliveryRetentionRecord
					})
				: reportSkippedScope(scope, dryRun, 'missing-store');
		})
	);

	const report = {
		checkedAt: Date.now(),
		deletedCount: reports.reduce((total, report) => total + report.deletedCount, 0),
		dryRun,
		scopes: reports
	};

	if (options.audit) {
		await recordVoiceRetentionAuditEvent({
			actor: options.auditActor,
			dryRun,
			report,
			store: options.audit
		});
	}

	return report;
};

export const buildVoiceDataRetentionPlan = (
	options: Omit<VoiceDataRetentionPolicy, 'dryRun'>
) => applyVoiceDataRetentionPolicy({ ...options, dryRun: true });

const getBooleanQuery = (value: unknown) =>
	value === true || value === 'true' || value === '1';

const getNumberQuery = (value: unknown) => {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string'
				? Number(value)
				: undefined;
	return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
};

const parseRetentionScopes = (value: unknown): VoiceDataRetentionScope[] | undefined => {
	if (typeof value !== 'string' || !value.trim()) {
		return undefined;
	}
	const allowed = new Set(allRetentionScopes);
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry): entry is VoiceDataRetentionScope =>
			allowed.has(entry as VoiceDataRetentionScope)
		);
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const buildStorageSurfaces = (
	options: VoiceDataControlRoutesOptions
): VoiceDataControlStorageSurface[] => [
	{
		configured: Boolean(options.session ?? options.sessions),
		control: 'session',
		name: 'Sessions',
		selfHosted: true
	},
	{
		configured: Boolean(options.traces),
		control: 'audit',
		name: 'Trace events',
		selfHosted: true
	},
	{
		configured: Boolean(options.audit),
		control: 'audit',
		name: 'Audit events',
		selfHosted: true
	},
	{
		configured: Boolean(options.reviews),
		control: 'artifact',
		name: 'Call reviews',
		selfHosted: true
	},
	{
		configured: Boolean(options.tasks),
		control: 'workflow',
		name: 'Ops tasks',
		selfHosted: true
	},
	{
		configured: Boolean(options.events),
		control: 'workflow',
		name: 'Integration events',
		selfHosted: true
	},
	{
		configured: Boolean(options.campaigns),
		control: 'workflow',
		name: 'Campaign records',
		selfHosted: true
	},
	{
		configured: Boolean(options.auditDeliveries ?? options.traceDeliveries),
		control: 'queue',
		name: 'Audit/trace delivery queues',
		selfHosted: true
	},
	{
		configured: Boolean(options.incidentBundles),
		control: 'artifact',
		name: 'Incident bundles',
		selfHosted: true
	}
];

const defaultProviderKeys: VoiceDataControlProviderKeySurface[] = [
	{
		env: 'OPENAI_API_KEY',
		name: 'OpenAI',
		recommendation:
			'Keep provider keys server-side, scoped per environment, and never expose them to browser voice clients.',
		required: false
	},
	{
		env: 'ANTHROPIC_API_KEY',
		name: 'Anthropic',
		recommendation:
			'Use least-privilege project keys and route all requests through your AbsoluteJS server.',
		required: false
	},
	{
		env: 'GEMINI_API_KEY',
		name: 'Gemini',
		recommendation:
			'Use server-owned credentials and redact prompts/tool payloads before support export.',
		required: false
	},
	{
		env: 'DEEPGRAM_API_KEY',
		name: 'Deepgram',
		recommendation:
			'Keep STT credentials server-side and pair transcript exports with PII redaction.',
		required: false
	}
];

const resolveDataControlRedaction = (
	redact: VoiceDataControlRoutesOptions['redact']
) =>
	redact === false
		? undefined
		: redact === true || redact === undefined
			? voiceComplianceRedactionDefaults
			: redact;

const uniqueSorted = <Value extends string>(values: Value[]): Value[] =>
	Array.from(new Set(values)).sort();

const findMissing = <Value extends string>(
	values: Value[],
	required: Value[] | undefined
): Value[] => {
	if (!required?.length) {
		return [];
	}
	const valueSet = new Set(values);
	return required.filter((value) => !valueSet.has(value));
};

export const evaluateVoiceDataControlEvidence = (
	report: VoiceDataControlReport,
	input: VoiceDataControlAssertionInput = {}
): VoiceDataControlAssertionReport => {
	const issues: string[] = [];
	const configuredStorage = report.storage
		.filter((surface) => surface.configured)
		.map((surface) => surface.name);
	const selfHostedConfiguredStorage = report.storage
		.filter((surface) => surface.configured && surface.selfHosted)
		.map((surface) => surface.name);
	const controls = uniqueSorted(
		report.storage
			.filter((surface) => surface.configured)
			.map((surface) => surface.control)
	);
	const retentionScopes = uniqueSorted(
		report.retentionPlan.scopes.map((scope) => scope.scope)
	);
	const deletionScopes = uniqueSorted(
		report.deletionProof?.scopes.map((scope) => scope.scope) ?? []
	);
	const providerKeys = uniqueSorted(
		report.providerKeys.map((key) => key.name.toLowerCase())
	);
	const auditExportEvents = report.auditExport?.events.length ?? 0;
	const deletionDeleted = report.deletionProof?.deletedCount ?? 0;
	const maxRetentionDeleted = input.maxRetentionDeleted;
	const maxDeletionDeleted = input.maxDeletionDeleted;
	const requireAuditExport = input.requireAuditExport ?? true;
	const requireDeletionDryRun = input.requireDeletionDryRun ?? true;
	const requireDeletionProof = input.requireDeletionProof ?? false;
	const requireRedaction = input.requireRedaction ?? true;
	const requireRetentionDryRun = input.requireRetentionDryRun ?? true;
	const requireSelfHostedStorage = input.requireSelfHostedStorage ?? true;
	const requireZeroRetentionAvailable = input.requireZeroRetentionAvailable ?? true;

	if (requireRedaction && !report.redaction.enabled) {
		issues.push('Expected data-control redaction to be enabled.');
	}
	if (requireZeroRetentionAvailable && !report.zeroRetentionAvailable) {
		issues.push('Expected zero-retention policy recipe to be available.');
	}
	if (requireAuditExport && !report.auditExport) {
		issues.push('Expected redacted audit export to be available.');
	}
	if (
		input.minAuditExportEvents !== undefined &&
		auditExportEvents < input.minAuditExportEvents
	) {
		issues.push(
			`Expected at least ${String(input.minAuditExportEvents)} audit export events, found ${String(auditExportEvents)}.`
		);
	}
	if (requireRetentionDryRun && !report.retentionPlan.dryRun) {
		issues.push('Expected retention plan to run in dry-run mode.');
	}
	if (
		maxRetentionDeleted !== undefined &&
		report.retentionPlan.deletedCount > maxRetentionDeleted
	) {
		issues.push(
			`Expected retention plan to delete at most ${String(maxRetentionDeleted)} records, found ${String(report.retentionPlan.deletedCount)}.`
		);
	}
	if (requireDeletionProof && !report.deletionProof) {
		issues.push('Expected deletion proof to be present.');
	}
	if (
		report.deletionProof &&
		requireDeletionDryRun &&
		!report.deletionProof.dryRun
	) {
		issues.push('Expected deletion proof to run in dry-run mode.');
	}
	if (
		maxDeletionDeleted !== undefined &&
		deletionDeleted > maxDeletionDeleted
	) {
		issues.push(
			`Expected deletion proof to delete at most ${String(maxDeletionDeleted)} records, found ${String(deletionDeleted)}.`
		);
	}
	if (
		input.minConfiguredStorage !== undefined &&
		configuredStorage.length < input.minConfiguredStorage
	) {
		issues.push(
			`Expected at least ${String(input.minConfiguredStorage)} configured storage surfaces, found ${String(configuredStorage.length)}.`
		);
	}
	if (requireSelfHostedStorage) {
		const nonSelfHostedConfigured = configuredStorage.length - selfHostedConfiguredStorage.length;
		if (
			nonSelfHostedConfigured > (input.maxMissingSelfHostedStorage ?? 0)
		) {
			issues.push(
				`Expected configured storage to be self-hosted, found ${String(nonSelfHostedConfigured)} non-self-hosted surfaces.`
			);
		}
	}
	const missingConfiguredStorage = findMissing(
		configuredStorage,
		input.requiredStorage
	);
	if (missingConfiguredStorage.length > (input.maxMissingConfiguredStorage ?? 0)) {
		issues.push(
			`Missing configured storage surfaces: ${missingConfiguredStorage.join(', ')}.`
		);
	}
	for (const control of findMissing(controls, input.requiredControls)) {
		issues.push(`Missing configured storage control: ${control}.`);
	}
	for (const scope of findMissing(retentionScopes, input.requiredRetentionScopes)) {
		issues.push(`Missing retention scope: ${scope}.`);
	}
	for (const scope of input.requiredRetentionScopes ?? []) {
		const retentionScope = report.retentionPlan.scopes.find(
			(candidate) => candidate.scope === scope
		);
		if (retentionScope?.skippedReason) {
			issues.push(
				`Retention scope ${scope} was skipped: ${retentionScope.skippedReason}.`
			);
		}
	}
	for (const scope of findMissing(deletionScopes, input.requiredDeletionScopes)) {
		issues.push(`Missing deletion-proof scope: ${scope}.`);
	}
	for (const scope of input.requiredDeletionScopes ?? []) {
		const deletionScope = report.deletionProof?.scopes.find(
			(candidate) => candidate.scope === scope
		);
		if (deletionScope?.skippedReason) {
			issues.push(
				`Deletion-proof scope ${scope} was skipped: ${deletionScope.skippedReason}.`
			);
		}
	}
	for (const provider of input.requiredProviderKeys ?? []) {
		if (!providerKeys.includes(provider.toLowerCase())) {
			issues.push(`Missing provider-key guidance: ${provider}.`);
		}
	}
	if (
		input.minProviderKeys !== undefined &&
		providerKeys.length < input.minProviderKeys
	) {
		issues.push(
			`Expected at least ${String(input.minProviderKeys)} provider-key guidance entries, found ${String(providerKeys.length)}.`
		);
	}

	return {
		auditExportEvents,
		configuredStorage: configuredStorage.sort(),
		controls,
		deletionDeleted,
		deletionDryRun: report.deletionProof?.dryRun,
		deletionScopes,
		issues,
		ok: issues.length === 0,
		providerKeys,
		redactionEnabled: report.redaction.enabled,
		retentionDeleted: report.retentionPlan.deletedCount,
		retentionDryRun: report.retentionPlan.dryRun,
		retentionScopes,
		selfHostedConfiguredStorage: selfHostedConfiguredStorage.sort(),
		zeroRetentionAvailable: report.zeroRetentionAvailable
	};
};

export const assertVoiceDataControlEvidence = (
	report: VoiceDataControlReport,
	input: VoiceDataControlAssertionInput = {}
): VoiceDataControlAssertionReport => {
	const assertion = evaluateVoiceDataControlEvidence(report, input);
	if (!assertion.ok) {
		throw new Error(
			`Voice data-control evidence assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
};

export const createVoiceZeroRetentionPolicy = (
	options: VoiceDataRetentionStores & {
		audit?: VoiceAuditEventStore;
		auditActor?: VoiceAuditActor;
		auditDeliveries?: VoiceAuditSinkDeliveryStore;
		beforeOrAt?: number;
		dryRun?: boolean;
		scopes?: VoiceDataRetentionScope[];
		traceDeliveries?: VoiceTraceSinkDeliveryStore;
	}
): VoiceDataRetentionPolicy => ({
	...options,
	beforeOrAt: options.beforeOrAt ?? Date.now(),
	dryRun: options.dryRun ?? true,
	scopes: options.scopes ?? allRetentionScopes
});

export const buildVoiceDataControlReport = async (
	options: VoiceDataControlRoutesOptions & {
		auditFilter?: VoiceAuditEventFilter;
		retention?: Omit<VoiceDataRetentionPolicy, 'dryRun'>;
	}
): Promise<VoiceDataControlReport> => {
	const redaction = resolveDataControlRedaction(options.redact);
	const retentionPlan = await buildVoiceDataRetentionPlan({
		...options,
		...(options.retention ?? {}),
		auditDeliveries: options.auditDeliveries,
		traceDeliveries: options.traceDeliveries
	});
	const auditExport = options.audit
		? await exportVoiceAuditTrail({
				filter: options.auditFilter,
				redact: redaction,
				store: options.audit
			})
		: undefined;

	return {
		auditExport,
		checkedAt: Date.now(),
		redaction: {
			defaults: voiceComplianceRedactionDefaults,
			enabled: Boolean(redaction)
		},
		retentionPlan,
		storage: buildStorageSurfaces(options),
		providerKeys: options.providerKeys ?? defaultProviderKeys,
		zeroRetentionAvailable: true
	};
};

const renderDataRetentionReportRows = (report: VoiceDataRetentionReport) =>
	report.scopes
		.map(
			(scope) =>
				`<tr><td>${escapeHtml(scope.scope)}</td><td>${scope.scannedCount}</td><td>${scope.deletedCount}</td><td>${escapeHtml(scope.skippedReason ?? '')}</td><td><code>${escapeHtml(scope.deletedIds.join(', '))}</code></td></tr>`
		)
		.join('');

export const renderVoiceDataControlHTML = (
	report: VoiceDataControlReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'Voice Data Control';
	const storageRows = report.storage
		.map(
			(surface) =>
				`<tr><td>${escapeHtml(surface.name)}</td><td>${surface.configured ? 'Configured' : 'Missing'}</td><td>${escapeHtml(surface.control)}</td><td>${surface.selfHosted ? 'Yes' : 'No'}</td></tr>`
		)
		.join('');
	const keyRows = report.providerKeys
		.map(
			(key) =>
				`<tr><td>${escapeHtml(key.name)}</td><td><code>${escapeHtml(key.env ?? 'n/a')}</code></td><td>${key.required ? 'Required' : 'Optional'}</td><td>${escapeHtml(key.recommendation)}</td></tr>`
		)
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#f8f7f2;color:#181713;font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.45;margin:2rem}main{max-width:1120px;margin:auto}.summary{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:1rem 0}.card,table{background:white;border:1px solid #ddd6c8;border-radius:14px}.card{padding:1rem}table{border-collapse:collapse;width:100%;overflow:hidden}td,th{border-bottom:1px solid #eee8dc;padding:.7rem;text-align:left;vertical-align:top}code{white-space:pre-wrap;word-break:break-word}a{color:#9a3412}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>Self-hosted data-control proof for retention, redaction, audit export, deletion planning, customer-owned storage, and provider key handling.</p><section class="summary"><div class="card"><strong>Redaction</strong><br>${report.redaction.enabled ? 'enabled' : 'disabled'}</div><div class="card"><strong>Retention dry-run deletes</strong><br>${report.retentionPlan.deletedCount}</div><div class="card"><strong>Audit export events</strong><br>${report.auditExport?.events.length ?? 0}</div><div class="card"><strong>Zero retention recipe</strong><br>${report.zeroRetentionAvailable ? 'available' : 'missing'}</div></section><h2>Customer-Owned Storage</h2><table><thead><tr><th>Surface</th><th>Status</th><th>Control</th><th>Self-hosted</th></tr></thead><tbody>${storageRows}</tbody></table><h2>Retention Plan</h2><table><thead><tr><th>Scope</th><th>Scanned</th><th>Would delete</th><th>Skipped</th><th>Ids</th></tr></thead><tbody>${renderDataRetentionReportRows(report.retentionPlan)}</tbody></table><h2>Provider Keys</h2><table><thead><tr><th>Provider</th><th>Env</th><th>Required</th><th>Recommendation</th></tr></thead><tbody>${keyRows}</tbody></table><p><a href="./data-control/audit.md">Redacted audit Markdown</a> · <a href="./data-control/audit.html">Redacted audit HTML</a></p></main></body></html>`;
};

export const renderVoiceDataControlMarkdown = (
	report: VoiceDataControlReport,
	options: { title?: string } = {}
) => [
		`# ${options.title ?? 'Voice Data Control'}`,
		'',
		`Checked: ${new Date(report.checkedAt).toISOString()}`,
		`Redaction: ${report.redaction.enabled ? 'enabled' : 'disabled'}`,
		`Retention dry-run deletes: ${report.retentionPlan.deletedCount}`,
		`Audit export events: ${report.auditExport?.events.length ?? 0}`,
		'',
		'## Customer-Owned Storage',
		'',
		...report.storage.map(
			(surface) =>
				`- ${surface.name}: ${surface.configured ? 'configured' : 'missing'} (${surface.control})`
		),
		'',
		'## Retention Plan',
		'',
		...report.retentionPlan.scopes.map(
			(scope) =>
				`- ${scope.scope}: scanned ${scope.scannedCount}, would delete ${scope.deletedCount}${scope.skippedReason ? `, skipped=${scope.skippedReason}` : ''}`
		),
		'',
		'## Provider Keys',
		'',
		...report.providerKeys.map(
			(key) =>
				`- ${key.name}${key.env ? ` (${key.env})` : ''}: ${key.recommendation}`
		)
	].join('\n');

const buildRetentionPolicyFromQuery = (
	query: Record<string, unknown>,
	options: VoiceDataControlRoutesOptions
): VoiceDataRetentionPolicy => ({
	...options,
	before: getNumberQuery(query.before),
	beforeOrAt: getNumberQuery(query.beforeOrAt),
	dryRun: !getBooleanQuery(query.apply),
	limit: getNumberQuery(query.limit),
	scopes: parseRetentionScopes(query.scopes),
	traceFilter:
		typeof query.sessionId === 'string' && query.sessionId.trim()
			? { sessionId: query.sessionId }
			: undefined
});

const buildAuditFilterFromQuery = (
	query: Record<string, unknown>
): VoiceAuditEventFilter | undefined => {
	const filter: VoiceAuditEventFilter = {
		after: getNumberQuery(query.auditAfter),
		afterOrAt: getNumberQuery(query.auditAfterOrAt),
		before: getNumberQuery(query.auditBefore),
		beforeOrAt: getNumberQuery(query.auditBeforeOrAt),
		limit: getNumberQuery(query.auditLimit),
		sessionId:
			typeof query.sessionId === 'string' && query.sessionId.trim()
				? query.sessionId
				: undefined
	};

	return Object.values(filter).some((value) => value !== undefined)
		? filter
		: undefined;
};

const parseRetentionPolicyBody = (
	body: unknown,
	options: VoiceDataControlRoutesOptions,
	dryRun: boolean
): VoiceDataRetentionPolicy => {
	const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
	return {
		...options,
		before: getNumberQuery(input.before),
		beforeOrAt: getNumberQuery(input.beforeOrAt),
		dryRun,
		limit: getNumberQuery(input.limit),
		scopes: parseRetentionScopes(input.scopes),
		traceFilter:
			typeof input.sessionId === 'string' && input.sessionId.trim()
				? { sessionId: input.sessionId }
				: undefined
	};
};

export const createVoiceDataControlRoutes = (
	options: VoiceDataControlRoutesOptions
) => {
	const path = options.path ?? '/data-control';
	const title = options.title ?? 'AbsoluteJS Voice Data Control';
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-data-control'
	});

	routes.get(path, async ({ query }) => {
		const report = await buildVoiceDataControlReport({
			auditFilter: buildAuditFilterFromQuery(query),
			...options,
			retention: buildRetentionPolicyFromQuery(query, options)
		});
		return new Response(renderVoiceDataControlHTML(report, { title }), {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				...options.headers
			}
		});
	});
	routes.get(`${path}.json`, async ({ query }) =>
		buildVoiceDataControlReport({
			auditFilter: buildAuditFilterFromQuery(query),
			...options,
			retention: buildRetentionPolicyFromQuery(query, options)
		})
	);
	routes.get(`${path}.md`, async ({ query }) => {
		const report = await buildVoiceDataControlReport({
			auditFilter: buildAuditFilterFromQuery(query),
			...options,
			retention: buildRetentionPolicyFromQuery(query, options)
		});
		return new Response(renderVoiceDataControlMarkdown(report, { title }), {
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				...options.headers
			}
		});
	});
	routes.post(`${path}/retention/plan`, async ({ body }) =>
		buildVoiceDataRetentionPlan(parseRetentionPolicyBody(body, options, true))
	);
	routes.post(`${path}/retention/apply`, async ({ body, set }) => {
		const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
		if (input.confirm !== 'apply-retention-policy') {
			set.status = 400;
			return {
				error:
					'Refusing to apply retention without confirm="apply-retention-policy". Use /retention/plan first.'
			};
		}
		return applyVoiceDataRetentionPolicy(parseRetentionPolicyBody(body, options, false));
	});
	routes.get(`${path}/audit.json`, async () =>
		options.audit
			? exportVoiceAuditTrail({
					redact: resolveDataControlRedaction(options.redact),
					store: options.audit
				})
			: { events: [], exportedAt: Date.now(), redacted: false }
	);
	routes.get(`${path}/audit.md`, async () => {
		const events = options.audit ? await options.audit.list() : [];
		return new Response(
			renderVoiceAuditMarkdown(events, {
				redact: resolveDataControlRedaction(options.redact),
				title: `${title} Audit Export`
			}),
			{
				headers: {
					'Content-Type': 'text/markdown; charset=utf-8',
					...options.headers
				}
			}
		);
	});
	routes.get(`${path}/audit.html`, async () => {
		const events = options.audit ? await options.audit.list() : [];
		return new Response(
			renderVoiceAuditHTML(events, {
				redact: resolveDataControlRedaction(options.redact),
				title: `${title} Audit Export`
			}),
			{
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					...options.headers
				}
			}
		);
	});

	return routes;
};
