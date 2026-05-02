import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceProviderSimulationControlsStore,
  type VoiceProviderSimulationControlsOptions,
} from "../client/providerSimulationControls";

export const useVoiceProviderSimulationControls = <
  TProvider extends string = string,
>(
  options: VoiceProviderSimulationControlsOptions<TProvider>,
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceProviderSimulationControlsStore<TProvider>
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current =
      createVoiceProviderSimulationControlsStore<TProvider>(options);
  }

  const store = storeRef.current;

  useEffect(() => () => store.close(), [store]);

  return {
    ...useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getServerSnapshot,
    ),
    run: store.run,
  };
};
