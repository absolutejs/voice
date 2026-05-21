import {
  createVoiceOpsStatusViewModel,
  renderVoiceOpsStatusHTML,
  type VoiceOpsStatusWidgetOptions,
} from "../client/opsStatusWidget";
import { createVoiceOpsStatusStore } from "../client/opsStatus";

export const createVoiceOpsStatus = (
  path = "/api/voice/ops-status",
  options: VoiceOpsStatusWidgetOptions = {},
) => {
  const store = createVoiceOpsStatusStore(path, options);

  return {
    close: store.close,
    getSnapshot: store.getSnapshot,
    refresh: store.refresh,
    subscribe: store.subscribe,
    getHTML: () => renderVoiceOpsStatusHTML(store.getSnapshot(), options),
    getViewModel: () =>
      createVoiceOpsStatusViewModel(store.getSnapshot(), options),
  };
};
