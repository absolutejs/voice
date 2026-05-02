import { createVoiceProviderContractsStore as createSharedVoiceProviderContractsStore } from "../client/providerContracts";
import {
  createVoiceProviderContractsViewModel,
  renderVoiceProviderContractsHTML,
  type VoiceProviderContractsWidgetOptions,
} from "../client/providerContractsWidget";

export const createVoiceProviderContracts = <TProvider extends string = string>(
  path = "/api/provider-contracts",
  options: VoiceProviderContractsWidgetOptions = {},
) => {
  const store = createSharedVoiceProviderContractsStore<TProvider>(
    path,
    options,
  );
  return {
    ...store,
    getHTML: () =>
      renderVoiceProviderContractsHTML(store.getSnapshot(), options),
    getViewModel: () =>
      createVoiceProviderContractsViewModel(store.getSnapshot(), options),
  };
};
