import { createVoiceRoutingStatusStore as createSharedVoiceRoutingStatusStore } from "../client/routingStatus";
import {
  createVoiceRoutingStatusViewModel,
  renderVoiceRoutingStatusHTML,
  type VoiceRoutingStatusWidgetOptions,
} from "../client/routingStatusWidget";

export const createVoiceRoutingStatus = (
  path = "/api/routing/latest",
  options: VoiceRoutingStatusWidgetOptions = {},
) => {
  const store = createSharedVoiceRoutingStatusStore(path, options);
  return {
    ...store,
    getHTML: () => renderVoiceRoutingStatusHTML(store.getSnapshot(), options),
    getViewModel: () =>
      createVoiceRoutingStatusViewModel(store.getSnapshot(), options),
  };
};
