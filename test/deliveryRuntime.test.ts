import { expect, test } from "bun:test";
import {
  createVoiceAuditEvent,
  createVoiceAuditSinkDeliveryRecord,
  createVoiceDeliveryRuntime,
  createVoiceDeliveryRuntimePresetConfig,
  createVoiceDeliveryRuntimeRoutes,
  createVoiceMemoryAuditSinkDeliveryStore,
  createVoiceMemoryTraceSinkDeliveryStore,
  createVoiceTraceEvent,
  createVoiceTraceSinkDeliveryRecord,
  type VoiceRedisTaskLeaseCoordinator,
} from "../src";

const createLeaseCoordinator = (): VoiceRedisTaskLeaseCoordinator => ({
  claim: async () => true,
  get: async () => null,
  release: async () => true,
  renew: async () => true,
});

test("createVoiceDeliveryRuntime ticks audit and trace workers together", async () => {
  const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
  const traceDeliveries = createVoiceMemoryTraceSinkDeliveryStore();
  const auditDelivery = createVoiceAuditSinkDeliveryRecord({
    events: [
      createVoiceAuditEvent({
        action: "trace.export.delivered",
        type: "operator.action",
      }),
    ],
    id: "audit-delivery",
  });
  const traceDelivery = createVoiceTraceSinkDeliveryRecord({
    events: [
      createVoiceTraceEvent({
        at: 100,
        payload: {
          status: "ok",
        },
        sessionId: "session-delivery-runtime",
        type: "client.live_latency",
      }),
    ],
    id: "trace-delivery",
  });
  await auditDeliveries.set(auditDelivery.id, auditDelivery);
  await traceDeliveries.set(traceDelivery.id, traceDelivery);

  const runtime = createVoiceDeliveryRuntime({
    audit: {
      deliveries: auditDeliveries,
      leases: createLeaseCoordinator(),
      sinks: [
        {
          deliver: ({ events }) => ({
            attempts: 1,
            deliveredAt: Date.now(),
            deliveredTo: "memory://audit",
            eventCount: events.length,
            status: "delivered",
          }),
          id: "audit-memory",
        },
      ],
      workerId: "audit-worker",
    },
    trace: {
      deliveries: traceDeliveries,
      leases: createLeaseCoordinator(),
      sinks: [
        {
          deliver: ({ events }) => ({
            attempts: 1,
            deliveredAt: Date.now(),
            deliveredTo: "memory://trace",
            eventCount: events.length,
            status: "delivered",
          }),
          id: "trace-memory",
        },
      ],
      workerId: "trace-worker",
    },
  });

  const result = await runtime.tick();
  const summary = await runtime.summarize();

  expect(result.audit?.delivered).toBe(1);
  expect(result.trace?.delivered).toBe(1);
  expect(summary.audit?.delivered).toBe(1);
  expect(summary.trace?.delivered).toBe(1);
  expect((await auditDeliveries.get("audit-delivery"))?.deliveryStatus).toBe(
    "delivered",
  );
  expect((await traceDeliveries.get("trace-delivery"))?.deliveryStatus).toBe(
    "delivered",
  );
});

test("createVoiceDeliveryRuntimePresetConfig builds webhook audit and trace workers", async () => {
  const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
  const traceDeliveries = createVoiceMemoryTraceSinkDeliveryStore();
  await auditDeliveries.set(
    "audit-webhook-delivery",
    createVoiceAuditSinkDeliveryRecord({
      events: [
        createVoiceAuditEvent({
          action: "trace.export.delivered",
          type: "operator.action",
        }),
      ],
      id: "audit-webhook-delivery",
    }),
  );
  await traceDeliveries.set(
    "trace-webhook-delivery",
    createVoiceTraceSinkDeliveryRecord({
      events: [
        createVoiceTraceEvent({
          at: 100,
          payload: { ok: true },
          sessionId: "preset-webhook",
          type: "client.live_latency",
        }),
      ],
      id: "trace-webhook-delivery",
    }),
  );
  const requests: Array<{ body: string; url: string }> = [];
  const runtime = createVoiceDeliveryRuntime(
    createVoiceDeliveryRuntimePresetConfig({
      auditDeliveries,
      auditSinkId: "audit-webhook",
      fetch: async (url, init) => {
        requests.push({
          body: String(init?.body),
          url: String(url),
        });
        return Response.json({ ok: true });
      },
      leases: {
        audit: createLeaseCoordinator(),
        trace: createLeaseCoordinator(),
      },
      mode: "webhook",
      traceDeliveries,
      traceSinkId: "trace-webhook",
      url: "https://example.test/deliveries",
    }),
  );

  const result = await runtime.tick();

  expect(result.audit?.delivered).toBe(1);
  expect(result.trace?.delivered).toBe(1);
  expect(requests).toHaveLength(2);
  expect(JSON.parse(requests[0]?.body ?? "{}")).toMatchObject({
    eventCount: 1,
    source: "absolutejs-voice",
  });
  expect(
    requests.every(
      (request) => request.url === "https://example.test/deliveries",
    ),
  ).toBe(true);
});

test("createVoiceDeliveryRuntimePresetConfig builds S3 audit and trace workers", async () => {
  const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
  const traceDeliveries = createVoiceMemoryTraceSinkDeliveryStore();
  await auditDeliveries.set(
    "audit-s3-delivery",
    createVoiceAuditSinkDeliveryRecord({
      events: [
        createVoiceAuditEvent({
          action: "trace.export.delivered",
          type: "operator.action",
        }),
      ],
      id: "audit-s3-delivery",
    }),
  );
  await traceDeliveries.set(
    "trace-s3-delivery",
    createVoiceTraceSinkDeliveryRecord({
      events: [
        createVoiceTraceEvent({
          at: 100,
          payload: { ok: true },
          sessionId: "preset-s3",
          type: "client.live_latency",
        }),
      ],
      id: "trace-s3-delivery",
    }),
  );
  const writes: Array<{ data: string; key: string }> = [];
  const client = {
    file: (key: string) => ({
      write: (data: string) => {
        writes.push({ data, key });
        return Promise.resolve(data.length);
      },
    }),
  };
  const runtime = createVoiceDeliveryRuntime(
    createVoiceDeliveryRuntimePresetConfig({
      auditDeliveries,
      bucket: "voice-bucket",
      client,
      keyPrefix: "exports",
      leases: {
        audit: createLeaseCoordinator(),
        trace: createLeaseCoordinator(),
      },
      mode: "s3",
      traceDeliveries,
    }),
  );

  const result = await runtime.tick();

  expect(result.audit?.delivered).toBe(1);
  expect(result.trace?.delivered).toBe(1);
  expect(writes.map((write) => write.key).sort()).toEqual(
    expect.arrayContaining([
      expect.stringContaining("exports/audit/"),
      expect.stringContaining("exports/trace/"),
    ]),
  );
});

test("createVoiceDeliveryRuntime exposes loop lifecycle state", () => {
  const runtime = createVoiceDeliveryRuntime({
    audit: {
      autoStart: true,
      deliveries: createVoiceMemoryAuditSinkDeliveryStore(),
      leases: createLeaseCoordinator(),
      sinks: [],
      workerId: "audit-loop",
    },
  });

  expect(runtime.isRunning()).toBe(false);
  runtime.start();
  expect(runtime.isRunning()).toBe(true);
  runtime.stop();
  expect(runtime.isRunning()).toBe(false);
});

test("createVoiceDeliveryRuntime requeues audit and trace dead letters", async () => {
  const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
  const auditDeadLetters = createVoiceMemoryAuditSinkDeliveryStore();
  const traceDeliveries = createVoiceMemoryTraceSinkDeliveryStore();
  const traceDeadLetters = createVoiceMemoryTraceSinkDeliveryStore();
  const auditDelivery = {
    ...createVoiceAuditSinkDeliveryRecord({
      events: [
        createVoiceAuditEvent({
          action: "trace.export.failed",
          type: "operator.action",
        }),
      ],
      id: "audit-dead-letter",
    }),
    deliveryAttempts: 3,
    deliveryError: "failed",
    deliveryStatus: "failed" as const,
  };
  const traceDelivery = {
    ...createVoiceTraceSinkDeliveryRecord({
      events: [
        createVoiceTraceEvent({
          at: 100,
          payload: { ok: false },
          sessionId: "trace-dead-letter",
          type: "client.live_latency",
        }),
      ],
      id: "trace-dead-letter",
    }),
    deliveryAttempts: 3,
    deliveryError: "failed",
    deliveryStatus: "failed" as const,
  };
  await auditDeadLetters.set(auditDelivery.id, auditDelivery);
  await traceDeadLetters.set(traceDelivery.id, traceDelivery);
  const runtime = createVoiceDeliveryRuntime({
    audit: {
      deadLetters: auditDeadLetters,
      deliveries: auditDeliveries,
      leases: createLeaseCoordinator(),
      sinks: [],
      workerId: "audit-requeue-worker",
    },
    trace: {
      deadLetters: traceDeadLetters,
      deliveries: traceDeliveries,
      leases: createLeaseCoordinator(),
      sinks: [],
      workerId: "trace-requeue-worker",
    },
  });

  const result = await runtime.requeueDeadLetters();

  expect(result).toEqual({ audit: 1, trace: 1, total: 2 });
  expect((await auditDeliveries.get(auditDelivery.id))?.deliveryStatus).toBe(
    "pending",
  );
  expect((await auditDeliveries.get(auditDelivery.id))?.deliveryAttempts).toBe(
    0,
  );
  expect(await auditDeadLetters.list()).toHaveLength(0);
  expect((await traceDeliveries.get(traceDelivery.id))?.deliveryStatus).toBe(
    "pending",
  );
  expect(await traceDeadLetters.list()).toHaveLength(0);
});

test("createVoiceDeliveryRuntimeRoutes exposes status, tick, and html", async () => {
  const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
  const auditDelivery = createVoiceAuditSinkDeliveryRecord({
    events: [
      createVoiceAuditEvent({
        action: "trace.export.delivered",
        type: "operator.action",
      }),
    ],
    id: "audit-route-delivery",
  });
  await auditDeliveries.set(auditDelivery.id, auditDelivery);
  const runtime = createVoiceDeliveryRuntime({
    audit: {
      deliveries: auditDeliveries,
      leases: createLeaseCoordinator(),
      sinks: [
        {
          deliver: ({ events }) => ({
            attempts: 1,
            deliveredAt: Date.now(),
            eventCount: events.length,
            status: "delivered",
          }),
          id: "audit-memory",
        },
      ],
      workerId: "audit-route-worker",
    },
  });
  const routes = createVoiceDeliveryRuntimeRoutes({
    runtime,
  });

  const status = await routes.handle(
    new Request("http://localhost/api/voice-delivery-runtime"),
  );
  const tick = await routes.handle(
    new Request("http://localhost/api/voice-delivery-runtime/tick", {
      method: "POST",
    }),
  );
  const requeue = await routes.handle(
    new Request(
      "http://localhost/api/voice-delivery-runtime/requeue-dead-letters",
      {
        method: "POST",
      },
    ),
  );
  const html = await routes.handle(
    new Request("http://localhost/delivery-runtime"),
  );

  expect(status.status).toBe(200);
  await expect(status.json()).resolves.toMatchObject({
    isRunning: false,
    summary: {
      audit: {
        pending: 1,
        total: 1,
      },
    },
  });
  expect(tick.status).toBe(200);
  await expect(tick.json()).resolves.toMatchObject({
    result: {
      audit: {
        delivered: 1,
      },
    },
    summary: {
      audit: {
        delivered: 1,
      },
    },
  });
  expect(requeue.status).toBe(200);
  await expect(requeue.json()).resolves.toMatchObject({
    result: {
      total: 0,
    },
  });
  expect(html.status).toBe(200);
  const htmlText = await html.text();
  expect(htmlText).toContain("Delivery Runtime");
  expect(htmlText).toContain("Copy into your app");
  expect(htmlText).toContain("createVoiceDeliveryRuntimeRoutes");
  expect(htmlText).toContain("createVoiceProductionReadinessRoutes");
});
