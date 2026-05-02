import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceReconnectProfileEvidenceStore,
  type VoiceReconnectProfileEvidenceClientOptions,
} from "../client/reconnectProfileEvidence";

export const useVoiceReconnectProfileEvidence = (
  path = "/api/voice/reconnect-profile-evidence",
  options: VoiceReconnectProfileEvidenceClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceReconnectProfileEvidenceStore
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoiceReconnectProfileEvidenceStore(path, options);
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
