import { expect, test } from "bun:test";
import {
  buildVoiceProviderOrchestrationReport,
  createVoiceProviderOrchestrationProfile,
  createVoiceProviderOrchestrationRoutes,
  renderVoiceProviderOrchestrationHTML,
  renderVoiceProviderOrchestrationMarkdown,
} from "../src";

test("buildVoiceProviderOrchestrationReport validates surface policies", () => {
  const profile = createVoiceProviderOrchestrationProfile({
    id: "support-agent-providers",
    surfaces: {
      "background-summary": {
        fallback: ["gemini", "openai"],
        maxCost: 3,
        minQuality: 0.82,
        policy: "cost-cap",
        providerProfiles: {
          gemini: { cost: 2, latencyMs: 700, quality: 0.86 },
          openai: { cost: 6, latencyMs: 650, quality: 0.92 },
        },
      },
      "live-call": {
        fallback: ["openai", "anthropic", "gemini"],
        maxLatencyMs: 900,
        policy: "latency-first",
        providerHealth: {
          cooldownMs: 30_000,
          failureThreshold: 1,
        },
        providerProfiles: {
          anthropic: { cost: 7, latencyMs: 850, quality: 0.95 },
          gemini: { cost: 2, latencyMs: 700, quality: 0.86 },
          openai: { cost: 6, latencyMs: 650, quality: 0.92, timeoutMs: 3500 },
        },
      },
    },
  });
  const report = buildVoiceProviderOrchestrationReport({
    defaultRequirement: {
      requireFallback: true,
    },
    profile,
    requirements: {
      "live-call": {
        minProviders: 2,
        requireBudgetPolicy: true,
        requireCircuitBreaker: true,
        requireFallback: true,
        requireTimeoutBudget: true,
      },
    },
  });

  expect(report).toMatchObject({
    profileId: "support-agent-providers",
    status: "pass",
    summary: {
      failed: 0,
      passed: 2,
      providers: 3,
      surfaces: 2,
      warned: 0,
    },
  });
  expect(report.surfaces).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        circuitBreaker: true,
        fallbackProviders: ["openai", "anthropic", "gemini"],
        status: "pass",
        strategy: "prefer-fastest",
        surface: "live-call",
        timeoutBudget: true,
      }),
    ]),
  );
  expect(renderVoiceProviderOrchestrationMarkdown(report)).toContain(
    "Voice Provider Orchestration",
  );
  expect(renderVoiceProviderOrchestrationHTML(report)).toContain(
    "Provider Policy Proof",
  );
});

test("buildVoiceProviderOrchestrationReport fails missing live-call resilience policy", () => {
  const profile = createVoiceProviderOrchestrationProfile({
    id: "thin-provider-policy",
    surfaces: {
      "live-call": {
        policy: "latency-first",
        providerProfiles: {
          openai: { latencyMs: 650, quality: 0.92 },
        },
      },
    },
  });
  const report = buildVoiceProviderOrchestrationReport({
    profile,
    requirements: {
      "live-call": {
        minProviders: 2,
        requireBudgetPolicy: true,
        requireCircuitBreaker: true,
        requireFallback: true,
        requireTimeoutBudget: true,
      },
    },
  });

  expect(report.status).toBe("fail");
  expect(report.issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining([
      "voice.provider_orchestration.min_providers",
      "voice.provider_orchestration.fallback_missing",
      "voice.provider_orchestration.circuit_breaker_missing",
      "voice.provider_orchestration.timeout_budget_missing",
      "voice.provider_orchestration.budget_policy_missing",
    ]),
  );
});

test("createVoiceProviderOrchestrationRoutes exposes json html and markdown", async () => {
  const profile = createVoiceProviderOrchestrationProfile({
    id: "route-provider-policy",
    surfaces: {
      live: {
        fallback: ["openai"],
        providerProfiles: {
          openai: { timeoutMs: 3000 },
        },
      },
    },
  });
  const routes = createVoiceProviderOrchestrationRoutes({
    htmlPath: "/voice/provider-orchestration",
    markdownPath: "/voice/provider-orchestration.md",
    path: "/api/voice/provider-orchestration",
    profile,
  });

  const json = await routes.handle(
    new Request("http://localhost/api/voice/provider-orchestration"),
  );
  const html = await routes.handle(
    new Request("http://localhost/voice/provider-orchestration"),
  );
  const markdown = await routes.handle(
    new Request("http://localhost/voice/provider-orchestration.md"),
  );

  expect(json.status).toBe(200);
  await expect(json.json()).resolves.toMatchObject({
    profileId: "route-provider-policy",
    summary: {
      surfaces: 1,
    },
  });
  expect(html.status).toBe(200);
  expect(await html.text()).toContain("route-provider-policy");
  expect(markdown.status).toBe(200);
  expect(await markdown.text()).toContain("# Voice Provider Orchestration");
});
