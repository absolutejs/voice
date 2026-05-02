import { createVoiceProviderCapabilitiesStore as createSharedVoiceProviderCapabilitiesStore } from "../client/providerCapabilities";
import {
  createVoiceProviderCapabilitiesViewModel,
  renderVoiceProviderCapabilitiesHTML,
  type VoiceProviderCapabilitiesWidgetOptions,
} from "../client/providerCapabilitiesWidget";

export const createVoiceProviderCapabilities = <
  TProvider extends string = string,
>(
  path = "/api/provider-capabilities",
  options: VoiceProviderCapabilitiesWidgetOptions = {},
) => {
  const store = createSharedVoiceProviderCapabilitiesStore<TProvider>(
    path,
    options,
  );
  return {
    ...store,
    getHTML: () =>
      renderVoiceProviderCapabilitiesHTML(store.getSnapshot(), options),
    getViewModel: () =>
      createVoiceProviderCapabilitiesViewModel(store.getSnapshot(), options),
  };
};
