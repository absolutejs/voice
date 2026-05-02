import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceProfileComparisonStore,
  type VoiceProfileComparisonClientOptions,
} from "../client/profileComparison";

export const useVoiceProfileComparison = (
  path = "/api/voice/real-call-profile-history",
  options: VoiceProfileComparisonClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceProfileComparisonStore
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoiceProfileComparisonStore(path, options);
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
