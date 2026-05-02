import { defineComponent, h } from "vue";
import {
  createVoiceOpsStatusViewModel,
  type VoiceOpsStatusWidgetOptions,
} from "../client/opsStatusWidget";
import { useVoiceOpsStatus } from "./useVoiceOpsStatus";

export const VoiceOpsStatus = defineComponent({
  name: "VoiceOpsStatus",
  props: {
    description: String,
    includeLinks: {
      default: true,
      type: Boolean,
    },
    intervalMs: Number,
    path: {
      default: "/api/voice/ops-status",
      type: String,
    },
    title: String,
  },
  setup(props) {
    const options = {
      description: props.description,
      includeLinks: props.includeLinks,
      intervalMs: props.intervalMs,
      title: props.title,
    } satisfies VoiceOpsStatusWidgetOptions;
    const status = useVoiceOpsStatus(props.path, options);

    return () => {
      const model = createVoiceOpsStatusViewModel(
        {
          error: status.error.value,
          isLoading: status.isLoading.value,
          report: status.report.value,
          updatedAt: status.updatedAt.value,
        },
        options,
      );

      return h(
        "section",
        {
          class: [
            "absolute-voice-ops-status",
            `absolute-voice-ops-status--${model.status}`,
          ],
        },
        [
          h("header", { class: "absolute-voice-ops-status__header" }, [
            h(
              "span",
              { class: "absolute-voice-ops-status__eyebrow" },
              model.title,
            ),
            h(
              "strong",
              { class: "absolute-voice-ops-status__label" },
              model.label,
            ),
          ]),
          h(
            "p",
            { class: "absolute-voice-ops-status__description" },
            model.description,
          ),
          h("div", { class: "absolute-voice-ops-status__summary" }, [
            h("span", `${model.passed} passing`),
            h("span", `${Math.max(model.total - model.passed, 0)} failing`),
            h("span", `${model.total} checks`),
          ]),
          h(
            "ul",
            { class: "absolute-voice-ops-status__surfaces" },
            model.surfaces.length > 0
              ? model.surfaces.map((surface) =>
                  h(
                    "li",
                    {
                      class: [
                        "absolute-voice-ops-status__surface",
                        `absolute-voice-ops-status__surface--${surface.status}`,
                      ],
                      key: surface.id,
                    },
                    [h("span", surface.label), h("strong", surface.detail)],
                  ),
                )
              : [
                  h("li", { class: "absolute-voice-ops-status__surface" }, [
                    h("span", "Status"),
                    h("strong", "Waiting for first check"),
                  ]),
                ],
          ),
          model.error
            ? h("p", { class: "absolute-voice-ops-status__error" }, model.error)
            : null,
          model.links.length > 0
            ? h(
                "nav",
                { class: "absolute-voice-ops-status__links" },
                model.links
                  .slice(0, 4)
                  .map((link) =>
                    h("a", { href: link.href, key: link.href }, link.label),
                  ),
              )
            : null,
        ],
      );
    };
  },
});
