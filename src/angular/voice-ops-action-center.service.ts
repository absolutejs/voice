import { computed, Injectable, signal } from "@angular/core";
import {
  createVoiceOpsActionCenterStore,
  type VoiceOpsActionCenterClientOptions,
  type VoiceOpsActionDescriptor,
  type VoiceOpsActionRunResult,
} from "../client/opsActionCenter";

@Injectable({ providedIn: "root" })
export class VoiceOpsActionCenterService {
  connect(options: VoiceOpsActionCenterClientOptions = {}) {
    const store = createVoiceOpsActionCenterStore(options);
    const actionsSignal = signal<VoiceOpsActionDescriptor[]>([]);
    const errorSignal = signal<string | null>(null);
    const isRunningSignal = signal(false);
    const lastResultSignal = signal<VoiceOpsActionRunResult | undefined>(
      undefined,
    );
    const runningActionIdSignal = signal<string | undefined>(undefined);
    const sync = () => {
      const snapshot = store.getSnapshot();
      actionsSignal.set(snapshot.actions);
      errorSignal.set(snapshot.error);
      isRunningSignal.set(snapshot.isRunning);
      lastResultSignal.set(snapshot.lastResult);
      runningActionIdSignal.set(snapshot.runningActionId);
    };
    const unsubscribe = store.subscribe(sync);
    sync();

    return {
      actions: computed(() => actionsSignal()),
      close: () => {
        unsubscribe();
        store.close();
      },
      error: computed(() => errorSignal()),
      isRunning: computed(() => isRunningSignal()),
      lastResult: computed(() => lastResultSignal()),
      run: store.run,
      runningActionId: computed(() => runningActionIdSignal()),
      setActions: store.setActions,
    };
  }
}
