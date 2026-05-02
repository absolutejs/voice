import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceTraceTimelineStore,
  type VoiceTraceTimelineClientOptions,
} from "../client/traceTimeline";

export const useVoiceTraceTimeline = (
  path = "/api/voice-traces",
  options: VoiceTraceTimelineClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceTraceTimelineStore
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoiceTraceTimelineStore(path, options);
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
