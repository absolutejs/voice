import { createVoiceSessionObservabilityStore as createSharedVoiceSessionObservabilityStore } from "../client/sessionObservability";
import {
  createVoiceSessionObservabilityViewModel,
  renderVoiceSessionObservabilityHTML,
  type VoiceSessionObservabilityWidgetOptions,
} from "../client/sessionObservabilityWidget";

export const createVoiceSessionObservability = (
  path = "/api/voice/session-observability/latest",
  options: VoiceSessionObservabilityWidgetOptions = {},
) => {
  const store = createSharedVoiceSessionObservabilityStore(path, options);
  return {
    ...store,
    getHTML: () =>
      renderVoiceSessionObservabilityHTML(store.getSnapshot(), options),
    getViewModel: () =>
      createVoiceSessionObservabilityViewModel(store.getSnapshot(), options),
  };
};
