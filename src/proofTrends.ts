import { Elysia } from "elysia";
import type { Database } from "bun:sqlite";
import {
  createVoiceProviderDecisionTraceEvent,
  type VoiceProviderDecisionStatus,
} from "./providerDecisionTraces";
import type {
  VoiceProductionReadinessAction,
  VoiceProductionReadinessCheck,
  VoiceReadinessRecoveryAction,
} from "./productionReadiness";
import type {
  VoiceReconnectContractReport,
  VoiceReconnectProofReport,
} from "./reconnectContract";
import {
  createVoiceTraceEvent,
  type VoiceTraceEvent,
  StoredVoiceTraceEvent,
  VoiceTraceEventStore,
} from "./trace";

export type VoiceProofTrendStatus = "empty" | "fail" | "pass" | "stale";

export type VoiceProofTrendSummary = {
  cycles?: number;
  maxLiveP95Ms?: number;
  maxProviderP95Ms?: number;
  maxReconnectP95Ms?: number;
  profiles?: VoiceProofTrendProfileSummary[];
  providers?: VoiceProofTrendProviderSummary[];
  reconnect?: VoiceProofTrendReconnectSummary;
  runtimeChannel?: VoiceProofTrendRuntimeChannelSummary;
  maxTurnP95Ms?: number;
};

export type VoiceProofTrendProfileSummary = {
  cycles?: number;
  description?: string;
  id: string;
  label?: string;
  maxLiveP95Ms?: number;
  maxProviderP95Ms?: number;
  maxReconnectP95Ms?: number;
  maxTurnP95Ms?: number;
  providers?: VoiceProofTrendProviderSummary[];
  reconnect?: VoiceProofTrendReconnectSummary;
  runtimeChannel?: VoiceProofTrendRuntimeChannelSummary;
  sessionCount?: number;
  status?: string;
  surfaces?: string[];
};

export type VoiceProofTrendProfileDefinition = {
  description?: string;
  id: string;
  label?: string;
  liveOffsetMs?: number;
  maxLiveP95Ms?: number;
  maxProviderP95Ms?: number;
  maxReconnectP95Ms?: number;
  maxRuntimeFirstAudioLatencyMs?: number;
  maxRuntimeInterruptionP95Ms?: number;
  maxRuntimeJitterMs?: number;
  maxRuntimeTimestampDriftMs?: number;
  maxTurnP95Ms?: number;
  providerOffsetMs?: number;
  runtimeOffsetMs?: number;
  turnOffsetMs?: number;
};

export type VoiceProofTrendProviderSummary = {
  averageMs?: number;
  id: string;
  label?: string;
  p50Ms?: number;
  p95Ms?: number;
  role?: string;
  samples?: number;
  status?: string;
};

export type VoiceProofTrendRuntimeChannelSummary = {
  maxBackpressureEvents?: number;
  maxFirstAudioLatencyMs?: number;
  maxInterruptionP95Ms?: number;
  maxJitterMs?: number;
  maxTimestampDriftMs?: number;
  samples?: number;
  status?: string;
};

export type VoiceProofTrendReconnectSummary = {
  attempts?: number;
  exhausted?: boolean;
  maxAttempts?: number;
  resumeLatencyP95Ms?: number;
  reconnected?: boolean;
  resumed?: boolean;
  samples?: number;
  snapshotCount?: number;
  status?: string;
};

export type VoiceProofTrendCycle = {
  at?: string;
  cycle?: number;
  liveLatency?: {
    p95Ms?: number;
    samples?: number;
  };
  ok?: boolean;
  opsRecovery?: {
    issues?: number;
    status?: string;
  };
  productionReadiness?: {
    status?: string;
  };
  providerSlo?: {
    events?: number;
    eventsWithLatency?: number;
    status?: string;
  };
  providers?: VoiceProofTrendProviderSummary[];
  reconnect?: VoiceProofTrendReconnectSummary;
  runtimeChannel?: VoiceProofTrendRuntimeChannelSummary;
  turnLatency?: {
    p95Ms?: number;
    samples?: number;
    status?: string;
  };
};

export type VoiceProofTrendReportInput = {
  baseUrl?: string;
  cycles?: VoiceProofTrendCycle[];
  generatedAt?: string;
  maxAgeMs?: number;
  now?: Date | number | string;
  ok?: boolean;
  outputDir?: string;
  runId?: string;
  source?: string;
  status?: VoiceProofTrendStatus;
  summary?: VoiceProofTrendSummary;
};

export type VoiceProofTrendReport = {
  ageMs?: number;
  baseUrl?: string;
  cycles: VoiceProofTrendCycle[];
  freshUntil?: string;
  generatedAt?: string;
  maxAgeMs: number;
  ok: boolean;
  outputDir?: string;
  runId?: string;
  source: string;
  status: VoiceProofTrendStatus;
  summary: VoiceProofTrendSummary;
};

export type VoiceProofTrendProfileSummaryOptions = {
  maxLiveP95Ms?: number;
  maxProviderP95Ms?: number;
  maxReconnectP95Ms?: number;
  maxRuntimeFirstAudioLatencyMs?: number;
  maxRuntimeInterruptionP95Ms?: number;
  maxRuntimeJitterMs?: number;
  maxRuntimeTimestampDriftMs?: number;
  maxTurnP95Ms?: number;
  profiles?: readonly VoiceProofTrendProfileDefinition[];
};

export type VoiceProofTrendRealCallProfileEvidence = {
  generatedAt?: string;
  liveP95Ms?: number;
  ok?: boolean;
  operationsRecordHref?: string;
  profileDescription?: string;
  profileId: string;
  profileLabel?: string;
  providerP95Ms?: number;
  providers?: VoiceProofTrendProviderSummary[];
  reconnect?: VoiceProofTrendReconnectSummary;
  runtimeChannel?: VoiceProofTrendRuntimeChannelSummary;
  sessionId: string;
  surfaces?: string[];
  turnP95Ms?: number;
};

export type VoiceRealCallProfileEvidenceRecord =
  VoiceProofTrendRealCallProfileEvidence & {
    createdAt: string;
    id: string;
  };

export type VoiceRealCallProfileEvidenceCreateInput =
  VoiceProofTrendRealCallProfileEvidence & {
    createdAt?: string;
    id?: string;
  };

export type VoiceRealCallProfileEvidenceListOptions = {
  limit?: number;
  profileId?: string;
  sessionId?: string;
  since?: Date | number | string;
  until?: Date | number | string;
};

export type VoiceRealCallProfileEvidenceStore = {
  append(
    input: VoiceRealCallProfileEvidenceCreateInput,
  ):
    | Promise<VoiceRealCallProfileEvidenceRecord>
    | VoiceRealCallProfileEvidenceRecord;
  get(
    id: string,
  ):
    | Promise<VoiceRealCallProfileEvidenceRecord | undefined>
    | VoiceRealCallProfileEvidenceRecord
    | undefined;
  list(
    options?: VoiceRealCallProfileEvidenceListOptions,
  ):
    | Promise<VoiceRealCallProfileEvidenceRecord[]>
    | VoiceRealCallProfileEvidenceRecord[];
  remove(id: string): Promise<void> | void;
};

export type VoiceSQLiteRealCallProfileEvidenceStoreOptions = {
  database?: Database;
  idPrefix?: string;
  now?: () => Date;
  path?: string;
  tableName?: string;
};

export type VoiceReconnectRealCallProfileEvidenceOptions = {
  operationsRecordHref?: string | ((report: VoiceReconnectProofReport | VoiceReconnectContractReport, index: number) => string | undefined);
  profileDescription?: string;
  profileId?: string;
  profileLabel?: string;
  sessionId?: string | ((report: VoiceReconnectProofReport | VoiceReconnectContractReport, index: number) => string);
  surfaces?: readonly string[];
};

export type VoiceRealCallProfileTraceEvidenceOptions = {
  defaultProfileId?: string;
  defaultProfileLabel?: string;
  maxProviderP95Ms?: number;
  profileDescriptions?: Record<string, string>;
  profileLabels?: Record<string, string>;
  sessionIds?: readonly string[];
};

export type VoiceRealCallProfileTraceStoreEvidenceOptions =
  VoiceRealCallProfileTraceEvidenceOptions & {
    limit?: number;
    store: VoiceTraceEventStore;
  };

export type VoiceRealCallProfileTraceCollectorEvidenceOptions =
  VoiceRealCallProfileTraceEvidenceOptions & {
    limit?: number;
  };

export type VoiceRealCallProfileTraceCollectorOptions<
  TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
> = VoiceRealCallProfileTraceCollectorEvidenceOptions & {
  store: VoiceTraceEventStore<TEvent>;
};

export type VoiceRealCallProfileTraceCollector<
  TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
> = VoiceTraceEventStore<TEvent> & {
  buildHistoryReport: (
    options?: Omit<VoiceRealCallProfileHistoryOptions, "evidence"> & {
      evidenceOptions?: VoiceRealCallProfileTraceCollectorEvidenceOptions;
    },
  ) => Promise<VoiceRealCallProfileHistoryReport>;
  listCapturedSessionIds: () => string[];
  listEvidence: (
    options?: VoiceRealCallProfileTraceCollectorEvidenceOptions,
  ) => Promise<VoiceProofTrendRealCallProfileEvidence[]>;
};

export type VoiceProofTrendRealCallProfileReportOptions =
  VoiceProofTrendProfileSummaryOptions & {
    baseUrl?: string;
    evidence: readonly VoiceProofTrendRealCallProfileEvidence[];
    generatedAt?: string;
    maxAgeMs?: number;
    now?: Date | number | string;
    outputDir?: string;
    runId?: string;
    source?: string;
  };

export type VoiceProofTrendAssertionInput = {
  maxAgeMs?: number;
  maxRuntimeBackpressureEvents?: number;
  maxRuntimeFirstAudioLatencyMs?: number;
  maxRuntimeInterruptionP95Ms?: number;
  maxRuntimeJitterMs?: number;
  maxRuntimeTimestampDriftMs?: number;
  maxLiveP95Ms?: number;
  maxProviderP95Ms?: number;
  maxTurnP95Ms?: number;
  minCycles?: number;
  minLiveLatencySamples?: number;
  minProviderSloEventsWithLatency?: number;
  minRuntimeChannelSamples?: number;
  minTurnLatencySamples?: number;
  requireAllCyclesOk?: boolean;
  requireStatus?: VoiceProofTrendStatus;
};

export type VoiceProofTrendAssertionReport = {
  ageMs?: number;
  cycles: number;
  failedCycles: number;
  issues: string[];
  maxLiveP95Ms?: number;
  maxProviderP95Ms?: number;
  runtimeChannel?: VoiceProofTrendRuntimeChannelSummary;
  maxTurnP95Ms?: number;
  ok: boolean;
  status: VoiceProofTrendStatus;
};

export type VoiceProofTrendRoutesOptions = {
  headers?: HeadersInit;
  jsonPath?: string;
  maxAgeMs?: number;
  name?: string;
  path?: string;
  source?:
    | (() =>
        | Promise<VoiceProofTrendReport | VoiceProofTrendReportInput>
        | VoiceProofTrendReport
        | VoiceProofTrendReportInput)
    | VoiceProofTrendReport
    | VoiceProofTrendReportInput;
};

export type VoiceProofTrendRecommendationStatus = "fail" | "pass" | "warn";

export type VoiceProofTrendRecommendationSurface =
  | "live-latency"
  | "provider-path"
  | "runtime-channel"
  | "turn-latency";

export type VoiceProofTrendRecommendation = {
  evidence: Record<string, number | string | undefined>;
  nextMove: string;
  providerId?: string;
  role?: string;
  recommendation: string;
  status: VoiceProofTrendRecommendationStatus;
  surface: VoiceProofTrendRecommendationSurface;
};

export type VoiceProofTrendProviderRecommendation = {
  averageMs?: number;
  id: string;
  label?: string;
  nextMove: string;
  p50Ms?: number;
  p95Ms?: number;
  rank: number;
  role?: string;
  samples?: number;
  status: VoiceProofTrendRecommendationStatus;
};

export type VoiceProofTrendRecommendationReport = {
  bestProvider?: VoiceProofTrendProviderRecommendation;
  bestProviders: VoiceProofTrendProviderRecommendation[];
  generatedAt: string;
  issues: string[];
  ok: boolean;
  profiles: VoiceProofTrendProfileRecommendation[];
  providers: VoiceProofTrendProviderRecommendation[];
  recommendations: VoiceProofTrendRecommendation[];
  source: string;
  status: VoiceProofTrendRecommendationStatus;
  summary: {
    keepCurrentProviderPath: boolean;
    keepCurrentRuntimeChannel: boolean;
    providerComparisonCount: number;
    recommendedActions: number;
    switchRecommended: boolean;
  };
};

export type VoiceProofTrendProfileRecommendation = {
  bestProviders: VoiceProofTrendProviderRecommendation[];
  id: string;
  label?: string;
  nextMove: string;
  providerComparisonCount: number;
  recommendation: string;
  status: VoiceProofTrendRecommendationStatus;
};

export type VoiceProofTrendRecommendationOptions = {
  currentProviderId?: string;
  maxLiveP95Ms?: number;
  maxProviderP95Ms?: number;
  maxRuntimeBackpressureEvents?: number;
  maxRuntimeFirstAudioLatencyMs?: number;
  maxRuntimeInterruptionP95Ms?: number;
  maxRuntimeJitterMs?: number;
  maxRuntimeTimestampDriftMs?: number;
  maxTurnP95Ms?: number;
  providerSwitchMinImprovementMs?: number;
  providerSwitchMinImprovementRatio?: number;
};

export type VoiceProofTrendRecommendationRoutesOptions =
  VoiceProofTrendRecommendationOptions & {
    headers?: HeadersInit;
    htmlPath?: false | string;
    jsonPath?: string;
    maxAgeMs?: number;
    markdownPath?: false | string;
    name?: string;
    path?: string;
    source?:
      | (() =>
          | Promise<VoiceProofTrendReport | VoiceProofTrendReportInput>
          | VoiceProofTrendReport
          | VoiceProofTrendReportInput)
      | VoiceProofTrendReport
      | VoiceProofTrendReportInput;
    title?: string;
  };

export type VoiceRealCallProfileHistoryReport = {
  defaults: VoiceRealCallProfileDefaultsReport;
  generatedAt: string;
  history: VoiceProofTrendReport[];
  issues: string[];
  ok: boolean;
  recommendations: VoiceProofTrendRecommendationReport;
  reports: number;
  source: string;
  status: VoiceProofTrendStatus;
  summary: VoiceProofTrendSummary & {
    failedReports: number;
    profileCount: number;
  };
  trend: VoiceProofTrendReport;
};

export type VoiceRealCallProfileHistoryOptions =
  VoiceProofTrendProfileSummaryOptions &
    VoiceProofTrendRecommendationOptions & {
      baseUrl?: string;
      evidence?: readonly VoiceProofTrendRealCallProfileEvidence[];
      generatedAt?: string;
      maxAgeMs?: number;
      now?: Date | number | string;
      reports?: readonly (VoiceProofTrendReport | VoiceProofTrendReportInput)[];
      source?: string;
    };

export type VoiceRealCallProfileDefault = {
  evidence: {
    liveP95Ms?: number;
    providerP95Ms?: number;
    turnP95Ms?: number;
  };
  label?: string;
  latencyBudgets: {
    maxLiveP95Ms?: number;
    maxProviderP95Ms?: number;
    maxTurnP95Ms?: number;
  };
  nextMove: string;
  profileId: string;
  providerRoutes: Record<string, string>;
  providers: VoiceProofTrendProviderRecommendation[];
  runtimeChannel?: {
    maxBackpressureEvents?: number;
    maxFirstAudioLatencyMs?: number;
    maxInterruptionP95Ms?: number;
    maxJitterMs?: number;
    maxTimestampDriftMs?: number;
  };
  status: VoiceProofTrendRecommendationStatus;
};

export type VoiceRealCallProfileDefaultsReport = {
  generatedAt: string;
  issues: string[];
  ok: boolean;
  profiles: VoiceRealCallProfileDefault[];
  source: string;
  status: VoiceProofTrendRecommendationStatus;
  summary: {
    actionableProfiles: number;
    profileCount: number;
    requiredProviderRoles: string[];
  };
};

export type VoiceRealCallProfileDefaultsOptions =
  VoiceProofTrendRecommendationOptions & {
    latencyBudgetHeadroomMs?: number;
    latencyBudgetHeadroomRatio?: number;
    requiredProviderRoles?: readonly string[];
  };

export type VoiceRealCallProfileProviderRouteOptions<
  TProvider extends string = string,
> = {
  availableProviders?: readonly TProvider[];
  defaults:
    | VoiceRealCallProfileDefaultsReport
    | VoiceRealCallProfileHistoryReport;
  fallbackProvider?: TProvider;
  profileId?: string;
  providerAliases?: Partial<Record<string, TProvider | readonly TProvider[]>>;
  role: string;
};

export type VoiceRealCallProfileHistoryRoutesOptions = Omit<
  VoiceRealCallProfileHistoryOptions,
  "source"
> & {
  headers?: HeadersInit;
  htmlPath?: false | string;
  markdownPath?: false | string;
  name?: string;
  path?: string;
  source?:
    | (() =>
        | Promise<VoiceRealCallProfileHistoryOptions>
        | VoiceRealCallProfileHistoryOptions)
    | VoiceRealCallProfileHistoryOptions;
  title?: string;
};

export type VoiceRealCallProfileRecoveryActionId =
  | "collect-browser-proof"
  | "collect-phone-proof"
  | "collect-reconnect-proof"
  | "collect-provider-role-evidence"
  | "refresh";

export type VoiceRealCallProfileRecoveryAction =
  VoiceProductionReadinessAction & {
    id: VoiceRealCallProfileRecoveryActionId;
    profileId?: string;
  };

export type VoiceRealCallProfileReadinessCheckOptions = {
  browserProofHref?: string;
  failOnWarnings?: boolean;
  reconnectProofHref?: string;
  href?: string;
  label?: string;
  maxAgeMs?: number;
  minActionableProfiles?: number;
  minCycles?: number;
  minProfileCycles?: number;
  minProfileSessions?: number;
  minProfiles?: number;
  requiredProfileIds?: readonly string[];
  requiredProfileSurfaces?:
    | readonly string[]
    | Record<string, readonly string[]>;
  requiredProviderRoles?: readonly string[];
  operationsRecordsHref?: string;
  phoneProofHref?: string;
  productionReadinessHref?: string;
  sourceHref?: string;
};

export type VoiceRealCallProfileRecoveryActionOptions =
  VoiceRealCallProfileReadinessCheckOptions;

export type VoiceRealCallProfileRecoveryJobHistoryCheckOptions = {
  allowFailedJobs?: boolean;
  failOnRunningJobs?: boolean;
  href?: string;
  label?: string;
  maxAgeMs?: number;
  minCompletedJobs?: number;
  sourceHref?: string;
};

export type VoiceRealCallProfileRecoveryActionHandlerInput = {
  actionId: VoiceRealCallProfileRecoveryActionId;
  profileId?: string;
  report: VoiceRealCallProfileHistoryReport;
};

export type VoiceRealCallProfileRecoveryActionResult = {
  actionId: VoiceRealCallProfileRecoveryActionId;
  generatedAt: string;
  job?: VoiceRealCallProfileRecoveryJob;
  jobId?: string;
  jobStatus?: VoiceRealCallProfileRecoveryJobStatus;
  message?: string;
  ok: boolean;
  report?: VoiceRealCallProfileHistoryReport;
  status: VoiceProofTrendStatus;
};

export type VoiceRealCallProfileRecoveryJobStatus =
  | "fail"
  | "pass"
  | "queued"
  | "running";

export type VoiceRealCallProfileRecoveryJob = {
  actionId: VoiceRealCallProfileRecoveryActionId;
  completedAt?: string;
  createdAt: string;
  id: string;
  message?: string;
  ok?: boolean;
  report?: VoiceRealCallProfileHistoryReport;
  startedAt?: string;
  status: VoiceRealCallProfileRecoveryJobStatus;
  updatedAt: string;
};

export type VoiceRealCallProfileRecoveryJobCreateInput = {
  actionId: VoiceRealCallProfileRecoveryActionId;
  createdAt?: string;
  id?: string;
  message?: string;
  status?: VoiceRealCallProfileRecoveryJobStatus;
};

export type VoiceRealCallProfileRecoveryJobUpdate = Partial<
  Pick<
    VoiceRealCallProfileRecoveryJob,
    | "completedAt"
    | "message"
    | "ok"
    | "report"
    | "startedAt"
    | "status"
    | "updatedAt"
  >
>;

export type VoiceRealCallProfileRecoveryJobListOptions = {
  actionId?: VoiceRealCallProfileRecoveryActionId;
  limit?: number;
  status?: VoiceRealCallProfileRecoveryJobStatus;
};

export type VoiceRealCallProfileRecoveryJobStore = {
  create(
    input: VoiceRealCallProfileRecoveryJobCreateInput,
  ): Promise<VoiceRealCallProfileRecoveryJob> | VoiceRealCallProfileRecoveryJob;
  get(
    id: string,
  ):
    | Promise<VoiceRealCallProfileRecoveryJob | undefined>
    | VoiceRealCallProfileRecoveryJob
    | undefined;
  list?(
    options?: VoiceRealCallProfileRecoveryJobListOptions,
  ):
    | Promise<VoiceRealCallProfileRecoveryJob[]>
    | VoiceRealCallProfileRecoveryJob[];
  update(
    id: string,
    update: VoiceRealCallProfileRecoveryJobUpdate,
  ):
    | Promise<VoiceRealCallProfileRecoveryJob | undefined>
    | VoiceRealCallProfileRecoveryJob
    | undefined;
};

export type VoiceSQLiteRealCallProfileRecoveryJobStoreOptions = {
  database?: Database;
  idPrefix?: string;
  now?: () => Date;
  path?: string;
  tableName?: string;
};

export type VoiceRealCallProfileRecoveryActionHandler = (
  input: VoiceRealCallProfileRecoveryActionHandlerInput,
) =>
  | Promise<Partial<VoiceRealCallProfileRecoveryActionResult> | void>
  | Partial<VoiceRealCallProfileRecoveryActionResult>
  | void;

export type VoiceRealCallProfileRecoveryActionRoutesOptions =
  VoiceRealCallProfileRecoveryActionOptions &
    Omit<
      VoiceRealCallProfileHistoryRoutesOptions,
      "htmlPath" | "markdownPath"
    > & {
      asyncActionIds?: readonly VoiceRealCallProfileRecoveryActionId[];
      handlers?: Partial<
        Record<
          VoiceRealCallProfileRecoveryActionId,
          VoiceRealCallProfileRecoveryActionHandler
        >
      >;
      jobStore?: VoiceRealCallProfileRecoveryJobStore;
    };

export type VoiceRealCallProfileRecoveryLoopAction =
  Partial<VoiceReadinessRecoveryAction> &
    Partial<VoiceRealCallProfileRecoveryAction> & {
      href?: string;
      method?: string;
    };

export type VoiceRealCallProfileRecoveryLoopJob =
  Partial<VoiceRealCallProfileRecoveryJob> & {
    error?: string;
    id?: string;
    status?: string;
  };

export type VoiceRealCallProfileRecoveryLoopJobResult = {
  action: string;
  jobId?: string;
  result: VoiceRealCallProfileRecoveryLoopJob;
};

export type VoiceRealCallProfileRecoveryLoopStartFailure = {
  action: string;
  error: string;
};

export type VoiceRealCallProfileRecoveryLoopReport = {
  actionCount: number;
  actions: VoiceRealCallProfileRecoveryLoopAction[];
  jobs: VoiceRealCallProfileRecoveryLoopJobResult[];
  passes: number;
  ok: boolean;
  realCallProfileGate: VoiceProductionReadinessCheck | null;
  startFailures: VoiceRealCallProfileRecoveryLoopStartFailure[];
};

export type VoiceRealCallProfileRecoveryLoopOptions = {
  actionFilter?: (action: VoiceRealCallProfileRecoveryLoopAction) => boolean;
  baseUrl: string;
  fetch?: typeof fetch;
  interPassDelayMs?: number;
  jobHref?: string | ((jobId: string) => string);
  jobPollMs?: number;
  jobTimeoutMs?: number;
  logger?: Pick<Console, "log">;
  maxPasses?: number;
  readinessCheckLabel?: string;
  readinessHref?: string;
  recoveryActionsHref?: string;
  refreshHref?: false | string;
  requestTimeoutMs?: number;
};

export type VoiceRealCallProfileRecoveryEvidenceProviderRole =
  | "llm"
  | "stt"
  | "tts";

export type VoiceRealCallProfileRecoveryEvidenceProvider =
  | string
  | {
      elapsedMs?: number;
      provider: string;
      reason?: string;
      selectedProvider?: string;
      status?: VoiceProviderDecisionStatus;
      surface?: string;
    };

export type VoiceRealCallProfileRecoveryEvidenceOptions<
  TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
> = {
  at?: number;
  browser?:
    | false
    | {
        firstAudioLatencyMs?: number;
        messageCount?: number;
        openSockets?: number;
        receivedBytes?: number;
        sentBytes?: number;
        status?: string;
      };
  live?:
    | false
    | {
        latencyMs?: number;
        status?: string;
      };
  metadata?: Record<string, unknown>;
  profileId: string;
  providers?: Partial<
    Record<
      VoiceRealCallProfileRecoveryEvidenceProviderRole,
      VoiceRealCallProfileRecoveryEvidenceProvider
    >
  >;
  scenarioId?: string;
  sessionId?: string;
  store: Pick<VoiceTraceEventStore<TEvent>, "append">;
};

export type VoiceRealCallProfileRecoveryEvidenceResult<
  TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
> = {
  events: TEvent[];
  sessionId: string;
};

export const DEFAULT_VOICE_PROOF_TRENDS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_VOICE_PROOF_TREND_PROFILE_DEFINITIONS = [
  {
    description:
      "Browser recorder with longer passive listening and transcript capture.",
    id: "meeting-recorder",
    label: "Meeting recorder",
  },
  {
    description:
      "Realtime support agent with fast interruption recovery and tool-ready turns.",
    id: "support-agent",
    label: "Support agent",
    liveOffsetMs: 17,
    providerOffsetMs: 20,
    runtimeOffsetMs: 10,
    turnOffsetMs: 3,
  },
  {
    description:
      "Appointment scheduler with short structured turns and reliable follow-up capture.",
    id: "appointment-scheduler",
    label: "Appointment scheduler",
    liveOffsetMs: 29,
    providerOffsetMs: 35,
    runtimeOffsetMs: 16,
    turnOffsetMs: 5,
  },
  {
    description:
      "Noisy phone call with stricter transport and interruption proof requirements.",
    id: "noisy-phone-call",
    label: "Noisy phone call",
    liveOffsetMs: 40,
    providerOffsetMs: 60,
    runtimeOffsetMs: 22,
    turnOffsetMs: 7,
  },
] satisfies readonly VoiceProofTrendProfileDefinition[];

const normalizeMaxAgeMs = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_VOICE_PROOF_TRENDS_MAX_AGE_MS;

const toTimeMs = (value: Date | number | string | undefined) => {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Date.parse(value);
  }
  return Date.now();
};

export const buildVoiceProofTrendReport = (
  input: VoiceProofTrendReportInput = {},
): VoiceProofTrendReport => {
  const maxAgeMs = normalizeMaxAgeMs(input.maxAgeMs);
  const nowMs = toTimeMs(input.now);
  const generatedAtMs =
    typeof input.generatedAt === "string"
      ? Date.parse(input.generatedAt)
      : Number.NaN;
  const ageMs =
    Number.isFinite(generatedAtMs) && Number.isFinite(nowMs)
      ? Math.max(0, nowMs - generatedAtMs)
      : undefined;
  const freshUntil =
    Number.isFinite(generatedAtMs) && Number.isFinite(maxAgeMs)
      ? new Date(generatedAtMs + maxAgeMs).toISOString()
      : undefined;
  const isFresh = ageMs !== undefined && ageMs <= maxAgeMs;
  const status: VoiceProofTrendStatus =
    input.status === "empty"
      ? "empty"
      : !isFresh
        ? "stale"
        : input.ok === true
          ? "pass"
          : "fail";

  return {
    ageMs,
    baseUrl: input.baseUrl,
    cycles: input.cycles ?? [],
    freshUntil,
    generatedAt: input.generatedAt,
    maxAgeMs,
    ok: input.ok === true && status === "pass",
    outputDir: input.outputDir,
    runId: input.runId,
    source: input.source ?? "",
    status,
    summary: input.summary ?? {},
  };
};

export const buildEmptyVoiceProofTrendReport = (
  source = "",
  maxAgeMs?: number,
): VoiceProofTrendReport =>
  buildVoiceProofTrendReport({
    maxAgeMs,
    source,
    status: "empty",
  });

export const normalizeVoiceProofTrendReport = (
  value: VoiceProofTrendReport | VoiceProofTrendReportInput,
  options: {
    maxAgeMs?: number;
    now?: Date | number | string;
    source?: string;
  } = {},
): VoiceProofTrendReport => {
  if ("status" in value && value.status === "empty") {
    return buildEmptyVoiceProofTrendReport(
      value.source || options.source || "",
      options.maxAgeMs ?? value.maxAgeMs,
    );
  }

  return buildVoiceProofTrendReport({
    ...value,
    maxAgeMs: options.maxAgeMs ?? value.maxAgeMs,
    now: options.now ?? ("now" in value ? value.now : undefined),
    source: value.source ?? options.source,
  });
};

export const readVoiceProofTrendReportFile = async (
  path: string,
  options: { maxAgeMs?: number } = {},
): Promise<VoiceProofTrendReport> => {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return buildEmptyVoiceProofTrendReport(path, options.maxAgeMs);
  }

  try {
    const parsed = (await file.json()) as VoiceProofTrendReportInput;
    return normalizeVoiceProofTrendReport(parsed, {
      maxAgeMs: options.maxAgeMs,
      source: path,
    });
  } catch {
    return buildVoiceProofTrendReport({
      maxAgeMs: options.maxAgeMs,
      source: path,
    });
  }
};

const maxNumber = (values: Array<number | undefined>) => {
  const finite = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  return finite.length > 0 ? Math.max(...finite) : undefined;
};

const percentile = (values: number[], rank: number) => {
  const finite = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (finite.length === 0) {
    return undefined;
  }
  const index = Math.min(
    finite.length - 1,
    Math.max(0, Math.ceil((rank / 100) * finite.length) - 1),
  );
  return finite[index];
};

const averageNumber = (values: number[]) => {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length === 0
    ? undefined
    : Math.round(
        finite.reduce((total, value) => total + value, 0) / finite.length,
      );
};

const readString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : undefined;

const readNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const readProofTrendMaxLiveP95 = (report: VoiceProofTrendReport) =>
  report.summary.maxLiveP95Ms ??
  maxNumber(report.cycles.map((cycle) => cycle.liveLatency?.p95Ms));

const readProofTrendMaxProviderP95 = (report: VoiceProofTrendReport) =>
  report.summary.maxProviderP95Ms ??
  maxNumber(
    (report.summary.providers ?? []).map((provider) => provider.p95Ms),
  ) ??
  maxNumber(
    report.cycles.flatMap((cycle) =>
      (cycle.providers ?? []).map((provider) => provider.p95Ms),
    ),
  );

const readProofTrendMaxReconnectP95 = (report: VoiceProofTrendReport) =>
  report.summary.maxReconnectP95Ms ??
  report.summary.reconnect?.resumeLatencyP95Ms ??
  maxNumber(
    report.cycles.map((cycle) => cycle.reconnect?.resumeLatencyP95Ms),
  );

const readProofTrendMaxTurnP95 = (report: VoiceProofTrendReport) =>
  report.summary.maxTurnP95Ms ??
  maxNumber(report.cycles.map((cycle) => cycle.turnLatency?.p95Ms));

const readRuntimeChannelMetric = (
  report: VoiceProofTrendReport,
  key: Exclude<keyof VoiceProofTrendRuntimeChannelSummary, "status">,
) => {
  const summaryValue = report.summary.runtimeChannel?.[key];
  return typeof summaryValue === "number"
    ? summaryValue
    : maxNumber(
        report.cycles.map((cycle) => {
          const value = cycle.runtimeChannel?.[key];
          return typeof value === "number" ? value : undefined;
        }),
      );
};

const readProofTrendRuntimeChannel = (
  report: VoiceProofTrendReport,
): VoiceProofTrendRuntimeChannelSummary => ({
  maxBackpressureEvents: readRuntimeChannelMetric(
    report,
    "maxBackpressureEvents",
  ),
  maxFirstAudioLatencyMs: readRuntimeChannelMetric(
    report,
    "maxFirstAudioLatencyMs",
  ),
  maxInterruptionP95Ms: readRuntimeChannelMetric(
    report,
    "maxInterruptionP95Ms",
  ),
  maxJitterMs: readRuntimeChannelMetric(report, "maxJitterMs"),
  maxTimestampDriftMs: readRuntimeChannelMetric(report, "maxTimestampDriftMs"),
  samples:
    report.summary.runtimeChannel?.samples ??
    maxNumber(report.cycles.map((cycle) => cycle.runtimeChannel?.samples)),
  status: report.summary.runtimeChannel?.status,
});

const addProofTrendProfileOffset = (
  value: number | undefined,
  offset: number | undefined,
  cap: number | undefined,
) => {
  if (value === undefined) {
    return undefined;
  }

  const nextValue = Math.round(value + (offset ?? 0));
  return cap === undefined ? nextValue : Math.min(cap, nextValue);
};

const aggregateProofTrendProviders = (
  providers: readonly VoiceProofTrendProviderSummary[],
): VoiceProofTrendProviderSummary[] => {
  const providersById = new Map<string, VoiceProofTrendProviderSummary>();

  for (const provider of providers) {
    if (!provider.id) {
      continue;
    }
    if (
      provider.p95Ms === undefined &&
      provider.p50Ms === undefined &&
      provider.averageMs === undefined &&
      (provider.samples ?? 0) <= 0
    ) {
      continue;
    }
    const existing = providersById.get(provider.id);
    providersById.set(provider.id, {
      averageMs: maxNumber([existing?.averageMs, provider.averageMs]),
      id: provider.id,
      label: existing?.label ?? provider.label,
      p50Ms: maxNumber([existing?.p50Ms, provider.p50Ms]),
      p95Ms: maxNumber([existing?.p95Ms, provider.p95Ms]),
      role: existing?.role ?? provider.role,
      samples: (existing?.samples ?? 0) + (provider.samples ?? 0),
      status:
        existing?.status === "fail" || provider.status === "fail"
          ? "fail"
          : existing?.status === "warn" || provider.status === "warn"
            ? "warn"
            : (provider.status ?? existing?.status),
    });
  }

  return [...providersById.values()].sort(
    (left, right) =>
      (left.p95Ms ?? Number.POSITIVE_INFINITY) -
      (right.p95Ms ?? Number.POSITIVE_INFINITY),
  );
};

const aggregateProofTrendRuntimeChannel = (
  channels: readonly VoiceProofTrendRuntimeChannelSummary[],
): VoiceProofTrendRuntimeChannelSummary | undefined => {
  if (channels.length === 0) {
    return undefined;
  }

  return {
    maxBackpressureEvents: maxNumber(
      channels.map((channel) => channel.maxBackpressureEvents),
    ),
    maxFirstAudioLatencyMs: maxNumber(
      channels.map((channel) => channel.maxFirstAudioLatencyMs),
    ),
    maxInterruptionP95Ms: maxNumber(
      channels.map((channel) => channel.maxInterruptionP95Ms),
    ),
    maxJitterMs: maxNumber(channels.map((channel) => channel.maxJitterMs)),
    maxTimestampDriftMs: maxNumber(
      channels.map((channel) => channel.maxTimestampDriftMs),
    ),
    samples: maxNumber(channels.map((channel) => channel.samples)),
    status: channels.some((channel) => channel.status === "fail")
      ? "fail"
      : channels.some((channel) => channel.status === "warn")
        ? "warn"
        : channels.every((channel) => channel.status === "pass")
          ? "pass"
          : undefined,
  };
};

const aggregateProofTrendReconnect = (
  reconnects: readonly VoiceProofTrendReconnectSummary[],
): VoiceProofTrendReconnectSummary | undefined => {
  if (reconnects.length === 0) {
    return undefined;
  }

  const hasFailure = reconnects.some(
    (reconnect) =>
      reconnect.status === "fail" ||
      reconnect.exhausted === true ||
      reconnect.reconnected === false ||
      reconnect.resumed === false,
  );

  return {
    attempts: maxNumber(reconnects.map((reconnect) => reconnect.attempts)),
    exhausted: reconnects.some((reconnect) => reconnect.exhausted === true),
    maxAttempts: maxNumber(
      reconnects.map((reconnect) => reconnect.maxAttempts),
    ),
    resumeLatencyP95Ms: maxNumber(
      reconnects.map((reconnect) => reconnect.resumeLatencyP95Ms),
    ),
    reconnected: reconnects.some(
      (reconnect) => reconnect.reconnected === true,
    ),
    resumed: reconnects.some((reconnect) => reconnect.resumed === true),
    samples: reconnects.reduce(
      (total, reconnect) => total + (reconnect.samples ?? 0),
      0,
    ),
    snapshotCount: reconnects.reduce(
      (total, reconnect) => total + (reconnect.snapshotCount ?? 0),
      0,
    ),
    status: hasFailure
      ? "fail"
      : reconnects.some((reconnect) => reconnect.status === "warn")
        ? "warn"
        : "pass",
  };
};

const summarizeReconnectTraceEvidence = (
  events: readonly StoredVoiceTraceEvent[],
): VoiceProofTrendReconnectSummary | undefined => {
  const reconnectEvents = events.filter(
    (event) => event.type === "client.reconnect",
  );
  if (reconnectEvents.length === 0) {
    return undefined;
  }

  const statuses = reconnectEvents
    .map((event) => readString(readTraceRecord(event).status))
    .filter((status): status is string => status !== undefined);
  const reconnectPayloads = reconnectEvents.map((event) => readTraceRecord(event));

  return {
    attempts: maxNumber(
      reconnectPayloads.map((payload) => readNumber(payload.attempts)),
    ),
    exhausted: statuses.includes("exhausted"),
    maxAttempts: maxNumber(
      reconnectPayloads.map((payload) => readNumber(payload.maxAttempts)),
    ),
    resumeLatencyP95Ms: percentile(
      reconnectPayloads
        .map((payload) =>
          readNumber(payload.resumeLatencyP95Ms) ??
          readNumber(payload.resumeLatencyMs),
        )
        .filter((value): value is number => value !== undefined),
      95,
    ),
    reconnected: statuses.includes("reconnecting"),
    resumed: statuses.includes("resumed") || statuses.includes("pass"),
    samples: reconnectEvents.length,
    snapshotCount: reconnectEvents.length,
    status: reconnectEvents.some((event) =>
      isFailingTraceStatus(readTraceStatus(readTraceRecord(event))),
    )
      ? "fail"
      : "pass",
  };
};

const readTraceRecord = (event: StoredVoiceTraceEvent) =>
  event.payload as Record<string, unknown>;

const readTraceProfileId = (
  events: readonly StoredVoiceTraceEvent[],
  options: VoiceRealCallProfileTraceEvidenceOptions,
) => {
  for (const event of events) {
    const payload = readTraceRecord(event);
    const profileId =
      readString(payload.profileId) ??
      readString(event.metadata?.profileId) ??
      readString(payload.benchmarkProfileId) ??
      readString(event.metadata?.benchmarkProfileId);
    if (profileId) {
      return profileId;
    }
  }

  return options.defaultProfileId;
};

const readProviderTraceRole = (payload: Record<string, unknown>) =>
  readString(payload.kind) ??
  readString(payload.role) ??
  readString(payload.surface) ??
  "provider";

const readProviderTraceLatency = (payload: Record<string, unknown>) =>
  readNumber(payload.elapsedMs) ??
  readNumber(payload.latencyMs) ??
  readNumber(payload.durationMs);

const readProviderTraceId = (payload: Record<string, unknown>) =>
  readString(payload.selectedProvider) ??
  readString(payload.provider) ??
  readString(payload.model) ??
  readString(payload.adapter);

const readTraceStatus = (payload: Record<string, unknown>) =>
  readString(payload.providerStatus) ?? readString(payload.status);

const isFailingTraceStatus = (status: string | undefined) =>
  status === "error" ||
  status === "fail" ||
  status === "failed" ||
  status === "timeout";

const summarizeProviderTraceEvidence = (
  events: readonly StoredVoiceTraceEvent[],
  maxProviderP95Ms?: number,
) => {
  const providerLatencies = new Map<string, number[]>();
  const providerMeta = new Map<
    string,
    { failed: boolean; label: string; role: string }
  >();

  for (const event of events) {
    if (event.type !== "session.error" && event.type !== "provider.decision") {
      continue;
    }

    const payload = readTraceRecord(event);
    const provider = readProviderTraceId(payload);
    if (!provider) {
      continue;
    }

    const role = readProviderTraceRole(payload);
    const id = `${role}:${provider}`;
    const latency = readProviderTraceLatency(payload);
    if (latency !== undefined) {
      providerLatencies.set(id, [
        ...(providerLatencies.get(id) ?? []),
        latency,
      ]);
    }
    const existing = providerMeta.get(id);
    providerMeta.set(id, {
      failed:
        existing?.failed === true ||
        isFailingTraceStatus(readTraceStatus(payload)),
      label: existing?.label ?? `${role.toUpperCase()} ${provider}`,
      role: existing?.role ?? role,
    });
  }

  return [...providerMeta.entries()].map(([id, meta]) => {
    const latencies = providerLatencies.get(id) ?? [];
    const p95Ms = percentile(latencies, 95);
    return {
      averageMs: averageNumber(latencies),
      id,
      label: meta.label,
      p50Ms: percentile(latencies, 50),
      p95Ms,
      role: meta.role,
      samples: latencies.length,
      status:
        meta.failed ||
        (p95Ms ?? 0) > (maxProviderP95Ms ?? Number.POSITIVE_INFINITY)
          ? "fail"
          : latencies.length > 0
            ? "pass"
            : "warn",
    } satisfies VoiceProofTrendProviderSummary;
  });
};

const summarizeTurnTraceP95 = (events: readonly StoredVoiceTraceEvent[]) => {
  const explicit = events
    .filter((event) => event.type === "turn_latency.stage")
    .map((event) => {
      const payload = readTraceRecord(event);
      return (
        readNumber(payload.totalMs) ??
        readNumber(payload.elapsedMs) ??
        readNumber(payload.latencyMs)
      );
    })
    .filter((value): value is number => value !== undefined);
  if (explicit.length > 0) {
    return percentile(explicit, 95);
  }

  const turnStages = new Map<string, number[]>();
  for (const event of events) {
    if (event.type !== "turn_latency.stage" || !event.turnId) {
      continue;
    }
    const key = `${event.sessionId}:${event.turnId}`;
    turnStages.set(key, [...(turnStages.get(key) ?? []), event.at]);
  }

  const totals = [...turnStages.values()]
    .map((stages) =>
      stages.length < 2 ? undefined : Math.max(...stages) - Math.min(...stages),
    )
    .filter((value): value is number => value !== undefined);
  return percentile(totals, 95);
};

const summarizeRuntimeChannelTraceEvidence = (
  events: readonly StoredVoiceTraceEvent[],
): VoiceProofTrendRuntimeChannelSummary | undefined => {
  const runtimeEvents = events.filter(
    (event) =>
      event.type === "client.browser_media" ||
      event.type === "client.telephony_media" ||
      event.type === "client.barge_in",
  );
  if (runtimeEvents.length === 0) {
    return undefined;
  }

  const firstAudio = runtimeEvents
    .map((event) => readNumber(readTraceRecord(event).firstAudioLatencyMs))
    .filter((value): value is number => value !== undefined);
  const jitter = runtimeEvents
    .map((event) => readNumber(readTraceRecord(event).jitterMs))
    .filter((value): value is number => value !== undefined);
  const timestampDrift = runtimeEvents
    .map((event) => readNumber(readTraceRecord(event).timestampDriftMs))
    .filter((value): value is number => value !== undefined);
  const backpressure = runtimeEvents
    .map((event) => readNumber(readTraceRecord(event).backpressureEvents))
    .filter((value): value is number => value !== undefined);
  const interruptions = runtimeEvents
    .map((event) => {
      const payload = readTraceRecord(event);
      return (
        readNumber(payload.interruptionLatencyMs) ??
        readNumber(payload.interruptionMs) ??
        readNumber(payload.elapsedMs)
      );
    })
    .filter((value): value is number => value !== undefined);

  return {
    maxBackpressureEvents: maxNumber(backpressure),
    maxFirstAudioLatencyMs: maxNumber(firstAudio),
    maxInterruptionP95Ms: percentile(interruptions, 95),
    maxJitterMs: maxNumber(jitter),
    maxTimestampDriftMs: maxNumber(timestampDrift),
    samples: runtimeEvents.length,
    status: runtimeEvents.some((event) =>
      isFailingTraceStatus(readTraceStatus(readTraceRecord(event))),
    )
      ? "fail"
      : "pass",
  };
};

const readRealCallProfileTraceSurfaces = (
  events: readonly StoredVoiceTraceEvent[],
) => {
  const surfaces = new Set<string>();
  for (const event of events) {
    if (event.type === "client.browser_media") {
      surfaces.add("browser");
    }
    if (event.type === "client.telephony_media") {
      surfaces.add("phone");
      surfaces.add("telephony");
    }
    if (event.type === "client.live_latency") {
      surfaces.add("live");
    }
    if (event.type === "client.barge_in") {
      surfaces.add("barge-in");
    }
    if (event.type === "client.reconnect") {
      surfaces.add("reconnect");
    }
  }
  return [...surfaces].sort();
};

export const buildVoiceRealCallProfileEvidenceFromTraceEvents = (
  events: readonly StoredVoiceTraceEvent[],
  options: VoiceRealCallProfileTraceEvidenceOptions = {},
): VoiceProofTrendRealCallProfileEvidence[] => {
  const sessionFilter = new Set(options.sessionIds ?? []);
  const eventsBySession = new Map<string, StoredVoiceTraceEvent[]>();
  for (const event of events) {
    if (sessionFilter.size > 0 && !sessionFilter.has(event.sessionId)) {
      continue;
    }
    eventsBySession.set(event.sessionId, [
      ...(eventsBySession.get(event.sessionId) ?? []),
      event,
    ]);
  }

  return [...eventsBySession.entries()]
    .map(
      ([sessionId, sessionEvents]):
        | VoiceProofTrendRealCallProfileEvidence
        | undefined => {
        const profileId = readTraceProfileId(sessionEvents, options);
        if (!profileId) {
          return undefined;
        }
        const providers = summarizeProviderTraceEvidence(
          sessionEvents,
          options.maxProviderP95Ms,
        );
        const liveLatencies = sessionEvents
          .filter((event) => event.type === "client.live_latency")
          .map((event) => {
            const payload = readTraceRecord(event);
            return (
              readNumber(payload.latencyMs) ?? readNumber(payload.elapsedMs)
            );
          })
          .filter((value): value is number => value !== undefined);
        const turnP95Ms = summarizeTurnTraceP95(sessionEvents);
        const providerP95Ms = maxNumber(
          providers.map((provider) => provider.p95Ms),
        );
        const reconnect = summarizeReconnectTraceEvidence(sessionEvents);
        const runtimeChannel =
          summarizeRuntimeChannelTraceEvidence(sessionEvents);
        const surfaces = readRealCallProfileTraceSurfaces(sessionEvents);
        if (
          providers.length === 0 &&
          runtimeChannel === undefined &&
          liveLatencies.length === 0 &&
          surfaces.length === 0
        ) {
          return undefined;
        }

        return {
          generatedAt: new Date(
            Math.max(...sessionEvents.map((event) => event.at)),
          ).toISOString(),
          liveP95Ms: percentile(liveLatencies, 95),
          ok:
            providers.every((provider) => provider.status !== "fail") &&
            (runtimeChannel?.status ?? "pass") !== "fail",
          operationsRecordHref: `/voice-operations/${sessionId}`,
          profileDescription: options.profileDescriptions?.[profileId],
          profileId,
          profileLabel:
            options.profileLabels?.[profileId] ??
            (profileId === options.defaultProfileId
              ? options.defaultProfileLabel
              : undefined),
          providerP95Ms,
          providers,
          reconnect,
          runtimeChannel,
          sessionId,
          surfaces: surfaces.length > 0 ? surfaces : undefined,
          turnP95Ms,
        } satisfies VoiceProofTrendRealCallProfileEvidence;
      },
    )
    .filter(
      (evidence): evidence is VoiceProofTrendRealCallProfileEvidence =>
        evidence !== undefined,
    );
};

const normalizeReconnectReport = (
  report: VoiceReconnectProofReport | VoiceReconnectContractReport,
) => ("contract" in report ? report.contract : report);

export const buildVoiceRealCallProfileEvidenceFromReconnectProofReports = (
  input:
    | VoiceReconnectProofReport
    | VoiceReconnectContractReport
    | readonly (VoiceReconnectProofReport | VoiceReconnectContractReport)[],
  options: VoiceReconnectRealCallProfileEvidenceOptions = {},
): VoiceProofTrendRealCallProfileEvidence[] => {
  const reports = Array.isArray(input) ? input : [input];
  const profileId = options.profileId ?? "reconnect-resume";

  return reports.map((report, index) => {
    const contract = normalizeReconnectReport(report);
    const generatedAt =
      "generatedAt" in report
        ? report.generatedAt
        : new Date(contract.checkedAt).toISOString();
    const ok = "ok" in report ? report.ok : contract.pass;
    const operationsRecordHref =
      typeof options.operationsRecordHref === "function"
        ? options.operationsRecordHref(report, index)
        : options.operationsRecordHref;
    const sessionId =
      typeof options.sessionId === "function"
        ? options.sessionId(report, index)
        : (options.sessionId ??
          `reconnect-proof-${String(index + 1)}-${String(contract.checkedAt)}`);

    return {
      generatedAt,
      ok,
      operationsRecordHref,
      profileDescription: options.profileDescription,
      profileId,
      profileLabel: options.profileLabel,
      reconnect: {
        attempts: contract.summary.attempts,
        exhausted: contract.summary.exhausted,
        maxAttempts: contract.summary.maxAttempts,
        resumeLatencyP95Ms: contract.resumeLatencyP95Ms,
        reconnected: contract.summary.reconnected,
        resumed: contract.summary.resumed,
        samples: 1,
        snapshotCount: contract.snapshotCount,
        status: ok ? "pass" : "fail",
      },
      sessionId,
      surfaces: [...new Set(["reconnect", ...(options.surfaces ?? [])])].sort(),
    } satisfies VoiceProofTrendRealCallProfileEvidence;
  });
};

export const loadVoiceRealCallProfileEvidenceFromTraceStore = async (
  options: VoiceRealCallProfileTraceStoreEvidenceOptions,
) =>
  buildVoiceRealCallProfileEvidenceFromTraceEvents(
    await options.store.list({ limit: options.limit ?? 5000 }),
    options,
  );

export const loadVoiceRealCallProfileEvidenceFromStore = async (
  options: VoiceRealCallProfileEvidenceListOptions & {
    store: VoiceRealCallProfileEvidenceStore;
  },
): Promise<VoiceRealCallProfileEvidenceRecord[]> =>
  options.store.list(options);

const realCallProfileTraceSignalTypes = new Set([
  "client.barge_in",
  "client.browser_media",
  "client.live_latency",
  "client.reconnect",
  "client.telephony_media",
  "provider.decision",
  "session.error",
  "turn_latency.stage",
]);

const hasTraceProfileMetadata = (
  event: StoredVoiceTraceEvent,
  options: VoiceRealCallProfileTraceEvidenceOptions,
) => Boolean(readTraceProfileId([event], options));

const mergeRealCallProfileCollectorOptions = (
  base: VoiceRealCallProfileTraceCollectorEvidenceOptions,
  override: VoiceRealCallProfileTraceCollectorEvidenceOptions = {},
): VoiceRealCallProfileTraceCollectorEvidenceOptions => ({
  defaultProfileId: override.defaultProfileId ?? base.defaultProfileId,
  defaultProfileLabel: override.defaultProfileLabel ?? base.defaultProfileLabel,
  limit: override.limit ?? base.limit,
  maxProviderP95Ms: override.maxProviderP95Ms ?? base.maxProviderP95Ms,
  profileDescriptions: {
    ...(base.profileDescriptions ?? {}),
    ...(override.profileDescriptions ?? {}),
  },
  profileLabels: {
    ...(base.profileLabels ?? {}),
    ...(override.profileLabels ?? {}),
  },
  sessionIds: override.sessionIds ?? base.sessionIds,
});

export const createVoiceRealCallProfileTraceCollector = <
  TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
>(
  options: VoiceRealCallProfileTraceCollectorOptions<TEvent>,
): VoiceRealCallProfileTraceCollector<TEvent> => {
  const capturedSessionIds = new Set(options.sessionIds ?? []);
  const capture = (event: TEvent) => {
    if (
      realCallProfileTraceSignalTypes.has(event.type) &&
      hasTraceProfileMetadata(event, options)
    ) {
      capturedSessionIds.add(event.sessionId);
    }
  };

  return {
    append: async (event) => {
      const stored = await options.store.append(event);
      capture(stored);
      return stored;
    },
    buildHistoryReport: async (historyOptions = {}) => {
      const evidence = await buildRealCallProfileCollectorEvidence(
        options,
        capturedSessionIds,
        historyOptions.evidenceOptions,
      );
      return buildVoiceRealCallProfileHistoryReport({
        ...historyOptions,
        evidence,
      });
    },
    get: (id) => options.store.get(id),
    list: (filter) => options.store.list(filter),
    listCapturedSessionIds: () => [...capturedSessionIds],
    listEvidence: (evidenceOptions) =>
      buildRealCallProfileCollectorEvidence(
        options,
        capturedSessionIds,
        evidenceOptions,
      ),
    remove: async (id) => {
      await options.store.remove(id);
    },
  };
};

const buildRealCallProfileCollectorEvidence = async <
  TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
>(
  baseOptions: VoiceRealCallProfileTraceCollectorOptions<TEvent>,
  capturedSessionIds: ReadonlySet<string>,
  evidenceOptions?: VoiceRealCallProfileTraceCollectorEvidenceOptions,
) => {
  const merged = mergeRealCallProfileCollectorOptions(
    baseOptions,
    evidenceOptions,
  );
  const requestedSessionIds = merged.sessionIds ?? [...capturedSessionIds];
  return buildVoiceRealCallProfileEvidenceFromTraceEvents(
    await baseOptions.store.list({ limit: merged.limit ?? 5000 }),
    {
      ...merged,
      sessionIds: requestedSessionIds,
    },
  );
};

const readProofTrendProviders = (reports: readonly VoiceProofTrendReport[]) =>
  aggregateProofTrendProviders(
    reports.flatMap((report) =>
      report.summary.providers && report.summary.providers.length > 0
        ? report.summary.providers
        : report.cycles.flatMap((cycle) => cycle.providers ?? []),
    ),
  );

const exceedsProofTrendBudget = (value: number | undefined, budget: number) =>
  value !== undefined && (!Number.isFinite(value) || value > budget);

const readProofTrendProfileStatus = (
  profile: VoiceProofTrendProfileSummary,
  budgets: {
    maxLiveP95Ms: number;
    maxProviderP95Ms: number;
    maxReconnectP95Ms: number;
    maxRuntimeFirstAudioLatencyMs: number;
    maxRuntimeInterruptionP95Ms: number;
    maxRuntimeJitterMs: number;
    maxRuntimeTimestampDriftMs: number;
    maxTurnP95Ms: number;
  },
) => {
  const runtimeChannel = profile.runtimeChannel;
  const reconnect = profile.reconnect;
  const hasBudgetEvidence =
    profile.maxLiveP95Ms !== undefined ||
    profile.maxProviderP95Ms !== undefined ||
    profile.maxReconnectP95Ms !== undefined ||
    profile.maxTurnP95Ms !== undefined ||
    profile.providers?.some((provider) => provider.p95Ms !== undefined) ===
      true ||
    runtimeChannel?.maxFirstAudioLatencyMs !== undefined ||
    runtimeChannel?.maxInterruptionP95Ms !== undefined ||
    runtimeChannel?.maxJitterMs !== undefined ||
    runtimeChannel?.maxTimestampDriftMs !== undefined ||
    runtimeChannel?.maxBackpressureEvents !== undefined ||
    reconnect?.resumeLatencyP95Ms !== undefined ||
    reconnect?.samples !== undefined;
  const budgetFailed =
    exceedsProofTrendBudget(profile.maxLiveP95Ms, budgets.maxLiveP95Ms) ||
    exceedsProofTrendBudget(
      profile.maxProviderP95Ms,
      budgets.maxProviderP95Ms,
    ) ||
    exceedsProofTrendBudget(
      profile.maxReconnectP95Ms ?? reconnect?.resumeLatencyP95Ms,
      budgets.maxReconnectP95Ms,
    ) ||
    exceedsProofTrendBudget(profile.maxTurnP95Ms, budgets.maxTurnP95Ms) ||
    exceedsProofTrendBudget(
      runtimeChannel?.maxFirstAudioLatencyMs,
      budgets.maxRuntimeFirstAudioLatencyMs,
    ) ||
    exceedsProofTrendBudget(
      runtimeChannel?.maxInterruptionP95Ms,
      budgets.maxRuntimeInterruptionP95Ms,
    ) ||
    exceedsProofTrendBudget(
      runtimeChannel?.maxJitterMs,
      budgets.maxRuntimeJitterMs,
    ) ||
    exceedsProofTrendBudget(
      runtimeChannel?.maxTimestampDriftMs,
      budgets.maxRuntimeTimestampDriftMs,
    ) ||
    exceedsProofTrendBudget(runtimeChannel?.maxBackpressureEvents, 0) ||
    reconnect?.status === "fail";

  if (budgetFailed || (!hasBudgetEvidence && profile.status === "fail")) {
    return "fail";
  }

  if (
    profile.status === "warn" ||
    reconnect?.status === "warn" ||
    runtimeChannel?.status === "warn" ||
    profile.providers?.some((provider) => provider.status === "warn") === true
  ) {
    return "warn";
  }

  if (
    hasBudgetEvidence ||
    profile.status === "pass" ||
    reconnect?.status === "pass" ||
    runtimeChannel?.status === "pass" ||
    profile.providers?.some((provider) => provider.status === "pass") === true
  ) {
    return "pass";
  }

  return undefined;
};

export const buildVoiceProofTrendProfileSummaries = (
  input: VoiceProofTrendReport | readonly VoiceProofTrendReport[],
  options: VoiceProofTrendProfileSummaryOptions = {},
): VoiceProofTrendProfileSummary[] => {
  const reports = Array.isArray(input) ? input : [input];
  const definitions: readonly VoiceProofTrendProfileDefinition[] =
    options.profiles ?? DEFAULT_VOICE_PROOF_TREND_PROFILE_DEFINITIONS;
  const providerCap = options.maxProviderP95Ms ?? 1_000;
  const liveCap = options.maxLiveP95Ms ?? 800;
  const reconnectCap = options.maxReconnectP95Ms ?? 1_500;
  const turnCap = options.maxTurnP95Ms ?? 700;
  const runtimeFirstAudioCap = options.maxRuntimeFirstAudioLatencyMs ?? 600;
  const runtimeInterruptionCap = options.maxRuntimeInterruptionP95Ms ?? 300;
  const runtimeJitterCap = options.maxRuntimeJitterMs ?? 30;
  const runtimeTimestampDriftCap = options.maxRuntimeTimestampDriftMs ?? 800;
  const budgets = {
    maxLiveP95Ms: liveCap,
    maxProviderP95Ms: providerCap,
    maxReconnectP95Ms: reconnectCap,
    maxRuntimeFirstAudioLatencyMs: runtimeFirstAudioCap,
    maxRuntimeInterruptionP95Ms: runtimeInterruptionCap,
    maxRuntimeJitterMs: runtimeJitterCap,
    maxRuntimeTimestampDriftMs: runtimeTimestampDriftCap,
    maxTurnP95Ms: turnCap,
  };

  return definitions.map((definition) => {
    const historicalProfiles: VoiceProofTrendProfileSummary[] = reports.flatMap(
      (report) =>
        report.summary.profiles?.filter(
          (profile: VoiceProofTrendProfileSummary) =>
            profile.id === definition.id,
        ) ?? [],
    );

    if (historicalProfiles.length > 0) {
      const missingProfileReports = reports.filter(
        (report) =>
          !report.summary.profiles?.some(
            (profile: VoiceProofTrendProfileSummary) =>
              profile.id === definition.id,
          ),
      );
      const derivedProfiles =
        missingProfileReports.length > 0
          ? buildVoiceProofTrendProfileSummaries(missingProfileReports, {
              ...options,
              profiles: [definition],
            })
          : [];
      const profiles = [...historicalProfiles, ...derivedProfiles];
      const aggregatedProfile = {
        cycles: profiles.reduce(
          (total, profile) => total + (profile.cycles ?? 0),
          0,
        ),
        description:
          definition.description ?? profiles.find(Boolean)?.description,
        id: definition.id,
        label: definition.label ?? profiles.find(Boolean)?.label,
        maxLiveP95Ms: maxNumber(
          profiles.map((profile) => profile.maxLiveP95Ms),
        ),
        maxProviderP95Ms: maxNumber(
          profiles.map((profile) => profile.maxProviderP95Ms),
        ),
        maxReconnectP95Ms: maxNumber(
          profiles.map((profile) => profile.maxReconnectP95Ms),
        ),
        maxTurnP95Ms: maxNumber(
          profiles.map((profile) => profile.maxTurnP95Ms),
        ),
        providers: aggregateProofTrendProviders(
          profiles.flatMap((profile) => profile.providers ?? []),
        ),
        reconnect: aggregateProofTrendReconnect(
          profiles
            .map((profile) => profile.reconnect)
            .filter(
              (reconnect): reconnect is VoiceProofTrendReconnectSummary =>
                reconnect !== undefined,
            ),
        ),
        runtimeChannel: aggregateProofTrendRuntimeChannel(
          profiles
            .map((profile) => profile.runtimeChannel)
            .filter(
              (channel): channel is VoiceProofTrendRuntimeChannelSummary =>
                channel !== undefined,
            ),
        ),
        sessionCount: profiles.reduce(
          (total, profile) => total + (profile.sessionCount ?? 0),
          0,
        ),
        surfaces: [
          ...new Set(profiles.flatMap((profile) => profile.surfaces ?? [])),
        ].sort(),
      };

      return {
        ...aggregatedProfile,
        status: readProofTrendProfileStatus(aggregatedProfile, budgets),
      };
    }

    const runtimeChannel = aggregateProofTrendRuntimeChannel(
      reports
        .map((report) => readProofTrendRuntimeChannel(report))
        .filter((channel) =>
          Object.values(channel).some((value) => value !== undefined),
        ),
    );
    const derivedProfile = {
      description: definition.description,
      id: definition.id,
      label: definition.label,
      maxLiveP95Ms: addProofTrendProfileOffset(
        maxNumber(reports.map(readProofTrendMaxLiveP95)),
        definition.liveOffsetMs,
        definition.maxLiveP95Ms ?? liveCap,
      ),
      maxProviderP95Ms: addProofTrendProfileOffset(
        maxNumber(reports.map(readProofTrendMaxProviderP95)),
        definition.providerOffsetMs,
        definition.maxProviderP95Ms ?? providerCap,
      ),
      maxTurnP95Ms: addProofTrendProfileOffset(
        maxNumber(reports.map(readProofTrendMaxTurnP95)),
        definition.turnOffsetMs,
        definition.maxTurnP95Ms ?? turnCap,
      ),
      providers: readProofTrendProviders(reports),
      runtimeChannel:
        runtimeChannel === undefined
          ? undefined
          : {
              maxBackpressureEvents: runtimeChannel.maxBackpressureEvents,
              maxFirstAudioLatencyMs: addProofTrendProfileOffset(
                runtimeChannel.maxFirstAudioLatencyMs,
                definition.runtimeOffsetMs,
                definition.maxRuntimeFirstAudioLatencyMs ??
                  runtimeFirstAudioCap,
              ),
              maxInterruptionP95Ms: addProofTrendProfileOffset(
                runtimeChannel.maxInterruptionP95Ms,
                Math.ceil((definition.runtimeOffsetMs ?? 0) / 2),
                definition.maxRuntimeInterruptionP95Ms ??
                  runtimeInterruptionCap,
              ),
              maxJitterMs: addProofTrendProfileOffset(
                runtimeChannel.maxJitterMs,
                Math.ceil((definition.runtimeOffsetMs ?? 0) / 4),
                definition.maxRuntimeJitterMs ?? runtimeJitterCap,
              ),
              maxTimestampDriftMs: addProofTrendProfileOffset(
                runtimeChannel.maxTimestampDriftMs,
                definition.runtimeOffsetMs,
                definition.maxRuntimeTimestampDriftMs ??
                  runtimeTimestampDriftCap,
              ),
              samples: runtimeChannel.samples,
              status: runtimeChannel.status,
            },
    };

    return {
      ...derivedProfile,
      status: readProofTrendProfileStatus(derivedProfile, budgets),
    };
  });
};

export const buildVoiceProofTrendReportFromRealCallProfiles = (
  options: VoiceProofTrendRealCallProfileReportOptions,
): VoiceProofTrendReport => {
  const providerCap = options.maxProviderP95Ms ?? 1_000;
  const liveCap = options.maxLiveP95Ms ?? 800;
  const reconnectCap = options.maxReconnectP95Ms ?? 1_500;
  const turnCap = options.maxTurnP95Ms ?? 700;
  const runtimeFirstAudioCap = options.maxRuntimeFirstAudioLatencyMs ?? 600;
  const runtimeInterruptionCap = options.maxRuntimeInterruptionP95Ms ?? 300;
  const runtimeJitterCap = options.maxRuntimeJitterMs ?? 30;
  const runtimeTimestampDriftCap = options.maxRuntimeTimestampDriftMs ?? 800;
  const budgets = {
    maxLiveP95Ms: liveCap,
    maxProviderP95Ms: providerCap,
    maxReconnectP95Ms: reconnectCap,
    maxRuntimeFirstAudioLatencyMs: runtimeFirstAudioCap,
    maxRuntimeInterruptionP95Ms: runtimeInterruptionCap,
    maxRuntimeJitterMs: runtimeJitterCap,
    maxRuntimeTimestampDriftMs: runtimeTimestampDriftCap,
    maxTurnP95Ms: turnCap,
  };
  const definitionById = new Map(
    (options.profiles ?? DEFAULT_VOICE_PROOF_TREND_PROFILE_DEFINITIONS).map(
      (profile) => [profile.id, profile],
    ),
  );
  for (const evidence of options.evidence) {
    if (!definitionById.has(evidence.profileId)) {
      definitionById.set(evidence.profileId, {
        description: evidence.profileDescription,
        id: evidence.profileId,
        label: evidence.profileLabel,
      });
    }
  }
  const profiles: VoiceProofTrendProfileSummary[] = [];
  for (const definition of definitionById.values()) {
    const matchingEvidence = options.evidence.filter(
      (evidence) => evidence.profileId === definition.id,
    );
    if (matchingEvidence.length === 0) {
      continue;
    }

    const profile: VoiceProofTrendProfileSummary = {
      cycles: matchingEvidence.length,
      description:
        definition.description ??
        matchingEvidence.find((evidence) => evidence.profileDescription)
          ?.profileDescription,
      id: definition.id,
      label:
        definition.label ??
        matchingEvidence.find((evidence) => evidence.profileLabel)
          ?.profileLabel,
      maxLiveP95Ms: maxNumber(
        matchingEvidence.map((evidence) => evidence.liveP95Ms),
      ),
      maxProviderP95Ms: maxNumber(
        matchingEvidence.map((evidence) => evidence.providerP95Ms),
      ),
      maxReconnectP95Ms: maxNumber(
        matchingEvidence.map(
          (evidence) => evidence.reconnect?.resumeLatencyP95Ms,
        ),
      ),
      maxTurnP95Ms: maxNumber(
        matchingEvidence.map((evidence) => evidence.turnP95Ms),
      ),
      providers: aggregateProofTrendProviders(
        matchingEvidence.flatMap((evidence) => evidence.providers ?? []),
      ),
      reconnect: aggregateProofTrendReconnect(
        matchingEvidence
          .map((evidence) => evidence.reconnect)
          .filter(
            (reconnect): reconnect is VoiceProofTrendReconnectSummary =>
              reconnect !== undefined,
          ),
      ),
      runtimeChannel: aggregateProofTrendRuntimeChannel(
        matchingEvidence
          .map((evidence) => evidence.runtimeChannel)
          .filter(
            (channel): channel is VoiceProofTrendRuntimeChannelSummary =>
              channel !== undefined,
          ),
      ),
      sessionCount: new Set(
        matchingEvidence.map((evidence) => evidence.sessionId),
      ).size,
      surfaces: [
        ...new Set(
          matchingEvidence.flatMap((evidence) => evidence.surfaces ?? []),
        ),
      ].sort(),
    };
    profiles.push({
      ...profile,
      status: readProofTrendProfileStatus(profile, budgets),
    });
  }
  const cycles: VoiceProofTrendCycle[] = options.evidence.map(
    (evidence, index) => ({
      at: evidence.generatedAt,
      cycle: index + 1,
      liveLatency:
        evidence.liveP95Ms === undefined
          ? undefined
          : { p95Ms: evidence.liveP95Ms, samples: 1 },
      ok: evidence.ok !== false,
      providers: evidence.providers,
      runtimeChannel: evidence.runtimeChannel,
      reconnect: evidence.reconnect,
      turnLatency:
        evidence.turnP95Ms === undefined
          ? undefined
          : {
              p95Ms: evidence.turnP95Ms,
              samples: 1,
              status: evidence.turnP95Ms <= turnCap ? "pass" : "fail",
            },
    }),
  );
  const summary: VoiceProofTrendSummary = {
    cycles: options.evidence.length,
    maxLiveP95Ms: maxNumber(
      options.evidence.map((evidence) => evidence.liveP95Ms),
    ),
    maxProviderP95Ms: maxNumber(
      options.evidence.map((evidence) => evidence.providerP95Ms),
    ),
    maxReconnectP95Ms: maxNumber(
      options.evidence.map(
        (evidence) => evidence.reconnect?.resumeLatencyP95Ms,
      ),
    ),
    maxTurnP95Ms: maxNumber(
      options.evidence.map((evidence) => evidence.turnP95Ms),
    ),
    profiles,
    providers: aggregateProofTrendProviders(
      options.evidence.flatMap((evidence) => evidence.providers ?? []),
    ),
    reconnect: aggregateProofTrendReconnect(
      options.evidence
        .map((evidence) => evidence.reconnect)
        .filter(
          (reconnect): reconnect is VoiceProofTrendReconnectSummary =>
            reconnect !== undefined,
        ),
    ),
    runtimeChannel: aggregateProofTrendRuntimeChannel(
      options.evidence
        .map((evidence) => evidence.runtimeChannel)
        .filter(
          (channel): channel is VoiceProofTrendRuntimeChannelSummary =>
            channel !== undefined,
        ),
    ),
  };

  return buildVoiceProofTrendReport({
    baseUrl: options.baseUrl,
    cycles,
    generatedAt: options.generatedAt,
    maxAgeMs: options.maxAgeMs,
    now: options.now,
    ok:
      options.evidence.length > 0 &&
      options.evidence.every((evidence) => evidence.ok !== false) &&
      profiles.every((profile) => profile.status !== "fail"),
    outputDir: options.outputDir,
    runId: options.runId,
    source: options.source,
    summary,
  });
};

const flattenProofTrendCycles = (
  reports: readonly VoiceProofTrendReport[],
): VoiceProofTrendCycle[] => reports.flatMap((report) => report.cycles ?? []);

const withLatencyHeadroom = (
  value: number | undefined,
  options: VoiceRealCallProfileDefaultsOptions,
) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.ceil(
        value * (options.latencyBudgetHeadroomRatio ?? 1.2) +
          (options.latencyBudgetHeadroomMs ?? 50),
      )
    : undefined;

const buildProviderRouteDefaults = (
  providers: readonly VoiceProofTrendProviderRecommendation[],
) => {
  const routes: Record<string, string> = {};
  for (const provider of providers) {
    routes[provider.role ?? provider.id] = provider.id;
  }
  return routes;
};

export const buildVoiceRealCallProfileDefaults = (
  input: VoiceRealCallProfileHistoryReport | VoiceProofTrendReport,
  options: VoiceRealCallProfileDefaultsOptions = {},
): VoiceRealCallProfileDefaultsReport => {
  const trend = "trend" in input ? input.trend : input;
  const source = "source" in input ? input.source : trend.source;
  const recommendationReport =
    "recommendations" in input
      ? input.recommendations
      : buildVoiceProofTrendRecommendationReport(trend, options);
  const requiredProviderRoles = [
    ...(options.requiredProviderRoles ?? ["llm", "stt", "tts"]),
  ];
  const profileRecommendationsById = new Map(
    recommendationReport.profiles.map((profile) => [profile.id, profile]),
  );
  const profiles = (trend.summary.profiles ?? []).map((profile) => {
    const recommendation = profileRecommendationsById.get(profile.id);
    const providers = recommendation?.bestProviders ?? [];
    const providerRoutes = buildProviderRouteDefaults(providers);
    const missingRoles = requiredProviderRoles.filter(
      (role) => providerRoutes[role] === undefined,
    );
    const status: VoiceProofTrendRecommendationStatus =
      recommendation?.status === "fail"
        ? "fail"
        : missingRoles.length > 0
          ? "warn"
          : (recommendation?.status ?? "warn");
    return {
      evidence: {
        liveP95Ms: profile.maxLiveP95Ms,
        providerP95Ms: profile.maxProviderP95Ms,
        turnP95Ms: profile.maxTurnP95Ms,
      },
      label: profile.label,
      latencyBudgets: {
        maxLiveP95Ms: withLatencyHeadroom(profile.maxLiveP95Ms, options),
        maxProviderP95Ms: withLatencyHeadroom(
          profile.maxProviderP95Ms,
          options,
        ),
        maxTurnP95Ms: withLatencyHeadroom(profile.maxTurnP95Ms, options),
      },
      nextMove:
        missingRoles.length > 0
          ? `Collect passing provider evidence for ${missingRoles.join(", ")} before using this as a complete default profile.`
          : (recommendation?.nextMove ??
            `Use these measured defaults for ${profile.label ?? profile.id}.`),
      profileId: profile.id,
      providerRoutes,
      providers,
      runtimeChannel: profile.runtimeChannel
        ? {
            maxBackpressureEvents: profile.runtimeChannel.maxBackpressureEvents,
            maxFirstAudioLatencyMs: withLatencyHeadroom(
              profile.runtimeChannel.maxFirstAudioLatencyMs,
              options,
            ),
            maxInterruptionP95Ms: withLatencyHeadroom(
              profile.runtimeChannel.maxInterruptionP95Ms,
              options,
            ),
            maxJitterMs: withLatencyHeadroom(
              profile.runtimeChannel.maxJitterMs,
              options,
            ),
            maxTimestampDriftMs: withLatencyHeadroom(
              profile.runtimeChannel.maxTimestampDriftMs,
              options,
            ),
          }
        : undefined,
      status,
    };
  });
  const issues = [
    ...(profiles.length === 0
      ? ["No real-call profiles were available to derive defaults."]
      : []),
    ...profiles.flatMap((profile) => {
      const missingRoles = requiredProviderRoles.filter(
        (role) => profile.providerRoutes[role] === undefined,
      );
      return missingRoles.length > 0
        ? [
            `${profile.label ?? profile.profileId} is missing provider defaults for ${missingRoles.join(", ")}.`,
          ]
        : [];
    }),
  ];
  const status =
    issues.length > 0
      ? "warn"
      : worstRecommendationStatus(
          profiles.map((profile) => ({
            evidence: {},
            nextMove: profile.nextMove,
            recommendation: profile.label ?? profile.profileId,
            status: profile.status,
            surface: "provider-path",
          })),
        );

  return {
    generatedAt: new Date().toISOString(),
    issues,
    ok: status !== "fail",
    profiles,
    source,
    status,
    summary: {
      actionableProfiles: profiles.filter(
        (profile) =>
          requiredProviderRoles.every(
            (role) => profile.providerRoutes[role] !== undefined,
          ) && profile.status === "pass",
      ).length,
      profileCount: profiles.length,
      requiredProviderRoles,
    },
  };
};

const normalizeProviderRouteCandidate = (provider: string, role: string) => {
  const rolePrefix = `${role}:`;
  return provider.startsWith(rolePrefix)
    ? provider.slice(rolePrefix.length)
    : provider;
};

const expandProviderRouteCandidates = (
  provider: string | undefined,
  role: string,
  aliases: Partial<Record<string, string | readonly string[]>> = {},
) => {
  if (!provider) {
    return [];
  }
  const explicitAlias = aliases[provider];
  const normalized = normalizeProviderRouteCandidate(provider, role);
  const normalizedAlias = aliases[normalized];
  const aliasCandidates = [
    ...(Array.isArray(explicitAlias)
      ? explicitAlias
      : explicitAlias
        ? [explicitAlias]
        : []),
    ...(Array.isArray(normalizedAlias)
      ? normalizedAlias
      : normalizedAlias
        ? [normalizedAlias]
        : []),
  ];
  return [
    ...aliasCandidates,
    provider,
    normalized,
    ...normalized.split("+").filter(Boolean),
  ];
};

const readRealCallProfileDefaultsReport = (
  input: VoiceRealCallProfileDefaultsReport | VoiceRealCallProfileHistoryReport,
) => ("defaults" in input ? input.defaults : input);

const buildRealCallProfileReadinessIssues = (
  report: VoiceRealCallProfileHistoryReport,
  options: VoiceRealCallProfileReadinessCheckOptions,
) => {
  const minProfiles = options.minProfiles ?? 1;
  const minActionableProfiles = options.minActionableProfiles ?? 1;
  const minCycles = options.minCycles ?? 1;
  const requiredProviderRoles = options.requiredProviderRoles ?? [];
  const defaultsByProfile = new Map(
    report.defaults.profiles.map((profile) => [profile.profileId, profile]),
  );
  const summariesByProfile = new Map(
    (report.summary.profiles ?? []).map((profile) => [profile.id, profile]),
  );
  const issues: string[] = [];
  const warnings: string[] = [];

  if (report.status === "fail" || report.ok !== true) {
    issues.push(`Real-call profile history is ${report.status}.`);
  }
  if ((report.summary.profileCount ?? 0) < minProfiles) {
    issues.push(
      `Expected at least ${String(minProfiles)} real-call profile(s), found ${String(report.summary.profileCount ?? 0)}.`,
    );
  }
  if (report.defaults.summary.actionableProfiles < minActionableProfiles) {
    issues.push(
      `Expected at least ${String(minActionableProfiles)} actionable profile default(s), found ${String(report.defaults.summary.actionableProfiles)}.`,
    );
  }
  if ((report.summary.cycles ?? 0) < minCycles) {
    issues.push(
      `Expected at least ${String(minCycles)} real-call cycle(s), found ${String(report.summary.cycles ?? 0)}.`,
    );
  }
  const ageMs =
    report.trend.ageMs ??
    (report.generatedAt
      ? Date.now() - new Date(report.generatedAt).getTime()
      : undefined);
  if (
    options.maxAgeMs !== undefined &&
    (ageMs === undefined || ageMs > options.maxAgeMs)
  ) {
    issues.push(
      `Expected real-call profile history age <= ${String(options.maxAgeMs)}ms, found ${String(ageMs ?? "missing")}ms.`,
    );
  }
  for (const profileId of options.requiredProfileIds ?? []) {
    const profile = defaultsByProfile.get(profileId);
    const summaryProfile = summariesByProfile.get(profileId);
    if (!profile) {
      issues.push(`Missing required real-call profile: ${profileId}.`);
      continue;
    }
    if (profile.status === "fail") {
      issues.push(`Required real-call profile ${profileId} is failing.`);
    } else if (profile.status === "warn") {
      warnings.push(`Required real-call profile ${profileId} is warning.`);
    }
    for (const role of requiredProviderRoles) {
      if (!profile.providerRoutes[role]) {
        warnings.push(
          `Required real-call profile ${profileId} is missing ${role} provider default evidence.`,
        );
      }
    }
    if (
      options.minProfileCycles !== undefined &&
      (summaryProfile?.cycles ?? 0) < options.minProfileCycles
    ) {
      warnings.push(
        `Required real-call profile ${profileId} has ${String(summaryProfile?.cycles ?? 0)} cycle(s), expected at least ${String(options.minProfileCycles)}.`,
      );
    }
    if (
      options.minProfileSessions !== undefined &&
      (summaryProfile?.sessionCount ?? 0) < options.minProfileSessions
    ) {
      warnings.push(
        `Required real-call profile ${profileId} has ${String(summaryProfile?.sessionCount ?? 0)} session(s), expected at least ${String(options.minProfileSessions)}.`,
      );
    }
    const requiredProfileSurfaces = options.requiredProfileSurfaces;
    const requiredSurfaces = resolveRequiredRealCallProfileSurfaces(
      requiredProfileSurfaces,
      profileId,
    );
    const observedSurfaces = new Set(summaryProfile?.surfaces ?? []);
    for (const surface of requiredSurfaces) {
      if (!observedSurfaces.has(surface)) {
        warnings.push(
          `Required real-call profile ${profileId} is missing ${surface} surface evidence.`,
        );
      }
    }
  }
  const requiredProfileIds = new Set(options.requiredProfileIds ?? []);
  const recommendationProfiles =
    requiredProfileIds.size === 0
      ? report.recommendations.profiles
      : report.recommendations.profiles.filter((item) =>
          requiredProfileIds.has(item.id),
        );
  if (recommendationProfiles.some((item) => item.status === "fail")) {
    issues.push("At least one real-call profile recommendation is failing.");
  }
  if (recommendationProfiles.some((item) => item.status === "warn")) {
    warnings.push("At least one real-call profile recommendation is warning.");
  }

  return { issues, warnings };
};

const uniqueRealCallProfileActions = (
  actions: VoiceRealCallProfileRecoveryAction[],
) => {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.method ?? "GET"}:${action.href}:${action.label}:${action.profileId ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const appendRealCallRecoveryActionQuery = (
  href: string,
  query: Record<string, string | undefined>,
) => {
  const entries = Object.entries(query).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  if (entries.length === 0) {
    return href;
  }
  const [base = href, hash = ""] = href.split("#");
  const separator = base.includes("?") ? "&" : "?";
  const search = new URLSearchParams(entries).toString();
  return `${base}${separator}${search}${hash ? `#${hash}` : ""}`;
};

const resolveRequiredRealCallProfileSurfaces = (
  requiredProfileSurfaces:
    | readonly string[]
    | Record<string, readonly string[]>
    | undefined,
  profileId: string,
): readonly string[] => {
  if (requiredProfileSurfaces === undefined) {
    return [];
  }

  if (Array.isArray(requiredProfileSurfaces)) {
    return requiredProfileSurfaces;
  }

  const requiredSurfacesByProfile = requiredProfileSurfaces as Record<
    string,
    readonly string[]
  >;
  return requiredSurfacesByProfile[profileId] ?? [];
};

const sleepVoiceRealCallProfileRecoveryLoop = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const describeVoiceRealCallProfileRecoveryLoopAction = (
  action: VoiceRealCallProfileRecoveryLoopAction,
) =>
  [
    action.label ?? action.id ?? "recovery action",
    action.profileId ? `profile=${action.profileId}` : undefined,
    action.href,
  ]
    .filter(Boolean)
    .join(" ");

const defaultVoiceRealCallProfileRecoveryLoopActionFilter = (
  action: VoiceRealCallProfileRecoveryLoopAction,
  readinessCheckLabel: string,
) =>
  action.method?.toUpperCase() === "POST" &&
  action.sourceCheckLabel === readinessCheckLabel &&
  typeof action.href === "string" &&
  action.href.length > 0;

const uniqueVoiceRealCallProfileRecoveryLoopActions = (
  actions: VoiceRealCallProfileRecoveryLoopAction[],
) => {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.method?.toUpperCase() ?? "GET"} ${action.href ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const normalizeRealCallProfileRecoveryProvider = (
  role: VoiceRealCallProfileRecoveryEvidenceProviderRole,
  provider: VoiceRealCallProfileRecoveryEvidenceProvider | undefined,
) => {
  if (!provider) {
    return undefined;
  }
  if (typeof provider === "string") {
    return {
      provider,
      selectedProvider: provider,
      status: "selected" as const,
    };
  }
  return {
    ...provider,
    selectedProvider: provider.selectedProvider ?? provider.provider,
    status: provider.status ?? "selected",
  };
};

const profileRealCallRecoveryEvent = <TEvent extends VoiceTraceEvent>(
  event: TEvent,
  profileId: string,
  metadata: Record<string, unknown> = {},
): TEvent => ({
  ...event,
  metadata: {
    ...metadata,
    ...(event.metadata ?? {}),
    benchmarkProfileId: event.metadata?.benchmarkProfileId ?? profileId,
    profileId: event.metadata?.profileId ?? profileId,
  },
  payload: {
    ...(event.payload ?? {}),
    benchmarkProfileId:
      (event.payload as Record<string, unknown>).benchmarkProfileId ??
      profileId,
    profileId:
      (event.payload as Record<string, unknown>).profileId ?? profileId,
  },
});

export const appendVoiceRealCallProfileRecoveryEvidence = async <
  TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
>(
  options: VoiceRealCallProfileRecoveryEvidenceOptions<TEvent>,
): Promise<VoiceRealCallProfileRecoveryEvidenceResult<TEvent>> => {
  const at = options.at ?? Date.now();
  const scenarioId = options.scenarioId ?? "real-call-profile-recovery";
  const sessionId =
    options.sessionId ??
    `real-call-profile-recovery-${options.profileId}-${new Date(at).toISOString()}`;
  const browser = options.browser ?? {};
  const live = options.live ?? {};
  const providerEvents = (
    [
      ["llm", 320, "live-call"],
      ["stt", 82, "live-stt"],
      ["tts", 45, "live-tts"],
    ] as const
  ).flatMap(([role, defaultElapsedMs, defaultSurface], index) => {
    const provider = normalizeRealCallProfileRecoveryProvider(
      role,
      options.providers?.[role],
    );
    if (!provider) {
      return [];
    }
    return [
      profileRealCallRecoveryEvent(
        createVoiceProviderDecisionTraceEvent({
          at: at + index,
          elapsedMs: provider.elapsedMs ?? defaultElapsedMs,
          kind: role,
          provider: provider.provider,
          reason:
            provider.reason ??
            `Real-call profile recovery selected ${provider.provider} for ${role.toUpperCase()} evidence.`,
          scenarioId,
          selectedProvider: provider.selectedProvider,
          sessionId,
          status: provider.status,
          surface: provider.surface ?? defaultSurface,
        }),
        options.profileId,
        options.metadata,
      ),
    ];
  });
  const browserEvents =
    browser === false
      ? []
      : [
          profileRealCallRecoveryEvent(
            createVoiceTraceEvent({
              at: at + 3,
              payload: {
                firstAudioLatencyMs: browser.firstAudioLatencyMs ?? 420,
                messageCount: browser.messageCount,
                openSockets: browser.openSockets,
                receivedBytes: browser.receivedBytes,
                sentBytes: browser.sentBytes,
                status: browser.status ?? "pass",
              },
              scenarioId,
              sessionId,
              type: "client.browser_media",
            }),
            options.profileId,
            options.metadata,
          ),
        ];
  const liveEvents =
    live === false
      ? []
      : [
          profileRealCallRecoveryEvent(
            createVoiceTraceEvent({
              at: at + 4,
              payload: {
                latencyMs: live.latencyMs ?? 420,
                status: live.status ?? "pass",
              },
              scenarioId,
              sessionId,
              type: "client.live_latency",
            }),
            options.profileId,
            options.metadata,
          ),
        ];
  const events = await Promise.all(
    [...providerEvents, ...browserEvents, ...liveEvents].map((event) =>
      options.store.append(event),
    ),
  );

  return { events, sessionId };
};

export const runVoiceRealCallProfileRecoveryLoop = async (
  options: VoiceRealCallProfileRecoveryLoopOptions,
): Promise<VoiceRealCallProfileRecoveryLoopReport> => {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
  const jobPollMs = options.jobPollMs ?? 1_200;
  const jobTimeoutMs = options.jobTimeoutMs ?? 600_000;
  const interPassDelayMs =
    typeof options.interPassDelayMs === "number" &&
    Number.isFinite(options.interPassDelayMs) &&
    options.interPassDelayMs > 0
      ? options.interPassDelayMs
      : 5_000;
  const maxPasses =
    typeof options.maxPasses === "number" &&
    Number.isFinite(options.maxPasses) &&
    options.maxPasses > 0
      ? Math.floor(options.maxPasses)
      : 3;
  const readinessCheckLabel =
    options.readinessCheckLabel ?? "Real-call profile history";
  const fetchImpl = options.fetch ?? fetch;
  const recoveryActionsHref =
    options.recoveryActionsHref ?? "/api/production-readiness/recovery-actions";
  const readinessHref = options.readinessHref ?? "/api/production-readiness";
  const refreshHref =
    options.refreshHref === undefined
      ? "/api/voice/real-call-profile-history/refresh"
      : options.refreshHref;
  const jobHref =
    options.jobHref ?? "/api/voice/real-call-profile-history/actions";
  const toAbsoluteUrl = (href: string) => new URL(href, baseUrl).toString();
  const parseJson = async <Value>(response: Response): Promise<Value> => {
    const text = await response.text();
    try {
      return JSON.parse(text) as Value;
    } catch (error) {
      throw new Error(
        `Expected JSON from ${response.url}, got: ${text.slice(0, 300)}`,
        { cause: error },
      );
    }
  };
  const fetchJson = async <Value>(href: string, init?: RequestInit) => {
    const response = await fetchImpl(toAbsoluteUrl(href), {
      headers: { accept: "application/json", ...init?.headers },
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      throw new Error(`${href} returned HTTP ${String(response.status)}.`);
    }
    return parseJson<Value>(response);
  };
  const resolveJobHref = (jobId: string) =>
    typeof jobHref === "function"
      ? jobHref(jobId)
      : `${jobHref.replace(/\/$/, "")}/${jobId}`;
  const getGate = async (fresh = false) => {
    const href = fresh
      ? `${readinessHref}${readinessHref.includes("?") ? "&" : "?"}voiceRecoveryLoopFresh=${String(Date.now())}`
      : readinessHref;
    const readiness = await fetchJson<{
      checks?: VoiceProductionReadinessCheck[];
    }>(href);
    return (
      readiness.checks?.find((check) => check.label === readinessCheckLabel) ??
      null
    );
  };
  const actionsResponse = await fetchJson<{
    actions?: VoiceRealCallProfileRecoveryLoopAction[];
  }>(recoveryActionsHref);
  const actionFilter =
    options.actionFilter ??
    ((action: VoiceRealCallProfileRecoveryLoopAction) =>
      defaultVoiceRealCallProfileRecoveryLoopActionFilter(
        action,
        readinessCheckLabel,
      ));
  const actions = uniqueVoiceRealCallProfileRecoveryLoopActions(
    (actionsResponse.actions ?? []).filter(actionFilter),
  );

  if (actions.length === 0) {
    const realCallProfileGate = await getGate();
    return {
      actionCount: 0,
      actions,
      jobs: [],
      passes: 0,
      ok: realCallProfileGate?.status === "pass",
      realCallProfileGate,
      startFailures: [],
    };
  }

  const allJobs: VoiceRealCallProfileRecoveryLoopJobResult[] = [];
  const allStartFailures: VoiceRealCallProfileRecoveryLoopStartFailure[] = [];
  let realCallProfileGate: VoiceProductionReadinessCheck | null = null;
  let passes = 0;

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    passes = pass;
    options.logger?.log(
      `Running ${String(actions.length)} real-call profile recovery action(s) in parallel (pass ${String(pass)}/${String(maxPasses)}).`,
    );
    for (const action of actions) {
      options.logger?.log(
        `- ${describeVoiceRealCallProfileRecoveryLoopAction(action)}`,
      );
    }

    const starts = await Promise.allSettled(
      actions.map(async (action) => {
        if (!action.href) {
          throw new Error("Recovery action is missing href.");
        }
        const body = await fetchJson<{
          jobId?: string;
          jobStatus?: string;
          message?: string;
        }>(action.href, { method: "POST" });
        return { action, ...body };
      }),
    );
    const startedJobs = starts.flatMap((result) => {
      if (result.status === "rejected") {
        return [];
      }
      return result.value.jobId ? [result.value] : [];
    });
    const startFailures = starts.flatMap((result, index) =>
      result.status === "rejected"
        ? [
            {
              action: describeVoiceRealCallProfileRecoveryLoopAction(
                actions[index] ?? {},
              ),
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            },
          ]
        : [],
    );
    allStartFailures.push(...startFailures);

    const pollJob = async (jobId: string) => {
      const deadline = Date.now() + jobTimeoutMs;
      while (Date.now() < deadline) {
        const body = await fetchJson<{
          job?: VoiceRealCallProfileRecoveryLoopJob;
          ok?: boolean;
        }>(resolveJobHref(jobId));
        const job = body.job;
        if (!job) {
          throw new Error(`Recovery job ${jobId} was not found.`);
        }
        if (job.status === "pass" || job.status === "fail") {
          return job;
        }
        await sleepVoiceRealCallProfileRecoveryLoop(jobPollMs);
      }
      throw new Error(
        `Timed out waiting ${String(jobTimeoutMs)}ms for recovery job ${jobId}.`,
      );
    };

    options.logger?.log(
      `Polling ${String(startedJobs.length)} recovery job(s) in parallel.`,
    );
    const jobResults = await Promise.allSettled(
      startedJobs.map((start) => pollJob(start.jobId as string)),
    );
    const jobs = jobResults.map((result, index) => ({
      action: describeVoiceRealCallProfileRecoveryLoopAction(
        startedJobs[index]?.action ?? {},
      ),
      jobId: startedJobs[index]?.jobId,
      result:
        result.status === "fulfilled"
          ? result.value
          : {
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
              status: "fail" as const,
            },
    }));
    allJobs.push(...jobs);

    if (refreshHref !== false) {
      await fetchJson<unknown>(refreshHref, { method: "POST" });
    }
    realCallProfileGate = await getGate(true);
    if (realCallProfileGate?.status === "pass") {
      break;
    }
    if (pass < maxPasses) {
      options.logger?.log(
        `Waiting ${String(interPassDelayMs)}ms before the next real-call profile recovery pass.`,
      );
      await sleepVoiceRealCallProfileRecoveryLoop(interPassDelayMs);
    }
  }

  return {
    actionCount: actions.length * passes,
    actions,
    jobs: allJobs,
    passes,
    ok:
      allStartFailures.length === 0 &&
      allJobs.every((job) => job.result.status === "pass") &&
      realCallProfileGate?.status === "pass",
    realCallProfileGate,
    startFailures: allStartFailures,
  };
};

export const buildVoiceRealCallProfileRecoveryActions = (
  report: VoiceRealCallProfileHistoryReport,
  options: VoiceRealCallProfileRecoveryActionOptions = {},
): VoiceRealCallProfileRecoveryAction[] => {
  const actions: VoiceRealCallProfileRecoveryAction[] = [
    {
      description:
        "Open the current real-call profile history report and profile defaults.",
      href: options.href ?? "/voice/real-call-profile-history",
      id: "refresh",
      label: "Open real-call profile history",
    },
    {
      description:
        "Refresh production readiness after collecting or replaying profile evidence.",
      href: options.productionReadinessHref ?? "/production-readiness",
      id: "refresh",
      label: "Refresh production readiness",
    },
  ];
  const requiredProfiles = new Set(options.requiredProfileIds ?? []);
  const profilesById = new Map(
    report.defaults.profiles.map((profile) => [profile.profileId, profile]),
  );
  const missingProfiles = [...requiredProfiles].filter(
    (profileId) => !profilesById.has(profileId),
  );
  const warningProfiles = report.defaults.profiles.filter(
    (profile) =>
      (requiredProfiles.size === 0 ||
        requiredProfiles.has(profile.profileId)) &&
      profile.status !== "pass",
  );
  const missingRoleProfiles = report.defaults.profiles.filter((profile) =>
    (options.requiredProviderRoles ?? []).some(
      (role) => !profile.providerRoutes[role],
    ),
  );
  const summariesByProfile = new Map(
    (report.summary.profiles ?? []).map((profile) => [profile.id, profile]),
  );
  const missingDepthProfiles = [...requiredProfiles].filter((profileId) => {
    const summaryProfile = summariesByProfile.get(profileId);
    if (
      options.minProfileCycles !== undefined &&
      (summaryProfile?.cycles ?? 0) < options.minProfileCycles
    ) {
      return true;
    }
    if (
      options.minProfileSessions !== undefined &&
      (summaryProfile?.sessionCount ?? 0) < options.minProfileSessions
    ) {
      return true;
    }
    const requiredProfileSurfaces = options.requiredProfileSurfaces;
    const requiredSurfaces = resolveRequiredRealCallProfileSurfaces(
      requiredProfileSurfaces,
      profileId,
    );
    const observedSurfaces = new Set(summaryProfile?.surfaces ?? []);
    return requiredSurfaces.some((surface) => !observedSurfaces.has(surface));
  });
  const resolveRequiredProfileSurfaces = (profileId?: string) => {
    if (typeof profileId !== "string") {
      return [];
    }

    return resolveRequiredRealCallProfileSurfaces(
      options.requiredProfileSurfaces,
      profileId,
    );
  };
  const ageMs =
    report.trend.ageMs ??
    (report.generatedAt
      ? Date.now() - new Date(report.generatedAt).getTime()
      : undefined);

  const needsProfileProof =
    missingProfiles.length > 0 ||
    warningProfiles.length > 0 ||
    missingRoleProfiles.length > 0 ||
    missingDepthProfiles.length > 0 ||
    (options.minCycles !== undefined &&
      (report.summary.cycles ?? 0) < options.minCycles) ||
    (options.minActionableProfiles !== undefined &&
      report.defaults.summary.actionableProfiles <
        options.minActionableProfiles);
  if (needsProfileProof) {
    const targetProfileIds =
      missingProfiles.length > 0 || missingDepthProfiles.length > 0
        ? [...new Set([...missingProfiles, ...missingDepthProfiles])]
        : [...requiredProfiles];
    const targets =
      targetProfileIds.length > 0 ? targetProfileIds : [undefined];
    for (const profileId of targets) {
      actions.push({
        description: profileId
          ? `Run browser profile proof for ${profileId} to collect microphone, WebSocket, live-latency, and provider traces.`
          : "Run browser profile proof to collect microphone, WebSocket, live-latency, and provider traces for missing profiles.",
        href: appendRealCallRecoveryActionQuery(
          options.browserProofHref ?? "/voice/browser-call-profiles",
          { profileId },
        ),
        id: "collect-browser-proof",
        label: profileId
          ? `Run browser profile proof for ${profileId}`
          : "Run browser profile proof",
        method: "POST",
        profileId,
      });
      actions.push({
        description: profileId
          ? `Run phone profile proof for ${profileId} when the profile depends on carrier, telephony media, or noisy-call evidence.`
          : "Run phone profile proof when required profiles depend on carrier, telephony media, or noisy-call evidence.",
        href: appendRealCallRecoveryActionQuery(
          options.phoneProofHref ?? "/api/voice/phone/smoke",
          { profileId },
        ),
        id: "collect-phone-proof",
        label: profileId
          ? `Run phone profile proof for ${profileId}`
          : "Run phone profile proof",
        method: "POST",
        profileId,
      });
      const requiredSurfaces = resolveRequiredProfileSurfaces(profileId);
      const summaryProfile =
        typeof profileId === "string"
          ? summariesByProfile.get(profileId)
          : undefined;
      const observedSurfaces = new Set<string>(
        (summaryProfile?.surfaces ?? []).filter(
          (value): value is string => typeof value === "string",
        ),
      );
      if (
        requiredSurfaces.includes("reconnect") &&
        !observedSurfaces.has("reconnect")
      ) {
        actions.push({
          description: profileId
            ? `Run reconnect profile proof for ${profileId} when reconnect stability is required for this profile.`
            : "Run reconnect profile proof when required profiles depend on reconnect stability evidence.",
          href: appendRealCallRecoveryActionQuery(
            options.reconnectProofHref ?? "/api/voice/reconnect-proof",
            { profileId },
          ),
          id: "collect-reconnect-proof",
          label: profileId
            ? `Run reconnect profile proof for ${profileId}`
            : "Run reconnect profile proof",
          method: "POST",
          profileId,
        });
      }
    }
  }

  if (
    options.maxAgeMs !== undefined &&
    (ageMs === undefined || ageMs > options.maxAgeMs)
  ) {
    actions.push({
      description:
        "Collect fresh real-call profile traces because the current history artifact is stale.",
      href: options.browserProofHref ?? "/voice/browser-call-profiles",
      id: "collect-browser-proof",
      label: "Collect fresh profile evidence",
      method: "POST",
    });
  }

  if (
    missingRoleProfiles.length > 0 ||
    report.defaults.summary.actionableProfiles <
      (options.minActionableProfiles ?? 1)
  ) {
    actions.push({
      description:
        "Collect missing LLM/STT/TTS provider-role evidence so profile defaults can become actionable.",
      href: options.sourceHref ?? "/api/voice/real-call-profile-history",
      id: "collect-provider-role-evidence",
      label: "Collect missing provider-role evidence",
    });
  }

  if (
    report.recommendations.profiles.some(
      (profile) => profile.status !== "pass",
    ) ||
    report.defaults.profiles.some((profile) => profile.status !== "pass")
  ) {
    actions.push({
      description:
        "Open operations records to inspect the sessions behind failing or warning profile evidence.",
      href: options.operationsRecordsHref ?? "/voice-operations",
      id: "refresh",
      label: "Open operations records",
    });
  }

  return uniqueRealCallProfileActions(actions);
};

export const createVoiceInMemoryRealCallProfileRecoveryJobStore = (
  options: { idPrefix?: string; now?: () => Date } = {},
): VoiceRealCallProfileRecoveryJobStore => {
  const jobs = new Map<string, VoiceRealCallProfileRecoveryJob>();
  const now = () => (options.now ?? (() => new Date()))().toISOString();
  const createId = () =>
    `${options.idPrefix ?? "voice-recovery-job"}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  return {
    create(input) {
      const createdAt = input.createdAt ?? now();
      const job: VoiceRealCallProfileRecoveryJob = {
        actionId: input.actionId,
        createdAt,
        id: input.id ?? createId(),
        message: input.message,
        status: input.status ?? "queued",
        updatedAt: createdAt,
      };
      jobs.set(job.id, job);
      return job;
    },
    get(id) {
      return jobs.get(id);
    },
    list(input = {}) {
      const limit =
        Number.isFinite(input.limit) &&
        input.limit !== undefined &&
        input.limit > 0
          ? Math.floor(input.limit)
          : 50;
      return [...jobs.values()]
        .filter((job) => !input.actionId || job.actionId === input.actionId)
        .filter((job) => !input.status || job.status === input.status)
        .sort((first, second) => {
          const updatedDelta =
            Date.parse(second.updatedAt) - Date.parse(first.updatedAt);
          return updatedDelta === 0
            ? second.id.localeCompare(first.id)
            : updatedDelta;
        })
        .slice(0, limit);
    },
    update(id, update) {
      const existing = jobs.get(id);
      if (!existing) {
        return undefined;
      }
      const next = {
        ...existing,
        ...update,
        updatedAt: update.updatedAt ?? now(),
      };
      jobs.set(id, next);
      return next;
    },
  };
};

const normalizeRealCallProfileEvidenceTableName = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "voice_real_call_profile_evidence";

const parseRealCallProfileEvidenceBoundary = (
  value: Date | number | string | undefined,
) =>
  value === undefined
    ? undefined
    : value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);

const readRealCallProfileEvidenceSortTime = (
  evidence: VoiceProofTrendRealCallProfileEvidence,
  fallback: string,
) => Date.parse(evidence.generatedAt ?? fallback) || Date.parse(fallback);

export const createVoiceSQLiteRealCallProfileEvidenceStore = (
  options: VoiceSQLiteRealCallProfileEvidenceStoreOptions = {},
): VoiceRealCallProfileEvidenceStore => {
  const { Database: SQLiteDatabase } =
    require("bun:sqlite") as typeof import("bun:sqlite");
  const database =
    options.database ??
    new SQLiteDatabase(options.path ?? ":memory:", {
      create: true,
    });
  const tableName = normalizeRealCallProfileEvidenceTableName(
    options.tableName ?? "voice_real_call_profile_evidence",
  );
  const now = () => (options.now ?? (() => new Date()))().toISOString();
  const createId = () =>
    `${options.idPrefix ?? "voice-profile-evidence"}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA synchronous = NORMAL;");
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec(
    `CREATE TABLE IF NOT EXISTS "${tableName}" (
			id TEXT PRIMARY KEY,
			sort_at INTEGER NOT NULL,
			profile_id TEXT NOT NULL,
			session_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			payload TEXT NOT NULL
		)`,
  );

  const selectStatement = database.query(
    `SELECT payload FROM "${tableName}" WHERE id = ?1 LIMIT 1`,
  );
  const listStatement = database.query(
    `SELECT payload FROM "${tableName}" ORDER BY sort_at DESC, id DESC`,
  );
  const upsertStatement = database.query(
    `INSERT INTO "${tableName}" (id, sort_at, profile_id, session_id, created_at, payload)
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
		 ON CONFLICT(id) DO UPDATE SET
			sort_at = excluded.sort_at,
			profile_id = excluded.profile_id,
			session_id = excluded.session_id,
			created_at = excluded.created_at,
			payload = excluded.payload`,
  );
  const deleteStatement = database.query(
    `DELETE FROM "${tableName}" WHERE id = ?1`,
  );

  const writeEvidence = (record: VoiceRealCallProfileEvidenceRecord) => {
    upsertStatement.run(
      record.id,
      readRealCallProfileEvidenceSortTime(record, record.createdAt),
      record.profileId,
      record.sessionId,
      record.createdAt,
      JSON.stringify(record),
    );
    return record;
  };
  const readEvidence = (id: string) => {
    const row = selectStatement.get(id) as { payload: string } | null;
    return row
      ? (JSON.parse(row.payload) as VoiceRealCallProfileEvidenceRecord)
      : undefined;
  };
  const matchesListOptions = (
    record: VoiceRealCallProfileEvidenceRecord,
    input: VoiceRealCallProfileEvidenceListOptions,
  ) => {
    const evidenceTime = readRealCallProfileEvidenceSortTime(
      record,
      record.createdAt,
    );
    const since = parseRealCallProfileEvidenceBoundary(input.since);
    const until = parseRealCallProfileEvidenceBoundary(input.until);
    return (
      (!input.profileId || record.profileId === input.profileId) &&
      (!input.sessionId || record.sessionId === input.sessionId) &&
      (since === undefined || Number.isNaN(since) || evidenceTime >= since) &&
      (until === undefined || Number.isNaN(until) || evidenceTime <= until)
    );
  };

  return {
    append(input) {
      const createdAt = input.createdAt ?? now();
      return writeEvidence({
        ...input,
        createdAt,
        id: input.id ?? createId(),
      });
    },
    get(id) {
      return readEvidence(id);
    },
    list(input = {}) {
      const limit =
        Number.isFinite(input.limit) &&
        input.limit !== undefined &&
        input.limit > 0
          ? Math.floor(input.limit)
          : 500;
      return listStatement
        .all()
        .map(
          (row) =>
            JSON.parse(
              (row as { payload: string }).payload,
            ) as VoiceRealCallProfileEvidenceRecord,
        )
        .filter((record) => matchesListOptions(record, input))
        .slice(0, limit);
    },
    remove(id) {
      deleteStatement.run(id);
    },
  };
};

const normalizeRealCallRecoveryJobTableName = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "voice_real_call_profile_recovery_jobs";

export const createVoiceSQLiteRealCallProfileRecoveryJobStore = (
  options: VoiceSQLiteRealCallProfileRecoveryJobStoreOptions = {},
): VoiceRealCallProfileRecoveryJobStore => {
  const { Database: SQLiteDatabase } =
    require("bun:sqlite") as typeof import("bun:sqlite");
  const database =
    options.database ??
    new SQLiteDatabase(options.path ?? ":memory:", {
      create: true,
    });
  const tableName = normalizeRealCallRecoveryJobTableName(
    options.tableName ?? "voice_real_call_profile_recovery_jobs",
  );
  const now = () => (options.now ?? (() => new Date()))().toISOString();
  const createId = () =>
    `${options.idPrefix ?? "voice-recovery-job"}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA synchronous = NORMAL;");
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec(
    `CREATE TABLE IF NOT EXISTS "${tableName}" (
			id TEXT PRIMARY KEY,
			sort_at INTEGER NOT NULL,
			payload TEXT NOT NULL
		)`,
  );

  const selectStatement = database.query(
    `SELECT payload FROM "${tableName}" WHERE id = ?1 LIMIT 1`,
  );
  const listStatement = database.query(
    `SELECT payload FROM "${tableName}" ORDER BY sort_at DESC, id DESC`,
  );
  const upsertStatement = database.query(
    `INSERT INTO "${tableName}" (id, sort_at, payload)
		 VALUES (?1, ?2, ?3)
		 ON CONFLICT(id) DO UPDATE SET sort_at = excluded.sort_at, payload = excluded.payload`,
  );

  const writeJob = (job: VoiceRealCallProfileRecoveryJob) => {
    upsertStatement.run(
      job.id,
      Date.parse(job.updatedAt) || Date.now(),
      JSON.stringify(job),
    );
    return job;
  };
  const readJob = (id: string) => {
    const row = selectStatement.get(id) as { payload: string } | null;
    return row
      ? (JSON.parse(row.payload) as VoiceRealCallProfileRecoveryJob)
      : undefined;
  };

  return {
    create(input) {
      const createdAt = input.createdAt ?? now();
      return writeJob({
        actionId: input.actionId,
        createdAt,
        id: input.id ?? createId(),
        message: input.message,
        status: input.status ?? "queued",
        updatedAt: createdAt,
      });
    },
    get(id) {
      return readJob(id);
    },
    list(input = {}) {
      const limit =
        Number.isFinite(input.limit) &&
        input.limit !== undefined &&
        input.limit > 0
          ? Math.floor(input.limit)
          : 50;
      return listStatement
        .all()
        .map(
          (row) =>
            JSON.parse(
              (row as { payload: string }).payload,
            ) as VoiceRealCallProfileRecoveryJob,
        )
        .filter((job) => !input.actionId || job.actionId === input.actionId)
        .filter((job) => !input.status || job.status === input.status)
        .slice(0, limit);
    },
    update(id, update) {
      const existing = readJob(id);
      if (!existing) {
        return undefined;
      }
      return writeJob({
        ...existing,
        ...update,
        updatedAt: update.updatedAt ?? now(),
      });
    },
  };
};

export const buildVoiceRealCallProfileReadinessCheck = (
  report: VoiceRealCallProfileHistoryReport,
  options: VoiceRealCallProfileReadinessCheckOptions = {},
): VoiceProductionReadinessCheck => {
  const { issues, warnings } = buildRealCallProfileReadinessIssues(
    report,
    options,
  );
  const status =
    issues.length > 0
      ? "fail"
      : warnings.length > 0 && options.failOnWarnings === true
        ? "fail"
        : warnings.length > 0
          ? "warn"
          : "pass";
  const detail =
    status === "pass"
      ? `${String(report.summary.profileCount)} profile(s), ${String(report.summary.cycles ?? 0)} cycle(s), ${String(report.defaults.summary.actionableProfiles)} actionable default(s).`
      : [...issues, ...warnings].join(" ");

  return {
    actions: buildVoiceRealCallProfileRecoveryActions(report, options),
    detail,
    gateExplanation: {
      evidenceHref: options.href ?? "/api/voice/real-call-profile-history",
      observed: report.defaults.summary.actionableProfiles,
      remediation:
        "Run fresh browser or phone calls for required profiles so provider/runtime recommendations have measured profile evidence.",
      sourceHref: options.sourceHref ?? "/voice/real-call-profile-history",
      threshold: options.minActionableProfiles ?? 1,
      thresholdLabel: "Minimum actionable real-call profiles",
      unit: "count",
    },
    href: options.href ?? "/voice/real-call-profile-history",
    label: options.label ?? "Real-call profile history",
    proofSource: {
      href: options.sourceHref ?? "/api/voice/real-call-profile-history",
      source: report.source,
      sourceLabel: "Real-call profile history",
    },
    status,
    value: `${String(report.defaults.summary.actionableProfiles)}/${String(report.summary.profileCount)} actionable`,
  };
};

export const buildVoiceRealCallProfileRecoveryJobHistoryCheck = async (
  store: Pick<VoiceRealCallProfileRecoveryJobStore, "list"> | undefined,
  options: VoiceRealCallProfileRecoveryJobHistoryCheckOptions = {},
): Promise<VoiceProductionReadinessCheck> => {
  const href = options.href ?? "/voice/real-call-profile-recovery";
  const sourceHref =
    options.sourceHref ?? "/api/voice/real-call-profile-history/actions/jobs";
  const minCompletedJobs = options.minCompletedJobs ?? 1;
  const label = options.label ?? "Real-call recovery job history";
  if (!store?.list) {
    return {
      actions: [
        {
          description:
            "Configure a recovery job store with list support so operators can inspect proof repair history.",
          href,
          label: "Configure recovery job history",
        },
      ],
      detail:
        "No real-call profile recovery job store with list support is configured.",
      gateExplanation: {
        evidenceHref: sourceHref,
        observed: "missing",
        remediation:
          "Use the bundled memory or SQLite recovery job store, or implement list() on the custom store.",
        sourceHref,
        threshold: "list support",
        thresholdLabel: "Inspectable recovery jobs",
        unit: "status",
      },
      href,
      label,
      status: "fail",
      value: "missing",
    };
  }

  const jobs = await store.list({ limit: 50 });
  const now = Date.now();
  const recentJobs =
    options.maxAgeMs === undefined
      ? jobs
      : jobs.filter(
          (job) => now - Date.parse(job.updatedAt) <= options.maxAgeMs!,
        );
  const completedJobs = recentJobs.filter(
    (job) => job.status === "pass" || job.status === "fail",
  );
  const failedJobs = recentJobs.filter((job) => job.status === "fail");
  const runningJobs = recentJobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  );
  const issues: string[] = [];
  const warnings: string[] = [];

  if (completedJobs.length < minCompletedJobs) {
    issues.push(
      `Expected at least ${String(minCompletedJobs)} completed recovery job(s), found ${String(completedJobs.length)}.`,
    );
  }
  if (!options.allowFailedJobs && failedJobs.length > 0) {
    issues.push(`${String(failedJobs.length)} recent recovery job(s) failed.`);
  }
  if (runningJobs.length > 0) {
    const message = `${String(runningJobs.length)} recovery job(s) are still queued or running.`;
    if (options.failOnRunningJobs) {
      issues.push(message);
    } else {
      warnings.push(message);
    }
  }

  const status =
    issues.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass";
  const detail =
    status === "pass"
      ? `${String(completedJobs.length)} completed recovery job(s), ${String(failedJobs.length)} failed, ${String(runningJobs.length)} running.`
      : [...issues, ...warnings].join(" ");

  return {
    actions: [
      {
        description:
          "Open the recovery job UI and run or inspect proof repair jobs.",
        href,
        label: "Open recovery job history",
      },
      {
        description: "Open the recovery job history API.",
        href: sourceHref,
        label: "Open recovery jobs API",
      },
    ],
    detail,
    gateExplanation: {
      evidenceHref: sourceHref,
      observed: completedJobs.length,
      remediation:
        "Run a browser or phone recovery proof job and ensure recent recovery jobs complete without failure.",
      sourceHref,
      threshold: minCompletedJobs,
      thresholdLabel: "Minimum completed recovery jobs",
      unit: "count",
    },
    href,
    label,
    proofSource: {
      href: sourceHref,
      source: "recovery-job-store",
      sourceLabel: "Real-call recovery jobs",
    },
    status,
    value: `${String(completedJobs.length)} completed / ${String(failedJobs.length)} failed / ${String(runningJobs.length)} running`,
  };
};

export const resolveVoiceRealCallProfileProviderRoute = <
  TProvider extends string = string,
>(
  options: VoiceRealCallProfileProviderRouteOptions<TProvider>,
): TProvider | undefined => {
  const defaults = readRealCallProfileDefaultsReport(options.defaults);
  const profile =
    defaults.profiles.find((item) => item.profileId === options.profileId) ??
    defaults.profiles.find((item) => item.status === "pass") ??
    defaults.profiles[0];
  const provider = profile?.providerRoutes[options.role];
  const available = new Set(options.availableProviders ?? []);
  const candidates = expandProviderRouteCandidates(
    provider,
    options.role,
    options.providerAliases,
  );

  for (const candidate of candidates) {
    if (
      (options.availableProviders === undefined ||
        available.has(candidate as TProvider)) &&
      candidate
    ) {
      return candidate as TProvider;
    }
  }

  return options.fallbackProvider;
};

export const buildVoiceRealCallProfileHistoryReport = (
  options: VoiceRealCallProfileHistoryOptions = {},
): VoiceRealCallProfileHistoryReport => {
  const generatedAt =
    options.generatedAt ??
    (options.now instanceof Date
      ? options.now.toISOString()
      : typeof options.now === "number"
        ? new Date(options.now).toISOString()
        : typeof options.now === "string"
          ? new Date(options.now).toISOString()
          : new Date().toISOString());
  const evidenceReport =
    options.evidence && options.evidence.length > 0
      ? buildVoiceProofTrendReportFromRealCallProfiles({
          ...options,
          evidence: options.evidence,
          generatedAt,
          source: `${options.source ?? "real-call-profile-history"}#evidence`,
        })
      : undefined;
  const history = [
    ...(options.reports ?? []).map((report) =>
      normalizeVoiceProofTrendReport(report, {
        maxAgeMs: options.maxAgeMs,
        now: options.now,
      }),
    ),
    ...(evidenceReport ? [evidenceReport] : []),
  ];
  const passingHistory = history.filter((report) => report.ok === true);
  const recommendationHistory =
    passingHistory.length > 0 ? passingHistory : history;
  const profileHistory = history.length > 0 ? history : recommendationHistory;
  const profiles = buildVoiceProofTrendProfileSummaries(
    profileHistory,
    options,
  );
  const summary: VoiceProofTrendSummary & {
    failedReports: number;
    profileCount: number;
  } = {
    cycles: profileHistory.reduce(
      (total, report) =>
        total + (report.summary.cycles ?? report.cycles.length),
      0,
    ),
    failedReports: history.filter((report) => report.ok !== true).length,
    maxLiveP95Ms: maxNumber(profileHistory.map(readProofTrendMaxLiveP95)),
    maxProviderP95Ms: maxNumber(
      profileHistory.map(readProofTrendMaxProviderP95),
    ),
    maxReconnectP95Ms: maxNumber(
      profileHistory.map(readProofTrendMaxReconnectP95),
    ),
    maxTurnP95Ms: maxNumber(profileHistory.map(readProofTrendMaxTurnP95)),
    profileCount: profiles.length,
    profiles,
    providers: readProofTrendProviders(profileHistory),
    reconnect: aggregateProofTrendReconnect(
      profileHistory
        .map((report) => report.summary.reconnect)
        .filter(
          (reconnect): reconnect is VoiceProofTrendReconnectSummary =>
            reconnect !== undefined,
        ),
    ),
    runtimeChannel: aggregateProofTrendRuntimeChannel(
      profileHistory
        .map(readProofTrendRuntimeChannel)
        .filter(
          (channel): channel is VoiceProofTrendRuntimeChannelSummary =>
            channel !== undefined,
        ),
    ),
  };
  const trend = buildVoiceProofTrendReport({
    baseUrl: options.baseUrl,
    cycles: flattenProofTrendCycles(profileHistory),
    generatedAt,
    maxAgeMs: options.maxAgeMs,
    now: options.now,
    ok:
      recommendationHistory.length > 0 &&
      profiles.every((profile) => profile.status !== "fail"),
    source: options.source ?? "real-call-profile-history",
    summary,
  });
  const recommendations = buildVoiceProofTrendRecommendationReport(
    trend,
    options,
  );
  const defaults = buildVoiceRealCallProfileDefaults(trend, options);
  const issues = [
    ...(recommendationHistory.length === 0
      ? ["No passing real-call profile reports were present."]
      : []),
    ...(profiles.length === 0 ? ["No benchmark profiles were present."] : []),
    ...recommendations.issues,
  ];

  return {
    defaults,
    generatedAt,
    history,
    issues,
    ok: trend.ok && issues.length === 0,
    recommendations,
    reports: history.length,
    source: trend.source,
    status:
      issues.length > 0
        ? trend.status === "pass"
          ? "fail"
          : trend.status
        : trend.status,
    summary,
    trend,
  };
};

export const buildVoiceRealCallProfileHistoryReportFromStore = async (
  options: Omit<VoiceRealCallProfileHistoryOptions, "evidence"> &
    VoiceRealCallProfileEvidenceListOptions & {
      store: VoiceRealCallProfileEvidenceStore;
    },
): Promise<VoiceRealCallProfileHistoryReport> => {
  const evidence = await options.store.list(options);
  return buildVoiceRealCallProfileHistoryReport({
    ...options,
    evidence,
  });
};

const normalizeProviderStatus = (
  status: string | undefined,
): VoiceProofTrendRecommendationStatus =>
  status === "pass" ? "pass" : status === "fail" ? "fail" : "warn";

const providerSortScore = (provider: VoiceProofTrendProviderRecommendation) =>
  [
    recommendationStatusRank[provider.status],
    provider.p95Ms ?? Number.POSITIVE_INFINITY,
    provider.averageMs ?? Number.POSITIVE_INFINITY,
    provider.samples === undefined
      ? Number.POSITIVE_INFINITY
      : -provider.samples,
    provider.id,
  ] as const;

const compareProviders = (
  left: VoiceProofTrendProviderRecommendation,
  right: VoiceProofTrendProviderRecommendation,
) => {
  const leftScore = providerSortScore(left);
  const rightScore = providerSortScore(right);
  for (let index = 0; index < leftScore.length; index += 1) {
    const leftValue = leftScore[index];
    const rightValue = rightScore[index];
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      if (leftValue !== rightValue) {
        return leftValue - rightValue;
      }
      continue;
    }
    const compared = String(leftValue).localeCompare(String(rightValue));
    if (compared !== 0) {
      return compared;
    }
  }
  return 0;
};

const summarizeProofTrendProviders = (
  report: VoiceProofTrendReport,
  budgetMs: number,
): VoiceProofTrendProviderRecommendation[] => {
  const sourceProviders =
    report.summary.providers && report.summary.providers.length > 0
      ? report.summary.providers
      : undefined;
  const providersById = new Map<string, VoiceProofTrendProviderSummary>();

  if (sourceProviders) {
    for (const provider of sourceProviders) {
      if (provider.id) {
        providersById.set(provider.id, provider);
      }
    }
  } else {
    for (const cycle of report.cycles) {
      for (const provider of cycle.providers ?? []) {
        if (!provider.id) {
          continue;
        }
        const existing = providersById.get(provider.id);
        providersById.set(provider.id, {
          averageMs: maxNumber([existing?.averageMs, provider.averageMs]),
          id: provider.id,
          label: existing?.label ?? provider.label,
          p50Ms: maxNumber([existing?.p50Ms, provider.p50Ms]),
          p95Ms: maxNumber([existing?.p95Ms, provider.p95Ms]),
          role: existing?.role ?? provider.role,
          samples: (existing?.samples ?? 0) + (provider.samples ?? 0),
          status:
            existing?.status === "fail" || provider.status === "fail"
              ? "fail"
              : existing?.status === "warn" || provider.status === "warn"
                ? "warn"
                : (provider.status ?? existing?.status),
        });
      }
    }
  }

  return [...providersById.values()]
    .map((provider) => {
      const status =
        provider.p95Ms === undefined
          ? normalizeProviderStatus(provider.status)
          : withinBudget(provider.p95Ms, budgetMs)
            ? normalizeProviderStatus(provider.status) === "fail"
              ? "fail"
              : "pass"
            : normalizeProviderStatus(provider.status) === "fail"
              ? "fail"
              : "warn";
      return {
        averageMs: provider.averageMs,
        id: provider.id,
        label: provider.label,
        nextMove:
          status === "pass"
            ? "Eligible for latency-sensitive routing based on sustained proof."
            : provider.p95Ms === undefined
              ? "Collect provider-specific latency samples before routing latency-sensitive traffic here."
              : "Keep as fallback or tune provider/model/runtime budgets before using for latency-sensitive routing.",
        p50Ms: provider.p50Ms,
        p95Ms: provider.p95Ms,
        rank: 0,
        role: provider.role,
        samples: provider.samples,
        status,
      };
    })
    .sort(compareProviders)
    .map((provider, index) => ({ ...provider, rank: index + 1 }));
};

const shouldSwitchProvider = (
  current: VoiceProofTrendProviderRecommendation | undefined,
  best: VoiceProofTrendProviderRecommendation | undefined,
  options: VoiceProofTrendRecommendationOptions,
) => {
  if (!current || !best || current.id === best.id || best.status !== "pass") {
    return false;
  }
  if (current.p95Ms === undefined || best.p95Ms === undefined) {
    return false;
  }
  const minImprovementMs = options.providerSwitchMinImprovementMs ?? 100;
  const minImprovementRatio = options.providerSwitchMinImprovementRatio ?? 0.1;
  const improvementMs = current.p95Ms - best.p95Ms;
  const improvementRatio =
    current.p95Ms > 0 ? improvementMs / current.p95Ms : 0;
  return (
    improvementMs >= minImprovementMs || improvementRatio >= minImprovementRatio
  );
};

const bestProviderByRole = (
  providers: readonly VoiceProofTrendProviderRecommendation[],
) => {
  const best = new Map<string, VoiceProofTrendProviderRecommendation>();
  for (const provider of providers) {
    const role = provider.role ?? provider.id;
    const existing = best.get(role);
    if (!existing || compareProviders(provider, existing) < 0) {
      best.set(role, provider);
    }
  }
  return [...best.values()].sort((left, right) =>
    String(left.role ?? left.id).localeCompare(String(right.role ?? right.id)),
  );
};

const formatProviderMix = (
  providers: readonly { id: string; label?: string; role?: string }[],
) =>
  providers.length === 0
    ? "n/a"
    : providers
        .map((provider) =>
          provider.role &&
          !(provider.label ?? provider.id)
            .toLowerCase()
            .startsWith(provider.role.toLowerCase())
            ? `${provider.role.toUpperCase()} ${provider.label ?? provider.id}`
            : (provider.label ?? provider.id),
        )
        .join(", ");

const buildProfileRecommendations = (
  report: VoiceProofTrendReport,
  budgets: typeof DEFAULT_RECOMMENDATION_BUDGETS,
): VoiceProofTrendProfileRecommendation[] =>
  (report.summary.profiles ?? []).map((profile) => {
    const providers = summarizeProofTrendProviders(
      {
        ...report,
        cycles: [],
        summary: {
          cycles: report.summary.cycles,
          maxLiveP95Ms: profile.maxLiveP95Ms,
          maxProviderP95Ms: profile.maxProviderP95Ms,
          maxTurnP95Ms: profile.maxTurnP95Ms,
          providers: profile.providers,
          runtimeChannel: profile.runtimeChannel,
        },
      },
      budgets.maxProviderP95Ms,
    );
    const bestProviders = bestProviderByRole(providers).filter(
      (provider) => provider.status === "pass",
    );
    const hasRequiredProviderRoles =
      bestProviders.some((provider) => provider.role === "llm") &&
      bestProviders.some((provider) => provider.role === "stt") &&
      bestProviders.some((provider) => provider.role === "tts");
    const runtimePass =
      (profile.runtimeChannel?.status === undefined ||
        profile.runtimeChannel.status === "pass") &&
      (profile.runtimeChannel?.maxFirstAudioLatencyMs === undefined ||
        profile.runtimeChannel.maxFirstAudioLatencyMs <=
          budgets.maxRuntimeFirstAudioLatencyMs) &&
      (profile.runtimeChannel?.maxInterruptionP95Ms === undefined ||
        profile.runtimeChannel.maxInterruptionP95Ms <=
          budgets.maxRuntimeInterruptionP95Ms) &&
      (profile.runtimeChannel?.maxJitterMs === undefined ||
        profile.runtimeChannel.maxJitterMs <= budgets.maxRuntimeJitterMs) &&
      (profile.runtimeChannel?.maxTimestampDriftMs === undefined ||
        profile.runtimeChannel.maxTimestampDriftMs <=
          budgets.maxRuntimeTimestampDriftMs) &&
      (profile.runtimeChannel?.maxBackpressureEvents === undefined ||
        profile.runtimeChannel.maxBackpressureEvents <=
          budgets.maxRuntimeBackpressureEvents);
    const latencyPass =
      (profile.maxProviderP95Ms === undefined ||
        profile.maxProviderP95Ms <= budgets.maxProviderP95Ms) &&
      (profile.maxLiveP95Ms === undefined ||
        profile.maxLiveP95Ms <= budgets.maxLiveP95Ms) &&
      (profile.maxTurnP95Ms === undefined ||
        profile.maxTurnP95Ms <= budgets.maxTurnP95Ms);
    const status: VoiceProofTrendRecommendationStatus =
      profile.status === "fail" || !runtimePass
        ? "fail"
        : !latencyPass || !hasRequiredProviderRoles
          ? "warn"
          : "pass";
    return {
      bestProviders,
      id: profile.id,
      label: profile.label,
      nextMove:
        status === "pass"
          ? `Use this proven provider mix for ${profile.label ?? profile.id}: ${formatProviderMix(bestProviders)}.`
          : providers.length === 0
            ? `Collect provider-specific sustained samples for ${profile.label ?? profile.id}.`
            : `Tune latency/runtime budgets for ${profile.label ?? profile.id} before promoting this profile.`,
      providerComparisonCount: providers.length,
      recommendation:
        status === "pass"
          ? `Profile ready: ${profile.label ?? profile.id}`
          : `Profile needs proof: ${profile.label ?? profile.id}`,
      status,
    };
  });

export const evaluateVoiceProofTrendEvidence = (
  report: VoiceProofTrendReport,
  input: VoiceProofTrendAssertionInput = {},
): VoiceProofTrendAssertionReport => {
  const issues: string[] = [];
  const requiredStatus = input.requireStatus ?? "pass";
  const minCycles = input.minCycles ?? 1;
  const requireAllCyclesOk = input.requireAllCyclesOk ?? true;
  const cycles = report.summary.cycles ?? report.cycles.length;
  const failedCycles = report.cycles.filter(
    (cycle) => cycle.ok !== true,
  ).length;
  const maxLiveP95Ms = readProofTrendMaxLiveP95(report);
  const maxProviderP95Ms = readProofTrendMaxProviderP95(report);
  const runtimeChannel = readProofTrendRuntimeChannel(report);
  const maxTurnP95Ms = readProofTrendMaxTurnP95(report);

  if (report.status !== requiredStatus) {
    issues.push(
      `Expected proof trends status ${requiredStatus}, found ${report.status}.`,
    );
  }
  if (report.ok !== true) {
    issues.push("Expected proof trends ok to be true.");
  }
  if (cycles < minCycles) {
    issues.push(
      `Expected at least ${String(minCycles)} proof trend cycle(s), found ${String(cycles)}.`,
    );
  }
  if (requireAllCyclesOk && failedCycles > 0) {
    issues.push(
      `Expected all proof trend cycles to pass, found ${String(failedCycles)} failing cycle(s).`,
    );
  }
  if (
    input.maxAgeMs !== undefined &&
    (report.ageMs === undefined || report.ageMs > input.maxAgeMs)
  ) {
    issues.push(
      report.ageMs === undefined
        ? "Missing proof trends artifact age."
        : `Expected proof trends age at most ${String(input.maxAgeMs)}ms, found ${String(report.ageMs)}ms.`,
    );
  }
  if (
    input.maxLiveP95Ms !== undefined &&
    (maxLiveP95Ms === undefined || maxLiveP95Ms > input.maxLiveP95Ms)
  ) {
    issues.push(
      maxLiveP95Ms === undefined
        ? "Missing proof trends live latency p95."
        : `Expected proof trends live latency p95 at most ${String(input.maxLiveP95Ms)}ms, found ${String(maxLiveP95Ms)}ms.`,
    );
  }
  if (
    input.maxProviderP95Ms !== undefined &&
    (maxProviderP95Ms === undefined ||
      maxProviderP95Ms > input.maxProviderP95Ms)
  ) {
    issues.push(
      maxProviderP95Ms === undefined
        ? "Missing proof trends provider p95."
        : `Expected proof trends provider p95 at most ${String(input.maxProviderP95Ms)}ms, found ${String(maxProviderP95Ms)}ms.`,
    );
  }
  if (
    input.maxTurnP95Ms !== undefined &&
    (maxTurnP95Ms === undefined || maxTurnP95Ms > input.maxTurnP95Ms)
  ) {
    issues.push(
      maxTurnP95Ms === undefined
        ? "Missing proof trends turn latency p95."
        : `Expected proof trends turn latency p95 at most ${String(input.maxTurnP95Ms)}ms, found ${String(maxTurnP95Ms)}ms.`,
    );
  }
  if (
    input.maxRuntimeFirstAudioLatencyMs !== undefined &&
    (runtimeChannel.maxFirstAudioLatencyMs === undefined ||
      runtimeChannel.maxFirstAudioLatencyMs >
        input.maxRuntimeFirstAudioLatencyMs)
  ) {
    issues.push(
      runtimeChannel.maxFirstAudioLatencyMs === undefined
        ? "Missing proof trends runtime-channel first audio latency."
        : `Expected proof trends runtime-channel first audio latency at most ${String(input.maxRuntimeFirstAudioLatencyMs)}ms, found ${String(runtimeChannel.maxFirstAudioLatencyMs)}ms.`,
    );
  }
  if (
    input.maxRuntimeInterruptionP95Ms !== undefined &&
    (runtimeChannel.maxInterruptionP95Ms === undefined ||
      runtimeChannel.maxInterruptionP95Ms > input.maxRuntimeInterruptionP95Ms)
  ) {
    issues.push(
      runtimeChannel.maxInterruptionP95Ms === undefined
        ? "Missing proof trends runtime-channel interruption p95."
        : `Expected proof trends runtime-channel interruption p95 at most ${String(input.maxRuntimeInterruptionP95Ms)}ms, found ${String(runtimeChannel.maxInterruptionP95Ms)}ms.`,
    );
  }
  if (
    input.maxRuntimeJitterMs !== undefined &&
    (runtimeChannel.maxJitterMs === undefined ||
      runtimeChannel.maxJitterMs > input.maxRuntimeJitterMs)
  ) {
    issues.push(
      runtimeChannel.maxJitterMs === undefined
        ? "Missing proof trends runtime-channel jitter."
        : `Expected proof trends runtime-channel jitter at most ${String(input.maxRuntimeJitterMs)}ms, found ${String(runtimeChannel.maxJitterMs)}ms.`,
    );
  }
  if (
    input.maxRuntimeTimestampDriftMs !== undefined &&
    (runtimeChannel.maxTimestampDriftMs === undefined ||
      runtimeChannel.maxTimestampDriftMs > input.maxRuntimeTimestampDriftMs)
  ) {
    issues.push(
      runtimeChannel.maxTimestampDriftMs === undefined
        ? "Missing proof trends runtime-channel timestamp drift."
        : `Expected proof trends runtime-channel timestamp drift at most ${String(input.maxRuntimeTimestampDriftMs)}ms, found ${String(runtimeChannel.maxTimestampDriftMs)}ms.`,
    );
  }
  if (
    input.maxRuntimeBackpressureEvents !== undefined &&
    (runtimeChannel.maxBackpressureEvents === undefined ||
      runtimeChannel.maxBackpressureEvents > input.maxRuntimeBackpressureEvents)
  ) {
    issues.push(
      runtimeChannel.maxBackpressureEvents === undefined
        ? "Missing proof trends runtime-channel backpressure events."
        : `Expected proof trends runtime-channel backpressure events at most ${String(input.maxRuntimeBackpressureEvents)}, found ${String(runtimeChannel.maxBackpressureEvents)}.`,
    );
  }
  if (input.minLiveLatencySamples !== undefined) {
    const lowSamples = report.cycles.filter(
      (cycle) =>
        (cycle.liveLatency?.samples ?? 0) < input.minLiveLatencySamples!,
    ).length;
    if (lowSamples > 0) {
      issues.push(
        `Expected every proof trend cycle to have at least ${String(input.minLiveLatencySamples)} live latency sample(s), found ${String(lowSamples)} low-sample cycle(s).`,
      );
    }
  }
  if (input.minProviderSloEventsWithLatency !== undefined) {
    const lowSamples = report.cycles.filter(
      (cycle) =>
        (cycle.providerSlo?.eventsWithLatency ?? 0) <
        input.minProviderSloEventsWithLatency!,
    ).length;
    if (lowSamples > 0) {
      issues.push(
        `Expected every proof trend cycle to have at least ${String(input.minProviderSloEventsWithLatency)} provider latency event(s), found ${String(lowSamples)} low-sample cycle(s).`,
      );
    }
  }
  if (input.minTurnLatencySamples !== undefined) {
    const lowSamples = report.cycles.filter(
      (cycle) =>
        (cycle.turnLatency?.samples ?? 0) < input.minTurnLatencySamples!,
    ).length;
    if (lowSamples > 0) {
      issues.push(
        `Expected every proof trend cycle to have at least ${String(input.minTurnLatencySamples)} turn latency sample(s), found ${String(lowSamples)} low-sample cycle(s).`,
      );
    }
  }
  if (
    input.minRuntimeChannelSamples !== undefined &&
    (runtimeChannel.samples === undefined ||
      runtimeChannel.samples < input.minRuntimeChannelSamples)
  ) {
    issues.push(
      runtimeChannel.samples === undefined
        ? "Missing proof trends runtime-channel samples."
        : `Expected proof trends runtime-channel samples at least ${String(input.minRuntimeChannelSamples)}, found ${String(runtimeChannel.samples)}.`,
    );
  }

  return {
    ageMs: report.ageMs,
    cycles,
    failedCycles,
    issues,
    maxLiveP95Ms,
    maxProviderP95Ms,
    runtimeChannel,
    maxTurnP95Ms,
    ok: issues.length === 0,
    status: report.status,
  };
};

export const assertVoiceProofTrendEvidence = (
  report: VoiceProofTrendReport,
  input: VoiceProofTrendAssertionInput = {},
): VoiceProofTrendAssertionReport => {
  const assertion = evaluateVoiceProofTrendEvidence(report, input);
  if (!assertion.ok) {
    throw new Error(
      `Voice proof trends assertion failed: ${assertion.issues.join(" ")}`,
    );
  }
  return assertion;
};

const DEFAULT_RECOMMENDATION_BUDGETS = {
  maxLiveP95Ms: 800,
  maxProviderP95Ms: 1_000,
  maxRuntimeBackpressureEvents: 0,
  maxRuntimeFirstAudioLatencyMs: 600,
  maxRuntimeInterruptionP95Ms: 300,
  maxRuntimeJitterMs: 30,
  maxRuntimeTimestampDriftMs: 800,
  maxTurnP95Ms: 700,
};

const withinBudget = (value: number | undefined, budget: number) =>
  typeof value === "number" && Number.isFinite(value) && value <= budget;

const recommendationStatusRank: Record<
  VoiceProofTrendRecommendationStatus,
  number
> = {
  pass: 0,
  warn: 1,
  fail: 2,
};

const worstRecommendationStatus = (
  recommendations: readonly VoiceProofTrendRecommendation[],
): VoiceProofTrendRecommendationStatus =>
  recommendations.reduce(
    (status, recommendation) =>
      recommendationStatusRank[recommendation.status] >
      recommendationStatusRank[status]
        ? recommendation.status
        : status,
    "pass" as VoiceProofTrendRecommendationStatus,
  );

export const buildVoiceProofTrendRecommendationReport = (
  report: VoiceProofTrendReport,
  options: VoiceProofTrendRecommendationOptions = {},
): VoiceProofTrendRecommendationReport => {
  const budgets = { ...DEFAULT_RECOMMENDATION_BUDGETS, ...options };
  const maxLiveP95Ms = readProofTrendMaxLiveP95(report);
  const maxProviderP95Ms = readProofTrendMaxProviderP95(report);
  const maxTurnP95Ms = readProofTrendMaxTurnP95(report);
  const runtimeChannel = readProofTrendRuntimeChannel(report);
  const providers = summarizeProofTrendProviders(
    report,
    budgets.maxProviderP95Ms,
  );
  const bestProvider =
    providers.find((provider) => provider.status === "pass") ?? providers[0];
  const bestProviders = bestProviderByRole(providers).filter(
    (provider) => provider.status === "pass",
  );
  const currentProvider = options.currentProviderId
    ? providers.find((provider) => provider.id === options.currentProviderId)
    : undefined;
  const hasSingleProviderRole =
    new Set(bestProviders.map((provider) => provider.role ?? provider.id))
      .size <= 1;
  const bestComparableProvider = currentProvider?.role
    ? bestProviders.find((provider) => provider.role === currentProvider.role)
    : bestProvider;
  const providerSwitchRecommended = shouldSwitchProvider(
    currentProvider,
    bestComparableProvider,
    options,
  );
  const profileRecommendations = buildProfileRecommendations(report, budgets);
  const recommendations: VoiceProofTrendRecommendation[] = [];
  const issues: string[] = [];

  if (report.ok !== true) {
    issues.push(
      `Proof trend report is ${report.status}; recommendations need a fresh passing trend artifact.`,
    );
  }

  recommendations.push({
    evidence: {
      bestProviderId:
        currentProvider || hasSingleProviderRole
          ? (bestComparableProvider?.id ?? bestProvider?.id)
          : undefined,
      bestProviderMix: formatProviderMix(bestProviders),
      bestProviderP95Ms:
        currentProvider || hasSingleProviderRole
          ? (bestComparableProvider?.p95Ms ?? bestProvider?.p95Ms)
          : undefined,
      budgetMs: budgets.maxProviderP95Ms,
      currentProviderId: currentProvider?.id ?? options.currentProviderId,
      currentProviderP95Ms: currentProvider?.p95Ms,
      providerComparisonCount: providers.length,
      providerP95Ms: maxProviderP95Ms,
    },
    nextMove:
      providers.length > 0
        ? providerSwitchRecommended
          ? `Route latency-sensitive ${currentProvider?.role ?? "provider"} traffic to ${bestComparableProvider?.label ?? bestComparableProvider?.id} for this call profile and keep the current path as fallback.`
          : bestProviders.length > 0
            ? `Use the fastest proven provider mix for this call profile: ${formatProviderMix(bestProviders)}.`
            : "Collect provider-specific sustained samples before making provider-specific routing decisions."
        : withinBudget(maxProviderP95Ms, budgets.maxProviderP95Ms)
          ? "Keep the current provider route for latency-sensitive turns and keep collecting sustained proof."
          : "Route latency-sensitive turns to a faster provider profile or tighten fallback/circuit-breaker budgets before promotion.",
    providerId: providerSwitchRecommended
      ? bestComparableProvider?.id
      : bestProviders.length === 1
        ? bestProviders[0]?.id
        : undefined,
    recommendation:
      providers.length > 0
        ? providerSwitchRecommended
          ? `Switch latency-sensitive ${currentProvider?.role ?? "provider"} routing to ${bestComparableProvider?.label ?? bestComparableProvider?.id}`
          : bestProviders.length > 0
            ? "Prefer the fastest proven provider mix for this call profile"
            : "Collect provider-specific latency samples"
        : withinBudget(maxProviderP95Ms, budgets.maxProviderP95Ms)
          ? "Keep current provider path"
          : "Change provider routing for latency-sensitive traffic",
    role:
      currentProvider || hasSingleProviderRole
        ? bestComparableProvider?.role
        : undefined,
    status:
      providers.length > 0
        ? providerSwitchRecommended
          ? "warn"
          : bestProviders.length > 0
            ? "pass"
            : (bestProvider?.status ?? "fail")
        : withinBudget(maxProviderP95Ms, budgets.maxProviderP95Ms)
          ? "pass"
          : maxProviderP95Ms === undefined
            ? "fail"
            : "warn",
    surface: "provider-path",
  });

  const runtimePass =
    withinBudget(
      runtimeChannel.maxFirstAudioLatencyMs,
      budgets.maxRuntimeFirstAudioLatencyMs,
    ) &&
    withinBudget(
      runtimeChannel.maxInterruptionP95Ms,
      budgets.maxRuntimeInterruptionP95Ms,
    ) &&
    withinBudget(runtimeChannel.maxJitterMs, budgets.maxRuntimeJitterMs) &&
    withinBudget(
      runtimeChannel.maxTimestampDriftMs,
      budgets.maxRuntimeTimestampDriftMs,
    ) &&
    withinBudget(
      runtimeChannel.maxBackpressureEvents,
      budgets.maxRuntimeBackpressureEvents,
    );
  recommendations.push({
    evidence: {
      backpressureEvents: runtimeChannel.maxBackpressureEvents,
      firstAudioBudgetMs: budgets.maxRuntimeFirstAudioLatencyMs,
      firstAudioMs: runtimeChannel.maxFirstAudioLatencyMs,
      interruptionBudgetMs: budgets.maxRuntimeInterruptionP95Ms,
      interruptionP95Ms: runtimeChannel.maxInterruptionP95Ms,
      jitterBudgetMs: budgets.maxRuntimeJitterMs,
      jitterMs: runtimeChannel.maxJitterMs,
      samples: runtimeChannel.samples,
      timestampDriftMs: runtimeChannel.maxTimestampDriftMs,
    },
    nextMove: runtimePass
      ? "Keep the current runtime-channel settings and use this artifact as the deploy gate baseline."
      : "Tune capture/output format, buffering, interruption threshold, or transport backpressure before promoting this runtime path.",
    recommendation: runtimePass
      ? "Keep current runtime channel"
      : "Tune runtime channel before promotion",
    status: runtimePass
      ? "pass"
      : runtimeChannel.samples === undefined
        ? "fail"
        : "warn",
    surface: "runtime-channel",
  });

  recommendations.push({
    evidence: {
      budgetMs: budgets.maxLiveP95Ms,
      liveP95Ms: maxLiveP95Ms,
    },
    nextMove: withinBudget(maxLiveP95Ms, budgets.maxLiveP95Ms)
      ? "Keep browser live-latency defaults and continue watching long-window drift."
      : "Tune browser streaming, chunking, or readiness thresholds before release.",
    recommendation: withinBudget(maxLiveP95Ms, budgets.maxLiveP95Ms)
      ? "Keep live-latency settings"
      : "Tune live-latency path",
    status: withinBudget(maxLiveP95Ms, budgets.maxLiveP95Ms)
      ? "pass"
      : maxLiveP95Ms === undefined
        ? "fail"
        : "warn",
    surface: "live-latency",
  });

  recommendations.push({
    evidence: {
      budgetMs: budgets.maxTurnP95Ms,
      turnP95Ms: maxTurnP95Ms,
    },
    nextMove: withinBudget(maxTurnP95Ms, budgets.maxTurnP95Ms)
      ? "Keep current turn pipeline defaults."
      : "Reduce tool/provider latency or split the turn pipeline before promotion.",
    recommendation: withinBudget(maxTurnP95Ms, budgets.maxTurnP95Ms)
      ? "Keep turn pipeline"
      : "Tune turn pipeline",
    status: withinBudget(maxTurnP95Ms, budgets.maxTurnP95Ms)
      ? "pass"
      : maxTurnP95Ms === undefined
        ? "fail"
        : "warn",
    surface: "turn-latency",
  });

  const status =
    issues.length > 0 ? "fail" : worstRecommendationStatus(recommendations);
  const profileStatus = worstRecommendationStatus(
    profileRecommendations.map((profile) => ({
      evidence: {},
      nextMove: profile.nextMove,
      recommendation: profile.recommendation,
      status: profile.status,
      surface: "provider-path",
    })),
  );
  const combinedStatus =
    recommendationStatusRank[profileStatus] > recommendationStatusRank[status]
      ? profileStatus
      : status;

  return {
    bestProvider,
    bestProviders,
    generatedAt: new Date().toISOString(),
    issues,
    ok: combinedStatus !== "fail",
    profiles: profileRecommendations,
    providers,
    recommendations,
    source: report.source || report.outputDir || report.runId || "proof-trends",
    status: combinedStatus,
    summary: {
      keepCurrentProviderPath:
        !providerSwitchRecommended &&
        recommendations.find((item) => item.surface === "provider-path")
          ?.status !== "fail",
      keepCurrentRuntimeChannel:
        recommendations.find((item) => item.surface === "runtime-channel")
          ?.status === "pass",
      providerComparisonCount: providers.length,
      recommendedActions: recommendations.filter(
        (item) => item.status !== "pass",
      ).length,
      switchRecommended: providerSwitchRecommended,
    },
  };
};

const escapeHtml = (value: unknown) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const escapeMarkdown = (value: string) => value.replaceAll("|", "\\|");

export const renderVoiceProofTrendRecommendationMarkdown = (
  report: VoiceProofTrendRecommendationReport,
  title = "Voice Provider Runtime Recommendations",
) =>
  [
    `# ${title}`,
    "",
    `- Status: ${report.status}`,
    `- Source: ${report.source}`,
    `- Best provider mix: ${formatProviderMix(report.bestProviders)}`,
    `- Provider comparisons: ${String(report.summary.providerComparisonCount)}`,
    `- Recommended actions: ${String(report.summary.recommendedActions)}`,
    "",
    "| Surface | Status | Recommendation | Next move |",
    "| --- | --- | --- | --- |",
    ...report.recommendations.map(
      (recommendation) =>
        `| ${escapeMarkdown(recommendation.surface)} | ${recommendation.status} | ${escapeMarkdown(recommendation.recommendation)} | ${escapeMarkdown(recommendation.nextMove)} |`,
    ),
    "",
    "## Provider Comparison",
    "",
    "| Rank | Provider | Role | Status | P95 | Samples | Next move |",
    "| ---: | --- | --- | --- | ---: | ---: | --- |",
    ...(report.providers.length
      ? report.providers.map(
          (provider) =>
            `| ${String(provider.rank)} | ${escapeMarkdown(provider.label ?? provider.id)} | ${escapeMarkdown(provider.role ?? "n/a")} | ${provider.status} | ${provider.p95Ms === undefined ? "n/a" : String(provider.p95Ms)} | ${provider.samples === undefined ? "n/a" : String(provider.samples)} | ${escapeMarkdown(provider.nextMove)} |`,
        )
      : [
          "| n/a | n/a | n/a | n/a | n/a | n/a | No provider-specific samples were present. |",
        ]),
    "",
    "## Benchmark Profiles",
    "",
    "| Profile | Status | Provider mix | Next move |",
    "| --- | --- | --- | --- |",
    ...(report.profiles.length
      ? report.profiles.map(
          (profile) =>
            `| ${escapeMarkdown(profile.label ?? profile.id)} | ${profile.status} | ${escapeMarkdown(formatProviderMix(profile.bestProviders))} | ${escapeMarkdown(profile.nextMove)} |`,
        )
      : ["| n/a | n/a | n/a | No benchmark profiles were present. |"]),
    "",
    "## Issues",
    "",
    ...(report.issues.length
      ? report.issues.map((issue) => `- ${issue}`)
      : ["- None"]),
  ].join("\n");

export const renderVoiceProofTrendRecommendationHTML = (
  report: VoiceProofTrendRecommendationReport,
  title = "Voice Provider Runtime Recommendations",
) => {
  const cards = report.recommendations
    .map(
      (recommendation) =>
        `<article class="${escapeHtml(recommendation.status)}"><p class="eyebrow">${escapeHtml(recommendation.surface)} · ${escapeHtml(recommendation.status)}</p><h2>${escapeHtml(recommendation.recommendation)}</h2><p>${escapeHtml(recommendation.nextMove)}</p><pre>${escapeHtml(JSON.stringify(recommendation.evidence, null, 2))}</pre></article>`,
    )
    .join("");
  const issues =
    report.issues.length === 0
      ? "<li>None</li>"
      : report.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("");
  const providerRows =
    report.providers.length === 0
      ? "<li>No provider-specific samples were present.</li>"
      : report.providers
          .map(
            (provider) =>
              `<li><strong>#${String(provider.rank)} ${escapeHtml(provider.label ?? provider.id)}</strong><span>${escapeHtml(provider.role ?? "provider")} · ${escapeHtml(provider.status)} · p95 ${escapeHtml(provider.p95Ms ?? "n/a")}ms · ${escapeHtml(provider.samples ?? "n/a")} sample(s)</span><small>${escapeHtml(provider.nextMove)}</small></li>`,
          )
          .join("");
  const profileRows =
    report.profiles.length === 0
      ? "<li>No benchmark profiles were present.</li>"
      : report.profiles
          .map(
            (profile) =>
              `<li><strong>${escapeHtml(profile.label ?? profile.id)}</strong><span>${escapeHtml(profile.status)} · ${escapeHtml(formatProviderMix(profile.bestProviders))}</span><small>${escapeHtml(profile.nextMove)}</small></li>`,
          )
          .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101418;color:#f7f3e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1120px;padding:32px}.hero,article{background:#17201d;border:1px solid #2e3d36;border-radius:24px;margin-bottom:16px;padding:22px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.18),rgba(245,158,11,.12))}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(2.2rem,6vw,4.7rem);letter-spacing:-.06em;line-height:.92;margin:.2rem 0 1rem}.summary{display:flex;flex-wrap:wrap;gap:10px}.pill{border:1px solid #42534a;border-radius:999px;padding:8px 12px}.pass{border-color:rgba(34,197,94,.55)}.warn{border-color:rgba(245,158,11,.7)}.fail{border-color:rgba(239,68,68,.75)}pre{background:#0b1110;border-radius:14px;overflow:auto;padding:12px}a{color:#5eead4}li{margin:.45rem 0}li span,li small{display:block;color:#c9d3ca}</style></head><body><main><section class="hero"><p class="eyebrow">Sustained proof recommendations</p><h1>${escapeHtml(title)}</h1><p>Generated ${escapeHtml(report.generatedAt)} from ${escapeHtml(report.source)}.</p><div class="summary"><span class="pill">Status ${escapeHtml(report.status)}</span><span class="pill">Provider ${report.summary.keepCurrentProviderPath ? "keep" : "change"}</span><span class="pill">Best mix ${escapeHtml(formatProviderMix(report.bestProviders))}</span><span class="pill">Profiles ${String(report.profiles.length)}</span><span class="pill">Runtime ${report.summary.keepCurrentRuntimeChannel ? "keep" : "tune"}</span><span class="pill">${String(report.summary.recommendedActions)} action(s)</span></div></section>${cards}<section class="hero"><h2>Benchmark Profiles</h2><ul>${profileRows}</ul></section><section class="hero"><h2>Provider Comparison</h2><ul>${providerRows}</ul></section><section class="hero"><h2>Issues</h2><ul>${issues}</ul></section></main></body></html>`;
};

export const renderVoiceRealCallProfileHistoryMarkdown = (
  report: VoiceRealCallProfileHistoryReport,
  title = "Voice Real-Call Profile History",
) =>
  [
    `# ${title}`,
    "",
    `- Status: ${report.status}`,
    `- Reports: ${String(report.reports)}`,
    `- Profiles: ${String(report.summary.profileCount)}`,
    `- Cycles: ${String(report.summary.cycles ?? 0)}`,
    `- Source: ${report.source}`,
    `- Best provider mix: ${formatProviderMix(report.recommendations.bestProviders)}`,
    "",
    "## Profiles",
    "",
    "| Profile | Status | Live p95 | Provider p95 | Turn p95 | Provider mix |",
    "| --- | --- | ---: | ---: | ---: | --- |",
    ...(report.summary.profiles?.length
      ? report.summary.profiles.map(
          (profile) =>
            `| ${escapeMarkdown(profile.label ?? profile.id)} | ${profile.status ?? "unknown"} | ${profile.maxLiveP95Ms ?? "n/a"} | ${profile.maxProviderP95Ms ?? "n/a"} | ${profile.maxTurnP95Ms ?? "n/a"} | ${escapeMarkdown(formatProviderMix(profile.providers ?? []))} |`,
        )
      : ["| n/a | n/a | n/a | n/a | n/a | No profiles present. |"]),
    "",
    "## Recommendations",
    "",
    ...report.recommendations.recommendations.map(
      (recommendation) =>
        `- ${recommendation.status}: ${recommendation.recommendation} ${recommendation.nextMove}`,
    ),
    "",
    "## Actionable Defaults",
    "",
    "| Profile | Status | Provider routes | Live budget | Provider budget | Turn budget |",
    "| --- | --- | --- | ---: | ---: | ---: |",
    ...(report.defaults.profiles.length
      ? report.defaults.profiles.map(
          (profile) =>
            `| ${escapeMarkdown(profile.label ?? profile.profileId)} | ${profile.status} | ${escapeMarkdown(
              Object.entries(profile.providerRoutes)
                .map(([role, provider]) => `${role}: ${provider}`)
                .join(", ") || "n/a",
            )} | ${profile.latencyBudgets.maxLiveP95Ms ?? "n/a"} | ${profile.latencyBudgets.maxProviderP95Ms ?? "n/a"} | ${profile.latencyBudgets.maxTurnP95Ms ?? "n/a"} |`,
        )
      : ["| n/a | n/a | n/a | n/a | n/a | n/a |"]),
    "",
    "## Issues",
    "",
    ...(report.issues.length
      ? report.issues.map((issue) => `- ${issue}`)
      : ["- None"]),
  ].join("\n");

export const renderVoiceRealCallProfileHistoryHTML = (
  report: VoiceRealCallProfileHistoryReport,
  title = "Voice Real-Call Profile History",
) => {
  const profileRows = report.summary.profiles?.length
    ? report.summary.profiles
        .map(
          (profile) =>
            `<tr><td>${escapeHtml(profile.label ?? profile.id)}</td><td>${escapeHtml(profile.status ?? "unknown")}</td><td>${escapeHtml(profile.maxLiveP95Ms ?? "n/a")}</td><td>${escapeHtml(profile.maxProviderP95Ms ?? "n/a")}</td><td>${escapeHtml(profile.maxTurnP95Ms ?? "n/a")}</td><td>${escapeHtml(formatProviderMix(profile.providers ?? []))}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="6">No profiles present.</td></tr>';
  const defaultRows =
    report.defaults.profiles.length > 0
      ? report.defaults.profiles
          .map(
            (profile) =>
              `<tr><td>${escapeHtml(profile.label ?? profile.profileId)}</td><td>${escapeHtml(profile.status)}</td><td>${escapeHtml(
                Object.entries(profile.providerRoutes)
                  .map(([role, provider]) => `${role}: ${provider}`)
                  .join(", ") || "n/a",
              )}</td><td>${escapeHtml(profile.latencyBudgets.maxLiveP95Ms ?? "n/a")}</td><td>${escapeHtml(profile.latencyBudgets.maxProviderP95Ms ?? "n/a")}</td><td>${escapeHtml(profile.latencyBudgets.maxTurnP95Ms ?? "n/a")}</td></tr>`,
          )
          .join("")
      : '<tr><td colspan="6">No actionable defaults present.</td></tr>';
  const recommendations = report.recommendations.recommendations
    .map(
      (recommendation) =>
        `<article class="${escapeHtml(recommendation.status)}"><p class="eyebrow">${escapeHtml(recommendation.surface)} · ${escapeHtml(recommendation.status)}</p><h2>${escapeHtml(recommendation.recommendation)}</h2><p>${escapeHtml(recommendation.nextMove)}</p></article>`,
    )
    .join("");
  const issues =
    report.issues.length === 0
      ? "<li>None</li>"
      : report.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#111510;color:#f6f0dd;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1120px;padding:32px}.hero,article,.card{background:#182117;border:1px solid #32412d;border-radius:24px;margin-bottom:16px;padding:22px}.hero{background:linear-gradient(135deg,rgba(132,204,22,.16),rgba(20,184,166,.12))}.eyebrow{color:#bef264;font-weight:900;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(2.2rem,6vw,4.7rem);letter-spacing:-.06em;line-height:.92;margin:.2rem 0 1rem}.summary{display:flex;flex-wrap:wrap;gap:10px}.pill{border:1px solid #52624b;border-radius:999px;padding:8px 12px}.pass{border-color:rgba(34,197,94,.55)}.warn{border-color:rgba(245,158,11,.7)}.fail{border-color:rgba(239,68,68,.75)}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #32412d;padding:10px;text-align:left}</style></head><body><main><section class="hero"><p class="eyebrow">Real-call benchmark history</p><h1>${escapeHtml(title)}</h1><p>Generated ${escapeHtml(report.generatedAt)} from ${escapeHtml(report.source)}.</p><div class="summary"><span class="pill">Status ${escapeHtml(report.status)}</span><span class="pill">Reports ${String(report.reports)}</span><span class="pill">Profiles ${String(report.summary.profileCount)}</span><span class="pill">Defaults ${String(report.defaults.summary.actionableProfiles)}/${String(report.defaults.summary.profileCount)}</span><span class="pill">Cycles ${String(report.summary.cycles ?? 0)}</span><span class="pill">Best mix ${escapeHtml(formatProviderMix(report.recommendations.bestProviders))}</span></div></section><section class="card"><h2>Profiles</h2><table><thead><tr><th>Profile</th><th>Status</th><th>Live p95</th><th>Provider p95</th><th>Turn p95</th><th>Provider mix</th></tr></thead><tbody>${profileRows}</tbody></table></section><section class="card"><h2>Actionable Defaults</h2><table><thead><tr><th>Profile</th><th>Status</th><th>Provider routes</th><th>Live budget</th><th>Provider budget</th><th>Turn budget</th></tr></thead><tbody>${defaultRows}</tbody></table></section>${recommendations}<section class="card"><h2>Issues</h2><ul>${issues}</ul></section></main></body></html>`;
};

export const createVoiceProofTrendRecommendationRoutes = (
  options: VoiceProofTrendRecommendationRoutesOptions,
) => {
  const path = options.path ?? "/api/voice/proof-trend-recommendations";
  const htmlPath =
    options.htmlPath === undefined
      ? "/voice/proof-trend-recommendations"
      : options.htmlPath;
  const markdownPath =
    options.markdownPath === undefined
      ? "/voice/proof-trend-recommendations.md"
      : options.markdownPath;
  const title = options.title ?? "Voice Provider Runtime Recommendations";
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-proof-trend-recommendations",
  });
  const loadReport = async () => {
    const value =
      options.source !== undefined
        ? typeof options.source === "function"
          ? await options.source()
          : options.source
        : options.jsonPath
          ? await readVoiceProofTrendReportFile(options.jsonPath, {
              maxAgeMs: options.maxAgeMs,
            })
          : buildEmptyVoiceProofTrendReport("", options.maxAgeMs);
    return buildVoiceProofTrendRecommendationReport(
      normalizeVoiceProofTrendReport(value, {
        maxAgeMs: options.maxAgeMs,
        source: options.jsonPath,
      }),
      options,
    );
  };

  routes.get(path, async () =>
    Response.json(await loadReport(), { headers: options.headers }),
  );

  if (htmlPath !== false) {
    routes.get(htmlPath, async () => {
      const report = await loadReport();
      return new Response(
        renderVoiceProofTrendRecommendationHTML(report, title),
        {
          headers: {
            "content-type": "text/html; charset=utf-8",
            ...Object.fromEntries(new Headers(options.headers)),
          },
        },
      );
    });
  }

  if (markdownPath !== false) {
    routes.get(markdownPath, async () => {
      const report = await loadReport();
      return new Response(
        renderVoiceProofTrendRecommendationMarkdown(report, title),
        {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            ...Object.fromEntries(new Headers(options.headers)),
          },
        },
      );
    });
  }

  return routes;
};

export const createVoiceRealCallProfileHistoryRoutes = (
  options: VoiceRealCallProfileHistoryRoutesOptions = {},
) => {
  const path = options.path ?? "/api/voice/real-call-profile-history";
  const htmlPath =
    options.htmlPath === undefined
      ? "/voice/real-call-profile-history"
      : options.htmlPath;
  const markdownPath =
    options.markdownPath === undefined
      ? "/voice/real-call-profile-history.md"
      : options.markdownPath;
  const title = options.title ?? "Voice Real-Call Profile History";
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-real-call-profile-history",
  });
  const loadReport = async () => {
    const { source, ...routeOptions } = options;
    const sourceOptions =
      source === undefined
        ? routeOptions
        : typeof source === "function"
          ? await source()
          : source;
    return buildVoiceRealCallProfileHistoryReport({
      ...routeOptions,
      ...sourceOptions,
    });
  };

  routes.get(path, async () =>
    Response.json(await loadReport(), { headers: options.headers }),
  );

  if (htmlPath !== false) {
    routes.get(htmlPath, async () => {
      const report = await loadReport();
      return new Response(
        renderVoiceRealCallProfileHistoryHTML(report, title),
        {
          headers: {
            "content-type": "text/html; charset=utf-8",
            ...Object.fromEntries(new Headers(options.headers)),
          },
        },
      );
    });
  }

  if (markdownPath !== false) {
    routes.get(markdownPath, async () => {
      const report = await loadReport();
      return new Response(
        renderVoiceRealCallProfileHistoryMarkdown(report, title),
        {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            ...Object.fromEntries(new Headers(options.headers)),
          },
        },
      );
    });
  }

  return routes;
};

const realCallProfileActionPaths: Record<
  VoiceRealCallProfileRecoveryActionId,
  string
> = {
  "collect-browser-proof": "/collect-browser-proof",
  "collect-phone-proof": "/collect-phone-proof",
  "collect-reconnect-proof": "/collect-reconnect-proof",
  "collect-provider-role-evidence": "/collect-provider-role-evidence",
  refresh: "/refresh",
};

const loadVoiceRealCallProfileHistoryRouteReport = async (
  options:
    | VoiceRealCallProfileHistoryRoutesOptions
    | VoiceRealCallProfileRecoveryActionRoutesOptions,
) => {
  const { source, ...routeOptions } = options;
  const sourceOptions =
    source === undefined
      ? routeOptions
      : typeof source === "function"
        ? await source()
        : source;
  return buildVoiceRealCallProfileHistoryReport({
    ...routeOptions,
    ...sourceOptions,
  });
};

export const createVoiceRealCallProfileRecoveryActionRoutes = (
  options: VoiceRealCallProfileRecoveryActionRoutesOptions = {},
) => {
  const path = options.path ?? "/api/voice/real-call-profile-history";
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-real-call-profile-recovery-actions",
  });
  const actionPath = (actionId: VoiceRealCallProfileRecoveryActionId) =>
    `${path}${realCallProfileActionPaths[actionId]}`;
  const loadReport = () => loadVoiceRealCallProfileHistoryRouteReport(options);
  const asyncActionIds = new Set(options.asyncActionIds ?? []);
  const listActions = async () => {
    const report = await loadReport();
    const actions = buildVoiceRealCallProfileRecoveryActions(report, {
      ...options,
      browserProofHref:
        options.browserProofHref ?? actionPath("collect-browser-proof"),
      phoneProofHref:
        options.phoneProofHref ?? actionPath("collect-phone-proof"),
      reconnectProofHref:
        options.reconnectProofHref ?? actionPath("collect-reconnect-proof"),
      sourceHref:
        options.sourceHref ?? actionPath("collect-provider-role-evidence"),
      productionReadinessHref:
        options.productionReadinessHref ?? actionPath("refresh"),
    }).map((action) => ({
      ...action,
      href:
        action.id === "collect-browser-proof"
          ? appendRealCallRecoveryActionQuery(
              actionPath("collect-browser-proof"),
              { profileId: action.profileId },
            )
          : action.id === "collect-phone-proof"
            ? appendRealCallRecoveryActionQuery(
                actionPath("collect-phone-proof"),
                { profileId: action.profileId },
              )
            : action.id === "collect-reconnect-proof"
              ? appendRealCallRecoveryActionQuery(
                  actionPath("collect-reconnect-proof"),
                  { profileId: action.profileId },
                )
              : action.id === "collect-provider-role-evidence"
                ? actionPath("collect-provider-role-evidence")
                : action.href,
      method:
        action.id === "refresh" &&
        (action.label === "Open real-call profile history" ||
          action.label === "Open operations records")
          ? "GET"
          : "POST",
    }));
    return { actions, generatedAt: new Date().toISOString(), report };
  };
  const runActionHandler = async (
    actionId: VoiceRealCallProfileRecoveryActionId,
    report: VoiceRealCallProfileHistoryReport,
    profileId?: string,
  ) => {
    const handler = options.handlers?.[actionId];
    if (!handler) {
      return undefined;
    }
    return await handler({ actionId, profileId, report });
  };
  const runActionAsJob = async (
    actionId: VoiceRealCallProfileRecoveryActionId,
    report: VoiceRealCallProfileHistoryReport,
    profileId?: string,
  ) => {
    const job = await options.jobStore?.create({
      actionId,
      message: `Queued real-call profile recovery action: ${actionId}${profileId ? ` for ${profileId}` : ""}.`,
      status: "queued",
    });
    if (!job) {
      return undefined;
    }
    queueMicrotask(() => {
      void (async () => {
        const startedAt = new Date().toISOString();
        await options.jobStore?.update(job.id, {
          message: `Running real-call profile recovery action: ${actionId}.`,
          startedAt,
          status: "running",
          updatedAt: startedAt,
        });
        try {
          const result = await runActionHandler(actionId, report, profileId);
          const completedAt = new Date().toISOString();
          const ok = result?.ok ?? true;
          const status =
            result?.jobStatus ??
            (result?.status === "fail" || ok === false ? "fail" : "pass");
          await options.jobStore?.update(job.id, {
            completedAt,
            message:
              result?.message ??
              `Completed real-call profile recovery action: ${actionId}.`,
            ok,
            report: result?.report,
            status,
            updatedAt: completedAt,
          });
        } catch (error) {
          const completedAt = new Date().toISOString();
          await options.jobStore?.update(job.id, {
            completedAt,
            message:
              error instanceof Error
                ? error.message
                : `Failed real-call profile recovery action: ${actionId}.`,
            ok: false,
            status: "fail",
            updatedAt: completedAt,
          });
        }
      })();
    });
    return {
      actionId,
      generatedAt: new Date().toISOString(),
      job,
      jobId: job.id,
      jobStatus: job.status,
      message: job.message,
      ok: true,
      status: "pass" as VoiceProofTrendStatus,
    } satisfies VoiceRealCallProfileRecoveryActionResult;
  };
  const runAction = async (
    actionId: VoiceRealCallProfileRecoveryActionId,
    profileId?: string,
  ) => {
    const report = await loadReport();
    const handler = options.handlers?.[actionId];
    if (!handler) {
      return {
        actionId,
        generatedAt: new Date().toISOString(),
        message: `No handler configured for real-call profile recovery action: ${actionId}.`,
        ok: false,
        status: "fail" as VoiceProofTrendStatus,
      };
    }
    if (options.jobStore && asyncActionIds.has(actionId)) {
      const queued = await runActionAsJob(actionId, report, profileId);
      if (queued) {
        return queued;
      }
    }
    const result = await runActionHandler(actionId, report, profileId);
    return {
      actionId,
      generatedAt: new Date().toISOString(),
      job: result?.job,
      jobId: result?.jobId,
      jobStatus: result?.jobStatus,
      message: result?.message,
      ok: result?.ok ?? true,
      report: result?.report,
      status: result?.status ?? "pass",
    } satisfies VoiceRealCallProfileRecoveryActionResult;
  };

  routes.get(`${path}/actions`, async () =>
    Response.json(await listActions(), { headers: options.headers }),
  );

  routes.get(
    `${path}/actions/jobs`,
    async ({
      query,
      set,
    }: {
      query: Record<string, string | undefined>;
      set: { status?: number | string };
    }) => {
      if (!options.jobStore?.list) {
        set.status = 501;
        return Response.json(
          {
            jobs: [],
            message:
              "No real-call profile recovery job list store is configured.",
            ok: false,
          },
          { headers: options.headers },
        );
      }
      const actionId = Object.keys(realCallProfileActionPaths).includes(
        query.actionId ?? "",
      )
        ? (query.actionId as VoiceRealCallProfileRecoveryActionId)
        : undefined;
      const status = ["fail", "pass", "queued", "running"].includes(
        query.status ?? "",
      )
        ? (query.status as VoiceRealCallProfileRecoveryJobStatus)
        : undefined;
      const limit = Number(query.limit);
      const jobs = await options.jobStore.list({
        actionId,
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
        status,
      });
      return Response.json(
        {
          generatedAt: new Date().toISOString(),
          jobs,
          ok: true,
        },
        { headers: options.headers },
      );
    },
  );

  routes.get(
    `${path}/actions/:jobId`,
    async ({
      params,
      set,
    }: {
      params: Record<string, string | undefined>;
      set: { status?: number | string };
    }) => {
      const jobId = params.jobId ?? "";
      const job = await options.jobStore?.get(jobId);
      if (!job) {
        set.status = 404;
        return Response.json(
          {
            jobId,
            message: `No real-call profile recovery job found for id: ${jobId}.`,
            ok: false,
          },
          { headers: options.headers },
        );
      }
      return Response.json(
        { job, ok: job.ok ?? job.status !== "fail" },
        {
          headers: options.headers,
        },
      );
    },
  );

  for (const actionId of Object.keys(
    realCallProfileActionPaths,
  ) as VoiceRealCallProfileRecoveryActionId[]) {
    routes.post(
      actionPath(actionId),
      async ({
        query,
        set,
      }: {
        query: Record<string, string | undefined>;
        set: { status?: number | string };
      }) => {
        const profileId = query.profileId?.trim() || undefined;
        const result = await runAction(actionId, profileId);
        if (!result.ok) {
          set.status = 501;
        }
        return Response.json(result, { headers: options.headers });
      },
    );
  }

  return routes;
};

export const createVoiceProofTrendRoutes = (
  options: VoiceProofTrendRoutesOptions,
) => {
  const path = options.path ?? "/api/voice/proof-trends";
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-proof-trends",
  });

  routes.get(path, async () => {
    const value =
      options.source !== undefined
        ? typeof options.source === "function"
          ? await options.source()
          : options.source
        : options.jsonPath
          ? await readVoiceProofTrendReportFile(options.jsonPath, {
              maxAgeMs: options.maxAgeMs,
            })
          : buildEmptyVoiceProofTrendReport("", options.maxAgeMs);

    return Response.json(
      normalizeVoiceProofTrendReport(value, {
        maxAgeMs: options.maxAgeMs,
        source: options.jsonPath,
      }),
      { headers: options.headers },
    );
  });

  return routes;
};

export const formatVoiceProofTrendAge = (ageMs: unknown) => {
  if (typeof ageMs !== "number" || !Number.isFinite(ageMs)) {
    return "unknown";
  }

  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) {
    return "less than 1m";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ${minutes % 60}m`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
};
