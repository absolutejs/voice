import {
  defineComponent,
  h,
  onUnmounted,
  ref,
  shallowRef,
  type PropType,
} from "vue";
import {
  createLiveCallViewer,
  type LiveCallTimelineEvent,
  type LiveCallViewState,
  type LiveCallViewer,
} from "../client/liveCallViewer";

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

export const VoiceLiveCallViewer = defineComponent({
  name: "VoiceLiveCallViewer",
  props: {
    sessionId: { default: "live", type: String },
    title: { default: "Live call", type: String },
    viewer: {
      default: undefined,
      type: Object as PropType<LiveCallViewer | undefined>,
    },
  },
  setup(props) {
    const owned = !props.viewer;
    const viewer = props.viewer ?? createLiveCallViewer({ sessionId: props.sessionId });
    const state = shallowRef<LiveCallViewState>(viewer.getState());

    const unsubscribe = viewer.subscribe(() => {
      state.value = viewer.getState();
    });

    onUnmounted(() => {
      unsubscribe();
    });

    return () => {
      const s = state.value;
      const firstAt = s.events[0]?.at ?? Date.now();
      return h(
        "section",
        {
          "aria-label": "voice-live-call-viewer",
          class: "absolute-voice-live-call-viewer",
          "data-agent-state": s.agentState,
          style: {
            background: "#0f172a",
            borderRadius: "16px",
            color: "#f8fafc",
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            padding: "20px",
          },
        },
        [
          h(
            "header",
            {
              style: {
                alignItems: "center",
                display: "flex",
                gap: "12px",
                marginBottom: "12px",
              },
            },
            [
              h("strong", { style: { fontSize: "16px" } }, props.title),
              h(
                "span",
                {
                  style: {
                    background: "rgba(59,130,246,0.18)",
                    borderRadius: "999px",
                    fontSize: "11px",
                    padding: "3px 10px",
                    textTransform: "uppercase",
                  },
                },
                s.agentState,
              ),
              h(
                "span",
                {
                  style: {
                    fontSize: "13px",
                    marginLeft: "auto",
                    opacity: "0.7",
                  },
                },
                `${s.sessionId} · ${formatRelative(s.callDurationMs)}`,
              ),
            ],
          ),
          s.partialTranscript
            ? h(
                "p",
                {
                  style: {
                    background: "rgba(16,185,129,0.12)",
                    borderRadius: "12px",
                    fontSize: "13px",
                    margin: "0 0 12px",
                    opacity: "0.95",
                    padding: "10px 12px",
                  },
                },
                `“${s.partialTranscript}”`,
              )
            : null,
          h(
            "ol",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                listStyle: "none",
                margin: "0",
                maxHeight: "320px",
                overflowY: "auto",
                padding: "0",
              },
            },
            s.events.map((event: LiveCallTimelineEvent, index: number) =>
              h(
                "li",
                {
                  key: `${event.at}-${index}`,
                  style: {
                    alignItems: "center",
                    borderLeft: `3px solid ${
                      CATEGORY_COLOR[event.kind] ?? "#94a3b8"
                    }`,
                    display: "flex",
                    fontSize: "13px",
                    gap: "12px",
                    paddingLeft: "12px",
                  },
                },
                [
                  h(
                    "span",
                    {
                      style: {
                        color: "#cbd5e1",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: "12px",
                        width: "60px",
                      },
                    },
                    formatRelative(event.at - firstAt),
                  ),
                  h("strong", { style: { fontSize: "13px" } }, event.title),
                  event.detail
                    ? h(
                        "span",
                        { style: { opacity: "0.85" } },
                        event.detail,
                      )
                    : null,
                ],
              ),
            ),
          ),
        ],
      );
    };
  },
});
