import { expect, test } from "bun:test";
import {
  buildVoiceProviderDecisionTraceReport,
  createVoiceMemoryTraceEventStore,
  createVoiceProviderDecisionTraceEvent,
  createVoiceProviderDecisionTraceRoutes,
  listVoiceProviderDecisionTraces,
  renderVoiceProviderDecisionTraceHTML,
  renderVoiceProviderDecisionTraceMarkdown,
} from "../src";
import type { StoredVoiceTraceEvent } from "../src";

test("provider decision traces report explicit runtime selection and fallback reasons", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await store.append(
    createVoiceProviderDecisionTraceEvent({
      kind: "llm",
      provider: "openai",
      reason: "live-call chose openai for latency-first policy",
      selectedProvider: "openai",
      sessionId: "call-1",
      status: "selected",
      surface: "live-call",
    }),
  );
  await store.append(
    createVoiceProviderDecisionTraceEvent({
      error: "rate limited",
      fallbackProvider: "assemblyai",
      kind: "stt",
      provider: "deepgram",
      selectedProvider: "assemblyai",
      sessionId: "call-1",
      status: "fallback",
      surface: "live-stt",
    }),
  );
  await store.append(
    createVoiceProviderDecisionTraceEvent({
      fallbackProvider: "deterministic",
      kind: "llm",
      provider: "openai",
      reason:
        "live-call degraded to deterministic fallback after model providers exceeded the latency budget.",
      selectedProvider: "deterministic",
      sessionId: "call-1",
      status: "degraded",
      surface: "live-call",
    }),
  );

  const report = await buildVoiceProviderDecisionTraceReport({
    minDegraded: 1,
    minDecisions: 3,
    minFallbacks: 1,
    requiredFallbackProviders: ["assemblyai", "deterministic"],
    requiredReasonIncludes: ["latency budget"],
    requiredStatuses: ["fallback", "degraded"],
    requiredSurfaces: ["live-call", "live-stt"],
    store,
  });

  expect(report).toMatchObject({
    status: "pass",
    summary: {
      degraded: 1,
      decisions: 3,
      fallbacks: 1,
      providers: 4,
      selected: 1,
      surfaces: 2,
    },
  });
  expect(report.surfaces).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        degraded: 1,
        providers: ["deterministic", "openai"],
        selected: 1,
        surface: "live-call",
      }),
      expect.objectContaining({
        fallbacks: 1,
        providers: ["assemblyai", "deepgram"],
        surface: "live-stt",
      }),
    ]),
  );
  expect(renderVoiceProviderDecisionTraceMarkdown(report)).toContain(
    "Voice Provider Decision Traces",
  );
  expect(renderVoiceProviderDecisionTraceMarkdown(report)).toContain(
    "Degraded: 1",
  );
  expect(renderVoiceProviderDecisionTraceHTML(report)).toContain(
    "Runtime proof",
  );
});

test("provider decision traces fail when fallback and degradation proof is missing", async () => {
  const report = await buildVoiceProviderDecisionTraceReport({
    events: [
      createVoiceProviderDecisionTraceEvent({
        provider: "openai",
        reason: "live-call selected openai.",
        selectedProvider: "openai",
        sessionId: "call-2",
        status: "selected",
        surface: "live-call",
      }) as StoredVoiceTraceEvent,
    ],
    minDegraded: 1,
    minFallbacks: 1,
    requiredFallbackProviders: ["anthropic"],
    requiredReasonIncludes: ["latency budget"],
    requiredStatuses: ["fallback", "degraded"],
  });

  expect(report.status).toBe("fail");
  expect(report.issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining([
      "voice.provider_decision_trace.min_degraded",
      "voice.provider_decision_trace.min_fallbacks",
      "voice.provider_decision_trace.status_missing",
      "voice.provider_decision_trace.fallback_provider_missing",
      "voice.provider_decision_trace.reason_missing",
    ]),
  );
});

test("provider decision traces normalize existing session.error routing events", () => {
  const decisions = listVoiceProviderDecisionTraces([
    {
      at: 100,
      id: "routing-1",
      payload: {
        elapsedMs: 240,
        kind: "tts",
        provider: "openai",
        providerStatus: "fallback",
        selectedProvider: "emergency",
      },
      sessionId: "phone-1",
      type: "session.error",
    },
  ]);

  expect(decisions).toEqual([
    expect.objectContaining({
      provider: "openai",
      selectedProvider: "emergency",
      status: "fallback",
      surface: "telephony-tts",
    }),
  ]);
});

test("provider decision trace routes expose json html and markdown", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await store.append(
    createVoiceProviderDecisionTraceEvent({
      provider: "gemini",
      selectedProvider: "gemini",
      sessionId: "summary-1",
      status: "success",
      surface: "background-summary",
    }),
  );
  const routes = createVoiceProviderDecisionTraceRoutes({
    htmlPath: "/voice/provider-decisions",
    markdownPath: "/voice/provider-decisions.md",
    path: "/api/voice/provider-decisions",
    store,
  });

  const json = await routes.handle(
    new Request("http://localhost/api/voice/provider-decisions"),
  );
  const html = await routes.handle(
    new Request("http://localhost/voice/provider-decisions"),
  );
  const markdown = await routes.handle(
    new Request("http://localhost/voice/provider-decisions.md"),
  );

  expect(json.status).toBe(200);
  await expect(json.json()).resolves.toMatchObject({
    status: "pass",
    summary: {
      decisions: 1,
    },
  });
  expect(html.status).toBe(200);
  expect(await html.text()).toContain("Provider Decision Traces");
  expect(markdown.status).toBe(200);
  expect(await markdown.text()).toContain("# Voice Provider Decision Traces");
});
