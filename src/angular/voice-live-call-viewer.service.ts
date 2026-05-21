import { computed, Injectable, signal } from "@angular/core";
import {
  createLiveCallViewer,
  type CreateLiveCallViewerOptions,
  type LiveCallViewState,
  type LiveCallViewer,
} from "../client/liveCallViewer";

export type VoiceLiveCallViewerServiceOptions = CreateLiveCallViewerOptions & {
  title?: string;
  viewer?: LiveCallViewer;
};

@Injectable({ providedIn: "root" })
export class VoiceLiveCallViewerService {
  build(options: VoiceLiveCallViewerServiceOptions) {
    const viewer = options.viewer ?? createLiveCallViewer(options);
    const stateSignal = signal<LiveCallViewState>(viewer.getState());
    const unsubscribe = viewer.subscribe(() => {
      stateSignal.set(viewer.getState());
    });

    return {
      noteAgentAudio: (at?: number) => viewer.noteAgentAudio(at),
      notePartial: (text: string, at?: number) => viewer.notePartial(text, at),
      noteTranscript: (text: string, at?: number) =>
        viewer.noteTranscript(text, at),
      reset: (sessionId: string, startedAt?: number) =>
        viewer.reset(sessionId, startedAt),
      state: computed(() => stateSignal()),
      stop: () => unsubscribe(),
      title: options.title ?? "Live call",
    };
  }
}
