import { escapeHtml } from "../internal/html";
import {
  createLiveAgentConsole as createCoreConsole,
  type CreateLiveAgentConsoleOptions,
  type LiveAgentConsoleState,
} from "../client/liveAgentConsole";

export type CreateVoiceLiveAgentConsoleSvelteOptions =
  CreateLiveAgentConsoleOptions & {
    takeoverButtonLabel?: string;
    title?: string;
  };

export const renderVoiceLiveAgentConsoleHTML = (
  state: LiveAgentConsoleState,
  options: { takeoverButtonLabel?: string; title?: string } = {},
): string => {
  const title = options.title ?? "Live agent console";
  const buttonLabel = options.takeoverButtonLabel ?? "Take over";
  const callerBlock = state.caller
    ? `<div style="background:rgba(255,255,255,0.06);border-radius:12px;font-size:13px;margin:0 0 12px;padding:12px;">
        <div style="font-size:11px;opacity:0.7;text-transform:uppercase;">Caller</div>
        <div style="margin-top:4px;">${escapeHtml(state.caller.summary)}</div>
      </div>`
    : "";
  const button = state.hasTakeover
    ? `<button type="button" data-action="release" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);border-radius:12px;color:#f8fafc;cursor:pointer;font-size:13px;padding:8px 14px;">Release back to agent</button>`
    : `<button type="button" data-action="takeover" style="background:#ef4444;border:none;border-radius:12px;color:#f8fafc;cursor:pointer;font-size:13px;padding:8px 14px;">${escapeHtml(buttonLabel)}</button>`;
  const items = state.recentTimeline
    .map(
      (event) =>
        `<li style="align-items:center;display:flex;font-size:13px;gap:12px;padding-left:8px;">
          <strong>${escapeHtml(event.title)}</strong>
          ${event.detail ? `<span style="opacity:0.85;">${escapeHtml(event.detail)}</span>` : ""}
        </li>`,
    )
    .join("");
  return `<section aria-label="voice-live-agent-console" class="absolute-voice-live-agent-console" data-takeover="${state.hasTakeover ? "true" : "false"}" style="background:#0f172a;border-radius:16px;color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif;padding:20px;">
  <header style="align-items:center;display:flex;gap:12px;margin-bottom:12px;">
    <strong style="font-size:16px;">${escapeHtml(title)}</strong>
    <span style="background:${state.hasTakeover ? "rgba(239,68,68,0.18)" : "rgba(59,130,246,0.18)"};border-radius:999px;font-size:11px;padding:3px 10px;text-transform:uppercase;">${state.hasTakeover ? "Human" : "Agent"}</span>
    <span style="font-size:13px;margin-left:auto;opacity:0.7;">${escapeHtml(state.view.sessionId)}</span>
  </header>
  ${callerBlock}
  <div style="display:flex;gap:10px;margin-bottom:12px;">${button}</div>
  <ol style="display:flex;flex-direction:column;gap:6px;list-style:none;margin:0;max-height:260px;overflow-y:auto;padding:0;">${items}</ol>
</section>`;
};

export const createVoiceLiveAgentConsole = (
  options: CreateVoiceLiveAgentConsoleSvelteOptions,
) => {
  const console = createCoreConsole(options);
  return {
    ...console,
    getHTML: () =>
      renderVoiceLiveAgentConsoleHTML(console.getState(), {
        takeoverButtonLabel: options.takeoverButtonLabel,
        title: options.title,
      }),
    takeoverButtonLabel: options.takeoverButtonLabel ?? "Take over",
    title: options.title ?? "Live agent console",
  };
};
