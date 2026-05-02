import { expect, test } from "bun:test";
import {
  buildVoiceAuditTrailReport,
  createVoiceAuditTrailRoutes,
  createVoiceMemoryAuditEventStore,
  renderVoiceAuditTrailHTML,
  resolveVoiceAuditTrailFilter,
  summarizeVoiceAuditTrail,
} from "../src";

const createAuditStore = async () => {
  const store = createVoiceMemoryAuditEventStore();
  await Promise.all([
    store.append({
      action: "llm.provider.call",
      actor: {
        id: "support",
        kind: "agent",
      },
      at: 100,
      outcome: "success",
      payload: {
        email: "alex@example.com",
        message: "Call 415-555-1212",
        provider: "openai",
      },
      resource: {
        id: "openai",
        type: "provider",
      },
      sessionId: "session-1",
      type: "provider.call",
    }),
    store.append({
      action: "tool.call",
      actor: {
        id: "support",
        kind: "agent",
      },
      at: 200,
      outcome: "error",
      payload: {
        error: "timeout",
        toolName: "book_meeting",
      },
      resource: {
        id: "book_meeting",
        type: "tool",
      },
      sessionId: "session-1",
      type: "tool.call",
    }),
    store.append({
      action: "review.approve",
      actor: {
        id: "operator-1",
        kind: "operator",
      },
      at: 300,
      outcome: "success",
      resource: {
        id: "review-1",
        type: "review",
      },
      type: "operator.action",
    }),
  ]);

  return store;
};

test("summarizeVoiceAuditTrail groups audit evidence", async () => {
  const store = await createAuditStore();
  const events = await store.list();

  expect(summarizeVoiceAuditTrail(events)).toMatchObject({
    byActor: [
      ["support", 2],
      ["operator-1", 1],
    ],
    byOutcome: [
      ["success", 2],
      ["error", 1],
    ],
    errors: 1,
    latestAt: 300,
    total: 3,
  });
});

test("buildVoiceAuditTrailReport applies filters and limits", async () => {
  const store = await createAuditStore();
  const report = await buildVoiceAuditTrailReport({
    filter: {
      actorId: "support",
      limit: 1,
    },
    store,
  });

  expect(report.events).toHaveLength(1);
  expect(report.events[0]?.type).toBe("provider.call");
  expect(report.summary.total).toBe(1);
});

test("resolveVoiceAuditTrailFilter parses query filters", () => {
  expect(
    resolveVoiceAuditTrailFilter({
      actorId: "operator-1",
      afterOrAt: "100",
      limit: "5",
      outcome: "success",
      type: "operator.action",
    }),
  ).toEqual({
    actorId: "operator-1",
    after: undefined,
    afterOrAt: 100,
    before: undefined,
    beforeOrAt: undefined,
    limit: 5,
    outcome: "success",
    resourceId: undefined,
    resourceType: undefined,
    sessionId: undefined,
    traceId: undefined,
    type: "operator.action",
  });
});

test("renderVoiceAuditTrailHTML renders event details", async () => {
  const store = await createAuditStore();
  const report = await buildVoiceAuditTrailReport({ store });
  const html = renderVoiceAuditTrailHTML(report);

  expect(html).toContain("AbsoluteJS Voice Audit Trail");
  expect(html).toContain("provider.call");
  expect(html).toContain("book_meeting");
  expect(html).toContain("operator.action");
});

test("createVoiceAuditTrailRoutes exposes json and html audit surfaces", async () => {
  const store = await createAuditStore();
  const app = createVoiceAuditTrailRoutes({
    store,
  });

  const json = await app.handle(
    new Request("http://localhost/api/voice-audit?type=tool.call"),
  );
  expect(json.status).toBe(200);
  expect(await json.json()).toMatchObject({
    events: [
      {
        type: "tool.call",
      },
    ],
    summary: {
      total: 1,
    },
  });

  const html = await app.handle(new Request("http://localhost/audit"));
  expect(html.status).toBe(200);
  expect(html.headers.get("content-type")).toContain("text/html");
  expect(await html.text()).toContain("Self-hosted evidence");
});

test("createVoiceAuditTrailRoutes exposes redacted export endpoints", async () => {
  const store = await createAuditStore();
  const app = createVoiceAuditTrailRoutes({
    store,
    title: "Audit export",
  });

  const json = await app.handle(
    new Request("http://localhost/api/voice-audit/export?type=provider.call"),
  );
  expect(json.status).toBe(200);
  const body = await json.json();
  expect(body.redacted).toBe(true);
  expect(body.events).toHaveLength(1);
  expect(JSON.stringify(body)).not.toContain("alex@example.com");
  expect(JSON.stringify(body)).not.toContain("415-555-1212");

  const markdown = await app.handle(
    new Request("http://localhost/api/voice-audit/export?format=markdown"),
  );
  expect(markdown.headers.get("content-type")).toContain("text/markdown");
  const markdownText = await markdown.text();
  expect(markdownText).toContain("# Audit export");
  expect(markdownText).not.toContain("alex@example.com");

  const html = await app.handle(new Request("http://localhost/audit/export"));
  expect(html.headers.get("content-type")).toContain("text/html");
  const htmlText = await html.text();
  expect(htmlText).toContain("Audit export");
  expect(htmlText).not.toContain("415-555-1212");
});
