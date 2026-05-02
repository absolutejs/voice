import { useEffect, useRef, useSyncExternalStore } from "react";
import { createVoiceStream } from "../client/createVoiceStream";
import type { VoiceConnectionOptions } from "../types";

const EMPTY_SNAPSHOT = {
  assistantAudio: [],
  assistantTexts: [],
  call: null,
  error: null,
  isConnected: false,
  partial: "",
  reconnect: {
    attempts: 0,
    maxAttempts: 0,
    status: "idle" as const,
  },
  sessionId: "",
  sessionMetadata: null,
  status: "idle" as const,
  turns: [],
};

export const useVoiceStream = <TResult = unknown,>(
  path: string,
  options: VoiceConnectionOptions = {},
) => {
  const streamRef = useRef<ReturnType<
    typeof createVoiceStream<TResult>
  > | null>(null);

  if (!streamRef.current) {
    streamRef.current = createVoiceStream<TResult>(path, options);
  }

  const stream = streamRef.current;

  useEffect(() => () => stream.close(), [stream]);

  const snapshot =
    useSyncExternalStore(
      stream.subscribe,
      stream.getSnapshot,
      stream.getServerSnapshot,
    ) ?? EMPTY_SNAPSHOT;

  return {
    ...snapshot,
    callControl: (message: Parameters<typeof stream.callControl>[0]) =>
      stream.callControl(message),
    close: () => stream.close(),
    endTurn: () => stream.endTurn(),
    sendAudio: (audio: Uint8Array | ArrayBuffer) => stream.sendAudio(audio),
    simulateDisconnect: () => stream.simulateDisconnect(),
  };
};
