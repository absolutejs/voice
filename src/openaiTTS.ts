import type {
  AudioFormat,
  TTSAdapter,
  TTSAdapterOpenOptions,
  TTSAdapterSession,
  TTSSessionEventMap,
  VoiceCloseEvent,
  VoiceErrorEvent,
  VoiceLexiconEntry,
} from "./types";

export type OpenAIVoiceTTSVoice =
  | "alloy"
  | "ash"
  | "ballad"
  | "cedar"
  | "coral"
  | "echo"
  | "fable"
  | "marin"
  | "nova"
  | "onyx"
  | "sage"
  | "shimmer"
  | "verse"
  | (string & {});

export type OpenAIVoiceTTSOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  instructions?:
    | string
    | ((input: {
        lexicon?: VoiceLexiconEntry[];
        sessionId: string;
        text: string;
      }) => Promise<string | undefined> | string | undefined);
  model?: "gpt-4o-mini-tts" | "tts-1" | "tts-1-hd" | (string & {});
  speed?: number;
  voice?: OpenAIVoiceTTSVoice | { id: string };
};

const OPENAI_PCM24_FORMAT: AudioFormat = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 24_000,
};

const resolveInstructions = async (
  instructions: OpenAIVoiceTTSOptions["instructions"],
  input: {
    lexicon?: VoiceLexiconEntry[];
    sessionId: string;
    text: string;
  },
) => {
  if (typeof instructions === "function") {
    return instructions(input);
  }

  return instructions;
};

const createTTSHTTPError = (response: Response) =>
  new Error(`OpenAI voice TTS failed: HTTP ${response.status}`);

const emit = async <K extends keyof TTSSessionEventMap>(
  listeners: Record<
    keyof TTSSessionEventMap,
    Set<(payload: never) => void | Promise<void>>
  >,
  event: K,
  payload: TTSSessionEventMap[K],
) => {
  for (const handler of listeners[event]) {
    await Promise.resolve(handler(payload as never));
  }
};

export const createOpenAIVoiceTTS = (
  options: OpenAIVoiceTTSOptions,
): TTSAdapter<TTSAdapterOpenOptions> => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  const model = options.model ?? "gpt-4o-mini-tts";
  const voice = options.voice ?? "coral";

  return {
    kind: "tts",
    open: (openOptions): TTSAdapterSession => {
      const listeners = {
        audio: new Set<
          (payload: TTSSessionEventMap["audio"]) => void | Promise<void>
        >(),
        close: new Set<(payload: VoiceCloseEvent) => void | Promise<void>>(),
        error: new Set<(payload: VoiceErrorEvent) => void | Promise<void>>(),
      };
      const abortController = new AbortController();
      const signalAbort = () => abortController.abort();
      openOptions.signal?.addEventListener("abort", signalAbort, {
        once: true,
      });
      let closed = false;

      return {
        close: async (reason?: string) => {
          if (closed) {
            return;
          }

          closed = true;
          abortController.abort();
          openOptions.signal?.removeEventListener("abort", signalAbort);
          await emit(listeners, "close", {
            reason,
            type: "close",
          });
        },
        on: (event, handler) => {
          listeners[event].add(handler as never);
          return () => {
            listeners[event].delete(handler as never);
          };
        },
        send: async (text: string) => {
          if (closed || !text.trim()) {
            return;
          }

          try {
            const instructions = await resolveInstructions(
              options.instructions,
              {
                lexicon: openOptions.lexicon,
                sessionId: openOptions.sessionId,
                text,
              },
            );
            const response = await fetchImpl(
              `${baseUrl.replace(/\/$/, "")}/audio/speech`,
              {
                body: JSON.stringify({
                  input: text,
                  instructions,
                  model,
                  response_format: "pcm",
                  speed: options.speed,
                  voice,
                }),
                headers: {
                  authorization: `Bearer ${options.apiKey}`,
                  "content-type": "application/json",
                },
                method: "POST",
                signal: abortController.signal,
              },
            );

            if (!response.ok) {
              throw createTTSHTTPError(response);
            }

            if (!response.body) {
              const chunk = new Uint8Array(await response.arrayBuffer());
              if (!closed && chunk.byteLength > 0) {
                await emit(listeners, "audio", {
                  chunk,
                  format: OPENAI_PCM24_FORMAT,
                  receivedAt: Date.now(),
                  type: "audio",
                });
              }
              return;
            }

            const reader = response.body.getReader();
            try {
              while (!closed) {
                const { done, value } = await reader.read();
                if (done) {
                  break;
                }
                if (value.byteLength > 0) {
                  await emit(listeners, "audio", {
                    chunk: new Uint8Array(value),
                    format: OPENAI_PCM24_FORMAT,
                    receivedAt: Date.now(),
                    type: "audio",
                  });
                }
              }
            } finally {
              reader.releaseLock();
            }
          } catch (error) {
            if (closed || abortController.signal.aborted) {
              return;
            }

            const normalizedError =
              error instanceof Error ? error : new Error(String(error));
            await emit(listeners, "error", {
              error: normalizedError,
              recoverable: true,
              type: "error",
            });
            throw normalizedError;
          }
        },
      };
    },
  };
};
