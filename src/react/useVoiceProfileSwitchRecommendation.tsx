import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createVoiceProfileSwitchRecommendationStore,
  type VoiceProfileSwitchRecommendationClientOptions,
} from "../client/profileSwitchRecommendation";

export const useVoiceProfileSwitchRecommendation = (
  path = "/api/voice/profile-switch-recommendation",
  options: VoiceProfileSwitchRecommendationClientOptions = {},
) => {
  const storeRef = useRef<ReturnType<
    typeof createVoiceProfileSwitchRecommendationStore
  > | null>(null);

  if (!storeRef.current) {
    storeRef.current = createVoiceProfileSwitchRecommendationStore(
      path,
      options,
    );
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
