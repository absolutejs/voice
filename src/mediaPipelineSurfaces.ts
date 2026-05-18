import {
  buildMediaProcessorGraphArtifact,
  buildMediaQualityArtifact,
  buildMediaTransportArtifact,
  writeMediaArtifact,
  type MediaArtifactWriteResult,
  type MediaPipelineCalibrationIssue,
  type MediaPipelineStatus,
  type MediaProcessorGraphSummary,
  type MediaQualitySummary,
  type MediaTransportSummary,
} from "@absolutejs/media";
import type { VoiceIncidentTimelineEvent } from "./incidentTimeline";
import type { VoiceMediaPipelineReport } from "./mediaPipelineRoutes";
import type {
  VoiceProductionReadinessCheck,
  VoiceProductionReadinessStatus,
} from "./productionReadiness";

export type VoiceMediaPipelineIssueSource =
  | "calibration"
  | "interruption"
  | "processor-graph"
  | "quality"
  | "transport";

export type VoiceMediaPipelineIssueEntry = {
  code: string;
  message: string;
  severity: "error" | "warning";
  source: VoiceMediaPipelineIssueSource;
  surface: string;
};

const calibrationIssues = (
  report: VoiceMediaPipelineReport,
): VoiceMediaPipelineIssueEntry[] =>
  report.calibration.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    severity: issue.severity,
    source: "calibration",
    surface: report.surface,
  }));

const qualityIssues = (
  report: VoiceMediaPipelineReport,
): VoiceMediaPipelineIssueEntry[] =>
  report.quality.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    severity: issue.severity,
    source: "quality",
    surface: report.surface,
  }));

const interruptionIssues = (
  report: VoiceMediaPipelineReport,
): VoiceMediaPipelineIssueEntry[] =>
  report.interruption.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    severity: issue.severity,
    source: "interruption",
    surface: report.surface,
  }));

const transportIssues = (
  report: VoiceMediaPipelineReport,
): VoiceMediaPipelineIssueEntry[] => {
  if (!report.transport) return [];
  const entries: VoiceMediaPipelineIssueEntry[] = [];
  if (report.transport.failed) {
    entries.push({
      code: "media.transport_failed",
      message: `Media transport ${report.transport.name} entered the failed state.`,
      severity: "error",
      source: "transport",
      surface: report.surface,
    });
  }
  if (report.transport.backpressureEvents > 0) {
    entries.push({
      code: "media.transport_backpressure",
      message: `Media transport ${report.transport.name} reported ${String(report.transport.backpressureEvents)} backpressure event(s).`,
      severity: "warning",
      source: "transport",
      surface: report.surface,
    });
  }
  const errorEvents = report.transport.events.filter(
    (event) => event.kind === "error",
  );
  for (const event of errorEvents) {
    entries.push({
      code: "media.transport_error",
      message: event.error ?? "Media transport error event.",
      severity: "error",
      source: "transport",
      surface: report.surface,
    });
  }
  return entries;
};

const processorGraphIssues = (
  report: VoiceMediaPipelineReport,
): VoiceMediaPipelineIssueEntry[] => {
  if (!report.processorGraph) return [];
  return report.processorGraph.errors.map((event) => ({
    code: `media.graph_${event.kind}`,
    message:
      event.error ??
      `Processor graph reported ${event.kind} (state ${event.state}).`,
    severity: "error",
    source: "processor-graph",
    surface: report.surface,
  }));
};

export const extractVoiceMediaPipelineIssueEntries = (
  report: VoiceMediaPipelineReport,
): readonly VoiceMediaPipelineIssueEntry[] => [
  ...calibrationIssues(report),
  ...qualityIssues(report),
  ...interruptionIssues(report),
  ...transportIssues(report),
  ...processorGraphIssues(report),
];

const toReadinessStatus = (
  status: MediaPipelineStatus,
): VoiceProductionReadinessStatus =>
  status === "fail" ? "fail" : status === "warn" ? "warn" : "pass";

const readinessStatusFromIssues = (
  issues: readonly MediaPipelineCalibrationIssue[],
): VoiceProductionReadinessStatus => {
  if (issues.some((issue) => issue.severity === "error")) return "fail";
  if (issues.length > 0) return "warn";
  return "pass";
};

export type VoiceMediaPipelineReadinessOptions = {
  baseHref?: string;
  label?: string;
};

export const buildVoiceMediaPipelineReadinessChecks = (
  report: VoiceMediaPipelineReport,
  options: VoiceMediaPipelineReadinessOptions = {},
): readonly VoiceProductionReadinessCheck[] => {
  const baseHref = options.baseHref ?? "/voice/media-pipeline";
  const label = options.label ?? "Media pipeline";
  const checks: VoiceProductionReadinessCheck[] = [
    {
      detail: `Status ${report.status}, surface ${report.surface}, ${String(report.frames)} frame(s).`,
      href: baseHref,
      label: `${label}: overall`,
      status: toReadinessStatus(report.status),
    },
    {
      detail: `${String(report.quality.issues.length)} quality issue(s); gaps ${String(report.quality.gapCount)}, jitter ${String(report.quality.jitterMs ?? "n/a")}ms, speech ratio ${(report.quality.speechRatio * 100).toFixed(1)}%.`,
      href: baseHref,
      label: `${label}: media quality`,
      status: toReadinessStatus(report.quality.status),
      value: report.quality.gapCount,
    },
  ];
  if (report.transport) {
    checks.push({
      detail: `${report.transport.state}, in ${String(report.transport.inputFrames)}, out ${String(report.transport.outputFrames)}, backpressure ${String(report.transport.backpressureEvents)}.`,
      href: baseHref,
      label: `${label}: transport`,
      status: toReadinessStatus(report.transport.status),
      value: report.transport.state,
    });
  }
  if (report.processorGraph) {
    checks.push({
      detail: `${report.processorGraph.state}, nodes ${String(report.processorGraph.nodes.length)}, errors ${String(report.processorGraph.errors.length)}, dropped ${String(report.processorGraph.droppedFrames)}.`,
      href: baseHref,
      label: `${label}: processor graph`,
      status: toReadinessStatus(report.processorGraph.status),
      value: report.processorGraph.state,
    });
  }
  checks.push({
    detail: `${String(report.interruption.interruptionFrames)} interruption frame(s); ${String(report.interruption.issues.length)} issue(s).`,
    href: baseHref,
    label: `${label}: interruption`,
    status: readinessStatusFromIssues(report.interruption.issues),
    value: report.interruption.interruptionFrames,
  });
  return checks;
};

const severityToIncident = (
  severity: "error" | "warning",
): VoiceIncidentTimelineEvent["severity"] =>
  severity === "error" ? "critical" : "warn";

const sourceSuffix: Record<VoiceMediaPipelineIssueSource, string> = {
  calibration: "calibration",
  interruption: "interruption",
  "processor-graph": "graph",
  quality: "quality",
  transport: "transport",
};

export type VoiceMediaPipelineIncidentOptions = {
  baseHref?: string;
  category?: VoiceIncidentTimelineEvent["category"];
  now?: () => number;
  source?: string;
};

export const buildVoiceMediaPipelineIncidentEvents = (
  report: VoiceMediaPipelineReport,
  options: VoiceMediaPipelineIncidentOptions = {},
): readonly VoiceIncidentTimelineEvent[] => {
  const baseHref = options.baseHref ?? "/voice/media-pipeline";
  const category = options.category ?? "monitor";
  const source = options.source ?? "media-pipeline";
  const now = options.now ?? (() => Date.now());
  const at = now();
  const entries = extractVoiceMediaPipelineIssueEntries(report);
  return entries.map((entry, index) => ({
    at,
    category,
    detail: entry.message,
    href: baseHref,
    id: `media-pipeline:${sourceSuffix[entry.source]}:${entry.code}:${String(index)}`,
    label: `Media ${sourceSuffix[entry.source]} ${entry.severity}: ${entry.code}`,
    severity: severityToIncident(entry.severity),
    source,
    value: entry.code,
  }));
};

export type VoiceMediaPipelineArtifactKind =
  | "processor-graph"
  | "quality"
  | "transport";

export type VoiceMediaPipelineArtifactRecord = {
  href?: string;
  jsonPath: string;
  kind: VoiceMediaPipelineArtifactKind;
  markdownPath: string;
  summary:
    | MediaProcessorGraphSummary
    | MediaQualitySummary
    | MediaTransportSummary;
};

export type VoiceMediaPipelineArtifactWriteOptions = {
  dir: string;
  hrefBase?: string;
  report: VoiceMediaPipelineReport;
  slugPrefix?: string;
};

export type VoiceMediaPipelineArtifactWriteResult = {
  artifacts: VoiceMediaPipelineArtifactRecord[];
  hrefs: {
    processorGraph?: string;
    quality?: string;
    transport?: string;
  };
};

const buildHref = (
  base: string | undefined,
  jsonPath: string,
  fallbackSlug: string,
): string | undefined => {
  if (!base) return undefined;
  const filename = jsonPath.split("/").pop() ?? `${fallbackSlug}.json`;
  return `${base.replace(/\/$/, "")}/${filename}`;
};

const recordFromWrite = <
  TSummary extends
    | MediaProcessorGraphSummary
    | MediaQualitySummary
    | MediaTransportSummary,
>(
  kind: VoiceMediaPipelineArtifactKind,
  write: MediaArtifactWriteResult<TSummary>,
  hrefBase: string | undefined,
  slug: string,
): VoiceMediaPipelineArtifactRecord => ({
  href: buildHref(hrefBase, write.jsonPath, slug),
  jsonPath: write.jsonPath,
  kind,
  markdownPath: write.markdownPath,
  summary: write.summary,
});

export const writeVoiceMediaPipelineArtifacts = async (
  options: VoiceMediaPipelineArtifactWriteOptions,
): Promise<VoiceMediaPipelineArtifactWriteResult> => {
  const slugPrefix = options.slugPrefix ?? "media";
  const qualitySlug = `${slugPrefix}-quality`;
  const transportSlug = `${slugPrefix}-transport`;
  const graphSlug = `${slugPrefix}-processor-graph`;
  const artifacts: VoiceMediaPipelineArtifactRecord[] = [];
  const hrefs: VoiceMediaPipelineArtifactWriteResult["hrefs"] = {};

  const qualityArtifact = buildMediaQualityArtifact(options.report.quality);
  const qualityWrite = await writeMediaArtifact({
    dir: options.dir,
    slug: qualitySlug,
    ...qualityArtifact,
  });
  const qualityRecord = recordFromWrite(
    "quality",
    qualityWrite,
    options.hrefBase,
    qualitySlug,
  );
  artifacts.push(qualityRecord);
  hrefs.quality = qualityRecord.href;

  if (options.report.transport) {
    const transportArtifact = buildMediaTransportArtifact(
      options.report.transport,
    );
    const transportWrite = await writeMediaArtifact({
      dir: options.dir,
      slug: transportSlug,
      ...transportArtifact,
    });
    const transportRecord = recordFromWrite(
      "transport",
      transportWrite,
      options.hrefBase,
      transportSlug,
    );
    artifacts.push(transportRecord);
    hrefs.transport = transportRecord.href;
  }

  if (options.report.processorGraph) {
    const graphArtifact = buildMediaProcessorGraphArtifact(
      options.report.processorGraph,
    );
    const graphWrite = await writeMediaArtifact({
      dir: options.dir,
      slug: graphSlug,
      ...graphArtifact,
    });
    const graphRecord = recordFromWrite(
      "processor-graph",
      graphWrite,
      options.hrefBase,
      graphSlug,
    );
    artifacts.push(graphRecord);
    hrefs.processorGraph = graphRecord.href;
  }

  return { artifacts, hrefs };
};
