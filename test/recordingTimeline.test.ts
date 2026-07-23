import { expect, test } from "bun:test";
import { createVoiceMemoryStore } from "../src/core/memoryStore";
import { createVoiceMemoryRecordingStore } from "../src/core/recordingStore";
import { createVoiceSession } from "../src/core/session";
import { createVoiceMemoryTraceEventStore } from "../src/core/trace";
import type {
  AudioFormat,
  STTAdapter,
  TTSAdapter,
  TTSSessionEventMap,
  VoiceSocket,
} from "../src/core/types";

const AUDIO_CHUNK_BYTES = 20;
const STREAM_GAP_MS = 80;
const format: AudioFormat = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 1000,
};

test("recordings preserve elapsed silence between assistant chunks", async () => {
  const recordings = createVoiceMemoryRecordingStore();
  const traces = createVoiceMemoryTraceEventStore();
  const handlers = new Map<
    keyof TTSSessionEventMap,
    (payload: never) => void | Promise<void>
  >();
  const chunk = new Uint8Array(AUDIO_CHUNK_BYTES);
  const tts: TTSAdapter = {
    kind: "tts",
    open: async () => ({
      close: () => Promise.resolve(),
      on: <K extends keyof TTSSessionEventMap>(
        event: K,
        handler: (payload: TTSSessionEventMap[K]) => void | Promise<void>,
      ) => {
        handlers.set(event, handler);
        return () => handlers.delete(event);
      },
      send: async () => {
        const emitAudio = handlers.get("audio");
        await emitAudio?.({
          chunk,
          format,
          receivedAt: Date.now(),
          type: "audio",
        } as never);
        await Bun.sleep(STREAM_GAP_MS);
        await emitAudio?.({
          chunk,
          format,
          receivedAt: Date.now(),
          type: "audio",
        } as never);
      },
    }),
  };
  const socket: VoiceSocket = {
    close: () => Promise.resolve(),
    send: () => Promise.resolve(),
  };
  const stt: STTAdapter = {
    kind: "stt",
    open: async () => ({
      close: () => Promise.resolve(),
      on: () => () => undefined,
      send: () => Promise.resolve(),
    }),
  };
  const session = createVoiceSession({
    context: undefined,
    greeting: "Hello",
    id: "recording-timeline-test",
    reconnect: { maxAttempts: 0, strategy: "restart", timeout: 1000 },
    recording: {
      channels: ["assistant", "user"],
      store: recordings,
      userInputFormat: format,
    },
    route: {
      onComplete: () => Promise.resolve(),
      onTurn: () => Promise.resolve(),
    },
    socket,
    store: createVoiceMemoryStore(),
    stt,
    sttLifecycle: "continuous",
    trace: traces,
    tts,
    turnDetection: {
      minSilenceMs: 100,
      profile: "balanced",
      qualityProfile: "general",
      silenceMs: 300,
      speechThreshold: 0.01,
      transcriptStabilityMs: 100,
    },
  });

  await session.connect(socket);
  await session.receiveAudio(chunk);
  await session.complete();

  const assistant = await recordings.get(
    "recording-timeline-test",
    "assistant",
  );
  const user = await recordings.get("recording-timeline-test", "user");
  expect(assistant?.durationMs).toBeGreaterThanOrEqual(85);
  expect(assistant?.audioBytes.byteLength).toBeGreaterThanOrEqual(170);
  expect(user?.durationMs).toBeGreaterThanOrEqual(75);
  expect(user?.audioBytes.byteLength).toBeGreaterThanOrEqual(150);
  const events = await traces.list({ sessionId: "recording-timeline-test" });
  const audioEvent = events.find(
    (event) =>
      event.type === "turn_latency.stage" &&
      event.payload.stage === "assistant_audio_received",
  );
  expect(audioEvent?.payload.recordingByteLength).toBe(AUDIO_CHUNK_BYTES);
  expect(typeof audioEvent?.payload.recordingStartMs).toBe("number");
});
