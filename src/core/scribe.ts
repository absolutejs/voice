import type {
  AudioChunk,
  AudioFormat,
  STTAdapter,
  STTAdapterSession,
  Transcript,
  VoiceCloseEvent,
  VoiceErrorEvent,
  VoiceLanguageStrategy,
  VoiceLexiconEntry,
  VoicePhraseHint,
} from "./types";

export type VoiceScribeTurn = {
  speaker: string;
  text: string;
  confidence?: number;
  startedAtMs?: number;
  endedAtMs?: number;
};

export type VoiceScribePartialEvent = {
  type: "partial";
  transcript: Transcript;
};

export type VoiceScribeTurnEvent = {
  type: "turn";
  turn: VoiceScribeTurn;
};

export type VoiceScribeEventMap = {
  partial: VoiceScribePartialEvent;
  turn: VoiceScribeTurnEvent;
  error: VoiceErrorEvent;
  close: VoiceCloseEvent;
};

export type VoiceScribeSession = {
  on: <K extends keyof VoiceScribeEventMap>(
    event: K,
    handler: (payload: VoiceScribeEventMap[K]) => void | Promise<void>,
  ) => () => void;
  /** Push a chunk of audio (same format declared in `open`). */
  send: (audio: AudioChunk) => Promise<void>;
  /** All finalized, speaker-labelled turns so far, in order. */
  getTranscript: () => VoiceScribeTurn[];
  close: (reason?: string) => Promise<void>;
};

export type VoiceScribeOptions = {
  stt: STTAdapter;
  sessionId: string;
  format: AudioFormat;
  languageStrategy?: VoiceLanguageStrategy;
  lexicon?: VoiceLexiconEntry[];
  phraseHints?: VoicePhraseHint[];
  signal?: AbortSignal;
};

/**
 * A listen-only transcription session — a "scribe". It drives an STT adapter
 * over a stream of audio chunks and emits diarized transcript turns, with NO
 * assistant (no LLM) and NO TTS. Use it to turn any audio source — an
 * onSpark-hosted meeting, or a meeting-bot adapter piping in an external call —
 * into a live, speaker-labelled transcript that downstream consumers (e.g. a
 * deal-call analyzer) read or act on. Diarization comes from the STT adapter
 * (e.g. `deepgram({ diarize: true })`); speakers are surfaced as stable string
 * labels on each turn.
 */
export const createVoiceScribe = async (
  options: VoiceScribeOptions,
): Promise<VoiceScribeSession> => {
  const session: STTAdapterSession = await options.stt.open({
    format: options.format,
    languageStrategy: options.languageStrategy,
    lexicon: options.lexicon,
    phraseHints: options.phraseHints,
    sessionId: options.sessionId,
    signal: options.signal,
  });

  const turns: VoiceScribeTurn[] = [];
  const listeners: {
    [K in keyof VoiceScribeEventMap]: Set<
      (payload: VoiceScribeEventMap[K]) => void | Promise<void>
    >;
  } = {
    close: new Set(),
    error: new Set(),
    partial: new Set(),
    turn: new Set(),
  };
  const emit = <K extends keyof VoiceScribeEventMap>(
    event: K,
    payload: VoiceScribeEventMap[K],
  ) => {
    for (const handler of listeners[event]) void handler(payload);
  };

  session.on("final", ({ transcript }) => {
    const text = transcript.text.trim();
    if (!text) return;
    const turn: VoiceScribeTurn = {
      confidence: transcript.confidence,
      endedAtMs: transcript.endedAtMs,
      speaker:
        transcript.speaker === undefined ? "0" : String(transcript.speaker),
      startedAtMs: transcript.startedAtMs,
      text,
    };
    turns.push(turn);
    emit("turn", { turn, type: "turn" });
  });
  session.on("partial", ({ transcript }) =>
    emit("partial", { transcript, type: "partial" }),
  );
  session.on("error", (event) => emit("error", event));
  session.on("close", (event) => emit("close", event));

  return {
    close: (reason) => session.close(reason),
    getTranscript: () => [...turns],
    on: (event, handler) => {
      listeners[event].add(handler as never);

      return () => {
        listeners[event].delete(handler as never);
      };
    },
    send: (audio) => session.send(audio),
  };
};
