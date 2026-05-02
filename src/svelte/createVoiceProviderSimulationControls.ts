import { createVoiceProviderSimulationControlsStore } from "../client/providerSimulationControls";
import {
  bindVoiceProviderSimulationControls,
  createVoiceProviderSimulationControlsViewModel,
  renderVoiceProviderSimulationControlsHTML,
} from "../client/providerSimulationControlsWidget";
import type { VoiceProviderSimulationControlsOptions } from "../client/providerSimulationControls";

export const createVoiceProviderSimulationControls = <
  TProvider extends string = string,
>(
  options: VoiceProviderSimulationControlsOptions<TProvider>,
) => {
  const store = createVoiceProviderSimulationControlsStore<TProvider>(options);
  return {
    ...store,
    bind: (element: Element) =>
      bindVoiceProviderSimulationControls(element, store),
    getHTML: () =>
      renderVoiceProviderSimulationControlsHTML(store.getSnapshot(), options),
    getViewModel: () =>
      createVoiceProviderSimulationControlsViewModel(
        store.getSnapshot(),
        options,
      ),
  };
};
