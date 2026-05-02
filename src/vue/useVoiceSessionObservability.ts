import { onUnmounted, ref, shallowRef } from "vue";
import {
  createVoiceSessionObservabilityStore,
  type VoiceSessionObservabilityClientOptions,
} from "../client/sessionObservability";
import type { VoiceSessionObservabilityReport } from "../sessionObservability";

export function useVoiceSessionObservability(
  path = "/api/voice/session-observability/latest",
  options: VoiceSessionObservabilityClientOptions = {},
) {
  const store = createVoiceSessionObservabilityStore(path, options);
  const error = ref<string | null>(null);
  const isLoading = ref(false);
  const report = shallowRef<VoiceSessionObservabilityReport | null>(null);
  const updatedAt = ref<number | undefined>(undefined);
  const sync = () => {
    const snapshot = store.getSnapshot();
    error.value = snapshot.error;
    isLoading.value = snapshot.isLoading;
    report.value = snapshot.report;
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
    error,
    isLoading,
    refresh: store.refresh,
    report,
    updatedAt,
  };
}
