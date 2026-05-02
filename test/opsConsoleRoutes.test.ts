import { expect, test } from "bun:test";
import {
  buildVoiceOpsConsoleReport,
  createVoiceMemoryAuditSinkDeliveryStore,
  createVoiceMemoryTraceEventStore,
  createVoiceMemoryTraceSinkDeliveryStore,
  createVoiceOpsConsoleRoutes,
  renderVoiceOpsConsoleHTML,
} from "../src";

const createOpsConsoleEvents = () => [
  {
    at: 100,
    id: "session-started",
    payload: {},
    sessionId: "session-ops",
    type: "session.started" as const,
  },
  {
    at: 110,
    id: "turn-committed",
    payload: { text: "hello" },
    sessionId: "session-ops",
    turnId: "turn-1",
    type: "turn.committed" as const,
  },
  {
    at: 120,
    id: "assistant",
    payload: { text: "hi" },
    sessionId: "session-ops",
    turnId: "turn-1",
    type: "turn.assistant" as const,
  },
  {
    at: 130,
    id: "provider-error",
    payload: {
      elapsedMs: 3500,
      kind: "llm",
      provider: "openai",
      providerStatus: "error",
      timedOut: true,
    },
    sessionId: "session-ops",
    type: "session.error" as const,
  },
  {
    at: 140,
    id: "handoff",
    payload: {
      deliveries: {
        webhook: { status: "failed" },
      },
      status: "failed",
    },
    sessionId: "session-ops",
    type: "call.handoff" as const,
  },
];

test("buildVoiceOpsConsoleReport summarizes operations surfaces", async () => {
  const store = createVoiceMemoryTraceEventStore();
  for (const event of createOpsConsoleEvents()) {
    await store.append(event);
  }
  const report = await buildVoiceOpsConsoleReport({
    llmProviders: ["openai"],
    store,
  });

  expect(report.eventCount).toBe(5);
  expect(report.quality.status).toBe("fail");
  expect(report.handoffs.failed).toBe(1);
  expect(report.providers.degraded).toBeGreaterThan(0);
  expect(report.recentRoutingEvents).toHaveLength(1);
  expect(report.recentSessions[0]?.sessionId).toBe("session-ops");
});

test("buildVoiceOpsConsoleReport adds delivery sink surface when configured", async () => {
  const report = await buildVoiceOpsConsoleReport({
    deliverySinks: {
      auditDeliveries: {
        store: createVoiceMemoryAuditSinkDeliveryStore(),
      },
      traceDeliveries: {
        store: createVoiceMemoryTraceSinkDeliveryStore(),
      },
    },
    links: [
      {
        href: "/custom",
        label: "Custom",
      },
    ],
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.deliverySinks?.status).toBe("warn");
  expect(report.links).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/custom",
        label: "Custom",
      }),
      expect.objectContaining({
        href: "/delivery-sinks",
        label: "Delivery Sinks",
        statusHref: "/api/voice-delivery-sinks",
      }),
    ]),
  );
  expect(renderVoiceOpsConsoleHTML(report)).toContain("Delivery Sinks");
});

test("renderVoiceOpsConsoleHTML renders linked control plane", async () => {
  const store = createVoiceMemoryTraceEventStore();
  for (const event of createOpsConsoleEvents()) {
    await store.append(event);
  }
  const report = await buildVoiceOpsConsoleReport({
    store,
  });
  const html = renderVoiceOpsConsoleHTML(report);

  expect(html).toContain("AbsoluteJS Voice Ops Console");
  expect(html).toContain("/quality");
  expect(html).toContain("Recent Provider Routing");
});

test("createVoiceOpsConsoleRoutes exposes html and json", async () => {
  const store = createVoiceMemoryTraceEventStore();
  for (const event of createOpsConsoleEvents()) {
    await store.append(event);
  }
  const routes = createVoiceOpsConsoleRoutes({
    store,
  });

  const html = await routes.handle(new Request("http://localhost/ops-console"));
  expect(html.status).toBe(200);
  await expect(html.text()).resolves.toContain("Operational Surfaces");

  const json = await routes.handle(
    new Request("http://localhost/ops-console/json"),
  );
  await expect(json.json()).resolves.toMatchObject({
    eventCount: 5,
    quality: {
      status: "fail",
    },
  });
});
