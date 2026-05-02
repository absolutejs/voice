import {
  createVoiceLiveOpsStore,
  type VoiceLiveOpsClientOptions,
} from "../client/liveOps";
import {
  mountVoiceLiveOps,
  renderVoiceLiveOpsHTML,
  type VoiceLiveOpsWidgetOptions,
} from "../client/liveOpsWidget";

export const createVoiceLiveOps = (
  options: VoiceLiveOpsClientOptions | VoiceLiveOpsWidgetOptions = {},
) => {
  const store = createVoiceLiveOpsStore(options);

  return {
    close: store.close,
    getHTML: () => renderVoiceLiveOpsHTML(store.getSnapshot(), options),
    getSnapshot: store.getSnapshot,
    mount: (element: Element) =>
      mountVoiceLiveOps(element, options as VoiceLiveOpsWidgetOptions),
    run: store.run,
    subscribe: store.subscribe,
  };
};
