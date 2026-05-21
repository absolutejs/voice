import { computed, Injectable, signal } from "@angular/core";
import {
  createVoiceCallPlayer,
  formatVoiceCallPlayerTimestamp,
  type VoiceCallPlayer,
  type VoiceCallPlayerOptions,
  type VoiceCallPlayerState,
} from "../client/callPlayer";

export type VoiceCallPlayerServiceOptions = VoiceCallPlayerOptions & {
  title?: string;
};

@Injectable({ providedIn: "root" })
export class VoiceCallPlayerService {
  build(options: VoiceCallPlayerServiceOptions = {}) {
    const player: VoiceCallPlayer = createVoiceCallPlayer(options);
    const stateSignal = signal<VoiceCallPlayerState>(player.getState());
    const unsubscribe = player.subscribe(() => {
      stateSignal.set(player.getState());
    });

    return {
      formatTimestamp: formatVoiceCallPlayerTimestamp,
      pause: () => player.pause(),
      play: () => player.play(),
      seekMs: (ms: number) => player.seekMs(ms),
      seekToTranscript: (id: string) => player.seekToTranscript(id),
      setPlaybackRate: (rate: number) => player.setPlaybackRate(rate),
      setTime: (ms: number) => player.setTime(ms),
      state: computed(() => stateSignal()),
      stop: () => unsubscribe(),
      title: options.title ?? "Call replay",
      transcripts: () => player.transcripts(),
    };
  }
}
