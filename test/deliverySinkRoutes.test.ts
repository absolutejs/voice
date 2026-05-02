import { expect, test } from "bun:test";
import {
  buildVoiceDeliverySinkReport,
  createVoiceAuditEvent,
  createVoiceAuditSinkDeliveryRecord,
  createVoiceDeliverySinkPair,
  createVoiceDeliverySinkRoutes,
  createVoiceS3DeliverySink,
  createVoiceMemoryAuditSinkDeliveryStore,
  createVoiceMemoryTraceSinkDeliveryStore,
  createVoiceTraceEvent,
  createVoiceTraceSinkDeliveryRecord,
  renderVoiceDeliverySinkHTML,
} from "../src";

test("buildVoiceDeliverySinkReport summarizes audit and trace sink stores", async () => {
  const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
  const traceDeliveries = createVoiceMemoryTraceSinkDeliveryStore();
  await auditDeliveries.set(
    "audit-proof",
    createVoiceAuditSinkDeliveryRecord({
      deliveredAt: 100,
      deliveryStatus: "delivered",
      events: [
        createVoiceAuditEvent({
          action: "trace.export.delivered",
          type: "operator.action",
        }),
      ],
      id: "audit-proof",
    }),
  );
  await traceDeliveries.set(
    "trace-proof",
    createVoiceTraceSinkDeliveryRecord({
      deliveredAt: 100,
      deliveryStatus: "delivered",
      events: [
        createVoiceTraceEvent({
          at: 100,
          payload: {
            latencyMs: 100,
          },
          sessionId: "delivery-proof",
          type: "client.live_latency",
        }),
      ],
      id: "trace-proof",
    }),
  );
  const report = await buildVoiceDeliverySinkReport({
    auditDeliveries: {
      store: auditDeliveries,
    },
    sinks: [
      {
        id: "file",
        kind: "file",
        label: "File sink",
      },
    ],
    traceDeliveries: {
      store: traceDeliveries,
    },
  });

  expect(report.status).toBe("pass");
  expect(report.auditDeliveries?.summary.delivered).toBe(1);
  expect(report.traceDeliveries?.summary.delivered).toBe(1);
  expect(renderVoiceDeliverySinkHTML(report)).toContain("File sink");
});

test("delivery sink factories describe configured targets", () => {
  const s3Sink = createVoiceS3DeliverySink({
    id: "s3-audit",
    label: "S3 audit",
    mode: "s3",
    target: "s3://voice/audit",
  });
  const pair = createVoiceDeliverySinkPair({
    kind: "webhook",
    mode: "webhook",
    target: "https://example.test/voice",
    auditHref: "/audit/deliveries",
    traceHref: "/traces/deliveries",
  });
  const html = renderVoiceDeliverySinkHTML({
    checkedAt: 100,
    sinks: [s3Sink, ...pair],
    status: "pass",
  });

  expect(s3Sink).toMatchObject({
    id: "s3-audit",
    kind: "s3",
    mode: "s3",
    target: "s3://voice/audit",
  });
  expect(pair.map((sink) => sink.id)).toEqual([
    "webhook-audit-sink",
    "webhook-trace-sink",
  ]);
  expect(html).toContain("Mode: s3");
  expect(html).toContain("s3://voice/audit");
  expect(html).toContain("https://example.test/voice");
});

test("createVoiceDeliverySinkRoutes exposes json and html surfaces", async () => {
  const routes = createVoiceDeliverySinkRoutes({
    auditDeliveries: {
      store: createVoiceMemoryAuditSinkDeliveryStore(),
    },
    traceDeliveries: {
      store: createVoiceMemoryTraceSinkDeliveryStore(),
    },
  });
  const json = await routes.handle(
    new Request("http://localhost/api/voice-delivery-sinks"),
  );
  const html = await routes.handle(
    new Request("http://localhost/delivery-sinks"),
  );

  expect(json.status).toBe(200);
  await expect(json.json()).resolves.toMatchObject({
    status: "warn",
  });
  expect(html.status).toBe(200);
  expect(await html.text()).toContain("Delivery Sinks");
});
