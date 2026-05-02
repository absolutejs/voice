import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoicePlatformCoverageStore,
  type VoicePlatformCoverageClientOptions,
} from "../client/platformCoverage";

export const useVoicePlatformCoverage = (
  path = "/api/voice/platform-coverage",
  options: VoicePlatformCoverageClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoicePlatformCoverageStore
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoicePlatformCoverageStore(path, options);
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
