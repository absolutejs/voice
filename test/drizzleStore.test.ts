import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import {
  createStoredVoiceCallReviewArtifact,
  createStoredVoiceExternalObjectMap,
  createStoredVoiceIntegrationEvent,
  createStoredVoiceOpsTask,
} from "../src";
import {
  createVoiceDrizzleAssistantMemoryStore,
  createVoiceDrizzleRealCallProfileRecoveryJobStore,
  createVoiceDrizzleRuntimeStorage,
  voiceDrizzleSchema,
} from "../src/drizzle";

// Build accurate DDL from each Drizzle table's config so every shape (the
// document tables and the composite-key assistant-memory table) is created
// correctly, instead of assuming the generic (id, sort_at, payload) shape.
const createTableSql = (table: PgTable) => {
  const config = getTableConfig(table);
  const columns = config.columns.map((column) => {
    const parts = [`"${column.name}"`, column.getSQLType()];
    if (column.notNull) {
      parts.push("NOT NULL");
    }
    if (column.primary) {
      parts.push("PRIMARY KEY");
    }

    return parts.join(" ");
  });
  for (const primaryKey of config.primaryKeys) {
    columns.push(
      `PRIMARY KEY (${primaryKey.columns.map((column) => `"${column.name}"`).join(", ")})`,
    );
  }

  return `CREATE TABLE IF NOT EXISTS "${config.name}" (${columns.join(", ")})`;
};

const createDrizzleTestDb = async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: voiceDrizzleSchema });

  for (const table of Object.values(voiceDrizzleSchema)) {
    await db.execute(sql.raw(createTableSql(table)));
  }

  return db;
};

test("createVoiceDrizzleRuntimeStorage persists sessions across store reads", async () => {
  const db = await createDrizzleTestDb();
  const storage = createVoiceDrizzleRuntimeStorage({ db });

  const session = await storage.session.getOrCreate("session-1");
  session.lastActivityAt = 1234;
  await storage.session.set("session-1", session);

  const restored = await storage.session.get("session-1");
  const summaries = await storage.session.list();

  expect(restored?.id).toBe("session-1");
  expect(restored?.lastActivityAt).toBe(1234);
  expect(summaries).toHaveLength(1);
  expect(summaries[0]?.id).toBe("session-1");
});

test("createVoiceDrizzleRuntimeStorage sorts reviews and tasks newest first", async () => {
  const db = await createDrizzleTestDb();
  const storage = createVoiceDrizzleRuntimeStorage({ db });

  await storage.reviews.set(
    "review-1",
    createStoredVoiceCallReviewArtifact("review-1", {
      errors: [],
      generatedAt: 100,
      latencyBreakdown: [],
      notes: [],
      summary: { pass: true },
      timeline: [],
      title: "Older review",
      transcript: { actual: "older" },
    }),
  );
  await storage.reviews.set(
    "review-2",
    createStoredVoiceCallReviewArtifact("review-2", {
      errors: [],
      generatedAt: 200,
      latencyBreakdown: [],
      notes: [],
      summary: { pass: true },
      timeline: [],
      title: "Newer review",
      transcript: { actual: "newer" },
    }),
  );

  const reviews = await storage.reviews.list();
  expect(reviews.map((review) => review.id)).toEqual(["review-2", "review-1"]);

  await storage.tasks.set(
    "task-1",
    createStoredVoiceOpsTask("task-1", {
      createdAt: 100,
      description: "Follow up with the caller",
      history: [],
      intakeId: "intake-1",
      kind: "callback",
      recommendedAction: "Call them back",
      status: "open",
      title: "Callback lead",
      updatedAt: 100,
    }),
  );

  expect((await storage.tasks.get("task-1"))?.kind).toBe("callback");
  expect((await storage.tasks.list()).map((task) => task.id)).toEqual([
    "task-1",
  ]);
});

test("createVoiceDrizzleRuntimeStorage sorts events and removes records", async () => {
  const db = await createDrizzleTestDb();
  const storage = createVoiceDrizzleRuntimeStorage({ db });

  await storage.events.set(
    "event-1",
    createStoredVoiceIntegrationEvent("event-1", {
      createdAt: 100,
      payload: { reviewId: "review-1" },
      type: "review.saved",
    }),
  );
  await storage.events.set(
    "event-2",
    createStoredVoiceIntegrationEvent("event-2", {
      createdAt: 200,
      payload: { taskId: "task-1" },
      type: "task.created",
    }),
  );

  expect((await storage.events.list()).map((event) => event.id)).toEqual([
    "event-2",
    "event-1",
  ]);

  await storage.events.remove("event-1");
  expect((await storage.events.list()).map((event) => event.id)).toEqual([
    "event-2",
  ]);
});

test("createVoiceDrizzleRuntimeStorage finds external object mappings", async () => {
  const db = await createDrizzleTestDb();
  const storage = createVoiceDrizzleRuntimeStorage({ db });

  const mapping = createStoredVoiceExternalObjectMap({
    at: 100,
    externalId: "zendesk-123",
    provider: "zendesk",
    sinkId: "zendesk",
    sourceId: "task-1",
    sourceType: "task",
  });

  await storage.externalObjects.set(mapping.id, mapping);

  const found = await storage.externalObjects.find({
    provider: "zendesk",
    sourceId: "task-1",
  });
  expect(found?.externalId).toBe("zendesk-123");
});

test("createVoiceDrizzleRuntimeStorage appends and filters trace + audit events", async () => {
  const db = await createDrizzleTestDb();
  const storage = createVoiceDrizzleRuntimeStorage({ db });

  const trace = await storage.traces.append({
    at: 100,
    payload: { status: "started" },
    scenarioId: "proof-a",
    sessionId: "session-1",
    type: "call.lifecycle",
  });
  expect(trace.id).toBeTruthy();
  expect((await storage.traces.list()).map((event) => event.id)).toContain(
    trace.id,
  );
  expect(await storage.traces.list({ sessionId: "session-1" })).toHaveLength(1);

  const audit = await storage.audit.append({
    action: "session.created",
    outcome: "success",
    sessionId: "session-1",
    type: "operator.action",
  });
  expect(audit.id).toBeTruthy();
  expect((await storage.audit.list()).map((event) => event.id)).toContain(
    audit.id,
  );
});

test("createVoiceDrizzleAssistantMemoryStore upserts by composite key and filters by namespace", async () => {
  const db = await createDrizzleTestDb();
  const store = createVoiceDrizzleAssistantMemoryStore({ db });

  const created = await store.set({
    assistantId: "support",
    key: "name",
    namespace: "caller",
    value: "Ada",
  });
  expect(created.createdAt).toBeGreaterThan(0);
  expect(created.value).toBe("Ada");

  const updated = await store.set({
    assistantId: "support",
    key: "name",
    namespace: "caller",
    value: "Ada Lovelace",
  });
  expect(updated.createdAt).toBe(created.createdAt);
  expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);

  await store.set({
    assistantId: "support",
    key: "tier",
    namespace: "billing",
    value: "gold",
  });

  expect(
    (
      await store.get({
        assistantId: "support",
        key: "name",
        namespace: "caller",
      })
    )?.value,
  ).toBe("Ada Lovelace");
  expect(
    await store.list({ assistantId: "support", namespace: "caller" }),
  ).toHaveLength(1);
  expect(await store.list({ assistantId: "support" })).toHaveLength(2);

  await store.delete({
    assistantId: "support",
    key: "name",
    namespace: "caller",
  });
  expect(
    await store.list({ assistantId: "support", namespace: "caller" }),
  ).toHaveLength(0);
});

test("createVoiceDrizzleRealCallProfileRecoveryJobStore creates, updates, and lists jobs", async () => {
  const db = await createDrizzleTestDb();
  const store = createVoiceDrizzleRealCallProfileRecoveryJobStore({ db });

  const job = await store.create({ actionId: "collect-browser-proof" });
  expect(job.status).toBe("queued");

  const updated = await store.update(job.id, { ok: true, status: "succeeded" });
  expect(updated?.status).toBe("succeeded");
  expect(updated?.ok).toBe(true);

  expect((await store.get(job.id))?.status).toBe("succeeded");
  expect((await store.list?.())?.map((entry) => entry.id)).toContain(job.id);
  expect(await store.update("missing", { status: "failed" })).toBeUndefined();
});
