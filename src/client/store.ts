import type {
  VoiceReconnectClientState,
  VoiceStreamState,
  VoiceStoreAction,
  VoiceTurnRecord,
} from "../types";

const createInitialReconnectState = (): VoiceReconnectClientState => ({
  attempts: 0,
  maxAttempts: 0,
  status: "idle",
});

const createInitialState = (): VoiceStreamState => ({
  assistantAudio: [],
  assistantTexts: [],
  call: null,
  error: null,
  isConnected: false,
  sessionMetadata: null,
  scenarioId: null,
  partial: "",
  reconnect: createInitialReconnectState(),
  sessionId: null,
  status: "idle",
  turns: [],
});

export const createVoiceStreamStore = <TResult = unknown>() => {
  let state = createInitialState() as VoiceStreamState<TResult>;
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
          assistantTexts: [...state.assistantTexts, action.text],
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
        state = {
          ...state,
          partial: action.transcript.text,
          turns: state.turns.map((turn) => turn),
        };
        break;
      case "partial":
        state = {
          ...state,
          partial: action.transcript.text,
        };
        break;
      case "replay":
        state = {
          ...state,
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
        state = {
          ...state,
          partial: "",
          turns: [...state.turns, action.turn as VoiceTurnRecord<TResult>],
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
