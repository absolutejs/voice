import { computed, defineComponent, h, type PropType } from "vue";
import { deriveVoiceAgentUIState } from "../agentState";
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

const resolveRadius = (radius: number | string) =>
  typeof radius === "number" ? `${radius}px` : radius;

export const VoiceWidget = defineComponent({
  name: "VoiceWidget",
  props: {
    controllerOptions: {
      default: () => ({}),
      type: Object as PropType<VoiceControllerOptions>,
    },
    labels: {
      default: () => ({}),
      type: Object as PropType<VoiceWidgetLabels>,
    },
    path: { default: "/voice", type: String },
    theme: {
      default: () => ({}),
      type: Object as PropType<VoiceWidgetTheme>,
    },
    title: { default: "Voice", type: String },
  },
  emits: { error: (_message: string) => true },
  setup(props, { emit }) {
    const controller = useVoiceController(props.path, props.controllerOptions);

    const theme = computed(() => ({ ...DEFAULT_THEME, ...props.theme }));
    const labels = computed(() => ({ ...DEFAULT_LABELS, ...props.labels }));

    const agentState = computed(() => {
      const lastAssistantAt =
        controller.assistantAudio.value.at(-1)?.receivedAt;
      const lastTranscriptAt = controller.turns.value.at(-1)?.committedAt;
      return deriveVoiceAgentUIState({
        hasActivePartial: controller.partial.value.length > 0,
        isConnected: controller.isConnected.value,
        isPlaying: false,
        isRecording: controller.isRecording.value,
        lastAssistantAt,
        lastTranscriptAt,
      });
    });

    return () => {
      const t = theme.value;
      const l = labels.value;
      if (controller.error.value) {
        emit("error", controller.error.value);
      }

      const stateLabel = controller.error.value
        ? "Error"
        : !controller.isConnected.value && controller.status.value !== "idle"
          ? l.connecting
          : controller.status.value === "completed"
            ? l.callEnded
            : agentState.value === "listening"
              ? l.listening
              : agentState.value === "speaking"
                ? l.speaking
                : agentState.value === "thinking"
                  ? l.thinking
                  : l.idle;

      const showStart =
        !controller.isRecording.value &&
        controller.status.value !== "completed";

      return h(
        "div",
        {
          "aria-live": "polite",
          "data-agent-state": agentState.value,
          role: "region",
          style: {
            background: t.background,
            borderRadius: resolveRadius(t.radius),
            color: t.foreground,
            fontFamily: t.fontFamily,
            minWidth: "240px",
            padding: "20px 22px",
          },
        },
        [
          h(
            "div",
            {
              style: {
                alignItems: "center",
                display: "flex",
                gap: "10px",
                marginBottom: "12px",
              },
            },
            [
              h("span", {
                "aria-hidden": "true",
                style: {
                  background: controller.error.value
                    ? t.errorAccent
                    : agentState.value === "idle"
                      ? "rgba(148,163,184,0.6)"
                      : t.accent,
                  borderRadius: "50%",
                  height: "10px",
                  width: "10px",
                },
              }),
              h("strong", { style: { fontSize: "15px" } }, props.title),
              h(
                "span",
                {
                  style: {
                    fontSize: "13px",
                    marginLeft: "auto",
                    opacity: "0.7",
                  },
                },
                stateLabel,
              ),
            ],
          ),
          controller.partial.value
            ? h(
                "p",
                {
                  style: {
                    fontSize: "13px",
                    margin: "8px 0 12px",
                    opacity: "0.85",
                    wordBreak: "break-word",
                  },
                },
                `“${controller.partial.value}”`,
              )
            : null,
          h("div", { style: { display: "flex", gap: "10px" } }, [
            showStart
              ? h(
                  "button",
                  {
                    onClick: () => {
                      void controller.startRecording();
                    },
                    style: {
                      background: t.accent,
                      border: "none",
                      borderRadius: "12px",
                      color: t.foreground,
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "500",
                      padding: "10px 14px",
                    },
                    type: "button",
                  },
                  l.startCall,
                )
              : null,
            controller.isRecording.value
              ? h(
                  "button",
                  {
                    onClick: () => controller.stopRecording(),
                    style: {
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.18)",
                      borderRadius: "12px",
                      color: t.foreground,
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "500",
                      padding: "10px 14px",
                    },
                    type: "button",
                  },
                  l.mute,
                )
              : null,
            controller.isConnected.value
              ? h(
                  "button",
                  {
                    onClick: () => {
                      void controller.close();
                    },
                    style: {
                      background: t.errorAccent,
                      border: "none",
                      borderRadius: "12px",
                      color: t.foreground,
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "500",
                      padding: "10px 14px",
                    },
                    type: "button",
                  },
                  l.endCall,
                )
              : null,
          ]),
          controller.error.value
            ? h(
                "p",
                {
                  style: {
                    color: t.errorAccent,
                    fontSize: "12px",
                    marginTop: "12px",
                  },
                },
                controller.error.value,
              )
            : null,
        ],
      );
    };
  },
});
