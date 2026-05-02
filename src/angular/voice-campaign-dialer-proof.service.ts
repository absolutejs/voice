import { computed, Injectable, signal } from "@angular/core";
import {
  createVoiceCampaignDialerProofStore,
  type VoiceCampaignDialerProofClientOptions,
} from "../client/campaignDialerProof";
import type {
  VoiceCampaignDialerProofReport,
  VoiceCampaignDialerProofStatus,
} from "../campaignDialers";

@Injectable({ providedIn: "root" })
export class VoiceCampaignDialerProofService {
  connect(
    path = "/api/voice/campaigns/dialer-proof",
    options: VoiceCampaignDialerProofClientOptions = {},
  ) {
    const store = createVoiceCampaignDialerProofStore(path, options);
    const errorSignal = signal<string | null>(null);
    const isLoadingSignal = signal(false);
    const reportSignal = signal<VoiceCampaignDialerProofReport | undefined>(
      undefined,
    );
    const statusSignal = signal<VoiceCampaignDialerProofStatus | undefined>(
      undefined,
    );
    const updatedAtSignal = signal<number | undefined>(undefined);
    const sync = () => {
      const snapshot = store.getSnapshot();
      errorSignal.set(snapshot.error);
      isLoadingSignal.set(snapshot.isLoading);
      reportSignal.set(snapshot.report);
      statusSignal.set(snapshot.status);
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
      runProof: store.runProof,
      status: computed(() => statusSignal()),
      updatedAt: computed(() => updatedAtSignal()),
    };
  }
}
