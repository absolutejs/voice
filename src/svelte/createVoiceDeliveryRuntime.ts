import {
  createVoiceDeliveryRuntimeViewModel,
  renderVoiceDeliveryRuntimeHTML,
  type VoiceDeliveryRuntimeWidgetOptions,
} from "../client/deliveryRuntimeWidget";
import { createVoiceDeliveryRuntimeStore } from "../client/deliveryRuntime";

export const createVoiceDeliveryRuntime = (
  path = "/api/voice-delivery-runtime",
  options: VoiceDeliveryRuntimeWidgetOptions = {},
) => {
  const store = createVoiceDeliveryRuntimeStore(path, options);

  return {
    close: store.close,
    getSnapshot: store.getSnapshot,
    refresh: store.refresh,
    requeueDeadLetters: store.requeueDeadLetters,
    subscribe: store.subscribe,
    tick: store.tick,
    getHTML: () => renderVoiceDeliveryRuntimeHTML(store.getSnapshot(), options),
    getViewModel: () =>
      createVoiceDeliveryRuntimeViewModel(store.getSnapshot(), options),
  };
};
