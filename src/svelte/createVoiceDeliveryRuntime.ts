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
    getHTML: () => renderVoiceDeliveryRuntimeHTML(store.getSnapshot(), options),
    getSnapshot: store.getSnapshot,
    getViewModel: () =>
      createVoiceDeliveryRuntimeViewModel(store.getSnapshot(), options),
    requeueDeadLetters: store.requeueDeadLetters,
    refresh: store.refresh,
    subscribe: store.subscribe,
    tick: store.tick,
  };
};
