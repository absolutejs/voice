import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceProviderCapabilitiesStore,
  type VoiceProviderCapabilitiesClientOptions,
} from "../client/providerCapabilities";

export const useVoiceProviderCapabilities = <TProvider extends string = string>(
  path = "/api/provider-capabilities",
  options: VoiceProviderCapabilitiesClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceProviderCapabilitiesStore<TProvider>
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoiceProviderCapabilitiesStore<TProvider>(
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
