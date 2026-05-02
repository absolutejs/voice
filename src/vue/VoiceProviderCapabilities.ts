import { computed, defineComponent, h } from "vue";
import {
  createVoiceProviderCapabilitiesViewModel,
  type VoiceProviderCapabilitiesWidgetOptions,
} from "../client/providerCapabilitiesWidget";
import { useVoiceProviderCapabilities } from "./useVoiceProviderCapabilities";

export const VoiceProviderCapabilities = defineComponent({
  name: "VoiceProviderCapabilities",
  props: {
    class: {
      default: "",
      type: String,
    },
    description: {
      default: undefined,
      type: String,
    },
    intervalMs: {
      default: 5000,
      type: Number,
    },
    path: {
      default: "/api/provider-capabilities",
      type: String,
    },
    title: {
      default: undefined,
      type: String,
    },
  },
  setup(props) {
    const options = {
      description: props.description,
      intervalMs: props.intervalMs,
      title: props.title,
    } satisfies VoiceProviderCapabilitiesWidgetOptions;
    const capabilities = useVoiceProviderCapabilities(props.path, options);
    const model = computed(() =>
      createVoiceProviderCapabilitiesViewModel(
        {
          error: capabilities.error.value,
          isLoading: capabilities.isLoading.value,
          report: capabilities.report.value,
          updatedAt: capabilities.updatedAt.value,
        },
        options,
      ),
    );

    return () =>
      h(
        "section",
        {
          class: [
            "absolute-voice-provider-capabilities",
            `absolute-voice-provider-capabilities--${model.value.status}`,
            props.class,
          ],
        },
        [
          h(
            "header",
            { class: "absolute-voice-provider-capabilities__header" },
            [
              h(
                "span",
                { class: "absolute-voice-provider-capabilities__eyebrow" },
                model.value.title,
              ),
              h(
                "strong",
                { class: "absolute-voice-provider-capabilities__label" },
                model.value.label,
              ),
            ],
          ),
          h(
            "p",
            { class: "absolute-voice-provider-capabilities__description" },
            model.value.description,
          ),
          model.value.capabilities.length
            ? h(
                "div",
                { class: "absolute-voice-provider-capabilities__providers" },
                model.value.capabilities.map((capability) =>
                  h(
                    "article",
                    {
                      class: [
                        "absolute-voice-provider-capabilities__provider",
                        `absolute-voice-provider-capabilities__provider--${capability.status}`,
                      ],
                      key: `${capability.kind}:${capability.provider}`,
                    },
                    [
                      h("header", [
                        h("strong", capability.label),
                        h("span", capability.status),
                      ]),
                      h("p", capability.detail),
                      h(
                        "dl",
                        capability.rows.map((row) =>
                          h("div", { key: row.label }, [
                            h("dt", row.label),
                            h("dd", row.value),
                          ]),
                        ),
                      ),
                    ],
                  ),
                ),
              )
            : h(
                "p",
                { class: "absolute-voice-provider-capabilities__empty" },
                "Configure provider capabilities to see deployment coverage.",
              ),
          model.value.error
            ? h(
                "p",
                { class: "absolute-voice-provider-capabilities__error" },
                model.value.error,
              )
            : null,
        ],
      );
  },
});
