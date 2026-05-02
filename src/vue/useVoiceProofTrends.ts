import { onUnmounted, ref, shallowRef } from "vue";
import {
  createVoiceProofTrendsStore,
  type VoiceProofTrendsClientOptions,
} from "../client/proofTrends";
import type { VoiceProofTrendReport } from "../proofTrends";

export function useVoiceProofTrends(
  path = "/api/voice/proof-trends",
  options: VoiceProofTrendsClientOptions = {},
) {
  const store = createVoiceProofTrendsStore(path, options);
  const error = ref<string | null>(null);
  const isLoading = ref(false);
  const report = shallowRef<VoiceProofTrendReport | undefined>(undefined);
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
  if (typeof window !== "undefined") {
    void store.refresh().catch(() => {});
  }

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
