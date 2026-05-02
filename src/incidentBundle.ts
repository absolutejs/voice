import { Elysia } from 'elysia';
import {
	redactVoiceAuditEvents,
	renderVoiceAuditMarkdown
} from './auditExport';
import {
	buildVoiceOperationsRecord,
	renderVoiceOperationsRecordGuardrailMarkdown,
	type VoiceOperationsRecord,
	type VoiceOperationsRecordOptions
} from './operationsRecord';
import type { VoiceIncidentRecoveryOutcomeReport } from './incidentTimeline';
import {
	redactVoiceTraceEvents,
	redactVoiceTraceText,
	renderVoiceTraceMarkdown,
	type StoredVoiceTraceEvent,
	type VoiceTraceRedactionConfig
} from './trace';

export type VoiceIncidentBundleFormat = 'json' | 'markdown';

export type VoiceIncidentBundle = {
	auditMarkdown?: string;
	exportedAt: number;
	formatVersion: 1;
	markdown: string;
	record: VoiceOperationsRecord;
	recoveryOutcomes?: VoiceIncidentRecoveryOutcomeReport;
	redacted: boolean;
	sessionId: string;
	summary: VoiceIncidentBundleSummary;
	traceMarkdown: string;
};

export type StoredVoiceIncidentBundleArtifact = {
	bundle: VoiceIncidentBundle;
	createdAt: number;
	expiresAt?: number;
	id: string;
	metadata?: Record<string, unknown>;
	redacted: boolean;
	sessionId: string;
};

export type VoiceIncidentBundleStoreFilter = {
	expiredAt?: number;
	sessionId?: string;
};

export type VoiceIncidentBundleStore<
	TArtifact extends StoredVoiceIncidentBundleArtifact = StoredVoiceIncidentBundleArtifact
> = {
	get: (id: string) => Promise<TArtifact | undefined> | TArtifact | undefined;
	list: (
		filter?: VoiceIncidentBundleStoreFilter
	) => Promise<TArtifact[]> | TArtifact[];
	remove: (id: string) => Promise<void> | void;
	set: (id: string, artifact: TArtifact) => Promise<void> | void;
};

export type VoiceIncidentBundleSummary = {
	auditEvents: number;
	durationMs?: number;
	errors: number;
	handoffs: number;
	providers: string[];
	sessionId: string;
	status: VoiceOperationsRecord['status'];
	tools: number;
	traceEvents: number;
	turns: number;
};

export type VoiceIncidentBundleOptions = VoiceOperationsRecordOptions & {
	redact?: VoiceTraceRedactionConfig;
	recoveryOutcomes?: VoiceIncidentRecoveryOutcomeReport;
	title?: string;
};

export type VoiceIncidentBundleRoutesOptions = Omit<
	VoiceIncidentBundleOptions,
	'sessionId'
> & {
	headers?: HeadersInit;
	markdownPath?: false | string;
	name?: string;
	path?: string;
};

export type VoiceIncidentBundleArtifactOptions = {
	createdAt?: number;
	expiresAt?: number;
	id?: string;
	metadata?: Record<string, unknown>;
	ttlMs?: number;
};

export type VoiceIncidentBundleRetentionOptions = {
	before?: number;
	beforeOrAt?: number;
	dryRun?: boolean;
	expiredAt?: number;
	keepNewest?: number;
	limit?: number;
	store: VoiceIncidentBundleStore;
};

export type VoiceIncidentBundleRetentionReport = {
	deleted: StoredVoiceIncidentBundleArtifact[];
	deletedCount: number;
	deletedIds: string[];
	dryRun: boolean;
	scannedCount: number;
};

const filterIncidentBundleArtifacts = <
	TArtifact extends StoredVoiceIncidentBundleArtifact
>(
	artifacts: TArtifact[],
	filter: VoiceIncidentBundleStoreFilter = {}
) =>
	artifacts
		.filter((artifact) => {
			if (filter.sessionId && artifact.sessionId !== filter.sessionId) {
				return false;
			}
			if (
				typeof filter.expiredAt === 'number' &&
				(artifact.expiresAt === undefined || artifact.expiresAt > filter.expiredAt)
			) {
				return false;
			}
			return true;
		})
		.sort(
			(left, right) =>
				right.createdAt - left.createdAt || left.id.localeCompare(right.id)
		);

export const createVoiceMemoryIncidentBundleStore = <
	TArtifact extends StoredVoiceIncidentBundleArtifact = StoredVoiceIncidentBundleArtifact
>(): VoiceIncidentBundleStore<TArtifact> => {
	const artifacts = new Map<string, TArtifact>();
	return {
		get: (id) => artifacts.get(id),
		list: (filter) => filterIncidentBundleArtifacts([...artifacts.values()], filter),
		remove: (id) => {
			artifacts.delete(id);
		},
		set: (id, artifact) => {
			artifacts.set(id, {
				...artifact,
				id
			});
		}
	};
};

export const createStoredVoiceIncidentBundleArtifact = (
	bundle: VoiceIncidentBundle,
	options: VoiceIncidentBundleArtifactOptions = {}
): StoredVoiceIncidentBundleArtifact => {
	const createdAt = options.createdAt ?? Date.now();
	return {
		bundle,
		createdAt,
		expiresAt:
			options.expiresAt ??
			(typeof options.ttlMs === 'number' ? createdAt + options.ttlMs : undefined),
		id:
			options.id ??
			`voice-incident:${bundle.sessionId}:${bundle.exportedAt}:${crypto.randomUUID()}`,
		metadata: options.metadata,
		redacted: bundle.redacted,
		sessionId: bundle.sessionId
	};
};

export const saveVoiceIncidentBundleArtifact = async (input: {
	bundle: VoiceIncidentBundle;
	options?: VoiceIncidentBundleArtifactOptions;
	store: VoiceIncidentBundleStore;
}) => {
	const artifact = createStoredVoiceIncidentBundleArtifact(
		input.bundle,
		input.options
	);
	await input.store.set(artifact.id, artifact);
	return artifact;
};

const retentionTimeMatch = (
	artifact: StoredVoiceIncidentBundleArtifact,
	options: Pick<VoiceIncidentBundleRetentionOptions, 'before' | 'beforeOrAt' | 'expiredAt'>
) => {
	if (
		typeof options.expiredAt === 'number' &&
		(artifact.expiresAt === undefined || artifact.expiresAt > options.expiredAt)
	) {
		return false;
	}
	if (typeof options.before === 'number' && artifact.createdAt >= options.before) {
		return false;
	}
	if (
		typeof options.beforeOrAt === 'number' &&
		artifact.createdAt > options.beforeOrAt
	) {
		return false;
	}
	return true;
};

export const pruneVoiceIncidentBundleArtifacts = async (
	options: VoiceIncidentBundleRetentionOptions
): Promise<VoiceIncidentBundleRetentionReport> => {
	const dryRun = Boolean(options.dryRun);
	const artifacts = await options.store.list();
	let selected = artifacts
		.filter((artifact) => retentionTimeMatch(artifact, options))
		.sort(
			(left, right) =>
				left.createdAt - right.createdAt || left.id.localeCompare(right.id)
		);

	if (typeof options.keepNewest === 'number' && options.keepNewest >= 0) {
		const newest = new Set(
			[...selected]
				.sort(
					(left, right) =>
						right.createdAt - left.createdAt || right.id.localeCompare(left.id)
				)
				.slice(0, options.keepNewest)
				.map((artifact) => artifact.id)
		);
		selected = selected.filter((artifact) => !newest.has(artifact.id));
	}
	if (typeof options.limit === 'number' && options.limit >= 0) {
		selected = selected.slice(0, options.limit);
	}

	if (!dryRun) {
		await Promise.all(selected.map((artifact) => options.store.remove(artifact.id)));
	}

	return {
		deleted: selected,
		deletedCount: selected.length,
		deletedIds: selected.map((artifact) => artifact.id),
		dryRun,
		scannedCount: artifacts.length
	};
};

const buildSummary = (
	record: VoiceOperationsRecord
): VoiceIncidentBundleSummary => ({
	auditEvents: record.audit?.total ?? 0,
	durationMs: record.summary.callDurationMs,
	errors: record.summary.errorCount,
	handoffs: record.handoffs.length,
	providers: record.providers.map((provider) => provider.provider),
	sessionId: record.sessionId,
	status: record.status,
	tools: record.tools.length,
	traceEvents: record.traceEvents.length,
	turns: record.summary.turnCount
});

const renderIncidentMarkdown = (input: {
	auditMarkdown?: string;
	record: VoiceOperationsRecord;
	recoveryOutcomes?: VoiceIncidentRecoveryOutcomeReport;
	summary: VoiceIncidentBundleSummary;
	title?: string;
	traceMarkdown: string;
}) => {
	const recoveryOutcomes = input.recoveryOutcomes;
	const lines = [
		`# ${input.title ?? `Voice Incident ${input.summary.sessionId}`}`,
		'',
		`Session: ${input.summary.sessionId}`,
		`Status: ${input.summary.status}`,
		`Trace events: ${input.summary.traceEvents}`,
		`Audit events: ${input.summary.auditEvents}`,
		`Turns: ${input.summary.turns}`,
		`Errors: ${input.summary.errors}`,
		`Handoffs: ${input.summary.handoffs}`,
		`Tools: ${input.summary.tools}`,
		`Providers: ${input.summary.providers.join(', ') || 'none'}`,
		input.summary.durationMs === undefined
			? undefined
			: `Duration: ${input.summary.durationMs}ms`,
		'',
		'## Outcome',
		'',
		`- Assistant replies: ${input.record.outcome.assistantReplies}`,
		`- Complete: ${input.record.outcome.complete ? 'yes' : 'no'}`,
		`- Escalated: ${input.record.outcome.escalated ? 'yes' : 'no'}`,
		`- Transferred: ${input.record.outcome.transferred ? 'yes' : 'no'}`,
		`- Voicemail: ${input.record.outcome.voicemail ? 'yes' : 'no'}`,
		`- No answer: ${input.record.outcome.noAnswer ? 'yes' : 'no'}`,
		'',
		'## Handoffs',
		'',
		...(input.record.handoffs.length
			? input.record.handoffs.map(
					(handoff) =>
						`- ${handoff.fromAgentId ?? 'unknown'} -> ${handoff.targetAgentId ?? 'unknown'} ${handoff.status ?? ''} ${handoff.summary ?? handoff.reason ?? ''}`.trim()
				)
			: ['- none']),
		'',
		'## Tools',
		'',
		...(input.record.tools.length
			? input.record.tools.map(
					(tool) =>
						`- ${tool.toolName ?? 'tool'} ${tool.status ?? ''} ${tool.elapsedMs === undefined ? '' : `${tool.elapsedMs}ms`} ${tool.error ?? ''}`.trim()
				)
			: ['- none']),
		'',
		'## Recovery Outcomes',
		'',
		...(recoveryOutcomes
			? [
					`- Improved: ${recoveryOutcomes.improved}`,
					`- Unchanged: ${recoveryOutcomes.unchanged}`,
					`- Regressed: ${recoveryOutcomes.regressed}`,
					`- Failed: ${recoveryOutcomes.failed}`,
					`- Total actions: ${recoveryOutcomes.total}`,
					'',
					...(recoveryOutcomes.entries.length
						? recoveryOutcomes.entries.map(
								(entry) =>
									`- ${entry.outcome}: ${entry.actionId} ${entry.beforeStatus ?? 'unknown'} -> ${entry.afterStatus ?? 'unknown'}${entry.detail ? ` - ${entry.detail}` : ''}`
							)
						: ['- no recovery actions recorded'])
				]
			: ['- no recovery outcome report attached']),
		'',
		renderVoiceOperationsRecordGuardrailMarkdown(input.record),
		'',
		'## Trace Evidence',
		'',
		input.traceMarkdown,
		''
	].filter((line): line is string => line !== undefined);

	if (input.auditMarkdown) {
		lines.push('## Audit Evidence', '', input.auditMarkdown);
	}

	return lines.join('\n');
};

const redactRecordValue = (
	value: unknown,
	redactedEvents: StoredVoiceTraceEvent[],
	redact?: VoiceTraceRedactionConfig
): unknown => {
	if (!redact) {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((item) => redactRecordValue(item, redactedEvents, redact));
	}

	if (typeof value === 'string') {
		return redactVoiceTraceText(value, redact);
	}

	if (typeof value === 'object' && value) {
		return Object.fromEntries(
			Object.entries(value).map(([key, entryValue]) => [
				key,
				key === 'events' || key === 'traceEvents'
					? redactedEvents
					: redactRecordValue(entryValue, redactedEvents, redact)
			])
		);
	}

	return value;
};

const redactOperationsRecord = (
	record: VoiceOperationsRecord,
	input: {
		auditEvents?: VoiceOperationsRecord['audit'] extends infer TAudit
			? TAudit extends { events: infer TEvents }
				? TEvents
				: never
			: never;
		redact?: VoiceTraceRedactionConfig;
		traceEvents: StoredVoiceTraceEvent[];
	}
): VoiceOperationsRecord => ({
	...(redactRecordValue(
		record,
		input.traceEvents,
		input.redact
	) as VoiceOperationsRecord),
	audit: record.audit
		? {
				...record.audit,
				events: input.auditEvents ?? []
			}
		: undefined,
	traceEvents: input.traceEvents
});

export const buildVoiceIncidentBundle = async (
	options: VoiceIncidentBundleOptions
): Promise<VoiceIncidentBundle> => {
	const record = await buildVoiceOperationsRecord(options);
	const redactedTraceEvents = options.redact
		? redactVoiceTraceEvents(record.traceEvents, options.redact)
		: record.traceEvents;
	const redactedAuditEvents =
		options.redact && record.audit
			? redactVoiceAuditEvents(record.audit.events, options.redact)
			: record.audit?.events;
	const redactedRecord = redactOperationsRecord(record, {
		auditEvents: redactedAuditEvents,
		redact: options.redact,
		traceEvents: redactedTraceEvents
	});
	const summary = buildSummary(redactedRecord);
	const recoveryOutcomes = options.recoveryOutcomes
		? (redactRecordValue(
				options.recoveryOutcomes,
				redactedTraceEvents,
				options.redact
			) as VoiceIncidentRecoveryOutcomeReport)
		: undefined;
	const traceMarkdown = renderVoiceTraceMarkdown(record.traceEvents, {
		evaluation: options.evaluation,
		redact: options.redact,
		title: `Voice Incident Trace ${options.sessionId}`
	});
	const auditMarkdown = record.audit
		? renderVoiceAuditMarkdown(record.audit.events, {
				redact: options.redact,
				title: `Voice Incident Audit ${options.sessionId}`
			})
		: undefined;
	const markdown = renderIncidentMarkdown({
		auditMarkdown,
		record: redactedRecord,
		recoveryOutcomes,
		summary,
		title: options.title,
		traceMarkdown
	});

	return {
		auditMarkdown,
		exportedAt: Date.now(),
		formatVersion: 1,
		markdown,
		record: redactedRecord,
		recoveryOutcomes,
		redacted: Boolean(options.redact),
		sessionId: options.sessionId,
		summary,
		traceMarkdown
	};
};

export const createVoiceIncidentBundleRoutes = (
	options: VoiceIncidentBundleRoutesOptions
) => {
	const path = options.path ?? '/api/voice-incidents/:sessionId';
	const markdownPath =
		options.markdownPath === undefined
			? '/voice-incidents/:sessionId/markdown'
			: options.markdownPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-incident-bundle'
	});
	const getSessionId = (params: Record<string, string | undefined>) =>
		params.sessionId ?? '';
	const buildBundle = (sessionId: string) =>
		buildVoiceIncidentBundle({
			audit: options.audit,
			evaluation: options.evaluation,
			events: options.events,
			redact: options.redact,
			sessionId,
			store: options.store,
			title: options.title
		});

	routes.get(path, async ({ params }: { params: Record<string, string | undefined> }) =>
		Response.json(await buildBundle(getSessionId(params)), {
			headers: options.headers
		})
	);

	if (markdownPath) {
		routes.get(
			markdownPath,
			async ({ params }: { params: Record<string, string | undefined> }) => {
				const bundle = await buildBundle(getSessionId(params));
				return new Response(bundle.markdown, {
					headers: {
						'Content-Type': 'text/markdown; charset=utf-8',
						...options.headers
					}
				});
			}
		);
	}

	return routes;
};
