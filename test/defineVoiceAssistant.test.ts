import { describe, expect, test } from "bun:test";
import { defineVoiceAssistant } from "../src/defineVoiceAssistant";
import type {
  AudioFormat,
  TTSAdapter,
  STTAdapter,
  VoiceSocket,
} from "../src/types";
import { createVoiceMemoryStore } from "../src/memoryStore";

const stubAdapter = <K extends "stt" | "tts">(kind: K) =>
  ({ kind, open: async () => ({}) as never }) as never as K extends "tts"
    ? TTSAdapter
    : STTAdapter;

const socket: VoiceSocket = {
  close: async () => {},
  send: async () => {},
};

describe("defineVoiceAssistant", () => {
  test("returns a ready assistant + a session-options factory", () => {
    const defined = defineVoiceAssistant({
      agent: {
        model: { generate: async () => ({}) },
      },
      id: "concierge",
      voice: {
        stt: stubAdapter("stt"),
        tts: stubAdapter("tts"),
      },
    });
    expect(defined.id).toBe("concierge");
    expect(defined.assistant.id).toBe("concierge");
    expect(typeof defined.toSessionOptions).toBe("function");
  });

  test("toSessionOptions threads runtime knobs through to CreateVoiceSessionOptions", () => {
    const defined = defineVoiceAssistant({
      agent: { model: { generate: async () => ({}) } },
      callSilenceTimeoutMs: 30_000,
      id: "support",
      metadata: { tier: "gold" },
      voice: {
        prosody: { speed: 1.1, style: "warm" },
        stt: stubAdapter("stt"),
        tts: stubAdapter("tts"),
      },
    });
    const sessionOptions = defined.toSessionOptions({
      context: {},
      id: "session-1",
      socket,
      store: createVoiceMemoryStore(),
    });
    expect(sessionOptions.id).toBe("session-1");
    expect(sessionOptions.callSilenceTimeoutMs).toBe(30_000);
    expect(sessionOptions.prosody?.style).toBe("warm");
    expect(sessionOptions.sessionMetadata).toMatchObject({ tier: "gold" });
    expect(sessionOptions.tts).toBeDefined();
    expect(sessionOptions.stt).toBeDefined();
    expect(sessionOptions.route).toBeDefined();
  });

  test("session-level metadata overrides assistant-level metadata", () => {
    const defined = defineVoiceAssistant({
      agent: { model: { generate: async () => ({}) } },
      id: "support",
      metadata: { tier: "gold", source: "voice" },
      voice: { stt: stubAdapter("stt") },
    });
    const sessionOptions = defined.toSessionOptions({
      context: {},
      id: "session-1",
      sessionMetadata: { tier: "platinum" },
      socket,
      store: createVoiceMemoryStore(),
    });
    expect(sessionOptions.sessionMetadata).toEqual({
      source: "voice",
      tier: "platinum",
    });
  });
});
