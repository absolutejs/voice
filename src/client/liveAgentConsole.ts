import {
  createLiveCallViewer,
  type CreateLiveCallViewerOptions,
  type LiveCallTimelineEvent,
  type LiveCallViewState,
  type LiveCallViewer,
} from "./liveCallViewer";
import type { VoiceCallerMemorySnapshot } from "../core/callerMemory";

export type LiveAgentConsoleState = {
  caller?: VoiceCallerMemorySnapshot;
  hasTakeover: boolean;
  recentTimeline: LiveCallTimelineEvent[];
  takeoverAt?: number;
  takeoverReason?: string;
  view: LiveCallViewState;
};

export type CreateLiveAgentConsoleOptions = CreateLiveCallViewerOptions & {
  /** Recent timeline window length. Default 12. */
  recentLimit?: number;
  /** Resolves the caller memory snapshot for this session (fetched once on attach). */
  resolveCaller?: () =>
    | Promise<VoiceCallerMemorySnapshot | undefined>
    | VoiceCallerMemorySnapshot
    | undefined;
};

export type LiveAgentConsole = {
  getState: () => LiveAgentConsoleState;
  noteAgentAudio: (at?: number) => void;
  notePartial: (text: string, at?: number) => void;
  noteTranscript: (text: string, at?: number) => void;
  releaseTakeover: () => void;
  setCaller: (caller: VoiceCallerMemorySnapshot | undefined) => void;
  subscribe: (listener: () => void) => () => void;
  takeover: (reason?: string) => void;
  viewer: LiveCallViewer;
};

export const createLiveAgentConsole = (
  options: CreateLiveAgentConsoleOptions,
): LiveAgentConsole => {
  const viewer = createLiveCallViewer(options);
  const recentLimit = Math.max(1, options.recentLimit ?? 12);
  let caller: VoiceCallerMemorySnapshot | undefined;
  let hasTakeover = false;
  let takeoverAt: number | undefined;
  let takeoverReason: string | undefined;
  const subscribers = new Set<() => void>();

  const buildState = (): LiveAgentConsoleState => {
    const view = viewer.getState();

    return {
      caller,
      hasTakeover,
      recentTimeline: view.events.slice(-recentLimit),
      takeoverAt,
      takeoverReason,
      view,
    };
  };

  const notify = () => {
    for (const subscriber of subscribers) subscriber();
  };

  const unsubscribeViewer = viewer.subscribe(() => {
    notify();
  });

  if (options.resolveCaller) {
    void Promise.resolve(options.resolveCaller()).then((snapshot) => {
      caller = snapshot;
      notify();
    });
  }

  return {
    getState: buildState,
    viewer,
    noteAgentAudio: (at) => viewer.noteAgentAudio(at),
    notePartial: (text, at) => viewer.notePartial(text, at),
    noteTranscript: (text, at) => viewer.noteTranscript(text, at),
    releaseTakeover: () => {
      if (!hasTakeover) return;
      hasTakeover = false;
      takeoverAt = undefined;
      takeoverReason = undefined;
      viewer.applyControl({ reason: "released", type: "takeover.release" });
      notify();
    },
    setCaller: (snapshot) => {
      caller = snapshot;
      notify();
    },
    subscribe: (listener) => {
      subscribers.add(listener);

      return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) unsubscribeViewer();
      };
    },
    takeover: (reason) => {
      if (hasTakeover) return;
      hasTakeover = true;
      takeoverAt = Date.now();
      takeoverReason = reason;
      viewer.applyControl({ reason, type: "takeover.engaged" });
      notify();
    },
  };
};
