import { expect, test } from "bun:test";
import {
  buildVoiceTraceDeliveryReport,
  createVoiceMemoryTraceSinkDeliveryStore,
  createVoiceTraceDeliveryRoutes,
  createVoiceTraceEvent,
  createVoiceTraceSinkDeliveryRecord,
  createVoiceTraceSinkDeliveryWorker,
  renderVoiceTraceDeliveryHTML,
  resolveVoiceTraceDeliveryFilter,
  type VoiceRedisTaskLeaseCoordinator,
} from "../src";

const createLeaseCoordinator = (): VoiceRedisTaskLeaseCoordinator => ({
  claim: async () => true,
  get: async () => null,
  release: async () => true,
  renew: async () => true,
});

const seedTraceDeliveries = async () => {
  const store = createVoiceMemoryTraceSinkDeliveryStore();
  const assistantEvent = createVoiceTraceEvent({
    at: 1_000,
    payload: {
      text: "hello",
    },
    sessionId: "session-assistant",
    type: "turn.assistant",
  });
  const errorEvent = createVoiceTraceEvent({
    at: 2_000,
    payload: {
      error: "provider failed",
    },
    sessionId: "session-error",
    type: "session.error",
  });

  await store.set(
    "trace-delivery-ok",
    createVoiceTraceSinkDeliveryRecord({
      createdAt: 1_000,
      deliveredAt: 1_200,
      deliveryAttempts: 1,
      deliveryStatus: "delivered",
      events: [assistantEvent],
      id: "trace-delivery-ok",
      sinkDeliveries: {
        warehouse: {
          attempts: 1,
          deliveredTo: "https://warehouse.test/traces",
          eventCount: 1,
          status: "delivered",
        },
      },
    }),
  );
  await store.set(
    "trace-delivery-failed",
    createVoiceTraceSinkDeliveryRecord({
      createdAt: 2_000,
      deliveryAttempts: 2,
      deliveryError: "trace warehouse unavailable",
      deliveryStatus: "failed",
      events: [errorEvent],
      id: "trace-delivery-failed",
      sinkDeliveries: {
        warehouse: {
          attempts: 2,
          error: "trace warehouse unavailable",
          eventCount: 1,
          status: "failed",
        },
      },
    }),
  );

  return store;
};

test("resolveVoiceTraceDeliveryFilter parses status search and limit", () => {
  expect(
    resolveVoiceTraceDeliveryFilter({
      limit: "5",
      q: "warehouse",
      status: "failed",
    }),
  ).toEqual({
    limit: 5,
    q: "warehouse",
    status: "failed",
  });
});

test("buildVoiceTraceDeliveryReport summarizes and filters delivery queue", async () => {
  const store = await seedTraceDeliveries();
  const report = await buildVoiceTraceDeliveryReport(
    {
      store,
    },
    {
      q: "session-error",
      status: "failed",
    },
  );

  expect(report.summary).toMatchObject({
    failed: 1,
    total: 1,
  });
  expect(report.deliveries).toHaveLength(1);
  expect(report.deliveries[0].id).toBe("trace-delivery-failed");
});

test("renderVoiceTraceDeliveryHTML renders sink errors and trace event details", async () => {
  const store = await seedTraceDeliveries();
  const report = await buildVoiceTraceDeliveryReport({
    store,
  });
  const html = renderVoiceTraceDeliveryHTML(report);

  expect(html).toContain("Trace Deliveries");
  expect(html).toContain("trace warehouse unavailable");
  expect(html).toContain("session.error");
  expect(html).toContain("https://warehouse.test/traces");
});

test("createVoiceTraceDeliveryRoutes exposes json and html queue surfaces", async () => {
  const store = await seedTraceDeliveries();
  const routes = createVoiceTraceDeliveryRoutes({
    store,
  });
  const json = await routes.handle(
    new Request("http://localhost/api/voice-trace-deliveries?status=failed"),
  );
  const html = await routes.handle(
    new Request("http://localhost/traces/deliveries?q=assistant"),
  );

  expect(await json.json()).toMatchObject({
    deliveries: [
      {
        deliveryStatus: "failed",
        id: "trace-delivery-failed",
      },
    ],
    summary: {
      failed: 1,
      total: 1,
    },
  });
  expect(await html.text()).toContain("trace-delivery-ok");
});

test("createVoiceTraceDeliveryRoutes can expose an explicit drain endpoint", async () => {
  const store = await seedTraceDeliveries();
  const worker = createVoiceTraceSinkDeliveryWorker({
    deliveries: store,
    leases: createLeaseCoordinator(),
    sinks: [
      {
        deliver: ({ events }) => ({
          attempts: 1,
          deliveredAt: Date.now(),
          eventCount: events.length,
          status: "delivered",
        }),
        id: "warehouse",
      },
    ],
    workerId: "trace-worker",
  });
  const routes = createVoiceTraceDeliveryRoutes({
    store,
    worker,
  });
  const html = await routes.handle(
    new Request("http://localhost/traces/deliveries"),
  );
  const response = await routes.handle(
    new Request("http://localhost/api/voice-trace-deliveries/drain", {
      method: "POST",
    }),
  );
  const body = await response.json();

  expect(await html.text()).toContain("Drain trace deliveries");
  expect(body).toMatchObject({
    attempted: 1,
    delivered: 1,
    failed: 0,
  });
  expect((await store.get("trace-delivery-failed"))?.deliveryStatus).toBe(
    "delivered",
  );
});
