import { afterEach, expect, test } from "bun:test";
import {
  createStoredVoiceCallReviewArtifact,
  createStoredVoiceExternalObjectMap,
  createStoredVoiceIntegrationEvent,
  createStoredVoiceOpsTask,
  createVoicePostgresAuditEventStore,
  createVoicePostgresCampaignStore,
  createVoicePostgresExternalObjectMapStore,
  createVoicePostgresIntegrationEventStore,
  createVoicePostgresReviewStore,
  createVoicePostgresRuntimeStorage,
  createVoicePostgresSessionStore,
  createVoicePostgresTaskStore,
  createVoicePostgresTelephonyWebhookIdempotencyStore,
  createVoicePostgresTraceSinkDeliveryStore,
  createVoicePostgresTraceEventStore,
  createVoiceTraceEvent,
  createVoiceTraceSinkDeliveryRecord,
  runVoiceCampaignProof,
} from "../src";
import type { VoicePostgresClient } from "../src";

type StoredRow = {
  id: string;
  payload: unknown;
  sortAt: number;
};

const createFakePostgresClient = (): VoicePostgresClient => {
  const tables = new Map<string, Map<string, StoredRow>>();

  const getTable = (qualifiedName: string) => {
    let table = tables.get(qualifiedName);
    if (!table) {
      table = new Map<string, StoredRow>();
      tables.set(qualifiedName, table);
    }
    return table;
  };

  const parseTableName = (
    query: string,
    keyword: "FROM" | "INTO" | "TABLE",
  ) => {
    const keywordPattern =
      keyword === "TABLE" ? "TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?" : keyword;
    const match = query.match(
      new RegExp(`${keywordPattern}\\s+("[^"]+"\\."[^"]+"|"[^"]+")`, "i"),
    );
    if (!match?.[1]) {
      throw new Error(`Could not parse table name from query: ${query}`);
    }
    return match[1];
  };

  return {
    unsafe: async (query, parameters = []) => {
      const normalized = query.replace(/\s+/g, " ").trim().toUpperCase();

      if (normalized.startsWith("CREATE TABLE IF NOT EXISTS")) {
        getTable(parseTableName(query, "TABLE"));
        return [];
      }

      if (normalized.startsWith("CREATE SCHEMA IF NOT EXISTS")) {
        return [];
      }

      if (normalized.startsWith("SELECT PAYLOAD FROM")) {
        const table = getTable(parseTableName(query, "FROM"));
        if (normalized.includes("WHERE ID = $1")) {
          const row = table.get(String(parameters[0]));
          return row
            ? ([{ payload: row.payload }] as Array<Record<string, unknown>>)
            : [];
        }

        return [...table.values()]
          .sort((left, right) =>
            right.sortAt === left.sortAt
              ? right.id.localeCompare(left.id)
              : right.sortAt - left.sortAt,
          )
          .map((row) => ({
            payload: row.payload,
          })) as Array<Record<string, unknown>>;
      }

      if (normalized.startsWith("INSERT INTO")) {
        const table = getTable(parseTableName(query, "INTO"));
        table.set(String(parameters[0]), {
          id: String(parameters[0]),
          payload: JSON.parse(String(parameters[2])),
          sortAt: Number(parameters[1]),
        });
        return [];
      }

      if (normalized.startsWith("DELETE FROM")) {
        const table = getTable(parseTableName(query, "FROM"));
        table.delete(String(parameters[0]));
        return [];
      }

      throw new Error(`Unsupported fake postgres query: ${query}`);
    },
  };
};

afterEach(() => {
  // No shared process state outside each fake client instance.
});

test("createVoicePostgresSessionStore persists sessions across instances", async () => {
  const sql = createFakePostgresClient();
  const firstStore = createVoicePostgresSessionStore({
    sql,
  });

  const session = await firstStore.getOrCreate("session-1");
  session.lastActivityAt = 1234;
  await firstStore.set("session-1", session);

  const secondStore = createVoicePostgresSessionStore({
    sql,
  });
  const restored = await secondStore.get("session-1");
  const summaries = await secondStore.list();

  expect(restored?.id).toBe("session-1");
  expect(restored?.lastActivityAt).toBe(1234);
  expect(summaries).toHaveLength(1);
  expect(summaries[0]?.id).toBe("session-1");
});

test("createVoicePostgresReviewStore persists and sorts review artifacts", async () => {
  const sql = createFakePostgresClient();
  const store = createVoicePostgresReviewStore({
    sql,
  });

  await store.set(
    "review-1",
    createStoredVoiceCallReviewArtifact("review-1", {
      errors: [],
      generatedAt: 100,
      latencyBreakdown: [],
      notes: [],
      summary: {
        pass: true,
      },
      title: "Older review",
      timeline: [],
      transcript: {
        actual: "older",
      },
    }),
  );
  await store.set(
    "review-2",
    createStoredVoiceCallReviewArtifact("review-2", {
      errors: [],
      generatedAt: 200,
      latencyBreakdown: [],
      notes: [],
      summary: {
        pass: true,
      },
      title: "Newer review",
      timeline: [],
      transcript: {
        actual: "newer",
      },
    }),
  );

  const reviews = await store.list();
  expect(reviews.map((review) => review.id)).toEqual(["review-2", "review-1"]);
});

test("createVoicePostgresTaskStore persists tasks across instances", async () => {
  const sql = createFakePostgresClient();
  const store = createVoicePostgresTaskStore({
    sql,
  });

  await store.set(
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

  const secondStore = createVoicePostgresTaskStore({
    sql,
  });
  expect((await secondStore.get("task-1"))?.kind).toBe("callback");
  expect((await secondStore.list()).map((task) => task.id)).toEqual(["task-1"]);
});

test("createVoicePostgresIntegrationEventStore persists and sorts events", async () => {
  const sql = createFakePostgresClient();
  const store = createVoicePostgresIntegrationEventStore({
    sql,
  });

  await store.set(
    "event-1",
    createStoredVoiceIntegrationEvent("event-1", {
      createdAt: 100,
      payload: {
        reviewId: "review-1",
      },
      type: "review.saved",
    }),
  );
  await store.set(
    "event-2",
    createStoredVoiceIntegrationEvent("event-2", {
      createdAt: 200,
      payload: {
        taskId: "task-1",
      },
      type: "task.created",
    }),
  );

  expect((await store.list()).map((event) => event.id)).toEqual([
    "event-2",
    "event-1",
  ]);
});

test("createVoicePostgresExternalObjectMapStore persists and finds vendor object mappings", async () => {
  const sql = createFakePostgresClient();
  const store = createVoicePostgresExternalObjectMapStore({
    sql,
  });

  const mapping = createStoredVoiceExternalObjectMap({
    at: 100,
    externalId: "zendesk-123",
    provider: "zendesk",
    sinkId: "zendesk",
    sourceId: "task-1",
    sourceType: "task",
  });

  await store.set(mapping.id, mapping);

  const secondStore = createVoicePostgresExternalObjectMapStore({
    sql,
  });
  const restored = await secondStore.find({
    provider: "zendesk",
    sinkId: "zendesk",
    sourceId: "task-1",
    sourceType: "task",
  });

  expect(restored?.externalId).toBe("zendesk-123");
  expect((await secondStore.list()).map((item) => item.id)).toEqual([
    mapping.id,
  ]);
});

test("createVoicePostgresTraceEventStore persists and filters trace events", async () => {
  const sql = createFakePostgresClient();
  const store = createVoicePostgresTraceEventStore({
    sql,
  });

  await store.append({
    at: 100,
    payload: {
      agentId: "support",
    },
    sessionId: "session-trace",
    turnId: "turn-1",
    type: "agent.model",
  });
  await store.append({
    at: 200,
    payload: {
      agentId: "support",
      toolName: "lookup_order",
    },
    sessionId: "session-trace",
    turnId: "turn-1",
    type: "agent.tool",
  });

  const secondStore = createVoicePostgresTraceEventStore({
    sql,
  });
  expect((await secondStore.list({ type: "agent.tool" }))[0]).toMatchObject({
    payload: {
      toolName: "lookup_order",
    },
    sessionId: "session-trace",
    type: "agent.tool",
  });
});

test("createVoicePostgresCampaignStore persists campaign proof records across instances", async () => {
  const sql = createFakePostgresClient();
  const store = createVoicePostgresCampaignStore({
    sql,
  });

  const proof = await runVoiceCampaignProof({
    store,
  });

  const secondStore = createVoicePostgresCampaignStore({
    sql,
  });
  const restored = await secondStore.get(proof.final.campaign.id);

  expect(restored?.recipients).toHaveLength(2);
  expect(restored?.attempts).toHaveLength(2);
  expect(
    (await secondStore.list()).map((record) => record.campaign.id),
  ).toEqual([proof.final.campaign.id]);
});

test("createVoicePostgresRuntimeStorage exposes persistent sessions, reviews, campaigns, tasks, events, and external object maps", async () => {
  const sql = createFakePostgresClient();
  const runtimeStorage = createVoicePostgresRuntimeStorage({
    sql,
  });

  const session = await runtimeStorage.session.getOrCreate("session-runtime");
  await runtimeStorage.session.set("session-runtime", {
    ...session,
    lastActivityAt: 2222,
  });
  await runtimeStorage.reviews.set(
    "review-runtime",
    createStoredVoiceCallReviewArtifact("review-runtime", {
      errors: [],
      generatedAt: 300,
      latencyBreakdown: [],
      notes: [],
      summary: {
        pass: true,
      },
      title: "Runtime review",
      timeline: [],
      transcript: {
        actual: "runtime",
      },
    }),
  );
  await runtimeStorage.tasks.set(
    "task-runtime",
    createStoredVoiceOpsTask("task-runtime", {
      createdAt: 100,
      description: "Check transfer handoff",
      history: [],
      intakeId: "intake-runtime",
      kind: "transfer-check",
      recommendedAction: "Verify downstream queue receipt",
      status: "open",
      title: "Verify transfer",
      updatedAt: 100,
    }),
  );
  await runtimeStorage.events.set(
    "event-runtime",
    createStoredVoiceIntegrationEvent("event-runtime", {
      createdAt: 100,
      payload: {
        sessionId: "session-runtime",
      },
      type: "call.completed",
    }),
  );
  await runtimeStorage.externalObjects.set(
    "zendesk:zendesk:task-runtime",
    createStoredVoiceExternalObjectMap({
      at: 100,
      externalId: "zendesk-task-runtime",
      provider: "zendesk",
      sinkId: "zendesk",
      sourceId: "task-runtime",
      sourceType: "task",
    }),
  );
  const campaignProof = await runVoiceCampaignProof({
    store: runtimeStorage.campaigns,
  });
  await runtimeStorage.traces.append({
    at: 400,
    payload: {
      agentId: "support",
    },
    sessionId: "session-runtime",
    type: "agent.result",
  });
  await runtimeStorage.traceDeliveries.set(
    "trace-delivery-runtime",
    createVoiceTraceSinkDeliveryRecord({
      createdAt: 500,
      events: [
        createVoiceTraceEvent({
          at: 500,
          payload: {
            text: "queued",
          },
          sessionId: "session-runtime",
          type: "turn.assistant",
        }),
      ],
      id: "trace-delivery-runtime",
    }),
  );

  const secondRuntimeStorage = createVoicePostgresRuntimeStorage({
    sql,
  });

  expect(
    (await secondRuntimeStorage.session.get("session-runtime"))?.lastActivityAt,
  ).toBe(2222);
  expect(
    (await secondRuntimeStorage.reviews.get("review-runtime"))?.title,
  ).toBe("Runtime review");
  expect((await secondRuntimeStorage.tasks.get("task-runtime"))?.title).toBe(
    "Verify transfer",
  );
  expect((await secondRuntimeStorage.events.get("event-runtime"))?.type).toBe(
    "call.completed",
  );
  expect(
    (
      await secondRuntimeStorage.externalObjects.find({
        provider: "zendesk",
        sourceId: "task-runtime",
        sourceType: "task",
      })
    )?.externalId,
  ).toBe("zendesk-task-runtime");
  expect(
    (await secondRuntimeStorage.campaigns.get(campaignProof.final.campaign.id))
      ?.attempts,
  ).toHaveLength(2);
  expect(
    (
      await secondRuntimeStorage.traces.list({ sessionId: "session-runtime" })
    )[0]?.type,
  ).toBe("agent.result");
  expect((await secondRuntimeStorage.traceDeliveries.list())[0]?.id).toBe(
    "trace-delivery-runtime",
  );
});

test("createVoicePostgresTraceSinkDeliveryStore persists queued trace deliveries", async () => {
  const sql = createFakePostgresClient();
  const store = createVoicePostgresTraceSinkDeliveryStore({
    sql,
  });
  const delivery = createVoiceTraceSinkDeliveryRecord({
    createdAt: 100,
    events: [
      createVoiceTraceEvent({
        at: 100,
        payload: {
          text: "durable trace",
        },
        sessionId: "session-delivery",
        type: "turn.assistant",
      }),
    ],
    id: "trace-delivery-1",
  });

  await store.set(delivery.id, delivery);

  const secondStore = createVoicePostgresTraceSinkDeliveryStore({
    sql,
  });

  expect(await secondStore.get(delivery.id)).toMatchObject({
    deliveryStatus: "pending",
    id: "trace-delivery-1",
  });
  expect((await secondStore.list()).map((item) => item.id)).toEqual([
    "trace-delivery-1",
  ]);
});

test("createVoicePostgresAuditEventStore persists and filters audit events", async () => {
  const sql = createFakePostgresClient();
  const store = createVoicePostgresAuditEventStore({
    sql,
  });

  await store.append({
    action: "llm.provider.call",
    at: 100,
    outcome: "success",
    resource: {
      id: "openai",
      type: "provider",
    },
    sessionId: "session-audit",
    type: "provider.call",
  });
  await store.append({
    action: "tool.call",
    at: 200,
    outcome: "error",
    resource: {
      id: "lookup_account",
      type: "tool",
    },
    sessionId: "session-audit",
    type: "tool.call",
  });

  const secondStore = createVoicePostgresAuditEventStore({
    sql,
  });

  expect((await secondStore.list()).map((event) => event.type)).toEqual([
    "provider.call",
    "tool.call",
  ]);
  expect(await secondStore.list({ outcome: "error" })).toMatchObject([
    {
      action: "tool.call",
      type: "tool.call",
    },
  ]);
  expect(await secondStore.list({ resourceType: "provider" })).toHaveLength(1);
});

test("createVoicePostgresRuntimeStorage exposes persistent audit events", async () => {
  const sql = createFakePostgresClient();
  const firstStorage = createVoicePostgresRuntimeStorage({
    sql,
  });
  const event = await firstStorage.audit.append({
    action: "review.approve",
    actor: {
      id: "operator-1",
      kind: "operator",
    },
    at: 100,
    outcome: "success",
    type: "operator.action",
  });
  const secondStorage = createVoicePostgresRuntimeStorage({
    sql,
  });

  expect(await secondStorage.audit.get(event.id)).toMatchObject({
    action: "review.approve",
    type: "operator.action",
  });
});

test("createVoicePostgresTelephonyWebhookIdempotencyStore persists decisions across instances", async () => {
  const sql = createFakePostgresClient();
  const firstStore = createVoicePostgresTelephonyWebhookIdempotencyStore({
    sql,
  });

  await firstStore.set("twilio:CA123:busy", {
    applied: true,
    createdAt: 100,
    decision: {
      action: "no-answer",
      confidence: "high",
      disposition: "no-answer",
      source: "sip",
    },
    event: {
      provider: "twilio",
      sipCode: 486,
      status: "busy",
    },
    idempotencyKey: "twilio:CA123:busy",
    routeResult: {
      noAnswer: {},
    },
    sessionId: "CA123",
    updatedAt: 100,
  });

  const secondStore = createVoicePostgresTelephonyWebhookIdempotencyStore({
    sql,
  });

  expect(await secondStore.get("twilio:CA123:busy")).toMatchObject({
    applied: true,
    decision: {
      action: "no-answer",
    },
    sessionId: "CA123",
  });
});
