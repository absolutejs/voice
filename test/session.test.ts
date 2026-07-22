import { expect, test } from "bun:test";
import { createMonologueAMDDetector } from "../src/core/amdDetector";
import { createVoiceCostAccountant } from "../src/core/costAccounting";
import { createVoiceMemoryStore } from "../src/core/memoryStore";
import { createVoiceWriteBehindStore } from "../src/core/writeBehindStore";
import { createVoiceMemoryRecordingStore } from "../src/core/recordingStore";
import { createVoiceTranscriptRedactor } from "../src/core/redaction";
import { createPunctuationSemanticTurnDetector } from "../src/core/semanticTurn";
import { createVoiceSession } from "../src/core/session";
import { createVoiceMemoryTraceEventStore } from "../src/core/trace";
import type {
  AudioChunk,
  RealtimeAdapter,
  RealtimeAdapterOpenOptions,
  RealtimeAdapterSession,
  RealtimeSessionEventMap,
  STTAdapter,
  STTAdapterOpenOptions,
  STTAdapterSession,
  STTSessionEventMap,
  TTSAdapter,
  TTSAdapterSession,
  TTSSessionEventMap,
  VoiceSocket,
} from "../src/core/types";

const withDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  let settled = false;

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = (value) => {
      settled = true;
      innerResolve(value);
    };
    reject = (error) => {
      settled = true;
      innerReject(error);
    };
  });

  return {
    promise,
    reject: (...args: [error: unknown]) => reject(...args),
    resolve: (...args: [value: T]) => resolve(...args),
    get settled() {
      return settled;
    },
  };
};

type ListenerMap = {
  [K in keyof STTSessionEventMap]: Array<
    (payload: STTSessionEventMap[K]) => void | Promise<void>
  >;
};

const createFakeAdapter = () => {
  let closeCalls = 0;
  let openCalls = 0;
  const openOptions: STTAdapterOpenOptions[] = [];
  let sentAudioChunks = 0;
  const sentAudio: Uint8Array[] = [];
  const sessions: Array<
    STTAdapterSession & {
      emit: <K extends keyof STTSessionEventMap>(
        event: K,
        payload: STTSessionEventMap[K],
      ) => Promise<void>;
    }
  > = [];

  const adapter: STTAdapter = {
    kind: "stt",
    open: (options) => {
      openCalls += 1;
      openOptions.push(options);

      const listeners: ListenerMap = {
        close: [],
        endOfTurn: [],
        error: [],
        final: [],
        partial: [],
      };
      const session: STTAdapterSession & {
        emit: <K extends keyof STTSessionEventMap>(
          event: K,
          payload: STTSessionEventMap[K],
        ) => Promise<void>;
      } = {
        close: async () => {
          closeCalls += 1;
        },
        emit: async (event, payload) => {
          for (const listener of listeners[event]) {
            await listener(payload as never);
          }
        },
        on: (event, handler) => {
          listeners[event].push(handler as never);

          return () => {
            const index = listeners[event].indexOf(handler as never);
            if (index >= 0) {
              listeners[event].splice(index, 1);
            }
          };
        },
        send: async (audio: AudioChunk) => {
          sentAudioChunks += 1;
          const bytes =
            audio instanceof ArrayBuffer
              ? new Uint8Array(audio.slice(0))
              : new Uint8Array(
                  audio.buffer.slice(
                    audio.byteOffset,
                    audio.byteOffset + audio.byteLength,
                  ),
                );
          sentAudio.push(bytes);
        },
      };

      sessions.push(session);
      return session;
    },
  };

  return {
    adapter,
    emitCurrent: async <K extends keyof STTSessionEventMap>(
      event: K,
      payload: STTSessionEventMap[K],
    ) => {
      const session = sessions.at(-1);
      if (!session) {
        throw new Error("No active fake adapter session");
      }

      await session.emit(event, payload);
    },
    emitSession: async <K extends keyof STTSessionEventMap>(
      index: number,
      event: K,
      payload: STTSessionEventMap[K],
    ) => {
      const session = sessions[index];
      if (!session) {
        throw new Error(`No fake adapter session at index ${index}`);
      }

      await session.emit(event, payload);
    },
    getCloseCalls: () => closeCalls,
    getOpenCalls: () => openCalls,
    getOpenOptions: () => openOptions,
    getSentAudio: () => sentAudio,
    getSentAudioChunks: () => sentAudioChunks,
    getSessionCount: () => sessions.length,
  };
};

type TTSListenerMap = {
  [K in keyof TTSSessionEventMap]: Array<
    (payload: TTSSessionEventMap[K]) => void | Promise<void>
  >;
};

type RealtimeListenerMap = {
  [K in keyof RealtimeSessionEventMap]: Array<
    (payload: RealtimeSessionEventMap[K]) => void | Promise<void>
  >;
};

const createFakeRealtimeAdapter = () => {
  let closeCalls = 0;
  let openCalls = 0;
  const openOptions: RealtimeAdapterOpenOptions[] = [];
  const sentAudio: Uint8Array[] = [];
  const sentTexts: string[] = [];
  const sessions: Array<
    RealtimeAdapterSession & {
      emit: <K extends keyof RealtimeSessionEventMap>(
        event: K,
        payload: RealtimeSessionEventMap[K],
      ) => Promise<void>;
    }
  > = [];

  const adapter: RealtimeAdapter = {
    kind: "realtime",
    open: (options) => {
      openCalls += 1;
      openOptions.push(options);

      const listeners: RealtimeListenerMap = {
        audio: [],
        close: [],
        endOfTurn: [],
        error: [],
        final: [],
        partial: [],
      };
      const session: RealtimeAdapterSession & {
        emit: <K extends keyof RealtimeSessionEventMap>(
          event: K,
          payload: RealtimeSessionEventMap[K],
        ) => Promise<void>;
      } = {
        close: async () => {
          closeCalls += 1;
        },
        emit: async (event, payload) => {
          for (const listener of listeners[event]) {
            await listener(payload as never);
          }
        },
        on: (event, handler) => {
          listeners[event].push(handler as never);

          return () => {
            const index = listeners[event].indexOf(handler as never);
            if (index >= 0) {
              listeners[event].splice(index, 1);
            }
          };
        },
        send: async (input) => {
          if (typeof input === "string") {
            sentTexts.push(input);
            await session.emit("audio", {
              chunk: new Uint8Array([9, 8, 7, 6]),
              format: {
                channels: 1,
                container: "raw",
                encoding: "pcm_s16le",
                sampleRateHz: 24_000,
              },
              receivedAt: Date.now(),
              type: "audio",
            });
            return;
          }

          const bytes =
            input instanceof ArrayBuffer
              ? new Uint8Array(input.slice(0))
              : new Uint8Array(
                  input.buffer.slice(
                    input.byteOffset,
                    input.byteOffset + input.byteLength,
                  ),
                );
          sentAudio.push(bytes);
        },
      };

      sessions.push(session);
      return session;
    },
  };

  return {
    adapter,
    emitCurrent: async <K extends keyof RealtimeSessionEventMap>(
      event: K,
      payload: RealtimeSessionEventMap[K],
    ) => {
      const session = sessions.at(-1);
      if (!session) {
        throw new Error("No active fake realtime session");
      }

      await session.emit(event, payload);
    },
    getCloseCalls: () => closeCalls,
    getOpenCalls: () => openCalls,
    getOpenOptions: () => openOptions,
    getSentAudio: () => sentAudio,
    getSentTexts: () => sentTexts,
    getSessionCount: () => sessions.length,
  };
};

const createFakeTTSAdapter = (options: { supportsCancel?: boolean } = {}) => {
  let closeCalls = 0;
  let openCalls = 0;
  const cancelReasons: Array<string | undefined> = [];
  const sentTexts: string[] = [];
  const sessions: Array<
    TTSAdapterSession & {
      emit: <K extends keyof TTSSessionEventMap>(
        event: K,
        payload: TTSSessionEventMap[K],
      ) => Promise<void>;
    }
  > = [];

  const adapter: TTSAdapter = {
    kind: "tts",
    open: () => {
      openCalls += 1;

      const listeners: TTSListenerMap = {
        audio: [],
        close: [],
        error: [],
      };
      const session: TTSAdapterSession & {
        emit: <K extends keyof TTSSessionEventMap>(
          event: K,
          payload: TTSSessionEventMap[K],
        ) => Promise<void>;
      } = {
        close: async () => {
          closeCalls += 1;
        },
        emit: async (event, payload) => {
          for (const listener of listeners[event]) {
            await listener(payload as never);
          }
        },
        on: (event, handler) => {
          listeners[event].push(handler as never);

          return () => {
            const index = listeners[event].indexOf(handler as never);
            if (index >= 0) {
              listeners[event].splice(index, 1);
            }
          };
        },
        send: async (text) => {
          sentTexts.push(text);
          await session.emit("audio", {
            chunk: new Uint8Array([1, 2, 3, 4]),
            format: {
              channels: 1,
              container: "raw",
              encoding: "pcm_s16le",
              sampleRateHz: 16_000,
            },
            receivedAt: Date.now(),
          });
        },
      };

      if (options.supportsCancel) {
        session.cancel = async (reason?: string) => {
          cancelReasons.push(reason);
        };
      }

      sessions.push(session);
      return session;
    },
  };

  return {
    adapter,
    getCancelReasons: () => cancelReasons,
    getCloseCalls: () => closeCalls,
    getOpenCalls: () => openCalls,
    getSentTexts: () => sentTexts,
    getSessionCount: () => sessions.length,
  };
};

const createMockSocket = () => {
  const messages: string[] = [];

  const socket: VoiceSocket = {
    close: async () => {},
    send: async (data) => {
      messages.push(typeof data === "string" ? data : "[binary]");
    },
  };

  return { messages, socket };
};

const createSpeechChunk = (sample: number) => new Int16Array(160).fill(sample);

test("voice session stores initial session metadata before onSession", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  let metadata: Record<string, unknown> | undefined;

  const session = createVoiceSession({
    context: {},
    id: "session-initial-metadata",
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onSession: ({ session }) => {
        metadata = session.metadata;
      },
      onTurn: async () => {},
    },
    sessionMetadata: {
      profileSwitchGuard: {
        action: "switch",
        selectedProfileId: "noisy-phone-call",
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);

  expect(metadata?.profileSwitchGuard).toEqual({
    action: "switch",
    selectedProfileId: "noisy-phone-call",
  });
  expect((await store.get("session-initial-metadata"))?.metadata).toEqual(
    metadata,
  );
});

test("voice session commits a turn after silence and only once", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const turnTexts: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-silence-commit",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "final-1",
      isFinal: true,
      text: "I am trying to see if this is working",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(60);

  const snapshot = await session.snapshot();

  expect(turnTexts).toEqual(["I am trying to see if this is working"]);
  expect(snapshot.turns).toHaveLength(1);
  expect(snapshot.turns[0]?.text).toBe("I am trying to see if this is working");
  expect(adapter.getSentAudioChunks()).toBe(2);
  expect(
    socket.messages.some((message) => message.includes('"type":"turn"')),
  ).toBe(true);
});

test("semantic veto defers a mid-thought silence commit until the cap", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const turnTexts: string[] = [];
  let evaluateCalls = 0;

  const session = createVoiceSession({
    context: {},
    id: "session-semantic-veto",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    // Always "still mid-thought" — exercises the veto/defer path.
    semanticTurnDetector: {
      evaluate: () => {
        evaluateCalls += 1;

        return { endOfTurn: false, reason: "test-mid-thought" };
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      semanticVetoMaxMs: 200,
      semanticVetoRecheckMs: 30,
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "final-1",
      isFinal: true,
      text: "we provide",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(0));

  // Past silenceMs (20ms) but well under the veto cap (200ms): the silence
  // timer fired, the detector vetoed, and the commit was deferred.
  await Bun.sleep(70);
  expect(turnTexts).toEqual([]);
  expect(evaluateCalls).toBeGreaterThan(0);

  // Past the cap: the detector can no longer hold the turn — it commits once.
  await Bun.sleep(300);
  const snapshot = await session.snapshot();
  expect(turnTexts).toEqual(["we provide"]);
  expect(snapshot.turns).toHaveLength(1);
});

test("voice session records trace events for lifecycle, transcripts, turns, assistant replies, and cost", async () => {
  const store = createVoiceMemoryStore();
  const trace = createVoiceMemoryTraceEventStore();
  const adapter = createFakeAdapter();
  const tts = createFakeTTSAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    costTelemetry: {
      primaryPassCostUnit: 2,
    },
    id: "session-trace-core",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => ({
        assistantText: `Replying to ${turn.text}`,
      }),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    trace,
    tts: tts.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("partial", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.7,
      id: "partial-trace-1",
      isFinal: false,
      text: "hello",
    },
    type: "partial",
  });
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.9,
      id: "final-trace-1",
      isFinal: true,
      text: "hello there",
      vendor: "fake-stt",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.commitTurn("manual");

  const events = await trace.list({ sessionId: "session-trace-core" });
  const eventTypes = events.map((event) => event.type);

  expect(eventTypes).toContain("call.lifecycle");
  expect(eventTypes).toContain("turn.transcript");
  expect(eventTypes).toContain("turn.committed");
  expect(eventTypes).toContain("turn.cost");
  expect(eventTypes).toContain("turn.assistant");
  const transcriptTraces = await trace.list({ type: "turn.transcript" });
  expect(
    transcriptTraces.find(
      (event) => event.payload.transcriptId === "partial-trace-1",
    ),
  ).toMatchObject({
    payload: {
      isFinal: false,
      text: "hello",
      transcriptId: "partial-trace-1",
    },
  });
  expect(
    transcriptTraces.find(
      (event) => event.payload.transcriptId === "final-trace-1",
    ),
  ).toMatchObject({
    payload: {
      isFinal: true,
      text: "hello there",
      transcriptId: "final-trace-1",
      vendor: "fake-stt",
    },
  });
  expect((await trace.list({ type: "turn.committed" }))[0]).toMatchObject({
    payload: {
      reason: "manual",
      text: "hello there",
      transcriptCount: 1,
    },
  });
  const assistantTraces = await trace.list({ type: "turn.assistant" });
  expect(
    assistantTraces.find(
      (event) => event.payload.text === "Replying to hello there",
    ),
  ).toMatchObject({
    payload: {
      text: "Replying to hello there",
      ttsConfigured: true,
    },
  });
  expect((await trace.list({ type: "turn.cost" }))[0]?.payload).toMatchObject({
    fallbackAttemptCount: 0,
    fallbackReplayAudioMs: 0,
  });
  expect(tts.getSentTexts()).toEqual(["Replying to hello there"]);
});

test("voice session ignores duplicate end-of-turn signals for the same turn", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const turnTexts: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-endofturn-duplicate",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "final-dup",
      isFinal: true,
      text: "I am testing this",
    },
    type: "final",
  });
  await adapter.emitCurrent("endOfTurn", {
    reason: "vendor",
    receivedAt: Date.now(),
    type: "endOfTurn",
  });
  await adapter.emitCurrent("endOfTurn", {
    reason: "vendor",
    receivedAt: Date.now(),
    type: "endOfTurn",
  });

  await Bun.sleep(40);

  expect(turnTexts).toEqual(["I am testing this"]);
});

test("voice session streams assistant audio chunks when a tts adapter is configured", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const tts = createFakeTTSAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-tts-stream",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => ({
        assistantText: `You said: ${turn.text}`,
      }),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    tts: tts.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "final-tts",
      isFinal: true,
      text: "Read this back to me",
    },
    type: "final",
  });
  await adapter.emitCurrent("endOfTurn", {
    reason: "vendor",
    receivedAt: Date.now(),
    type: "endOfTurn",
  });
  await Bun.sleep(40);

  const messages = socket.messages.map((message) => JSON.parse(message));
  const assistantMessage = messages.find(
    (message) => message.type === "assistant",
  );
  const audioMessage = messages.find((message) => message.type === "audio");

  expect(tts.getOpenCalls()).toBe(1);
  expect(tts.getSessionCount()).toBe(1);
  expect(tts.getSentTexts()).toEqual(["You said: Read this back to me"]);
  expect(assistantMessage).toMatchObject({
    text: "You said: Read this back to me",
    type: "assistant",
  });
  expect(audioMessage).toMatchObject({
    chunkBase64: "AQIDBA==",
    turnId: expect.any(String),
    type: "audio",
  });
});

test("voice session streams onTextDelta replies to TTS in sentence chunks", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const tts = createFakeTTSAdapter();
  const socket = createMockSocket();

  const deltas = [
    "Hello there",
    ".",
    " How can ",
    "I help you",
    " today?",
    " Anything else?",
  ];
  const fullText = deltas.join("");

  const session = createVoiceSession({
    context: {},
    id: "session-tts-stream-chunks",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      // Stream the reply through onTextDelta (as a streaming model adapter
      // would) while the run is in flight; return the full text as the result.
      onTurn: async ({ onTextDelta }) => {
        for (const delta of deltas) {
          onTextDelta?.(delta);
          await Bun.sleep(1);
        }

        return { assistantText: fullText };
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    tts: tts.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "final-stream",
      isFinal: true,
      text: "Say a few sentences",
    },
    type: "final",
  });
  await adapter.emitCurrent("endOfTurn", {
    reason: "vendor",
    receivedAt: Date.now(),
    type: "endOfTurn",
  });
  await Bun.sleep(60);

  const sent = tts.getSentTexts();
  // Chunked: more than one send, the first arrives before the whole reply, and
  // concatenating them reconstructs the full reply exactly.
  expect(sent.length).toBeGreaterThan(1);
  expect(sent.join("")).toBe(fullText);
  expect(tts.getOpenCalls()).toBe(1);

  // The accumulated text is persisted + emitted as the assistant transcript.
  const assistantMessage = socket.messages
    .map((message) => JSON.parse(message))
    .find((message) => message.type === "assistant");
  expect(assistantMessage).toMatchObject({ text: fullText, type: "assistant" });

  const snapshot = await session.snapshot();
  const lastTurn = snapshot.turns.at(-1);
  expect(lastTurn?.result?.assistantText ?? lastTurn?.assistantText).toBe(
    fullText,
  );
});

test("voice session can use a realtime adapter for input transcripts and assistant audio", async () => {
  const store = createVoiceMemoryStore();
  const realtime = createFakeRealtimeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-realtime-stream",
    logger: {},
    realtime: realtime.adapter,
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => ({
        assistantText: `Realtime reply: ${turn.text}`,
      }),
    },
    socket: socket.socket,
    store,
    sttLifecycle: "session",
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.receiveAudio(new Int16Array(160).fill(1000));
  await realtime.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "final-realtime",
      isFinal: true,
      text: "Use realtime speech",
    },
    type: "final",
  });
  await realtime.emitCurrent("endOfTurn", {
    reason: "vendor",
    receivedAt: Date.now(),
    type: "endOfTurn",
  });
  await Bun.sleep(40);

  const messages = socket.messages.map((message) => JSON.parse(message));
  const assistantMessage = messages.find(
    (message) => message.type === "assistant",
  );
  const audioMessage = messages.find((message) => message.type === "audio");

  expect(realtime.getOpenCalls()).toBe(1);
  expect(realtime.getSessionCount()).toBe(1);
  expect(realtime.getOpenOptions()[0]?.format.sampleRateHz).toBe(24_000);
  expect(realtime.getSentAudio()).toHaveLength(1);
  expect(realtime.getSentTexts()).toEqual([
    "Realtime reply: Use realtime speech",
  ]);
  expect(assistantMessage).toMatchObject({
    text: "Realtime reply: Use realtime speech",
    type: "assistant",
  });
  expect(audioMessage).toMatchObject({
    chunkBase64: "CQgHBg==",
    turnId: expect.any(String),
    type: "audio",
  });
});

test("voice session prewarms the tts adapter on connect", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const tts = createFakeTTSAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-tts-prewarm",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => {},
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    tts: tts.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await Bun.sleep(0);

  expect(tts.getOpenCalls()).toBe(1);
});

test("voice session reconnect resume does not replay committed turns", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const firstSocket = createMockSocket();
  const secondSocket = createMockSocket();
  const turnTexts: string[] = [];
  let onSessionCalls = 0;

  const session = createVoiceSession({
    context: {},
    id: "session-reconnect",
    logger: {},
    reconnect: {
      maxAttempts: 2,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onSession: async () => {
        onSessionCalls += 1;
      },
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    socket: firstSocket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(firstSocket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "final-1",
      isFinal: true,
      text: "Reconnect should not duplicate prior turns",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(60);
  await session.disconnect({
    recoverable: true,
    type: "close",
  });
  await session.connect(secondSocket.socket);

  const snapshot = await session.snapshot();

  expect(turnTexts).toEqual(["Reconnect should not duplicate prior turns"]);
  expect(snapshot.turns).toHaveLength(1);
  expect(onSessionCalls).toBe(1);
  expect(
    secondSocket.messages.some(
      (message) =>
        message.includes('"type":"session"') &&
        message.includes('"status":"active"'),
    ),
  ).toBe(true);
  const replay = secondSocket.messages
    .map((message) => JSON.parse(message))
    .find((message) => message.type === "replay");
  expect(replay).toMatchObject({
    partial: "",
    sessionId: "session-reconnect",
    status: "active",
    turns: [
      {
        text: "Reconnect should not duplicate prior turns",
      },
    ],
  });
});

test("voice session dedupes committed turns across handler instances", async () => {
  const adapter = createFakeAdapter();
  const store = createVoiceMemoryStore();
  const firstSocket = createMockSocket();
  const secondSocket = createMockSocket();
  const turnTexts: string[] = [];

  const firstSession = createVoiceSession({
    context: {},
    id: "session-cross-node-dedupe",
    logger: {},
    reconnect: {
      maxAttempts: 2,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    socket: firstSocket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await firstSession.connect(firstSocket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "cross-node-final",
      isFinal: true,
      text: "Persisted dedupe should block reconnect duplicates",
    },
    type: "final",
  });
  await adapter.emitCurrent("endOfTurn", {
    reason: "vendor",
    receivedAt: Date.now(),
    type: "endOfTurn",
  });
  await Bun.sleep(40);
  await firstSession.disconnect({
    recoverable: true,
    type: "close",
  });

  const secondSession = createVoiceSession({
    context: {},
    id: "session-cross-node-dedupe",
    logger: {},
    reconnect: {
      maxAttempts: 2,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    socket: secondSocket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await secondSession.connect(secondSocket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "cross-node-final",
      isFinal: true,
      text: "Persisted dedupe should block reconnect duplicates",
    },
    type: "final",
  });
  await adapter.emitCurrent("endOfTurn", {
    reason: "vendor",
    receivedAt: Date.now(),
    type: "endOfTurn",
  });
  await Bun.sleep(40);

  const snapshot = await secondSession.snapshot();

  expect(turnTexts).toEqual([
    "Persisted dedupe should block reconnect duplicates",
  ]);
  expect(snapshot.turns).toHaveLength(1);
});

test("voice session waits for transcript stability before silence commit", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const turnTexts: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-stability-commit",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 50,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "final-a",
      isFinal: true,
      text: "Go quietly",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(25);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "final-b",
      isFinal: true,
      text: "Go quietly alone no harm will befall you",
    },
    type: "final",
  });
  await Bun.sleep(80);

  const snapshot = await session.snapshot();

  expect(turnTexts).toEqual(["Go quietly alone no harm will befall you"]);
  expect(snapshot.turns).toHaveLength(1);
  expect(snapshot.turns[0]?.text).toBe(
    "Go quietly alone no harm will befall you",
  );
});

test("voice session waits for transcript stability before committing vendor end-of-turn", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const turnTexts: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-vendor-stability-commit",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 60,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "vendor-final-a",
      isFinal: true,
      text: "Go quietly",
    },
    type: "final",
  });

  await adapter.emitCurrent("endOfTurn", {
    reason: "vendor",
    receivedAt: Date.now(),
    type: "endOfTurn",
  });

  await Bun.sleep(25);

  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "vendor-final-b",
      isFinal: true,
      text: "Go quietly alone no harm will befall you",
    },
    type: "final",
  });

  await Bun.sleep(100);

  expect(turnTexts).toEqual(["Go quietly alone no harm will befall you"]);
});

test("voice session extends vendor end-of-turn grace for pstn-like turn detection", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const turnTexts: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-vendor-pstn-grace",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 700,
      speechThreshold: 0.01,
      transcriptStabilityMs: 320,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "pstn-final-a",
      isFinal: true,
      text: "Go quietly alone",
    },
    type: "final",
  });
  await adapter.emitCurrent("endOfTurn", {
    reason: "vendor",
    receivedAt: Date.now(),
    type: "endOfTurn",
  });

  await Bun.sleep(900);

  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "pstn-final-b",
      isFinal: true,
      text: "No harm will befall you",
    },
    type: "final",
  });

  await Bun.sleep(1_300);

  expect(turnTexts).toEqual(["Go quietly alone No harm will befall you"]);
});

test("voice session uses fallback STT for empty-turn recovery", async () => {
  const primaryAdapter = createFakeAdapter();
  const fallbackAdapter = createFakeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-fallback-empty",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        expect(turn.text).toBe("Fallback transcript ready now");
      },
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: primaryAdapter.adapter,
    sttFallback: {
      adapter: fallbackAdapter.adapter,
      trigger: "empty-turn",
      minTextLength: 2,
      settleMs: 40,
    },
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  const emitted = withDeferred<void>();

  await session.connect(socket.socket);
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(0));

  void (async () => {
    await Bun.sleep(20);
    await fallbackAdapter.emitSession(0, "final", {
      receivedAt: Date.now(),
      transcript: {
        id: "fallback-final",
        isFinal: true,
        text: "Fallback transcript ready now",
      },
      type: "final",
    });
    emitted.resolve();
  })();

  await session.commitTurn("manual");
  await emitted.promise;
  await Bun.sleep(40);

  const snapshot = await session.snapshot();

  expect(snapshot.turns).toHaveLength(1);
  expect(snapshot.turns[0]?.text).toBe("Fallback transcript ready now");
  expect(fallbackAdapter.getOpenCalls()).toBe(1);
  expect(primaryAdapter.getSentAudioChunks()).toBeGreaterThan(0);
});

test("voice session prefers fallback transcript on low-confidence candidate", async () => {
  const primaryAdapter = createFakeAdapter();
  const fallbackAdapter = createFakeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-fallback-confidence",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        expect(turn.text).toBe("I am trying to book a demo call");
      },
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: primaryAdapter.adapter,
    sttFallback: {
      adapter: fallbackAdapter.adapter,
      confidenceThreshold: 0.7,
      replayWindowMs: 8_000,
      settleMs: 40,
      trigger: "low-confidence",
    },
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  const emitted = withDeferred<void>();

  await session.connect(socket.socket);
  await primaryAdapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.2,
      id: "primary-low",
      isFinal: true,
      text: "I am trying to",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));

  void (async () => {
    await Bun.sleep(20);
    await fallbackAdapter.emitCurrent("final", {
      receivedAt: Date.now(),
      transcript: {
        confidence: 0.93,
        id: "fallback-strong",
        isFinal: true,
        text: "I am trying to book a demo call",
      },
      type: "final",
    });
    emitted.resolve();
  })();

  await session.commitTurn("manual");
  await emitted.promise;
  await Bun.sleep(40);

  const snapshot = await session.snapshot();

  expect(snapshot.turns).toHaveLength(1);
  expect(snapshot.turns[0]?.text).toBe("I am trying to book a demo call");
});

test("voice session falls back for one risky word hidden by a high turn average", async () => {
  const primaryAdapter = createFakeAdapter();
  const fallbackAdapter = createFakeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-fallback-word-confidence",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        expect(turn.text).toBe("Hello, but can you please talk faster now?");
        expect(turn.quality?.fallback?.triggerReason).toBe("word-confidence");
        expect(turn.quality?.lowestWordConfidence).toBe(0.99);
        expect(turn.quality?.wordConfidenceSampleCount).toBe(8);
      },
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: primaryAdapter.adapter,
    sttFallback: {
      adapter: fallbackAdapter.adapter,
      confidenceThreshold: 0.65,
      replayWindowMs: 8_000,
      settleMs: 40,
      trigger: "low-confidence",
      wordConfidenceThreshold: 0.8,
    },
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  const emitted = withDeferred<void>();

  await session.connect(socket.socket);
  await primaryAdapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.992,
      id: "primary-high-average",
      isFinal: true,
      text: "Hello Bill, can you please talk faster?",
      words: [
        { confidence: 0.999, text: "Hello" },
        { confidence: 0.51, text: "Bill" },
        { confidence: 0.999, text: "can" },
        { confidence: 0.999, text: "you" },
        { confidence: 0.999, text: "please" },
        { confidence: 0.999, text: "talk" },
        { confidence: 0.999, text: "faster" },
      ],
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));

  void (async () => {
    await Bun.sleep(20);
    await fallbackAdapter.emitCurrent("final", {
      receivedAt: Date.now(),
      transcript: {
        confidence: 0.99,
        id: "fallback-word-correction",
        isFinal: true,
        text: "Hello, but can you please talk faster now?",
        words: [
          "Hello",
          "but",
          "can",
          "you",
          "please",
          "talk",
          "faster",
          "now",
        ].map((text) => ({ confidence: 0.99, text })),
      },
      type: "final",
    });
    emitted.resolve();
  })();

  await session.commitTurn("manual");
  await emitted.promise;
  await Bun.sleep(40);

  expect(fallbackAdapter.getOpenCalls()).toBe(1);
});

test("voice session risk policy can route a high-value turn to fallback", async () => {
  const primaryAdapter = createFakeAdapter();
  const fallbackAdapter = createFakeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-fallback-risk-policy",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        expect(turn.quality?.fallback?.triggerReason).toBe("risk-policy");
      },
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: primaryAdapter.adapter,
    sttFallback: {
      adapter: fallbackAdapter.adapter,
      preferFallbackOn: ["risk-policy"],
      riskPolicy: ({ text }) => text.includes("$50,000"),
      settleMs: 40,
      trigger: "low-confidence",
    },
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  const emitted = withDeferred<void>();

  await session.connect(socket.socket);
  await primaryAdapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.99,
      id: "primary-critical-entity",
      isFinal: true,
      text: "Our target is $50,000",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));

  void (async () => {
    await Bun.sleep(20);
    await fallbackAdapter.emitCurrent("final", {
      receivedAt: Date.now(),
      transcript: {
        confidence: 0,
        id: "fallback-critical-entity",
        isFinal: true,
        text: "Our target is $15,000",
      },
      type: "final",
    });
    emitted.resolve();
  })();

  await session.commitTurn("manual");
  await emitted.promise;
  await Bun.sleep(40);

  expect(fallbackAdapter.getOpenCalls()).toBe(1);
  const snapshot = await session.snapshot();
  expect(snapshot.turns[0]?.text).toBe("Our target is $15,000");
  expect(snapshot.turns[0]?.quality?.fallback?.selectionReason).toBe(
    "policy-preference",
  );
});

test("voice session stores primary-turn quality metrics", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const turnTexts: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-primary-quality",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
        expect(turn.quality).toBeDefined();
        expect(turn.quality?.source).toBe("primary");
        expect(turn.quality?.fallbackUsed).toBe(false);
        expect(turn.quality?.selectedTranscriptCount).toBe(2);
        expect(turn.quality?.finalTranscriptCount).toBe(2);
        expect(turn.quality?.partialTranscriptCount).toBe(0);
        expect(turn.quality?.confidenceSampleCount).toBe(2);
        expect(Math.round((turn.quality?.averageConfidence ?? 0) * 100)).toBe(
          75,
        );
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.5,
      id: "primary-quality-1",
      isFinal: true,
      text: "hello",
    },
    type: "final",
  });
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 1.0,
      id: "primary-quality-2",
      isFinal: true,
      text: "world",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(80);

  const snapshot = await session.snapshot();

  expect(turnTexts).toEqual(["hello world"]);
  expect(snapshot.turns[0]?.quality?.source).toBe("primary");
  expect(snapshot.turns[0]?.quality?.fallbackUsed).toBe(false);
  expect(snapshot.turns[0]?.quality?.fallback).toBeUndefined();
  expect(snapshot.turns[0]?.quality?.selectedTranscriptCount).toBe(2);
  expect(snapshot.turns[0]?.quality?.confidenceSampleCount).toBe(2);
  expect(snapshot.turns[0]?.quality?.finalTranscriptCount).toBe(2);
});

test("voice session stores fallback quality metadata when fallback is selected", async () => {
  const primaryAdapter = createFakeAdapter();
  const fallbackAdapter = createFakeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-fallback-quality-selected",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        expect(turn.quality?.source).toBe("fallback");
        expect(turn.quality?.fallbackUsed).toBe(true);
        expect(turn.quality?.selectedTranscriptCount).toBe(1);
        expect(turn.quality?.finalTranscriptCount).toBe(1);
        expect(turn.quality?.partialTranscriptCount).toBe(0);
      },
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: primaryAdapter.adapter,
    sttFallback: {
      adapter: fallbackAdapter.adapter,
      confidenceThreshold: 0.9,
      trigger: "low-confidence",
      settleMs: 40,
    },
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  const emitted = withDeferred<void>();

  await session.connect(socket.socket);
  await primaryAdapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.2,
      id: "primary-low",
      isFinal: true,
      text: "hello",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));

  void (async () => {
    await Bun.sleep(20);
    await fallbackAdapter.emitSession(0, "final", {
      receivedAt: Date.now(),
      transcript: {
        confidence: 0.95,
        id: "fallback-strong",
        isFinal: true,
        text: "hello fallback response",
      },
      type: "final",
    });
    emitted.resolve();
  })();

  await session.commitTurn("manual");
  await emitted.promise;
  await Bun.sleep(40);

  const snapshot = await session.snapshot();

  expect(snapshot.turns[0]?.text).toBe("hello fallback response");
  expect(snapshot.turns[0]?.quality?.source).toBe("fallback");
  expect(snapshot.turns[0]?.quality?.fallbackUsed).toBe(true);
  expect(snapshot.turns[0]?.quality?.fallback?.attempted).toBe(true);
  expect(snapshot.turns[0]?.quality?.fallback?.selected).toBe(true);
  expect(snapshot.turns[0]?.quality?.fallback?.selectionReason).toBe(
    "word-count-margin",
  );
  expect(snapshot.turns[0]?.quality?.fallback?.primaryText).toBe("hello");
  expect(snapshot.turns[0]?.quality?.fallback?.fallbackText).toBe(
    "hello fallback response",
  );
  expect(snapshot.turns[0]?.quality?.selectedTranscriptCount).toBe(1);
  expect(snapshot.turns[0]?.quality?.finalTranscriptCount).toBe(1);
  expect(snapshot.turns[0]?.quality?.averageConfidence).toBeCloseTo(0.95);
});

test("voice session waits for delayed fallback transcripts when fallback trigger is always", async () => {
  const primaryAdapter = createFakeAdapter();
  const fallbackAdapter = createFakeAdapter();
  const socket = createMockSocket();
  const completed = withDeferred<void>();

  const session = createVoiceSession({
    context: {},
    id: "session-fallback-delayed-final",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        expect(turn.text).toBe("delayed fallback winner");
        expect(turn.quality?.source).toBe("fallback");
        expect(turn.quality?.fallbackUsed).toBe(true);
        completed.resolve();
      },
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: primaryAdapter.adapter,
    sttFallback: {
      adapter: fallbackAdapter.adapter,
      completionTimeoutMs: 250,
      settleMs: 20,
      trigger: "always",
    },
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await primaryAdapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.9,
      id: "primary-stable",
      isFinal: true,
      text: "stable primary response",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));

  void (async () => {
    while (fallbackAdapter.getOpenCalls() === 0) {
      await Bun.sleep(5);
    }
    await Bun.sleep(80);
    await fallbackAdapter.emitSession(0, "final", {
      receivedAt: Date.now(),
      transcript: {
        confidence: 0.99,
        id: "fallback-delayed",
        isFinal: true,
        text: "delayed fallback winner",
      },
      type: "final",
    });
  })();

  await session.commitTurn("manual");
  await completed.promise;

  const snapshot = await session.snapshot();
  expect(snapshot.turns[0]?.text).toBe("delayed fallback winner");
  expect(snapshot.turns[0]?.quality?.source).toBe("fallback");
});

test("voice session prefers materially higher-confidence fallback when word counts are close", async () => {
  const primaryAdapter = createFakeAdapter();
  const fallbackAdapter = createFakeAdapter();
  const socket = createMockSocket();
  const completed = withDeferred<void>();

  const session = createVoiceSession({
    context: {},
    id: "session-fallback-confidence-wins",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        expect(turn.text).toBe("cleaner fallback answer today");
        expect(turn.quality?.source).toBe("fallback");
        completed.resolve();
      },
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: primaryAdapter.adapter,
    sttFallback: {
      adapter: fallbackAdapter.adapter,
      completionTimeoutMs: 120,
      confidenceThreshold: 0.95,
      settleMs: 20,
      trigger: "low-confidence",
    },
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await primaryAdapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.32,
      id: "primary-close-count",
      isFinal: true,
      text: "noisy primary answer today",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));

  void (async () => {
    await Bun.sleep(20);
    await fallbackAdapter.emitSession(0, "final", {
      receivedAt: Date.now(),
      transcript: {
        confidence: 0.96,
        id: "fallback-close-count",
        isFinal: true,
        text: "cleaner fallback answer today",
      },
      type: "final",
    });
  })();

  await session.commitTurn("manual");
  await completed.promise;

  const snapshot = await session.snapshot();
  expect(snapshot.turns[0]?.text).toBe("cleaner fallback answer today");
  expect(snapshot.turns[0]?.quality?.source).toBe("fallback");
  expect(snapshot.turns[0]?.quality?.fallback?.selectionReason).toBe(
    "confidence-margin",
  );
});

test("voice session stores primary quality when fallback is configured but not selected", async () => {
  const primaryAdapter = createFakeAdapter();
  const fallbackAdapter = createFakeAdapter();
  const socket = createMockSocket();
  const completed = withDeferred<void>();

  const session = createVoiceSession({
    context: {},
    id: "session-fallback-not-selected",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        expect(turn.quality?.source).toBe("primary");
        expect(turn.quality?.fallbackUsed).toBe(false);
        expect(fallbackAdapter.getOpenCalls()).toBe(0);
        completed.resolve();
      },
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: primaryAdapter.adapter,
    sttFallback: {
      adapter: fallbackAdapter.adapter,
      confidenceThreshold: 0.4,
      minTextLength: 1,
      trigger: "low-confidence",
    },
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await primaryAdapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.8,
      id: "primary-high",
      isFinal: true,
      text: "stable phrase",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(80);
  await completed.promise;

  const snapshot = await session.snapshot();

  expect(snapshot.turns[0]?.quality?.source).toBe("primary");
  expect(snapshot.turns[0]?.quality?.fallbackUsed).toBe(false);
  expect(snapshot.turns[0]?.quality?.fallback).toBeUndefined();
  expect(fallbackAdapter.getOpenCalls()).toBe(0);
});

test("voice session passes phrase hints and lexicon to primary and fallback adapter opens", async () => {
  const primaryAdapter = createFakeAdapter();
  const fallbackAdapter = createFakeAdapter();
  const socket = createMockSocket();
  const lexicon = [
    {
      aliases: ["absoloot js"],
      pronunciation: "ab-so-lute jay ess",
      text: "AbsoluteJS",
    },
  ];
  const phraseHints = [
    {
      aliases: ["absolute js"],
      text: "AbsoluteJS",
    },
  ];

  const session = createVoiceSession({
    context: {},
    id: "session-phrase-hints",
    lexicon,
    logger: {},
    phraseHints,
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => {},
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: primaryAdapter.adapter,
    sttFallback: {
      adapter: fallbackAdapter.adapter,
      confidenceThreshold: 0.95,
      trigger: "always",
    },
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await primaryAdapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.4,
      id: "primary-phrase-hints",
      isFinal: true,
      text: "absolute",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));

  void (async () => {
    while (fallbackAdapter.getOpenCalls() === 0) {
      await Bun.sleep(5);
    }
    await fallbackAdapter.emitSession(0, "final", {
      receivedAt: Date.now(),
      transcript: {
        confidence: 0.99,
        id: "fallback-phrase-hints",
        isFinal: true,
        text: "AbsoluteJS",
      },
      type: "final",
    });
  })();

  await session.commitTurn("manual");

  expect(primaryAdapter.getOpenOptions()[0]?.lexicon).toEqual(lexicon);
  expect(primaryAdapter.getOpenOptions()[0]?.phraseHints).toEqual(phraseHints);
  expect(fallbackAdapter.getOpenOptions()[0]?.lexicon).toEqual(lexicon);
  expect(fallbackAdapter.getOpenOptions()[0]?.phraseHints).toEqual(phraseHints);
});

test("voice session applies committed-turn correction hook and stores diagnostics", async () => {
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const lexicon = [{ pronunciation: "ab-so-lute jay ess", text: "AbsoluteJS" }];
  const phraseHints = [{ text: "AbsoluteJS" }];
  const completed = withDeferred<void>();

  const session = createVoiceSession({
    context: { locale: "en-US" },
    id: "session-correct-turn",
    lexicon,
    logger: {},
    phraseHints,
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      correctTurn: async ({
        lexicon: resolvedLexicon,
        phraseHints: resolvedHints,
        text,
      }) => {
        expect(resolvedHints[0]?.text).toBe("AbsoluteJS");
        expect(resolvedLexicon[0]?.pronunciation).toBe("ab-so-lute jay ess");
        return {
          metadata: { matchedHint: "AbsoluteJS" },
          provider: "test-corrector",
          reason: "phrase-hint-normalization",
          text: text.replace("absolute js", "AbsoluteJS"),
        };
      },
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        expect(turn.text).toBe("please book an AbsoluteJS demo");
        expect(turn.quality?.correction?.attempted).toBe(true);
        expect(turn.quality?.correction?.changed).toBe(true);
        expect(turn.quality?.correction?.provider).toBe("test-corrector");
        expect(turn.quality?.correction?.reason).toBe(
          "phrase-hint-normalization",
        );
        completed.resolve();
      },
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.92,
      id: "primary-correct-turn",
      isFinal: true,
      text: "please book an absolute js demo",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.commitTurn("manual");
  await completed.promise;

  const snapshot = await session.snapshot();
  expect(snapshot.turns[0]?.text).toBe("please book an AbsoluteJS demo");
  expect(snapshot.turns[0]?.quality?.correction?.metadata).toEqual({
    matchedHint: "AbsoluteJS",
  });
});

test("voice session emits per-turn cost telemetry and stores cost diagnostics", async () => {
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const completed = withDeferred<void>();
  let estimatedCostUnits = 0;

  const session = createVoiceSession({
    context: {},
    costTelemetry: {
      fallbackPassCostUnit: 1.5,
      onTurnCost: async ({ estimate, turn }) => {
        estimatedCostUnits = estimate.estimatedRelativeCostUnits;
        expect(estimate.primaryAudioMs).toBeGreaterThan(0);
        expect(estimate.totalBillableAudioMs).toBe(estimate.primaryAudioMs);
        expect(turn.quality?.cost?.estimatedRelativeCostUnits).toBe(
          estimate.estimatedRelativeCostUnits,
        );
      },
      primaryPassCostUnit: 1,
    },
    id: "session-cost-telemetry",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        expect(turn.quality?.cost?.primaryAudioMs).toBeGreaterThan(0);
        expect(turn.quality?.cost?.fallbackAttemptCount).toBe(0);
        completed.resolve();
      },
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.95,
      id: "primary-cost-turn",
      isFinal: true,
      text: "cost telemetry turn",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.commitTurn("manual");
  await completed.promise;

  expect(estimatedCostUnits).toBeGreaterThan(0);
});

test("voice session preserves the best partial when later partials shrink", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const turnTexts: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-preserve-best-partial",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      profile: "long-form",
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("partial", {
    receivedAt: Date.now(),
    transcript: {
      id: "partial-full",
      isFinal: false,
      text: "Go quietly alone no harm will befall you",
    },
    type: "partial",
  });
  await adapter.emitCurrent("partial", {
    receivedAt: Date.now(),
    transcript: {
      id: "partial-shrunk",
      isFinal: false,
      text: "No harm will befall you",
    },
    type: "partial",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(60);

  expect(turnTexts).toEqual(["Go quietly alone no harm will befall you"]);
});

test("voice session combines timed final and partial fragments in one turn", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const turnTexts: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-combine-fragments",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      profile: "long-form",
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      endedAtMs: 3_120,
      id: "final-fragment",
      isFinal: true,
      startedAtMs: 1_200,
      text: "Go quietly alone.",
    },
    type: "final",
  });
  await adapter.emitCurrent("partial", {
    receivedAt: Date.now(),
    transcript: {
      endedAtMs: 5_145,
      id: "partial-fragment",
      isFinal: false,
      startedAtMs: 3_865,
      text: "No harm will befall you.",
    },
    type: "partial",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(60);

  expect(turnTexts).toEqual(["Go quietly alone. No harm will befall you."]);
});

test("voice session conditions audio before sending it to the adapter", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    audioConditioning: {
      enabled: true,
      maxGain: 4,
      noiseGateAttenuation: 0,
      noiseGateThreshold: 0.002,
      targetLevel: 0.1,
    },
    context: {},
    id: "session-audio-conditioning",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => {},
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      profile: "balanced",
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  const source = createSpeechChunk(1_200);
  await session.receiveAudio(source);

  const sent = adapter.getSentAudio()[0];
  expect(sent).toBeDefined();

  const originalSamples = Array.from(source);
  const conditionedSamples = Array.from(
    new Int16Array(
      sent!.buffer,
      sent!.byteOffset,
      Math.floor(sent!.byteLength / 2),
    ),
  );

  expect(
    conditionedSamples.some(
      (sample, index) => sample !== originalSamples[index],
    ),
  ).toBe(true);
  expect(adapter.getSentAudioChunks()).toBe(1);
});

test("voice session can reopen the adapter after each committed turn", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const turnTexts: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-turn-scoped-stt",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    sttLifecycle: "turn-scoped",
    turnDetection: {
      profile: "balanced",
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "final-turn-1",
      isFinal: true,
      text: "First turn",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(60);

  await session.receiveAudio(createSpeechChunk(16_000));
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "final-turn-2",
      isFinal: true,
      text: "Second turn",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(60);

  expect(turnTexts).toEqual(["First turn", "Second turn"]);
  expect(adapter.getOpenCalls()).toBeGreaterThanOrEqual(2);
  expect(adapter.getCloseCalls()).toBeGreaterThanOrEqual(1);
});

test("voice session ignores stale adapter events after a turn-scoped reopen", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const turnTexts: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-ignore-stale-adapter-events",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
      },
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    sttLifecycle: "turn-scoped",
    turnDetection: {
      profile: "long-form",
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "stale-final-turn-1",
      isFinal: true,
      text: "First turn",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(60);

  expect(adapter.getSessionCount()).toBeGreaterThanOrEqual(1);
  await session.receiveAudio(createSpeechChunk(16_000));
  expect(adapter.getSessionCount()).toBeGreaterThanOrEqual(2);
  await adapter.emitSession(0, "final", {
    receivedAt: Date.now(),
    transcript: {
      id: "stale-final-turn-2",
      isFinal: true,
      text: "Old session bleed",
    },
    type: "final",
  });
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "fresh-final-turn-2",
      isFinal: true,
      text: "Second turn",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(60);

  expect(turnTexts).toEqual(["First turn", "Second turn"]);
});

test("voice session emits call lifecycle hooks for transfer and call end", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const lifecycleEvents: string[] = [];
  let onCompleteCalls = 0;

  const session = createVoiceSession({
    context: {},
    id: "session-call-lifecycle-transfer",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onCallEnd: async ({ disposition, target }) => {
        lifecycleEvents.push(`end:${disposition}:${target ?? ""}`);
      },
      onCallStart: async () => {
        lifecycleEvents.push("start");
      },
      onComplete: async () => {
        onCompleteCalls += 1;
      },
      onTransfer: async ({ target }) => {
        lifecycleEvents.push(`transfer:${target}`);
      },
      onTurn: async () => {},
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.transfer({
    metadata: {
      queue: "billing",
    },
    target: "billing-queue",
  });

  const snapshot = await session.snapshot();

  expect(onCompleteCalls).toBe(0);
  expect(lifecycleEvents).toEqual([
    "start",
    "transfer:billing-queue",
    "end:transferred:billing-queue",
  ]);
  expect(snapshot.call?.disposition).toBe("transferred");
  expect(snapshot.call?.events.map((event) => event.type)).toEqual([
    "start",
    "transfer",
    "end",
  ]);
});

test("voice session supports voicemail and no-answer lifecycle outcomes", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const voicemailSocket = createMockSocket();
  const noAnswerSocket = createMockSocket();
  const voicemailEvents: string[] = [];
  const noAnswerEvents: string[] = [];

  const voicemailSession = createVoiceSession({
    context: {},
    id: "session-call-lifecycle-voicemail",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onCallEnd: async ({ disposition }) => {
        voicemailEvents.push(`end:${disposition}`);
      },
      onComplete: async () => {},
      onTurn: async () => {},
      onVoicemail: async () => {
        voicemailEvents.push("voicemail");
      },
    },
    socket: voicemailSocket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await voicemailSession.connect(voicemailSocket.socket);
  await voicemailSession.markVoicemail({
    metadata: {
      mailbox: "support",
    },
  });

  const voicemailMessages = voicemailSocket.messages.map((message) =>
    JSON.parse(message),
  );
  const voicemailLifecycleMessages = voicemailMessages.filter(
    (message) => message.type === "call_lifecycle",
  );

  expect((await voicemailSession.snapshot()).call?.disposition).toBe(
    "voicemail",
  );
  expect(
    voicemailLifecycleMessages.map((message) => message.event.type),
  ).toEqual(["start", "voicemail", "end"]);
  expect(voicemailLifecycleMessages.at(-1)?.event).toMatchObject({
    disposition: "voicemail",
    metadata: {
      mailbox: "support",
    },
    type: "end",
  });
  expect(voicemailEvents).toEqual(["voicemail", "end:voicemail"]);

  const noAnswerSession = createVoiceSession({
    context: {},
    id: "session-call-lifecycle-no-answer",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onCallEnd: async ({ disposition }) => {
        noAnswerEvents.push(`end:${disposition}`);
      },
      onComplete: async () => {},
      onNoAnswer: async () => {
        noAnswerEvents.push("no-answer");
      },
      onTurn: async () => {},
    },
    socket: noAnswerSocket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await noAnswerSession.connect(noAnswerSocket.socket);
  await noAnswerSession.markNoAnswer();

  expect((await noAnswerSession.snapshot()).call?.disposition).toBe(
    "no-answer",
  );
  expect(noAnswerEvents).toEqual(["no-answer", "end:no-answer"]);
});

test("voice session executes lifecycle actions returned from onTurn results", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const events: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-onturn-transfer-action",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onCallEnd: async ({ disposition, target }) => {
        events.push(`end:${disposition}:${target ?? ""}`);
      },
      onComplete: async () => {
        events.push("complete");
      },
      onTransfer: async ({ target }) => {
        events.push(`transfer:${target}`);
      },
      onTurn: async () => ({
        assistantText: "Transferring this call to billing.",
        transfer: {
          reason: "caller-requested-transfer",
          target: "billing",
        },
      }),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      id: "transfer-final",
      isFinal: true,
      text: "transfer me to billing",
    },
    type: "final",
  });
  await adapter.emitCurrent("endOfTurn", {
    reason: "vendor",
    receivedAt: Date.now(),
    type: "endOfTurn",
  });
  await Bun.sleep(40);

  expect(events).toEqual(["transfer:billing", "end:transferred:billing"]);
  expect(
    socket.messages.some((message) =>
      message.includes("Transferring this call to billing."),
    ),
  ).toBe(true);
  expect((await session.snapshot()).call?.disposition).toBe("transferred");
});

test("voice session captures user + assistant audio to recording store on close", async () => {
  const store = createVoiceMemoryStore();
  const trace = createVoiceMemoryTraceEventStore();
  const adapter = createFakeAdapter();
  const tts = createFakeTTSAdapter();
  const socket = createMockSocket();
  const recordingStore = createVoiceMemoryRecordingStore();

  const session = createVoiceSession({
    context: {},
    id: "session-recording",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    recording: {
      store: recordingStore,
      userInputFormat: {
        channels: 1,
        container: "raw",
        encoding: "pcm_s16le",
        sampleRateHz: 16_000,
      },
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => ({
        assistantText: `Replying to ${turn.text}`,
      }),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    trace,
    tts: tts.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(16_000));
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.9,
      id: "final-rec-1",
      isFinal: true,
      text: "record me",
      vendor: "fake-stt",
    },
    type: "final",
  });
  await session.commitTurn("manual");
  await session.close("test-end");

  const userRecording = await recordingStore.get("session-recording", "user");
  const assistantRecording = await recordingStore.get(
    "session-recording",
    "assistant",
  );
  expect(userRecording).toBeDefined();
  expect(assistantRecording).toBeDefined();
  expect(userRecording!.audioBytes.byteLength).toBeGreaterThan(0);
  expect(assistantRecording!.audioBytes.byteLength).toBeGreaterThan(0);

  const recordingEvents = await trace.list({ type: "recording.ready" });
  expect(recordingEvents).toHaveLength(2);
  expect(recordingEvents.map((event) => event.payload.channel).sort()).toEqual([
    "assistant",
    "user",
  ]);
});

test("voice session closes with silence-timeout disposition when no activity within callSilenceTimeoutMs", async () => {
  const store = createVoiceMemoryStore();
  const trace = createVoiceMemoryTraceEventStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    callSilenceTimeoutMs: 40,
    context: {},
    id: "session-silence",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => ({}),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    trace,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await Bun.sleep(120);

  const snapshot = await session.snapshot();
  expect(snapshot.call?.disposition).toBe("silence-timeout");
  const lifecycleEvents = await trace.list({ type: "call.lifecycle" });
  expect(
    lifecycleEvents.find(
      (event) => event.payload.disposition === "silence-timeout",
    ),
  ).toBeDefined();
});

test("voice session marks voicemail via AMD detector when caller monologues without a turn commit", async () => {
  const store = createVoiceMemoryStore();
  const trace = createVoiceMemoryTraceEventStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    amd: createMonologueAMDDetector({
      intervalMs: 20,
      minMonologueMs: 40,
    }),
    context: {},
    id: "session-amd",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => ({}),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    trace,
    turnDetection: {
      silenceMs: 1_000,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.receiveAudio(createSpeechChunk(16_000));
  await Bun.sleep(120);

  const snapshot = await session.snapshot();
  const voicemailEvent = snapshot.call?.events.find(
    (event) => event.type === "voicemail",
  );
  expect(voicemailEvent).toBeDefined();
  expect(voicemailEvent?.metadata).toMatchObject({ detector: "monologue" });
});

test("voice session fires TTS cancel when user speech is detected during agent playback", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const tts = createFakeTTSAdapter({ supportsCancel: true });
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-barge-in",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => ({
        assistantText: `Replying to ${turn.text}`,
      }),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    tts: tts.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.receiveAudio(createSpeechChunk(16_000));
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.9,
      id: "final-bi-1",
      isFinal: true,
      text: "hello there",
      vendor: "fake-stt",
    },
    type: "final",
  });
  await session.commitTurn("manual");
  expect(tts.getSentTexts()).toEqual(["Replying to hello there"]);

  // Barge-in is speech-gated: it fires on a partial transcript while the
  // assistant is still speaking, NOT on raw audio energy (a telephony line's
  // comfort noise crosses the speech threshold and would falsely interrupt).
  // Simulate the caller cutting in mid-playback.
  await adapter.emitCurrent("partial", {
    receivedAt: Date.now(),
    transcript: {
      id: "barge-in-partial",
      isFinal: false,
      text: "actually wait",
    },
    type: "partial",
  });
  await Bun.sleep(10);

  expect(tts.getCancelReasons()).toEqual(["barge-in"]);
});

test("voice session emits cost.ready trace event with TTS, STT, telephony breakdown on close", async () => {
  const store = createVoiceMemoryStore();
  const trace = createVoiceMemoryTraceEventStore();
  const adapter = createFakeAdapter();
  const tts = createFakeTTSAdapter();
  const socket = createMockSocket();
  const accountant = createVoiceCostAccountant({ sessionId: "session-cost" });

  const session = createVoiceSession({
    context: {},
    costAccountant: accountant,
    costTelephony: { provider: "twilio" },
    id: "session-cost",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => ({
        assistantText: `Replying to ${turn.text}`,
      }),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    trace,
    tts: tts.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.receiveAudio(createSpeechChunk(16_000));
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.9,
      id: "final-cost-1",
      isFinal: true,
      text: "test cost reporting",
      vendor: "fake-stt",
    },
    type: "final",
  });
  await session.commitTurn("manual");
  // simulate LLM usage report (would normally come via createAIVoiceModel.onUsage)
  accountant.recordLLM({
    inputTokens: 1_000,
    model: "claude-sonnet-4-5",
    outputTokens: 200,
    provider: "anthropic",
  });
  await session.close("test-end");

  const costEvents = await trace.list({ type: "cost.ready" });
  expect(costEvents).toHaveLength(1);
  const payload = costEvents[0]!.payload;
  expect(payload.llm.inputTokens).toBe(1_000);
  expect(payload.llm.outputTokens).toBe(200);
  expect(payload.tts.characters).toBeGreaterThan(0);
  expect(payload.totalUsd).toBeGreaterThan(0);
});

test("voice session attaches user media to the next committed turn", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-attach",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => ({}),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.attachUserMedia({
    data: "iVBORw0KGgo=",
    kind: "image",
    mediaType: "image/png",
  });
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.9,
      id: "final-attach",
      isFinal: true,
      text: "what's in the photo",
      vendor: "fake-stt",
    },
    type: "final",
  });
  await session.commitTurn("manual");

  const snapshot = await session.snapshot();
  const turn = snapshot.turns.at(-1);
  expect(turn?.attachments).toHaveLength(1);
  expect(turn?.attachments?.[0]).toMatchObject({
    kind: "image",
    mediaType: "image/png",
  });
});

test("voice session redacts PII out of transcripts before they enter the session record", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-redact",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    redact: createVoiceTranscriptRedactor(),
    route: {
      onComplete: async () => {},
      onTurn: async () => ({}),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.9,
      id: "final-pii",
      isFinal: true,
      text: "card is 4242 4242 4242 4242 and email me at user@example.com",
      vendor: "fake-stt",
    },
    type: "final",
  });
  await session.commitTurn("manual");

  const snapshot = await session.snapshot();
  const finalText = snapshot.turns.at(-1)?.text ?? "";
  expect(finalText).toContain("[REDACTED:CC]");
  expect(finalText).toContain("[REDACTED:EMAIL]");
  expect(finalText).not.toContain("4242");
  expect(finalText).not.toContain("user@example.com");
});

test("voice session commits a turn immediately when semantic detector signals end-of-turn", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const turnTexts: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-semantic",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        turnTexts.push(turn.text);
        return {};
      },
    },
    semanticTurnDetector: createPunctuationSemanticTurnDetector({
      minPartialWords: 2,
    }),
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      // intentionally large — semantic detector should commit before silence fires
      silenceMs: 5_000,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.receiveAudio(createSpeechChunk(16_000));
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.9,
      id: "final-semantic",
      isFinal: true,
      text: "I need help with my account.",
      vendor: "fake-stt",
    },
    type: "final",
  });
  await Bun.sleep(40);

  expect(turnTexts).toEqual(["I need help with my account."]);
});

test("voice session runs the noise suppressor before sending audio to STT", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();

  let processCalls = 0;
  let closeCalls = 0;
  const session = createVoiceSession({
    context: {},
    id: "session-noise-suppressor",
    noiseSuppressor: {
      close: () => {
        closeCalls += 1;
      },
      kind: "test-suppressor",
      process: ({ format, pcm }) => {
        processCalls += 1;
        const view =
          pcm instanceof Uint8Array
            ? pcm
            : pcm instanceof ArrayBuffer
              ? new Uint8Array(pcm)
              : new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        // Zero out every byte so we can prove the STT got the suppressed copy.
        return { bytes: new Uint8Array(view.length), format };
      },
    },
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => {},
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.receiveAudio(createSpeechChunk(16_000));
  expect(processCalls).toBe(1);
  const sent = adapter.getSentAudio();
  expect(sent).toHaveLength(1);
  // Suppressor zeroed the buffer, so every byte the STT received is 0.
  expect(sent[0]?.every((byte) => byte === 0)).toBe(true);

  await session.close("done");
  expect(closeCalls).toBe(1);
});

test("voice session falls back to raw audio when the suppressor throws", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const warnings: string[] = [];

  const session = createVoiceSession({
    context: {},
    id: "session-noise-suppressor-fallback",
    logger: {
      warn: (message) => {
        warnings.push(message);
      },
    },
    noiseSuppressor: {
      kind: "throwing-suppressor",
      process: () => {
        throw new Error("suppressor unavailable");
      },
    },
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => {},
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.receiveAudio(createSpeechChunk(16_000));

  expect(adapter.getSentAudioChunks()).toBe(1);
  expect(
    warnings.some((message) => message.includes("noise suppression failed")),
  ).toBe(true);
});

test("voice session greeting function receives the session", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const tts = createFakeTTSAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    greeting: ({ session: current }) => `Hello ${current.id}`,
    id: "session-greeting-fn",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => ({}),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    tts: tts.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await Bun.sleep(20);

  const greetingMessage = socket.messages
    .map((message) => JSON.parse(message))
    .find((message) => message.type === "assistant");
  expect(greetingMessage?.text).toBe("Hello session-greeting-fn");
});

test("voice session resumes from the persistent store after a restart without re-greeting", async () => {
  // The persistent store is the durable layer that SURVIVES the simulated
  // restart; each "process" gets its own fresh in-memory hot store on top.
  const persistent = createVoiceMemoryStore();
  const greeting = "Welcome — tell me about your work.";

  const buildSession = (memory: ReturnType<typeof createVoiceMemoryStore>) => {
    const adapter = createFakeAdapter();
    const tts = createFakeTTSAdapter();
    const socket = createMockSocket();
    const store = createVoiceWriteBehindStore({
      flushDebounceMs: 10,
      memory,
      persistent,
    });
    const session = createVoiceSession({
      context: {},
      greeting,
      id: "session-resume",
      logger: {},
      reconnect: {
        maxAttempts: 3,
        strategy: "resume-last-turn",
        timeout: 5_000,
      },
      route: { onComplete: async () => {}, onTurn: async () => ({}) },
      socket: socket.socket,
      store,
      stt: adapter.adapter,
      tts: tts.adapter,
      turnDetection: {
        silenceMs: 20,
        speechThreshold: 0.01,
        transcriptStabilityMs: 5,
      },
    });

    return { adapter, session, socket, store };
  };

  // Process 1: greet, then the caller answers one turn.
  const first = buildSession(createVoiceMemoryStore());
  await first.session.connect(first.socket.socket);
  await Bun.sleep(20);
  expect(
    first.socket.messages
      .map((message) => JSON.parse(message))
      .some(
        (message) => message.type === "assistant" && message.text === greeting,
      ),
  ).toBe(true);

  await first.adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: { id: "final-1", isFinal: true, text: "I run a sales SaaS." },
    type: "final",
  });
  await first.session.receiveAudio(createSpeechChunk(16_000));
  await first.session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(60);
  expect((await first.session.snapshot()).turns).toHaveLength(1);

  // Persist the committed turn, then the process "dies".
  await first.store.flush();

  // Process 2: brand-new hot store (memory wiped), same persistent layer. The
  // client reconnects with the SAME id.
  const second = buildSession(createVoiceMemoryStore());
  await second.session.connect(second.socket.socket);
  await Bun.sleep(20);

  const secondMessages = second.socket.messages.map((message) =>
    JSON.parse(message),
  );
  // No greeting re-fired — the session was found in the persistent store.
  expect(
    secondMessages.some(
      (message) => message.type === "assistant" && message.text === greeting,
    ),
  ).toBe(false);
  // The prior turn is replayed so the conversation continues where it left off.
  const replay = secondMessages.find((message) => message.type === "replay");
  expect(replay?.turns).toHaveLength(1);
  expect(replay?.turns?.[0]?.text).toBe("I run a sales SaaS.");
});

test("voice session speaks the resume re-orientation and fires onResume after a restart with turns", async () => {
  const persistent = createVoiceMemoryStore();
  const greeting = "Welcome — tell me about your work.";
  const resumeGreeting = "Sorry, you cut out there — please go on.";
  const onResumeIds: string[] = [];

  const build = (memory: ReturnType<typeof createVoiceMemoryStore>) => {
    const adapter = createFakeAdapter();
    const tts = createFakeTTSAdapter();
    const socket = createMockSocket();
    const store = createVoiceWriteBehindStore({
      flushDebounceMs: 10,
      memory,
      persistent,
    });
    const session = createVoiceSession({
      context: {},
      greeting,
      id: "session-resume-line",
      logger: {},
      reconnect: {
        maxAttempts: 3,
        strategy: "resume-last-turn",
        timeout: 5_000,
      },
      resumeGreeting,
      route: {
        onComplete: async () => {},
        onResume: async ({ session: resumed }) => {
          onResumeIds.push(resumed.id);
        },
        onTurn: async () => ({}),
      },
      socket: socket.socket,
      store,
      stt: adapter.adapter,
      tts: tts.adapter,
      turnDetection: {
        silenceMs: 20,
        speechThreshold: 0.01,
        transcriptStabilityMs: 5,
      },
    });

    return { adapter, session, socket, store };
  };

  const first = build(createVoiceMemoryStore());
  await first.session.connect(first.socket.socket);
  await Bun.sleep(20);
  await first.adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: { id: "final-1", isFinal: true, text: "I run a sales SaaS." },
    type: "final",
  });
  await first.session.receiveAudio(createSpeechChunk(16_000));
  await first.session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(60);
  await first.store.flush();

  const second = build(createVoiceMemoryStore());
  await second.session.connect(second.socket.socket);
  await Bun.sleep(20);

  const assistantTexts = second.socket.messages
    .map((message) => JSON.parse(message))
    .filter((message) => message.type === "assistant")
    .map((message) => message.text);

  // onResume fired (so the app can rebuild per-session state)...
  expect(onResumeIds).toEqual(["session-resume-line"]);
  // ...the caller hears the re-orientation, NOT a repeat of the greeting.
  expect(assistantTexts).toContain(resumeGreeting);
  expect(assistantTexts).not.toContain(greeting);
});

test("voice session re-greets when a restart lands before the first turn", async () => {
  const persistent = createVoiceMemoryStore();
  const greeting = "Welcome — tell me about your work.";
  const resumeGreeting = "Sorry, you cut out — go on.";

  const build = (memory: ReturnType<typeof createVoiceMemoryStore>) => {
    const adapter = createFakeAdapter();
    const tts = createFakeTTSAdapter();
    const socket = createMockSocket();
    const store = createVoiceWriteBehindStore({
      flushDebounceMs: 10,
      memory,
      persistent,
    });
    const session = createVoiceSession({
      context: {},
      greeting,
      id: "session-resume-pregreet",
      logger: {},
      reconnect: {
        maxAttempts: 3,
        strategy: "resume-last-turn",
        timeout: 5_000,
      },
      resumeGreeting,
      route: { onComplete: async () => {}, onTurn: async () => ({}) },
      socket: socket.socket,
      store,
      stt: adapter.adapter,
      tts: tts.adapter,
      turnDetection: {
        silenceMs: 20,
        speechThreshold: 0.01,
        transcriptStabilityMs: 5,
      },
    });

    return { session, socket, store };
  };

  // Process 1: greet, but the caller never answers — no committed turn.
  const first = build(createVoiceMemoryStore());
  await first.session.connect(first.socket.socket);
  await Bun.sleep(20);
  await first.store.flush();

  // Process 2: restart landed before the first turn (turns === 0). Because the
  // conversation hadn't started, re-greet from the top — not the resume line.
  const second = build(createVoiceMemoryStore());
  await second.session.connect(second.socket.socket);
  await Bun.sleep(20);

  const assistantTexts = second.socket.messages
    .map((message) => JSON.parse(message))
    .filter((message) => message.type === "assistant")
    .map((message) => message.text);
  expect(assistantTexts).toContain(greeting);
  expect(assistantTexts).not.toContain(resumeGreeting);
});

test("voice session plays a backchannel cue during a long caller turn when enabled", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const tts = createFakeTTSAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    backchannel: {
      cueIntervalMs: 20,
      cues: ["mm-hm"],
      enabled: true,
      minSpeechMs: 30,
    },
    context: {},
    id: "session-backchannel-on",
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => ({ assistantText: `You said: ${turn.text}` }),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    tts: tts.adapter,
    // Long silence window so the turn stays OPEN — we're simulating the caller
    // still mid-answer, which is when a backchannel cue should fire.
    turnDetection: {
      silenceMs: 5_000,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  // Caller keeps talking past minSpeechMs without the turn ending.
  await session.receiveAudio(createSpeechChunk(1_000));
  await Bun.sleep(45);
  await session.receiveAudio(createSpeechChunk(1_000));
  await Bun.sleep(20);

  expect(tts.getSentTexts()).toContain("mm-hm");
});

test("voice session plays no backchannel cue when disabled", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const tts = createFakeTTSAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-backchannel-off",
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async ({ turn }) => ({ assistantText: `You said: ${turn.text}` }),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    tts: tts.adapter,
    turnDetection: {
      silenceMs: 5_000,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.receiveAudio(createSpeechChunk(1_000));
  await Bun.sleep(45);
  await session.receiveAudio(createSpeechChunk(1_000));
  await Bun.sleep(20);

  expect(tts.getSentTexts()).toEqual([]);
});

// Regression: a streaming TTS provider accepts the closing text in send() but
// emits the audio chunks ASYNCHRONOUSLY afterward. The graceful-complete drain
// must wait for that delayed audio to arrive AND play out before tearing the
// call down — otherwise the closing line ("talk to you soon!") is cut. The old
// drain read the playback clock the instant complete fired (still zero, audio
// not yet arrived) and returned immediately.
const createDelayedStreamingTTSAdapter = (input: {
  firstChunkDelayMs: number;
  chunkBytes: number;
}) => {
  const sentTexts: string[] = [];

  const adapter: TTSAdapter = {
    kind: "tts",
    open: () => {
      const listeners: TTSListenerMap = {
        audio: [],
        close: [],
        error: [],
      };
      const session: TTSAdapterSession = {
        close: async () => {},
        on: (event, handler) => {
          listeners[event].push(handler as never);

          return () => {
            const index = listeners[event].indexOf(handler as never);
            if (index >= 0) {
              listeners[event].splice(index, 1);
            }
          };
        },
        send: async (text) => {
          sentTexts.push(text);
          // Resolve immediately; deliver the audio LATER, off the send() call —
          // exactly how a streaming provider (ElevenLabs WS) behaves.
          void (async () => {
            await Bun.sleep(input.firstChunkDelayMs);
            for (const handler of listeners.audio) {
              await handler({
                chunk: new Uint8Array(input.chunkBytes),
                format: {
                  channels: 1,
                  container: "raw",
                  encoding: "pcm_s16le",
                  sampleRateHz: 16_000,
                },
                receivedAt: Date.now(),
                type: "audio",
              });
            }
          })();
        },
      };

      return session;
    },
  };

  return { adapter, getSentTexts: () => sentTexts };
};

test("voice graceful complete waits for asynchronously-arriving closing audio (no cut goodbye)", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  // 16 kHz mono pcm_s16le = 32000 bytes/sec, so 16000 bytes = 500ms of audio.
  // The chunk only arrives 150ms AFTER send() resolves.
  const tts = createDelayedStreamingTTSAdapter({
    chunkBytes: 16_000,
    firstChunkDelayMs: 150,
  });
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    greeting: undefined,
    id: "session-closing-drain",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => ({
        assistantText: "Thanks so much — talk to you soon!",
        complete: true,
      }),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    tts: tts.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: {
      confidence: 0.9,
      id: "final-closing",
      isFinal: true,
      text: "okay sounds good",
    },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));

  const startedAt = Date.now();
  // completeTurn -> onTurn (complete:true) -> completeInternal -> drain.
  await session.commitTurn("manual");
  const elapsedMs = Date.now() - startedAt;

  // The closing text was sent to the provider...
  expect(tts.getSentTexts()).toEqual(["Thanks so much — talk to you soon!"]);
  // ...the delayed audio chunk reached the client BEFORE teardown...
  const audioMessages = socket.messages
    .map((message) => JSON.parse(message))
    .filter((message) => message.type === "audio");
  expect(audioMessages.length).toBeGreaterThan(0);
  // ...and the drain held the call open until that audio (150ms arrival +
  // 500ms playback) had played out. The old drain returned in ~0ms.
  expect(elapsedMs).toBeGreaterThanOrEqual(400);
  expect((await session.snapshot()).status).toBe("completed");
});

test("voice session reconnects the STT stream after a non-recoverable close instead of failing the call", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-stt-reconnect",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => ({}),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  // First inbound audio opens STT session #1.
  await session.receiveAudio(createSpeechChunk(16_000));
  await Bun.sleep(20);
  expect(adapter.getOpenCalls()).toBe(1);

  // Deepgram recycles its socket mid-call with a normal (1000) close, which the
  // adapter flags recoverable:false. For a live call that's a dropped stream,
  // not a fatal error — the call must NOT fail.
  await adapter.emitCurrent("close", {
    code: 1000,
    reason: "Speech-to-text session closed",
    recoverable: false,
    type: "close",
  });
  await Bun.sleep(20);
  expect((await session.snapshot()).status).not.toBe("failed");

  // The next inbound audio packet transparently re-opens a fresh STT session.
  await session.receiveAudio(createSpeechChunk(16_000));
  await Bun.sleep(20);
  expect(adapter.getOpenCalls()).toBe(2);
  expect((await session.snapshot()).status).not.toBe("failed");
});

test("voice session fails the call once the STT close flap budget is exhausted", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();

  const session = createVoiceSession({
    context: {},
    id: "session-stt-flap",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => ({}),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);

  // A socket that closes immediately every time it opens (e.g. a rejected API
  // key) flaps. The budget tolerates a few reconnects within the window, then
  // gives up and fails the call rather than looping forever.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await session.receiveAudio(createSpeechChunk(16_000));
    await Bun.sleep(15);
    await adapter.emitCurrent("close", {
      code: 1000,
      reason: "stt closed",
      recoverable: false,
      type: "close",
    });
    await Bun.sleep(15);
  }

  expect((await session.snapshot()).status).toBe("failed");
});

test("records conversational LLM usage from the turn result into the cost accountant", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const socket = createMockSocket();
  const costAccountant = createVoiceCostAccountant();

  const session = createVoiceSession({
    context: {},
    costAccountant,
    id: "session-llm-usage",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      // The model adapter now reports per-turn token usage on the result; the
      // session must record it so voice conversation cost is metered.
      onTurn: async () => ({
        assistantText: "sure, here you go",
        usage: {
          inputTokens: 1_000,
          model: "claude-haiku-4-5-20251001",
          outputTokens: 200,
          provider: "anthropic",
        },
      }),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await adapter.emitCurrent("final", {
    receivedAt: Date.now(),
    transcript: { id: "final-1", isFinal: true, text: "hello there" },
    type: "final",
  });
  await session.receiveAudio(createSpeechChunk(16_000));
  await session.receiveAudio(createSpeechChunk(0));
  await Bun.sleep(60);

  const breakdown = costAccountant.snapshot();
  expect(breakdown.llm.inputTokens).toBe(1_000);
  expect(breakdown.llm.outputTokens).toBe(200);
  expect(breakdown.llm.usd).toBeGreaterThan(0);
  expect(
    breakdown.llm.byProvider.some((slice) => slice.provider === "anthropic"),
  ).toBe(true);
});

test("stuckCallClose gracefully completes a wedged call: speaks the sign-off and saves", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const tts = createFakeTTSAdapter();
  const socket = createMockSocket();
  let completeCalls = 0;

  const session = createVoiceSession({
    context: {},
    id: "session-stuck-close",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {
        completeCalls += 1;
      },
      onTurn: async () => ({}),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    stuckCallClose: {
      afterMs: 60,
      line: "Thanks, I have what I need. Talk soon.",
      reason: "stuck-test",
    },
    tts: tts.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  // No caller audio or transcripts ever land — the call is wedged.
  await Bun.sleep(160);

  // onComplete (the persistence hook) ran exactly once, so the intake is saved.
  expect(completeCalls).toBe(1);
  // The warm sign-off was spoken (not dead air).
  expect(tts.getSentTexts()).toContain(
    "Thanks, I have what I need. Talk soon.",
  );

  const messages = socket.messages.map((message) => JSON.parse(message));
  expect(
    messages.some(
      (message) =>
        message.type === "assistant" &&
        message.text === "Thanks, I have what I need. Talk soon.",
    ),
  ).toBe(true);
  // And it ended as a COMPLETED call (not failed / abandoned) — status is set
  // synchronously at completion, ahead of the closing-audio drain.
  expect((await session.snapshot()).status).toBe("completed");
});

test("stuckCallClose is reset by caller progress and never fires on a flowing call", async () => {
  const store = createVoiceMemoryStore();
  const adapter = createFakeAdapter();
  const tts = createFakeTTSAdapter();
  const socket = createMockSocket();
  let completeCalls = 0;

  const session = createVoiceSession({
    context: {},
    id: "session-stuck-no-false-fire",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {
        completeCalls += 1;
      },
      onTurn: async () => ({}),
    },
    socket: socket.socket,
    store,
    stt: adapter.adapter,
    stuckCallClose: {
      afterMs: 120,
      line: "Should not be spoken.",
    },
    tts: tts.adapter,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  // A live partial keeps landing well inside the window — the caller is getting
  // through, so the deadline must keep resetting and never auto-close them.
  for (let tick = 0; tick < 4; tick += 1) {
    await adapter.emitCurrent("partial", {
      receivedAt: Date.now(),
      transcript: { id: `p-${tick}`, isFinal: false, text: "still talking" },
      type: "partial",
    });
    await Bun.sleep(70);
  }

  expect(completeCalls).toBe(0);
  expect(tts.getSentTexts()).not.toContain("Should not be spoken.");
  expect((await session.snapshot()).status).not.toBe("completed");
});
