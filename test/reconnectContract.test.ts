import { expect, test } from "bun:test";
import {
  buildVoiceReconnectProofReport,
  createVoiceReconnectContractRoutes,
  createVoiceReconnectProofRoutes,
  renderVoiceReconnectContractHTML,
  summarizeVoiceReconnectProofSessions,
  summarizeVoiceReconnectContractSnapshots,
  runVoiceReconnectContract,
} from "../src/reconnectContract";
import { createVoiceSessionRecord } from "../src/store";

test("runVoiceReconnectContract passes resumed reconnect with replay-safe turns", () => {
  const report = runVoiceReconnectContract({
    snapshots: [
      {
        at: 100,
        reconnect: {
          attempts: 1,
          lastDisconnectAt: 100,
          maxAttempts: 10,
          nextAttemptAt: 600,
          status: "reconnecting",
        },
        turnIds: ["turn-1"],
      },
      {
        at: 700,
        reconnect: {
          attempts: 1,
          lastResumedAt: 700,
          maxAttempts: 10,
          status: "resumed",
        },
        turnIds: ["turn-1", "turn-2"],
      },
    ],
  });

  expect(report.pass).toBe(true);
  expect(report.summary).toMatchObject({
    attempts: 1,
    duplicateTurnIds: [],
    reconnected: true,
    resumed: true,
  });
});

test("runVoiceReconnectContract fails missing resume and duplicate replayed turns", () => {
  const report = runVoiceReconnectContract({
    snapshots: [
      {
        at: 100,
        reconnect: {
          attempts: 1,
          lastDisconnectAt: 100,
          maxAttempts: 1,
          nextAttemptAt: 600,
          status: "reconnecting",
        },
        turnIds: ["turn-1", "turn-1"],
      },
      {
        at: 700,
        reconnect: {
          attempts: 1,
          maxAttempts: 1,
          status: "exhausted",
        },
        turnIds: ["turn-1", "turn-1"],
      },
    ],
  });

  expect(report.pass).toBe(false);
  expect(report.issues.map((issue) => issue.code)).toEqual([
    "reconnect.exhausted_before_resume",
    "reconnect.duplicate_turn_ids",
  ]);
});

test("createVoiceReconnectContractRoutes exposes json and html reports", async () => {
  const routes = createVoiceReconnectContractRoutes({
    getSnapshots: () => [
      {
        at: 100,
        reconnect: {
          attempts: 1,
          maxAttempts: 10,
          status: "reconnecting",
        },
      },
      {
        at: 200,
        reconnect: {
          attempts: 1,
          maxAttempts: 10,
          status: "resumed",
        },
      },
    ],
  });

  const json = await routes.handle(
    new Request("http://localhost/api/voice/reconnect-contract"),
  );
  const jsonReport = await json.json();
  expect(json.headers.get("content-type")).toContain("application/json");
  expect(jsonReport).toMatchObject({
    pass: true,
    summary: {
      reconnected: true,
      resumed: true,
    },
  });

  const html = await routes.handle(
    new Request("http://localhost/voice/reconnect-contract"),
  );
  const body = await html.text();
  expect(html.headers.get("content-type")).toContain("text/html");
  expect(body).toContain("Voice reconnect contract");
  expect(renderVoiceReconnectContractHTML(jsonReport).length).toBeGreaterThan(
    100,
  );
});

test("summarizeVoiceReconnectContractSnapshots builds snapshots from client traces", () => {
  const snapshots = summarizeVoiceReconnectContractSnapshots([
    {
      at: 100,
      id: "trace-1",
      payload: {
        at: 100,
        reconnect: {
          attempts: 1,
          lastDisconnectAt: 100,
          maxAttempts: 10,
          nextAttemptAt: 600,
          status: "reconnecting",
        },
        turnIds: ["turn-1"],
      },
      sessionId: "session-1",
      type: "client.reconnect",
    },
    {
      at: 700,
      id: "trace-2",
      payload: {
        at: 700,
        reconnect: {
          attempts: 1,
          lastResumedAt: 700,
          maxAttempts: 10,
          status: "resumed",
        },
        turnIds: ["turn-1", "turn-2"],
      },
      sessionId: "session-1",
      type: "client.reconnect",
    },
  ]);

  expect(snapshots).toMatchObject([
    {
      reconnect: {
        status: "reconnecting",
      },
      turnIds: ["turn-1"],
    },
    {
      reconnect: {
        status: "resumed",
      },
      turnIds: ["turn-1", "turn-2"],
    },
  ]);
  expect(runVoiceReconnectContract({ snapshots }).pass).toBe(true);
});

test("buildVoiceReconnectProofReport passes for reconnect-aware apps without forced reconnect traffic", () => {
  const report = buildVoiceReconnectProofReport({
    completedSessionCount: 2,
  });

  expect(report).toMatchObject({
    ok: true,
    reconnectAware: true,
    sessionCount: 2,
    snapshotCount: 0,
    status: "pass",
  });
  expect(report.contract.pass).toBe(true);
  expect(report.summary).toContain("Reconnect proof is enabled");
});

test("buildVoiceReconnectProofReport can require observed reconnect resume", () => {
  const session = createVoiceSessionRecord("session-1");
  session.status = "completed";
  session.lastActivityAt = 700;
  session.reconnect = {
    attempts: 1,
    lastDisconnectAt: 100,
  };
  session.committedTurnIds = ["turn-1", "turn-2"];

  const snapshots = summarizeVoiceReconnectProofSessions([session], {
    maxAttempts: 3,
  });
  const report = buildVoiceReconnectProofReport({
    requireObservedReconnect: true,
    sessions: [session],
  });

  expect(snapshots).toMatchObject([
    {
      reconnect: {
        attempts: 1,
        maxAttempts: 3,
        status: "resumed",
      },
      turnIds: ["turn-1", "turn-2"],
    },
  ]);
  expect(report).toMatchObject({
    ok: false,
    status: "fail",
  });
  expect(report.contract.issues.map((issue) => issue.code)).toContain(
    "reconnect.not_observed",
  );

  const strictReport = buildVoiceReconnectProofReport({
    requireObservedReconnect: true,
    snapshots: [
      {
        at: 100,
        reconnect: {
          attempts: 1,
          lastDisconnectAt: 100,
          maxAttempts: 3,
          status: "reconnecting",
        },
        turnIds: ["turn-1"],
      },
      ...snapshots,
    ],
    sessions: [session],
  });

  expect(strictReport).toMatchObject({
    ok: true,
    status: "pass",
  });
});

test("createVoiceReconnectProofRoutes exposes get and post proof reports", async () => {
  const routes = createVoiceReconnectProofRoutes({
    getCompletedSessionCount: () => 1,
  });

  const postResponse = await routes.handle(
    new Request("http://localhost/api/voice/reconnect-proof", {
      body: JSON.stringify({
        at: 100,
        reconnect: {
          attempts: 1,
          maxAttempts: 3,
          status: "reconnecting",
        },
        turnIds: ["turn-1"],
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );
  const postReport = await postResponse.json();
  expect(postReport).toMatchObject({
    ok: true,
    reconnectAware: true,
    snapshotCount: 1,
  });

  await routes.handle(
    new Request("http://localhost/api/voice/reconnect-proof", {
      body: JSON.stringify({
        at: 200,
        reconnect: {
          attempts: 1,
          lastResumedAt: 200,
          maxAttempts: 3,
          status: "resumed",
        },
        turnIds: ["turn-1", "turn-2"],
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );

  const getResponse = await routes.handle(
    new Request("http://localhost/api/voice/reconnect-proof"),
  );
  const getReport = await getResponse.json();

  expect(getResponse.headers.get("content-type")).toContain("application/json");

  expect(getReport).toMatchObject({
    ok: true,
    sessionCount: 1,
    snapshotCount: 2,
    status: "pass",
    contract: {
      summary: {
        reconnected: true,
        resumed: true,
      },
    },
  });
});
