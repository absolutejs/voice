import { computed, Injectable, signal } from "@angular/core";
import type { VoiceCallReviewArtifact } from "../testing/review";
import {
  buildReplayTimelineReport,
  type ReplayTimelineReport,
} from "../client/replayTimeline";

export type VoiceReplayTimelineServiceOptions = {
  artifact: VoiceCallReviewArtifact;
  title?: string;
};

@Injectable({ providedIn: "root" })
export class VoiceReplayTimelineService {
  build(options: VoiceReplayTimelineServiceOptions) {
    const artifact = signal<VoiceCallReviewArtifact>(options.artifact);
    const report = computed<ReplayTimelineReport>(() =>
      buildReplayTimelineReport({ artifact: artifact() }),
    );
    return {
      report,
      setArtifact: (next: VoiceCallReviewArtifact) => artifact.set(next),
      title: options.title,
    };
  }
}
