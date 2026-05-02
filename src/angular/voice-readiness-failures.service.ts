import { computed, Injectable, signal } from "@angular/core";
import {
  createVoiceReadinessFailuresStore,
  type VoiceReadinessFailuresClientOptions,
} from "../client/readinessFailures";
import type { VoiceProductionReadinessReport } from "../productionReadiness";

@Injectable({ providedIn: "root" })
export class VoiceReadinessFailuresService {
  connect(
    path = "/api/production-readiness",
    options: VoiceReadinessFailuresClientOptions = {},
  ) {
    const store = createVoiceReadinessFailuresStore(path, options);
    const errorSignal = signal<string | null>(null);
    const isLoadingSignal = signal(false);
    const reportSignal = signal<VoiceProductionReadinessReport | undefined>(
      undefined,
    );
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
    if (typeof window !== "undefined") {
      void store.refresh().catch(() => {});
    }

    return {
      close: () => {
        unsubscribe();
        store.close();
      },
      error: computed(() => errorSignal()),
      explanations: computed(
        () =>
          reportSignal()?.checks.filter(
            (check) => check.status !== "pass" && !!check.gateExplanation,
          ) ?? [],
      ),
      isLoading: computed(() => isLoadingSignal()),
      refresh: store.refresh,
      report: computed(() => reportSignal()),
      updatedAt: computed(() => updatedAtSignal()),
    };
  }
}
