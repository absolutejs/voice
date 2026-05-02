import { computed, defineComponent, h } from "vue";
import {
  createVoiceProviderStatusViewModel,
  type VoiceProviderStatusWidgetOptions,
} from "../client/providerStatusWidget";
import { useVoiceProviderStatus } from "./useVoiceProviderStatus";

export const VoiceProviderStatus = defineComponent({
  name: "VoiceProviderStatus",
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
      default: "/api/provider-status",
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
    } satisfies VoiceProviderStatusWidgetOptions;
    const status = useVoiceProviderStatus(props.path, options);
    const model = computed(() =>
      createVoiceProviderStatusViewModel(
        {
          error: status.error.value,
          isLoading: status.isLoading.value,
          providers: status.providers.value,
          updatedAt: status.updatedAt.value,
        },
        options,
      ),
    );

    return () =>
      h(
        "section",
        {
          class: [
            "absolute-voice-provider-status",
            `absolute-voice-provider-status--${model.value.status}`,
            props.class,
          ],
        },
        [
          h("header", { class: "absolute-voice-provider-status__header" }, [
            h(
              "span",
              { class: "absolute-voice-provider-status__eyebrow" },
              model.value.title,
            ),
            h(
              "strong",
              { class: "absolute-voice-provider-status__label" },
              model.value.label,
            ),
          ]),
          h(
            "p",
            { class: "absolute-voice-provider-status__description" },
            model.value.description,
          ),
          model.value.providers.length
            ? h(
                "div",
                { class: "absolute-voice-provider-status__providers" },
                model.value.providers.map((provider) =>
                  h(
                    "article",
                    {
                      class: [
                        "absolute-voice-provider-status__provider",
                        `absolute-voice-provider-status__provider--${provider.status}`,
                      ],
                      key: provider.provider,
                    },
                    [
                      h("header", [
                        h("strong", provider.label),
                        h("span", provider.status),
                      ]),
                      h("p", provider.detail),
                      h(
                        "dl",
                        provider.rows.map((row) =>
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
                { class: "absolute-voice-provider-status__empty" },
                "Run voice traffic to see provider health.",
              ),
          model.value.error
            ? h(
                "p",
                { class: "absolute-voice-provider-status__error" },
                model.value.error,
              )
            : null,
        ],
      );
  },
});
