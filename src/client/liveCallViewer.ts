import type { VoiceAgentUIState } from "../core/agentState";
import { deriveVoiceAgentUIState } from "../core/agentState";

export type LiveCallEventKind =
  | "agent_audio"
  | "agent_text"
  | "lifecycle"
  | "transcript"
  | "tool";

export type LiveCallTimelineEvent = {
  at: number;
  detail?: string;
  kind: LiveCallEventKind;
  title: string;
};

export type LiveCallViewState = {
  agentState: VoiceAgentUIState;
  callDurationMs: number;
  events: LiveCallTimelineEvent[];
  isConnected: boolean;
  isLiveListening: boolean;
  lastAssistantAt?: number;
  lastTranscriptAt?: number;
  partialTranscript: string;
  sessionId: string;
};

const EVENT_BUFFER_LIMIT = 200;

export type CreateLiveCallViewerOptions = {
  bufferLimit?: number;
  sessionId: string;
  startedAt?: number;
};

export type LiveCallViewer = {
  applyControl: (control: { reason?: string; type: string }) => void;
  applyEvent: (event: LiveCallTimelineEvent) => void;
  applyMonitorEvent: (event: {
    payload: Record<string, unknown>;
    type: string;
  }) => void;
  getState: () => LiveCallViewState;
  noteAgentAudio: (at?: number) => void;
  notePartial: (text: string, at?: number) => void;
  noteTranscript: (text: string, at?: number) => void;
  reset: (sessionId: string, startedAt?: number) => void;
  subscribe: (subscriber: () => void) => () => void;
};

export const createLiveCallViewer = (
  options: CreateLiveCallViewerOptions,
): LiveCallViewer => {
  const bufferLimit = options.bufferLimit ?? EVENT_BUFFER_LIMIT;
  const subscribers = new Set<() => void>();
  let state: LiveCallViewState = {
    agentState: "idle",
    callDurationMs: 0,
    events: [],
    isConnected: true,
    isLiveListening: true,
    partialTranscript: "",
    sessionId: options.sessionId,
  };
  const startedAt = options.startedAt ?? Date.now();

  const notify = () => {
    for (const subscriber of subscribers) subscriber();
  };
  const update = (next: Partial<LiveCallViewState>) => {
    state = { ...state, ...next };
    state.callDurationMs = Math.max(0, Date.now() - startedAt);
    state.agentState = deriveVoiceAgentUIState({
      hasActivePartial: state.partialTranscript.length > 0,
      isConnected: state.isConnected,
      isPlaying: false,
      isRecording: state.isLiveListening,
      lastAssistantAt: state.lastAssistantAt,
      lastTranscriptAt: state.lastTranscriptAt,
    });
    notify();
  };

  const pushEvent = (event: LiveCallTimelineEvent) => {
    const next = state.events.concat(event);
    if (next.length > bufferLimit) {
      next.splice(0, next.length - bufferLimit);
    }
    update({ events: next });
  };

  return {
    applyEvent: pushEvent,
    applyControl: (control) => {
      pushEvent({
        at: Date.now(),
        detail: control.reason,
        kind: "lifecycle",
        title: `control:${control.type}`,
      });
    },
    applyMonitorEvent: ({ payload, type }) => {
      pushEvent({
        at: Date.now(),
        detail: JSON.stringify(payload).slice(0, 240),
        kind: type === "call.lifecycle" ? "lifecycle" : "lifecycle",
        title: type,
      });
    },
    getState: () => state,
    noteAgentAudio: (at) => {
      const ts = at ?? Date.now();
      update({ lastAssistantAt: ts });
      pushEvent({
        at: ts,
        kind: "agent_audio",
        title: "Agent audio frame",
      });
    },
    notePartial: (text, at) => {
      update({ partialTranscript: text });
      if (text) {
        pushEvent({
          at: at ?? Date.now(),
          detail: text,
          kind: "transcript",
          title: "Partial",
        });
      }
    },
    noteTranscript: (text, at) => {
      const ts = at ?? Date.now();
      update({ lastTranscriptAt: ts, partialTranscript: "" });
      pushEvent({
        at: ts,
        detail: text,
        kind: "transcript",
        title: "Final transcript",
      });
    },
    reset: (sessionId, startedAtOverride) => {
      state = {
        agentState: "idle",
        callDurationMs: 0,
        events: [],
        isConnected: true,
        isLiveListening: true,
        partialTranscript: "",
        sessionId,
      };
      if (typeof startedAtOverride === "number") {
        // start fresh window
      }
      notify();
    },
    subscribe: (subscriber) => {
      subscribers.add(subscriber);

      return () => subscribers.delete(subscriber);
    },
  };
};
