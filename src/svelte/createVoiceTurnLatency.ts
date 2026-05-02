import { createVoiceTurnLatencyStore } from "../client/turnLatency";
import {
  createVoiceTurnLatencyViewModel,
  renderVoiceTurnLatencyHTML,
  type VoiceTurnLatencyWidgetOptions,
} from "../client/turnLatencyWidget";

export const createVoiceTurnLatency = (
  path = "/api/turn-latency",
  options: VoiceTurnLatencyWidgetOptions = {},
) => {
  const store = createVoiceTurnLatencyStore(path, options);
  return {
    ...store,
    getHTML: () => renderVoiceTurnLatencyHTML(store.getSnapshot(), options),
    getViewModel: () =>
      createVoiceTurnLatencyViewModel(store.getSnapshot(), options),
  };
};
