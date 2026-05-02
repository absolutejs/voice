import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceWorkflowStatusStore,
  type VoiceWorkflowStatusClientOptions,
} from "../client/workflowStatus";

export const useVoiceWorkflowStatus = (
  path = "/evals/scenarios/json",
  options: VoiceWorkflowStatusClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceWorkflowStatusStore
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoiceWorkflowStatusStore(path, options);
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
