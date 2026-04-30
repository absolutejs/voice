import { Elysia } from 'elysia';
import { summarizeVoiceHandoffHealth } from './handoffHealth';
import { summarizeVoiceProviderHealth } from './providerHealth';
import { evaluateVoiceQuality } from './qualityRoutes';
import {
	listVoiceRoutingEvents,
	summarizeVoiceRoutingSessions
} from './resilienceRoutes';
import {
	summarizeVoiceProviderFallbackRecovery,
	summarizeVoiceSessions,
	type VoiceProviderFallbackRecoverySummary
} from './sessionReplay';
import {
	createVoiceTelephonyCarrierMatrix,
	type VoiceTelephonyCarrierMatrix,
	type VoiceTelephonyCarrierMatrixInput
} from './telephony/matrix';
import {
	buildVoiceTelephonyWebhookSecurityReport,
	type VoiceTelephonyWebhookSecurityOptions,
	type VoiceTelephonyWebhookSecurityReport
} from './telephony/security';
import type {
	VoiceMonitorNotifierDeliveryReport,
	VoiceMonitorRunReport
} from './voiceMonitoring';
import type { VoiceTraceEventStore } from './trace';
import type { VoiceTraceSinkDeliveryStore } from './trace';
import { summarizeVoiceTraceSinkDeliveries } from './queue';
import type { VoiceAgentSquadContractReport } from './agentSquadContract';
import type { VoiceBargeInReport } from './bargeInRoutes';
import type {
	VoiceDeliveryRuntime,
	VoiceDeliveryRuntimeSummary
} from './deliveryRuntime';
import type { VoiceProviderRoutingContractReport } from './providerRoutingContract';
import type { VoicePhoneAgentProductionSmokeReport } from './phoneAgentProductionSmoke';
import type { VoiceReconnectContractReport } from './reconnectContract';
import type {
	VoiceAuditEventStore,
	VoiceAuditEventType,
	VoiceAuditOutcome
} from './audit';
import {
	summarizeVoiceAuditSinkDeliveries,
	type VoiceAuditSinkDeliveryStore
} from './auditSinks';
import { buildVoiceOpsActionHistoryReport } from './opsActionAuditRoutes';
import type {
	VoiceProviderContractMatrixReport,
	VoiceProviderStackCapabilityGapReport
} from './providerStackRecommendations';
import {
	buildVoiceProviderSloReport,
	type VoiceProviderSloReport,
	type VoiceProviderSloReportOptions
} from './providerSlo';
import type { VoiceProviderOrchestrationReport } from './providerOrchestration';
import type { VoiceCampaignReadinessProofReport } from './campaign';
import {
	buildVoiceOpsRecoveryReadinessCheck,
	type VoiceOpsRecoveryReport
} from './opsRecovery';
import {
	buildVoiceObservabilityExportDeliveryHistory,
	replayVoiceObservabilityExport,
	type VoiceObservabilityExportDeliveryHistory,
	type VoiceObservabilityExportDeliveryReceiptStore,
	type VoiceObservabilityExportReplayReport,
	type VoiceObservabilityExportReplaySource,
	type VoiceObservabilityExportReport
} from './observabilityExport';
import type { VoiceMediaPipelineReport } from './mediaPipelineRoutes';
import type { VoiceTelephonyMediaReport } from './telephonyMediaRoutes';
import type { MediaWebRTCStatsReport } from '@absolutejs/media';

export type VoiceProductionReadinessObservabilityExportDeliveryHistoryOptions = {
	failOnMissing?: boolean;
	failOnStale?: boolean;
	history?: VoiceObservabilityExportDeliveryHistory;
	maxAgeMs?: number;
	store?: VoiceObservabilityExportDeliveryReceiptStore;
};

export type VoiceProductionReadinessStatus = 'fail' | 'pass' | 'warn';

export type VoiceProductionReadinessAction = {
	description?: string;
	href: string;
	label: string;
	method?: 'GET' | 'POST';
};

export type VoiceProductionReadinessGateExplanation = {
	evidenceHref?: string;
	observed?: number | string;
	remediation: string;
	sourceHref?: string;
	threshold?: number | string;
	thresholdLabel?: string;
	unit?: 'count' | 'ms' | 'rate' | 'status';
};

export type VoiceProductionReadinessCheck = {
	actions?: VoiceProductionReadinessAction[];
	detail?: string;
	gateExplanation?: VoiceProductionReadinessGateExplanation;
	href?: string;
	label: string;
	proofSource?: VoiceProductionReadinessProofSource;
	status: VoiceProductionReadinessStatus;
	value?: number | string;
};

export type VoiceProductionReadinessGateIssue = {
	code: string;
	detail?: string;
	href?: string;
	label: string;
	status: Exclude<VoiceProductionReadinessStatus, 'pass'>;
	value?: number | string;
};

export type VoiceProductionReadinessGateOptions = {
	failOnWarnings?: boolean;
};

export type VoiceProductionReadinessGateReport = {
	checkedAt: number;
	failures: VoiceProductionReadinessGateIssue[];
	ok: boolean;
	profile?: VoiceProductionReadinessGateProfile;
	status: VoiceProductionReadinessStatus;
	warnings: VoiceProductionReadinessGateIssue[];
};

export type VoiceProductionReadinessAssertionInput = {
	maxFailures?: number;
	maxWarnings?: number;
	requiredChecks?: string[];
	requireGateOk?: boolean;
	requireStatus?: VoiceProductionReadinessStatus;
};

export type VoiceProductionReadinessAssertionReport = {
	checks: string[];
	failures: number;
	gateOk: boolean;
	issues: string[];
	ok: boolean;
	status: VoiceProductionReadinessStatus;
	warnings: number;
};

export type VoiceProductionReadinessProofSource = {
	detail?: string;
	href?: string;
	label?: string;
	source: string;
	sourceLabel: string;
};

export type VoiceProductionReadinessProfileSurface = {
	configured: boolean;
	href?: string;
	key: string;
	label: string;
};

export type VoiceProductionReadinessProfileExplanation = {
	description: string;
	name: string;
	purpose: string;
	surfaces: VoiceProductionReadinessProfileSurface[];
};

export type VoiceProductionReadinessGateProfileSurface =
	VoiceProductionReadinessProfileSurface & {
		issues: VoiceProductionReadinessGateIssue[];
		status: VoiceProductionReadinessStatus;
	};

export type VoiceProductionReadinessGateProfile = Omit<
	VoiceProductionReadinessProfileExplanation,
	'surfaces'
> & {
	surfaces: VoiceProductionReadinessGateProfileSurface[];
};

export type VoiceProductionReadinessReport = {
	checkedAt: number;
	checks: VoiceProductionReadinessCheck[];
	links: {
		agentSquadContracts?: string;
		audit?: string;
		auditDeliveries?: string;
		bargeIn?: string;
		campaignReadiness?: string;
		carriers?: string;
		deliveryRuntime?: string;
		handoffs?: string;
		handoffRetry?: string;
		liveLatency?: string;
		operationsRecords?: string;
		observabilityExport?: string;
		observabilityExportDeliveries?: string;
		monitoring?: string;
		monitoringNotifierDelivery?: string;
		browserMedia?: string;
		mediaPipeline?: string;
		opsActions?: string;
		opsRecovery?: string;
		phoneAgentSmoke?: string;
		telephonyWebhookSecurity?: string;
		telephonyMedia?: string;
		providerContracts?: string;
		providerOrchestration?: string;
		providerRoutingContracts?: string;
		providerSlo?: string;
		quality?: string;
		reconnectContracts?: string;
		resilience?: string;
		sessions?: string;
		sloReadinessThresholds?: string;
		traceDeliveries?: string;
	};
	profile?: VoiceProductionReadinessProfileExplanation;
	proofSources?: Record<string, VoiceProductionReadinessProofSource>;
	operationsRecords?: VoiceProductionReadinessOperationsRecordLinks;
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
		bargeIn?: {
			failed: number;
			passed: number;
			status: VoiceProductionReadinessStatus;
			total: number;
			warnings: number;
		};
		campaignReadiness?: {
			failed: number;
			passed: number;
			status: VoiceProductionReadinessStatus;
			total: number;
		};
		carriers?: {
			failing: number;
			providers: number;
			ready: number;
			status: VoiceProductionReadinessStatus;
			warnings: number;
		};
		deliveryRuntime?: VoiceProductionReadinessDeliveryRuntimeSummary;
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
		monitoring?: {
			criticalOpen: number;
			elapsedMs?: number;
			open: number;
			status: VoiceProductionReadinessStatus;
			total: number;
		};
		monitoringNotifierDelivery?: {
			elapsedMs?: number;
			failed: number;
			notifiers: number;
			sent: number;
			status: VoiceProductionReadinessStatus;
			total: number;
		};
		mediaPipeline?: {
			assistantAudioFrames: number;
			backpressureEvents: number;
			gapCount: number;
			inputAudioFrames: number;
			issues: number;
			jitterMs?: number;
			speechRatio: number;
			status: VoiceProductionReadinessStatus;
			timestampDriftMs?: number;
		};
		browserMedia?: {
			activeCandidatePairs: number;
			bytesReceived: number;
			bytesSent: number;
			issues: number;
			jitterMs?: number;
			liveAudioTracks: number;
			packetLossRatio: number;
			roundTripTimeMs?: number;
			status: VoiceProductionReadinessStatus;
		};
		opsActionHistory?: VoiceProductionReadinessOpsActionHistorySummary;
		opsRecovery?: {
			issues: number;
			recoveredFallbacks: number;
			status: VoiceProductionReadinessStatus;
			unresolvedProviderFailures: number;
		};
		observabilityExport?: {
			artifacts: number;
			auditEvents: number;
			envelopes: number;
			issues: number;
			status: VoiceProductionReadinessStatus;
			traceEvents: number;
		};
		observabilityExportDeliveryHistory?: {
			delivered: number;
			failed: number;
			latestSuccessAgeMs?: number;
			receipts: number;
			status: VoiceProductionReadinessStatus;
			totalDestinations: number;
		};
		observabilityExportReplay?: {
			artifacts: number;
			deliveryDestinations: number;
			failedArtifacts: number;
			failedDeliveryDestinations: number;
			issues: number;
			status: VoiceProductionReadinessStatus;
			validationIssues: number;
		};
		providers: {
			degraded: number;
			total: number;
		};
		providerStack?: VoiceProviderStackCapabilityGapReport;
		providerContractMatrix?: VoiceProviderContractMatrixReport;
		providerOrchestration?: {
			failed: number;
			issues: number;
			passed: number;
			providers: number;
			status: VoiceProductionReadinessStatus;
			surfaces: number;
			warned: number;
		};
		providerRecovery: VoiceProviderFallbackRecoverySummary;
		phoneAgentSmokes?: {
			failed: number;
			passed: number;
			status: VoiceProductionReadinessStatus;
			total: number;
		};
		telephonyWebhookSecurity?: {
			enabled: number;
			failed: number;
			passed: number;
			status: VoiceProductionReadinessStatus;
			warned: number;
		};
		telephonyMedia?: {
			audioBytes: number;
			carriers: number;
			failed: number;
			issues: number;
			passed: number;
			status: VoiceProductionReadinessStatus;
		};
		providerRoutingContracts?: {
			failed: number;
			passed: number;
			status: VoiceProductionReadinessStatus;
			total: number;
		};
		providerSlo?: {
			events: number;
			eventsWithLatency: number;
			issues: number;
			status: VoiceProductionReadinessStatus;
		};
		reconnectContracts?: {
			failed: number;
			passed: number;
			resumeLatencyP95Ms?: number;
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

export type VoiceProductionReadinessOperationsRecordLink = {
	detail?: string;
	href: string;
	label: string;
	sessionId: string;
	status: VoiceProductionReadinessStatus;
};

export type VoiceProductionReadinessOperationsRecordLinks = {
	failedSessions: VoiceProductionReadinessOperationsRecordLink[];
	failingLatency: VoiceProductionReadinessOperationsRecordLink[];
	mediaQuality: VoiceProductionReadinessOperationsRecordLink[];
	providerErrors: VoiceProductionReadinessOperationsRecordLink[];
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

export type VoiceProductionReadinessOpsActionHistorySummary = {
	failed: number;
	passed: number;
	status: VoiceProductionReadinessStatus;
	total: number;
	warnWhenEmpty: boolean;
};

export type VoiceProductionReadinessDeliveryRuntimeSummary = {
	audit?: VoiceProductionReadinessDeliveryRuntimeQueueSummary;
	deadLettered: number;
	delivered: number;
	failed: number;
	pending: number;
	retryEligible: number;
	skipped: number;
	status: VoiceProductionReadinessStatus;
	total: number;
	trace?: VoiceProductionReadinessDeliveryRuntimeQueueSummary;
};

export type VoiceProductionReadinessDeliveryRuntimeQueueSummary = {
	deadLettered: number;
	delivered: number;
	failed: number;
	pending: number;
	retryEligible: number;
	skipped: number;
	total: number;
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

export type VoiceProductionReadinessOpsActionHistoryOptions =
	| VoiceAuditEventStore
	| {
			failOnFailedActions?: boolean;
			store: VoiceAuditEventStore;
			warnWhenEmpty?: boolean;
	  };

export type VoiceProductionReadinessRouteInput = {
	query: Record<string, unknown>;
	request: Request;
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
	bargeInReports?:
		| false
		| readonly VoiceBargeInReport[]
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) => Promise<readonly VoiceBargeInReport[]> | readonly VoiceBargeInReport[]);
	carriers?:
		| false
		| readonly VoiceTelephonyCarrierMatrixInput[]
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<readonly VoiceTelephonyCarrierMatrixInput[]>
				| readonly VoiceTelephonyCarrierMatrixInput[]);
	campaignReadiness?:
		| false
		| VoiceCampaignReadinessProofReport
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<VoiceCampaignReadinessProofReport>
				| VoiceCampaignReadinessProofReport);
	deliveryRuntime?:
		| false
		| VoiceDeliveryRuntime
		| VoiceDeliveryRuntimeSummary
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<VoiceDeliveryRuntime | VoiceDeliveryRuntimeSummary>
				| VoiceDeliveryRuntime
				| VoiceDeliveryRuntimeSummary);
	headers?: HeadersInit;
	gate?: false | VoiceProductionReadinessGateOptions;
	gatePath?: false | string;
	htmlPath?: false | string;
	links?: VoiceProductionReadinessReport['links'];
	llmProviders?: readonly string[];
	name?: string;
	monitoring?:
		| false
		| VoiceMonitorRunReport
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) => Promise<VoiceMonitorRunReport> | VoiceMonitorRunReport);
	monitoringNotifierDelivery?:
		| false
		| VoiceMonitorNotifierDeliveryReport
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<VoiceMonitorNotifierDeliveryReport>
				| VoiceMonitorNotifierDeliveryReport);
	mediaPipeline?:
		| false
		| VoiceMediaPipelineReport
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) => Promise<VoiceMediaPipelineReport> | VoiceMediaPipelineReport);
	browserMedia?:
		| false
		| MediaWebRTCStatsReport
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) => Promise<MediaWebRTCStatsReport> | MediaWebRTCStatsReport);
	telephonyMedia?:
		| false
		| VoiceTelephonyMediaReport
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) => Promise<VoiceTelephonyMediaReport> | VoiceTelephonyMediaReport);
	opsActionHistory?: false | VoiceProductionReadinessOpsActionHistoryOptions;
	opsRecovery?:
		| false
		| VoiceOpsRecoveryReport
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) => Promise<VoiceOpsRecoveryReport> | VoiceOpsRecoveryReport);
	observabilityExport?:
		| false
		| VoiceObservabilityExportReport
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<VoiceObservabilityExportReport>
				| VoiceObservabilityExportReport);
	observabilityExportDeliveryHistory?:
		| false
		| VoiceObservabilityExportDeliveryHistory
		| VoiceObservabilityExportDeliveryReceiptStore
		| VoiceProductionReadinessObservabilityExportDeliveryHistoryOptions
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<
						| VoiceObservabilityExportDeliveryHistory
						| VoiceObservabilityExportDeliveryReceiptStore
						| VoiceProductionReadinessObservabilityExportDeliveryHistoryOptions
				  >
				| VoiceObservabilityExportDeliveryHistory
				| VoiceObservabilityExportDeliveryReceiptStore
				| VoiceProductionReadinessObservabilityExportDeliveryHistoryOptions);
	observabilityExportReplay?:
		| false
		| VoiceObservabilityExportReplayReport
		| VoiceObservabilityExportReplaySource
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<
						VoiceObservabilityExportReplayReport | VoiceObservabilityExportReplaySource
				  >
				| VoiceObservabilityExportReplayReport
				| VoiceObservabilityExportReplaySource);
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
	telephonyWebhookSecurity?:
		| false
		| VoiceTelephonyWebhookSecurityReport
		| VoiceTelephonyWebhookSecurityOptions
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<
						VoiceTelephonyWebhookSecurityReport | VoiceTelephonyWebhookSecurityOptions
				  >
				| VoiceTelephonyWebhookSecurityReport
				| VoiceTelephonyWebhookSecurityOptions);
	providerRoutingContracts?:
		| false
		| readonly VoiceProviderRoutingContractReport[]
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<readonly VoiceProviderRoutingContractReport[]>
				| readonly VoiceProviderRoutingContractReport[]);
	providerSlo?:
		| false
		| VoiceProviderSloReport
		| VoiceProviderSloReportOptions
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<VoiceProviderSloReport | VoiceProviderSloReportOptions>
				| VoiceProviderSloReport
				| VoiceProviderSloReportOptions);
	providerOrchestration?:
		| false
		| VoiceProviderOrchestrationReport
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<VoiceProviderOrchestrationReport>
				| VoiceProviderOrchestrationReport);
	providerStack?:
		| false
		| VoiceProviderStackCapabilityGapReport
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<VoiceProviderStackCapabilityGapReport>
				| VoiceProviderStackCapabilityGapReport);
	providerContractMatrix?:
		| false
		| VoiceProviderContractMatrixReport
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<VoiceProviderContractMatrixReport>
				| VoiceProviderContractMatrixReport);
	reconnectContracts?:
		| false
		| readonly VoiceReconnectContractReport[]
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<readonly VoiceReconnectContractReport[]>
				| readonly VoiceReconnectContractReport[]);
	proofSources?:
		| false
		| Record<string, VoiceProductionReadinessProofSource>
		| ((input: {
				query: Record<string, unknown>;
				request: Request;
		  }) =>
				| Promise<Record<string, VoiceProductionReadinessProofSource>>
				| Record<string, VoiceProductionReadinessProofSource>);
	profile?: false | VoiceProductionReadinessProfileExplanation;
	render?: (report: VoiceProductionReadinessReport) => string | Promise<string>;
	resolveOptions?: (
		input: VoiceProductionReadinessRouteInput
	) =>
		| Promise<Partial<Omit<VoiceProductionReadinessRoutesOptions, 'resolveOptions'>>>
		| Partial<Omit<VoiceProductionReadinessRoutesOptions, 'resolveOptions'>>;
	store: VoiceTraceEventStore;
	sttProviders?: readonly string[];
	title?: string;
	traceDeliveries?: false | VoiceProductionReadinessTraceDeliveryOptions;
	ttsProviders?: readonly string[];
	liveLatencyWarnAfterMs?: number;
	liveLatencyFailAfterMs?: number;
	liveLatencyMaxAgeMs?: number;
	monitoringRunFailAfterMs?: number;
	monitoringNotifierDeliveryFailAfterMs?: number;
	reconnectResumeFailAfterMs?: number;
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

const readinessGateCodes: Record<string, string> = {
	'Agent squad contracts': 'voice.readiness.agent_squad_contracts',
	'Audit evidence': 'voice.readiness.audit_evidence',
	'Audit sink delivery': 'voice.readiness.audit_sink_delivery',
	'Barge-in interruption proof': 'voice.readiness.barge_in_interruption',
	'Browser media transport': 'voice.readiness.browser_media_transport',
	'Campaign readiness proof': 'voice.readiness.campaign_readiness',
	'Carrier readiness': 'voice.readiness.carrier_readiness',
	'Delivery runtime': 'voice.readiness.delivery_runtime',
	'Handoff delivery': 'voice.readiness.handoff_delivery',
	'Live latency proof': 'voice.readiness.live_latency',
	'Media pipeline quality': 'voice.readiness.media_pipeline_quality',
	'Operations records': 'voice.readiness.operations_records',
	'Operator action history': 'voice.readiness.operator_action_history',
	'Ops recovery': 'voice.readiness.ops_recovery',
	'Observability export delivery':
		'voice.readiness.observability_export_delivery',
	'Observability export replay': 'voice.readiness.observability_export_replay',
	'Phone agent production smoke': 'voice.readiness.phone_agent_smoke',
	'Provider contract matrix': 'voice.readiness.provider_contract_matrix',
	'Provider fallback recovery': 'voice.readiness.provider_fallback_recovery',
	'Provider health': 'voice.readiness.provider_health',
	'Provider routing contracts': 'voice.readiness.provider_routing_contracts',
	'Provider SLO gates': 'voice.readiness.provider_slo_gates',
	'Provider stack capabilities': 'voice.readiness.provider_stack_capabilities',
	'Quality gates': 'voice.readiness.quality_gates',
	'Reconnect recovery contracts': 'voice.readiness.reconnect_contracts',
	'Routing evidence': 'voice.readiness.routing_evidence',
	'Session health': 'voice.readiness.session_health',
	'Trace sink delivery': 'voice.readiness.trace_sink_delivery'
};

const readinessGateCodeForCheck = (check: VoiceProductionReadinessCheck) =>
	readinessGateCodes[check.label] ??
	`voice.readiness.${check.label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')}`;

const normalizeReadinessLabel = (value: string) =>
	value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const issueMatchesProfileSurface = (
	issue: VoiceProductionReadinessGateIssue,
	surface: VoiceProductionReadinessProfileSurface
) =>
	normalizeReadinessLabel(issue.label) ===
		normalizeReadinessLabel(surface.label) ||
	issue.code.includes(
		surface.key
			.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
	);

const summarizeProfileSurfaceStatus = (
	issues: VoiceProductionReadinessGateIssue[]
): VoiceProductionReadinessStatus =>
	issues.some((issue) => issue.status === 'fail')
		? 'fail'
		: issues.some((issue) => issue.status === 'warn')
			? 'warn'
			: 'pass';

const summarizeVoiceProductionReadinessGateProfile = (
	report: VoiceProductionReadinessReport,
	issues: VoiceProductionReadinessGateIssue[]
): VoiceProductionReadinessGateProfile | undefined => {
	if (!report.profile) {
		return undefined;
	}

	return {
		description: report.profile.description,
		name: report.profile.name,
		purpose: report.profile.purpose,
		surfaces: report.profile.surfaces.map((surface) => {
			const surfaceIssues = issues.filter((issue) =>
				issueMatchesProfileSurface(issue, surface)
			);

			return {
				...surface,
				issues: surfaceIssues,
				status: summarizeProfileSurfaceStatus(surfaceIssues)
			};
		})
	};
};

export const summarizeVoiceProductionReadinessGate = (
	report: VoiceProductionReadinessReport,
	options: VoiceProductionReadinessGateOptions = {}
): VoiceProductionReadinessGateReport => {
	const issues = report.checks
		.filter((check) => check.status !== 'pass')
		.map((check): VoiceProductionReadinessGateIssue => ({
			code: readinessGateCodeForCheck(check),
			detail: check.detail,
			href: check.href,
			label: check.label,
			status: check.status as Exclude<VoiceProductionReadinessStatus, 'pass'>,
			value: check.value
		}));
	const failures = issues.filter((issue) => issue.status === 'fail');
	const warnings = issues.filter((issue) => issue.status === 'warn');
	const ok =
		failures.length === 0 &&
		(options.failOnWarnings ? warnings.length === 0 : true);

	return {
		checkedAt: report.checkedAt,
		failures,
		ok,
		profile: summarizeVoiceProductionReadinessGateProfile(report, issues),
		status: ok ? report.status : 'fail',
		warnings
	};
};

export const evaluateVoiceProductionReadinessEvidence = (
	report: VoiceProductionReadinessReport,
	input: VoiceProductionReadinessAssertionInput = {}
): VoiceProductionReadinessAssertionReport => {
	const gate = summarizeVoiceProductionReadinessGate(report);
	const issues: string[] = [];
	const checks = report.checks.map((check) => check.label).sort();
	const requiredStatus = input.requireStatus ?? 'pass';
	const requireGateOk = input.requireGateOk ?? true;
	const maxFailures = input.maxFailures ?? 0;
	const maxWarnings = input.maxWarnings;

	if (report.status !== requiredStatus) {
		issues.push(
			`Expected production readiness status ${requiredStatus}, found ${report.status}.`
		);
	}
	if (requireGateOk && !gate.ok) {
		issues.push(
			`Expected production readiness gate to pass, found ${gate.status}.`
		);
	}
	if (gate.failures.length > maxFailures) {
		issues.push(
			`Expected at most ${String(maxFailures)} production readiness failures, found ${String(gate.failures.length)}.`
		);
	}
	if (maxWarnings !== undefined && gate.warnings.length > maxWarnings) {
		issues.push(
			`Expected at most ${String(maxWarnings)} production readiness warnings, found ${String(gate.warnings.length)}.`
		);
	}
	for (const check of input.requiredChecks ?? []) {
		if (!checks.includes(check)) {
			issues.push(`Missing production readiness check: ${check}.`);
		}
	}

	return {
		checks,
		failures: gate.failures.length,
		gateOk: gate.ok,
		issues,
		ok: issues.length === 0,
		status: report.status,
		warnings: gate.warnings.length
	};
};

export const assertVoiceProductionReadinessEvidence = (
	report: VoiceProductionReadinessReport,
	input: VoiceProductionReadinessAssertionInput = {}
): VoiceProductionReadinessAssertionReport => {
	const assertion = evaluateVoiceProductionReadinessEvidence(report, input);
	if (!assertion.ok) {
		throw new Error(
			`Voice production readiness assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
};

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

const isVoiceProviderSloReport = (
	value: VoiceProviderSloReport | VoiceProviderSloReportOptions
): value is VoiceProviderSloReport =>
	typeof (value as VoiceProviderSloReport).status === 'string' &&
	typeof (value as VoiceProviderSloReport).checkedAt === 'number' &&
	typeof (value as VoiceProviderSloReport).events === 'number';

const resolveProviderSlo = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (options.providerSlo === false || options.providerSlo === undefined) {
		return undefined;
	}

	const value =
		typeof options.providerSlo === 'function'
			? await options.providerSlo(input)
			: options.providerSlo;

	return isVoiceProviderSloReport(value)
		? value
		: buildVoiceProviderSloReport({
				...value,
				events: value.events,
				store: value.store ?? options.store
			});
};

const resolveProviderOrchestration = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (
		options.providerOrchestration === false ||
		options.providerOrchestration === undefined
	) {
		return undefined;
	}

	return typeof options.providerOrchestration === 'function'
		? await options.providerOrchestration(input)
		: options.providerOrchestration;
};

const resolveProviderStack = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (options.providerStack === false || options.providerStack === undefined) {
		return undefined;
	}

	return typeof options.providerStack === 'function'
		? await options.providerStack(input)
		: options.providerStack;
};

const resolveProviderContractMatrix = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (
		options.providerContractMatrix === false ||
		options.providerContractMatrix === undefined
	) {
		return undefined;
	}

	return typeof options.providerContractMatrix === 'function'
		? await options.providerContractMatrix(input)
		: options.providerContractMatrix;
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

const resolveMonitoring = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (options.monitoring === false || options.monitoring === undefined) {
		return undefined;
	}

	return typeof options.monitoring === 'function'
		? await options.monitoring(input)
		: options.monitoring;
};

const resolveMonitoringNotifierDelivery = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (
		options.monitoringNotifierDelivery === false ||
		options.monitoringNotifierDelivery === undefined
	) {
		return undefined;
	}

	return typeof options.monitoringNotifierDelivery === 'function'
		? await options.monitoringNotifierDelivery(input)
		: options.monitoringNotifierDelivery;
};

const resolveMediaPipeline = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (options.mediaPipeline === false || options.mediaPipeline === undefined) {
		return undefined;
	}

	return typeof options.mediaPipeline === 'function'
		? await options.mediaPipeline(input)
		: options.mediaPipeline;
};

const resolveBrowserMedia = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (options.browserMedia === false || options.browserMedia === undefined) {
		return undefined;
	}

	return typeof options.browserMedia === 'function'
		? await options.browserMedia(input)
		: options.browserMedia;
};

const resolveTelephonyMedia = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (options.telephonyMedia === false || options.telephonyMedia === undefined) {
		return undefined;
	}

	return typeof options.telephonyMedia === 'function'
		? await options.telephonyMedia(input)
		: options.telephonyMedia;
};

const isVoiceTelephonyWebhookSecurityReport = (
	value: VoiceTelephonyWebhookSecurityReport | VoiceTelephonyWebhookSecurityOptions
): value is VoiceTelephonyWebhookSecurityReport =>
	typeof (value as VoiceTelephonyWebhookSecurityReport).generatedAt ===
		'number' &&
	Array.isArray((value as VoiceTelephonyWebhookSecurityReport).providers) &&
	typeof (value as VoiceTelephonyWebhookSecurityReport).status === 'string';

const resolveTelephonyWebhookSecurity = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (
		options.telephonyWebhookSecurity === false ||
		options.telephonyWebhookSecurity === undefined
	) {
		return undefined;
	}

	const source =
		typeof options.telephonyWebhookSecurity === 'function'
			? await options.telephonyWebhookSecurity(input)
			: options.telephonyWebhookSecurity;

	return isVoiceTelephonyWebhookSecurityReport(source)
		? source
		: buildVoiceTelephonyWebhookSecurityReport(source);
};

const resolveReconnectContracts = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (
		options.reconnectContracts === false ||
		options.reconnectContracts === undefined
	) {
		return undefined;
	}

	return typeof options.reconnectContracts === 'function'
		? await options.reconnectContracts(input)
		: options.reconnectContracts;
};

const resolveBargeInReports = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (options.bargeInReports === false || options.bargeInReports === undefined) {
		return undefined;
	}

	return typeof options.bargeInReports === 'function'
		? await options.bargeInReports(input)
		: options.bargeInReports;
};

const resolveCampaignReadiness = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (
		options.campaignReadiness === false ||
		options.campaignReadiness === undefined
	) {
		return undefined;
	}

	return typeof options.campaignReadiness === 'function'
		? await options.campaignReadiness(input)
		: options.campaignReadiness;
};

const resolveProofSources = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (options.proofSources === false || options.proofSources === undefined) {
		return undefined;
	}

	return typeof options.proofSources === 'function'
		? await options.proofSources(input)
		: options.proofSources;
};

const isVoiceDeliveryRuntime = (
	value: VoiceDeliveryRuntime | VoiceDeliveryRuntimeSummary
): value is VoiceDeliveryRuntime =>
	typeof (value as VoiceDeliveryRuntime).summarize === 'function';

const resolveDeliveryRuntime = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (options.deliveryRuntime === false || options.deliveryRuntime === undefined) {
		return undefined;
	}

	const runtime =
		typeof options.deliveryRuntime === 'function'
			? await options.deliveryRuntime(input)
			: options.deliveryRuntime;

	return isVoiceDeliveryRuntime(runtime) ? await runtime.summarize() : runtime;
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

const summarizeOpsActionHistory = async (
	options: VoiceProductionReadinessRoutesOptions
): Promise<VoiceProductionReadinessOpsActionHistorySummary | undefined> => {
	if (!options.opsActionHistory) {
		return undefined;
	}

	const opsActionHistory =
		'list' in options.opsActionHistory
			? {
					failOnFailedActions: true,
					store: options.opsActionHistory,
					warnWhenEmpty: false
				}
			: {
					failOnFailedActions:
						options.opsActionHistory.failOnFailedActions ?? true,
					store: options.opsActionHistory.store,
					warnWhenEmpty: options.opsActionHistory.warnWhenEmpty ?? false
				};
	const report = await buildVoiceOpsActionHistoryReport({
		audit: opsActionHistory.store
	});
	const status: VoiceProductionReadinessStatus =
		report.failed > 0
			? opsActionHistory.failOnFailedActions
				? 'fail'
				: 'warn'
			: report.total === 0 && opsActionHistory.warnWhenEmpty
				? 'warn'
				: 'pass';

	return {
		failed: report.failed,
		passed: report.passed,
		status,
		total: report.total,
		warnWhenEmpty: opsActionHistory.warnWhenEmpty
	};
};

const resolveOpsRecovery = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: { query: Record<string, unknown>; request: Request }
): Promise<VoiceOpsRecoveryReport | undefined> => {
	if (!options.opsRecovery) {
		return undefined;
	}
	if (typeof options.opsRecovery === 'function') {
		return options.opsRecovery(input);
	}
	return options.opsRecovery;
};

const resolveObservabilityExport = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: { query: Record<string, unknown>; request: Request }
): Promise<VoiceObservabilityExportReport | undefined> => {
	if (!options.observabilityExport) {
		return undefined;
	}
	if (typeof options.observabilityExport === 'function') {
		return options.observabilityExport(input);
	}
	return options.observabilityExport;
};

const isVoiceObservabilityExportDeliveryReceiptStore = (
	value: unknown
): value is VoiceObservabilityExportDeliveryReceiptStore =>
	typeof value === 'object' &&
	value !== null &&
	'get' in value &&
	'list' in value &&
	'set' in value;

const isVoiceObservabilityExportDeliveryHistory = (
	value: unknown
): value is VoiceObservabilityExportDeliveryHistory =>
	typeof value === 'object' &&
	value !== null &&
	'receipts' in value &&
	Array.isArray((value as VoiceObservabilityExportDeliveryHistory).receipts) &&
	'summary' in value;

const resolveObservabilityExportDeliveryHistory = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: { query: Record<string, unknown>; request: Request }
): Promise<
	| (VoiceProductionReadinessObservabilityExportDeliveryHistoryOptions & {
			history: VoiceObservabilityExportDeliveryHistory;
	  })
	| undefined
> => {
	if (!options.observabilityExportDeliveryHistory) {
		return undefined;
	}

	const source =
		typeof options.observabilityExportDeliveryHistory === 'function'
			? await options.observabilityExportDeliveryHistory(input)
			: options.observabilityExportDeliveryHistory;

	if (!source) {
		return undefined;
	}

	if (isVoiceObservabilityExportDeliveryHistory(source)) {
		return { history: source };
	}

	if (isVoiceObservabilityExportDeliveryReceiptStore(source)) {
		return {
			history: await buildVoiceObservabilityExportDeliveryHistory(source),
			store: source
		};
	}

	if (source.history) {
		return {
			...source,
			history: source.history
		};
	}

	if (source.store) {
		return {
			...source,
			history: await buildVoiceObservabilityExportDeliveryHistory(source.store)
		};
	}

	return undefined;
};

const isVoiceObservabilityExportReplayReport = (
	value: VoiceObservabilityExportReplayReport | VoiceObservabilityExportReplaySource
): value is VoiceObservabilityExportReplayReport =>
	typeof (value as VoiceObservabilityExportReplayReport).checkedAt ===
		'number' &&
	Array.isArray((value as VoiceObservabilityExportReplayReport).issues) &&
	typeof (value as VoiceObservabilityExportReplayReport).status === 'string' &&
	'summary' in value;

const resolveObservabilityExportReplay = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: { query: Record<string, unknown>; request: Request }
): Promise<VoiceObservabilityExportReplayReport | undefined> => {
	if (!options.observabilityExportReplay) {
		return undefined;
	}

	const source =
		typeof options.observabilityExportReplay === 'function'
			? await options.observabilityExportReplay(input)
			: options.observabilityExportReplay;

	return isVoiceObservabilityExportReplayReport(source)
		? source
		: replayVoiceObservabilityExport(source);
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

const summarizeDeliveryRuntime = (
	summary: VoiceDeliveryRuntimeSummary | undefined
): VoiceProductionReadinessDeliveryRuntimeSummary | undefined => {
	if (!summary) {
		return undefined;
	}

	const audit = summary.audit
		? {
				deadLettered: summary.audit.deadLettered,
				delivered: summary.audit.delivered,
				failed: summary.audit.failed,
				pending: summary.audit.pending,
				retryEligible: summary.audit.retryEligible,
				skipped: summary.audit.skipped,
				total: summary.audit.total
			}
		: undefined;
	const trace = summary.trace
		? {
				deadLettered: summary.trace.deadLettered,
				delivered: summary.trace.delivered,
				failed: summary.trace.failed,
				pending: summary.trace.pending,
				retryEligible: summary.trace.retryEligible,
				skipped: summary.trace.skipped,
				total: summary.trace.total
			}
		: undefined;
	const queues = [audit, trace].filter(
		(queue): queue is VoiceProductionReadinessDeliveryRuntimeQueueSummary =>
			Boolean(queue)
	);
	const total = queues.reduce((sum, queue) => sum + queue.total, 0);
	const failed = queues.reduce((sum, queue) => sum + queue.failed, 0);
	const deadLettered = queues.reduce((sum, queue) => sum + queue.deadLettered, 0);
	const pending = queues.reduce((sum, queue) => sum + queue.pending, 0);
	const retryEligible = queues.reduce(
		(sum, queue) => sum + queue.retryEligible,
		0
	);
	const status: VoiceProductionReadinessStatus =
		failed > 0 || deadLettered > 0
			? 'fail'
			: pending > 0 || retryEligible > 0
				? 'warn'
				: 'pass';

	return {
		audit,
		deadLettered,
		delivered: queues.reduce((sum, queue) => sum + queue.delivered, 0),
		failed,
		pending,
		retryEligible,
		skipped: queues.reduce((sum, queue) => sum + queue.skipped, 0),
		status,
		total,
		trace
	};
};

const summarizeLiveLatency = (
	events: Awaited<ReturnType<VoiceTraceEventStore['list']>>,
	options: VoiceProductionReadinessRoutesOptions
) => {
	const warnAfterMs = options.liveLatencyWarnAfterMs ?? 1800;
	const failAfterMs = options.liveLatencyFailAfterMs ?? 3200;
	const minAt =
		typeof options.liveLatencyMaxAgeMs === 'number' &&
		Number.isFinite(options.liveLatencyMaxAgeMs) &&
		options.liveLatencyMaxAgeMs > 0
			? Date.now() - options.liveLatencyMaxAgeMs
			: undefined;
	const latencies = events
		.filter(
			(event) =>
				event.type === 'client.live_latency' &&
				(minAt === undefined || event.at >= minAt)
		)
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

const getString = (value: unknown) =>
	typeof value === 'string' ? value : undefined;

const getNumber = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const voiceOperationsRecordHref = (base: string, sessionId: string) => {
	const encoded = encodeURIComponent(sessionId);
	if (base.includes(':sessionId')) {
		return base.replace(':sessionId', encoded);
	}
	return `${base.replace(/\/+$/, '')}/${encoded}`;
};

const buildOperationsRecordLinks = (input: {
	base: string;
	events: Awaited<ReturnType<VoiceTraceEventStore['list']>>;
	failedSessionIds: string[];
	liveLatencyFailAfterMs: number;
	liveLatencyMaxAgeMs?: number;
	liveLatencyWarnAfterMs: number;
	mediaPipeline?: VoiceMediaPipelineReport;
}): VoiceProductionReadinessOperationsRecordLinks => {
	const failedSessionSet = new Set(input.failedSessionIds);
	const minLiveLatencyAt =
		typeof input.liveLatencyMaxAgeMs === 'number' &&
		Number.isFinite(input.liveLatencyMaxAgeMs) &&
		input.liveLatencyMaxAgeMs > 0
			? Date.now() - input.liveLatencyMaxAgeMs
			: undefined;
	const providerErrors = input.events
		.filter(
			(event) =>
				event.type === 'session.error' &&
				(event.payload.providerStatus === 'error' ||
					typeof event.payload.error === 'string')
		)
		.map((event): VoiceProductionReadinessOperationsRecordLink => ({
			detail: getString(event.payload.error),
			href: voiceOperationsRecordHref(input.base, event.sessionId),
			label: 'Open provider error operations record',
			sessionId: event.sessionId,
			status: 'fail'
		}));
	const failingLatency = input.events
		.filter(
			(event) =>
				event.type === 'client.live_latency' &&
				(minLiveLatencyAt === undefined || event.at >= minLiveLatencyAt)
		)
		.map((event) => ({
			event,
			latencyMs:
				getNumber(event.payload.latencyMs) ?? getNumber(event.payload.elapsedMs)
		}))
		.filter(
			(
				entry
			): entry is {
				event: Awaited<ReturnType<VoiceTraceEventStore['list']>>[number];
				latencyMs: number;
			} =>
				entry.latencyMs !== undefined &&
				entry.latencyMs > input.liveLatencyWarnAfterMs
		)
		.map(
			({ event, latencyMs }): VoiceProductionReadinessOperationsRecordLink => ({
				detail: `${latencyMs}ms live latency`,
				href: voiceOperationsRecordHref(input.base, event.sessionId),
				label: 'Open latency operations record',
				sessionId: event.sessionId,
				status: latencyMs > input.liveLatencyFailAfterMs ? 'fail' : 'warn'
			})
		);
	const mediaQuality =
		input.mediaPipeline && input.mediaPipeline.status !== 'pass'
			? input.mediaPipeline.sessionIds.map(
					(sessionId): VoiceProductionReadinessOperationsRecordLink => ({
						detail: `${input.mediaPipeline?.quality.issues.length ?? 0} media quality issue(s)`,
						href: voiceOperationsRecordHref(input.base, sessionId),
						label: 'Open media quality operations record',
						sessionId,
						status: 'fail'
					})
				)
			: [];

	return {
		failedSessions: input.failedSessionIds.map((sessionId) => ({
			href: voiceOperationsRecordHref(input.base, sessionId),
			label: 'Open failed session operations record',
			sessionId,
			status: failedSessionSet.has(sessionId) ? 'fail' : 'warn'
		})),
		failingLatency,
		mediaQuality,
		providerErrors
	};
};

const firstOperationsRecordHref = (
	links: VoiceProductionReadinessOperationsRecordLink[]
) => links[0]?.href;

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
	const providerRecovery = summarizeVoiceProviderFallbackRecovery(events);
	const [
		quality,
		providers,
		sessions,
		handoffs,
		audit,
		auditDeliveries,
		opsActionHistory,
		traceDeliveries,
		deliveryRuntimeSummary,
		carriers,
		agentSquadContracts,
		providerRoutingContracts,
		providerSlo,
		providerOrchestration,
		providerStack,
		providerContractMatrix,
		phoneAgentSmokes,
		monitoring,
		monitoringNotifierDelivery,
		mediaPipeline,
		browserMedia,
		telephonyMedia,
		telephonyWebhookSecurity,
		reconnectContracts,
		bargeInReports,
		campaignReadiness,
		opsRecovery,
		observabilityExport,
		observabilityExportDeliveryHistory,
		observabilityExportReplay,
		proofSources
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
		summarizeOpsActionHistory(options),
		summarizeTraceDeliveries(options),
		resolveDeliveryRuntime(options, { query, request }),
		resolveCarriers(options, { query, request }),
		resolveAgentSquadContracts(options, { query, request }),
		resolveProviderRoutingContracts(options, { query, request }),
		resolveProviderSlo(options, { query, request }),
		resolveProviderOrchestration(options, { query, request }),
		resolveProviderStack(options, { query, request }),
		resolveProviderContractMatrix(options, { query, request }),
		resolvePhoneAgentSmokes(options, { query, request }),
		resolveMonitoring(options, { query, request }),
		resolveMonitoringNotifierDelivery(options, { query, request }),
		resolveMediaPipeline(options, { query, request }),
		resolveBrowserMedia(options, { query, request }),
		resolveTelephonyMedia(options, { query, request }),
		resolveTelephonyWebhookSecurity(options, { query, request }),
		resolveReconnectContracts(options, { query, request }),
		resolveBargeInReports(options, { query, request }),
		resolveCampaignReadiness(options, { query, request }),
		resolveOpsRecovery(options, { query, request }),
		resolveObservabilityExport(options, { query, request }),
		resolveObservabilityExportDeliveryHistory(options, { query, request }),
		resolveObservabilityExportReplay(options, { query, request }),
		resolveProofSources(options, { query, request })
	]);
	const deliveryRuntime = summarizeDeliveryRuntime(deliveryRuntimeSummary);
	const degradedProviders = providers.filter(
		(provider) =>
			provider.status === 'degraded' ||
			provider.status === 'rate-limited' ||
			provider.status === 'suppressed'
	).length;
	const failedSessions = sessions.filter(
		(session) => session.status === 'failed'
	).length;
	const failedSessionItems = sessions.filter(
		(session) => session.status === 'failed'
	);
	const operationsRecords = buildOperationsRecordLinks({
		base: options.links?.operationsRecords ?? '/voice-operations',
		events,
		failedSessionIds: failedSessionItems.map((session) => session.sessionId),
		liveLatencyFailAfterMs: options.liveLatencyFailAfterMs ?? 3200,
		liveLatencyMaxAgeMs: options.liveLatencyMaxAgeMs,
		liveLatencyWarnAfterMs: options.liveLatencyWarnAfterMs ?? 1800,
		mediaPipeline
	});
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
				providerRecovery.unresolvedErrors > 0
					? `${providerRecovery.unresolvedErrors} provider error(s) have no recovered fallback evidence.`
					: providerRecovery.recovered > 0
						? `${providerRecovery.recovered} provider fallback recovery event(s) kept sessions healthy.`
						: 'No provider fallback recovery was needed in the current trace window.',
			href:
				firstOperationsRecordHref(operationsRecords.providerErrors) ??
				options.links?.resilience ??
				'/resilience',
			label: 'Provider fallback recovery',
			status: providerRecovery.status,
			value:
				providerRecovery.total === 0
					? '0 events'
					: `${providerRecovery.recovered}/${providerRecovery.total}`,
			actions:
				providerRecovery.status === 'pass'
					? []
					: [
							...(firstOperationsRecordHref(operationsRecords.providerErrors)
								? [
										{
											description:
												'Open the exact call/session operations record for the first unresolved provider error.',
											href: firstOperationsRecordHref(
												operationsRecords.providerErrors
											) as string,
											label: 'Open failing operations record'
										}
									]
								: []),
							{
								description:
									'Open provider resilience traces and inspect unresolved provider errors.',
								href: options.links?.resilience ?? '/resilience',
								label: 'Open provider recovery'
							}
						]
		},
		...(opsRecovery
			? [
					{
						...buildVoiceOpsRecoveryReadinessCheck(opsRecovery, {
							href: options.links?.opsRecovery ?? '/ops-recovery'
						}),
						actions:
							opsRecovery.status === 'pass'
								? []
								: [
										...(opsRecovery.issues[0]?.href
											? [
													{
														description:
															'Open the exact impacted operations record for the first recovery issue.',
														href: opsRecovery.issues[0].href,
														label: 'Open impacted operations record'
													}
												]
											: []),
										{
											description:
												'Open the unified recovery report for provider fallback, delivery, handoff, live-ops, and SLO issues.',
											href: options.links?.opsRecovery ?? '/ops-recovery',
											label: 'Open ops recovery'
										}
									]
					} satisfies VoiceProductionReadinessCheck
				]
			: []),
		{
			detail:
				failedSessions === 0
					? sessions.length > 0
						? 'Recent sessions have no recorded provider/session failures.'
						: 'No sessions have been recorded yet; run a smoke or live session for proof.'
					: `${failedSessions} recent session(s) have failures.`,
			href:
				firstOperationsRecordHref(operationsRecords.failedSessions) ??
				options.links?.sessions ??
				'/sessions',
			label: 'Session health',
			status: failedSessions > 0 ? 'fail' : sessions.length === 0 ? 'warn' : 'pass',
			value: `${sessions.length - failedSessions}/${sessions.length}`,
			actions:
				failedSessions > 0
					? [
							...(firstOperationsRecordHref(operationsRecords.failedSessions)
								? [
										{
											description:
												'Open the exact failed call/session operations record.',
											href: firstOperationsRecordHref(
												operationsRecords.failedSessions
											) as string,
											label: 'Open failed operations record'
										}
									]
								: []),
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
	const proofSource = (...keys: string[]) =>
		keys
			.map((key) => proofSources?.[key])
			.find(
				(source): source is VoiceProductionReadinessProofSource =>
					source !== undefined
			);
	const calibratedThresholdActions = (): VoiceProductionReadinessAction[] =>
		options.links?.sloReadinessThresholds
			? [
					{
						description:
							'Open the calibrated thresholds currently driving this readiness gate.',
						href: options.links.sloReadinessThresholds,
						label: 'Open calibrated gate source'
					}
				]
			: [];
	const calibratedGateExplanation = (input: {
		evidenceHref?: string;
		observed?: number | string;
		remediation: string;
		threshold?: number | string;
		thresholdLabel: string;
		unit?: VoiceProductionReadinessGateExplanation['unit'];
	}): VoiceProductionReadinessGateExplanation => ({
		...input,
		sourceHref: options.links?.sloReadinessThresholds
	});
	const providerSloMetricForIssue = () => {
		const issue = providerSlo?.issues[0];
		if (!issue?.kind) {
			return undefined;
		}

		const metrics = providerSlo?.kinds[issue.kind]?.metrics;
		return Object.values(metrics ?? {}).find(
			(metric) =>
				metric.label === issue.label ||
				issue.code.endsWith(
					metric.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')
			)
		);
	};
	const mediaPipelineSummary = mediaPipeline
		? ({
				assistantAudioFrames: mediaPipeline.quality.assistantAudioFrames,
				backpressureEvents: mediaPipeline.quality.backpressureEvents,
				gapCount: mediaPipeline.quality.gapCount,
				inputAudioFrames: mediaPipeline.quality.inputAudioFrames,
				issues:
					mediaPipeline.calibration.issues.length +
					mediaPipeline.interruption.issues.length +
					mediaPipeline.quality.issues.length,
				jitterMs: mediaPipeline.quality.jitterMs,
				speechRatio: mediaPipeline.quality.speechRatio,
				status: mediaPipeline.status === 'pass' ? 'pass' : 'fail',
				timestampDriftMs: mediaPipeline.quality.timestampDriftMs
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['mediaPipeline']
			>)
		: undefined;
	const browserMediaSummary = browserMedia
		? ({
				activeCandidatePairs: browserMedia.activeCandidatePairs,
				bytesReceived: browserMedia.bytesReceived,
				bytesSent: browserMedia.bytesSent,
				issues: browserMedia.issues.length,
				jitterMs: browserMedia.jitterMs,
				liveAudioTracks: browserMedia.liveAudioTracks,
				packetLossRatio: browserMedia.packetLossRatio,
				roundTripTimeMs: browserMedia.roundTripTimeMs,
				status: browserMedia.status === 'pass' ? 'pass' : 'fail'
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['browserMedia']
			>)
		: undefined;
	const telephonyMediaSummary = telephonyMedia
		? ({
				audioBytes: telephonyMedia.carriers.reduce(
					(total, carrier) => total + carrier.audioBytes,
					0
				),
				carriers: telephonyMedia.carriers.length,
				failed: telephonyMedia.carriers.filter(
					(carrier) => carrier.status !== 'pass'
				).length,
				issues: telephonyMedia.issues.length,
				passed: telephonyMedia.carriers.filter(
					(carrier) => carrier.status === 'pass'
				).length,
				status: telephonyMedia.status === 'pass' ? 'pass' : 'fail'
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['telephonyMedia']
			>)
		: undefined;
	checks.push({
		detail:
			liveLatency.total === 0
				? 'No browser live-latency measurements are recorded yet.'
				: liveLatency.status === 'pass'
					? `Live browser turn latency averages ${liveLatency.averageLatencyMs}ms.`
					: `${liveLatency.failed} failed and ${liveLatency.warnings} warned live-latency measurement(s).`,
		href:
			firstOperationsRecordHref(operationsRecords.failingLatency) ??
			options.links?.liveLatency ??
			'/traces',
		label: 'Live latency proof',
		proofSource: proofSource('liveLatency', 'liveLatencyProof'),
		gateExplanation:
			liveLatency.status === 'pass'
				? undefined
				: calibratedGateExplanation({
						evidenceHref:
							firstOperationsRecordHref(operationsRecords.failingLatency) ??
							options.links?.liveLatency ??
							'/traces',
						observed: liveLatency.averageLatencyMs,
						remediation:
							'Inspect the slow browser turn, reduce provider/turn latency, then rerun live latency proof so readiness uses fresh samples.',
						threshold:
							liveLatency.status === 'fail'
								? options.liveLatencyFailAfterMs ?? 3200
								: options.liveLatencyWarnAfterMs ?? 1800,
						thresholdLabel:
							liveLatency.status === 'fail'
								? 'Live latency fail after'
								: 'Live latency warn after',
						unit: 'ms'
					}),
		status: liveLatency.status,
		value:
			liveLatency.averageLatencyMs === undefined
				? `${liveLatency.total} samples`
				: `${liveLatency.averageLatencyMs}ms avg`,
		actions:
			liveLatency.status === 'pass'
				? []
				: [
						...(firstOperationsRecordHref(operationsRecords.failingLatency)
							? [
									{
										description:
											'Open the exact call/session operations record for the slow live turn.',
										href: firstOperationsRecordHref(
											operationsRecords.failingLatency
										) as string,
										label: 'Open latency operations record'
									}
								]
							: []),
						{
							description:
								'Run a live browser voice turn and inspect the persisted latency trace.',
							href: options.links?.liveLatency ?? '/traces',
							label: 'Open live latency traces'
						},
						...calibratedThresholdActions()
				]
	});

	if (mediaPipeline && mediaPipelineSummary) {
		const firstIssue = [
			...mediaPipeline.quality.issues,
			...mediaPipeline.calibration.issues,
			...mediaPipeline.interruption.issues
		][0];
		checks.push({
			detail:
				mediaPipelineSummary.status === 'pass'
					? `Media pipeline quality is passing with ${mediaPipelineSummary.inputAudioFrames} input frame(s), ${mediaPipelineSummary.assistantAudioFrames} assistant frame(s), ${mediaPipelineSummary.gapCount} gap(s), ${String(mediaPipelineSummary.jitterMs ?? 'n/a')}ms jitter, and ${mediaPipelineSummary.speechRatio} speech ratio.`
					: firstIssue?.message ??
						`${mediaPipelineSummary.issues} media pipeline issue(s) need review.`,
			href:
				firstOperationsRecordHref(operationsRecords.mediaQuality) ??
				options.links?.mediaPipeline ??
				'/voice/media-pipeline',
			label: 'Media pipeline quality',
			proofSource: proofSource('mediaPipeline', 'mediaQuality'),
			gateExplanation:
				mediaPipelineSummary.status === 'pass'
					? undefined
					: {
							evidenceHref:
								firstOperationsRecordHref(operationsRecords.mediaQuality) ??
								options.links?.mediaPipeline ??
								'/voice/media-pipeline',
							observed:
								firstIssue?.code ??
								`${mediaPipelineSummary.issues} issue(s)`,
							remediation:
								'Inspect media pipeline quality, fix excessive gaps, jitter, drift, speech-ratio, or backpressure issues, then rerun readiness proof.',
							thresholdLabel: 'Media quality report status',
							unit: 'status'
						},
			status: mediaPipelineSummary.status,
			value:
				mediaPipelineSummary.status === 'pass'
					? `${mediaPipelineSummary.gapCount} gaps`
					: `${mediaPipelineSummary.issues} issue(s)`,
			actions:
				mediaPipelineSummary.status === 'pass'
					? []
					: [
							...(firstOperationsRecordHref(operationsRecords.mediaQuality)
								? [
										{
											description:
												'Open the exact call/session operations record for the first media quality issue.',
											href: firstOperationsRecordHref(
												operationsRecords.mediaQuality
											) as string,
											label: 'Open media operations record'
										}
									]
								: []),
							{
								description:
									'Open media pipeline proof and inspect quality, calibration, VAD, interruption, transport, and processor-graph evidence.',
								href: options.links?.mediaPipeline ?? '/voice/media-pipeline',
								label: 'Open media pipeline proof'
							}
						]
		});
	}

	if (browserMedia && browserMediaSummary) {
		const firstIssue = browserMedia.issues[0];
		checks.push({
			detail:
				browserMediaSummary.status === 'pass'
					? `Browser media transport is passing with ${browserMediaSummary.activeCandidatePairs} active candidate pair(s), ${browserMediaSummary.liveAudioTracks} live audio track(s), ${String(browserMediaSummary.roundTripTimeMs ?? 'n/a')}ms RTT, ${String(browserMediaSummary.jitterMs ?? 'n/a')}ms jitter, and ${browserMediaSummary.packetLossRatio} packet loss ratio.`
					: firstIssue?.message ??
						`${browserMediaSummary.issues} browser media transport issue(s) need review.`,
			href: options.links?.browserMedia ?? '/voice/browser-media',
			label: 'Browser media transport',
			proofSource: proofSource('browserMedia', 'webrtcStats'),
			gateExplanation:
				browserMediaSummary.status === 'pass'
					? undefined
					: {
							evidenceHref: options.links?.browserMedia ?? '/voice/browser-media',
							observed:
								firstIssue?.code ??
								`${browserMediaSummary.issues} issue(s)`,
							remediation:
								'Inspect browser WebRTC media stats, fix packet loss, RTT, jitter, candidate-pair, or audio-track issues, then rerun readiness proof.',
							thresholdLabel: 'Browser media transport status',
							unit: 'status'
						},
			status: browserMediaSummary.status,
			value:
				browserMediaSummary.status === 'pass'
					? `${browserMediaSummary.packetLossRatio} loss`
					: `${browserMediaSummary.issues} issue(s)`,
			actions:
				browserMediaSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open browser media transport proof and inspect WebRTC packet loss, RTT, jitter, bytes, candidate-pair, and audio-track evidence.',
								href: options.links?.browserMedia ?? '/voice/browser-media',
								label: 'Open browser media proof'
							}
						]
		});
	}

	if (telephonyMedia && telephonyMediaSummary) {
		const firstIssue = telephonyMedia.issues[0];
		checks.push({
			detail:
				telephonyMediaSummary.status === 'pass'
					? `Telephony media serializers are passing for ${telephonyMediaSummary.passed}/${telephonyMediaSummary.carriers} carrier(s) with ${telephonyMediaSummary.audioBytes} audio byte(s) parsed into MediaFrame objects.`
					: firstIssue ??
						`${telephonyMediaSummary.issues} telephony media serializer issue(s) need review.`,
			href: options.links?.telephonyMedia ?? '/voice/telephony-media',
			label: 'Telephony media serializers',
			proofSource: proofSource('telephonyMedia', 'carrierMediaSerializers'),
			gateExplanation:
				telephonyMediaSummary.status === 'pass'
					? undefined
					: {
							evidenceHref:
								options.links?.telephonyMedia ?? '/voice/telephony-media',
							observed: firstIssue ?? `${telephonyMediaSummary.issues} issue(s)`,
							remediation:
								'Inspect carrier media serializer proof, fix payload parsing or outbound envelope serialization, then rerun readiness proof.',
							thresholdLabel: 'Telephony media serializer status',
							unit: 'status'
						},
			status: telephonyMediaSummary.status,
			value:
				telephonyMediaSummary.status === 'pass'
					? `${telephonyMediaSummary.passed}/${telephonyMediaSummary.carriers}`
					: `${telephonyMediaSummary.failed}/${telephonyMediaSummary.carriers} failing`,
			actions:
				telephonyMediaSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open telephony media proof and inspect carrier media payload parsing, MediaFrame shape, and outbound envelope serialization.',
								href:
									options.links?.telephonyMedia ?? '/voice/telephony-media',
								label: 'Open telephony media proof'
							}
						]
		});
	}

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
	const providerSloSummary = providerSlo
		? ({
				events: providerSlo.events,
				eventsWithLatency: providerSlo.eventsWithLatency,
				issues: providerSlo.issues.length,
				status: providerSlo.status
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['providerSlo']
			>)
		: undefined;
	const providerOrchestrationSummary = providerOrchestration
		? ({
				failed: providerOrchestration.summary.failed,
				issues: providerOrchestration.issues.length,
				passed: providerOrchestration.summary.passed,
				providers: providerOrchestration.summary.providers,
				status: providerOrchestration.status,
				surfaces: providerOrchestration.summary.surfaces,
				warned: providerOrchestration.summary.warned
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['providerOrchestration']
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
	const monitoringSummary = monitoring
		? ({
				criticalOpen: monitoring.summary.criticalOpen,
				elapsedMs: monitoring.elapsedMs,
				open: monitoring.summary.open,
				status:
					options.monitoringRunFailAfterMs !== undefined &&
					monitoring.elapsedMs > options.monitoringRunFailAfterMs
						? 'fail'
						: monitoring.status,
				total: monitoring.summary.total
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['monitoring']
			>)
		: undefined;
	const monitoringNotifierDeliverySummary = monitoringNotifierDelivery
		? ({
				elapsedMs: monitoringNotifierDelivery.elapsedMs,
				failed: monitoringNotifierDelivery.summary.failed,
				notifiers: monitoringNotifierDelivery.summary.notifiers,
				sent: monitoringNotifierDelivery.summary.sent,
				status:
					options.monitoringNotifierDeliveryFailAfterMs !== undefined &&
					monitoringNotifierDelivery.elapsedMs >
						options.monitoringNotifierDeliveryFailAfterMs
						? 'fail'
						: monitoringNotifierDelivery.status,
				total: monitoringNotifierDelivery.summary.total
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['monitoringNotifierDelivery']
			>)
		: undefined;
	const telephonyWebhookSecuritySummary = telephonyWebhookSecurity
		? ({
				enabled: telephonyWebhookSecurity.summary.enabled,
				failed: telephonyWebhookSecurity.summary.failed,
				passed: telephonyWebhookSecurity.summary.passed,
				status: telephonyWebhookSecurity.status,
				warned: telephonyWebhookSecurity.summary.warned
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['telephonyWebhookSecurity']
			>)
		: undefined;
	const reconnectContractSummary = reconnectContracts
		? (() => {
				const failedReports = reconnectContracts.filter(
					(report) =>
						!report.pass ||
						(options.reconnectResumeFailAfterMs !== undefined &&
							report.resumeLatencyP95Ms !== undefined &&
							report.resumeLatencyP95Ms > options.reconnectResumeFailAfterMs)
				);
				const resumeLatencies = reconnectContracts
					.map((report) => report.resumeLatencyP95Ms)
					.filter((value): value is number => typeof value === 'number');

				return {
					failed: failedReports.length,
					passed: reconnectContracts.length - failedReports.length,
					resumeLatencyP95Ms:
						resumeLatencies.length > 0 ? Math.max(...resumeLatencies) : undefined,
					status:
						failedReports.length > 0
							? 'fail'
							: reconnectContracts.length === 0
								? 'warn'
								: 'pass',
					total: reconnectContracts.length
				} satisfies NonNullable<
					VoiceProductionReadinessReport['summary']['reconnectContracts']
				>;
			})()
		: undefined;
	const bargeInSummary = bargeInReports
		? ({
				failed: bargeInReports.reduce(
					(total, report) => total + report.failed,
					0
				),
				passed: bargeInReports.reduce(
					(total, report) => total + report.passed,
					0
				),
				status: bargeInReports.some(
					(report) => report.status === 'fail' || report.failed > 0
				)
					? 'fail'
					: bargeInReports.length === 0 ||
						  bargeInReports.some(
								(report) =>
									report.status === 'empty' ||
									report.status === 'warn' ||
									report.total === 0
							)
						? 'warn'
						: 'pass',
				total: bargeInReports.reduce((total, report) => total + report.total, 0),
				warnings: bargeInReports.filter((report) => report.status === 'warn')
					.length
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['bargeIn']
			>)
		: undefined;
	const campaignReadinessSummary = campaignReadiness
		? ({
				failed: campaignReadiness.checks.filter(
					(check) => check.status !== 'pass'
				).length,
				passed: campaignReadiness.checks.filter(
					(check) => check.status === 'pass'
				).length,
				status: campaignReadiness.ok ? 'pass' : 'fail',
				total: campaignReadiness.checks.length
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['campaignReadiness']
			>)
		: undefined;
	const observabilityExportSummary = observabilityExport
		? ({
				artifacts: observabilityExport.artifacts.length,
				auditEvents: observabilityExport.summary.auditEvents,
				envelopes: observabilityExport.envelopes.length,
				issues: observabilityExport.issues.length,
				status: observabilityExport.status,
				traceEvents: observabilityExport.summary.traceEvents
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['observabilityExport']
			>)
		: undefined;
	const observabilityExportDeliveryHistorySummary =
		observabilityExportDeliveryHistory
			? (() => {
					const latestSuccess =
						observabilityExportDeliveryHistory.history.receipts
							.filter(
								(receipt) =>
									receipt.status === 'pass' &&
									receipt.summary.delivered > 0 &&
									receipt.summary.failed === 0
							)
							.sort((left, right) => right.checkedAt - left.checkedAt)[0];
					const latestSuccessAgeMs = latestSuccess
						? Date.now() - latestSuccess.checkedAt
						: undefined;
					const stale =
						observabilityExportDeliveryHistory.maxAgeMs !== undefined &&
						latestSuccessAgeMs !== undefined &&
						latestSuccessAgeMs > observabilityExportDeliveryHistory.maxAgeMs;
					const missing =
						observabilityExportDeliveryHistory.history.summary.receipts === 0 ||
						!latestSuccess;
					const status: VoiceProductionReadinessStatus =
						observabilityExportDeliveryHistory.history.status === 'fail'
							? 'fail'
							: missing && observabilityExportDeliveryHistory.failOnMissing
								? 'fail'
								: stale && observabilityExportDeliveryHistory.failOnStale
									? 'fail'
									: missing || stale
										? 'warn'
										: 'pass';

					return {
						delivered:
							observabilityExportDeliveryHistory.history.summary.delivered,
						failed: observabilityExportDeliveryHistory.history.summary.failed,
						latestSuccessAgeMs,
						receipts:
							observabilityExportDeliveryHistory.history.summary.receipts,
						status,
						totalDestinations:
							observabilityExportDeliveryHistory.history.summary
								.totalDestinations
					} satisfies NonNullable<
						VoiceProductionReadinessReport['summary']['observabilityExportDeliveryHistory']
					>;
				})()
			: undefined;
	const observabilityExportReplaySummary = observabilityExportReplay
		? ({
				artifacts: observabilityExportReplay.summary.artifacts,
				deliveryDestinations:
					observabilityExportReplay.summary.deliveryDestinations,
				failedArtifacts: observabilityExportReplay.summary.failedArtifacts,
				failedDeliveryDestinations:
					observabilityExportReplay.summary.failedDeliveryDestinations,
				issues: observabilityExportReplay.issues.length,
				status: observabilityExportReplay.status,
				validationIssues: observabilityExportReplay.summary.validationIssues
			} satisfies NonNullable<
				VoiceProductionReadinessReport['summary']['observabilityExportReplay']
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
			proofSource: proofSource(
				'providerRoutingContracts',
				'providerRouting'
			),
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

	if (providerSloSummary && providerSlo) {
		const firstIssue = providerSlo.issues[0];
		const firstMetric = providerSloMetricForIssue();
		checks.push({
			detail:
				providerSloSummary.status === 'pass'
					? `${providerSloSummary.eventsWithLatency} provider latency sample(s) are inside LLM/STT/TTS SLO budgets.`
					: firstIssue?.detail ??
						`${providerSloSummary.issues} provider SLO issue(s) need review.`,
			href:
				firstIssue?.sessionId
					? voiceOperationsRecordHref(
							options.links?.operationsRecords ?? '/voice-operations',
							firstIssue.sessionId
						)
					: options.links?.providerSlo ??
						options.links?.resilience ??
						'/voice/provider-slos',
			label: 'Provider SLO gates',
			proofSource: proofSource('providerSlo', 'providerSlos'),
			gateExplanation:
				providerSloSummary.status === 'pass'
					? undefined
					: calibratedGateExplanation({
							evidenceHref:
								firstIssue?.sessionId
									? voiceOperationsRecordHref(
											options.links?.operationsRecords ??
												'/voice-operations',
											firstIssue.sessionId
										)
									: options.links?.providerSlo ??
										options.links?.resilience ??
										'/voice/provider-slos',
							observed: firstMetric?.actual ?? firstIssue?.value,
							remediation:
								'Inspect the provider SLO report, fix slow or failing STT/LLM/TTS behavior, then rerun provider proof so the calibrated budget is met.',
							threshold: firstMetric?.threshold,
							thresholdLabel:
								firstMetric?.label ?? firstIssue?.label ?? 'Provider SLO gate',
							unit: firstMetric?.unit
						}),
			status: providerSloSummary.status,
			value: `${providerSloSummary.eventsWithLatency}/${providerSloSummary.events}`,
			actions:
				providerSloSummary.status === 'pass'
					? []
					: [
							...(firstIssue?.sessionId
								? [
										{
											description:
												'Open the exact call/session operations record for the first provider SLO issue.',
											href: voiceOperationsRecordHref(
												options.links?.operationsRecords ??
													'/voice-operations',
												firstIssue.sessionId
											),
											label: 'Open impacted operations record'
										}
									]
								: []),
							{
								description:
									'Open provider SLO proof and inspect latency, timeout, fallback, and unresolved error budgets.',
								href:
									options.links?.providerSlo ??
									options.links?.resilience ??
									'/voice/provider-slos',
								label: 'Open provider SLO report'
							},
							...calibratedThresholdActions()
						]
		});
	}

	if (observabilityExportSummary && observabilityExport) {
		const firstIssue = observabilityExport.issues[0];
		checks.push({
			detail:
				observabilityExportSummary.status === 'pass'
					? `${observabilityExportSummary.envelopes} observability envelope(s), ${observabilityExportSummary.artifacts} artifact(s), and no export issues are ready for customer-owned storage.`
					: firstIssue?.detail ??
						`${observabilityExportSummary.issues} observability export issue(s) need review.`,
			href: options.links?.observabilityExport ?? '/voice/observability-export',
			label: 'Observability export',
			proofSource: proofSource('observabilityExport', 'observability'),
			status: observabilityExportSummary.status,
			value: `${observabilityExportSummary.envelopes}/${observabilityExportSummary.artifacts}`,
			actions:
				observabilityExportSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open the customer-owned observability export manifest and inspect trace, audit, delivery, operations-record, and proof-pack evidence.',
								href:
									options.links?.observabilityExport ??
									'/voice/observability-export',
								label: 'Open observability export'
							}
						]
		});
	}

	if (
		observabilityExportDeliveryHistorySummary &&
		observabilityExportDeliveryHistory
	) {
		const stale =
			observabilityExportDeliveryHistory.maxAgeMs !== undefined &&
			observabilityExportDeliveryHistorySummary.latestSuccessAgeMs !==
				undefined &&
			observabilityExportDeliveryHistorySummary.latestSuccessAgeMs >
				observabilityExportDeliveryHistory.maxAgeMs;
		const missing =
			observabilityExportDeliveryHistorySummary.receipts === 0 ||
			observabilityExportDeliveryHistorySummary.latestSuccessAgeMs === undefined;
		const href =
			options.links?.observabilityExportDeliveries ??
			'/api/voice/observability-export/deliveries';
		checks.push({
			detail:
				observabilityExportDeliveryHistorySummary.status === 'pass'
					? `${observabilityExportDeliveryHistorySummary.receipts} observability export delivery receipt(s) are healthy.`
					: observabilityExportDeliveryHistorySummary.failed > 0
						? `${observabilityExportDeliveryHistorySummary.failed} observability export delivery failure(s) need review.`
						: missing
							? 'No successful observability export delivery receipts have been recorded.'
							: stale
								? 'Latest successful observability export delivery is older than the configured freshness window.'
								: 'Observability export delivery receipts need review.',
			href,
			label: 'Observability export delivery',
			proofSource: proofSource(
				'observabilityExportDeliveryHistory',
				'observabilityExportDelivery',
				'observability'
			),
			status: observabilityExportDeliveryHistorySummary.status,
			value: `${observabilityExportDeliveryHistorySummary.delivered}/${observabilityExportDeliveryHistorySummary.totalDestinations}`,
			actions:
				observabilityExportDeliveryHistorySummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open observability export delivery receipts and inspect failed, missing, or stale customer-owned export writes.',
								href,
								label: 'Open export delivery receipts'
							}
						]
		});
	}

	if (observabilityExportReplaySummary && observabilityExportReplay) {
		const firstIssue = observabilityExportReplay.issues[0];
		const href =
			options.links?.observabilityExportDeliveries ??
			options.links?.observabilityExport ??
			'/api/voice/observability-export/deliveries';
		checks.push({
			detail:
				observabilityExportReplaySummary.status === 'pass'
					? `${observabilityExportReplaySummary.artifacts} exported artifact(s) and ${observabilityExportReplaySummary.deliveryDestinations} delivery destination(s) replay from customer-owned evidence.`
					: firstIssue?.detail ??
						`${observabilityExportReplaySummary.issues} observability export replay issue(s) need review.`,
			href,
			label: 'Observability export replay',
			proofSource: proofSource(
				'observabilityExportReplay',
				'observabilityExportDeliveryHistory',
				'observability'
			),
			status: observabilityExportReplaySummary.status,
			value: `${observabilityExportReplaySummary.validationIssues} validation issue(s)`,
			actions:
				observabilityExportReplaySummary.status === 'pass'
					? []
					: [
							{
								description:
									'Replay the customer-owned observability export from file, S3, SQLite, or Postgres and inspect validation, artifact, or delivery failures.',
								href,
								label: 'Open export replay evidence'
							}
						]
		});
	}

	if (providerStack) {
		const missingLanes = providerStack.gaps.filter(
			(gap) => gap.status !== 'pass'
		);
		checks.push({
			detail:
				providerStack.status === 'pass'
					? `${providerStack.profile} provider stack has declared capability coverage.`
					: missingLanes.length > 0
						? missingLanes
								.map((gap) =>
									gap.provider
										? `${gap.kind.toUpperCase()} ${gap.provider} missing ${gap.missing.join(', ')}`
										: `${gap.kind.toUpperCase()} provider is not configured`
								)
								.join('; ') + '.'
						: 'Provider stack capability coverage needs review.',
			href:
				options.links?.providerRoutingContracts ??
				options.links?.resilience ??
				'/resilience',
			label: 'Provider stack capabilities',
			status: providerStack.status,
			value:
				providerStack.status === 'pass'
					? 'covered'
					: `${providerStack.missing} missing`,
			actions:
				providerStack.status === 'pass'
					? []
					: [
							{
								description:
									'Open provider capabilities and confirm the selected stack covers this readiness profile.',
								href:
									options.links?.providerRoutingContracts ??
									options.links?.resilience ??
									'/resilience',
								label: 'Open provider capabilities'
							}
						]
		});
	}

	if (providerContractMatrix) {
		const blocked = providerContractMatrix.rows.filter(
			(row) => row.status !== 'pass'
		);
		checks.push({
			detail:
				providerContractMatrix.status === 'pass'
					? `${providerContractMatrix.passed} provider contract row(s) are production-ready.`
					: blocked.length > 0
						? blocked
								.map((row) => {
									const issues = row.checks
										.filter((check) => check.status !== 'pass')
										.map((check) => check.label)
										.join(', ');
									return `${row.kind.toUpperCase()} ${row.provider}: ${issues}`;
								})
								.join('; ') + '.'
						: 'Provider contract matrix needs review.',
			href:
				options.links?.providerContracts ??
				'/provider-contracts',
			label: 'Provider contract matrix',
			proofSource: proofSource('providerContractMatrix', 'providerContracts'),
			status: providerContractMatrix.status,
			value: `${providerContractMatrix.passed}/${providerContractMatrix.total}`,
			actions:
				providerContractMatrix.status === 'pass'
					? []
					: [
							{
								description:
									'Open provider capabilities and inspect missing env, fallback, streaming, latency, or capability contracts.',
								href:
									options.links?.providerContracts ??
									'/provider-contracts',
								label: 'Open provider matrix'
							}
						]
		});
	}

	if (providerOrchestrationSummary && providerOrchestration) {
		const firstIssue = providerOrchestration.issues[0];
		checks.push({
			detail:
				providerOrchestrationSummary.status === 'pass'
					? `${providerOrchestrationSummary.surfaces} provider orchestration surface(s) are production-shaped.`
					: firstIssue?.message ??
						`${providerOrchestrationSummary.issues} provider orchestration issue(s) need review.`,
			href:
				options.links?.providerOrchestration ??
				options.links?.providerContracts ??
				'/voice/provider-orchestration',
			label: 'Provider orchestration profiles',
			proofSource: proofSource(
				'providerOrchestration',
				'providerOrchestration'
			),
			status: providerOrchestrationSummary.status,
			value: `${providerOrchestrationSummary.passed}/${providerOrchestrationSummary.surfaces}`,
			actions:
				providerOrchestrationSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open provider orchestration proof and add missing fallback, circuit-breaker, timeout, or budget policy configuration.',
								href:
									options.links?.providerOrchestration ??
									options.links?.providerContracts ??
									'/voice/provider-orchestration',
								label: 'Open provider orchestration proof'
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

	if (reconnectContractSummary) {
		checks.push({
			detail:
				reconnectContractSummary.status === 'pass'
					? `${reconnectContractSummary.passed} reconnect contract(s) are passing.`
					: reconnectContractSummary.total === 0
						? 'No reconnect contracts are configured.'
						: options.reconnectResumeFailAfterMs !== undefined &&
							  reconnectContractSummary.resumeLatencyP95Ms !== undefined &&
							  reconnectContractSummary.resumeLatencyP95Ms >
								  options.reconnectResumeFailAfterMs
							? `Reconnect resume p95 ${reconnectContractSummary.resumeLatencyP95Ms}ms exceeded ${options.reconnectResumeFailAfterMs}ms.`
							: `${reconnectContractSummary.failed} reconnect contract(s) failed.`,
			href:
				options.links?.reconnectContracts ??
				options.links?.sessions ??
				'/sessions',
			label: 'Reconnect recovery contracts',
			proofSource: proofSource('reconnectContracts', 'reconnect'),
			gateExplanation:
				reconnectContractSummary.status === 'pass'
					? undefined
					: calibratedGateExplanation({
							evidenceHref:
								options.links?.reconnectContracts ??
								options.links?.sessions ??
								'/sessions',
							observed: reconnectContractSummary.resumeLatencyP95Ms,
							remediation:
								'Inspect reconnect lifecycle traces, restore faster resume/replay-safe state, then rerun reconnect proof.',
							threshold: options.reconnectResumeFailAfterMs,
							thresholdLabel: 'Reconnect resume p95 fail after',
							unit: 'ms'
						}),
			status: reconnectContractSummary.status,
			value: `${reconnectContractSummary.passed}/${reconnectContractSummary.total}`,
			actions:
				reconnectContractSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open reconnect proof and inspect disconnect, resume, and replay-safe turn state evidence.',
								href:
									options.links?.reconnectContracts ??
									options.links?.sessions ??
									'/sessions',
								label: 'Open reconnect proof'
							},
							...calibratedThresholdActions()
						]
		});
	}

	if (bargeInSummary) {
		checks.push({
			detail:
				bargeInSummary.status === 'pass'
					? `${bargeInSummary.passed} barge-in interruption(s) stopped within threshold.`
					: bargeInSummary.total === 0
						? 'No barge-in interruption proof is recorded yet.'
						: bargeInSummary.status === 'fail'
							? `${bargeInSummary.failed} barge-in interruption(s) exceeded threshold.`
							: `${bargeInSummary.warnings} barge-in proof report(s) have warnings.`,
			href: options.links?.bargeIn ?? '/barge-in',
			label: 'Barge-in interruption proof',
			proofSource: proofSource('bargeInReports', 'bargeIn'),
			gateExplanation:
				bargeInSummary.status === 'pass'
					? undefined
					: calibratedGateExplanation({
							evidenceHref: options.links?.bargeIn ?? '/barge-in',
							observed:
								bargeInReports
									?.map((report) => report.averageLatencyMs)
									.filter((value): value is number => typeof value === 'number')
									.sort((left, right) => right - left)[0] ??
								`${bargeInSummary.failed} failed`,
							remediation:
								'Inspect barge-in proof, confirm playback cancellation is immediate, then rerun interruption proof against the calibrated threshold.',
							threshold: bargeInReports?.[0]?.thresholdMs,
							thresholdLabel: 'Barge-in interruption threshold',
							unit: typeof bargeInReports?.[0]?.thresholdMs === 'number'
								? 'ms'
								: 'count'
						}),
			status: bargeInSummary.status,
			value: `${bargeInSummary.passed}/${bargeInSummary.total}`,
			actions:
				bargeInSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open barge-in proof and confirm assistant speech stops when the caller interrupts.',
								href: options.links?.bargeIn ?? '/barge-in',
								label: 'Open barge-in proof'
							},
							...calibratedThresholdActions()
						]
		});
	}

	if (campaignReadinessSummary) {
		const failedChecks = campaignReadiness?.checks
			.filter((check) => check.status !== 'pass')
			.map((check) => check.name);
		checks.push({
			detail:
				campaignReadinessSummary.status === 'pass'
					? `${campaignReadinessSummary.passed} campaign readiness check(s) are passing without live dialing.`
					: failedChecks && failedChecks.length > 0
						? `Campaign readiness failed: ${failedChecks.join(', ')}.`
						: 'Campaign readiness proof failed.',
			href:
				options.links?.campaignReadiness ??
				'/api/voice/campaigns/readiness-proof',
			label: 'Campaign readiness proof',
			proofSource: proofSource('campaignReadiness', 'campaigns'),
			status: campaignReadinessSummary.status,
			value: `${campaignReadinessSummary.passed}/${campaignReadinessSummary.total}`,
			actions:
				campaignReadinessSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open campaign readiness proof and inspect import, scheduling, rate-limit, and retry checks.',
								href:
									options.links?.campaignReadiness ??
									'/api/voice/campaigns/readiness-proof',
								label: 'Open campaign proof'
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
			proofSource: proofSource('auditDeliveries', 'auditDelivery'),
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

	if (opsActionHistory) {
		checks.push({
			detail:
				opsActionHistory.status === 'pass'
					? opsActionHistory.total > 0
						? `${opsActionHistory.passed} operator action(s) completed successfully.`
						: 'No operator action failures are recorded.'
					: opsActionHistory.failed > 0
						? `${opsActionHistory.failed} operator action(s) failed and need review.`
						: 'No operator action history is recorded yet.',
			href: options.links?.opsActions ?? '/voice/ops-actions',
			label: 'Operator action history',
			proofSource: proofSource('opsActions', 'operatorActions'),
			status: opsActionHistory.status,
			value: `${opsActionHistory.passed}/${opsActionHistory.total}`,
			actions:
				opsActionHistory.status === 'pass'
					? []
					: [
							{
								description:
									'Open operator action history and inspect failed control-plane actions.',
								href: options.links?.opsActions ?? '/voice/ops-actions',
								label: 'Open action history'
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
			proofSource: proofSource('traceDeliveries', 'traceDelivery'),
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

	if (deliveryRuntime) {
		checks.push({
			detail:
				deliveryRuntime.status === 'pass'
					? 'Delivery runtime queues are clear.'
					: deliveryRuntime.failed > 0 || deliveryRuntime.deadLettered > 0
						? `${deliveryRuntime.failed} failed and ${deliveryRuntime.deadLettered} dead-lettered runtime delivery item(s).`
						: `${deliveryRuntime.pending} runtime delivery item(s) are pending.`,
			href: options.links?.deliveryRuntime ?? '/delivery-runtime',
			label: 'Delivery runtime',
			proofSource: proofSource('deliveryRuntime'),
			status: deliveryRuntime.status,
			value: `${deliveryRuntime.delivered + deliveryRuntime.skipped}/${deliveryRuntime.total}`,
			actions:
				deliveryRuntime.status === 'pass'
					? []
					: [
							{
								description:
									'Open the delivery runtime control plane to inspect queues or manually tick workers.',
								href: options.links?.deliveryRuntime ?? '/delivery-runtime',
								label: 'Open delivery runtime'
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

	if (telephonyWebhookSecurity && telephonyWebhookSecuritySummary) {
		checks.push({
			detail:
				telephonyWebhookSecuritySummary.status === 'pass'
					? 'Carrier webhook verification, replay protection, idempotency, and persistent stores are configured.'
					: `${telephonyWebhookSecuritySummary.failed} carrier webhook security provider(s) failing, ${telephonyWebhookSecuritySummary.warned} warning(s).`,
			href:
				options.links?.telephonyWebhookSecurity ??
				'/api/voice/telephony/webhook-security',
			label: 'Carrier webhook security',
			status: telephonyWebhookSecuritySummary.status,
			value: `${telephonyWebhookSecuritySummary.passed}/${telephonyWebhookSecuritySummary.enabled}`,
			actions:
				telephonyWebhookSecuritySummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open the carrier webhook security report for missing verification, replay protection, idempotency, or persistent-store configuration.',
								href:
									options.links?.telephonyWebhookSecurity ??
									'/api/voice/telephony/webhook-security',
								label: 'Open webhook security report'
							}
						]
		});
	}

	if (monitoring && monitoringSummary) {
		checks.push({
			detail:
				monitoringSummary.status === 'pass'
					? `${monitoringSummary.total} monitor(s) are passing with no open issues.`
					: options.monitoringRunFailAfterMs !== undefined &&
						  monitoringSummary.elapsedMs !== undefined &&
						  monitoringSummary.elapsedMs > options.monitoringRunFailAfterMs
						? `Monitor run took ${monitoringSummary.elapsedMs}ms, above ${options.monitoringRunFailAfterMs}ms.`
					: `${monitoringSummary.open} monitor issue(s) open, ${monitoringSummary.criticalOpen} critical.`,
			href: options.links?.monitoring ?? '/voice/monitors',
			label: 'Monitoring issues',
			gateExplanation:
				monitoringSummary.status === 'pass'
					? undefined
					: calibratedGateExplanation({
							evidenceHref: options.links?.monitoring ?? '/voice/monitors',
							observed:
								monitoringSummary.elapsedMs ??
								`${monitoringSummary.open} open issue(s)`,
							remediation:
								'Inspect monitor issues or slow monitor execution, resolve open blockers, then rerun the monitor proof.',
							threshold: options.monitoringRunFailAfterMs,
							thresholdLabel: 'Monitor run fail after',
							unit:
								monitoringSummary.elapsedMs !== undefined ? 'ms' : 'count'
						}),
			status: monitoringSummary.status,
			value: `${monitoring.summary.passed}/${monitoringSummary.total}`,
			actions:
				monitoringSummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open monitor issues and resolve or acknowledge customer-owned alerts before deploy.',
								href: options.links?.monitoring ?? '/voice/monitors',
								label: 'Open monitor issues'
							},
							...calibratedThresholdActions()
						]
		});
	}

	if (monitoringNotifierDelivery && monitoringNotifierDeliverySummary) {
		checks.push({
			detail:
				monitoringNotifierDeliverySummary.status === 'pass'
					? `${monitoringNotifierDeliverySummary.sent} monitor notification(s) delivered.`
					: options.monitoringNotifierDeliveryFailAfterMs !== undefined &&
						  monitoringNotifierDeliverySummary.elapsedMs !== undefined &&
						  monitoringNotifierDeliverySummary.elapsedMs >
							  options.monitoringNotifierDeliveryFailAfterMs
						? `Monitor notification delivery took ${monitoringNotifierDeliverySummary.elapsedMs}ms, above ${options.monitoringNotifierDeliveryFailAfterMs}ms.`
					: `${monitoringNotifierDeliverySummary.failed} monitor notification delivery failure(s).`,
			href:
				options.links?.monitoringNotifierDelivery ??
				'/api/voice/monitor-issues/notifications',
			label: 'Monitor notifier delivery',
			gateExplanation:
				monitoringNotifierDeliverySummary.status === 'pass'
					? undefined
					: calibratedGateExplanation({
							evidenceHref:
								options.links?.monitoringNotifierDelivery ??
								'/api/voice/monitor-issues/notifications',
							observed:
								monitoringNotifierDeliverySummary.elapsedMs ??
								`${monitoringNotifierDeliverySummary.failed} failed`,
							remediation:
								'Inspect monitor notification receipts, fix webhook/email/Slack delivery, then rerun notifier proof.',
							threshold: options.monitoringNotifierDeliveryFailAfterMs,
							thresholdLabel: 'Monitor notifier delivery fail after',
							unit:
								monitoringNotifierDeliverySummary.elapsedMs !== undefined
									? 'ms'
									: 'count'
						}),
			status: monitoringNotifierDeliverySummary.status,
			value: `${monitoringNotifierDeliverySummary.sent}/${monitoringNotifierDeliverySummary.total}`,
			actions:
				monitoringNotifierDeliverySummary.status === 'pass'
					? []
					: [
							{
								description:
									'Open monitor notification receipts and confirm webhook, Slack, email, or audit destinations are receiving issue alerts.',
								href:
									options.links?.monitoringNotifierDelivery ??
									'/api/voice/monitor-issues/notifications',
								label: 'Open monitor notification receipts'
							},
							...calibratedThresholdActions()
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
			bargeIn: '/barge-in',
			browserMedia: '/voice/browser-media',
			campaignReadiness: '/api/voice/campaigns/readiness-proof',
			carriers: '/carriers',
			deliveryRuntime: '/delivery-runtime',
			handoffs: '/handoffs',
			handoffRetry: '/api/voice-handoffs/retry',
			liveLatency: '/traces',
			operationsRecords: '/voice-operations',
			observabilityExport: '/voice/observability-export',
			observabilityExportDeliveries:
				'/api/voice/observability-export/deliveries',
			monitoring: '/voice/monitors',
			monitoringNotifierDelivery: '/api/voice/monitor-issues/notifications',
			mediaPipeline: '/voice/media-pipeline',
			opsActions: '/voice/ops-actions',
			opsRecovery: '/ops-recovery',
			phoneAgentSmoke: '/sessions',
			telephonyMedia: '/voice/telephony-media',
			telephonyWebhookSecurity: '/api/voice/telephony/webhook-security',
			providerContracts: '/provider-contracts',
			providerOrchestration: '/voice/provider-orchestration',
			providerRoutingContracts: '/resilience',
			providerSlo: '/voice/provider-slos',
			quality: '/quality',
			reconnectContracts: '/sessions',
			resilience: '/resilience',
			sessions: '/sessions',
			sloReadinessThresholds: '/voice/slo-readiness-thresholds',
			traceDeliveries: '/traces/deliveries',
			...options.links
		},
		profile: options.profile || undefined,
		operationsRecords,
		proofSources,
		status: rollupStatus(checks),
		summary: {
			agentSquadContracts: agentSquadContractSummary,
			audit,
			auditDeliveries,
			bargeIn: bargeInSummary,
			browserMedia: browserMediaSummary,
			campaignReadiness: campaignReadinessSummary,
			carriers: carrierSummary,
			deliveryRuntime,
			handoffs: {
				failed: handoffs.failed,
				total: handoffs.total
			},
			liveLatency,
			mediaPipeline: mediaPipelineSummary,
			monitoring: monitoringSummary,
			monitoringNotifierDelivery: monitoringNotifierDeliverySummary,
			opsActionHistory,
			opsRecovery: opsRecovery
				? {
						issues: opsRecovery.issues.length,
						recoveredFallbacks: opsRecovery.providers.recoveredFallbacks,
						status: opsRecovery.status,
						unresolvedProviderFailures:
							opsRecovery.providers.unresolvedFailures
					}
				: undefined,
			observabilityExport: observabilityExportSummary,
			observabilityExportDeliveryHistory:
				observabilityExportDeliveryHistorySummary,
			observabilityExportReplay: observabilityExportReplaySummary,
			providers: {
				degraded: degradedProviders,
				total: providers.length
			},
			providerStack,
			providerContractMatrix,
			providerOrchestration: providerOrchestrationSummary,
			providerRecovery,
			phoneAgentSmokes: phoneAgentSmokeSummary,
			telephonyMedia: telephonyMediaSummary,
			telephonyWebhookSecurity: telephonyWebhookSecuritySummary,
			providerRoutingContracts: providerRoutingContractSummary,
			providerSlo: providerSloSummary,
			reconnectContracts: reconnectContractSummary,
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

export const buildVoiceProductionReadinessGate = async (
	options: VoiceProductionReadinessRoutesOptions,
	input: {
		query?: Record<string, unknown>;
		request?: Request;
	} = {}
): Promise<VoiceProductionReadinessGateReport> =>
	summarizeVoiceProductionReadinessGate(
		await buildVoiceProductionReadinessReport(options, input),
		options.gate || undefined
	);

export const renderVoiceProductionReadinessHTML = (
	report: VoiceProductionReadinessReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Production Readiness';
	const thresholdLink = report.links.sloReadinessThresholds
		? `<p><a href="${escapeHtml(report.links.sloReadinessThresholds)}">Open Calibration -&gt; Active Readiness Gate</a> to inspect the thresholds currently driving calibrated provider, latency, interruption, reconnect, and monitoring gates.</p>`
		: '';
	const profile = report.profile
		? `<section class="profile"><p class="eyebrow">Readiness profile</p><h2>${escapeHtml(report.profile.name)}</h2><p>${escapeHtml(report.profile.description)}</p><p>${escapeHtml(report.profile.purpose)}</p><div class="profile-surfaces">${report.profile.surfaces
				.map(
					(surface) =>
						`<article class="${surface.configured ? 'pass' : 'warn'}"><span>${surface.configured ? 'CONFIGURED' : 'EXPECTED'}</span><strong>${surface.href ? `<a href="${escapeHtml(surface.href)}">${escapeHtml(surface.label)}</a>` : escapeHtml(surface.label)}</strong></article>`
				)
				.join('')}</div></section>`
		: '';
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
				const explanation = check.gateExplanation
					? `<p class="gate-explanation">Why this gate is ${escapeHtml(check.status)}: observed ${escapeHtml(String(check.gateExplanation.observed ?? 'n/a'))}${check.gateExplanation.unit ? ` ${escapeHtml(check.gateExplanation.unit)}` : ''}; threshold ${escapeHtml(String(check.gateExplanation.threshold ?? 'n/a'))}${check.gateExplanation.unit ? ` ${escapeHtml(check.gateExplanation.unit)}` : ''}. ${escapeHtml(check.gateExplanation.remediation)} ${check.gateExplanation.sourceHref ? `<a href="${escapeHtml(check.gateExplanation.sourceHref)}">Open threshold source</a>` : ''}</p>`
					: '';

				return `<article class="check ${escapeHtml(check.status)}">
        <div>
          <span>${escapeHtml(check.status.toUpperCase())}</span>
          <h2>${escapeHtml(check.label)}</h2>
          ${check.detail ? `<p>${escapeHtml(check.detail)}</p>` : ''}
          ${explanation}
          ${
						check.proofSource
							? `<p class="proof-source">Proof source: ${
									check.proofSource.href
										? `<a href="${escapeHtml(check.proofSource.href)}">${escapeHtml(check.proofSource.sourceLabel)}</a>`
										: escapeHtml(check.proofSource.sourceLabel)
								}${check.proofSource.detail ? ` · ${escapeHtml(check.proofSource.detail)}` : ''}</p>`
							: ''
					}
          ${actions ? `<p class="actions">${actions}</p>` : ''}
        </div>
        <strong>${escapeHtml(String(check.value ?? check.status))}</strong>
        ${check.href ? `<a href="${escapeHtml(check.href)}">Open surface</a>` : ''}
      </article>`;
			}
		)
		.join('');
	const snippet = escapeHtml(`createVoiceProductionReadinessRoutes({
	htmlPath: '/production-readiness',
	path: '/api/production-readiness',
	gatePath: '/api/production-readiness/gate',
	profile: createVoiceReadinessProfile('phone-agent', {
		explain: true,
		links: {
			providerContracts: '/provider-contracts',
			resilience: '/resilience',
			sessions: '/sessions'
		}
	}),
	providerContractMatrix: loadProviderContractMatrix,
	providerRoutingContracts: loadProviderRoutingContracts,
	store: traceStore
});`);

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0c0f14;color:#f6f2e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1060px;padding:32px}.hero,.primitive,.profile{background:linear-gradient(135deg,rgba(20,184,166,.18),rgba(245,158,11,.12));border:1px solid #26313d;border-radius:28px;margin-bottom:18px;padding:28px}.primitive,.profile{background:#111722}.primitive{border-color:#3a3f2d}.eyebrow{color:#fbbf24;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:.9;margin:.2rem 0 1rem}.status{display:inline-flex;border:1px solid #3f3f46;border-radius:999px;padding:8px 12px}.primitive code{color:#fde68a}.primitive p{color:#c8ccd3;line-height:1.55;margin:.45rem 0 0}.primitive pre{background:#0b0f16;border:1px solid #2c3440;border-radius:18px;color:#fef3c7;margin:16px 0 0;overflow:auto;padding:16px}.status.pass,.check.pass,.profile-surfaces .pass{border-color:rgba(34,197,94,.55)}.status.warn,.check.warn,.profile-surfaces .warn{border-color:rgba(245,158,11,.65)}.status.fail,.check.fail{border-color:rgba(239,68,68,.75)}.checks{display:grid;gap:14px}.check{align-items:center;background:#141922;border:1px solid #26313d;border-radius:22px;display:grid;gap:16px;grid-template-columns:1fr auto auto;padding:18px}.check span,.profile-surfaces span{color:#a8b0b8;font-size:.78rem;font-weight:900;letter-spacing:.08em}.check h2{margin:.2rem 0}.check p,.profile p{color:#b9c0c8;margin:.2rem 0 0}.check .proof-source{color:#f9d77e;font-weight:800}.check .gate-explanation{background:#0b0f16;border:1px solid #2c3440;border-radius:14px;color:#fef3c7;margin-top:10px;padding:10px}.check strong{font-size:1.5rem}.profile-surfaces{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-top:16px}.profile-surfaces article{background:#141922;border:1px solid #26313d;border-radius:16px;padding:14px}.profile-surfaces strong{display:block;margin-top:6px}.actions{display:flex;flex-wrap:wrap;gap:10px}.check a,a{color:#fbbf24}button{background:#fbbf24;border:0;border-radius:999px;color:#111827;cursor:pointer;font-weight:800;padding:9px 12px}button:disabled{cursor:wait;opacity:.65}@media(max-width:760px){main{padding:20px}.check{grid-template-columns:1fr}}</style></head><body><main><section class="hero"><p class="eyebrow">Self-hosted readiness</p><h1>${escapeHtml(title)}</h1><p>One deployable pass/fail report for quality gates, provider failover, session health, handoffs, routing evidence, and optional carrier readiness.</p><p class="status ${escapeHtml(report.status)}">Overall: ${escapeHtml(report.status.toUpperCase())}</p><p>Checked ${escapeHtml(new Date(report.checkedAt).toLocaleString())}</p>${thresholdLink}</section>${profile}<section class="primitive"><p class="eyebrow">Copy into your app</p><h2><code>createVoiceProductionReadinessRoutes(...)</code> builds this deploy gate</h2><p>Mount one package primitive to expose JSON readiness, HTML readiness, and a machine-readable gate route. Feed it the proof stores and contract reports your app already owns.</p><pre><code>${snippet}</code></pre></section><section class="checks">${checks}</section></main><script>document.querySelectorAll("[data-readiness-action]").forEach((button)=>{button.addEventListener("click",async()=>{const url=button.getAttribute("data-action-url");if(!url)return;button.disabled=true;const original=button.textContent;button.textContent="Running...";try{const response=await fetch(url,{method:"POST"});button.textContent=response.ok?"Done. Reloading...":"Failed";if(response.ok)setTimeout(()=>location.reload(),500)}catch{button.textContent="Failed"}finally{setTimeout(()=>{button.disabled=false;button.textContent=original},1500)}})});</script></body></html>`;
};

export const createVoiceProductionReadinessRoutes = (
	options: VoiceProductionReadinessRoutesOptions
) => {
	const path = options.path ?? '/api/production-readiness';
	const gatePath =
		options.gatePath === undefined
			? '/api/production-readiness/gate'
			: options.gatePath;
	const htmlPath = options.htmlPath ?? '/production-readiness';
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-production-readiness'
	});
	const resolveOptions = async (input: VoiceProductionReadinessRouteInput) => {
		if (!options.resolveOptions) {
			return options;
		}

		return {
			...options,
			...(await options.resolveOptions(input))
		};
	};

	routes.get(path, async ({ query, request }) =>
		buildVoiceProductionReadinessReport(
			await resolveOptions({ query, request }),
			{ query, request }
		)
	);
	if (gatePath !== false) {
		routes.get(gatePath, async ({ query, request }) => {
			const resolvedOptions = await resolveOptions({ query, request });
			const gate = await buildVoiceProductionReadinessGate(resolvedOptions, {
					query,
					request
				});

			return new Response(JSON.stringify(gate), {
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
					...resolvedOptions.headers
				},
				status: gate.ok ? 200 : 503
			});
		});
	}
	if (htmlPath !== false) {
		routes.get(htmlPath, async ({ query, request }) => {
			const resolvedOptions = await resolveOptions({ query, request });
			const report = await buildVoiceProductionReadinessReport(
				resolvedOptions,
				{
					query,
					request
				}
			);
			const body = await (
				resolvedOptions.render ?? renderVoiceProductionReadinessHTML
			)(report);

			return new Response(body, {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					...resolvedOptions.headers
				}
			});
		});
	}

	return routes;
};
