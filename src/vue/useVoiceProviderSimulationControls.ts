import { onUnmounted, ref } from "vue";
import {
  createVoiceProviderSimulationControlsStore,
  type VoiceProviderSimulationControlsOptions,
} from "../client/providerSimulationControls";

export function useVoiceProviderSimulationControls<
  TProvider extends string = string,
>(options: VoiceProviderSimulationControlsOptions<TProvider>) {
  const store = createVoiceProviderSimulationControlsStore<TProvider>(options);
  const error = ref<string | null>(null);
  const isRunning = ref(false);
  const lastResult =
    ref<ReturnType<typeof store.getSnapshot>["lastResult"]>(null);
  const mode = ref<ReturnType<typeof store.getSnapshot>["mode"]>(null);
  const provider = ref<TProvider | null>(null);
  const updatedAt = ref<number | undefined>(undefined);
  const sync = () => {
    const snapshot = store.getSnapshot();
    error.value = snapshot.error;
    isRunning.value = snapshot.isRunning;
    lastResult.value = snapshot.lastResult;
    mode.value = snapshot.mode;
    provider.value = snapshot.provider;
    updatedAt.value = snapshot.updatedAt;
  };
  const unsubscribe = store.subscribe(sync);
  sync();

  onUnmounted(() => {
    unsubscribe();
    store.close();
  });

  return {
    error,
    isRunning,
    lastResult,
    mode,
    provider,
    run: store.run,
    updatedAt,
  };
}
