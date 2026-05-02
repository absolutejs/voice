import { onUnmounted, ref, shallowRef } from "vue";
import {
  createVoiceReconnectProfileEvidenceStore,
  type VoiceReconnectProfileEvidenceClientOptions,
} from "../client/reconnectProfileEvidence";
import type { VoiceReconnectProfileEvidenceSummary } from "../proofTrends";

export function useVoiceReconnectProfileEvidence(
  path = "/api/voice/reconnect-profile-evidence",
  options: VoiceReconnectProfileEvidenceClientOptions = {},
) {
  const store = createVoiceReconnectProfileEvidenceStore(path, options);
  const error = ref<string | null>(null);
  const isLoading = ref(false);
  const report = shallowRef<VoiceReconnectProfileEvidenceSummary | undefined>(
    undefined,
  );
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
