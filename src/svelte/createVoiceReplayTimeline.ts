import type { VoiceCallReviewArtifact } from "../testing/review";
import {
  buildReplayTimelineReport,
  type ReplayTimelineEvent,
  type ReplayTimelineReport,
} from "../client/replayTimeline";

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const CATEGORY_COLOR: Record<ReplayTimelineEvent["category"], string> = {
  agent: "#3b82f6",
  lifecycle: "#94a3b8",
  tool: "#f59e0b",
  user: "#10b981",
};

const formatRelative = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
};

export const renderVoiceReplayTimelineHTML = (
  report: ReplayTimelineReport,
  options: { title?: string } = {},
): string => {
  const title = options.title ?? report.metadata.title ?? "Replay";
  const items = report.events
    .map(
      (event, index) =>
        `<li key="${event.at}-${index}" style="align-items:center;border-left:3px solid ${CATEGORY_COLOR[event.category]};display:flex;font-size:13px;gap:12px;padding-left:12px;">
          <span style="color:#cbd5e1;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;width:60px;">${formatRelative(event.at - report.startedAt)}</span>
          <strong style="font-size:13px;">${escape(event.label)}</strong>
          ${event.detail ? `<span style="opacity:0.85;">${escape(event.detail)}</span>` : ""}
        </li>`,
    )
    .join("");
  return `<section aria-label="voice-replay-timeline" class="absolute-voice-replay-timeline" style="background:#0f172a;border-radius:16px;color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif;padding:20px;">
  <header style="align-items:baseline;display:flex;gap:12px;margin-bottom:12px;">
    <strong style="font-size:16px;">${escape(title)}</strong>
    <span style="font-size:13px;opacity:0.7;">${report.events.length} events · ${report.summary.userTurns} user · ${report.summary.agentTurns} agent · ${report.summary.toolCalls} tool</span>
  </header>
  <ol style="display:flex;flex-direction:column;gap:6px;list-style:none;margin:0;padding:0;">${items}</ol>
</section>`;
};

export type CreateVoiceReplayTimelineOptions = {
  artifact: VoiceCallReviewArtifact;
  title?: string;
};

export const createVoiceReplayTimeline = (
  options: CreateVoiceReplayTimelineOptions,
) => {
  const buildReport = () =>
    buildReplayTimelineReport({ artifact: options.artifact });
  return {
    getHTML: () =>
      renderVoiceReplayTimelineHTML(buildReport(), { title: options.title }),
    getReport: buildReport,
  };
};
