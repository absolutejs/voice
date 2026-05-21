import {
  createVoiceOpsActionCenterViewModel,
  renderVoiceOpsActionCenterHTML,
  type VoiceOpsActionCenterWidgetOptions,
} from "../client/opsActionCenterWidget";
import { createVoiceOpsActionCenterStore } from "../client/opsActionCenter";

export const createVoiceOpsActionCenter = (
  options: VoiceOpsActionCenterWidgetOptions = {},
) => {
  const store = createVoiceOpsActionCenterStore(options);

  return {
    close: store.close,
    getSnapshot: store.getSnapshot,
    run: store.run,
    setActions: store.setActions,
    subscribe: store.subscribe,
    getHTML: () => renderVoiceOpsActionCenterHTML(store.getSnapshot(), options),
    getViewModel: () =>
      createVoiceOpsActionCenterViewModel(store.getSnapshot(), options),
  };
};
