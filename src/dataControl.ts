import type { VoiceCampaignRecord, VoiceCampaignStore } from './campaign';
import {
	recordVoiceRetentionAuditEvent,
	type VoiceAuditActor,
	type VoiceAuditEventStore
} from './audit';
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

export type VoiceDataRetentionScope =
	| 'auditDeliveries'
	| 'campaigns'
	| 'events'
	| 'reviews'
	| 'sessions'
	| 'tasks'
	| 'traceDeliveries'
	| 'traces';

export type VoiceDataRetentionStores = {
	campaigns?: VoiceCampaignStore;
	events?: VoiceIntegrationEventStore;
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
