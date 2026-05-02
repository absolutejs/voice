import type {
  StoredVoiceTraceEvent,
  VoiceTraceEventStore,
  VoiceTraceEventType,
} from "./trace";

export type VoiceLatencySLOStatus = "empty" | "fail" | "pass" | "warn";

export type VoiceLatencySLOStage =
  | "assistant_text_to_tts_send"
  | "barge_in_stop"
  | "commit_to_assistant_text"
  | "final_to_commit"
  | "live_latency"
  | "provider_llm"
  | "provider_stt"
  | "provider_tts"
  | "speech_to_commit"
  | "tts_send_duration"
  | "tts_to_first_audio";

export type VoiceLatencySLOBudget = {
  failAfterMs: number;
  warnAfterMs?: number;
};

export type VoiceLatencySLOMeasurement = {
  at: number;
  latencyMs: number;
  label: string;
  provider?: string;
  sessionId: string;
  stage: VoiceLatencySLOStage;
  status: Exclude<VoiceLatencySLOStatus, "empty">;
  turnId?: string;
};

export type VoiceLatencySLOStageSummary = {
  averageMs?: number;
  budget: VoiceLatencySLOBudget;
  failed: number;
  label: string;
  maxMs?: number;
  measurements: VoiceLatencySLOMeasurement[];
  p50Ms?: number;
  p95Ms?: number;
  stage: VoiceLatencySLOStage;
  status: VoiceLatencySLOStatus;
  total: number;
  warnings: number;
};

export type VoiceLatencySLOGateReport = {
  checkedAt: number;
  failed: number;
  measurements: VoiceLatencySLOMeasurement[];
  stages: VoiceLatencySLOStageSummary[];
  status: VoiceLatencySLOStatus;
  total: number;
  warnings: number;
};

export type VoiceLatencySLOGateOptions = {
  budgets?: Partial<Record<VoiceLatencySLOStage, VoiceLatencySLOBudget>>;
  events?: StoredVoiceTraceEvent[];
  failAfterMs?: number;
  limit?: number;
  store?: VoiceTraceEventStore;
  warnAfterMs?: number;
};

export type VoiceLatencySLOGateError = Error & {
  report: VoiceLatencySLOGateReport;
};

const DEFAULT_WARN_AFTER_MS = 1_800;
const DEFAULT_FAIL_AFTER_MS = 3_200;

const STAGE_LABELS: Record<VoiceLatencySLOStage, string> = {
  assistant_text_to_tts_send: "Assistant text to TTS send",
  barge_in_stop: "Barge-in stop latency",
  commit_to_assistant_text: "Commit to assistant text",
  final_to_commit: "Final transcript to commit",
  live_latency: "Browser live latency",
  provider_llm: "LLM provider latency",
  provider_stt: "STT provider latency",
  provider_tts: "TTS provider latency",
  speech_to_commit: "Speech detected to commit",
  tts_send_duration: "TTS send duration",
  tts_to_first_audio: "TTS to first audio",
};

const TRACE_TYPES: VoiceTraceEventType[] = [
  "assistant.run",
  "client.barge_in",
  "client.live_latency",
  "turn.transcript",
  "turn_latency.stage",
];

const getNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const getString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : undefined;

const percentile = (values: number[], percentileValue: number) => {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return Math.round(sorted[index] ?? 0);
};

const average = (values: number[]) =>
  values.length === 0
    ? undefined
    : Math.round(
        values.reduce((total, value) => total + value, 0) / values.length,
      );

const resolveBudget = (
  stage: VoiceLatencySLOStage,
  options: VoiceLatencySLOGateOptions,
): VoiceLatencySLOBudget => ({
  failAfterMs:
    options.budgets?.[stage]?.failAfterMs ??
    options.failAfterMs ??
    DEFAULT_FAIL_AFTER_MS,
  warnAfterMs:
    options.budgets?.[stage]?.warnAfterMs ??
    options.warnAfterMs ??
    DEFAULT_WARN_AFTER_MS,
});

const statusForLatency = (
  latencyMs: number,
  budget: VoiceLatencySLOBudget,
): Exclude<VoiceLatencySLOStatus, "empty"> =>
  latencyMs > budget.failAfterMs
    ? "fail"
    : budget.warnAfterMs !== undefined && latencyMs > budget.warnAfterMs
      ? "warn"
      : "pass";

const stageMeasurement = (input: {
  at: number;
  budget: VoiceLatencySLOBudget;
  latencyMs: number | undefined;
  provider?: string;
  sessionId: string;
  stage: VoiceLatencySLOStage;
  turnId?: string;
}): VoiceLatencySLOMeasurement | undefined => {
  if (input.latencyMs === undefined) {
    return undefined;
  }

  return {
    at: input.at,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    label: STAGE_LABELS[input.stage],
    provider: input.provider,
    sessionId: input.sessionId,
    stage: input.stage,
    status: statusForLatency(Math.max(0, input.latencyMs), input.budget),
    turnId: input.turnId,
  };
};

const providerStageForEvent = (
  event: StoredVoiceTraceEvent,
): VoiceLatencySLOStage | undefined => {
  if (event.type === "assistant.run") {
    return "provider_llm";
  }
  if (event.type === "turn.transcript") {
    return "provider_stt";
  }
  const kind =
    getString(event.payload.providerKind) ??
    getString(event.payload.kind) ??
    getString(event.payload.lane);
  if (kind === "llm" || kind === "model") {
    return "provider_llm";
  }
  if (kind === "stt" || kind === "transcription") {
    return "provider_stt";
  }
  if (kind === "tts" || kind === "speech") {
    return "provider_tts";
  }
  return undefined;
};

const eventElapsedMs = (event: StoredVoiceTraceEvent) =>
  getNumber(event.payload.elapsedMs) ??
  getNumber(event.payload.latencyMs) ??
  getNumber(event.payload.durationMs);

const collectTraceStageMeasurements = (
  events: StoredVoiceTraceEvent[],
  options: VoiceLatencySLOGateOptions,
) => {
  const grouped = new Map<string, Map<string, StoredVoiceTraceEvent>>();
  for (const event of events) {
    if (event.type !== "turn_latency.stage" || !event.turnId) {
      continue;
    }
    const stage = getString(event.payload.stage);
    if (!stage) {
      continue;
    }
    const key = `${event.sessionId}:${event.turnId}`;
    const stages = grouped.get(key) ?? new Map<string, StoredVoiceTraceEvent>();
    const previous = stages.get(stage);
    if (!previous || event.at < previous.at) {
      stages.set(stage, event);
    }
    grouped.set(key, stages);
  }

  const measurements: VoiceLatencySLOMeasurement[] = [];
  for (const [key, stages] of grouped) {
    const [sessionId, turnId] = key.split(":");
    if (!sessionId || !turnId) {
      continue;
    }
    const speechDetected = stages.get("speech_detected")?.at;
    const finalTranscript = stages.get("final_transcript")?.at;
    const turnCommitted = stages.get("turn_committed")?.at;
    const assistantTextStarted = stages.get("assistant_text_started")?.at;
    const ttsSendStarted = stages.get("tts_send_started")?.at;
    const ttsSendCompleted = stages.get("tts_send_completed")?.at;
    const assistantAudioReceived = stages.get("assistant_audio_received")?.at;

    const candidates: Array<
      Parameters<typeof stageMeasurement>[0] & { required: boolean }
    > = [
      {
        at: turnCommitted ?? 0,
        budget: resolveBudget("speech_to_commit", options),
        latencyMs:
          speechDetected === undefined || turnCommitted === undefined
            ? undefined
            : turnCommitted - speechDetected,
        required: true,
        sessionId,
        stage: "speech_to_commit",
        turnId,
      },
      {
        at: turnCommitted ?? 0,
        budget: resolveBudget("final_to_commit", options),
        latencyMs:
          finalTranscript === undefined || turnCommitted === undefined
            ? undefined
            : turnCommitted - finalTranscript,
        required: true,
        sessionId,
        stage: "final_to_commit",
        turnId,
      },
      {
        at: assistantTextStarted ?? 0,
        budget: resolveBudget("commit_to_assistant_text", options),
        latencyMs:
          turnCommitted === undefined || assistantTextStarted === undefined
            ? undefined
            : assistantTextStarted - turnCommitted,
        required: true,
        sessionId,
        stage: "commit_to_assistant_text",
        turnId,
      },
      {
        at: ttsSendStarted ?? 0,
        budget: resolveBudget("assistant_text_to_tts_send", options),
        latencyMs:
          assistantTextStarted === undefined || ttsSendStarted === undefined
            ? undefined
            : ttsSendStarted - assistantTextStarted,
        required: true,
        sessionId,
        stage: "assistant_text_to_tts_send",
        turnId,
      },
      {
        at: ttsSendCompleted ?? 0,
        budget: resolveBudget("tts_send_duration", options),
        latencyMs:
          ttsSendStarted === undefined || ttsSendCompleted === undefined
            ? undefined
            : ttsSendCompleted - ttsSendStarted,
        required: true,
        sessionId,
        stage: "tts_send_duration",
        turnId,
      },
      {
        at: assistantAudioReceived ?? 0,
        budget: resolveBudget("tts_to_first_audio", options),
        latencyMs:
          ttsSendCompleted === undefined || assistantAudioReceived === undefined
            ? undefined
            : assistantAudioReceived - ttsSendCompleted,
        required: true,
        sessionId,
        stage: "tts_to_first_audio",
        turnId,
      },
    ];

    for (const candidate of candidates) {
      const measurement = stageMeasurement(candidate);
      if (measurement) {
        measurements.push(measurement);
      }
    }
  }
  return measurements;
};

const collectDirectMeasurements = (
  events: StoredVoiceTraceEvent[],
  options: VoiceLatencySLOGateOptions,
) => {
  const measurements: VoiceLatencySLOMeasurement[] = [];
  for (const event of events) {
    if (event.type === "client.live_latency") {
      const stage = "live_latency";
      const measurement = stageMeasurement({
        at: event.at,
        budget: resolveBudget(stage, options),
        latencyMs: eventElapsedMs(event),
        sessionId: event.sessionId,
        stage,
        turnId: event.turnId,
      });
      if (measurement) {
        measurements.push(measurement);
      }
      continue;
    }
    if (event.type === "client.barge_in") {
      const stage = "barge_in_stop";
      const measurement = stageMeasurement({
        at: event.at,
        budget: resolveBudget(stage, options),
        latencyMs: eventElapsedMs(event),
        sessionId: event.sessionId,
        stage,
        turnId: event.turnId,
      });
      if (measurement) {
        measurements.push(measurement);
      }
      continue;
    }
    const providerStage = providerStageForEvent(event);
    if (providerStage) {
      const measurement = stageMeasurement({
        at: event.at,
        budget: resolveBudget(providerStage, options),
        latencyMs: eventElapsedMs(event),
        provider: getString(event.payload.provider),
        sessionId: event.sessionId,
        stage: providerStage,
        turnId: event.turnId,
      });
      if (measurement) {
        measurements.push(measurement);
      }
    }
  }
  return measurements;
};

const summarizeStage = (
  stage: VoiceLatencySLOStage,
  measurements: VoiceLatencySLOMeasurement[],
  options: VoiceLatencySLOGateOptions,
): VoiceLatencySLOStageSummary => {
  const stageMeasurements = measurements.filter(
    (measurement) => measurement.stage === stage,
  );
  const latencies = stageMeasurements.map(
    (measurement) => measurement.latencyMs,
  );
  const failed = stageMeasurements.filter(
    (measurement) => measurement.status === "fail",
  ).length;
  const warnings = stageMeasurements.filter(
    (measurement) => measurement.status === "warn",
  ).length;
  return {
    averageMs: average(latencies),
    budget: resolveBudget(stage, options),
    failed,
    label: STAGE_LABELS[stage],
    maxMs: latencies.length > 0 ? Math.max(...latencies) : undefined,
    measurements: stageMeasurements,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    stage,
    status:
      stageMeasurements.length === 0
        ? "empty"
        : failed > 0
          ? "fail"
          : warnings > 0
            ? "warn"
            : "pass",
    total: stageMeasurements.length,
    warnings,
  };
};

export const buildVoiceLatencySLOGate = async (
  options: VoiceLatencySLOGateOptions,
): Promise<VoiceLatencySLOGateReport> => {
  const events =
    options.events ??
    (await options.store?.list({
      limit: options.limit ?? 1_000,
      type: TRACE_TYPES,
    })) ??
    [];
  const measurements = [
    ...collectTraceStageMeasurements(events, options),
    ...collectDirectMeasurements(events, options),
  ].sort((left, right) => right.at - left.at);
  const stageKeys = new Set<VoiceLatencySLOStage>([
    ...(Object.keys(options.budgets ?? {}) as VoiceLatencySLOStage[]),
    ...measurements.map((measurement) => measurement.stage),
  ]);
  const stages = [...stageKeys]
    .map((stage) => summarizeStage(stage, measurements, options))
    .sort((left, right) => left.label.localeCompare(right.label));
  const failed = measurements.filter(
    (measurement) => measurement.status === "fail",
  ).length;
  const warnings = measurements.filter(
    (measurement) => measurement.status === "warn",
  ).length;

  return {
    checkedAt: Date.now(),
    failed,
    measurements,
    stages,
    status:
      measurements.length === 0
        ? "empty"
        : failed > 0
          ? "fail"
          : warnings > 0
            ? "warn"
            : "pass",
    total: measurements.length,
    warnings,
  };
};

export const assertVoiceLatencySLOGate = async (
  options: VoiceLatencySLOGateOptions,
) => {
  const report = await buildVoiceLatencySLOGate(options);
  if (report.status === "fail") {
    const error = new Error(
      `Voice latency SLO gate failed with ${report.failed} failed measurement(s).`,
    ) as VoiceLatencySLOGateError;
    error.report = report;
    throw error;
  }
  return report;
};

export const renderVoiceLatencySLOMarkdown = (
  report: VoiceLatencySLOGateReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Latency SLO Gate";
  const rows = report.stages
    .map(
      (stage) =>
        `| ${stage.label} | ${stage.status} | ${stage.total} | ${stage.p50Ms ?? "n/a"} | ${stage.p95Ms ?? "n/a"} | ${stage.budget.warnAfterMs ?? "n/a"} | ${stage.budget.failAfterMs} |`,
    )
    .join("\n");
  const failures = report.measurements
    .filter((measurement) => measurement.status === "fail")
    .map(
      (measurement) =>
        `- ${measurement.label}: ${measurement.latencyMs}ms in ${measurement.sessionId}${measurement.turnId ? `/${measurement.turnId}` : ""}${measurement.provider ? ` via ${measurement.provider}` : ""}`,
    )
    .join("\n");

  return `# ${title}

Status: ${report.status}

Total measurements: ${report.total}
Warnings: ${report.warnings}
Failures: ${report.failed}

| Stage | Status | Samples | p50 ms | p95 ms | Warn ms | Fail ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${rows || "| No latency measurements | empty | 0 | n/a | n/a | n/a | n/a |"}

${failures ? `## Failures\n\n${failures}\n` : "## Failures\n\nNone.\n"}`;
};
