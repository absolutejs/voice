import { expect, test } from "bun:test";
import {
  createVoiceHandoffHealthRoutes,
  createVoiceMemoryTraceEventStore,
  createVoiceTraceEvent,
  renderVoiceHandoffHealthHTML,
  summarizeVoiceHandoffHealth,
} from "../src";

const createHandoffEvents = () => [
  createVoiceTraceEvent({
    at: 1_000,
    payload: {
      action: "transfer",
      deliveries: {
        webhook: {
          adapterId: "webhook",
          adapterKind: "webhook",
          deliveredTo: "https://example.test/handoff",
          status: "delivered",
        },
      },
      reason: "caller-requested-transfer",
      status: "delivered",
      target: "billing",
    },
    sessionId: "session-handoff-ok",
    type: "call.handoff",
  }),
  createVoiceTraceEvent({
    at: 2_000,
    payload: {
      action: "escalate",
      deliveries: {
        twilio: {
          adapterId: "twilio",
          error: "Twilio handoff failed with response 500.",
          status: "failed",
        },
      },
      reason: "caller-requested-human",
      status: "failed",
    },
    sessionId: "session-handoff-failed",
    type: "call.handoff",
  }),
];

test("summarizeVoiceHandoffHealth reports handoff delivery status and filters", async () => {
  const summary = await summarizeVoiceHandoffHealth({
    events: createHandoffEvents(),
    status: "failed",
  });

  expect(summary).toMatchObject({
    byAction: {
      escalate: 1,
    },
    byAdapter: {
      twilio: {
        failed: 1,
      },
    },
    byStatus: {
      delivered: 0,
      failed: 1,
      skipped: 0,
    },
    failed: 1,
    total: 1,
  });
  expect(summary.events[0]).toMatchObject({
    action: "escalate",
    replayHref: "/api/voice-sessions/session-handoff-failed/replay/htmx",
    sessionId: "session-handoff-failed",
    status: "failed",
  });
});

test("renderVoiceHandoffHealthHTML renders delivery details and replay links", async () => {
  const summary = await summarizeVoiceHandoffHealth({
    events: createHandoffEvents(),
  });
  const html = renderVoiceHandoffHealthHTML(summary);

  expect(html).toContain("Recent Handoffs");
  expect(html).toContain("session-handoff-failed");
  expect(html).toContain("Open replay");
});

test("createVoiceHandoffHealthRoutes exposes json and html endpoints", async () => {
  const store = createVoiceMemoryTraceEventStore();
  for (const event of createHandoffEvents()) {
    await store.append(event);
  }
  const routes = createVoiceHandoffHealthRoutes({
    store,
  });
  const json = await routes.handle(
    new Request("http://localhost/api/voice-handoffs?status=failed"),
  );
  const html = await routes.handle(
    new Request("http://localhost/api/voice-handoffs/htmx?q=billing"),
  );

  expect(await json.json()).toMatchObject({
    events: [
      {
        sessionId: "session-handoff-failed",
        status: "failed",
      },
    ],
  });
  expect(await html.text()).toContain("session-handoff-ok");
});
