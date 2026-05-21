import { useMemo, useRef } from "react";
import { useVoiceController } from "./useVoiceController";
import type { VoiceControllerOptions } from "../core/types";
import {
  createVoiceWidgetViewModel,
  type VoiceWidgetLabels,
  type VoiceWidgetTheme,
  type VoiceWidgetViewModel,
} from "../client/voiceWidgetView";

export type { VoiceWidgetLabels, VoiceWidgetTheme, VoiceWidgetViewModel };

export type VoiceWidgetProps = {
  className?: string;
  controllerOptions?: VoiceControllerOptions;
  labels?: VoiceWidgetLabels;
  onError?: (error: string) => void;
  path?: string;
  theme?: VoiceWidgetTheme;
  title?: string;
};

const resolveRadius = (radius: number | string) =>
  typeof radius === "number" ? `${radius}px` : radius;

const buttonStyle = (
  variant: "primary" | "secondary" | "danger",
  theme: VoiceWidgetViewModel["theme"],
) =>
  ({
    background:
      variant === "primary"
        ? theme.accent
        : variant === "danger"
          ? theme.errorAccent
          : "transparent",
    border:
      variant === "secondary" ? `1px solid rgba(255,255,255,0.18)` : "none",
    borderRadius: 12,
    color: theme.foreground,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    padding: "10px 14px",
  }) as const;

export const VoiceWidget = ({
  className,
  controllerOptions,
  labels,
  onError,
  path = "/voice",
  theme,
  title,
}: VoiceWidgetProps) => {
  const lastErrorRef = useRef<string | null>(null);
  const controller = useVoiceController(path, controllerOptions);

  if (controller.error && controller.error !== lastErrorRef.current) {
    lastErrorRef.current = controller.error;
    onError?.(controller.error);
  }

  const model = useMemo(
    () =>
      createVoiceWidgetViewModel({
        labels,
        state: {
          assistantAudio: controller.assistantAudio,
          error: controller.error,
          isConnected: controller.isConnected,
          isRecording: controller.isRecording,
          partial: controller.partial,
          status: controller.status,
          turns: controller.turns,
        },
        theme,
        title,
      }),
    [
      controller.assistantAudio,
      controller.error,
      controller.isConnected,
      controller.isRecording,
      controller.partial,
      controller.status,
      controller.turns,
      labels,
      theme,
      title,
    ],
  );

  return (
    <div
      aria-live="polite"
      className={className ?? model.classes.container}
      data-agent-state={model.agentState}
      role="region"
      style={{
        background: model.theme.background,
        borderRadius: resolveRadius(model.theme.radius),
        color: model.theme.foreground,
        fontFamily: model.theme.fontFamily,
        minWidth: 240,
        padding: "20px 22px",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            background: model.errorMessage
              ? model.theme.errorAccent
              : model.agentState === "idle"
                ? "rgba(148, 163, 184, 0.6)"
                : model.theme.accent,
            borderRadius: "50%",
            height: 10,
            width: 10,
          }}
        />
        <strong style={{ fontSize: 15 }}>{model.title}</strong>
        <span
          style={{
            fontSize: 13,
            marginLeft: "auto",
            opacity: 0.7,
          }}
        >
          {model.statusLabel}
        </span>
      </div>
      {model.partial ? (
        <p
          style={{
            fontSize: 13,
            margin: "8px 0 12px",
            opacity: 0.85,
            wordBreak: "break-word",
          }}
        >
          “{model.partial}”
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 10 }}>
        {model.controls.canStart ? (
          <button
            onClick={() => {
              void controller.startRecording();
            }}
            style={buttonStyle("primary", model.theme)}
            type="button"
          >
            {model.labels.startCall}
          </button>
        ) : null}
        {model.controls.canMute ? (
          <button
            onClick={() => controller.stopRecording()}
            style={buttonStyle("secondary", model.theme)}
            type="button"
          >
            {model.labels.mute}
          </button>
        ) : null}
        {model.controls.canEnd ? (
          <button
            onClick={() => {
              void controller.close();
            }}
            style={buttonStyle("danger", model.theme)}
            type="button"
          >
            {model.labels.endCall}
          </button>
        ) : null}
      </div>
      {model.errorMessage ? (
        <p
          style={{
            color: model.theme.errorAccent,
            fontSize: 12,
            marginTop: 12,
          }}
        >
          {model.errorMessage}
        </p>
      ) : null}
    </div>
  );
};
