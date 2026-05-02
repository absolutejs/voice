import { onUnmounted, ref, shallowRef } from "vue";
import {
  createVoiceLiveOpsStore,
  type VoiceLiveOpsClientOptions,
  type VoiceLiveOpsAction,
  type VoiceLiveOpsActionResult,
} from "../client/liveOps";

export function useVoiceLiveOps(options: VoiceLiveOpsClientOptions = {}) {
  const store = createVoiceLiveOpsStore(options);
  const error = ref<string | null>(null);
  const isRunning = ref(false);
  const lastResult = shallowRef<VoiceLiveOpsActionResult | undefined>(
    undefined,
  );
  const runningAction = ref<VoiceLiveOpsAction | undefined>(undefined);
  const updatedAt = ref<number | undefined>(undefined);
  const sync = () => {
    const snapshot = store.getSnapshot();
    error.value = snapshot.error;
    isRunning.value = snapshot.isRunning;
    lastResult.value = snapshot.lastResult;
    runningAction.value = snapshot.runningAction;
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
    run: store.run,
    runningAction,
    updatedAt,
  };
}
