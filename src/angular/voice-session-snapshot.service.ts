import { computed, Injectable, signal } from "@angular/core";
import {
  createVoiceSessionSnapshotStore,
  type VoiceSessionSnapshotClientOptions,
} from "../client/sessionSnapshot";
import type { VoiceSessionSnapshot } from "../sessionSnapshot";

@Injectable({ providedIn: "root" })
export class VoiceSessionSnapshotService {
  connect(path: string, options: VoiceSessionSnapshotClientOptions = {}) {
    const store = createVoiceSessionSnapshotStore(path, options);
    const errorSignal = signal<string | null>(null);
    const isLoadingSignal = signal(false);
    const snapshotSignal = signal<VoiceSessionSnapshot | undefined>(undefined);
    const updatedAtSignal = signal<number | undefined>(undefined);
    const sync = () => {
      const state = store.getSnapshot();
      errorSignal.set(state.error);
      isLoadingSignal.set(state.isLoading);
      snapshotSignal.set(state.snapshot);
      updatedAtSignal.set(state.updatedAt);
    };
    const unsubscribe = store.subscribe(sync);
    sync();
    void store.refresh().catch(() => {});

    return {
      close: () => {
        unsubscribe();
        store.close();
      },
      download: store.download,
      error: computed(() => errorSignal()),
      isLoading: computed(() => isLoadingSignal()),
      refresh: store.refresh,
      snapshot: computed(() => snapshotSignal()),
      updatedAt: computed(() => updatedAtSignal()),
    };
  }
}
