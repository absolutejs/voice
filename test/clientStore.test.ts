import { expect, test } from "bun:test";
import { serverMessageToAction } from "../src/client/actions";
import { createVoiceOpsStatusStore } from "../src/client/opsStatus";
import { createVoicePlatformCoverageStore } from "../src/client/platformCoverage";
import { createVoiceProofTrendsStore } from "../src/client/proofTrends";
import { createVoiceReadinessFailuresStore } from "../src/client/readinessFailures";
import {
  createVoicePlatformCoverageViewModel,
  renderVoicePlatformCoverageHTML,
} from "../src/client/platformCoverageWidget";
import {
  createVoiceProofTrendsViewModel,
  renderVoiceProofTrendsHTML,
} from "../src/client/proofTrendsWidget";
import {
  createVoiceReadinessFailuresViewModel,
  renderVoiceReadinessFailuresHTML,
} from "../src/client/readinessFailuresWidget";
import {
  createVoiceOpsStatusViewModel,
  renderVoiceOpsStatusHTML,
} from "../src/client/opsStatusWidget";
import { createVoiceProviderStatusStore } from "../src/client/providerStatus";
import { createVoiceProviderCapabilitiesStore } from "../src/client/providerCapabilities";
import { createVoiceProviderContractsStore } from "../src/client/providerContracts";
import {
  createVoiceProviderCapabilitiesViewModel,
  renderVoiceProviderCapabilitiesHTML,
} from "../src/client/providerCapabilitiesWidget";
import {
  createVoiceProviderContractsViewModel,
  renderVoiceProviderContractsHTML,
} from "../src/client/providerContractsWidget";
import {
  createVoiceProviderStatusViewModel,
  renderVoiceProviderStatusHTML,
} from "../src/client/providerStatusWidget";
import { createVoiceProviderSimulationControlsStore } from "../src/client/providerSimulationControls";
import {
  createVoiceProviderSimulationControlsViewModel,
  renderVoiceProviderSimulationControlsHTML,
} from "../src/client/providerSimulationControlsWidget";
import { createVoiceRoutingStatusStore } from "../src/client/routingStatus";
import { createVoiceTurnQualityStore } from "../src/client/turnQuality";
import {
  createVoiceRoutingStatusViewModel,
  renderVoiceRoutingStatusHTML,
} from "../src/client/routingStatusWidget";
import {
  createVoiceTurnQualityViewModel,
  renderVoiceTurnQualityHTML,
} from "../src/client/turnQualityWidget";
import { createVoiceTraceTimelineStore } from "../src/client/traceTimeline";
import {
  createVoiceTraceTimelineViewModel,
  renderVoiceTraceTimelineWidgetHTML,
} from "../src/client/traceTimelineWidget";
import { createVoiceCallDebuggerStore } from "../src/client/callDebugger";
import {
  createVoiceCallDebuggerLaunchViewModel,
  renderVoiceCallDebuggerLaunchHTML,
} from "../src/client/callDebuggerWidget";
import { createVoiceWorkflowStatusStore } from "../src/client/workflowStatus";
import { createVoiceStreamStore } from "../src/client/store";

test("voice client store tracks call lifecycle server messages", () => {
  const store = createVoiceStreamStore();
  const start = serverMessageToAction({
    event: {
      at: 100,
      type: "start",
    },
    sessionId: "session-client-lifecycle",
    type: "call_lifecycle",
  });
  const transfer = serverMessageToAction({
    event: {
      at: 150,
      reason: "caller-requested-transfer",
      target: "billing",
      type: "transfer",
    },
    sessionId: "session-client-lifecycle",
    type: "call_lifecycle",
  });
  const end = serverMessageToAction({
    event: {
      at: 180,
      disposition: "transferred",
      reason: "caller-requested-transfer",
      target: "billing",
      type: "end",
    },
    sessionId: "session-client-lifecycle",
    type: "call_lifecycle",
  });

  store.dispatch(start);
  store.dispatch(transfer);
  store.dispatch(end);

  expect(store.getSnapshot().call).toMatchObject({
    disposition: "transferred",
    endedAt: 180,
    lastEventAt: 180,
    startedAt: 100,
  });
  expect(store.getSnapshot().call?.events.map((event) => event.type)).toEqual([
    "start",
    "transfer",
    "end",
  ]);
});

test("voice client store replaces local state from replay messages", () => {
  const store = createVoiceStreamStore();
  const firstTurn = {
    committedAt: 100,
    id: "turn-1",
    text: "old local turn",
    transcripts: [],
  };
  const replayTurn = {
    committedAt: 200,
    id: "turn-2",
    text: "server replay turn",
    transcripts: [],
  };

  store.dispatch({
    turn: firstTurn,
    type: "turn",
  });
  store.dispatch({
    assistantTexts: ["server assistant"],
    call: {
      events: [{ at: 150, type: "start" }],
      lastEventAt: 150,
      startedAt: 150,
    },
    partial: "server partial",
    scenarioId: "guided",
    sessionId: "session-replay",
    status: "active",
    turns: [replayTurn],
    type: "replay",
  });

  expect(store.getSnapshot()).toMatchObject({
    assistantTexts: ["server assistant"],
    partial: "server partial",
    scenarioId: "guided",
    sessionId: "session-replay",
    status: "active",
  });
  expect(store.getSnapshot().turns).toEqual([replayTurn]);
  expect(store.getSnapshot().call?.events.map((event) => event.type)).toEqual([
    "start",
  ]);
});

test("voice client store tracks reconnect observability messages", () => {
  const store = createVoiceStreamStore();
  const action = serverMessageToAction({
    reconnect: {
      attempts: 2,
      lastDisconnectAt: 100,
      maxAttempts: 10,
      nextAttemptAt: 600,
      status: "reconnecting",
    },
    type: "connection",
  });

  store.dispatch(action);

  expect(store.getSnapshot().reconnect).toEqual({
    attempts: 2,
    lastDisconnectAt: 100,
    maxAttempts: 10,
    nextAttemptAt: 600,
    status: "reconnecting",
  });
});

test("voice workflow status store fetches scenario eval reports", async () => {
  const store = createVoiceWorkflowStatusStore("/evals/scenarios/json", {
    fetch: async () =>
      new Response(
        JSON.stringify({
          checkedAt: 100,
          failed: 0,
          passed: 1,
          scenarios: [
            {
              failed: 0,
              id: "support-triage",
              issues: [],
              label: "Support triage",
              matchedSessions: 1,
              passed: 1,
              sessions: [],
              status: "pass",
            },
          ],
          status: "pass",
          total: 1,
        }),
      ),
  });

  const report = await store.refresh();

  expect(report?.status).toBe("pass");
  expect(store.getSnapshot()).toMatchObject({
    error: null,
    isLoading: false,
    report: {
      total: 1,
    },
  });
  store.close();
});

test("voice ops status widget renders ops readiness", () => {
  const snapshot = {
    error: null,
    isLoading: false,
    report: {
      checkedAt: 100,
      failed: 0,
      links: [{ href: "/ops-console", label: "Ops Console" }],
      passed: 3,
      status: "pass" as const,
      surfaces: {
        handoffs: { failed: 0, status: "pass" as const, total: 0 },
        providers: { degraded: 0, status: "pass" as const, total: 2 },
        workflows: {
          failed: 0,
          source: "fixtures" as const,
          status: "pass" as const,
          total: 1,
        },
      },
      total: 3,
    },
    updatedAt: 110,
  };
  const model = createVoiceOpsStatusViewModel(snapshot);
  const html = renderVoiceOpsStatusHTML(snapshot);

  expect(model.label).toBe("Passing");
  expect(model.surfaces.map((surface) => surface.label)).toEqual([
    "Handoffs",
    "Providers",
    "Workflows",
  ]);
  expect(html).toContain("Voice Ops Status");
  expect(html).toContain("1 passing from fixtures");
  expect(html).toContain("/ops-console");
});

test("voice ops status store fetches integrated status reports", async () => {
  const store = createVoiceOpsStatusStore("/api/voice/ops-status", {
    fetch: async () =>
      new Response(
        JSON.stringify({
          checkedAt: 100,
          failed: 0,
          links: [],
          passed: 3,
          status: "pass",
          surfaces: {
            providers: { degraded: 0, status: "pass", total: 2 },
            quality: { status: "pass" },
            workflows: { failed: 0, status: "pass", total: 1 },
          },
          total: 3,
        }),
      ),
  });

  const report = await store.refresh();

  expect(report?.status).toBe("pass");
  expect(store.getSnapshot()).toMatchObject({
    error: null,
    isLoading: false,
    report: {
      passed: 3,
      status: "pass",
    },
  });
  store.close();
});

test("voice routing status store fetches latest provider decision", async () => {
  const store = createVoiceRoutingStatusStore("/api/routing/latest", {
    fetch: async () =>
      new Response(
        JSON.stringify({
          at: 100,
          fallbackProvider: "assemblyai",
          kind: "stt",
          latencyBudgetMs: 6000,
          provider: "assemblyai",
          routing: "balanced",
          selectedProvider: "deepgram",
          sessionId: "session-1",
          status: "fallback",
          timedOut: false,
        }),
      ),
  });

  const decision = await store.refresh();

  expect(decision).toMatchObject({
    fallbackProvider: "assemblyai",
    kind: "stt",
    provider: "assemblyai",
    status: "fallback",
  });
  expect(store.getSnapshot()).toMatchObject({
    decision: {
      selectedProvider: "deepgram",
    },
    error: null,
    isLoading: false,
  });
  store.close();
});

test("voice routing status widget renders latest provider decision", () => {
  const snapshot = {
    decision: {
      at: 100,
      fallbackProvider: "assemblyai",
      kind: "stt" as const,
      latencyBudgetMs: 6000,
      provider: "assemblyai",
      routing: "balanced",
      selectedProvider: "deepgram",
      sessionId: "session-1",
      status: "fallback",
      timedOut: false,
    },
    error: null,
    isLoading: false,
    updatedAt: 110,
  };
  const model = createVoiceRoutingStatusViewModel(snapshot);
  const html = renderVoiceRoutingStatusHTML(snapshot);

  expect(model.label).toBe("STT fallback");
  expect(model.rows.map((row) => row.label)).toContain("Selected");
  expect(html).toContain("Voice Routing");
  expect(html).toContain("assemblyai");
  expect(html).toContain("6000ms");
});

test("voice provider status store fetches provider health summaries", async () => {
  const store = createVoiceProviderStatusStore("/api/provider-status", {
    fetch: async () =>
      new Response(
        JSON.stringify([
          {
            averageElapsedMs: 420,
            errorCount: 0,
            fallbackCount: 2,
            provider: "deepgram",
            rateLimited: false,
            recommended: true,
            runCount: 8,
            status: "healthy",
            timeoutCount: 0,
          },
        ]),
      ),
  });

  const providers = await store.refresh();

  expect(providers[0]).toMatchObject({
    provider: "deepgram",
    recommended: true,
    status: "healthy",
  });
  expect(store.getSnapshot()).toMatchObject({
    error: null,
    isLoading: false,
    providers: [
      {
        averageElapsedMs: 420,
        fallbackCount: 2,
      },
    ],
  });
  store.close();
});

test("voice provider status widget renders fallback and suppression state", () => {
  const snapshot = {
    error: null,
    isLoading: false,
    providers: [
      {
        averageElapsedMs: 420,
        errorCount: 0,
        fallbackCount: 2,
        provider: "deepgram",
        rateLimited: false,
        recommended: true,
        runCount: 8,
        status: "healthy" as const,
        timeoutCount: 0,
      },
      {
        errorCount: 3,
        fallbackCount: 0,
        lastError: "timeout",
        provider: "assemblyai",
        rateLimited: false,
        recommended: false,
        runCount: 1,
        status: "suppressed" as const,
        suppressionRemainingMs: 12_000,
        timeoutCount: 3,
      },
    ],
    updatedAt: 110,
  };
  const model = createVoiceProviderStatusViewModel(snapshot);
  const html = renderVoiceProviderStatusHTML(snapshot);

  expect(model.label).toBe("1 needs attention");
  expect(model.providers[0]?.label).toBe("Deepgram recommended");
  expect(model.providers[1]?.detail).toBe("Suppressed for 12s after timeout.");
  expect(html).toContain("Voice Providers");
  expect(html).toContain("Deepgram recommended");
  expect(html).toContain("timeout");
});

test("voice provider capabilities store and widget render selected provider coverage", async () => {
  const store = createVoiceProviderCapabilitiesStore(
    "/api/provider-capabilities",
    {
      fetch: async () =>
        new Response(
          JSON.stringify({
            capabilities: [
              {
                configured: true,
                features: ["tool calling", "fallback routing"],
                health: {
                  errorCount: 0,
                  fallbackCount: 0,
                  provider: "openai",
                  rateLimited: false,
                  recommended: true,
                  runCount: 3,
                  status: "healthy",
                  timeoutCount: 0,
                },
                kind: "llm",
                model: "gpt-4.1-mini",
                provider: "openai",
                selected: true,
                status: "selected",
              },
              {
                configured: true,
                features: ["realtime STT"],
                kind: "stt",
                model: "flux-general-en",
                provider: "deepgram",
                selected: true,
                status: "selected",
              },
            ],
            checkedAt: 100,
            configured: 2,
            selected: 2,
            total: 2,
            unconfigured: 0,
          }),
        ),
    },
  );

  await store.refresh();
  const snapshot = store.getSnapshot();
  const model = createVoiceProviderCapabilitiesViewModel(snapshot);
  const html = renderVoiceProviderCapabilitiesHTML(snapshot);

  expect(model.label).toBe("2 selected");
  expect(model.capabilities[0]?.label).toBe("Openai LLM");
  expect(model.capabilities[0]?.detail).toBe(
    "Selected LLM provider for new sessions.",
  );
  expect(html).toContain("Provider Capabilities");
  expect(html).toContain("gpt-4.1-mini");
  expect(html).toContain("tool calling, fallback routing");
});

test("voice provider contracts store and widget render production contract coverage", async () => {
  const store = createVoiceProviderContractsStore("/api/provider-contracts", {
    fetch: async () =>
      new Response(
        JSON.stringify({
          failed: 0,
          passed: 1,
          rows: [
            {
              checks: [
                {
                  detail: "Required environment is present.",
                  key: "env",
                  label: "Required env",
                  status: "pass",
                },
              ],
              configured: true,
              kind: "llm",
              provider: "openai",
              selected: true,
              status: "pass",
            },
          ],
          status: "pass",
          total: 1,
          warned: 0,
        }),
      ),
  });

  await store.refresh();
  const snapshot = store.getSnapshot();
  const model = createVoiceProviderContractsViewModel(snapshot);
  const html = renderVoiceProviderContractsHTML(snapshot);

  expect(model.label).toBe("1 passing");
  expect(model.rows[0]?.label).toBe("Openai LLM");
  expect(model.rows[0]?.detail).toBe("Provider contract is production-ready.");
  expect(html).toContain("Provider Contracts");
  expect(html).toContain("Required env: Pass");
});

test("voice provider contracts widget renders remediation actions", async () => {
  const store = createVoiceProviderContractsStore("/api/provider-contracts", {
    fetch: async () =>
      new Response(
        JSON.stringify({
          failed: 1,
          passed: 0,
          rows: [
            {
              checks: [
                {
                  detail: "Missing env: OPENAI_API_KEY.",
                  key: "env",
                  label: "Required env",
                  remediation: {
                    code: "provider.env",
                    detail:
                      "Set OPENAI_API_KEY before deploying this provider.",
                    href: "/provider-contracts",
                    label: "Add missing env",
                  },
                  status: "fail",
                },
              ],
              configured: true,
              kind: "llm",
              provider: "openai",
              selected: true,
              status: "fail",
            },
          ],
          status: "fail",
          total: 1,
          warned: 0,
        }),
      ),
  });

  await store.refresh();
  const snapshot = store.getSnapshot();
  const model = createVoiceProviderContractsViewModel(snapshot);
  const html = renderVoiceProviderContractsHTML(snapshot);

  expect(model.rows[0]?.remediations[0]).toMatchObject({
    label: "Add missing env",
  });
  expect(html).toContain("Set OPENAI_API_KEY");
  expect(html).toContain("/provider-contracts");
});

test("voice turn quality store and widget render fallback diagnostics", async () => {
  const store = createVoiceTurnQualityStore("/api/turn-quality", {
    fetch: async () =>
      new Response(
        JSON.stringify({
          checkedAt: 100,
          failed: 0,
          sessions: 1,
          status: "warn",
          total: 1,
          turns: [
            {
              averageConfidence: 0.93,
              committedAt: 100,
              correctionChanged: false,
              fallbackSelectionReason: "confidence-margin",
              fallbackUsed: true,
              finalTranscriptCount: 1,
              partialTranscriptCount: 0,
              selectedTranscriptCount: 1,
              sessionId: "session-1",
              source: "fallback",
              status: "warn",
              text: "book a demo",
              turnId: "turn-1",
            },
          ],
          warnings: 1,
        }),
      ),
  });

  await store.refresh();
  const snapshot = store.getSnapshot();
  const model = createVoiceTurnQualityViewModel(snapshot);
  const html = renderVoiceTurnQualityHTML(snapshot);

  expect(model.label).toBe("1 warnings");
  expect(model.turns[0]?.detail).toBe(
    "Fallback STT selected by confidence-margin.",
  );
  expect(html).toContain("book a demo");
  expect(html).toContain("93%");
});

test("voice trace timeline store and widget render recent call timelines", async () => {
  const store = createVoiceTraceTimelineStore("/api/voice-traces", {
    fetch: async () =>
      new Response(
        JSON.stringify({
          checkedAt: 100,
          failed: 1,
          sessions: [
            {
              events: [],
              evaluation: {
                issues: [],
                pass: false,
                summary: { eventCount: 3 },
              },
              providers: [
                {
                  averageElapsedMs: 220,
                  errorCount: 1,
                  eventCount: 2,
                  fallbackCount: 1,
                  provider: "openai",
                  successCount: 1,
                  timeoutCount: 0,
                },
              ],
              sessionId: "session-trace",
              status: "failed",
              summary: {
                callDurationMs: 1200,
                errorCount: 1,
                eventCount: 3,
                turnCount: 1,
              },
            },
          ],
          total: 1,
          warnings: 0,
        }),
      ),
  });

  await store.refresh();
  const snapshot = store.getSnapshot();
  const model = createVoiceTraceTimelineViewModel(snapshot);
  const html = renderVoiceTraceTimelineWidgetHTML(snapshot);

  expect(model.label).toBe("1 failed");
  expect(model.sessions[0]).toMatchObject({
    detailHref: "/traces/session-trace",
    incidentBundleHref: "/voice-incidents/session-trace/markdown",
    operationsRecordHref: "/voice-operations/session-trace",
    durationLabel: "1200ms",
    providerLabel: "openai",
  });
  expect(html).toContain("Voice Traces");
  expect(html).toContain("Open timeline");
  expect(html).toContain("/voice-operations/session-trace");
  expect(html).toContain("/voice-incidents/session-trace/markdown");
  store.close();
});

test("voice provider simulation controls posts failure and recovery requests", async () => {
  const requests: Array<{ method: string; url: string }> = [];
  const store = createVoiceProviderSimulationControlsStore({
    fetch: async (input, init) => {
      requests.push({
        method: init?.method ?? "GET",
        url: String(input),
      });
      return new Response(
        JSON.stringify({
          mode: String(input).includes("/recovery") ? "recovery" : "failure",
          provider: "deepgram",
          sessionId: "sim-1",
          status: "simulated",
        }),
      );
    },
    kind: "stt",
    providers: [{ provider: "deepgram" }, { provider: "assemblyai" }],
  });

  await store.run("deepgram", "failure");
  await store.run("deepgram", "recovery");

  expect(requests).toEqual([
    {
      method: "POST",
      url: "/api/stt-simulate/failure?provider=deepgram",
    },
    {
      method: "POST",
      url: "/api/stt-simulate/recovery?provider=deepgram",
    },
  ]);
  expect(store.getSnapshot()).toMatchObject({
    error: null,
    isRunning: false,
    lastResult: {
      mode: "recovery",
      provider: "deepgram",
    },
  });
  store.close();
});

test("voice provider simulation controls widget renders configured actions", () => {
  const snapshot = {
    error: null,
    isRunning: false,
    lastResult: null,
    mode: null,
    provider: null,
  };
  const options = {
    failureProviders: ["deepgram"] as const,
    fallbackRequiredProvider: "assemblyai",
    kind: "stt",
    providers: [{ provider: "deepgram" }, { provider: "assemblyai" }],
  };
  const model = createVoiceProviderSimulationControlsViewModel(
    snapshot,
    options,
  );
  const html = renderVoiceProviderSimulationControlsHTML(snapshot, options);

  expect(model.canSimulateFailure).toBe(true);
  expect(model.label).toBe("2 configured");
  expect(html).toContain("Simulate deepgram STT failure");
  expect(html).toContain("Mark assemblyai recovered");
});

test("voice platform coverage store fetches coverage reports", async () => {
  const store = createVoicePlatformCoverageStore("/api/voice/vapi-coverage", {
    fetch: async (input) => {
      expect(String(input)).toBe("/api/voice/vapi-coverage");
      return new Response(
        JSON.stringify({
          coverage: [
            {
              evidence: [
                {
                  method: "GET",
                  name: "switchingFromVapi",
                  ok: true,
                  path: "/switching-from-vapi",
                  status: 200,
                },
              ],
              replacement: "Self-hosted voice primitives.",
              status: "pass",
              surface: "Web voice assistant",
            },
          ],
          ok: true,
          source: ".voice-runtime/proof-pack/latest.json",
          status: "pass",
          total: 1,
        }),
      );
    },
  });

  await store.refresh();

  expect(store.getSnapshot()).toMatchObject({
    error: null,
    isLoading: false,
    report: {
      ok: true,
      status: "pass",
      total: 1,
    },
  });
  expect(store.getSnapshot().report?.coverage[0]?.surface).toBe(
    "Web voice assistant",
  );
  store.close();
});

test("voice platform coverage widget renders hosted platform replacement evidence", () => {
  const snapshot = {
    error: null,
    isLoading: false,
    report: {
      coverage: [
        {
          evidence: [
            {
              name: "switchingFromVapi",
              ok: true,
              path: "/switching-from-vapi",
              status: 200,
            },
          ],
          replacement: "Self-hosted browser voice route and proof.",
          status: "pass",
          surface: "Web voice assistant",
        },
        {
          evidence: [],
          gap: "Add a carrier setup proof.",
          replacement: "Phone setup route.",
          status: "missing",
          surface: "Phone assistant",
        },
      ],
      ok: false,
      status: "missing" as const,
      total: 2,
    },
  };

  const model = createVoicePlatformCoverageViewModel(snapshot, { limit: 1 });
  const html = renderVoicePlatformCoverageHTML(snapshot, { limit: 1 });

  expect(model.label).toBe("1 gaps");
  expect(model.status).toBe("warning");
  expect(model.surfaces).toHaveLength(1);
  expect(html).toContain("Web voice assistant");
  expect(html).toContain("1/1 evidence checks passing");
});

test("voice proof trends store fetches sustained proof reports", async () => {
  const store = createVoiceProofTrendsStore("/api/voice/proof-trends", {
    fetch: async (input) => {
      expect(String(input)).toBe("/api/voice/proof-trends");
      return new Response(
        JSON.stringify({
          ageMs: 30_000,
          cycles: [{ cycle: 1, ok: true }],
          generatedAt: "2026-04-29T12:00:00.000Z",
          maxAgeMs: 60_000,
          ok: true,
          source: ".voice-runtime/proof-trends/latest.json",
          status: "pass",
          summary: {
            cycles: 1,
            maxLiveP95Ms: 420,
            maxProviderP95Ms: 320,
            maxTurnP95Ms: 140,
          },
        }),
      );
    },
  });

  await store.refresh();

  expect(store.getSnapshot()).toMatchObject({
    error: null,
    isLoading: false,
    report: {
      ok: true,
      status: "pass",
    },
  });
  expect(store.getSnapshot().report?.summary.maxLiveP95Ms).toBe(420);
  store.close();
});

test("voice proof trends widget renders freshness and latency evidence", () => {
  const snapshot = {
    error: null,
    isLoading: false,
    report: {
      ageMs: 30_000,
      cycles: [{ cycle: 1, ok: true }],
      generatedAt: "2026-04-29T12:00:00.000Z",
      maxAgeMs: 60_000,
      ok: true,
      source: ".voice-runtime/proof-trends/latest.json",
      status: "pass" as const,
      summary: {
        cycles: 1,
        maxLiveP95Ms: 420,
        maxProviderP95Ms: 320,
        maxTurnP95Ms: 140,
      },
    },
  };

  const model = createVoiceProofTrendsViewModel(snapshot);
  const html = renderVoiceProofTrendsHTML(snapshot);

  expect(model.label).toBe("1 cycles passing");
  expect(model.status).toBe("ready");
  expect(model.metrics.map((metric) => metric.label)).toContain("Artifact age");
  expect(html).toContain("Provider p95");
  expect(html).toContain("420ms");
});

test("voice readiness failures store fetches production readiness reports", async () => {
  const store = createVoiceReadinessFailuresStore("/api/production-readiness", {
    fetch: async (input) => {
      expect(String(input)).toBe("/api/production-readiness");
      return new Response(
        JSON.stringify({
          checkedAt: 100,
          checks: [],
          links: {},
          status: "pass",
          summary: {},
        }),
      );
    },
  });

  await store.refresh();

  expect(store.getSnapshot()).toMatchObject({
    error: null,
    isLoading: false,
    report: {
      status: "pass",
    },
  });
  store.close();
});

test("voice readiness failures widget renders gate explanations", () => {
  const snapshot = {
    error: null,
    isLoading: false,
    report: {
      checkedAt: 100,
      checks: [
        {
          detail: "Live latency exceeded threshold.",
          gateExplanation: {
            evidenceHref: "/voice-operations/slow-session",
            observed: 700,
            remediation: "Inspect the slow turn and rerun proof.",
            sourceHref: "/voice/slo-readiness-thresholds",
            threshold: 600,
            thresholdLabel: "Live latency warn after",
            unit: "ms" as const,
          },
          href: "/traces",
          label: "Live latency proof",
          status: "warn" as const,
          value: "700ms avg",
        },
        {
          label: "Provider health",
          status: "pass" as const,
        },
      ],
      links: {
        sloReadinessThresholds: "/voice/slo-readiness-thresholds",
      },
      status: "warn" as const,
      summary: {},
    },
    updatedAt: 110,
  };

  const model = createVoiceReadinessFailuresViewModel(snapshot);
  const html = renderVoiceReadinessFailuresHTML(snapshot);

  expect(model.label).toBe("1 calibrated gate issue(s)");
  expect(model.failures).toEqual([
    expect.objectContaining({
      label: "Live latency proof",
      observed: "700 ms",
      threshold: "600 ms",
    }),
  ]);
  expect(html).toContain("Live latency proof");
  expect(html).toContain("/voice/slo-readiness-thresholds");
  expect(html).toContain("Inspect the slow turn");
});

test("voice call debugger store fetches latest support report", async () => {
  const report = {
    checkedAt: 100,
    operationsRecord: {
      providerDecisionSummary: {
        fallbacks: 1,
        recoveryStatus: "recovered",
      },
      summary: {
        errorCount: 0,
        eventCount: 7,
        turnCount: 2,
      },
    },
    sessionId: "session-debug-latest",
    snapshot: {
      status: "pass",
    },
    status: "healthy",
  };
  const store = createVoiceCallDebuggerStore(
    "/api/voice-call-debugger/latest",
    {
      fetch: async (input) => {
        expect(String(input)).toBe("/api/voice-call-debugger/latest");
        return new Response(JSON.stringify(report));
      },
    },
  );

  const loaded = await store.refresh();

  expect(loaded?.sessionId).toBe("session-debug-latest");
  expect(store.getSnapshot()).toMatchObject({
    error: null,
    isLoading: false,
    report: {
      sessionId: "session-debug-latest",
      status: "healthy",
    },
  });
  store.close();
});

test("voice call debugger launch renders latest debugger link", () => {
  const snapshot = {
    error: null,
    isLoading: false,
    report: {
      checkedAt: 100,
      operationsRecord: {
        providerDecisionSummary: {
          fallbacks: 2,
          recoveryStatus: "degraded",
        },
        summary: {
          errorCount: 1,
          eventCount: 12,
          turnCount: 3,
        },
      },
      sessionId: "session-debug-launch",
      snapshot: {
        status: "warn",
      },
      status: "warning",
    },
    updatedAt: 120,
  };

  const model = createVoiceCallDebuggerLaunchViewModel(
    "/api/voice-call-debugger/latest",
    snapshot,
  );
  const html = renderVoiceCallDebuggerLaunchHTML(
    "/api/voice-call-debugger/latest",
    snapshot,
  );

  expect(model.href).toBe("/voice-call-debugger/latest");
  expect(model.label).toBe("warning · session-debug-launch");
  expect(model.rows).toEqual([
    { label: "Events", value: "12" },
    { label: "Turns", value: "3" },
    { label: "Errors", value: "1" },
    { label: "Provider recovery", value: "degraded" },
    { label: "Fallbacks", value: "2" },
    { label: "Snapshot", value: "warn" },
  ]);
  expect(html).toContain("Open debugger");
  expect(html).toContain("/voice-call-debugger/latest");
  expect(html).toContain("Provider recovery");
});
