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
    getSnapshot: store.getSnapshot,
    run: store.run,
    subscribe: store.subscribe,
    getHTML: () => renderVoiceLiveOpsHTML(store.getSnapshot(), options),
    mount: (element: Element) => mountVoiceLiveOps(element, options),
  };
};
