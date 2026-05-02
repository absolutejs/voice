import { computed, Injectable, signal } from "@angular/core";
import {
  createVoiceSessionObservabilityStore,
  type VoiceSessionObservabilityClientOptions,
} from "../client/sessionObservability";
import type { VoiceSessionObservabilityReport } from "../sessionObservability";

@Injectable({ providedIn: "root" })
export class VoiceSessionObservabilityService {
  connect(
    path = "/api/voice/session-observability/latest",
    options: VoiceSessionObservabilityClientOptions = {},
  ) {
    const store = createVoiceSessionObservabilityStore(path, options);
    const errorSignal = signal<string | null>(null);
    const isLoadingSignal = signal(false);
    const reportSignal = signal<VoiceSessionObservabilityReport | null>(null);
    const updatedAtSignal = signal<number | undefined>(undefined);
    const sync = () => {
      const snapshot = store.getSnapshot();
      errorSignal.set(snapshot.error);
      isLoadingSignal.set(snapshot.isLoading);
      reportSignal.set(snapshot.report);
      updatedAtSignal.set(snapshot.updatedAt);
    };
    const unsubscribe = store.subscribe(sync);
    sync();
    void store.refresh().catch(() => {});

    return {
      close: () => {
        unsubscribe();
        store.close();
      },
      error: computed(() => errorSignal()),
      isLoading: computed(() => isLoadingSignal()),
      refresh: store.refresh,
      report: computed(() => reportSignal()),
      updatedAt: computed(() => updatedAtSignal()),
    };
  }
}
