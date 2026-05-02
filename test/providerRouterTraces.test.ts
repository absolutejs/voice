import { expect, test } from "bun:test";
import {
  appendVoiceIOProviderRouterTraceEvent,
  appendVoiceProviderRouterTraceEvent,
  buildVoiceIOProviderRouterTraceEvent,
  buildVoiceProviderRouterTraceEvent,
} from "../src/providerRouterTraces";
import { createVoiceMemoryTraceEventStore } from "../src/trace";

test("buildVoiceProviderRouterTraceEvent maps model router events to session error traces", () => {
  const trace = buildVoiceProviderRouterTraceEvent({
    event: {
      at: 1_000,
      attempt: 1,
      elapsedMs: 420,
      fallbackProvider: "anthropic",
      provider: "anthropic",
      selectedProvider: "openai",
      status: "fallback",
    },
    scenarioId: "provider-routing-contract",
    sessionId: "session-1",
    turnId: "turn-1",
  });

  expect(trace).toMatchObject({
    at: 1_000,
    payload: {
      attempt: 1,
      elapsedMs: 420,
      fallbackProvider: "anthropic",
      provider: "anthropic",
      providerStatus: "fallback",
      selectedProvider: "openai",
      status: "fallback",
    },
    scenarioId: "provider-routing-contract",
    sessionId: "session-1",
    turnId: "turn-1",
    type: "session.error",
  });
});

test("appendVoiceProviderRouterTraceEvent appends model provider router traces", async () => {
  const store = createVoiceMemoryTraceEventStore();

  await appendVoiceProviderRouterTraceEvent({
    event: {
      at: 2_000,
      attempt: 0,
      elapsedMs: 12,
      error: "OpenAI failed",
      provider: "openai",
      selectedProvider: "openai",
      status: "error",
      timedOut: true,
    },
    metadata: { proof: "provider-recovery" },
    payload: { routing: "fastest" },
    sessionId: "session-2",
    store,
    turnId: "turn-2",
  });

  expect(await store.list()).toMatchObject([
    {
      metadata: { proof: "provider-recovery" },
      payload: {
        provider: "openai",
        providerStatus: "error",
        routing: "fastest",
        timedOut: true,
      },
      sessionId: "session-2",
      turnId: "turn-2",
      type: "session.error",
    },
  ]);
});

test("buildVoiceIOProviderRouterTraceEvent maps STT and TTS router events to session error traces", () => {
  const trace = buildVoiceIOProviderRouterTraceEvent({
    event: {
      at: 3_000,
      attempt: 1,
      elapsedMs: 28,
      fallbackProvider: "assemblyai",
      kind: "stt",
      operation: "open",
      provider: "assemblyai",
      selectedProvider: "deepgram",
      status: "fallback",
    },
    scenarioId: "stt-provider-routing-contract",
    sessionId: "session-3",
  });

  expect(trace).toMatchObject({
    payload: {
      fallbackProvider: "assemblyai",
      kind: "stt",
      operation: "open",
      provider: "assemblyai",
      providerStatus: "fallback",
      selectedProvider: "deepgram",
      status: "fallback",
    },
    scenarioId: "stt-provider-routing-contract",
    sessionId: "session-3",
    type: "session.error",
  });
});

test("appendVoiceIOProviderRouterTraceEvent appends IO provider router traces", async () => {
  const store = createVoiceMemoryTraceEventStore();

  await appendVoiceIOProviderRouterTraceEvent({
    event: {
      at: 4_000,
      attempt: 0,
      elapsedMs: 18,
      error: "OpenAI TTS failed",
      kind: "tts",
      operation: "open",
      provider: "openai",
      selectedProvider: "openai",
      status: "error",
    },
    sessionId: "session-4",
    store,
  });

  expect(await store.list()).toMatchObject([
    {
      payload: {
        kind: "tts",
        provider: "openai",
        providerStatus: "error",
      },
      sessionId: "session-4",
      type: "session.error",
    },
  ]);
});
