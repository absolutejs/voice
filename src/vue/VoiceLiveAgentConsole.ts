import {
  defineComponent,
  h,
  onUnmounted,
  shallowRef,
  type PropType,
} from "vue";
import {
  createLiveAgentConsole,
  type LiveAgentConsole,
  type LiveAgentConsoleState,
} from "../client/liveAgentConsole";

export const VoiceLiveAgentConsole = defineComponent({
  name: "VoiceLiveAgentConsole",
  props: {
    console: {
      default: undefined,
      type: Object as PropType<LiveAgentConsole | undefined>,
    },
    sessionId: { default: "live", type: String },
    takeoverButtonLabel: { default: "Take over", type: String },
    takeoverReason: String,
    title: { default: "Live agent console", type: String },
  },
  emits: { takeover: (_reason?: string) => true },
  setup(props, { emit }) {
    const console =
      props.console ?? createLiveAgentConsole({ sessionId: props.sessionId });
    const state = shallowRef<LiveAgentConsoleState>(console.getState());

    const unsubscribe = console.subscribe(() => {
      state.value = console.getState();
    });
    onUnmounted(() => {
      unsubscribe();
    });

    return () => {
      const s = state.value;
      return h(
        "section",
        {
          "aria-label": "voice-live-agent-console",
          class: "absolute-voice-live-agent-console",
          "data-takeover": s.hasTakeover ? "true" : "false",
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
                    background: s.hasTakeover
                      ? "rgba(239,68,68,0.18)"
                      : "rgba(59,130,246,0.18)",
                    borderRadius: "999px",
                    fontSize: "11px",
                    padding: "3px 10px",
                    textTransform: "uppercase",
                  },
                },
                s.hasTakeover ? "Human" : "Agent",
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
                s.view.sessionId,
              ),
            ],
          ),
          s.caller
            ? h(
                "div",
                {
                  style: {
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: "12px",
                    fontSize: "13px",
                    margin: "0 0 12px",
                    padding: "12px",
                  },
                },
                [
                  h(
                    "div",
                    {
                      style: {
                        fontSize: "11px",
                        opacity: "0.7",
                        textTransform: "uppercase",
                      },
                    },
                    "Caller",
                  ),
                  h("div", { style: { marginTop: "4px" } }, s.caller.summary),
                ],
              )
            : null,
          h("div", { style: { display: "flex", gap: "10px", marginBottom: "12px" } }, [
            s.hasTakeover
              ? h(
                  "button",
                  {
                    onClick: () => console.releaseTakeover(),
                    style: {
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.18)",
                      borderRadius: "12px",
                      color: "#f8fafc",
                      cursor: "pointer",
                      fontSize: "13px",
                      padding: "8px 14px",
                    },
                    type: "button",
                  },
                  "Release back to agent",
                )
              : h(
                  "button",
                  {
                    onClick: () => {
                      console.takeover(props.takeoverReason);
                      emit("takeover", props.takeoverReason);
                    },
                    style: {
                      background: "#ef4444",
                      border: "none",
                      borderRadius: "12px",
                      color: "#f8fafc",
                      cursor: "pointer",
                      fontSize: "13px",
                      padding: "8px 14px",
                    },
                    type: "button",
                  },
                  props.takeoverButtonLabel,
                ),
          ]),
          h(
            "ol",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                listStyle: "none",
                margin: "0",
                maxHeight: "260px",
                overflowY: "auto",
                padding: "0",
              },
            },
            s.recentTimeline.map((event, index) =>
              h(
                "li",
                {
                  key: `${event.at}-${index}`,
                  style: {
                    alignItems: "center",
                    display: "flex",
                    fontSize: "13px",
                    gap: "12px",
                    paddingLeft: "8px",
                  },
                },
                [
                  h("strong", event.title),
                  event.detail
                    ? h("span", { style: { opacity: "0.85" } }, event.detail)
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
