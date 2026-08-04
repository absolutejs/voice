import { bindVoiceHTMX } from "./htmx";
import { createMicrophoneCapture } from "./microphone";
import { createVoiceStream } from "./createVoiceStream";
import { resolveVoiceRuntimePreset } from "../core/presets";
import type {
  VoiceController,
  VoiceControllerOptions,
  VoiceControllerState,
  VoiceHTMXBindingOptions,
} from "../core/types";

const createInitialState = <TResult>(
  stream: ReturnType<typeof createVoiceStream<TResult>>,
): VoiceControllerState<TResult> => ({
  assistantAudio: [...stream.assistantAudio],
  assistantStreamingText: stream.assistantStreamingText,
  assistantTexts: [...stream.assistantTexts],
  call: stream.call,
  error: stream.error,
  isConnected: stream.isConnected,
  isRecording: false,
  paused: stream.paused,
  pauseExpiresAt: stream.pauseExpiresAt,
  partial: stream.partial,
  playbackRate: stream.playbackRate,
  reconnect: stream.reconnect,
  recordingError: null,
  sessionId: stream.sessionId,
  sessionMetadata: stream.sessionMetadata,
  scenarioId: stream.scenarioId,
  status: stream.status,
  turns: [...stream.turns],
});

export const createVoiceController = <TResult = unknown>(
  path: string,
  options: VoiceControllerOptions = {},
): VoiceController<TResult> => {
  const preset = resolveVoiceRuntimePreset(options.preset);
  const stream = createVoiceStream<TResult>(path, {
    ...preset.connection,
    ...options.connection,
  });
  let capture: ReturnType<typeof createMicrophoneCapture> | null = null;
  let captureGeneration = 0;
  let disposed = false;
  let startRecordingPromise: Promise<void> | null = null;
  let state = createInitialState(stream);
  const subscribers = new Set<() => void>();

  const notify = () => {
    for (const subscriber of subscribers) {
      subscriber();
    }
  };

  const sync = () => {
    state = {
      ...state,
      assistantAudio: [...stream.assistantAudio],
      assistantStreamingText: stream.assistantStreamingText,
      assistantTexts: [...stream.assistantTexts],
      call: stream.call,
      error: stream.error,
      isConnected: stream.isConnected,
      paused: stream.paused,
      pauseExpiresAt: stream.pauseExpiresAt,
      partial: stream.partial,
      playbackRate: stream.playbackRate,
      reconnect: stream.reconnect,
      sessionId: stream.sessionId,
      sessionMetadata: stream.sessionMetadata,
      scenarioId: stream.scenarioId,
      status: stream.status,
      turns: [...stream.turns],
    };

    if (
      options.autoStopOnComplete !== false &&
      state.status === "completed" &&
      state.isRecording
    ) {
      capture?.stop();
      capture = null;
      state = {
        ...state,
        isRecording: false,
      };
    }

    notify();
  };

  const unsubscribeStream = stream.subscribe(sync);
  sync();

  const ensureCapture = () => {
    if (capture) {
      return capture;
    }

    capture = createMicrophoneCapture({
      channelCount:
        options.capture?.channelCount ?? preset.capture.channelCount,
      onLevel: options.capture?.onLevel,
      onAudio: (audio) => {
        if (options.capture?.onAudio) {
          options.capture.onAudio(audio, stream.sendAudio);

          return;
        }

        stream.sendAudio(audio);
      },
      sampleRateHz:
        options.capture?.sampleRateHz ?? preset.capture.sampleRateHz,
      ...(options.capture?.stream ? { stream: options.capture.stream } : {}),
    });

    return capture;
  };

  const stopRecording = () => {
    captureGeneration += 1;
    capture?.stop();
    capture = null;
    state = {
      ...state,
      isRecording: false,
    };
    notify();
  };

  const startRecording = async () => {
    if (disposed) {
      throw new Error("Voice controller is closed.");
    }
    if (state.isRecording) {
      return;
    }
    if (startRecordingPromise) return startRecordingPromise;

    const generation = ++captureGeneration;
    const activeCapture = ensureCapture();
    const operation = (async () => {
      try {
        state = {
          ...state,
          recordingError: null,
        };
        notify();
        await activeCapture.start();
        if (
          disposed ||
          generation !== captureGeneration ||
          capture !== activeCapture
        ) {
          activeCapture.stop();

          return;
        }
        state = {
          ...state,
          isRecording: true,
        };
        notify();
      } catch (error) {
        activeCapture.stop();
        if (generation !== captureGeneration || capture !== activeCapture) {
          throw error;
        }
        capture = null;
        state = {
          ...state,
          isRecording: false,
          recordingError:
            error instanceof Error ? error.message : String(error),
        };
        notify();
        throw error;
      }
    })();
    const pending = operation.finally(() => {
      if (startRecordingPromise === pending) startRecordingPromise = null;
    });
    startRecordingPromise = pending;

    return startRecordingPromise;
  };

  const close = (reason?: string) => {
    disposed = true;
    unsubscribeStream();
    stopRecording();
    stream.close(reason);
  };

  const disconnect = () => {
    disposed = true;
    unsubscribeStream();
    stopRecording();
    stream.disconnect();
  };

  return {
    close,
    disconnect,
    startRecording,
    stopRecording,
    get assistantAudio() {
      return state.assistantAudio;
    },
    get assistantTexts() {
      return state.assistantTexts;
    },
    get assistantStreamingText() {
      return state.assistantStreamingText;
    },
    bindHTMX(bindingOptions: VoiceHTMXBindingOptions) {
      return bindVoiceHTMX(stream, bindingOptions);
    },
    get call() {
      return state.call;
    },
    callControl: (message) => stream.callControl(message),
    endTurn: () => stream.endTurn(),
    get error() {
      return state.error;
    },
    getServerSnapshot: () => state,
    getSnapshot: () => state,
    get isConnected() {
      return state.isConnected;
    },
    get isRecording() {
      return state.isRecording;
    },
    get partial() {
      return state.partial;
    },
    get playbackRate() {
      return state.playbackRate;
    },
    get paused() {
      return state.paused;
    },
    get pauseExpiresAt() {
      return state.pauseExpiresAt;
    },
    get reconnect() {
      return state.reconnect;
    },
    get recordingError() {
      return state.recordingError;
    },
    get scenarioId() {
      return state.scenarioId;
    },
    sendAudio: (audio) => stream.sendAudio(audio),
    get sessionId() {
      return state.sessionId;
    },
    get sessionMetadata() {
      return state.sessionMetadata;
    },
    simulateDisconnect: () => stream.simulateDisconnect(),
    get status() {
      return state.status;
    },
    subscribe: (subscriber) => {
      subscribers.add(subscriber);

      return () => {
        subscribers.delete(subscriber);
      };
    },
    toggleRecording: async () => {
      if (state.isRecording) {
        stopRecording();

        return;
      }

      await startRecording();
    },
    get turns() {
      return state.turns;
    },
  } as VoiceController<TResult> & {
    bindHTMX: (bindingOptions: VoiceHTMXBindingOptions) => () => void;
  };
};
