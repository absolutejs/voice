import { Elysia } from 'elysia';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
	filterVoiceAuditEvents,
	type StoredVoiceAuditEvent,
	type VoiceAuditEventFilter,
	type VoiceAuditEventStore
} from './audit';
import type {
	VoiceObservabilityExportArtifact,
	VoiceObservabilityExportReport
} from './observabilityExport';
import type { VoiceCallDebuggerReport } from './callDebugger';
import type { VoiceOperationsRecord } from './operationsRecord';
import type { VoiceProductionReadinessReport } from './productionReadiness';
import type { VoiceProviderSloReport } from './providerSlo';
import type { VoiceSessionSnapshot } from './sessionSnapshot';
import {
	filterVoiceTraceEvents,
	type StoredVoiceTraceEvent,
	type VoiceTraceEventFilter,
	type VoiceTraceEventStore,
	type VoiceTraceSinkDeliveryRecord,
	type VoiceTraceSinkDeliveryStore
} from './trace';

export type VoiceProofPackStatus = 'fail' | 'pass' | 'warn';

export type VoiceProofPackEvidence = {
	detail?: string;
	href?: string;
	label: string;
	status?: VoiceProofPackStatus;
	value?: number | string;
};

export type VoiceProofPackSection = {
	evidence?: VoiceProofPackEvidence[];
	status?: VoiceProofPackStatus;
	summary?: string;
	title: string;
};

export type VoiceProofPack = {
	artifacts: VoiceObservabilityExportArtifact[];
	generatedAt: string;
	ok: boolean;
	outputDir?: string;
	runId: string;
	sections: VoiceProofPackSection[];
	status: VoiceProofPackStatus;
	summary: {
		fail: number;
		pass: number;
		sections: number;
		warn: number;
	};
};

export type VoiceProofPackInput = {
	artifacts?: VoiceObservabilityExportArtifact[];
	callDebuggerReports?: VoiceCallDebuggerReport[];
	generatedAt?: number | string;
	observabilityExport?: VoiceObservabilityExportReport;
	operationsRecords?: VoiceOperationsRecord[];
	outputDir?: string;
	productionReadiness?: VoiceProductionReadinessReport;
	providerSlo?: VoiceProviderSloReport;
	runId?: string;
	sections?: VoiceProofPackSection[];
	sessionSnapshots?: VoiceSessionSnapshot[];
};

export type VoiceProofPackWriteResult = {
	artifacts: VoiceObservabilityExportArtifact[];
	jsonPath: string;
	markdownPath: string;
	proofPack: VoiceProofPack;
};

export type VoiceProofPackBuildTiming = {
	durationMs: number;
	endedAt: number;
	label: string;
	startedAt: number;
};

export type VoiceProofPackBuildContext = {
	cache: <TValue>(
		key: string,
		loader: () => Promise<TValue> | TValue
	) => Promise<TValue>;
	clear: (key?: string) => void;
	getTimings: () => VoiceProofPackBuildTiming[];
	time: <TValue>(
		label: string,
		run: () => Promise<TValue> | TValue
	) => Promise<TValue>;
};

export type VoiceProofPackBuildContextOptions = {
	now?: () => number;
	onTiming?: (timing: VoiceProofPackBuildTiming) => void;
};

export type VoiceProofRefreshSnapshotOptions = {
	audit?: VoiceAuditEventStore;
	auditFilter?: VoiceAuditEventFilter;
	auditSinkDeliveries?: {
		list: () => Promise<unknown[]> | unknown[];
	};
	events?: StoredVoiceTraceEvent[];
	traceDeliveries?: VoiceTraceSinkDeliveryStore;
	traceFilter?: VoiceTraceEventFilter;
	traceStore?: VoiceTraceEventStore;
};

export type VoiceProofRefreshSnapshot = {
	auditEvents: StoredVoiceAuditEvent[];
	auditStore: VoiceAuditEventStore;
	auditSinkDeliveries: unknown[];
	capturedAt: number;
	traceDeliveries: VoiceTraceSinkDeliveryRecord[];
	traceDeliveryStore: VoiceTraceSinkDeliveryStore;
	traceEvents: StoredVoiceTraceEvent[];
	traceStore: VoiceTraceEventStore;
};

export type VoiceProofPackInputBuilderSupportBundle = {
	callDebuggerReports?: VoiceCallDebuggerReport[];
	sessionSnapshots?: VoiceSessionSnapshot[];
};

export type VoiceProofPackInputBuilderLoaderInput = {
	context: VoiceProofPackBuildContext;
};

export type VoiceProofPackInputBuilderOperationsLoaderInput =
	VoiceProofPackInputBuilderLoaderInput & {
		supportBundle?: VoiceProofPackInputBuilderSupportBundle;
	};

export type VoiceProofPackInputBuilderOptions = Omit<
	VoiceProofPackInput,
	| 'callDebuggerReports'
	| 'observabilityExport'
	| 'operationsRecords'
	| 'productionReadiness'
	| 'providerSlo'
	| 'sessionSnapshots'
> & {
	callDebuggerReports?: VoiceCallDebuggerReport[];
	context?: VoiceProofPackBuildContext;
	loadObservabilityExport?: (
		input: VoiceProofPackInputBuilderLoaderInput
	) => Promise<VoiceObservabilityExportReport> | VoiceObservabilityExportReport;
	loadOperationsRecords?: (
		input: VoiceProofPackInputBuilderOperationsLoaderInput
	) => Promise<VoiceOperationsRecord[]> | VoiceOperationsRecord[];
	loadProductionReadiness?: (
		input: VoiceProofPackInputBuilderLoaderInput
	) => Promise<VoiceProductionReadinessReport> | VoiceProductionReadinessReport;
	loadProviderSlo?: (
		input: VoiceProofPackInputBuilderLoaderInput
	) => Promise<VoiceProviderSloReport> | VoiceProviderSloReport;
	loadSupportBundle?: (
		input: VoiceProofPackInputBuilderLoaderInput
	) =>
		| Promise<VoiceProofPackInputBuilderSupportBundle>
		| VoiceProofPackInputBuilderSupportBundle;
	operationsRecords?: VoiceOperationsRecord[];
	sessionSnapshots?: VoiceSessionSnapshot[];
};

export type VoiceProofPackSourceValue = VoiceProofPack | VoiceProofPackInput;

export type VoiceProofPackStaleWhileRefreshSourceOptions = {
	maxAgeMs?: number;
	now?: () => number;
	onRefreshError?: (error: unknown) => void;
	read: () => VoiceProofPackSourceValue | Promise<VoiceProofPackSourceValue>;
	refresh: () =>
		| VoiceProofPackSourceValue
		| void
		| Promise<VoiceProofPackSourceValue | void>;
};

export type VoiceProofPackRefreshState =
	| 'failed'
	| 'fresh'
	| 'missing'
	| 'refreshing'
	| 'stale';

export type VoiceProofPackRefreshStatus = {
	ageMs?: number;
	error?: string;
	generatedAt?: string;
	lastRefreshCompletedAt?: number;
	lastRefreshStartedAt?: number;
	maxAgeMs: number;
	refreshing: boolean;
	runId?: string;
	state: VoiceProofPackRefreshState;
};

export type VoiceProofPackStaleWhileRefreshSource = ((
	...args: []
) => Promise<VoiceProofPackSourceValue>) & {
	getStatus: () => VoiceProofPackRefreshStatus;
};

export type VoiceProofPackRoutesOptions = {
	headers?: HeadersInit;
	jsonPath?: false | string;
	markdownPath?: false | string;
	name?: string;
	source:
		| VoiceProofPackSourceValue
		| (() => VoiceProofPackSourceValue | Promise<VoiceProofPackSourceValue>);
};

const toGeneratedAt = (value: number | string | undefined) =>
	value === undefined
		? new Date().toISOString()
		: typeof value === 'number'
			? new Date(value).toISOString()
			: value;

const getProofPackMetadata = (proofPack: VoiceProofPackSourceValue) => {
	const built = buildVoiceProofPack(proofPack);
	const generatedAt = built.generatedAt;
	const generatedAtMs = Date.parse(generatedAt);
	return {
		generatedAt,
		generatedAtMs: Number.isFinite(generatedAtMs) ? generatedAtMs : 0,
		runId: built.runId
	};
};

const summarizeProofPackSections = (sections: VoiceProofPackSection[]) => {
	let pass = 0;
	let warn = 0;
	let fail = 0;

	for (const section of sections) {
		const statuses = [
			section.status,
			...(section.evidence ?? []).map((evidence) => evidence.status)
		].filter((status): status is VoiceProofPackStatus => Boolean(status));
		if (statuses.some((status) => status === 'fail')) {
			fail += 1;
		} else if (statuses.some((status) => status === 'warn')) {
			warn += 1;
		} else {
			pass += 1;
		}
	}

	return { fail, pass, sections: sections.length, warn };
};

export const createVoiceProofPackBuildContext = (
	options: VoiceProofPackBuildContextOptions = {}
): VoiceProofPackBuildContext => {
	const now = options.now ?? Date.now;
	const cachedValues = new Map<string, Promise<unknown>>();
	const timings: VoiceProofPackBuildTiming[] = [];

	const time: VoiceProofPackBuildContext['time'] = async (label, run) => {
		const startedAt = now();
		try {
			return await run();
		} finally {
			const endedAt = now();
			const timing = {
				durationMs: Math.max(0, endedAt - startedAt),
				endedAt,
				label,
				startedAt
			};
			timings.push(timing);
			options.onTiming?.(timing);
		}
	};

	const cache: VoiceProofPackBuildContext['cache'] = (key, loader) => {
		const cached = cachedValues.get(key);
		if (cached) {
			return cached as Promise<Awaited<ReturnType<typeof loader>>>;
		}

		const value = Promise.resolve(loader());
		cachedValues.set(key, value);
		return value as Promise<Awaited<ReturnType<typeof loader>>>;
	};

	return {
		cache,
		clear: (key) => {
			if (key === undefined) {
				cachedValues.clear();
				return;
			}
			cachedValues.delete(key);
		},
		getTimings: () => [...timings],
		time
	};
};

const createSnapshotTraceStore = (
	events: StoredVoiceTraceEvent[]
): VoiceTraceEventStore => ({
	append: async () => {
		throw new Error('Voice proof refresh snapshot trace store is read-only.');
	},
	get: async (id) => events.find((event) => event.id === id),
	list: async (filter) => filterVoiceTraceEvents([...events], filter),
	remove: async () => {
		throw new Error('Voice proof refresh snapshot trace store is read-only.');
	}
});

const createSnapshotAuditStore = (
	events: StoredVoiceAuditEvent[]
): VoiceAuditEventStore => ({
	append: async () => {
		throw new Error('Voice proof refresh snapshot audit store is read-only.');
	},
	get: async (id) => events.find((event) => event.id === id),
	list: async (filter) => filterVoiceAuditEvents([...events], filter)
});

const createSnapshotTraceDeliveryStore = (
	deliveries: VoiceTraceSinkDeliveryRecord[]
): VoiceTraceSinkDeliveryStore => ({
	get: async (id) => deliveries.find((delivery) => delivery.id === id),
	list: async () => [...deliveries],
	remove: async () => {
		throw new Error('Voice proof refresh snapshot delivery store is read-only.');
	},
	set: async () => {
		throw new Error('Voice proof refresh snapshot delivery store is read-only.');
	}
});

export const createVoiceProofRefreshSnapshot = async (
	options: VoiceProofRefreshSnapshotOptions = {}
): Promise<VoiceProofRefreshSnapshot> => {
	const [traceEvents, auditEvents, traceDeliveries, auditSinkDeliveries] =
		await Promise.all([
			options.events ??
				(await options.traceStore?.list(options.traceFilter)) ??
				[],
			options.audit ? await options.audit.list(options.auditFilter) : [],
			options.traceDeliveries ? await options.traceDeliveries.list() : [],
			options.auditSinkDeliveries ? await options.auditSinkDeliveries.list() : []
		]);

	return {
		auditEvents,
		auditSinkDeliveries,
		auditStore: createSnapshotAuditStore(auditEvents),
		capturedAt: Date.now(),
		traceDeliveries,
		traceDeliveryStore: createSnapshotTraceDeliveryStore(traceDeliveries),
		traceEvents,
		traceStore: createSnapshotTraceStore(traceEvents)
	};
};

export const buildVoiceProofPackInput = async (
	options: VoiceProofPackInputBuilderOptions
): Promise<VoiceProofPackInput> => {
	const context = options.context ?? createVoiceProofPackBuildContext();
	const loaderInput = { context };
	const [productionReadiness, providerSlo, supportBundle, observabilityExport] =
		await Promise.all([
			options.loadProductionReadiness
				? context.time('productionReadiness', () =>
						options.loadProductionReadiness?.(loaderInput)
					)
				: undefined,
			options.loadProviderSlo
				? context.time('providerSlo', () => options.loadProviderSlo?.(loaderInput))
				: undefined,
			options.loadSupportBundle
				? context.time('supportBundle', () =>
						options.loadSupportBundle?.(loaderInput)
					)
				: undefined,
			options.loadObservabilityExport
				? context.time('observabilityExport', () =>
						options.loadObservabilityExport?.(loaderInput)
					)
				: undefined
		]);
	const operationsRecords = options.loadOperationsRecords
		? await context.time('operationsRecords', () =>
				options.loadOperationsRecords?.({
					context,
					supportBundle
				})
			)
		: options.operationsRecords;

	return {
		artifacts: options.artifacts,
		callDebuggerReports:
			supportBundle?.callDebuggerReports ?? options.callDebuggerReports,
		generatedAt: options.generatedAt,
		observabilityExport,
		operationsRecords,
		outputDir: options.outputDir,
		productionReadiness,
		providerSlo,
		runId: options.runId,
		sections: options.sections,
		sessionSnapshots: supportBundle?.sessionSnapshots ?? options.sessionSnapshots
	};
};

const toProofPackStatus = (status: string | undefined): VoiceProofPackStatus => {
	if (status === 'fail' || status === 'failed') {
		return 'fail';
	}
	if (
		status === 'warn' ||
		status === 'warning' ||
		status === 'degraded' ||
		status === 'stale'
	) {
		return 'warn';
	}
	return 'pass';
};

const numberEvidence = (
	label: string,
	value: number | undefined,
	options: {
		failWhenPositive?: boolean;
		passWhenPositive?: boolean;
	} = {}
): VoiceProofPackEvidence => {
	const safeValue = value ?? 0;
	const status = options.failWhenPositive
		? safeValue > 0
			? 'fail'
			: 'pass'
		: options.passWhenPositive
			? safeValue > 0
				? 'pass'
				: 'warn'
			: 'pass';

	return {
		label,
		status,
		value: safeValue
	};
};

export const createVoiceProofPackProviderSloSection = (
	report: VoiceProviderSloReport,
	options: {
		href?: string;
		title?: string;
	} = {}
): VoiceProofPackSection => ({
	evidence: [
		{
			href: options.href,
			label: 'Provider SLO status',
			status: toProofPackStatus(report.status),
			value: report.status
		},
		numberEvidence('Provider routing events', report.events, {
			passWhenPositive: true
		}),
		numberEvidence('Latency samples', report.eventsWithLatency, {
			passWhenPositive: true
		}),
		numberEvidence('Provider SLO issues', report.issues.length, {
			failWhenPositive: true
		})
	],
	status: toProofPackStatus(report.status),
	summary:
		'Provider latency, timeout, fallback, and unresolved error evidence.',
	title: options.title ?? 'Provider SLO'
});

export const createVoiceProofPackProductionReadinessSection = (
	report: VoiceProductionReadinessReport,
	options: {
		title?: string;
	} = {}
): VoiceProofPackSection => {
	const checkFailures = report.checks.filter(
		(check) => check.status === 'fail'
	).length;
	const checkWarnings = report.checks.filter(
		(check) => check.status === 'warn'
	).length;

	return {
		evidence: [
			{
				label: 'Production readiness status',
				status: toProofPackStatus(report.status),
				value: report.status
			},
			numberEvidence('Readiness checks', report.checks.length, {
				passWhenPositive: true
			}),
			numberEvidence('Failed readiness checks', checkFailures, {
				failWhenPositive: true
			}),
			{
				label: 'Warning readiness checks',
				status: checkWarnings > 0 ? 'warn' : 'pass',
				value: checkWarnings
			},
			...(report.summary.providerSlo
				? [
						{
							href: report.links.providerSlo,
							label: 'Provider SLO samples',
							status: toProofPackStatus(report.summary.providerSlo.status),
							value: report.summary.providerSlo.eventsWithLatency
						}
					]
				: []),
			...(report.summary.traceDeliveries
				? [
						{
							href: report.links.traceDeliveries,
							label: 'Trace delivery status',
							status: toProofPackStatus(report.summary.traceDeliveries.status),
							value: report.summary.traceDeliveries.pending
						}
					]
				: [])
		],
		status: toProofPackStatus(report.status),
		summary: 'Production readiness gates and linked proof surfaces.',
		title: options.title ?? 'Production readiness'
	};
};

export const createVoiceProofPackOperationsRecordSection = (
	records: readonly VoiceOperationsRecord[],
	options: {
		href?: (sessionId: string) => string | undefined;
		title?: string;
	} = {}
): VoiceProofPackSection => {
	const failed = records.filter((record) => record.status === 'failed').length;
	const warnings = records.filter((record) => record.status === 'warning').length;
	const errors = records.reduce(
		(total, record) => total + record.summary.errorCount,
		0
	);
	const fallbacks = records.reduce(
		(total, record) => total + record.providerDecisionSummary.fallbacks,
		0
	);

	return {
		evidence: [
			numberEvidence('Operations records', records.length, {
				passWhenPositive: true
			}),
			numberEvidence('Failed operations records', failed, {
				failWhenPositive: true
			}),
			{
				label: 'Warning operations records',
				status: warnings > 0 ? 'warn' : 'pass',
				value: warnings
			},
			numberEvidence('Trace errors', errors, { failWhenPositive: true }),
			{
				label: 'Provider fallbacks',
				status: fallbacks > 0 ? 'warn' : 'pass',
				value: fallbacks
			},
			...records.slice(0, 5).map((record) => ({
				href: options.href?.(record.sessionId),
				label: `Session ${record.sessionId}`,
				status: toProofPackStatus(record.status),
				value: record.status
			}))
		],
		status: failed > 0 || errors > 0 ? 'fail' : warnings > 0 || fallbacks > 0 ? 'warn' : 'pass',
		summary: 'Per-call operations records, trace errors, and provider recovery.',
		title: options.title ?? 'Operations records'
	};
};

export const createVoiceProofPackSupportBundleSection = (input: {
	callDebuggerReports?: readonly VoiceCallDebuggerReport[];
	sessionSnapshots?: readonly VoiceSessionSnapshot[];
	title?: string;
}): VoiceProofPackSection => {
	const snapshots = input.sessionSnapshots ?? [];
	const debuggerReports = input.callDebuggerReports ?? [];
	const failedSnapshots = snapshots.filter(
		(snapshot) => snapshot.status === 'fail'
	).length;
	const failedDebuggerReports = debuggerReports.filter(
		(report) => report.status === 'failed'
	).length;
	const warnings =
		snapshots.filter((snapshot) => snapshot.status === 'warn').length +
		debuggerReports.filter((report) => report.status === 'warning').length;

	return {
		evidence: [
			numberEvidence('Session snapshots', snapshots.length, {
				passWhenPositive: true
			}),
			numberEvidence('Call debugger reports', debuggerReports.length, {
				passWhenPositive: true
			}),
			numberEvidence('Failed snapshots', failedSnapshots, {
				failWhenPositive: true
			}),
			numberEvidence('Failed debugger reports', failedDebuggerReports, {
				failWhenPositive: true
			}),
			{
				label: 'Warning support artifacts',
				status: warnings > 0 ? 'warn' : 'pass',
				value: warnings
			}
		],
		status:
			failedSnapshots > 0 || failedDebuggerReports > 0
				? 'fail'
				: warnings > 0
					? 'warn'
					: 'pass',
		summary: 'Support artifacts that make the latest call debuggable.',
		title: input.title ?? 'Support bundle'
	};
};

const buildDerivedProofPackSections = (
	input: VoiceProofPackInput
): VoiceProofPackSection[] => [
	...(input.productionReadiness
		? [createVoiceProofPackProductionReadinessSection(input.productionReadiness)]
		: []),
	...(input.providerSlo
		? [
				createVoiceProofPackProviderSloSection(input.providerSlo, {
					href: input.productionReadiness?.links.providerSlo
				})
			]
		: []),
	...(input.operationsRecords && input.operationsRecords.length > 0
		? [
				createVoiceProofPackOperationsRecordSection(input.operationsRecords, {
					href: (sessionId) =>
						input.productionReadiness?.links.operationsRecords
							? `${input.productionReadiness.links.operationsRecords}/${encodeURIComponent(sessionId)}`
							: undefined
				})
			]
		: []),
	...(input.sessionSnapshots?.length || input.callDebuggerReports?.length
		? [
				createVoiceProofPackSupportBundleSection({
					callDebuggerReports: input.callDebuggerReports,
					sessionSnapshots: input.sessionSnapshots
				})
			]
		: []),
	...(input.observabilityExport
		? buildVoiceProofPackFromObservabilityExport(input.observabilityExport).sections
		: [])
];

const resolveProofPack = async (
	source: VoiceProofPackRoutesOptions['source']
): Promise<VoiceProofPack> => {
	const input = typeof source === 'function' ? await source() : source;
	return buildVoiceProofPack(input);
};

export const buildVoiceProofPack = (
	input: VoiceProofPackInput | VoiceProofPack
): VoiceProofPack => {
	if (
		'status' in input &&
		'ok' in input &&
		'summary' in input &&
		Array.isArray(input.sections)
	) {
		return input;
	}

	const sections = [...buildDerivedProofPackSections(input), ...(input.sections ?? [])];
	const summary = summarizeProofPackSections(sections);
	const status: VoiceProofPackStatus =
		summary.fail > 0 ? 'fail' : summary.warn > 0 ? 'warn' : 'pass';

	return {
		artifacts: input.artifacts ?? [],
		generatedAt: toGeneratedAt(input.generatedAt),
		ok: status === 'pass',
		outputDir: input.outputDir,
		runId: input.runId ?? `voice-proof-pack-${crypto.randomUUID()}`,
		sections,
		status,
		summary
	};
};

export const createVoiceProofPackStaleWhileRefreshSource = (
	options: VoiceProofPackStaleWhileRefreshSourceOptions
): VoiceProofPackStaleWhileRefreshSource => {
	const maxAgeMs = options.maxAgeMs ?? 5 * 60_000;
	const now = options.now ?? Date.now;
	let refreshPromise: Promise<VoiceProofPackSourceValue> | undefined;
	let status: VoiceProofPackRefreshStatus = {
		maxAgeMs,
		refreshing: false,
		state: 'missing'
	};

	const updateStatusFromProofPack = (
		proofPack: VoiceProofPackSourceValue,
		refreshing = Boolean(refreshPromise)
	) => {
		const metadata = getProofPackMetadata(proofPack);
		const ageMs = Math.max(0, now() - metadata.generatedAtMs);
		status = {
			ageMs,
			generatedAt: metadata.generatedAt,
			lastRefreshCompletedAt: status.lastRefreshCompletedAt,
			lastRefreshStartedAt: status.lastRefreshStartedAt,
			maxAgeMs,
			refreshing,
			runId: metadata.runId,
			state: refreshing ? 'refreshing' : ageMs <= maxAgeMs ? 'fresh' : 'stale'
		};
		return { ageMs, metadata };
	};

	const refresh = async () => {
		const refreshed = await options.refresh();
		const proofPack = refreshed ?? (await options.read());
		updateStatusFromProofPack(proofPack, false);
		status = {
			...status,
			lastRefreshCompletedAt: now(),
			lastRefreshStartedAt: status.lastRefreshStartedAt,
			refreshing: false,
			state: 'fresh'
		};
		return proofPack;
	};

	const startRefresh = () => {
		if (!refreshPromise) {
			status = {
				...status,
				lastRefreshStartedAt: now(),
				refreshing: true,
				state: 'refreshing'
			};
		}
		refreshPromise ??= refresh().finally(() => {
			refreshPromise = undefined;
		});
		return refreshPromise;
	};

	const source = async () => {
		let current: VoiceProofPackSourceValue | undefined;
		try {
			current = await options.read();
		} catch (error) {
			status = {
				...status,
				error: error instanceof Error ? error.message : String(error),
				refreshing: Boolean(refreshPromise),
				state: refreshPromise ? 'refreshing' : 'missing'
			};
			return startRefresh().catch((refreshError) => {
				status = {
					...status,
					error:
						refreshError instanceof Error
							? refreshError.message
							: String(refreshError),
					lastRefreshCompletedAt: now(),
					refreshing: false,
					state: 'failed'
				};
				throw refreshError;
			});
		}

		const { ageMs } = updateStatusFromProofPack(current);
		if (ageMs <= maxAgeMs) {
			return current;
		}

		void startRefresh().catch((error) => {
			status = {
				...status,
				error: error instanceof Error ? error.message : String(error),
				lastRefreshCompletedAt: now(),
				refreshing: false,
				state: 'failed'
			};
			options.onRefreshError?.(error);
		});
		return current;
	};

	source.getStatus = () => status;

	return source;
};

export const buildVoiceProofPackFromObservabilityExport = (
	report: VoiceObservabilityExportReport,
	input: Omit<VoiceProofPackInput, 'artifacts' | 'sections'> = {}
): VoiceProofPack =>
	buildVoiceProofPack({
		...input,
		artifacts: report.artifacts,
		generatedAt: input.generatedAt ?? report.checkedAt,
		sections: [
			{
				evidence: [
					{
						label: 'Trace events',
						status: report.summary.traceEvents > 0 ? 'pass' : 'warn',
						value: report.summary.traceEvents
					},
					{
						label: 'Audit events',
						status: report.summary.auditEvents > 0 ? 'pass' : 'warn',
						value: report.summary.auditEvents
					},
					{
						label: 'Artifacts',
						status: report.artifacts.some((artifact) => artifact.status === 'fail')
							? 'fail'
							: report.artifacts.some((artifact) => artifact.status === 'warn')
								? 'warn'
								: 'pass',
						value: report.artifacts.length
					}
				],
				status: report.status,
				summary: 'Customer-owned observability export evidence.',
				title: 'Observability export'
			},
			{
				evidence: report.issues.map((issue) => ({
					detail: issue.detail,
					label: issue.label,
					status: issue.severity,
					value: issue.value
				})),
				status: report.status,
				summary:
					report.issues.length === 0
						? 'No export issues were reported.'
						: `${report.issues.length} export issue(s) were reported.`,
				title: 'Export issues'
			}
		]
	});

export const renderVoiceProofPackMarkdown = (proofPack: VoiceProofPack) => {
	const sections = proofPack.sections
		.map((section) => {
			const evidence = (section.evidence ?? [])
				.map((item) => {
					const value = item.value === undefined ? '' : `: ${String(item.value)}`;
					const href = item.href ? ` (${item.href})` : '';
					const detail = item.detail ? ` - ${item.detail}` : '';
					return `- ${item.label}${value}${href} - ${item.status ?? 'pass'}${detail}`;
				})
				.join('\n');

			return [
				`## ${section.title}`,
				'',
				section.summary ?? '',
				'',
				evidence
			]
				.filter(Boolean)
				.join('\n');
		})
		.join('\n\n');

	return [
		'# AbsoluteJS Voice Proof Pack',
		'',
		`Run: ${proofPack.runId}`,
		`Generated: ${proofPack.generatedAt}`,
		`Status: ${proofPack.status}`,
		'',
		`Sections: ${proofPack.summary.sections}`,
		`Passing sections: ${proofPack.summary.pass}`,
		`Warning sections: ${proofPack.summary.warn}`,
		`Failing sections: ${proofPack.summary.fail}`,
		'',
		sections
	]
		.filter(Boolean)
		.join('\n');
};

export const writeVoiceProofPack = async (
	input: VoiceProofPackInput | VoiceProofPack,
	options: {
		jsonFileName?: string;
		markdownFileName?: string;
		outputDir: string;
	} = { outputDir: '.voice-runtime/proof-pack' }
): Promise<VoiceProofPackWriteResult> => {
	const proofPack = buildVoiceProofPack({
		...input,
		outputDir: options.outputDir
	});
	const jsonPath = join(options.outputDir, options.jsonFileName ?? 'latest.json');
	const markdownPath = join(
		options.outputDir,
		options.markdownFileName ?? 'latest.md'
	);

	await mkdir(dirname(jsonPath), { recursive: true });
	await mkdir(dirname(markdownPath), { recursive: true });
	await Promise.all([
		Bun.write(jsonPath, JSON.stringify(proofPack, null, 2)),
		Bun.write(markdownPath, renderVoiceProofPackMarkdown(proofPack))
	]);

	return {
		artifacts: createVoiceProofPackArtifacts({
			jsonPath,
			markdownPath,
			proofPack
		}),
		jsonPath,
		markdownPath,
		proofPack
	};
};

export const createVoiceProofPackArtifacts = (input: {
	jsonPath?: string;
	markdownPath?: string;
	proofPack: VoiceProofPack;
}): VoiceObservabilityExportArtifact[] => [
	...(input.markdownPath
		? [
				{
					generatedAt: input.proofPack.generatedAt,
					id: 'latest-proof-pack',
					kind: 'proof-pack' as const,
					label: 'Latest proof pack',
					metadata: {
						proofPackStatus: input.proofPack.status,
						runId: input.proofPack.runId
					},
					path: input.markdownPath,
					required: false,
					status: 'pass' as const
				}
			]
		: []),
	...(input.jsonPath
		? [
				{
					contentType: 'application/json',
					generatedAt: input.proofPack.generatedAt,
					id: 'latest-proof-pack-json',
					kind: 'proof-pack' as const,
					label: 'Latest proof pack JSON',
					metadata: {
						proofPackStatus: input.proofPack.status,
						runId: input.proofPack.runId
					},
					path: input.jsonPath,
					required: false,
					status: 'pass' as const
				}
			]
		: [])
];

export const createVoiceProofPackRoutes = (
	options: VoiceProofPackRoutesOptions
) => {
	const jsonPath = options.jsonPath ?? '/api/voice/proof-pack';
	const markdownPath = options.markdownPath ?? '/voice/proof-pack.md';
	const app = new Elysia({ name: options.name ?? 'voice-proof-pack' });

	if (jsonPath !== false) {
		app.get(
			jsonPath,
			async () => new Response(JSON.stringify(await resolveProofPack(options.source), null, 2), {
				headers: {
					'content-type': 'application/json; charset=utf-8',
					...options.headers
				}
			})
		);
	}

	if (markdownPath !== false) {
		app.get(
			markdownPath,
			async () =>
				new Response(
					renderVoiceProofPackMarkdown(await resolveProofPack(options.source)),
					{
						headers: {
							'content-type': 'text/markdown; charset=utf-8',
							...options.headers
						}
					}
				)
		);
	}

	return app;
};
