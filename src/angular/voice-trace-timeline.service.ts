import { computed, Injectable, signal } from "@angular/core";
import {
  createVoiceTraceTimelineStore,
  type VoiceTraceTimelineClientOptions,
} from "../client/traceTimeline";
import type { VoiceTraceTimelineReport } from "../traceTimeline";

@Injectable({ providedIn: "root" })
export class VoiceTraceTimelineService {
  connect(
    path = "/api/voice-traces",
    options: VoiceTraceTimelineClientOptions = {},
  ) {
    const store = createVoiceTraceTimelineStore(path, options);
    const errorSignal = signal<string | null>(null);
    const isLoadingSignal = signal(false);
    const reportSignal = signal<VoiceTraceTimelineReport | null>(null);
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
