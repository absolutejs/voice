import { expect, test } from "bun:test";
import {
  createVoiceProviderCapabilityRoutes,
  renderVoiceProviderCapabilityHTML,
  summarizeVoiceProviderCapabilities,
} from "../src";

test("summarizeVoiceProviderCapabilities reports configured selected providers with health", async () => {
  const report = await summarizeVoiceProviderCapabilities({
    events: [
      {
        at: 100,
        payload: {
          elapsedMs: 42,
          provider: "openai",
          providerStatus: "success",
        },
        sessionId: "session-1",
        type: "session.error",
      },
    ],
    features: {
      openai: ["chat", "tool-calling"],
      deepgram: ["realtime-stt"],
    },
    llmProviders: ["openai", "gemini"],
    models: {
      openai: "gpt-4.1-mini",
    },
    selected: {
      llm: "openai",
      stt: "deepgram",
    },
    sttProviders: ["deepgram"],
  });

  expect(report).toMatchObject({
    configured: 3,
    selected: 2,
    total: 3,
    unconfigured: 0,
  });
  expect(report.capabilities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        features: ["chat", "tool-calling"],
        health: expect.objectContaining({ runCount: 1 }),
        kind: "llm",
        model: "gpt-4.1-mini",
        provider: "openai",
        selected: true,
        status: "selected",
      }),
      expect.objectContaining({
        kind: "stt",
        provider: "deepgram",
        selected: true,
      }),
    ]),
  );
  expect(renderVoiceProviderCapabilityHTML(report)).toContain(
    "Provider Discovery",
  );
});

test("createVoiceProviderCapabilityRoutes exposes json and html reports", async () => {
  const routes = createVoiceProviderCapabilityRoutes({
    htmlPath: "/provider-capabilities",
    llmProviders: ["openai"],
    path: "/api/provider-capabilities",
    selected: {
      llm: "openai",
    },
  });

  const json = await routes.handle(
    new Request("http://localhost/api/provider-capabilities"),
  );
  const html = await routes.handle(
    new Request("http://localhost/provider-capabilities"),
  );

  expect(json.status).toBe(200);
  await expect(json.json()).resolves.toMatchObject({
    selected: 1,
    total: 1,
  });
  expect(html.status).toBe(200);
  expect(await html.text()).toContain("openai");
});
