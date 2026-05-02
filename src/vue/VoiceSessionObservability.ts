import { defineComponent, h, onBeforeUnmount, ref } from "vue";
import {
  createVoiceSessionObservabilityViewModel,
  type VoiceSessionObservabilityWidgetOptions,
  type VoiceSessionObservabilityViewModel,
} from "../client/sessionObservabilityWidget";
import { createVoiceSessionObservabilityStore } from "../client/sessionObservability";

export const VoiceSessionObservability = defineComponent({
  name: "VoiceSessionObservability",
  props: {
    description: String,
    intervalMs: Number,
    maxTurns: Number,
    path: {
      default: "/api/voice/session-observability/latest",
      type: String,
    },
    title: String,
  },
  setup(props) {
    const options: VoiceSessionObservabilityWidgetOptions = {
      description: props.description,
      intervalMs: props.intervalMs,
      maxTurns: props.maxTurns,
      title: props.title,
    };
    const store = createVoiceSessionObservabilityStore(props.path, options);
    const model = ref<VoiceSessionObservabilityViewModel>(
      createVoiceSessionObservabilityViewModel(store.getSnapshot(), options),
    );
    const sync = () => {
      model.value = createVoiceSessionObservabilityViewModel(
        store.getSnapshot(),
        options,
      );
    };
    const unsubscribe = store.subscribe(sync);
    void store.refresh().catch(() => {});

    onBeforeUnmount(() => {
      unsubscribe();
      store.close();
    });

    return () =>
      h(
        "section",
        {
          class: [
            "absolute-voice-session-observability",
            `absolute-voice-session-observability--${model.value.status}`,
          ],
        },
        [
          h(
            "header",
            { class: "absolute-voice-session-observability__header" },
            [
              h(
                "span",
                { class: "absolute-voice-session-observability__eyebrow" },
                model.value.title,
              ),
              h(
                "strong",
                { class: "absolute-voice-session-observability__label" },
                model.value.label,
              ),
            ],
          ),
          h(
            "p",
            { class: "absolute-voice-session-observability__description" },
            model.value.description,
          ),
          model.value.links.length
            ? h(
                "p",
                { class: "absolute-voice-session-observability__actions" },
                model.value.links.map((link) =>
                  h("a", { href: link.href }, link.label),
                ),
              )
            : null,
          model.value.turns.length
            ? h(
                "div",
                { class: "absolute-voice-session-observability__turns" },
                model.value.turns.map((turn) =>
                  h(
                    "article",
                    { class: "absolute-voice-session-observability__turn" },
                    [
                      h("header", [
                        h("strong", turn.turnId),
                        h("span", turn.durationLabel),
                      ]),
                      h("p", turn.label),
                    ],
                  ),
                ),
              )
            : h(
                "p",
                { class: "absolute-voice-session-observability__empty" },
                "Open a voice session to see turn waterfalls.",
              ),
          model.value.error
            ? h(
                "p",
                { class: "absolute-voice-session-observability__error" },
                model.value.error,
              )
            : null,
        ],
      );
  },
});
