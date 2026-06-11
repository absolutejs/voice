import { resolveAudioConditioningConfig } from "./audioConditioning";
import { Elysia } from "elysia";
import { resolve } from "node:path";
import {
  buildVoiceHTMXResponse,
  resolveVoiceHTMXRenderers,
  resolveVoiceHTMXTargets,
} from "./htmx";
import { resolveLogger } from "./logger";
import { resolveVoiceRuntimePreset } from "./presets";
import { recordVoiceRuntimeOps } from "./runtimeOps";
import { createId } from "./store";
import { createVoiceSession } from "./session";
import { resolveTurnDetectionConfig } from "./turnProfiles";
import { applyVoiceProfileSwitchGuard } from "./profileSwitchRecommendation";
import { createVoiceAssistantHealthRoutes } from "./assistantHealth";
import { createVoiceAuditDeliveryRoutes } from "./auditDeliveryRoutes";
import { createVoiceAuditTrailRoutes } from "./auditRoutes";
import { createVoiceBargeInRoutes } from "./bargeInRoutes";
import { createVoiceBrowserCallProfileRoutes } from "./browserCallProfiles";
import { createVoiceBrowserMediaRoutes } from "./browserMediaRoutes";
import { createVoiceCallDebuggerRoutes } from "./callDebugger";
import { createVoiceCampaignRoutes } from "./campaign";
import { createVoiceCompetitiveCoverageRoutes } from "./competitiveCoverage";
import { createVoiceDataControlRoutes } from "./dataControl";
import { createVoiceDeliveryRuntimeRoutes } from "./deliveryRuntime";
import { createVoiceDeliverySinkRoutes } from "./deliverySinkRoutes";
import { createVoiceDemoReadyRoutes } from "./demoReadyRoutes";
import { createVoiceDiagnosticsRoutes } from "./diagnosticsRoutes";
import { createVoiceEvalRoutes } from "./evalRoutes";
import { createVoiceGuardrailRoutes } from "./guardrails";
import { createVoiceHandoffHealthRoutes } from "./handoffHealth";
import { createVoiceHTMXDashboardRoutes } from "./htmxDashboardRoutes";
import { createVoiceIncidentBundleRoutes } from "./incidentBundle";
import { createVoiceIncidentTimelineRoutes } from "./incidentTimeline";
import { createVoiceLiveLatencyRoutes } from "./liveLatency";
import { createVoiceLiveOpsRoutes } from "./liveOps";
import { createVoiceMediaPipelineRoutes } from "./mediaPipelineRoutes";
import { createVoiceLiveMonitorRoutes } from "./monitor";
import {
  createVoiceObservabilityExportReplayRoutes,
  createVoiceObservabilityExportRoutes,
} from "./observabilityExport";
import { createVoiceOperationalStatusRoutes } from "./operationalStatus";
import { createVoiceOperationsRecordRoutes } from "./operationsRecord";
import { createVoiceOpsActionAuditRoutes } from "./opsActionAuditRoutes";
import { createVoiceOpsConsoleRoutes } from "./opsConsoleRoutes";
import { createVoiceOpsRecoveryRoutes } from "./opsRecovery";
import { createVoiceOpsStatusRoutes } from "./opsStatusRoutes";
import { createVoiceOpsWebhookReceiverRoutes } from "./opsWebhook";
import { createVoiceOutcomeContractRoutes } from "./outcomeContract";
import { createVoicePhoneAgentProductionSmokeRoutes } from "./phoneAgentProductionSmoke";
import { createVoicePlatformCoverageRoutes } from "./platformCoverage";
import { createVoicePostCallAnalysisRoutes } from "./postCallAnalysis";
import { createVoiceProductionReadinessRoutes } from "./productionReadiness";
import {
  createVoiceProfileSwitchLiveDecisionRoutes,
  createVoiceProfileSwitchPolicyProofRoutes,
  createVoiceProfileSwitchReadinessRoutes,
} from "./profileSwitchRecommendation";
import { createVoiceProofPackRoutes } from "./proofPack";
import {
  createVoiceProofTrendRecommendationRoutes,
  createVoiceProofTrendRoutes,
  createVoiceRealCallEvidenceRuntimeRoutes,
  createVoiceRealCallProfileHistoryRoutes,
  createVoiceRealCallProfileRecoveryActionRoutes,
} from "./proofTrends";
import { createVoiceProviderCapabilityRoutes } from "./providerCapabilities";
import { createVoiceProviderDecisionTraceRoutes } from "./providerDecisionTraces";
import { createVoiceProviderHealthRoutes } from "./providerHealth";
import { createVoiceProviderOrchestrationRoutes } from "./providerOrchestration";
import { createVoiceProviderSloRoutes } from "./providerSlo";
import { createVoiceProviderContractMatrixRoutes } from "./providerStackRecommendations";
import { createVoiceQualityRoutes } from "./qualityRoutes";
import { createVoiceRealtimeChannelRoutes } from "./realtimeChannel";
import { createVoiceRealtimeProviderContractRoutes } from "./realtimeProviderContracts";
import {
  createVoiceReconnectContractRoutes,
  createVoiceReconnectProofRoutes,
} from "./reconnectContract";
import { createVoiceResilienceRoutes } from "./resilienceRoutes";
import { createVoiceSessionObservabilityRoutes } from "./sessionObservability";
import {
  createVoiceSessionListRoutes,
  createVoiceSessionReplayRoutes,
} from "./sessionReplay";
import { createVoiceSessionSnapshotRoutes } from "./sessionSnapshot";
import { createVoiceSimulationSuiteRoutes } from "./simulationSuite";
import {
  createVoiceSloCalibrationRoutes,
  createVoiceSloReadinessThresholdRoutes,
} from "./sloCalibration";
import { createVoiceTelephonyCarrierMatrixRoutes } from "../telephony/matrix";
import { createVoiceTelephonyWebhookSecurityRoutes } from "../telephony/security";
import { createVoiceTelephonyMediaRoutes } from "./telephonyMediaRoutes";
import { createVoiceTelephonyWebhookRoutes } from "./telephonyOutcome";
import { createVoiceToolContractRoutes } from "./toolContract";
import { createVoiceTraceDeliveryRoutes } from "./traceDeliveryRoutes";
import { createVoiceTraceTimelineRoutes } from "./traceTimeline";
import { createVoiceTurnLatencyRoutes } from "./turnLatency";
import { createVoiceTurnQualityRoutes } from "./turnQuality";
import {
  createVoiceMonitorRoutes,
  createVoiceMonitorRunnerRoutes,
} from "./voiceMonitoring";
import type {
  AudioChunk,
  VoiceClientMessage,
  VoiceLexiconEntry,
  VoiceOnTurnObjectHandler,
  VoicePhraseHint,
  VoiceResolvedSTTFallbackConfig,
  VoicePluginConfig,
  VoiceRouteResult,
  VoiceSessionHandle,
  VoiceSessionRecord,
  VoiceTurnRecord,
} from "./types";

type VoiceRuntime = {
  activeSessions: Map<
    string,
    VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>
  >;
  logger: ReturnType<typeof resolveLogger>;
  profileSwitchGuardAutoSwitchCounts: Map<string, number>;
  profileSwitchGuardedSessions: Set<string>;
  socketSessions: WeakMap<
    object,
    {
      scenarioId: string | null;
      sessionId: string;
    }
  >;
};

const resolveQueryScenario = (query: Record<string, unknown> | undefined) => {
  if (typeof query?.scenarioId === "string" && query.scenarioId.trim()) {
    return query.scenarioId.trim();
  }

  if (typeof query?.mode === "string" && query.mode.trim()) {
    return query.mode.trim();
  }

  return null;
};

const HTMX_BOOTSTRAP_DIST_CANDIDATES = [
  resolve(import.meta.dir, "client", "htmxBootstrap.js"),
  resolve(import.meta.dir, "..", "dist", "client", "htmxBootstrap.js"),
];

const HTMX_BOOTSTRAP_SOURCE_CANDIDATES = [
  resolve(import.meta.dir, "client", "htmxBootstrap.ts"),
  resolve(import.meta.dir, "..", "src", "client", "htmxBootstrap.ts"),
];

const loadHTMXBootstrap = (() => {
  let cached: Promise<string> | null = null;

  return () => {
    if (cached) {
      return cached;
    }

    cached = (async () => {
      for (const candidate of HTMX_BOOTSTRAP_DIST_CANDIDATES) {
        const asset = Bun.file(candidate);
        if (await asset.exists()) {
          return await asset.text();
        }
      }

      for (const candidate of HTMX_BOOTSTRAP_SOURCE_CANDIDATES) {
        const asset = Bun.file(candidate);
        if (!(await asset.exists())) {
          continue;
        }

        const build = await Bun.build({
          entrypoints: [candidate],
          format: "esm",
          minify: true,
          target: "browser",
        });

        if (!build.success || build.outputs.length === 0) {
          const log = build.logs.map((entry) => entry.message).join("\n");
          throw new Error(
            `Failed to build the voice HTMX bootstrap bundle.${log ? `\n${log}` : ""}`,
          );
        }

        return await build.outputs[0]!.text();
      }

      throw new Error("Unable to locate the voice HTMX bootstrap client.");
    })();

    return cached;
  };
})();

const isArrayBufferView = (value: unknown): value is ArrayBufferView =>
  typeof value === "object" && value !== null && ArrayBuffer.isView(value);

const resolveSTTFallbackConfig = (
  config?: VoicePluginConfig["sttFallback"],
): VoiceResolvedSTTFallbackConfig | undefined => {
  if (!config) {
    return undefined;
  }

  return {
    adapter: config.adapter,
    completionTimeoutMs: config.completionTimeoutMs ?? 2_500,
    confidenceThreshold: config.confidenceThreshold ?? 0.6,
    maxAttemptsPerTurn: config.maxAttemptsPerTurn ?? 1,
    minTextLength: config.minTextLength ?? 2,
    replayWindowMs: config.replayWindowMs ?? 8_000,
    settleMs: config.settleMs ?? 220,
    trigger: config.trigger ?? "empty-or-low-confidence",
  };
};

const isVoiceClientMessage = (value: unknown): value is VoiceClientMessage => {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }

  switch (value.type) {
    case "call_control":
      if (!("action" in value)) {
        return false;
      }

      if (
        value.action !== "complete" &&
        value.action !== "escalate" &&
        value.action !== "no-answer" &&
        value.action !== "transfer" &&
        value.action !== "voicemail"
      ) {
        return false;
      }

      return (
        (!("metadata" in value) ||
          value.metadata === undefined ||
          (value.metadata !== null && typeof value.metadata === "object")) &&
        (!("reason" in value) ||
          value.reason === undefined ||
          typeof value.reason === "string") &&
        (!("target" in value) ||
          value.target === undefined ||
          typeof value.target === "string")
      );
    case "close":
      return true;
    case "end_turn":
      return true;
    case "ping":
      return true;
    case "start":
      return (
        (!("sessionId" in value) || typeof value.sessionId === "string") &&
        (!("scenarioId" in value) || typeof value.scenarioId === "string")
      );
    default:
      return false;
  }
};

const parseClientMessage = (raw: unknown) => {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;

      return isVoiceClientMessage(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  if (isVoiceClientMessage(raw)) {
    return raw;
  }

  return null;
};

const resolveSessionId = (runtime: VoiceRuntime, ws: { data?: unknown }) => {
  const query =
    ws.data && typeof ws.data === "object" && "query" in ws.data
      ? (ws.data.query as Record<string, unknown> | undefined)
      : undefined;
  const existing = runtime.socketSessions.get(ws);
  const providedSessionId =
    typeof query?.sessionId === "string" && query.sessionId.trim()
      ? query.sessionId.trim()
      : (existing?.sessionId ?? createId());
  const scenarioId =
    resolveQueryScenario(query) ?? existing?.scenarioId ?? null;

  const resolved = {
    scenarioId,
    sessionId: providedSessionId,
  };

  runtime.socketSessions.set(ws, resolved);

  return resolved;
};

const resolveMaybeFunction = async <TInput, TValue>(
  value:
    | TValue
    | ((input: TInput) => Promise<TValue | undefined> | TValue | undefined)
    | undefined,
  input: TInput,
) =>
  typeof value === "function"
    ? await (
        value as (
          input: TInput,
        ) => Promise<TValue | undefined> | TValue | undefined
      )(input)
    : value;

const toAudioChunk = (raw: unknown): AudioChunk | null => {
  if (raw instanceof ArrayBuffer) {
    return raw;
  }

  if (isArrayBufferView(raw)) {
    return raw;
  }

  return null;
};

const createSocketAdapter = (ws: {
  close: (code?: number, reason?: string) => void;
  send: (data: string | Uint8Array | ArrayBuffer) => unknown;
}) => ({
  close: async (code?: number, reason?: string) => {
    ws.close(code, reason);
  },
  send: async (data: string | Uint8Array | ArrayBuffer) => {
    ws.send(data);
  },
});

const normalizeOnTurn = <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  handler: VoicePluginConfig<TContext, TSession, TResult>["onTurn"],
): VoiceOnTurnObjectHandler<TContext, TSession, TResult> => {
  if (handler.length > 1) {
    const directHandler = handler as (
      session: TSession,
      turn: VoiceTurnRecord,
      api: VoiceSessionHandle<TContext, TSession, TResult>,
      context: TContext,
    ) =>
      | Promise<VoiceRouteResult<TResult> | void>
      | VoiceRouteResult<TResult>
      | void;

    return async ({ context, session, turn, api }) =>
      directHandler(session, turn, api, context);
  }

  return handler as VoiceOnTurnObjectHandler<TContext, TSession, TResult>;
};

const resolveSessionOptions = <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  config: VoicePluginConfig<TContext, TSession, TResult>,
) => {
  const preset = resolveVoiceRuntimePreset(config.preset);

  return {
    audioConditioning:
      config.audioConditioning !== undefined
        ? resolveAudioConditioningConfig(config.audioConditioning)
        : preset.audioConditioning,
    noiseSuppressor: config.noiseSuppressor,
    noiseSuppressorFormat: config.noiseSuppressorFormat,
    costTelemetry: config.costTelemetry,
    sttFallback: resolveSTTFallbackConfig(config.sttFallback),
    logger: config.logger,
    reconnect: {
      maxAttempts: config.reconnect?.maxAttempts ?? 10,
      strategy: config.reconnect?.strategy ?? "resume-last-turn",
      timeout: config.reconnect?.timeout ?? 30_000,
    },
    sttLifecycle: config.sttLifecycle ?? preset.sttLifecycle,
    turnDetection: resolveTurnDetectionConfig({
      ...preset.turnDetection,
      ...config.turnDetection,
    }),
  };
};

const normalizePhraseHints = (hints: VoicePhraseHint[] | void | undefined) =>
  (hints ?? [])
    .map((hint) => ({
      ...hint,
      aliases: hint.aliases?.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
      text: hint.text.trim(),
    }))
    .filter((hint) => hint.text.length > 0);

const normalizeLexicon = (entries: VoiceLexiconEntry[] | void | undefined) =>
  (entries ?? [])
    .map((entry) => ({
      ...entry,
      aliases: entry.aliases?.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
      language:
        typeof entry.language === "string" && entry.language.trim().length > 0
          ? entry.language.trim()
          : undefined,
      pronunciation:
        typeof entry.pronunciation === "string" &&
        entry.pronunciation.trim().length > 0
          ? entry.pronunciation.trim()
          : undefined,
      text: entry.text.trim(),
    }))
    .filter((entry) => entry.text.length > 0);

const resolvePhraseHints = async <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  config: VoicePluginConfig<TContext, TSession, TResult>,
  input: {
    context: TContext;
    scenarioId?: string;
    sessionId: string;
  },
) => {
  if (!config.phraseHints) {
    return [] as VoicePhraseHint[];
  }

  if (typeof config.phraseHints === "function") {
    return normalizePhraseHints(await config.phraseHints(input));
  }

  return normalizePhraseHints(config.phraseHints);
};

const resolveLexicon = async <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  config: VoicePluginConfig<TContext, TSession, TResult>,
  input: {
    context: TContext;
    scenarioId?: string;
    sessionId: string;
  },
) => {
  if (!config.lexicon) {
    return [] as VoiceLexiconEntry[];
  }

  if (typeof config.lexicon === "function") {
    return normalizeLexicon(await config.lexicon(input));
  }

  return normalizeLexicon(config.lexicon);
};

const resolveProfileSwitchGuard = async <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  config: VoicePluginConfig<TContext, TSession, TResult>,
  runtime: VoiceRuntime,
  input: {
    context: TContext;
    scenarioId?: string;
    sessionId: string;
  },
) => {
  const guard = config.profileSwitchGuard;
  if (!guard || runtime.profileSwitchGuardedSessions.has(input.sessionId)) {
    return undefined;
  }

  runtime.profileSwitchGuardedSessions.add(input.sessionId);
  const resolverInput = input;
  const defaults = await resolveMaybeFunction(guard.defaults, resolverInput);
  if (!defaults) {
    throw new Error(
      "voice profileSwitchGuard requires measured profile defaults.",
    );
  }
  const observed = await resolveMaybeFunction(guard.observed, resolverInput);
  const currentProfileId = await resolveMaybeFunction(
    guard.currentProfileId,
    resolverInput,
  );
  const metadata = await resolveMaybeFunction(guard.metadata, resolverInput);
  const minConfidence = await resolveMaybeFunction(
    guard.minConfidence,
    resolverInput,
  );
  const maxAutoSwitchesPerSession = await resolveMaybeFunction(
    guard.maxAutoSwitchesPerSession,
    resolverInput,
  );
  const allowedProfileIds = await resolveMaybeFunction(
    guard.allowedProfileIds,
    resolverInput,
  );
  const blockedProfileIds = await resolveMaybeFunction(
    guard.blockedProfileIds,
    resolverInput,
  );
  const mode = await resolveMaybeFunction(guard.mode, resolverInput);
  const decision = await applyVoiceProfileSwitchGuard({
    actor: guard.actor,
    allowedProfileIds,
    audit: guard.audit,
    autoSwitchCount:
      runtime.profileSwitchGuardAutoSwitchCounts.get(input.sessionId) ?? 0,
    blockedProfileIds,
    defaultProfileId: guard.defaultProfileId,
    defaults,
    maxAutoSwitchesPerSession,
    metadata,
    minConfidence,
    mode,
    observed: {
      ...observed,
      currentProfileId: observed?.currentProfileId ?? currentProfileId,
    },
    sessionId: input.sessionId,
  });
  if (decision.autoApplied) {
    runtime.profileSwitchGuardAutoSwitchCounts.set(
      input.sessionId,
      decision.autoSwitchCount + 1,
    );
  }

  await guard.onDecision?.({
    context: input.context,
    decision,
    scenarioId: input.scenarioId,
    sessionId: input.sessionId,
  });

  const trace =
    guard.trace === false ? undefined : (guard.trace ?? config.trace);
  if (trace) {
    await trace.append({
      at: Date.now(),
      metadata: {
        ...metadata,
        source: "profile-switch-guard",
      },
      payload: {
        action: decision.action,
        autoApplied: decision.autoApplied,
        autoSwitchCount: decision.autoSwitchCount,
        blockedByPolicy: decision.blockedByPolicy,
        confidence: decision.confidence,
        maxAutoSwitchesPerSession: decision.maxAutoSwitchesPerSession,
        minConfidence: decision.minConfidence,
        mode: decision.mode,
        previousProfileId: decision.previousProfileId,
        reason: decision.reason,
        recommendedProfileId: decision.recommendedProfileId,
        selectedProfileId: decision.selectedProfileId,
        status: decision.recommendation.status,
      },
      scenarioId: input.scenarioId,
      sessionId: input.sessionId,
      type: "provider.decision",
    });
  }

  return decision;
};

export const voice = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  config: VoicePluginConfig<TContext, TSession, TResult>,
) => {
  if (!config.stt && !config.realtime) {
    throw new Error("voice requires either an stt or realtime adapter.");
  }

  const monitorBindings = new Map<
    string,
    ReturnType<NonNullable<VoicePluginConfig["monitor"]>["registerSession"]>
  >();
  const runtime: VoiceRuntime = {
    activeSessions: new Map(),
    logger: resolveLogger(config.logger),
    profileSwitchGuardAutoSwitchCounts: new Map(),
    profileSwitchGuardedSessions: new Set(),
    socketSessions: new WeakMap(),
  };
  const { monitor } = config;
  const registerMonitorSession = (
    sessionId: string,
    handle: VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>,
  ) => {
    if (!monitor) return;
    const existing = monitorBindings.get(sessionId);
    if (existing) {
      try {
        existing.deregister("superseded");
      } catch {}
      monitorBindings.delete(sessionId);
    }
    try {
      const binding = monitor.registerSession({ handle, sessionId });
      monitorBindings.set(sessionId, binding);
    } catch (error) {
      runtime.logger.warn?.(
        `[voice] failed to register session "${sessionId}" with monitor runtime: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };
  const deregisterMonitorSession = (sessionId: string, reason?: string) => {
    const binding = monitorBindings.get(sessionId);
    if (!binding) return;
    monitorBindings.delete(sessionId);
    try {
      binding.deregister(reason);
    } catch (error) {
      runtime.logger.warn?.(
        `[voice] failed to deregister monitor binding for session "${sessionId}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };
  const buildSocketAdapter = (
    ws: {
      close: (code?: number, reason?: string) => void;
      send: (data: string | Uint8Array | ArrayBuffer) => unknown;
    },
    sessionId: string,
  ) => {
    if (!monitor) return createSocketAdapter(ws);

    return {
      close: async (code?: number, reason?: string) => {
        ws.close(code, reason);
      },
      send: async (data: string | Uint8Array | ArrayBuffer) => {
        if (typeof data !== "string") {
          const binding = monitorBindings.get(sessionId);
          if (binding) {
            try {
              binding.emitAudio(data);
            } catch (error) {
              runtime.logger.warn?.(
                `[voice] monitor emitAudio failed for session "${sessionId}": ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
          }
        }
        ws.send(data);
      },
    };
  };
  const onTurn = normalizeOnTurn(config.onTurn);
  const sessionOptions = resolveSessionOptions(config);

  const htmxOptions =
    config.htmx && typeof config.htmx === "object" ? config.htmx : undefined;
  const htmxRoute = htmxOptions?.route ?? `${config.path}/htmx/session`;
  const htmxBootstrapRoute =
    htmxOptions?.bootstrapRoute ?? `${config.path}/htmx/bootstrap.js`;
  const htmxRenderers = resolveVoiceHTMXRenderers<TSession, TResult>(
    config.htmx && config.htmx !== true ? config.htmx : undefined,
  );
  const htmxTargets = resolveVoiceHTMXTargets(htmxOptions?.targets);
  const createManagedSession = async (
    ws: {
      data?: unknown;
      close: (code?: number, reason?: string) => void;
      send: (data: string | Uint8Array | ArrayBuffer) => unknown;
    },
    sessionId: string,
    scenarioId?: string,
  ) => {
    const context = ws.data as TContext;
    const profileSwitchDecision = await resolveProfileSwitchGuard(
      config,
      runtime,
      {
        context,
        scenarioId,
        sessionId,
      },
    );
    const phraseHints = await resolvePhraseHints(config, {
      context,
      scenarioId,
      sessionId,
    });
    const lexicon = await resolveLexicon(config, {
      context,
      scenarioId,
      sessionId,
    });

    return createVoiceSession<TContext, TSession, TResult>({
      audioConditioning: sessionOptions.audioConditioning,
      noiseSuppressor: sessionOptions.noiseSuppressor,
      noiseSuppressorFormat: sessionOptions.noiseSuppressorFormat,
      context,
      id: sessionId,
      greeting: config.greeting,
      resumeGreeting: config.resumeGreeting,
      handoff: config.handoff,
      languageStrategy: config.languageStrategy,
      lexicon,
      liveOps: config.liveOps,
      logger: sessionOptions.logger,
      phraseHints,
      reconnect: sessionOptions.reconnect,
      route: {
        correctTurn: config.correctTurn,
        onCallStart: config.onCallStart,
        onComplete: config.onComplete,
        onError: config.onError,
        onEscalation: config.onEscalation,
        onNoAnswer: config.onNoAnswer,
        onSession: config.onSession,
        onTransfer: config.onTransfer,
        onTurn,
        speculate: config.speculate,
        onVoicemail: config.onVoicemail,
        onCallEnd: async (input) => {
          let hookError: unknown;

          try {
            await config.onCallEnd?.(input);
          } catch (error) {
            hookError = error;
          }

          try {
            await recordVoiceRuntimeOps({
              api: input.api,
              config: config.ops,
              context: input.context,
              disposition: input.disposition,
              metadata: input.metadata,
              reason: input.reason,
              session: input.session,
              target: input.target,
            });
          } finally {
            if (hookError) {
              throw hookError;
            }
          }
        },
      },
      sessionMetadata:
        profileSwitchDecision &&
        config.profileSwitchGuard?.sessionMetadataKey !== false
          ? {
              [config.profileSwitchGuard?.sessionMetadataKey ??
              "profileSwitchGuard"]: profileSwitchDecision,
            }
          : undefined,
      scenarioId,
      socket: createSocketAdapter(ws),
      store: config.session,
      trace: config.trace,
      realtime: config.realtime,
      realtimeInputFormat: config.realtimeInputFormat,
      stt: config.stt,
      sttFallback: sessionOptions.sttFallback,
      sttLifecycle: sessionOptions.sttLifecycle,
      ...(config.semanticTurnDetector
        ? { semanticTurnDetector: config.semanticTurnDetector }
        : {}),
      ...(config.bargeInMinPartialWords !== undefined
        ? { bargeInMinPartialWords: config.bargeInMinPartialWords }
        : {}),
      ...(config.fillerPhrases ? { fillerPhrases: config.fillerPhrases } : {}),
      ...(config.fillerDelayMs !== undefined
        ? { fillerDelayMs: config.fillerDelayMs }
        : {}),
      ...(config.fillerFor ? { fillerFor: config.fillerFor } : {}),
      ...(config.fillerForTimeoutMs !== undefined
        ? { fillerForTimeoutMs: config.fillerForTimeoutMs }
        : {}),
      ...(config.backchannel ? { backchannel: config.backchannel } : {}),
      ...(config.defaultSilentTurnAck !== undefined
        ? { defaultSilentTurnAck: config.defaultSilentTurnAck }
        : {}),
      ...(config.routeOnTurnTimeoutMs !== undefined
        ? { routeOnTurnTimeoutMs: config.routeOnTurnTimeoutMs }
        : {}),
      tts: config.tts,
      turnDetection: sessionOptions.turnDetection,
    });
  };

  // Type-safety for surfaces is enforced on the VoicePluginConfig keys
  // (each is a VoiceSurfaceConfig<…>); the internal mount is intentionally
  // loose so heterogeneous/generic route factories compose uniformly.
  const mountSurface = (
    app: Elysia,
    value: unknown,
    factory: (options: never) => Elysia,
  ): Elysia => {
    if (value === undefined || value === false) {
      return app;
    }
    const options = value === true ? {} : value;

    return app.use((factory as (options: unknown) => Elysia)(options));
  };

  const surfaceRoutes = (): Elysia => {
    let app: Elysia = new Elysia();
    app = mountSurface(
      app,
      config.assistantHealth,
      createVoiceAssistantHealthRoutes,
    );
    app = mountSurface(
      app,
      config.auditDelivery,
      createVoiceAuditDeliveryRoutes,
    );
    app = mountSurface(app, config.auditTrail, createVoiceAuditTrailRoutes);
    app = mountSurface(app, config.bargeIn, createVoiceBargeInRoutes);
    app = mountSurface(
      app,
      config.browserCallProfile,
      createVoiceBrowserCallProfileRoutes,
    );
    app = mountSurface(app, config.browserMedia, createVoiceBrowserMediaRoutes);
    app = mountSurface(app, config.callDebugger, createVoiceCallDebuggerRoutes);
    app = mountSurface(app, config.campaign, createVoiceCampaignRoutes);
    app = mountSurface(
      app,
      config.competitiveCoverage,
      createVoiceCompetitiveCoverageRoutes,
    );
    app = mountSurface(app, config.dataControl, createVoiceDataControlRoutes);
    app = mountSurface(
      app,
      config.deliveryRuntime,
      createVoiceDeliveryRuntimeRoutes,
    );
    app = mountSurface(app, config.deliverySink, createVoiceDeliverySinkRoutes);
    app = mountSurface(app, config.demoReady, createVoiceDemoReadyRoutes);
    app = mountSurface(app, config.diagnostics, createVoiceDiagnosticsRoutes);
    app = mountSurface(app, config.eval, createVoiceEvalRoutes);
    app = mountSurface(app, config.guardrail, createVoiceGuardrailRoutes);
    app = mountSurface(
      app,
      config.handoffHealth,
      createVoiceHandoffHealthRoutes,
    );
    app = mountSurface(
      app,
      config.htmxDashboard,
      createVoiceHTMXDashboardRoutes,
    );
    app = mountSurface(
      app,
      config.incidentBundle,
      createVoiceIncidentBundleRoutes,
    );
    app = mountSurface(
      app,
      config.incidentTimeline,
      createVoiceIncidentTimelineRoutes,
    );
    app = mountSurface(app, config.liveLatency, createVoiceLiveLatencyRoutes);
    app = mountSurface(app, config.liveMonitor, createVoiceLiveMonitorRoutes);
    app = mountSurface(app, config.liveOpsConsole, createVoiceLiveOpsRoutes);
    app = mountSurface(
      app,
      config.mediaPipeline,
      createVoiceMediaPipelineRoutes,
    );
    app = mountSurface(app, config.monitorReport, createVoiceMonitorRoutes);
    app = mountSurface(
      app,
      config.monitorRunner,
      createVoiceMonitorRunnerRoutes,
    );
    app = mountSurface(
      app,
      config.observabilityExport,
      createVoiceObservabilityExportRoutes,
    );
    app = mountSurface(
      app,
      config.observabilityExportReplay,
      createVoiceObservabilityExportReplayRoutes,
    );
    app = mountSurface(
      app,
      config.operationalStatus,
      createVoiceOperationalStatusRoutes,
    );
    app = mountSurface(
      app,
      config.operationsRecord,
      createVoiceOperationsRecordRoutes,
    );
    app = mountSurface(
      app,
      config.opsActionAudit,
      createVoiceOpsActionAuditRoutes,
    );
    app = mountSurface(app, config.opsConsole, createVoiceOpsConsoleRoutes);
    app = mountSurface(app, config.opsRecovery, createVoiceOpsRecoveryRoutes);
    app = mountSurface(app, config.opsStatus, createVoiceOpsStatusRoutes);
    app = mountSurface(
      app,
      config.opsWebhookReceiver,
      createVoiceOpsWebhookReceiverRoutes,
    );
    app = mountSurface(
      app,
      config.outcomeContract,
      createVoiceOutcomeContractRoutes,
    );
    app = mountSurface(
      app,
      config.phoneAgentProductionSmoke,
      createVoicePhoneAgentProductionSmokeRoutes,
    );
    app = mountSurface(
      app,
      config.platformCoverage,
      createVoicePlatformCoverageRoutes,
    );
    app = mountSurface(
      app,
      config.postCallAnalysis,
      createVoicePostCallAnalysisRoutes,
    );
    app = mountSurface(
      app,
      config.productionReadiness,
      createVoiceProductionReadinessRoutes,
    );
    app = mountSurface(
      app,
      config.profileSwitchLiveDecision,
      createVoiceProfileSwitchLiveDecisionRoutes,
    );
    app = mountSurface(
      app,
      config.profileSwitchPolicyProof,
      createVoiceProfileSwitchPolicyProofRoutes,
    );
    app = mountSurface(
      app,
      config.profileSwitchReadiness,
      createVoiceProfileSwitchReadinessRoutes,
    );
    app = mountSurface(app, config.proofPack, createVoiceProofPackRoutes);
    app = mountSurface(app, config.proofTrend, createVoiceProofTrendRoutes);
    app = mountSurface(
      app,
      config.proofTrendRecommendation,
      createVoiceProofTrendRecommendationRoutes,
    );
    app = mountSurface(
      app,
      config.providerCapability,
      createVoiceProviderCapabilityRoutes,
    );
    app = mountSurface(
      app,
      config.providerContractMatrix,
      createVoiceProviderContractMatrixRoutes,
    );
    app = mountSurface(
      app,
      config.providerDecisionTrace,
      createVoiceProviderDecisionTraceRoutes,
    );
    app = mountSurface(
      app,
      config.providerHealth,
      createVoiceProviderHealthRoutes,
    );
    app = mountSurface(
      app,
      config.providerOrchestration,
      createVoiceProviderOrchestrationRoutes,
    );
    app = mountSurface(app, config.providerSlo, createVoiceProviderSloRoutes);
    app = mountSurface(app, config.quality, createVoiceQualityRoutes);
    app = mountSurface(
      app,
      config.realCallEvidenceRuntime,
      createVoiceRealCallEvidenceRuntimeRoutes,
    );
    app = mountSurface(
      app,
      config.realCallProfileHistory,
      createVoiceRealCallProfileHistoryRoutes,
    );
    app = mountSurface(
      app,
      config.realCallProfileRecoveryAction,
      createVoiceRealCallProfileRecoveryActionRoutes,
    );
    app = mountSurface(
      app,
      config.realtimeChannel,
      createVoiceRealtimeChannelRoutes,
    );
    app = mountSurface(
      app,
      config.realtimeProviderContract,
      createVoiceRealtimeProviderContractRoutes,
    );
    app = mountSurface(
      app,
      config.reconnectContract,
      createVoiceReconnectContractRoutes,
    );
    app = mountSurface(
      app,
      config.reconnectProof,
      createVoiceReconnectProofRoutes,
    );
    app = mountSurface(app, config.resilience, createVoiceResilienceRoutes);
    app = mountSurface(app, config.sessionList, createVoiceSessionListRoutes);
    app = mountSurface(
      app,
      config.sessionObservability,
      createVoiceSessionObservabilityRoutes,
    );
    app = mountSurface(
      app,
      config.sessionReplay,
      createVoiceSessionReplayRoutes,
    );
    app = mountSurface(
      app,
      config.sessionSnapshot,
      createVoiceSessionSnapshotRoutes,
    );
    app = mountSurface(
      app,
      config.simulationSuite,
      createVoiceSimulationSuiteRoutes,
    );
    app = mountSurface(
      app,
      config.sloCalibration,
      createVoiceSloCalibrationRoutes,
    );
    app = mountSurface(
      app,
      config.sloReadinessThreshold,
      createVoiceSloReadinessThresholdRoutes,
    );
    app = mountSurface(
      app,
      config.telephonyCarrierMatrix,
      createVoiceTelephonyCarrierMatrixRoutes,
    );
    app = mountSurface(
      app,
      config.telephonyMedia,
      createVoiceTelephonyMediaRoutes,
    );
    app = mountSurface(
      app,
      config.telephonyWebhook,
      createVoiceTelephonyWebhookRoutes,
    );
    app = mountSurface(
      app,
      config.telephonyWebhookSecurity,
      createVoiceTelephonyWebhookSecurityRoutes,
    );
    app = mountSurface(app, config.toolContract, createVoiceToolContractRoutes);
    app = mountSurface(
      app,
      config.traceDelivery,
      createVoiceTraceDeliveryRoutes,
    );
    app = mountSurface(
      app,
      config.traceTimeline,
      createVoiceTraceTimelineRoutes,
    );
    app = mountSurface(app, config.turnLatency, createVoiceTurnLatencyRoutes);
    app = mountSurface(app, config.turnQuality, createVoiceTurnQualityRoutes);

    return app;
  };

  const htmxRoutes = () => {
    if (!config.htmx) {
      return new Elysia();
    }

    return new Elysia()
      .get(htmxRoute, async ({ query }) => {
        const sessionId =
          typeof query.sessionId === "string" && query.sessionId.trim()
            ? query.sessionId.trim()
            : undefined;
        const session = sessionId
          ? await config.session.get(sessionId)
          : undefined;
        const result = session?.turns
          .toReversed()
          .find((turn) => turn.result !== undefined)?.result as
          | TResult
          | undefined;
        const turns =
          (session?.turns as Array<VoiceTurnRecord<TResult>> | undefined) ?? [];

        return new Response(
          buildVoiceHTMXResponse<TSession, TResult>(
            {
              assistantTexts:
                session?.turns.flatMap((turn) =>
                  turn.assistantText ? [turn.assistantText] : [],
                ) ?? [],
              partial: session?.currentTurn.partialText ?? "",
              result,
              session,
              sessionId,
              status: session?.status ?? "idle",
              turnCount: turns.length,
              turns,
            },
            htmxRenderers,
            htmxTargets,
          ),
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        );
      })
      .get(
        htmxBootstrapRoute,
        async () =>
          new Response(await loadHTMXBootstrap(), {
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
            },
          }),
      );
  };

  return new Elysia({ name: "absolutejs-voice" })
    .ws(config.path, {
      close: async (ws, code, reason) => {
        const socketState = runtime.socketSessions.get(ws);
        if (!socketState) {
          return;
        }

        const session = runtime.activeSessions.get(socketState.sessionId);
        runtime.activeSessions.delete(socketState.sessionId);
        deregisterMonitorSession(
          socketState.sessionId,
          reason ?? `ws-close-${String(code)}`,
        );

        if (session) {
          await session.disconnect({
            code,
            reason,
            recoverable: true,
            type: "close",
          });
        }
      },
      message: async (ws, raw) => {
        const sessionState = resolveSessionId(runtime, ws);
        const current = runtime.activeSessions.get(sessionState.sessionId);
        const message = parseClientMessage(raw);

        if (message) {
          if (message.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }

          if (message.type === "end_turn" && current) {
            await current.commitTurn("manual");
          }

          if (message.type === "close" && current) {
            await current.close(message.reason);
            runtime.activeSessions.delete(sessionState.sessionId);
            deregisterMonitorSession(sessionState.sessionId, message.reason);
          }

          if (message.type === "call_control" && current) {
            if (message.action === "transfer") {
              if (message.target) {
                await current.transfer({
                  metadata: message.metadata,
                  reason: message.reason,
                  target: message.target,
                });
              } else {
                ws.send(
                  JSON.stringify({
                    message: "call_control transfer requires target",
                    recoverable: true,
                    type: "error",
                  }),
                );
              }
            }

            if (message.action === "escalate") {
              await current.escalate({
                metadata: message.metadata,
                reason: message.reason ?? "client-requested-escalation",
              });
            }

            if (message.action === "voicemail") {
              await current.markVoicemail({
                metadata: message.metadata,
              });
            }

            if (message.action === "no-answer") {
              await current.markNoAnswer({
                metadata: message.metadata,
              });
            }

            if (message.action === "complete") {
              await current.complete();
            }
          }

          if (
            message.type === "start" &&
            message.sessionId &&
            message.sessionId !== sessionState.sessionId
          ) {
            const currentSession = runtime.activeSessions.get(
              sessionState.sessionId,
            );

            if (currentSession) {
              await currentSession.close("session-switch");
              runtime.activeSessions.delete(sessionState.sessionId);
              deregisterMonitorSession(
                sessionState.sessionId,
                "session-switch",
              );
            }

            sessionState.sessionId = message.sessionId;
            runtime.socketSessions.set(ws, {
              ...sessionState,
              sessionId: message.sessionId,
              scenarioId: sessionState.scenarioId,
            });
          }

          if (message.type === "start" && message.scenarioId) {
            sessionState.scenarioId = message.scenarioId;
            runtime.socketSessions.set(ws, {
              ...sessionState,
              scenarioId: message.scenarioId,
            });
          }

          return;
        }

        const audio = toAudioChunk(raw);
        if (!audio) {
          return;
        }

        const session =
          current ??
          (await createManagedSession(
            ws,
            sessionState.sessionId,
            sessionState.scenarioId ?? undefined,
          ));

        if (!current) {
          const typedSession = session as VoiceSessionHandle<
            unknown,
            VoiceSessionRecord,
            unknown
          >;
          runtime.activeSessions.set(sessionState.sessionId, typedSession);
          registerMonitorSession(sessionState.sessionId, typedSession);
          await session.connect(buildSocketAdapter(ws, sessionState.sessionId));
        }

        await session.receiveAudio(audio);
      },
      open: async (ws) => {
        const sessionState = resolveSessionId(runtime, ws);
        const existing = runtime.activeSessions.get(sessionState.sessionId);

        if (existing) {
          await existing.close("superseded");
          runtime.activeSessions.delete(sessionState.sessionId);
          deregisterMonitorSession(sessionState.sessionId, "superseded");
        }

        const session = await createManagedSession(
          ws,
          sessionState.sessionId,
          sessionState.scenarioId ?? undefined,
        );

        const typedSession = session as VoiceSessionHandle<
          unknown,
          VoiceSessionRecord,
          unknown
        >;
        runtime.activeSessions.set(sessionState.sessionId, typedSession);
        registerMonitorSession(sessionState.sessionId, typedSession);
        await session.connect(buildSocketAdapter(ws, sessionState.sessionId));
      },
    })
    .use(htmxRoutes())
    .use(surfaceRoutes());
};
