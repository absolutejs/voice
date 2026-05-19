import { computed, defineComponent, h, type PropType } from "vue";
import type { VoiceCallReviewArtifact } from "../testing/review";
import {
  buildReplayTimelineReport,
  type ReplayTimelineEvent,
} from "../client/replayTimeline";

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

export const VoiceReplayTimeline = defineComponent({
  name: "VoiceReplayTimeline",
  props: {
    artifact: {
      required: true,
      type: Object as PropType<VoiceCallReviewArtifact>,
    },
    title: String,
  },
  setup(props) {
    const report = computed(() =>
      buildReplayTimelineReport({ artifact: props.artifact }),
    );
    return () => {
      const r = report.value;
      return h(
        "section",
        {
          "aria-label": "voice-replay-timeline",
          class: "absolute-voice-replay-timeline",
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
                alignItems: "baseline",
                display: "flex",
                gap: "12px",
                marginBottom: "12px",
              },
            },
            [
              h(
                "strong",
                { style: { fontSize: "16px" } },
                props.title ?? r.metadata.title ?? "Replay",
              ),
              h(
                "span",
                { style: { fontSize: "13px", opacity: "0.7" } },
                `${r.events.length} events · ${r.summary.userTurns} user · ${r.summary.agentTurns} agent · ${r.summary.toolCalls} tool`,
              ),
            ],
          ),
          r.events.length === 0
            ? h(
                "p",
                { style: { fontSize: "13px", opacity: "0.7" } },
                "No timeline events.",
              )
            : h(
                "ol",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    listStyle: "none",
                    margin: "0",
                    padding: "0",
                  },
                },
                r.events.map((event, index) =>
                  h(
                    "li",
                    {
                      key: `${event.at}-${index}`,
                      style: {
                        alignItems: "center",
                        borderLeft: `3px solid ${CATEGORY_COLOR[event.category]}`,
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
                        formatRelative(event.at - r.startedAt),
                      ),
                      h("strong", { style: { fontSize: "13px" } }, event.label),
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
