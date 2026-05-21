import { computed, Injectable, signal } from "@angular/core";
import type { StoredVoiceTraceEvent } from "../core/trace";
import {
  buildVoiceCostDashboardReport,
  type VoiceCostDashboardOptions,
  type VoiceCostDashboardReport,
} from "../client/costDashboard";

export type VoiceCostDashboardServiceOptions = VoiceCostDashboardOptions & {
  currency?: string;
  title?: string;
};

@Injectable({ providedIn: "root" })
export class VoiceCostDashboardService {
  build(options: VoiceCostDashboardServiceOptions) {
    const events = signal<ReadonlyArray<StoredVoiceTraceEvent>>(options.events);
    const filters = signal({
      bucketBy: options.bucketBy,
      fromMs: options.fromMs,
      toMs: options.toMs,
    });
    const report = computed<VoiceCostDashboardReport>(() => {
      const f = filters();

      return buildVoiceCostDashboardReport({
        bucketBy: f.bucketBy,
        events: events(),
        fromMs: f.fromMs,
        toMs: f.toMs,
      });
    });

    return {
      currency: options.currency ?? "USD",
      report,
      title: options.title ?? "Voice cost dashboard",
      setEvents: (next: ReadonlyArray<StoredVoiceTraceEvent>) =>
        events.set(next),
      setFilters: (next: Partial<typeof options>) =>
        filters.update((current) => ({
          ...current,
          bucketBy: next.bucketBy ?? current.bucketBy,
          fromMs: next.fromMs ?? current.fromMs,
          toMs: next.toMs ?? current.toMs,
        })),
    };
  }
}
