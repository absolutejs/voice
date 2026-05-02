import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceOpsActionCenterStore,
  type VoiceOpsActionCenterClientOptions,
} from "../client/opsActionCenter";

export const useVoiceOpsActionCenter = (
  options: VoiceOpsActionCenterClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceOpsActionCenterStore
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoiceOpsActionCenterStore(options);
  }

  const store = storeRef.current;

  useEffect(() => () => store.close(), [store]);

  return {
    ...useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getServerSnapshot,
    ),
    run: store.run,
    setActions: store.setActions,
  };
};
