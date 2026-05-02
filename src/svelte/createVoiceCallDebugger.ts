import {
  createVoiceCallDebuggerStore,
  type VoiceCallDebuggerClientOptions,
} from "../client/callDebugger";
import {
  createVoiceCallDebuggerLaunchViewModel,
  renderVoiceCallDebuggerLaunchHTML,
  type VoiceCallDebuggerLaunchOptions,
} from "../client/callDebuggerWidget";

export const createVoiceCallDebugger = (
  path: string,
  options: VoiceCallDebuggerLaunchOptions = {},
) => {
  const store = createVoiceCallDebuggerStore(path, options);
  return {
    ...store,
    getHTML: () =>
      renderVoiceCallDebuggerLaunchHTML(path, store.getSnapshot(), options),
    getViewModel: () =>
      createVoiceCallDebuggerLaunchViewModel(
        path,
        store.getSnapshot(),
        options,
      ),
  };
};

export type { VoiceCallDebuggerClientOptions };
