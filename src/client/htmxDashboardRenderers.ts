import { escapeHtml } from "../internal/html";
import type { StoredVoiceTraceEvent } from "../trace";
import type { VoiceCallReviewArtifact } from "../testing/review";
import {
  buildVoiceCostDashboardReport,
  type VoiceCostDashboardBucket,
  type VoiceCostDashboardOptions,
  type VoiceCostDashboardReport,
} from "./costDashboard";
import {
  createLiveCallViewer,
  type LiveCallTimelineEvent,
  type LiveCallViewState,
  type LiveCallViewer,
} from "./liveCallViewer";
import {
  buildReplayTimelineReport,
  type ReplayTimelineEvent,
  type ReplayTimelineReport,
} from "./replayTimeline";

const formatUsd = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    currency,
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);

const formatInteger = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

const formatRelative = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
};

import {
  buildVoiceHTMXAttributes,
  type VoiceHTMXPollingAttributes,
} from "./htmxAttributes";

export type VoiceDashboardHTMXAttributes = VoiceHTMXPollingAttributes;

const polledWrapperAttributes = (
  attrs: VoiceDashboardHTMXAttributes | undefined,
): string => buildVoiceHTMXAttributes(attrs);

export type VoiceCostDashboardHTMXInput = {
  attributes?: VoiceDashboardHTMXAttributes;
  currency?: string;
  emptyMessage?: string;
  report: VoiceCostDashboardReport;
  title?: string;
};

export type VoiceCostDashboardRenderer = (
  input: VoiceCostDashboardHTMXInput,
) => string;

export type VoiceCostDashboardCellRenderer = (
  bucket: VoiceCostDashboardBucket,
  currency: string,
  isTotal: boolean,
) => string;

const renderCostRow: VoiceCostDashboardCellRenderer = (
  bucket,
  currency,
  isTotal,
) =>
  `<tr data-bucket-key="${escapeHtml(bucket.bucketKey)}" style="${isTotal ? "border-top:2px solid rgba(255,255,255,0.15);font-weight:600;" : ""}">
    <td style="padding:8px 12px;">${escapeHtml(bucket.bucketKey)}</td>
    <td style="padding:8px 12px;text-align:right;">${formatInteger(bucket.callCount)}</td>
    <td style="padding:8px 12px;text-align:right;">${formatUsd(bucket.llmUsd, currency)}</td>
    <td style="padding:8px 12px;text-align:right;">${formatUsd(bucket.ttsUsd, currency)}</td>
    <td style="padding:8px 12px;text-align:right;">${formatUsd(bucket.sttUsd, currency)}</td>
    <td style="padding:8px 12px;text-align:right;">${formatUsd(bucket.telephonyUsd, currency)}</td>
    <td style="padding:8px 12px;text-align:right;">${formatUsd(bucket.totalUsd, currency)}</td>
  </tr>`;

const defaultCostDashboard: VoiceCostDashboardRenderer = ({
  attributes,
  currency = "USD",
  emptyMessage = "No cost events in window.",
  report,
  title = "Voice cost dashboard",
}) => {
  const body = report.buckets
    .map((bucket) => renderCostRow(bucket, currency, false))
    .join("");
  const total = renderCostRow(report.grandTotal, currency, true);
  const inner =
    report.buckets.length === 0
      ? `<p style="font-size:13px;opacity:0.7;">${escapeHtml(emptyMessage)}</p>`
      : `<table style="border-collapse:collapse;font-size:13px;width:100%;">
    <thead><tr style="opacity:0.7;text-align:left;">
      <th style="padding:8px 12px;">Bucket</th>
      <th style="padding:8px 12px;text-align:right;">Calls</th>
      <th style="padding:8px 12px;text-align:right;">LLM</th>
      <th style="padding:8px 12px;text-align:right;">TTS</th>
      <th style="padding:8px 12px;text-align:right;">STT</th>
      <th style="padding:8px 12px;text-align:right;">Tel.</th>
      <th style="padding:8px 12px;text-align:right;">Total</th>
    </tr></thead><tbody>${body}${total}</tbody></table>`;
  return `<section aria-label="voice-cost-dashboard" class="absolute-voice-cost-dashboard"${polledWrapperAttributes(attributes)} style="background:#0f172a;border-radius:16px;color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif;padding:20px;">
  <header style="align-items:baseline;display:flex;gap:12px;margin-bottom:12px;">
    <strong style="font-size:16px;">${escapeHtml(title)}</strong>
    <span style="font-size:13px;opacity:0.7;">${report.buckets.length} buckets · grand total ${formatUsd(report.grandTotal.totalUsd, currency)}</span>
  </header>
  ${inner}
</section>`;
};

export type VoiceReplayTimelineHTMXInput = {
  attributes?: VoiceDashboardHTMXAttributes;
  emptyMessage?: string;
  report: ReplayTimelineReport;
  title?: string;
};

export type VoiceReplayTimelineRenderer = (
  input: VoiceReplayTimelineHTMXInput,
) => string;

const REPLAY_CATEGORY_COLOR: Record<ReplayTimelineEvent["category"], string> = {
  agent: "#3b82f6",
  lifecycle: "#94a3b8",
  tool: "#f59e0b",
  user: "#10b981",
};

const renderReplayEntry = (
  event: ReplayTimelineEvent,
  startedAt: number,
): string =>
  `<li style="align-items:center;border-left:3px solid ${REPLAY_CATEGORY_COLOR[event.category]};display:flex;font-size:13px;gap:12px;padding-left:12px;">
    <span style="color:#cbd5e1;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;width:60px;">${formatRelative(event.at - startedAt)}</span>
    <strong style="font-size:13px;">${escapeHtml(event.label)}</strong>
    ${event.detail ? `<span style="opacity:0.85;">${escapeHtml(event.detail)}</span>` : ""}
  </li>`;

const defaultReplayTimeline: VoiceReplayTimelineRenderer = ({
  attributes,
  emptyMessage = "No timeline events.",
  report,
  title,
}) => {
  const headline = escapeHtml(title ?? report.metadata.title ?? "Replay");
  const items = report.events
    .map((event) => renderReplayEntry(event, report.startedAt))
    .join("");
  const inner =
    report.events.length === 0
      ? `<p style="font-size:13px;opacity:0.7;">${escapeHtml(emptyMessage)}</p>`
      : `<ol style="display:flex;flex-direction:column;gap:6px;list-style:none;margin:0;padding:0;">${items}</ol>`;
  return `<section aria-label="voice-replay-timeline" class="absolute-voice-replay-timeline"${polledWrapperAttributes(attributes)} style="background:#0f172a;border-radius:16px;color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif;padding:20px;">
  <header style="align-items:baseline;display:flex;gap:12px;margin-bottom:12px;">
    <strong style="font-size:16px;">${headline}</strong>
    <span style="font-size:13px;opacity:0.7;">${report.events.length} events · ${report.summary.userTurns} user · ${report.summary.agentTurns} agent · ${report.summary.toolCalls} tool</span>
  </header>
  ${inner}
</section>`;
};

export type VoiceLiveCallViewerHTMXInput = {
  attributes?: VoiceDashboardHTMXAttributes;
  state: LiveCallViewState;
  title?: string;
};

export type VoiceLiveCallViewerRenderer = (
  input: VoiceLiveCallViewerHTMXInput,
) => string;

const LIVE_CATEGORY_COLOR: Record<string, string> = {
  agent_audio: "#3b82f6",
  agent_text: "#3b82f6",
  lifecycle: "#94a3b8",
  tool: "#f59e0b",
  transcript: "#10b981",
};

const renderLiveEntry = (
  event: LiveCallTimelineEvent,
  firstAt: number,
): string =>
  `<li style="align-items:center;border-left:3px solid ${LIVE_CATEGORY_COLOR[event.kind] ?? "#94a3b8"};display:flex;font-size:13px;gap:12px;padding-left:12px;">
    <span style="color:#cbd5e1;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;width:60px;">${formatRelative(event.at - firstAt)}</span>
    <strong style="font-size:13px;">${escapeHtml(event.title)}</strong>
    ${event.detail ? `<span style="opacity:0.85;">${escapeHtml(event.detail)}</span>` : ""}
  </li>`;

const defaultLiveCallViewer: VoiceLiveCallViewerRenderer = ({
  attributes,
  state,
  title = "Live call",
}) => {
  const firstAt = state.events[0]?.at ?? Date.now();
  const items = state.events
    .map((event) => renderLiveEntry(event, firstAt))
    .join("");
  return `<section aria-label="voice-live-call-viewer" class="absolute-voice-live-call-viewer" data-agent-state="${escapeHtml(state.agentState)}"${polledWrapperAttributes(attributes)} style="background:#0f172a;border-radius:16px;color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif;padding:20px;">
  <header style="align-items:center;display:flex;gap:12px;margin-bottom:12px;">
    <strong style="font-size:16px;">${escapeHtml(title)}</strong>
    <span style="background:rgba(59,130,246,0.18);border-radius:999px;font-size:11px;padding:3px 10px;text-transform:uppercase;">${escapeHtml(state.agentState)}</span>
    <span style="font-size:13px;margin-left:auto;opacity:0.7;">${escapeHtml(state.sessionId)} · ${formatRelative(state.callDurationMs)}</span>
  </header>
  ${state.partialTranscript ? `<p style="background:rgba(16,185,129,0.12);border-radius:12px;font-size:13px;margin:0 0 12px;opacity:0.95;padding:10px 12px;">"${escapeHtml(state.partialTranscript)}"</p>` : ""}
  <ol style="display:flex;flex-direction:column;gap:6px;list-style:none;margin:0;max-height:320px;overflow-y:auto;padding:0;">${items}</ol>
</section>`;
};

export type VoiceDashboardHTMXRendererConfig = {
  costDashboard?: VoiceCostDashboardRenderer;
  liveCallViewer?: VoiceLiveCallViewerRenderer;
  replayTimeline?: VoiceReplayTimelineRenderer;
};

export type ResolvedVoiceDashboardRenderers =
  Required<VoiceDashboardHTMXRendererConfig>;

export const resolveVoiceDashboardRenderers = (
  custom?: VoiceDashboardHTMXRendererConfig,
): ResolvedVoiceDashboardRenderers => ({
  costDashboard: custom?.costDashboard ?? defaultCostDashboard,
  liveCallViewer: custom?.liveCallViewer ?? defaultLiveCallViewer,
  replayTimeline: custom?.replayTimeline ?? defaultReplayTimeline,
});

export const renderVoiceCostDashboardHTMX = (
  input: VoiceCostDashboardHTMXInput & { custom?: VoiceCostDashboardRenderer },
): string => (input.custom ?? defaultCostDashboard)(input);

export const renderVoiceReplayTimelineHTMX = (
  input: VoiceReplayTimelineHTMXInput & {
    custom?: VoiceReplayTimelineRenderer;
  },
): string => (input.custom ?? defaultReplayTimeline)(input);

export const renderVoiceLiveCallViewerHTMX = (
  input: VoiceLiveCallViewerHTMXInput & {
    custom?: VoiceLiveCallViewerRenderer;
  },
): string => (input.custom ?? defaultLiveCallViewer)(input);

// Helpers callers can use without importing the view-model builders.
export const renderVoiceCostDashboardFromEvents = (input: {
  attributes?: VoiceDashboardHTMXAttributes;
  currency?: string;
  events: ReadonlyArray<StoredVoiceTraceEvent>;
  options?: Omit<VoiceCostDashboardOptions, "events">;
  renderer?: VoiceCostDashboardRenderer;
  title?: string;
}): string => {
  const report = buildVoiceCostDashboardReport({
    bucketBy: input.options?.bucketBy,
    events: input.events,
    fromMs: input.options?.fromMs,
    toMs: input.options?.toMs,
  });
  return renderVoiceCostDashboardHTMX({
    attributes: input.attributes,
    currency: input.currency,
    custom: input.renderer,
    report,
    title: input.title,
  });
};

export const renderVoiceReplayTimelineFromArtifact = (input: {
  artifact: VoiceCallReviewArtifact;
  attributes?: VoiceDashboardHTMXAttributes;
  renderer?: VoiceReplayTimelineRenderer;
  title?: string;
}): string => {
  const report = buildReplayTimelineReport({ artifact: input.artifact });
  return renderVoiceReplayTimelineHTMX({
    attributes: input.attributes,
    custom: input.renderer,
    report,
    title: input.title,
  });
};

export const renderVoiceLiveCallViewerFromViewer = (input: {
  attributes?: VoiceDashboardHTMXAttributes;
  renderer?: VoiceLiveCallViewerRenderer;
  title?: string;
  viewer: LiveCallViewer;
}): string =>
  renderVoiceLiveCallViewerHTMX({
    attributes: input.attributes,
    custom: input.renderer,
    state: input.viewer.getState(),
    title: input.title,
  });

// Convenience: build a fresh viewer + render once. Useful for server-rendered first paint.
export const renderVoiceLiveCallViewerFromState = (input: {
  attributes?: VoiceDashboardHTMXAttributes;
  renderer?: VoiceLiveCallViewerRenderer;
  state: LiveCallViewState;
  title?: string;
}): string =>
  renderVoiceLiveCallViewerHTMX({
    attributes: input.attributes,
    custom: input.renderer,
    state: input.state,
    title: input.title,
  });

export const createLiveCallViewerFromOptions = createLiveCallViewer;
