import type { VoiceAgentUIState } from "../agentState";
import { deriveVoiceAgentUIState } from "../agentState";
import type { VoiceControllerState } from "../types";

export type VoiceWidgetTheme = {
  accent?: string;
  background?: string;
  errorAccent?: string;
  fontFamily?: string;
  foreground?: string;
  radius?: number | string;
};

export type VoiceWidgetLabels = {
  callEnded?: string;
  connecting?: string;
  endCall?: string;
  idle?: string;
  listening?: string;
  mute?: string;
  speaking?: string;
  startCall?: string;
  thinking?: string;
  unmute?: string;
};

export type VoiceWidgetViewModelInput = {
  labels?: VoiceWidgetLabels;
  state: Pick<
    VoiceControllerState,
    | "assistantAudio"
    | "error"
    | "isConnected"
    | "isRecording"
    | "partial"
    | "status"
    | "turns"
  >;
  theme?: VoiceWidgetTheme;
  title?: string;
};

export type VoiceWidgetViewModel = {
  agentState: VoiceAgentUIState;
  classes: { container: string; dot: string };
  controls: { canEnd: boolean; canMute: boolean; canStart: boolean };
  errorMessage?: string;
  labels: Required<VoiceWidgetLabels>;
  partial?: string;
  statusLabel: string;
  theme: Required<VoiceWidgetTheme>;
  title: string;
};

export const DEFAULT_VOICE_WIDGET_THEME: Required<VoiceWidgetTheme> = {
  accent: "#3b82f6",
  background: "#0f172a",
  errorAccent: "#ef4444",
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  foreground: "#f8fafc",
  radius: 16,
};

export const DEFAULT_VOICE_WIDGET_LABELS: Required<VoiceWidgetLabels> = {
  callEnded: "Call ended",
  connecting: "Connecting…",
  endCall: "End call",
  idle: "Idle",
  listening: "Listening",
  mute: "Mute",
  speaking: "Speaking",
  startCall: "Start call",
  thinking: "Thinking",
  unmute: "Unmute",
};

const stateLabel = (
  state: VoiceAgentUIState,
  labels: Required<VoiceWidgetLabels>,
) => {
  switch (state) {
    case "listening":
      return labels.listening;
    case "speaking":
      return labels.speaking;
    case "thinking":
      return labels.thinking;
    case "idle":
      return labels.idle;
  }
};

export const createVoiceWidgetViewModel = (
  input: VoiceWidgetViewModelInput,
): VoiceWidgetViewModel => {
  const theme = { ...DEFAULT_VOICE_WIDGET_THEME, ...input.theme };
  const labels = { ...DEFAULT_VOICE_WIDGET_LABELS, ...input.labels };
  const lastAssistantAt = input.state.assistantAudio.at(-1)?.receivedAt;
  const lastTranscriptAt = input.state.turns.at(-1)?.committedAt;
  const agentState = deriveVoiceAgentUIState({
    hasActivePartial: input.state.partial.length > 0,
    isConnected: input.state.isConnected,
    isPlaying: false,
    isRecording: input.state.isRecording,
    lastAssistantAt,
    lastTranscriptAt,
  });

  const connecting =
    !input.state.isConnected &&
    input.state.status !== "idle" &&
    !input.state.error;
  const statusLabel = input.state.error
    ? "Error"
    : connecting
      ? labels.connecting
      : input.state.status === "completed"
        ? labels.callEnded
        : stateLabel(agentState, labels);

  return {
    agentState,
    classes: {
      container: `absolute-voice-widget absolute-voice-widget--${agentState}`,
      dot: `absolute-voice-widget__dot${input.state.error ? " absolute-voice-widget__dot--error" : ""}`,
    },
    controls: {
      canEnd: input.state.isConnected,
      canMute: input.state.isRecording,
      canStart:
        !input.state.isRecording && input.state.status !== "completed",
    },
    errorMessage: input.state.error ?? undefined,
    labels,
    partial: input.state.partial || undefined,
    statusLabel,
    theme,
    title: input.title ?? "Voice",
  };
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const resolveRadius = (radius: number | string) =>
  typeof radius === "number" ? `${radius}px` : radius;

export const renderVoiceWidgetHTML = (
  model: VoiceWidgetViewModel,
): string => {
  const t = model.theme;
  const containerStyle = `background:${t.background};border-radius:${resolveRadius(t.radius)};color:${t.foreground};font-family:${t.fontFamily};min-width:240px;padding:20px 22px;`;
  const dotStyle = `background:${model.errorMessage ? t.errorAccent : model.agentState === "idle" ? "rgba(148,163,184,0.6)" : t.accent};border-radius:50%;height:10px;width:10px;`;
  const buttons: string[] = [];
  if (model.controls.canStart) {
    buttons.push(
      `<button type="button" data-action="start" style="background:${t.accent};border:none;border-radius:12px;color:${t.foreground};cursor:pointer;font-size:14px;font-weight:500;padding:10px 14px;">${escapeHtml(model.labels.startCall)}</button>`,
    );
  }
  if (model.controls.canMute) {
    buttons.push(
      `<button type="button" data-action="mute" style="background:transparent;border:1px solid rgba(255,255,255,0.18);border-radius:12px;color:${t.foreground};cursor:pointer;font-size:14px;font-weight:500;padding:10px 14px;">${escapeHtml(model.labels.mute)}</button>`,
    );
  }
  if (model.controls.canEnd) {
    buttons.push(
      `<button type="button" data-action="end" style="background:${t.errorAccent};border:none;border-radius:12px;color:${t.foreground};cursor:pointer;font-size:14px;font-weight:500;padding:10px 14px;">${escapeHtml(model.labels.endCall)}</button>`,
    );
  }
  return `<div role="region" aria-live="polite" data-agent-state="${model.agentState}" class="${escapeHtml(model.classes.container)}" style="${containerStyle}">
  <div style="align-items:center;display:flex;gap:10px;margin-bottom:12px;">
    <span aria-hidden="true" class="${escapeHtml(model.classes.dot)}" style="${dotStyle}"></span>
    <strong style="font-size:15px;">${escapeHtml(model.title)}</strong>
    <span style="font-size:13px;margin-left:auto;opacity:0.7;">${escapeHtml(model.statusLabel)}</span>
  </div>
  ${model.partial ? `<p style="font-size:13px;margin:8px 0 12px;opacity:0.85;word-break:break-word;">“${escapeHtml(model.partial)}”</p>` : ""}
  <div style="display:flex;gap:10px;">${buttons.join("")}</div>
  ${model.errorMessage ? `<p style="color:${t.errorAccent};font-size:12px;margin-top:12px;">${escapeHtml(model.errorMessage)}</p>` : ""}
</div>`;
};
