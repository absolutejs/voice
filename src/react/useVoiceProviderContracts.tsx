import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceProviderContractsStore,
  type VoiceProviderContractsClientOptions,
} from "../client/providerContracts";

export const useVoiceProviderContracts = <TProvider extends string = string>(
  path = "/api/provider-contracts",
  options: VoiceProviderContractsClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceProviderContractsStore<TProvider>
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoiceProviderContractsStore<TProvider>(
      path,
      options,
    );
  }

  const store = storeRef.current;

  useEffect(() => {
    void store.refresh().catch(() => {});
    return () => store.close();
  }, [store]);

  return {
    ...useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getServerSnapshot,
    ),
    refresh: store.refresh,
  };
};
