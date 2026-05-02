import { onUnmounted, ref, shallowRef } from "vue";
import {
  createVoiceRoutingStatusStore,
  type VoiceRoutingStatusClientOptions,
} from "../client/routingStatus";
import type { VoiceRoutingDecisionSummary } from "../resilienceRoutes";

export function useVoiceRoutingStatus(
  path = "/api/routing/latest",
  options: VoiceRoutingStatusClientOptions = {},
) {
  const store = createVoiceRoutingStatusStore(path, options);
  const decision = shallowRef<VoiceRoutingDecisionSummary | null>(null);
  const error = ref<string | null>(null);
  const isLoading = ref(false);
  const updatedAt = ref<number | undefined>(undefined);
  const sync = () => {
    const snapshot = store.getSnapshot();
    decision.value = snapshot.decision;
    error.value = snapshot.error;
    isLoading.value = snapshot.isLoading;
    updatedAt.value = snapshot.updatedAt;
  };
  const unsubscribe = store.subscribe(sync);
  sync();
  void store.refresh().catch(() => {});

  onUnmounted(() => {
    unsubscribe();
    store.close();
  });

  return {
    decision,
    error,
    isLoading,
    refresh: store.refresh,
    updatedAt,
  };
}
