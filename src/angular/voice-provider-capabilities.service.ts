import { computed, Injectable, signal } from "@angular/core";
import {
  createVoiceProviderCapabilitiesStore,
  type VoiceProviderCapabilitiesClientOptions,
} from "../client/providerCapabilities";
import type { VoiceProviderCapabilityReport } from "../providerCapabilities";

@Injectable({ providedIn: "root" })
export class VoiceProviderCapabilitiesService {
  connect<TProvider extends string = string>(
    path = "/api/provider-capabilities",
    options: VoiceProviderCapabilitiesClientOptions = {},
  ) {
    const store = createVoiceProviderCapabilitiesStore<TProvider>(
      path,
      options,
    );
    const errorSignal = signal<string | null>(null);
    const isLoadingSignal = signal(false);
    const reportSignal = signal<
      VoiceProviderCapabilityReport<TProvider> | undefined
    >(undefined);
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
