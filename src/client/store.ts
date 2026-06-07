import type {
  VoiceReconnectClientState,
  VoiceStreamState,
  VoiceStoreAction,
  VoiceTurnRecord,
} from "../core/types";

const createInitialReconnectState = (): VoiceReconnectClientState => ({
  attempts: 0,
  maxAttempts: 0,
  status: "idle",
});

// Within ONE user turn the STT provider (Deepgram) emits a "final" per detected
// segment, interleaved with "partial" interims for the segment currently being
// spoken. To render the WHOLE utterance live — not just the current phrase —
// the client accumulates finalized segments and shows accumulated-finals +
// current interim. appendSegmentText mirrors the server's mergeTranscriptTexts
// dedup so a re-emitted or refined segment doesn't double up; the authoritative
// committed turn still arrives via the "turn" action.
const appendSegmentText = (accumulated: string, next: string) => {
  const nextText = next.trim().replace(/\s+/g, " ");
  if (!nextText) return accumulated;
  if (!accumulated) return nextText;
  if (accumulated === nextText || accumulated.endsWith(nextText)) {
    return accumulated;
  }
  if (nextText.includes(accumulated)) return nextText;

  return `${accumulated} ${nextText}`;
};

const joinPartial = (finalized: string, interim: string) => {
  const interimText = interim.trim().replace(/\s+/g, " ");
  if (!finalized) return interimText;
  if (!interimText || finalized.endsWith(interimText)) return finalized;

  return `${finalized} ${interimText}`;
};

const createInitialState = (): VoiceStreamState => ({
  assistantAudio: [],
  assistantStreamingText: "",
  assistantTexts: [],
  call: null,
  error: null,
  isConnected: false,
  partial: "",
  reconnect: createInitialReconnectState(),
  scenarioId: null,
  sessionId: null,
  sessionMetadata: null,
  status: "idle",
  turns: [],
});

export const createVoiceStreamStore = <TResult = unknown>() => {
  let state = createInitialState() as VoiceStreamState<TResult>;
  // Finalized segment text accumulated for the in-progress turn (drives the live
  // `partial` display alongside the current interim). Reset when a turn commits.
  let turnFinalText = "";
  const subscribers = new Set<() => void>();

  const notify = () => {
    subscribers.forEach((subscriber) => subscriber());
  };

  const dispatch = (action: VoiceStoreAction<TResult>) => {
    switch (action.type) {
      case "audio":
        state = {
          ...state,
          assistantAudio: [
            ...state.assistantAudio,
            {
              chunk: action.chunk,
              format: action.format,
              receivedAt: action.receivedAt,
              turnId: action.turnId,
            },
          ],
        };
        break;
      case "assistant":
        state = {
          ...state,
          assistantStreamingText: "",
          assistantTexts: [...state.assistantTexts, action.text],
        };
        break;
      case "assistant_delta":
        state = {
          ...state,
          assistantStreamingText: `${state.assistantStreamingText}${action.delta}`,
        };
        break;
      case "complete":
        state = {
          ...state,
          sessionId: action.sessionId,
          status: "completed",
        };
        break;
      case "call_lifecycle":
        state = {
          ...state,
          call: {
            ...state.call,
            disposition:
              action.event.type === "end"
                ? action.event.disposition
                : state.call?.disposition,
            endedAt:
              action.event.type === "end"
                ? action.event.at
                : state.call?.endedAt,
            events: [...(state.call?.events ?? []), action.event],
            lastEventAt: action.event.at,
            startedAt: state.call?.startedAt ?? action.event.at,
          },
          sessionId: action.sessionId,
        };
        break;
      case "connected":
        state = {
          ...state,
          isConnected: true,
          reconnect:
            state.reconnect.status === "reconnecting"
              ? {
                  ...state.reconnect,
                  lastResumedAt: Date.now(),
                  nextAttemptAt: undefined,
                  status: "resumed",
                }
              : state.reconnect,
        };
        break;
      case "connection":
        state = {
          ...state,
          reconnect: action.reconnect,
        };
        break;
      case "disconnected":
        state = {
          ...state,
          isConnected: false,
        };
        break;
      case "error":
        state = {
          ...state,
          error: action.message,
        };
        break;
      case "final":
        // Fold this finalized segment into the accumulated turn text so the
        // whole utterance stays visible — don't replace it with just this
        // segment (that's what made the live transcript show only the current
        // phrase until the turn committed).
        turnFinalText = appendSegmentText(turnFinalText, action.transcript.text);
        state = {
          ...state,
          partial: turnFinalText,
        };
        break;
      case "partial":
        state = {
          ...state,
          partial: joinPartial(turnFinalText, action.transcript.text),
        };
        break;
      case "replay":
        // On reconnect the server replays the in-progress turn text; seed the
        // accumulator from it so segments that finalize after the reconnect
        // append to (rather than erase) what was already spoken.
        turnFinalText = action.partial;
        state = {
          ...state,
          assistantStreamingText: "",
          assistantTexts: [...action.assistantTexts],
          call: action.call ?? null,
          error: null,
          isConnected: action.status === "active",
          partial: action.partial,
          reconnect:
            state.reconnect.status === "reconnecting"
              ? {
                  ...state.reconnect,
                  lastResumedAt: Date.now(),
                  nextAttemptAt: undefined,
                  status: "resumed",
                }
              : state.reconnect,
          scenarioId: action.scenarioId ?? state.scenarioId,
          sessionId: action.sessionId,
          sessionMetadata: action.sessionMetadata ?? state.sessionMetadata,
          status: action.status,
          turns: [...action.turns],
        };
        break;
      case "session":
        state = {
          ...state,
          error: null,
          scenarioId: action.scenarioId ?? state.scenarioId,
          isConnected: action.status === "active",
          sessionId: action.sessionId,
          sessionMetadata: action.sessionMetadata ?? state.sessionMetadata,
          status: action.status,
        };
        break;
      case "turn":
        // Turn committed — the assembled text now lives in `turns`; clear the
        // in-progress accumulator for the next turn.
        turnFinalText = "";
        state = {
          ...state,
          partial: "",
          turns: [...state.turns, action.turn],
        };
        break;
    }

    notify();
  };

  return {
    dispatch,
    getServerSnapshot: () => state,
    getSnapshot: () => state,
    subscribe: (subscriber: () => void) => {
      subscribers.add(subscriber);

      return () => {
        subscribers.delete(subscriber);
      };
    },
  };
};
