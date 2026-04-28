import { Elysia } from 'elysia';
import { summarizeVoiceHandoffHealth } from './handoffHealth';
import { summarizeVoiceProviderHealth } from './providerHealth';
import { evaluateVoiceQuality } from './qualityRoutes';
import {
	listVoiceRoutingEvents,
	summarizeVoiceRoutingSessions
} from './resilienceRoutes';
import { summarizeVoiceSessions } from './sessionReplay';
import {
	createVoiceTelephonyCarrierMatrix,
	type VoiceTelephonyCarrierMatrix,
	type VoiceTelephonyCarrierMatrixInput
} from './telephony/matrix';
import type { VoiceTraceEventStore } from './trace';
import type { VoiceTraceSinkDeliveryStore } from './trace';
import { summarizeVoiceTraceSinkDeliveries } from './queue';
import type { VoiceAgentSquadContractReport } from './agentSquadContract';
import type { VoiceProviderRoutingContractReport } from './providerRoutingContract';
import type { VoicePhoneAgentProductionSmokeReport } from './phoneAgentProductionSmoke';
import type {
	VoiceAuditEventStore,
	VoiceAuditEventType,
	VoiceAuditOutcome
} from './audit';
import {
	summarizeVoiceAuditSinkDeliveries,
	type VoiceAuditSinkDeliveryStore
} from './auditSinks';

export type VoiceProductionReadinessStatus = 'fail' | 'pass' | 'warn';

export type VoiceProductionReadinessAction = {
	description?: string;
	href: string;
	label: string;
	method?: 'GET' | 'POST';
};

export type VoiceProductionReadinessCheck = {
	actions?: VoiceProductionReadinessAction[];
	detail?: string;
	href?: string;
	label: string;
	status: VoiceProductionReadinessStatus;
	value?: number | string;
};

export type VoiceProductionReadinessReport = {
	checkedAt: number;
	checks: VoiceProductionReadinessCheck[];
	links: {
		agentSquadContracts?: string;
		audit?: string;
		auditDeliveries?: string;
		carriers?: string;
		handoffs?: string;
		handoffRetry?: string;
		liveLatency?: string;
		phoneAgentSmoke?: string;
		providerRoutingContracts?: string;
		quality?: string;
		resilience?: string;
		sessions?: string;
		traceDeliveries?: string;
	};
	status: VoiceProductionReadinessStatus;
	summary: {
		agentSquadContracts?: {
			failed: number;
			passed: number;
			status: VoiceProductionReadinessStatus;
			total: number;
		};
		audit?: VoiceProductionReadinessAuditSummary;
		auditDeliveries?: VoiceProductionReadinessAuditDeliverySummary;
		carriers?: {
			failing: number;
			providers: number;
			ready: number;
			status: VoiceProductionReadinessStatus;
			warnings: number;
		};
		handoffs: {
			failed: number;
			total: number;
		};
		liveLatency: {
			averageLatencyMs?: number;
			failed: number;
			status: VoiceProductionReadinessStatus;
			total: number;
			warnings: number;
		};
		providers: {
			degraded: number;
			total: number;
		};
		phoneAgentSmokes?: {
			failed: number;
			passed: number;
			status: VoiceProductionReadinessStatus;
			total: number;
		};
		providerRoutingContracts?: {
			failed: number;
			passed: number;
			status: VoiceProductionReadinessStatus;
			total: number;
		};
		quality: {
			status: 'fail' | 'pass';
		};
		routing: {
			events: number;
			sessions: number;
		};
		sessions: {
			failed: number;
			total: number;
		};
		traceDeliveries?: VoiceProductionReadinessTraceDeliverySummary;
	};
};

export type VoiceProductionReadinessAuditRequirement = {
	label?: string;
	maxAgeMs?: number;
	outcomes?: VoiceAuditOutcome[];
	status?: VoiceProductionReadinessStatus;
	type: VoiceAuditEventType;
};

export type VoiceProductionReadinessAuditSummary = {
	events: number;
	missing: VoiceProductionReadinessAuditRequirement[];
	present: Record<VoiceAuditEventType, number>;
	required: VoiceProductionReadinessAuditRequirement[];
	status: VoiceProductionReadinessStatus;
};

export type VoiceProductionReadinessAuditDeliverySummary = {
	deadLettered: number;
	delivered: number;
	failed: number;
	failPendingAfterMs: number;
	pending: number;
	retryEligible: number;
	skipped: number;
	staleFailing: number;
	staleWarning: number;
	status: VoiceProductionReadinessStatus;
	total: number;
	warnPendingAfterMs: number;
};

export type VoiceProductionReadinessTraceDeliverySummary = {
	deadLettered: number;
	delivered: number;
	failed: number;
	failPendingAfterMs: number;
	pending: number;
	retryEligible: number;
	skipped: number;
	staleFailing: number;
	staleWarning: number;
	status: VoiceProductionReadinessStatus;
	total: number;
	warnPendingAfterMs: number;
};

export type VoiceProductionReadinessAuditOptions =
	| VoiceAuditEventStore
	| {
			require?: readonly (
				| VoiceAuditEventType
				| VoiceProductionReadinessAuditRequirement
			)[];
			store: VoiceAuditEventStore;
	  };

export type VoiceProductionReadinessAuditDeliveryOptions =
	| VoiceAuditSinkDeliveryStore
	| {
			deadLetters?: VoiceAuditSinkDeliveryStore;
			failPendingAfterMs?: number;
			store: VoiceAuditSinkDeliveryStore;
			warnPendingAfterMs?: number;
	  };

export type VoiceProductionReadinessTraceDeliveryOptions =
	| VoiceTraceSinkDeliveryStore
	| {
			deadLetters?: VoiceTraceSinkDeliveryStore;
			failPendingAfterMs?: number;
			store: VoiceTraceSinkDeliveryStore;
			warnPendingAfterMs?: number;
	  };

export type VoiceProductionReadinessRoutesOptions = {
	agentSquadContracts?:
		| false
		| readonly VoiceAgentSquadContractReport[]
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<readonly VoiceAgentSquadContractReport[]>
				| readonly VoiceAgentSquadContractReport[]);
	audit?: false | VoiceProductionReadinessAuditOptions;
	auditDeliveries?: false | VoiceProductionReadinessAuditDeliveryOptions;
	carriers?:
		| false
		| readonly VoiceTelephonyCarrierMatrixInput[]
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<readonly VoiceTelephonyCarrierMatrixInput[]>
				| readonly VoiceTelephonyCarrierMatrixInput[]);
	headers?: HeadersInit;
	htmlPath?: false | string;
	links?: VoiceProductionReadinessReport['links'];
	llmProviders?: readonly string[];
	name?: string;
	path?: string;
	phoneAgentSmokes?:
		| false
		| readonly VoicePhoneAgentProductionSmokeReport[]
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<readonly VoicePhoneAgentProductionSmokeReport[]>
				| readonly VoicePhoneAgentProductionSmokeReport[]);
	providerRoutingContracts?:
		| false
		| readonly VoiceProviderRoutingContractReport[]
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<readonly VoiceProviderRoutingContractReport[]>
				| readonly VoiceProviderRoutingContractReport[]);
	render?: (report: VoiceProductionReadinessReport) => string | Promise<string>;
	store: VoiceTraceEventStore;
	sttProviders?: readonly string[];
	title?: string;
	traceDeliveries?: false | VoiceProductionReadinessTraceDeliveryOptions;
	ttsProviders?: readonly string[];
	liveLatencyWarnAfterMs?: number;
	liveLatencyFailAfterMs?: number;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const rollupStatus = (
	checks: VoiceProductionReadinessCheck[]
): VoiceProductionReadinessStatus =>
	checks.some((check) => check.status === 'fail')
		? 'fail'
		: checks.some((check) => check.status === 'warn')
			? 'warn'
			: 'pass';

const carrierStatus = (
	matrix: VoiceTelephonyCarrierMatrix
): VoiceProductionReadinessStatus =>
	matrix.summary.failing > 0
		? 'fail'
		: matrix.summary.warnings > 0 ||
			  matrix.summary.ready < matrix.summary.providers
			? 'warn'
			: 'pass';

const resolveCarriers = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (options.carriers === false || options.carriers === undefined) {
		return undefined;
	}

	const providers =
		typeof options.carriers === 'function'
			? await options.carriers(input)
			: options.carriers;

	return createVoiceTelephonyCarrierMatrix({
		providers: [...providers]
	});
};

const resolveAgentSquadContracts = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (
		options.agentSquadContracts === false ||
		options.agentSquadContracts === undefined
	) {
		return undefined;
	}

	return typeof options.agentSquadContracts === 'function'
		? await options.agentSquadContracts(input)
		: options.agentSquadContracts;
};

const resolveProviderRoutingContracts = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (
		options.providerRoutingContracts === false ||
		options.providerRoutingContracts === undefined
	) {
		return undefined;
	}

	return typeof options.providerRoutingContracts === 'function'
		? await options.providerRoutingContracts(input)
		: options.providerRoutingContracts;
};

const resolvePhoneAgentSmokes = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (options.phoneAgentSmokes === false || options.phoneAgentSmokes === undefined) {
		return undefined;
	}

	return typeof options.phoneAgentSmokes === 'function'
		? await options.phoneAgentSmokes(input)
		: options.phoneAgentSmokes;
};

const defaultAuditRequirements: VoiceProductionReadinessAuditRequirement[] = [
	{
		label: 'Provider-call audit',
		type: 'provider.call'
	},
	{
		label: 'Retention audit',
		maxAgeMs: 7 * 24 * 60 * 60 * 1000,
		type: 'retention.policy'
	},
	{
		label: 'Operator-action audit',
		type: 'operator.action'
	}
];

const resolveAuditRequirement = (
	requirement:
		| VoiceAuditEventType
		| VoiceProductionReadinessAuditRequirement
): VoiceProductionReadinessAuditRequirement =>
	typeof requirement === 'string'
		? {
				type: requirement
			}
		: requirement;

const summarizeAuditEvidence = async (
	options: VoiceProductionReadinessRoutesOptions
): Promise<VoiceProductionReadinessAuditSummary | undefined> => {
	if (!options.audit) {
		return undefined;
	}

	const audit =
		'list' in options.audit
			? {
					require: defaultAuditRequirements,
					store: options.audit
				}
			: {
					require:
						options.audit.require?.map(resolveAuditRequirement) ??
						defaultAuditRequirements,
					store: options.audit.store
				};
	const events = await audit.store.list();
	const present = events.reduce(
		(counts, event) => {
			counts[event.type] = (counts[event.type] ?? 0) + 1;
			return counts;
		},
		{} as Record<VoiceAuditEventType, number>
	);
	const missing = audit.require.filter((requirement) => {
		const matching = events.filter((event) => {
			if (event.type !== requirement.type) {
				return false;
			}

			if (
				typeof requirement.maxAgeMs === 'number' &&
				Date.now() - event.at > requirement.maxAgeMs
			) {
				return false;
			}

			return true;
		});
		if (matching.length === 0) {
			return true;
		}

		if (requirement.outcomes && requirement.outcomes.length > 0) {
			return !matching.some(
				(event) => event.outcome && requirement.outcomes?.includes(event.outcome)
			);
		}

		return false;
	});

	return {
		events: events.length,
		missing,
		present,
		required: audit.require,
		status: missing.some((requirement) => requirement.status === 'fail')
			? 'fail'
			: missing.length > 0
				? 'fail'
				: events.length === 0
					? 'warn'
					: 'pass'
	};
};

const summarizeAuditDeliveries = async (
	options: VoiceProductionReadinessRoutesOptions
): Promise<VoiceProductionReadinessAuditDeliverySummary | undefined> => {
	if (!options.auditDeliveries) {
		return undefined;
	}

	const auditDeliveries =
		'list' in options.auditDeliveries
			? {
					store: options.auditDeliveries
				}
			: options.auditDeliveries;
	const warnPendingAfterMs = Math.max(
		0,
		auditDeliveries.warnPendingAfterMs ?? 60_000
	);
	const failPendingAfterMs = Math.max(
		warnPendingAfterMs,
		auditDeliveries.failPendingAfterMs ?? 5 * 60_000
	);
	const now = Date.now();
	const deliveries = await auditDeliveries.store.list();
	const queue = await summarizeVoiceAuditSinkDeliveries(deliveries, {
		deadLetters: auditDeliveries.deadLetters
	});
	const staleWarning = deliveries.filter(
		(delivery) =>
			delivery.deliveryStatus === 'pending' &&
			now - delivery.createdAt >= warnPendingAfterMs &&
			now - delivery.createdAt < failPendingAfterMs
	).length;
	const staleFailing = deliveries.filter(
		(delivery) =>
			delivery.deliveryStatus === 'pending' &&
			now - delivery.createdAt >= failPendingAfterMs
	).length;
	const status: VoiceProductionReadinessStatus =
		queue.deadLettered > 0 || queue.failed > 0 || staleFailing > 0
			? 'fail'
			: queue.pending > 0 || queue.retryEligible > 0 || staleWarning > 0
				? 'warn'
				: 'pass';

	return {
		deadLettered: queue.deadLettered,
		delivered: queue.delivered,
		failed: queue.failed,
		failPendingAfterMs,
		pending: queue.pending,
		retryEligible: queue.retryEligible,
		skipped: queue.skipped,
		staleFailing,
		staleWarning,
		status,
		total: queue.total,
		warnPendingAfterMs
	};
};

const summarizeTraceDeliveries = async (
	options: VoiceProductionReadinessRoutesOptions
): Promise<VoiceProductionReadinessTraceDeliverySummary | undefined> => {
	if (!options.traceDeliveries) {
		return undefined;
	}

	const traceDeliveries =
		'list' in options.traceDeliveries
			? {
					store: options.traceDeliveries
				}
			: options.traceDeliveries;
	const warnPendingAfterMs = Math.max(
		0,
		traceDeliveries.warnPendingAfterMs ?? 60_000
	);
	const failPendingAfterMs = Math.max(
		warnPendingAfterMs,
		traceDeliveries.failPendingAfterMs ?? 5 * 60_000
	);
	const now = Date.now();
	const deliveries = await traceDeliveries.store.list();
	const queue = await summarizeVoiceTraceSinkDeliveries(deliveries, {
		deadLetters: traceDeliveries.deadLetters
	});
	const staleWarning = deliveries.filter(
		(delivery) =>
			delivery.deliveryStatus === 'pending' &&
			now - delivery.createdAt >= warnPendingAfterMs &&
			now - delivery.createdAt < failPendingAfterMs
	).length;
	const staleFailing = deliveries.filter(
		(delivery) =>
			delivery.deliveryStatus === 'pending' &&
			now - delivery.createdAt >= failPendingAfterMs
	).length;
	const status: VoiceProductionReadinessStatus =
		queue.deadLettered > 0 || queue.failed > 0 || staleFailing > 0
			? 'fail'
			: queue.pending > 0 || queue.retryEligible > 0 || staleWarning > 0
				? 'warn'
				: 'pass';

	return {
		deadLettered: queue.deadLettered,
		delivered: queue.delivered,
		failed: queue.failed,
		failPendingAfterMs,
		pending: queue.pending,
		retryEligible: queue.retryEligible,
		skipped: queue.skipped,
		staleFailing,
		staleWarning,
		status,
		total: queue.total,
		warnPendingAfterMs
	};
};

const summarizeLiveLatency = (
	events: Awaited<ReturnType<VoiceTraceEventStore['list']>>,
	options: VoiceProductionReadinessRoutesOptions
) => {
	const warnAfterMs = options.liveLatencyWarnAfterMs ?? 1800;
	const failAfterMs = options.liveLatencyFailAfterMs ?? 3200;
	const latencies = events
		.filter((event) => event.type === 'client.live_latency')
		.map((event) =>
			typeof event.payload.latencyMs === 'number'
				? event.payload.latencyMs
				: typeof event.payload.elapsedMs === 'number'
					? event.payload.elapsedMs
					: undefined
		)
		.filter((value): value is number => typeof value === 'number');
	const failed = latencies.filter((value) => value > failAfterMs).length;
	const warnings = latencies.filter(
		(value) => value > warnAfterMs && value <= failAfterMs
	).length;
	const averageLatencyMs =
		latencies.length > 0
			? Math.round(
					latencies.reduce((total, value) => total + value, 0) /
						latencies.length
				)
			: undefined;

	return {
		averageLatencyMs,
		failed,
		status:
			latencies.length === 0
				? 'warn'
				: failed > 0
					? 'fail'
					: warnings > 0
						? 'warn'
						: 'pass',
		total: latencies.length,
		warnings
	} satisfies VoiceProductionReadinessReport['summary']['liveLatency'];
};

export const buildVoiceProductionReadinessReport = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query?: Record<string, unknown>;
		request?: Request;
	} = {}
): Promise<VoiceProductionReadinessReport> => {
	const request = input.request ?? new Request('http://localhost/');
	const query = input.query ?? {};
	const events = await options.store.list();
	const routingEvents = listVoiceRoutingEvents(events);
	const routingSessions = summarizeVoiceRoutingSessions(routingEvents);
	const liveLatency = summarizeLiveLatency(events, options);
	const [
		quality,
		providers,
		sessions,
		handoffs,
		audit,
		auditDeliveries,
		traceDeliveries,
		carriers,
		agentSquadContracts,
		providerRoutingContracts,
		phoneAgentSmokes
	] = await Promise.all([
		evaluateVoiceQuality({ events }),
		Promise.all([
			summarizeVoiceProviderHealth({
				events,
				providers: options.llmProviders ?? []
			}),
			summarizeVoiceProviderHealth({
				events: events.filter((event) => event.payload.kind === 'stt'),
				providers: options.sttProviders ?? []
			}),
			summarizeVoiceProviderHealth({
				events: events.filter((event) => event.payload.kind === 'tts'),
				providers: options.ttsProviders ?? []
			})
		]).then((groups) => groups.flat()),
		summarizeVoiceSessions({ events, status: 'all' }),
		summarizeVoiceHandoffHealth({ events }),
		summarizeAuditEvidence(options),
		summarizeAuditDeliveries(options),
		summarizeTraceDeliveries(options),
		resolveCarriers(options, { query, request }),
		resolveAgentSquadContracts(options, { query, request }),
		resolveProviderRoutingContracts(options, { query, request }),
		resolvePhoneAgentSmokes(options, { query, request })
	]);
	const degradedProviders = providers.filter(
		(provider) =>
			provider.status === 'degraded' ||
			provider.status === 'rate-limited' ||
			provider.status === 'suppressed'
	).length;
	const failedSessions = sessions.filter(
		(session) => session.status === 'failed'
	).length;
	const checks: VoiceProductionReadinessCheck[] = [
		{
			detail:
				quality.status === 'pass'
					? 'Quality gates are passing.'
					: 'Quality gates need attention.',
			href: options.links?.quality ?? '/quality',
			label: 'Quality gates',
			status: quality.status,
			value: quality.status,
			actions:
				quality.status === 'pass'
					? []
					: [
							{
								description: 'Open the quality report to inspect failing gates.',
								href: options.links?.quality ?? '/quality',
								label: 'Inspect quality gates'
							}
						]
		},
		{
			detail:
				degradedProviders === 0
					? 'No configured providers are currently degraded.'
					: `${degradedProviders} provider(s) are degraded, suppressed, or rate-limited.`,
			href: options.links?.resilience ?? '/resilience',
			label: 'Provider health',
			status: degradedProviders > 0 ? 'fail' : 'pass',
			value: degradedProviders,
			actions:
				degradedProviders > 0
					? [
							{
								description:
									'Open provider health, fallback state, and recovery controls.',
								href: options.links?.resilience ?? '/resilience',
								label: 'Open provider recovery'
							}
						]
					: []
		},
		{
			detail:
				failedSessions === 0
					? sessions.length > 0
						? 'Recent sessions have no recorded provider/session failures.'
						: 'No sessions have been recorded yet; run a smoke or live session for proof.'
					: `${failedSessions} recent session(s) have failures.`,
			href: options.links?.sessions ?? '/sessions',
			label: 'Session health',
			status: failedSessions > 0 ? 'fail' : sessions.length === 0 ? 'warn' : 'pass',
			value: `${sessions.length - failedSessions}/${sessions.length}`,
			actions:
				failedSessions > 0
					? [
							{
								description: 'Open failed sessions and replay traces.',
								href: `${options.links?.sessions ?? '/sessions'}?status=failed`,
								label: 'Replay failed sessions'
							}
						]
					: sessions.length === 0
						? [
								{
									description: 'Open sessions after running a smoke or live call.',
									href: options.links?.sessions ?? '/sessions',
									label: 'Open sessions'
								}
							]
						: []
		},
		{
			detail:
				handoffs.failed === 0
					? 'No failed handoff deliveries are recorded.'
					: `${handoffs.failed} handoff delivery failure(s) are recorded.`,
			href: options.links?.handoffs ?? '/handoffs',
			label: 'Handoff delivery',
			status: handoffs.failed > 0 ? 'fail' : 'pass',
			value: `${handoffs.total - handoffs.failed}/${handoffs.total}`,
			actions:
				handoffs.failed > 0
					? [
							{
								description: 'Retry queued or failed handoff deliveries.',
								href:
									options.links?.handoffRetry ?? '/api/voice-handoffs/retry',
								label: 'Retry handoff deliveries',
								method: 'POST'
							},
							{
								description: 'Inspect handoff queue and delivery errors.',
								href: options.links?.handoffs ?? '/handoffs',
								label: 'Open handoff queue'
							}
						]
					: []
		},
		{
			detail:
				routingEvents.length > 0
					? `${routingSessions.length} session(s) have provider routing evidence.`
					: 'No provider routing traces are recorded yet.',
			href: options.links?.resilience ?? '/resilience',
			label: 'Routing evidence',
			status: routingEvents.length > 0 ? 'pass' : 'warn',
			value: routingEvents.length,
			actions:
				routingEvents.length > 0
					? []
					: [
							{
								description:
									'Open provider routing and run a smoke or simulation to create evidence.',
								href: options.links?.resilience ?? '/resilience',
								label: 'Open routing evidence'
							}
						]
		}
	];
	checks.push({
		detail:
			liveLatency.total === 0
				? 'No browser live-latency measurements are recorded yet.'
				: liveLatency.status === 'pass'
					? `Live browser turn latency averages ${liveLatency.averageLatencyMs}ms.`
					: `${liveLatency.failed} failed and ${liveLatency.warnings} warned live-latency measurement(s).`,
		href: options.links?.liveLatency ?? '/traces',
		label: 'Live latency proof',
		status: liveLatency.status,
		value:
			liveLatency.averageLatencyMs === undefined
				? `${liveLatency.total} samples`
				: `${liveLatency.averageLatencyMs}ms avg`,
		actions:
			liveLatency.status === 'pass'
				? []
				: [
						{
							description:
								'Run a live browser voice turn and inspect the persisted latency trace.',
							href: options.links?.liveLatency ?? '/traces',
							label: 'Open live latency traces'
						}
					]
	});
	const carrierSummary = carriers
		? {
				failing: carriers.summary.failing,
				providers: carriers.summary.providers,
				ready: carriers.summary.ready,
				status: carrierStatus(carriers),
				warnings: carriers.summary.warnings
			}
		: undefined;
	const agentSquadContractSummary = agentSquadContracts
		? ({
				failed: agentSquadContracts.filter((report) => !report.pass).length,
				passed: agentSquadContracts.filter((report) => report.pass).length,
				status: agentSquadContracts.some((report) => !report.pass)
					? 'fail'
					: agentSquadContracts.length === 0
							? 'warn'
							: 'pass',
				total: agentSquadContracts.length
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['agentSquadContracts']
			>)
		: undefined;
	const providerRoutingContractSummary = providerRoutingContracts
		? ({
				failed: providerRoutingContracts.filter((report) => !report.pass).length,
				passed: providerRoutingContracts.filter((report) => report.pass).length,
				status: providerRoutingContracts.some((report) => !report.pass)
					? 'fail'
					: providerRoutingContracts.length === 0
						? 'warn'
						: 'pass',
				total: providerRoutingContracts.length
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['providerRoutingContracts']
			>)
		: undefined;
	const phoneAgentSmokeSummary = phoneAgentSmokes
		? ({
				failed: phoneAgentSmokes.filter((report) => !report.pass).length,
				passed: phoneAgentSmokes.filter((report) => report.pass).length,
				status: phoneAgentSmokes.some((report) => !report.pass)
					? 'fail'
					: phoneAgentSmokes.length === 0
						? 'warn'
						: 'pass',
				total: phoneAgentSmokes.length
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['phoneAgentSmokes']
			>)
		: undefined;

	if (agentSquadContractSummary) {
		checks.push({
			detail:
				agentSquadContractSummary.status === 'pass'
					? `${agentSquadContractSummary.passed} agent squad contract(s) are passing.`
					: agentSquadContractSummary.total === 0
						? 'No agent squad contracts are configured.'
						: `${agentSquadContractSummary.failed} agent squad contract(s) failed.`,
			href: options.links?.agentSquadContracts ?? '/agent-squad-contract',
			label: 'Agent squad contracts',
			status: agentSquadContractSummary.status,
			value: `${agentSquadContractSummary.passed}/${agentSquadContractSummary.total}`,
			actions:
				agentSquadContractSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open the specialist routing contract report and inspect failing handoff paths.',
								href:
									options.links?.agentSquadContracts ??
									'/agent-squad-contract',
								label: 'Open squad contracts'
							}
						]
		});
	}

	if (providerRoutingContractSummary) {
		checks.push({
			detail:
				providerRoutingContractSummary.status === 'pass'
					? `${providerRoutingContractSummary.passed} provider routing contract(s) are passing.`
					: providerRoutingContractSummary.total === 0
						? 'No provider routing contracts are configured.'
						: `${providerRoutingContractSummary.failed} provider routing contract(s) failed.`,
			href:
				options.links?.providerRoutingContracts ??
				options.links?.resilience ??
				'/resilience',
			label: 'Provider routing contracts',
			status: providerRoutingContractSummary.status,
			value: `${providerRoutingContractSummary.passed}/${providerRoutingContractSummary.total}`,
			actions:
				providerRoutingContractSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open provider routing evidence and inspect failed fallback expectations.',
								href:
									options.links?.providerRoutingContracts ??
									options.links?.resilience ??
									'/resilience',
								label: 'Open provider routing contracts'
							}
						]
		});
	}

	if (phoneAgentSmokeSummary) {
		checks.push({
			detail:
				phoneAgentSmokeSummary.status === 'pass'
					? `${phoneAgentSmokeSummary.passed} phone-agent smoke contract(s) are passing.`
					: phoneAgentSmokeSummary.total === 0
						? 'No phone-agent production smoke contracts are configured.'
						: `${phoneAgentSmokeSummary.failed} phone-agent production smoke contract(s) failed.`,
			href:
				options.links?.phoneAgentSmoke ??
				options.links?.sessions ??
				'/sessions',
			label: 'Phone agent production smoke',
			status: phoneAgentSmokeSummary.status,
			value: `${phoneAgentSmokeSummary.passed}/${phoneAgentSmokeSummary.total}`,
			actions:
				phoneAgentSmokeSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open trace replay and inspect media start, transcript, assistant response, and terminal lifecycle evidence.',
								href:
									options.links?.phoneAgentSmoke ??
									options.links?.sessions ??
									'/sessions',
								label: 'Open phone smoke traces'
							}
						]
		});
	}

	if (audit) {
		const missingLabels = audit.missing.map(
			(requirement) => requirement.label ?? requirement.type
		);
		checks.push({
			detail:
				audit.status === 'pass'
					? `${audit.events} audit event(s) cover required evidence.`
					: missingLabels.length > 0
						? `Missing audit evidence: ${missingLabels.join(', ')}.`
						: 'No audit evidence is recorded yet.',
			href: options.links?.audit ?? '/audit',
			label: 'Audit evidence',
			status: audit.status,
			value: `${audit.required.length - audit.missing.length}/${audit.required.length}`,
			actions:
				audit.status === 'pass'
					? []
					: [
							{
								description:
									'Open the audit trail and confirm provider calls, retention runs, and operator actions are being recorded.',
								href: options.links?.audit ?? '/audit',
								label: 'Open audit evidence'
							}
						]
		});
	}

	if (auditDeliveries) {
		checks.push({
			detail:
				auditDeliveries.status === 'pass'
					? 'Audit sink deliveries are clear.'
					: auditDeliveries.staleFailing > 0
						? `${auditDeliveries.staleFailing} audit delivery item(s) are stale past ${Math.round(auditDeliveries.failPendingAfterMs / 1000)}s.`
						: auditDeliveries.failed > 0 || auditDeliveries.deadLettered > 0
							? `${auditDeliveries.failed} failed and ${auditDeliveries.deadLettered} dead-lettered audit delivery item(s).`
							: `${auditDeliveries.pending} audit delivery item(s) are pending.`,
			href:
				options.links?.auditDeliveries ??
				options.links?.audit ??
				'/audit',
			label: 'Audit sink delivery',
			status: auditDeliveries.status,
			value: `${auditDeliveries.delivered + auditDeliveries.skipped}/${auditDeliveries.total}`,
			actions:
				auditDeliveries.status === 'pass'
					? []
					: [
							{
								description:
									'Inspect audit sink delivery failures, dead letters, or stale pending evidence exports.',
								href:
									options.links?.auditDeliveries ??
									options.links?.audit ??
									'/audit',
								label: 'Open audit deliveries'
							}
						]
		});
	}

	if (traceDeliveries) {
		checks.push({
			detail:
				traceDeliveries.status === 'pass'
					? 'Trace sink deliveries are clear.'
					: traceDeliveries.staleFailing > 0
						? `${traceDeliveries.staleFailing} trace delivery item(s) are stale past ${Math.round(traceDeliveries.failPendingAfterMs / 1000)}s.`
						: traceDeliveries.failed > 0 || traceDeliveries.deadLettered > 0
							? `${traceDeliveries.failed} failed and ${traceDeliveries.deadLettered} dead-lettered trace delivery item(s).`
							: `${traceDeliveries.pending} trace delivery item(s) are pending.`,
			href: options.links?.traceDeliveries ?? '/traces/deliveries',
			label: 'Trace sink delivery',
			status: traceDeliveries.status,
			value: `${traceDeliveries.delivered + traceDeliveries.skipped}/${traceDeliveries.total}`,
			actions:
				traceDeliveries.status === 'pass'
					? []
					: [
							{
								description:
									'Inspect trace sink delivery failures, dead letters, or stale pending trace exports.',
								href: options.links?.traceDeliveries ?? '/traces/deliveries',
								label: 'Open trace deliveries'
							}
						]
		});
	}

	if (carriers && carrierSummary) {
		checks.push({
			detail:
				carrierSummary.status === 'pass'
					? 'Configured carrier setup and contract checks are passing.'
					: `${carrierSummary.failing} carrier(s) failing, ${carrierSummary.warnings} warning(s).`,
			href: options.links?.carriers ?? '/carriers',
			label: 'Carrier readiness',
			status: carrierSummary.status,
			value: `${carrierSummary.ready}/${carrierSummary.providers}`,
			actions:
				carrierSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open the carrier matrix for exact missing env, signing, and URL issues.',
								href: options.links?.carriers ?? '/carriers',
								label: 'Open carrier matrix'
							}
						]
		});
	}

	return {
		checkedAt: Date.now(),
		checks,
		links: {
			agentSquadContracts: '/agent-squad-contract',
			audit: '/audit',
			auditDeliveries: '/audit',
			carriers: '/carriers',
			handoffs: '/handoffs',
			handoffRetry: '/api/voice-handoffs/retry',
			liveLatency: '/traces',
			phoneAgentSmoke: '/sessions',
			providerRoutingContracts: '/resilience',
			quality: '/quality',
			resilience: '/resilience',
			sessions: '/sessions',
			traceDeliveries: '/traces/deliveries',
			...options.links
		},
		status: rollupStatus(checks),
		summary: {
			agentSquadContracts: agentSquadContractSummary,
			audit,
			auditDeliveries,
			carriers: carrierSummary,
			handoffs: {
				failed: handoffs.failed,
				total: handoffs.total
			},
			liveLatency,
			providers: {
				degraded: degradedProviders,
				total: providers.length
			},
			phoneAgentSmokes: phoneAgentSmokeSummary,
			providerRoutingContracts: providerRoutingContractSummary,
			quality: {
				status: quality.status
			},
			routing: {
				events: routingEvents.length,
				sessions: routingSessions.length
			},
			sessions: {
				failed: failedSessions,
				total: sessions.length
			},
			traceDeliveries
		}
	};
};

export const renderVoiceProductionReadinessHTML = (
	report: VoiceProductionReadinessReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Production Readiness';
	const checks = report.checks
		.map(
			(check, index) => {
				const actions = (check.actions ?? [])
					.map((action) =>
						action.method === 'POST'
							? `<button type="button" data-readiness-action="${index}" data-action-url="${escapeHtml(action.href)}">${escapeHtml(action.label)}</button>`
							: `<a href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`
					)
					.join('');

				return `<article class="check ${escapeHtml(check.status)}">
        <div>
          <span>${escapeHtml(check.status.toUpperCase())}</span>
          <h2>${escapeHtml(check.label)}</h2>
          ${check.detail ? `<p>${escapeHtml(check.detail)}</p>` : ''}
          ${actions ? `<p class="actions">${actions}</p>` : ''}
        </div>
        <strong>${escapeHtml(String(check.value ?? check.status))}</strong>
        ${check.href ? `<a href="${escapeHtml(check.href)}">Open surface</a>` : ''}
      </article>`;
			}
		)
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0c0f14;color:#f6f2e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1060px;padding:32px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.18),rgba(245,158,11,.12));border:1px solid #26313d;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#fbbf24;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:.9;margin:.2rem 0 1rem}.status{display:inline-flex;border:1px solid #3f3f46;border-radius:999px;padding:8px 12px}.status.pass,.check.pass{border-color:rgba(34,197,94,.55)}.status.warn,.check.warn{border-color:rgba(245,158,11,.65)}.status.fail,.check.fail{border-color:rgba(239,68,68,.75)}.checks{display:grid;gap:14px}.check{align-items:center;background:#141922;border:1px solid #26313d;border-radius:22px;display:grid;gap:16px;grid-template-columns:1fr auto auto;padding:18px}.check span{color:#a8b0b8;font-size:.78rem;font-weight:900;letter-spacing:.08em}.check h2{margin:.2rem 0}.check p{color:#b9c0c8;margin:.2rem 0 0}.check strong{font-size:1.5rem}.actions{display:flex;flex-wrap:wrap;gap:10px}.check a,a{color:#fbbf24}button{background:#fbbf24;border:0;border-radius:999px;color:#111827;cursor:pointer;font-weight:800;padding:9px 12px}button:disabled{cursor:wait;opacity:.65}@media(max-width:760px){main{padding:20px}.check{grid-template-columns:1fr}}</style></head><body><main><section class="hero"><p class="eyebrow">Self-hosted readiness</p><h1>${escapeHtml(title)}</h1><p>One deployable pass/fail report for quality gates, provider failover, session health, handoffs, routing evidence, and optional carrier readiness.</p><p class="status ${escapeHtml(report.status)}">Overall: ${escapeHtml(report.status.toUpperCase())}</p><p>Checked ${escapeHtml(new Date(report.checkedAt).toLocaleString())}</p></section><section class="checks">${checks}</section></main><script>document.querySelectorAll("[data-readiness-action]").forEach((button)=>{button.addEventListener("click",async()=>{const url=button.getAttribute("data-action-url");if(!url)return;button.disabled=true;const original=button.textContent;button.textContent="Running...";try{const response=await fetch(url,{method:"POST"});button.textContent=response.ok?"Done. Reloading...":"Failed";if(response.ok)setTimeout(()=>location.reload(),500)}catch{button.textContent="Failed"}finally{setTimeout(()=>{button.disabled=false;button.textContent=original},1500)}})});</script></body></html>`;
};

export const createVoiceProductionReadinessRoutes = (
	options: VoiceProductionReadinessRoutesOptions
) => {
	const path = options.path ?? '/api/production-readiness';
	const htmlPath = options.htmlPath ?? '/production-readiness';
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-production-readiness'
	});

	routes.get(path, async ({ query, request }) =>
		buildVoiceProductionReadinessReport(options, { query, request })
	);
	if (htmlPath !== false) {
		routes.get(htmlPath, async ({ query, request }) => {
			const report = await buildVoiceProductionReadinessReport(options, {
				query,
				request
			});
			const body = await (options.render ?? renderVoiceProductionReadinessHTML)(
				report
			);

			return new Response(body, {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		});
	}

	return routes;
};
