import { defineComponent, h, type PropType } from "vue";
import {
  createVoiceReconnectProfileEvidenceViewModel,
  type VoiceReconnectProfileEvidenceWidgetOptions,
} from "../client/reconnectProfileEvidenceWidget";
import type { VoiceReactiveSource } from "../client/reactiveSource";
import { useVoiceReconnectProfileEvidence } from "./useVoiceReconnectProfileEvidence";

export const VoiceReconnectProfileEvidence = defineComponent({
  name: "VoiceReconnectProfileEvidence",
  props: {
    description: String,
    intervalMs: Number,
    path: {
      default: "/api/voice/reconnect-profile-evidence",
      type: String,
    },
    reactiveSource: Function as PropType<VoiceReactiveSource>,
    title: String,
  },
  setup(props) {
    const state = useVoiceReconnectProfileEvidence(props.path, {
      description: props.description,
      intervalMs: props.intervalMs,
      reactiveSource: props.reactiveSource,
      title: props.title,
    } as VoiceReconnectProfileEvidenceWidgetOptions);

    return () => {
      const model = createVoiceReconnectProfileEvidenceViewModel(
        {
          error: state.error.value,
          isLoading: state.isLoading.value,
          report: state.report.value,
          updatedAt: state.updatedAt.value,
        },
        {
          description: props.description,
          intervalMs: props.intervalMs,
          reactiveSource: props.reactiveSource,
          title: props.title,
        },
      );

      return h(
        "section",
        {
          class: [
            "absolute-voice-reconnect-evidence",
            `absolute-voice-reconnect-evidence--${model.status}`,
          ],
        },
        [
          h("header", { class: "absolute-voice-reconnect-evidence__header" }, [
            h(
              "span",
              { class: "absolute-voice-reconnect-evidence__eyebrow" },
              model.title,
            ),
            h(
              "strong",
              { class: "absolute-voice-reconnect-evidence__label" },
              model.label,
            ),
          ]),
          h(
            "p",
            { class: "absolute-voice-reconnect-evidence__description" },
            model.description,
          ),
          h(
            "div",
            { class: "absolute-voice-reconnect-evidence__metrics" },
            model.metrics.map((metric) =>
              h("article", { key: metric.label }, [
                h("span", metric.label),
                h("strong", metric.value),
              ]),
            ),
          ),
          model.latest
            ? h(
                "p",
                { class: "absolute-voice-reconnect-evidence__latest" },
                `Latest ${model.latest.profileLabel} · ${model.latest.sessionId} · ${model.latest.surfaces}`,
              )
            : h(
                "p",
                { class: "absolute-voice-reconnect-evidence__empty" },
                "No persisted reconnect profile evidence yet.",
              ),
          model.links.length
            ? h(
                "p",
                { class: "absolute-voice-reconnect-evidence__links" },
                model.links.map((link) =>
                  h("a", { href: link.href, key: link.href }, link.label),
                ),
              )
            : null,
          model.error
            ? h(
                "p",
                { class: "absolute-voice-reconnect-evidence__error" },
                model.error,
              )
            : null,
        ],
      );
    };
  },
});
