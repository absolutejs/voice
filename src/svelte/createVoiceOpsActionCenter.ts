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
    getHTML: () => renderVoiceOpsActionCenterHTML(store.getSnapshot(), options),
    getSnapshot: store.getSnapshot,
    getViewModel: () =>
      createVoiceOpsActionCenterViewModel(store.getSnapshot(), options),
    run: store.run,
    setActions: store.setActions,
    subscribe: store.subscribe,
  };
};
