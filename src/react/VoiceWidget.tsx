import { useMemo, useRef } from "react";
import { deriveVoiceAgentUIState } from "../agentState";
import type { VoiceAgentUIState } from "../agentState";
import { useVoiceController } from "./useVoiceController";
import type { VoiceControllerOptions } from "../types";

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

export type VoiceWidgetProps = {
  className?: string;
  controllerOptions?: VoiceControllerOptions;
  labels?: VoiceWidgetLabels;
  /** Voice runtime URL. Default '/voice'. */
  path?: string;
  /** Optional callback for diagnostic events surfaced by the controller. */
  onError?: (error: string) => void;
  theme?: VoiceWidgetTheme;
  title?: string;
};

const DEFAULT_THEME: Required<VoiceWidgetTheme> = {
  accent: "#3b82f6",
  background: "#0f172a",
  errorAccent: "#ef4444",
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  foreground: "#f8fafc",
  radius: 16,
};

const DEFAULT_LABELS: Required<VoiceWidgetLabels> = {
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

const resolveRadius = (radius: number | string) =>
  typeof radius === "number" ? `${radius}px` : radius;

export const VoiceWidget = ({
  className,
  controllerOptions,
  labels: labelsOverride,
  onError,
  path = "/voice",
  theme: themeOverride,
  title,
}: VoiceWidgetProps) => {
  const theme = { ...DEFAULT_THEME, ...themeOverride };
  const labels = { ...DEFAULT_LABELS, ...labelsOverride };
  const lastErrorRef = useRef<string | null>(null);
  const controller = useVoiceController(path, controllerOptions);

  if (controller.error && controller.error !== lastErrorRef.current) {
    lastErrorRef.current = controller.error;
    onError?.(controller.error);
  }

  const lastAssistantAt = useMemo(() => {
    const last = controller.assistantAudio.at(-1);
    return last?.receivedAt;
  }, [controller.assistantAudio]);

  const lastTranscriptAt = useMemo(() => {
    const lastTurn = controller.turns.at(-1);
    return lastTurn?.committedAt;
  }, [controller.turns]);

  const agentState = deriveVoiceAgentUIState({
    hasActivePartial: controller.partial.length > 0,
    isConnected: controller.isConnected,
    isPlaying: false,
    isRecording: controller.isRecording,
    lastAssistantAt,
    lastTranscriptAt,
  });

  const connecting =
    !controller.isConnected && controller.status !== "idle" && !controller.error;
  const containerStyle = {
    background: theme.background,
    borderRadius: resolveRadius(theme.radius),
    color: theme.foreground,
    fontFamily: theme.fontFamily,
    minWidth: 240,
    padding: "20px 22px",
  } as const;
  const statusDotStyle = {
    background:
      controller.error
        ? theme.errorAccent
        : agentState === "idle"
          ? "rgba(148, 163, 184, 0.6)"
          : theme.accent,
    borderRadius: "50%",
    boxShadow:
      agentState === "speaking" ? `0 0 12px ${theme.accent}` : undefined,
    height: 10,
    width: 10,
  } as const;
  const buttonStyle = (variant: "primary" | "secondary" | "danger") => ({
    background:
      variant === "primary"
        ? theme.accent
        : variant === "danger"
          ? theme.errorAccent
          : "transparent",
    border:
      variant === "secondary"
        ? `1px solid rgba(255,255,255,0.18)`
        : "none",
    borderRadius: 12,
    color: theme.foreground,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    padding: "10px 14px",
  }) as const;

  const handleStart = () => {
    void controller.startRecording();
  };
  const handleStop = () => {
    controller.stopRecording();
  };
  const handleEnd = () => {
    void controller.close();
  };

  const showStart = !controller.isRecording && controller.status !== "completed";
  const showStop = controller.isRecording;

  return (
    <div
      aria-live="polite"
      className={className}
      data-agent-state={agentState}
      role="region"
      style={containerStyle}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <span aria-hidden="true" style={statusDotStyle} />
        <strong style={{ fontSize: 15 }}>{title ?? "Voice"}</strong>
        <span
          style={{
            fontSize: 13,
            marginLeft: "auto",
            opacity: 0.7,
          }}
        >
          {controller.error
            ? "Error"
            : connecting
              ? labels.connecting
              : controller.status === "completed"
                ? labels.callEnded
                : stateLabel(agentState, labels)}
        </span>
      </div>
      {controller.partial ? (
        <p
          style={{
            fontSize: 13,
            margin: "8px 0 12px",
            opacity: 0.85,
            wordBreak: "break-word",
          }}
        >
          “{controller.partial}”
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 10 }}>
        {showStart ? (
          <button
            onClick={handleStart}
            style={buttonStyle("primary")}
            type="button"
          >
            {labels.startCall}
          </button>
        ) : null}
        {showStop ? (
          <button
            onClick={handleStop}
            style={buttonStyle("secondary")}
            type="button"
          >
            {labels.mute}
          </button>
        ) : null}
        {controller.isConnected ? (
          <button
            onClick={handleEnd}
            style={buttonStyle("danger")}
            type="button"
          >
            {labels.endCall}
          </button>
        ) : null}
      </div>
      {controller.error ? (
        <p
          style={{
            color: theme.errorAccent,
            fontSize: 12,
            marginTop: 12,
          }}
        >
          {controller.error}
        </p>
      ) : null}
    </div>
  );
};
