import { defineComponent, h } from "vue";
import {
  createVoiceDeliveryRuntimeViewModel,
  type VoiceDeliveryRuntimeWidgetOptions,
} from "../client/deliveryRuntimeWidget";
import { useVoiceDeliveryRuntime } from "./useVoiceDeliveryRuntime";

export const VoiceDeliveryRuntime = defineComponent({
  name: "VoiceDeliveryRuntime",
  props: {
    description: String,
    includeActions: {
      default: true,
      type: Boolean,
    },
    intervalMs: Number,
    path: {
      default: "/api/voice-delivery-runtime",
      type: String,
    },
    title: String,
  },
  setup(props) {
    const options = {
      description: props.description,
      intervalMs: props.intervalMs,
      title: props.title,
    } satisfies VoiceDeliveryRuntimeWidgetOptions;
    const runtime = useVoiceDeliveryRuntime(props.path, options);

    return () => {
      const model = createVoiceDeliveryRuntimeViewModel(
        {
          error: runtime.error.value,
          actionError: runtime.actionError.value,
          actionStatus: runtime.actionStatus.value,
          isLoading: runtime.isLoading.value,
          report: runtime.report.value,
          updatedAt: runtime.updatedAt.value,
        },
        options,
      );
      const hasDeadLetters = model.surfaces.some(
        (surface) => surface.deadLettered > 0,
      );

      return h(
        "section",
        {
          class: [
            "absolute-voice-delivery-runtime",
            `absolute-voice-delivery-runtime--${model.status}`,
          ],
        },
        [
          h("header", { class: "absolute-voice-delivery-runtime__header" }, [
            h(
              "span",
              { class: "absolute-voice-delivery-runtime__eyebrow" },
              model.title,
            ),
            h(
              "strong",
              { class: "absolute-voice-delivery-runtime__label" },
              model.label,
            ),
          ]),
          h(
            "p",
            { class: "absolute-voice-delivery-runtime__description" },
            model.description,
          ),
          h(
            "ul",
            { class: "absolute-voice-delivery-runtime__surfaces" },
            model.surfaces.map((surface) =>
              h(
                "li",
                {
                  class: [
                    "absolute-voice-delivery-runtime__surface",
                    `absolute-voice-delivery-runtime__surface--${surface.status}`,
                  ],
                  key: surface.id,
                },
                [
                  h("span", surface.label),
                  h("strong", surface.detail),
                  h(
                    "small",
                    `${surface.failed} failed / ${surface.deadLettered} dead-lettered`,
                  ),
                ],
              ),
            ),
          ),
          props.includeActions
            ? h("div", { class: "absolute-voice-delivery-runtime__actions" }, [
                h(
                  "button",
                  {
                    disabled: model.actionStatus === "running",
                    onClick: () => {
                      void runtime.tick().catch(() => {});
                    },
                    type: "button",
                  },
                  model.actionStatus === "running"
                    ? "Working..."
                    : "Tick workers",
                ),
                h(
                  "button",
                  {
                    disabled:
                      model.actionStatus === "running" || !hasDeadLetters,
                    onClick: () => {
                      void runtime.requeueDeadLetters().catch(() => {});
                    },
                    type: "button",
                  },
                  "Requeue dead letters",
                ),
              ])
            : null,
          model.actionError
            ? h(
                "p",
                { class: "absolute-voice-delivery-runtime__error" },
                model.actionError,
              )
            : null,
          model.error
            ? h(
                "p",
                { class: "absolute-voice-delivery-runtime__error" },
                model.error,
              )
            : null,
        ],
      );
    };
  },
});
