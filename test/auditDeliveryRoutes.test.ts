import { expect, test } from "bun:test";
import {
  buildVoiceAuditDeliveryReport,
  createVoiceAuditDeliveryRoutes,
  createVoiceAuditEvent,
  createVoiceAuditSinkDeliveryRecord,
  createVoiceAuditSinkDeliveryWorker,
  createVoiceMemoryAuditSinkDeliveryStore,
  renderVoiceAuditDeliveryHTML,
  resolveVoiceAuditDeliveryFilter,
  type VoiceRedisTaskLeaseCoordinator,
} from "../src";

const createLeaseCoordinator = (): VoiceRedisTaskLeaseCoordinator => ({
  claim: async () => true,
  get: async () => null,
  release: async () => true,
  renew: async () => true,
});

const seedAuditDeliveries = async () => {
  const store = createVoiceMemoryAuditSinkDeliveryStore();
  const providerEvent = createVoiceAuditEvent({
    action: "provider.call",
    sessionId: "session-provider",
    type: "provider.call",
  });
  const toolEvent = createVoiceAuditEvent({
    action: "lookup_order",
    sessionId: "session-tool",
    type: "tool.call",
  });

  await store.set(
    "audit-delivery-ok",
    createVoiceAuditSinkDeliveryRecord({
      createdAt: 1_000,
      deliveredAt: 1_200,
      deliveryAttempts: 1,
      deliveryStatus: "delivered",
      events: [providerEvent],
      id: "audit-delivery-ok",
      sinkDeliveries: {
        warehouse: {
          attempts: 1,
          deliveredTo: "https://warehouse.test/audit",
          eventCount: 1,
          status: "delivered",
        },
      },
    }),
  );
  await store.set(
    "audit-delivery-failed",
    createVoiceAuditSinkDeliveryRecord({
      createdAt: 2_000,
      deliveryAttempts: 2,
      deliveryError: "warehouse unavailable",
      deliveryStatus: "failed",
      events: [toolEvent],
      id: "audit-delivery-failed",
      sinkDeliveries: {
        warehouse: {
          attempts: 2,
          error: "warehouse unavailable",
          eventCount: 1,
          status: "failed",
        },
      },
    }),
  );

  return store;
};

test("resolveVoiceAuditDeliveryFilter parses status search and limit", () => {
  expect(
    resolveVoiceAuditDeliveryFilter({
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

test("buildVoiceAuditDeliveryReport summarizes and filters delivery queue", async () => {
  const store = await seedAuditDeliveries();
  const report = await buildVoiceAuditDeliveryReport(
    {
      store,
    },
    {
      q: "lookup",
      status: "failed",
    },
  );

  expect(report.summary).toMatchObject({
    failed: 1,
    total: 1,
  });
  expect(report.deliveries).toHaveLength(1);
  expect(report.deliveries[0].id).toBe("audit-delivery-failed");
});

test("renderVoiceAuditDeliveryHTML renders sink errors and event details", async () => {
  const store = await seedAuditDeliveries();
  const report = await buildVoiceAuditDeliveryReport({
    store,
  });
  const html = renderVoiceAuditDeliveryHTML(report);

  expect(html).toContain("Audit Deliveries");
  expect(html).toContain("warehouse unavailable");
  expect(html).toContain("lookup_order");
  expect(html).toContain("https://warehouse.test/audit");
});

test("createVoiceAuditDeliveryRoutes exposes json and html queue surfaces", async () => {
  const store = await seedAuditDeliveries();
  const routes = createVoiceAuditDeliveryRoutes({
    store,
  });
  const json = await routes.handle(
    new Request("http://localhost/api/voice-audit-deliveries?status=failed"),
  );
  const html = await routes.handle(
    new Request("http://localhost/audit/deliveries?q=provider"),
  );

  expect(await json.json()).toMatchObject({
    deliveries: [
      {
        deliveryStatus: "failed",
        id: "audit-delivery-failed",
      },
    ],
    summary: {
      failed: 1,
      total: 1,
    },
  });
  expect(await html.text()).toContain("audit-delivery-ok");
});

test("createVoiceAuditDeliveryRoutes can expose an explicit drain endpoint", async () => {
  const store = await seedAuditDeliveries();
  const worker = createVoiceAuditSinkDeliveryWorker({
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
    workerId: "audit-worker",
  });
  const routes = createVoiceAuditDeliveryRoutes({
    store,
    worker,
  });
  const html = await routes.handle(
    new Request("http://localhost/audit/deliveries"),
  );
  const response = await routes.handle(
    new Request("http://localhost/api/voice-audit-deliveries/drain", {
      method: "POST",
    }),
  );
  const body = await response.json();

  expect(await html.text()).toContain("Drain audit deliveries");
  expect(body).toMatchObject({
    attempted: 1,
    delivered: 1,
    failed: 0,
  });
  expect((await store.get("audit-delivery-failed"))?.deliveryStatus).toBe(
    "delivered",
  );
});
