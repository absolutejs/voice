import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceSessionSnapshotStore,
  type VoiceSessionSnapshotClientOptions,
} from "../client/sessionSnapshot";

export const useVoiceSessionSnapshot = (
  path: string,
  options: VoiceSessionSnapshotClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceSessionSnapshotStore
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoiceSessionSnapshotStore(path, options);
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
    download: store.download,
    refresh: store.refresh,
  };
};
