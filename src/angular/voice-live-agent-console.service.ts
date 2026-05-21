import { computed, Injectable, signal } from "@angular/core";
import {
  createLiveAgentConsole,
  type CreateLiveAgentConsoleOptions,
  type LiveAgentConsole,
  type LiveAgentConsoleState,
} from "../client/liveAgentConsole";

export type VoiceLiveAgentConsoleServiceOptions =
  CreateLiveAgentConsoleOptions & {
    takeoverButtonLabel?: string;
    title?: string;
  };

@Injectable({ providedIn: "root" })
export class VoiceLiveAgentConsoleService {
  build(options: VoiceLiveAgentConsoleServiceOptions) {
    const console: LiveAgentConsole = createLiveAgentConsole(options);
    const stateSignal = signal<LiveAgentConsoleState>(console.getState());
    const unsubscribe = console.subscribe(() => {
      stateSignal.set(console.getState());
    });

    return {
      releaseTakeover: () => console.releaseTakeover(),
      setCaller: (caller: Parameters<LiveAgentConsole["setCaller"]>[0]) =>
        console.setCaller(caller),
      state: computed(() => stateSignal()),
      stop: () => unsubscribe(),
      takeover: (reason?: string) => console.takeover(reason),
      takeoverButtonLabel: options.takeoverButtonLabel ?? "Take over",
      title: options.title ?? "Live agent console",
    };
  }
}
