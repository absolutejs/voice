import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceCallDebuggerStore,
  type VoiceCallDebuggerClientOptions,
} from "../client/callDebugger";

export const useVoiceCallDebugger = (
  path: string,
  options: VoiceCallDebuggerClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceCallDebuggerStore
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoiceCallDebuggerStore(path, options);
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
