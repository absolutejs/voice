import { expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createMemoryVoiceTelnyxWebhookEventStore,
  createTelnyxVoiceResponse,
  createTelnyxVoiceRoutes,
  createVoicePostgresTelnyxWebhookEventStore,
  createVoiceRedisTelnyxWebhookEventStore,
  createVoiceSQLiteTelnyxWebhookEventStore,
  createVoiceTelnyxWebhookVerifier,
  type VoiceRedisTelnyxWebhookEventClient,
} from "../src/telephony/telnyx";
import type { VoicePostgresClient } from "../src";

const createTempSQLitePath = () =>
  join(
    tmpdir(),
    `absolutejs-voice-telnyx-events-${crypto.randomUUID()}.sqlite`,
  );

const createFakeRedisClient = (): VoiceRedisTelnyxWebhookEventClient => {
  const values = new Map<string, { expiresAt: number; value: string }>();
  const getRecord = (key: string) => {
    const record = values.get(key);
    if (!record) {
      return undefined;
    }
    if (record.expiresAt <= Date.now()) {
      values.delete(key);
      return undefined;
    }
    return record;
  };

  return {
    exists: async (key) => (getRecord(String(key)) ? 1 : 0),
    set: async (key, value, ...options) => {
      const normalizedKey = String(key);
      if (options.includes("NX") && getRecord(normalizedKey)) {
        return null;
      }
      const exIndex = options.findIndex((option) => option === "EX");
      values.set(normalizedKey, {
        expiresAt:
          exIndex >= 0
            ? Date.now() + Number(options[exIndex + 1]) * 1000
            : Infinity,
        value: String(value),
      });
      return "OK";
    },
  };
};

const createFakePostgresClient = (): VoicePostgresClient => {
  const tables = new Map<
    string,
    Map<
      string,
      { createdAt: number; eventId: string; expiresAt: number | null }
    >
  >();
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
  const getTable = (query: string, keyword: "FROM" | "INTO" | "TABLE") => {
    const tableName = parseTableName(query, keyword);
    let table = tables.get(tableName);
    if (!table) {
      table = new Map();
      tables.set(tableName, table);
    }
    return table;
  };

  return {
    unsafe: async (query, parameters = []) => {
      const normalized = query.replace(/\s+/g, " ").trim().toUpperCase();
      if (
        normalized.startsWith("CREATE SCHEMA IF NOT EXISTS") ||
        normalized.startsWith("CREATE TABLE IF NOT EXISTS")
      ) {
        if (normalized.startsWith("CREATE TABLE IF NOT EXISTS")) {
          getTable(query, "TABLE");
        }
        return [];
      }
      if (normalized.startsWith("DELETE FROM")) {
        const table = getTable(query, "FROM");
        const now = Number(parameters[0]);
        for (const [eventId, row] of table) {
          if (row.expiresAt !== null && row.expiresAt <= now) {
            table.delete(eventId);
          }
        }
        return [];
      }
      if (normalized.startsWith("SELECT EVENT_ID FROM")) {
        const table = getTable(query, "FROM");
        const eventId = String(parameters[0]);
        const now = Number(parameters[1]);
        const row = table.get(eventId);
        return row && (row.expiresAt === null || row.expiresAt > now)
          ? [{ event_id: eventId }]
          : [];
      }
      if (normalized.startsWith("INSERT INTO")) {
        const table = getTable(query, "INTO");
        const eventId = String(parameters[0]);
        const row = {
          createdAt: Number(parameters[1]),
          eventId,
          expiresAt:
            typeof parameters[2] === "number" ? Number(parameters[2]) : null,
        };
        if (normalized.includes("DO NOTHING")) {
          if (table.has(eventId)) {
            return [];
          }
          table.set(eventId, row);
          return [{ event_id: eventId }];
        }
        table.set(eventId, row);
        return [];
      }
      throw new Error(`Unsupported fake postgres query: ${query}`);
    },
  };
};

const createSignedTelnyxRequestParts = async (body: string) => {
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);
  const publicKey = Buffer.from(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  ).toString("base64");
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const signature = Buffer.from(
    await crypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(`${timestamp}|${body}`),
    ),
  ).toString("base64");

  return {
    headers: new Headers({
      "telnyx-signature-ed25519": signature,
      "telnyx-timestamp": timestamp,
    }),
    publicKey,
  };
};

test("createTelnyxVoiceResponse emits TeXML stream response", () => {
  const xml = createTelnyxVoiceResponse({
    codec: "PCMU",
    streamName: "absolute-voice",
    streamUrl: "wss://voice.example.test/telnyx/stream",
    track: "both_tracks",
  });

  expect(xml).toContain("<Response>");
  expect(xml).toContain("<Stream");
  expect(xml).toContain("wss://voice.example.test/telnyx/stream");
  expect(xml).toContain("both_tracks");
  expect(xml).toContain("PCMU");
});

test("createTelnyxVoiceRoutes exposes TeXML and webhook outcome routes", async () => {
  const decisions: Array<{ action: string; provider?: string }> = [];
  const routes = createTelnyxVoiceRoutes({
    texml: {
      path: "/voice/telnyx",
      streamUrl: "wss://voice.example.test/voice/telnyx/stream",
    },
    webhook: {
      onDecision: ({ decision, event }) => {
        decisions.push({
          action: decision.action,
          provider: event.provider,
        });
      },
      path: "/voice/telnyx/webhook",
      policy: {
        statusMap: {
          "call.hangup": {
            action: "no-answer",
            disposition: "no-answer",
            source: "status",
          },
        },
      },
    },
  });

  const texml = await routes.handle(
    new Request("https://voice.example.test/voice/telnyx"),
  );
  const xml = await texml.text();
  expect(texml.headers.get("content-type")).toContain("text/xml");
  expect(xml).toContain("wss://voice.example.test/voice/telnyx/stream");

  const webhook = await routes.handle(
    new Request("https://voice.example.test/voice/telnyx/webhook", {
      body: JSON.stringify({
        data: {
          event_type: "call.hangup",
          id: "event-1",
          payload: {
            call_control_id: "call-control-1",
            call_session_id: "session-1",
            hangup_cause: "busy",
            sip_hangup_cause: 486,
          },
          record_type: "event",
        },
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }),
  );
  const body = await webhook.json();

  expect(body).toMatchObject({
    decision: {
      action: "no-answer",
      disposition: "no-answer",
    },
    event: {
      provider: "telnyx",
    },
    sessionId: "session-1",
  });
  expect(decisions).toEqual([
    {
      action: "no-answer",
      provider: "telnyx",
    },
  ]);
});

test("Telnyx webhook verifier rejects replayed event ids before side effects", async () => {
  const body = JSON.stringify({
    data: {
      event_type: "call.hangup",
      id: "event-replay",
      payload: {
        call_control_id: "call-control-replay",
        call_session_id: "session-replay",
      },
    },
  });
  const { headers, publicKey } = await createSignedTelnyxRequestParts(body);
  const verifier = createVoiceTelnyxWebhookVerifier({
    eventStore: createMemoryVoiceTelnyxWebhookEventStore(),
    publicKey,
  });

  await expect(
    verifier({
      headers,
      rawBody: body,
    }),
  ).resolves.toEqual({ ok: true });
  await expect(
    verifier({
      headers,
      rawBody: body,
    }),
  ).resolves.toEqual({
    ok: false,
    reason: "invalid-signature",
  });
});

test("SQLite Telnyx webhook event store persists replay claims across instances", async () => {
  const path = createTempSQLitePath();
  const firstStore = createVoiceSQLiteTelnyxWebhookEventStore({
    path,
    ttlSeconds: 60,
  });
  const secondStore = createVoiceSQLiteTelnyxWebhookEventStore({
    path,
    ttlSeconds: 60,
  });

  expect(await firstStore.claim?.("sqlite-event")).toBe(true);
  expect(await secondStore.has("sqlite-event")).toBe(true);
  expect(await secondStore.claim?.("sqlite-event")).toBe(false);
});

test("Postgres Telnyx webhook event store atomically claims event ids", async () => {
  const sql = createFakePostgresClient();
  const firstStore = createVoicePostgresTelnyxWebhookEventStore({
    sql,
    ttlSeconds: 60,
  });
  const secondStore = createVoicePostgresTelnyxWebhookEventStore({
    sql,
    ttlSeconds: 60,
  });

  expect(await firstStore.claim?.("postgres-event")).toBe(true);
  await expect(secondStore.has("postgres-event")).resolves.toBe(true);
  expect(await secondStore.claim?.("postgres-event")).toBe(false);
});

test("Redis Telnyx webhook event store uses SET NX for replay claims", async () => {
  const client = createFakeRedisClient();
  const firstStore = createVoiceRedisTelnyxWebhookEventStore({
    client,
    keyPrefix: "test:telnyx",
    ttlSeconds: 60,
  });
  const secondStore = createVoiceRedisTelnyxWebhookEventStore({
    client,
    keyPrefix: "test:telnyx",
    ttlSeconds: 60,
  });

  expect(await firstStore.claim?.("redis-event")).toBe(true);
  await expect(secondStore.has("redis-event")).resolves.toBe(true);
  expect(await secondStore.claim?.("redis-event")).toBe(false);
});

test("createTelnyxVoiceRoutes rejects replayed event ids before webhook decisions", async () => {
  const body = JSON.stringify({
    data: {
      event_type: "call.hangup",
      id: "route-event-replay",
      payload: {
        call_control_id: "route-call-control",
        call_session_id: "route-session",
      },
    },
  });
  const { headers, publicKey } = await createSignedTelnyxRequestParts(body);
  let decisions = 0;
  const routes = createTelnyxVoiceRoutes({
    webhook: {
      eventStore: createMemoryVoiceTelnyxWebhookEventStore(),
      onDecision: () => {
        decisions += 1;
      },
      path: "/voice/telnyx/webhook",
      publicKey,
    },
  });
  const createRequest = () =>
    new Request("https://voice.example.test/voice/telnyx/webhook", {
      body,
      headers: new Headers({
        "content-type": "application/json",
        "telnyx-signature-ed25519":
          headers.get("telnyx-signature-ed25519") ?? "",
        "telnyx-timestamp": headers.get("telnyx-timestamp") ?? "",
      }),
      method: "POST",
    });

  expect((await routes.handle(createRequest())).status).toBe(200);
  expect(decisions).toBe(1);
  expect((await routes.handle(createRequest())).status).toBe(401);
  expect(decisions).toBe(1);
});

test("createTelnyxVoiceRoutes exposes setup and smoke reports that satisfy the shared contract", async () => {
  const routes = createTelnyxVoiceRoutes({
    setup: {
      path: "/voice/telnyx/setup",
      requiredEnv: {
        TELNYX_PUBLIC_KEY: "present",
      },
    },
    smoke: {
      path: "/voice/telnyx/smoke",
      title: "Demo Telnyx smoke",
    },
    texml: {
      path: "/voice/telnyx",
      streamUrl: "wss://voice.example.test/voice/telnyx/stream",
    },
    webhook: {
      path: "/voice/telnyx/webhook",
      verify: () => ({ ok: true }),
    },
  });

  const setupResponse = await routes.handle(
    new Request("https://voice.example.test/voice/telnyx/setup"),
  );
  const setup = await setupResponse.json();
  expect(setup).toMatchObject({
    provider: "telnyx",
    ready: true,
    signing: {
      configured: true,
      mode: "custom",
    },
    urls: {
      stream: "wss://voice.example.test/voice/telnyx/stream",
      texml: "https://voice.example.test/voice/telnyx",
      webhook: "https://voice.example.test/voice/telnyx/webhook",
    },
  });

  const smokeResponse = await routes.handle(
    new Request("https://voice.example.test/voice/telnyx/smoke"),
  );
  const smoke = await smokeResponse.json();
  expect(smoke).toMatchObject({
    contract: {
      pass: true,
      provider: "telnyx",
    },
    pass: true,
    provider: "telnyx",
    texml: {
      status: 200,
      streamUrl: "wss://voice.example.test/voice/telnyx/stream",
    },
    webhook: {
      status: 200,
    },
  });

  const html = await routes.handle(
    new Request("https://voice.example.test/voice/telnyx/smoke?format=html"),
  );
  const text = await html.text();
  expect(html.headers.get("content-type")).toContain("text/html");
  expect(text).toContain("Demo Telnyx smoke");
  expect(text).toContain("Pass");
});
