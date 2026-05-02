import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceReadinessFailuresStore,
  type VoiceReadinessFailuresClientOptions,
} from "../client/readinessFailures";

export const useVoiceReadinessFailures = (
  path = "/api/production-readiness",
  options: VoiceReadinessFailuresClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceReadinessFailuresStore
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoiceReadinessFailuresStore(path, options);
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
