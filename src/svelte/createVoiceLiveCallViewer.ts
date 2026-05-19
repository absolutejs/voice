import {
  createLiveCallViewer,
  type CreateLiveCallViewerOptions,
  type LiveCallViewState,
  type LiveCallViewer,
} from "../client/liveCallViewer";

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const CATEGORY_COLOR: Record<string, string> = {
  agent_audio: "#3b82f6",
  agent_text: "#3b82f6",
  lifecycle: "#94a3b8",
  tool: "#f59e0b",
  transcript: "#10b981",
};

const formatRelative = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
};

export const renderVoiceLiveCallViewerHTML = (
  state: LiveCallViewState,
  options: { title?: string } = {},
): string => {
  const title = options.title ?? "Live call";
  const firstAt = state.events[0]?.at ?? Date.now();
  const items = state.events
    .map(
      (event, index) =>
        `<li key="${event.at}-${index}" style="align-items:center;border-left:3px solid ${CATEGORY_COLOR[event.kind] ?? "#94a3b8"};display:flex;font-size:13px;gap:12px;padding-left:12px;">
          <span style="color:#cbd5e1;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;width:60px;">${formatRelative(event.at - firstAt)}</span>
          <strong style="font-size:13px;">${escape(event.title)}</strong>
          ${event.detail ? `<span style="opacity:0.85;">${escape(event.detail)}</span>` : ""}
        </li>`,
    )
    .join("");
  return `<section aria-label="voice-live-call-viewer" class="absolute-voice-live-call-viewer" data-agent-state="${state.agentState}" style="background:#0f172a;border-radius:16px;color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif;padding:20px;">
  <header style="align-items:center;display:flex;gap:12px;margin-bottom:12px;">
    <strong style="font-size:16px;">${escape(title)}</strong>
    <span style="background:rgba(59,130,246,0.18);border-radius:999px;font-size:11px;padding:3px 10px;text-transform:uppercase;">${state.agentState}</span>
    <span style="font-size:13px;margin-left:auto;opacity:0.7;">${escape(state.sessionId)} · ${formatRelative(state.callDurationMs)}</span>
  </header>
  ${state.partialTranscript ? `<p style="background:rgba(16,185,129,0.12);border-radius:12px;font-size:13px;margin:0 0 12px;opacity:0.95;padding:10px 12px;">“${escape(state.partialTranscript)}”</p>` : ""}
  <ol style="display:flex;flex-direction:column;gap:6px;list-style:none;margin:0;max-height:320px;overflow-y:auto;padding:0;">${items}</ol>
</section>`;
};

export type CreateVoiceLiveCallViewerSvelteOptions =
  CreateLiveCallViewerOptions & {
    title?: string;
  };

export const createVoiceLiveCallViewer = (
  options: CreateVoiceLiveCallViewerSvelteOptions,
) => {
  const viewer: LiveCallViewer = createLiveCallViewer(options);
  return {
    ...viewer,
    getHTML: () =>
      renderVoiceLiveCallViewerHTML(viewer.getState(), {
        title: options.title,
      }),
    title: options.title,
  };
};
