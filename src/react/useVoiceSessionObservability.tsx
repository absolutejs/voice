import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceSessionObservabilityStore,
  type VoiceSessionObservabilityClientOptions,
} from "../client/sessionObservability";

export const useVoiceSessionObservability = (
  path = "/api/voice/session-observability/latest",
  options: VoiceSessionObservabilityClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceSessionObservabilityStore
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoiceSessionObservabilityStore(path, options);
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
