import { expect, test } from "bun:test";
import {
  assertVoiceProviderSloEvidence,
  buildVoiceProviderSloReport,
  createVoiceMemoryTraceEventStore,
  createVoiceProviderSloRoutes,
  createVoiceTraceEvent,
  evaluateVoiceProviderSloEvidence,
  renderVoiceProviderSloMarkdown,
} from "../src";

test("buildVoiceProviderSloReport passes healthy provider routing latency", async () => {
  const report = await buildVoiceProviderSloReport({
    events: [
      createVoiceTraceEvent({
        at: 1_000,
        payload: {
          elapsedMs: 320,
          kind: "llm",
          provider: "openai",
          providerStatus: "success",
        },
        sessionId: "session-1",
        type: "session.error",
      }),
      createVoiceTraceEvent({
        at: 1_100,
        payload: {
          elapsedMs: 120,
          kind: "stt",
          provider: "deepgram",
          providerStatus: "success",
        },
        sessionId: "session-1",
        type: "session.error",
      }),
      createVoiceTraceEvent({
        at: 1_200,
        payload: {
          elapsedMs: 210,
          kind: "tts",
          provider: "openai",
          providerStatus: "success",
        },
        sessionId: "session-1",
        type: "session.error",
      }),
    ],
    requiredKinds: ["llm", "stt", "tts"],
  });

  expect(report.status).toBe("pass");
  expect(report.kinds.llm.metrics.averageElapsedMs).toMatchObject({
    actual: 320,
    pass: true,
  });
  expect(report.kinds.stt.providers).toEqual(["deepgram"]);
  expect(renderVoiceProviderSloMarkdown(report)).toContain("| LLM | pass |");
});

test("buildVoiceProviderSloReport fails unresolved errors and latency budget breaches", async () => {
  const report = await buildVoiceProviderSloReport({
    events: [
      createVoiceTraceEvent({
        at: 1_000,
        payload: {
          elapsedMs: 6_000,
          error: "OpenAI timed out",
          kind: "llm",
          provider: "openai",
          providerStatus: "error",
          timedOut: true,
        },
        sessionId: "session-slow",
        type: "session.error",
      }),
    ],
    requiredKinds: ["llm"],
    thresholds: {
      llm: {
        maxAverageElapsedMs: 1_000,
        maxErrorRate: 0,
        maxP95ElapsedMs: 1_500,
        maxTimeoutRate: 0,
      },
    },
  });

  expect(report.status).toBe("fail");
  expect(report.kinds.llm.status).toBe("fail");
  expect(report.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "provider_slo.average_latency",
        kind: "llm",
        status: "fail",
      }),
      expect.objectContaining({
        code: "provider_slo.error_rate",
        kind: "llm",
        status: "fail",
      }),
    ]),
  );
});

test("buildVoiceProviderSloReport can bound SLO evidence to a recent window", async () => {
  const report = await buildVoiceProviderSloReport({
    events: [
      createVoiceTraceEvent({
        at: 1_000,
        payload: {
          elapsedMs: 8_000,
          kind: "llm",
          provider: "openai",
          providerStatus: "success",
        },
        sessionId: "stale-slow",
        type: "session.error",
      }),
      createVoiceTraceEvent({
        at: 10_000,
        payload: {
          elapsedMs: 300,
          kind: "llm",
          provider: "openai",
          providerStatus: "success",
        },
        sessionId: "fresh-fast",
        type: "session.error",
      }),
    ],
    maxAgeMs: 1_000,
    now: 10_500,
    requiredKinds: ["llm"],
    thresholds: {
      llm: {
        maxAverageElapsedMs: 1_000,
        maxP95ElapsedMs: 1_000,
      },
    },
  });

  expect(report.status).toBe("pass");
  expect(report.events).toBe(1);
  expect(report.kinds.llm.metrics.averageElapsedMs.actual).toBe(300);
});

test("buildVoiceProviderSloReport can isolate proof evidence by scenario", async () => {
  const report = await buildVoiceProviderSloReport({
    events: [
      createVoiceTraceEvent({
        at: 1_000,
        payload: {
          elapsedMs: 8_000,
          kind: "llm",
          provider: "openai",
          providerStatus: "success",
        },
        scenarioId: "old-demo",
        sessionId: "stale-slow",
        type: "session.error",
      }),
      createVoiceTraceEvent({
        at: 2_000,
        payload: {
          elapsedMs: 300,
          kind: "llm",
          provider: "openai",
          providerStatus: "success",
        },
        scenarioId: "provider-slo-proof",
        sessionId: "fresh-fast",
        type: "session.error",
      }),
    ],
    requiredKinds: ["llm"],
    scenarioId: "provider-slo-proof",
    thresholds: {
      llm: {
        maxAverageElapsedMs: 1_000,
        maxP95ElapsedMs: 1_000,
      },
    },
  });

  expect(report.status).toBe("pass");
  expect(report.events).toBe(1);
  expect(report.sessions[0]?.sessionId).toBe("fresh-fast");
});

test("evaluateVoiceProviderSloEvidence verifies latency fallback and provider proof", async () => {
  const report = await buildVoiceProviderSloReport({
    events: [
      createVoiceTraceEvent({
        at: 1_000,
        payload: {
          elapsedMs: 900,
          error: "openai timeout",
          fallbackProvider: "anthropic",
          kind: "llm",
          provider: "openai",
          providerStatus: "error",
          timedOut: true,
        },
        sessionId: "provider-proof",
        type: "session.error",
      }),
      createVoiceTraceEvent({
        at: 1_100,
        payload: {
          elapsedMs: 700,
          fallbackProvider: "anthropic",
          kind: "llm",
          provider: "openai",
          providerStatus: "fallback",
          selectedProvider: "anthropic",
        },
        sessionId: "provider-proof",
        type: "session.error",
      }),
      createVoiceTraceEvent({
        at: 1_200,
        payload: {
          elapsedMs: 320,
          kind: "llm",
          provider: "anthropic",
          providerStatus: "success",
        },
        sessionId: "provider-proof",
        type: "session.error",
      }),
    ],
    requiredKinds: ["llm"],
    thresholds: {
      llm: {
        maxFallbackRate: 1,
        maxTimeoutRate: 1,
        maxAverageElapsedMs: 1_000,
        maxP95ElapsedMs: 1_000,
      },
    },
  });

  const assertion = evaluateVoiceProviderSloEvidence(report, {
    fallbackKinds: ["llm"],
    maxP95ElapsedMs: { llm: 1_000 },
    maxStatus: "pass",
    minEvents: 3,
    minFallbacks: 1,
    minLatencySamples: 3,
    requiredKinds: ["llm"],
    requiredProviders: ["anthropic", "openai"],
  });

  expect(assertion).toMatchObject({
    events: 3,
    eventsWithLatency: 3,
    fallbacks: 1,
    ok: true,
    providers: ["anthropic", "openai"],
    status: "pass",
  });
  expect(
    assertVoiceProviderSloEvidence(report, {
      fallbackKinds: ["llm"],
      minFallbacks: 1,
      requiredProviders: ["anthropic"],
    }).ok,
  ).toBe(true);

  const failed = evaluateVoiceProviderSloEvidence(report, {
    fallbackKinds: ["stt"],
    maxP95ElapsedMs: { llm: 500 },
    minEvents: 4,
    requiredProviders: ["gemini"],
  });
  expect(failed.ok).toBe(false);
  expect(failed.issues).toContain(
    "Expected at least 4 provider routing events, found 3.",
  );
  expect(failed.issues).toContain(
    "Missing provider fallback evidence for kind: stt.",
  );
  expect(failed.issues).toContain(
    "Missing provider SLO provider evidence: gemini.",
  );
  expect(failed.issues).toContain(
    "Expected llm p95 provider latency <= 500ms, found 900ms.",
  );
  expect(() =>
    assertVoiceProviderSloEvidence(report, { minEvents: 4 }),
  ).toThrow("Voice provider SLO assertion failed");
});

test("createVoiceProviderSloRoutes exposes json markdown and html reports", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await store.append(
    createVoiceTraceEvent({
      at: 1_000,
      payload: {
        elapsedMs: 350,
        kind: "llm",
        provider: "openai",
        providerStatus: "success",
      },
      sessionId: "route-session",
      type: "session.error",
    }),
  );
  const app = createVoiceProviderSloRoutes({
    requiredKinds: ["llm"],
    store,
  });

  const json = await app.handle(
    new Request("http://localhost/api/voice/provider-slos"),
  );
  const markdown = await app.handle(
    new Request("http://localhost/voice/provider-slos.md"),
  );
  const html = await app.handle(
    new Request("http://localhost/voice/provider-slos"),
  );

  expect(json.status).toBe(200);
  expect(await json.json()).toMatchObject({ status: "pass" });
  expect(await markdown.text()).toContain("# Voice Provider SLO Report");
  expect(await html.text()).toContain("Provider latency and fallback proof");
});
