import { computed, onUnmounted, shallowRef } from "vue";
import {
  createVoiceCallDebuggerStore,
  type VoiceCallDebuggerClientOptions,
} from "../client/callDebugger";
import type { VoiceCallDebuggerReport } from "../callDebugger";

export function useVoiceCallDebugger(
  path: string,
  options: VoiceCallDebuggerClientOptions = {},
) {
  const store = createVoiceCallDebuggerStore(path, options);
  const error = shallowRef<string | null>(null);
  const isLoading = shallowRef(false);
  const report = shallowRef<VoiceCallDebuggerReport>();
  const updatedAt = shallowRef<number>();
  const sync = () => {
    const state = store.getSnapshot();
    error.value = state.error;
    isLoading.value = state.isLoading;
    report.value = state.report;
    updatedAt.value = state.updatedAt;
  };
  const unsubscribe = store.subscribe(sync);
  sync();
  void store.refresh().catch(() => {});
  onUnmounted(() => {
    unsubscribe();
    store.close();
  });

  return {
    close: store.close,
    error: computed(() => error.value),
    isLoading: computed(() => isLoading.value),
    refresh: store.refresh,
    report: computed(() => report.value),
    updatedAt: computed(() => updatedAt.value),
  };
}
