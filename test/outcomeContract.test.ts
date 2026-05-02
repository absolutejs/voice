import { expect, test } from "bun:test";
import {
  createVoiceMemoryStore,
  createVoiceOutcomeContractRoutes,
  createVoiceSessionRecord,
  evaluateVoiceOutcomeContractEvidence,
  runVoiceOutcomeContractSuite,
} from "../src";

test("runVoiceOutcomeContractSuite verifies persisted business artifacts", async () => {
  const session = createVoiceSessionRecord("session-outcome", "guided");
  session.status = "completed";
  session.call = {
    disposition: "transferred",
    events: [
      { at: 1, type: "start" },
      {
        at: 2,
        disposition: "transferred",
        reason: "caller-requested-transfer",
        target: "billing",
        type: "transfer",
      },
    ],
    lastEventAt: 2,
    startedAt: 1,
  };
  const report = await runVoiceOutcomeContractSuite({
    contracts: [
      {
        expectedDisposition: "transferred",
        id: "transfer-outcome",
        requireHandoffActions: ["transfer"],
        requireIntegrationEvents: [
          "call.completed",
          "review.saved",
          "task.created",
        ],
        requireTask: true,
      },
    ],
    events: [
      {
        createdAt: 2,
        id: "event-call",
        payload: { disposition: "transferred", sessionId: session.id },
        type: "call.completed",
      },
      {
        createdAt: 3,
        id: "event-review",
        payload: { outcome: "transferred", reviewId: "review-1" },
        type: "review.saved",
      },
      {
        createdAt: 4,
        id: "event-task",
        payload: { outcome: "transferred", taskId: "task-1" },
        type: "task.created",
      },
    ],
    handoffs: [
      {
        action: "transfer",
        context: {},
        createdAt: 2,
        deliveryStatus: "delivered",
        id: "handoff-1",
        session,
        sessionId: session.id,
        updatedAt: 3,
      },
    ],
    operationsRecordHref: "/voice-operations/:sessionId",
    reviews: [
      {
        errors: [],
        id: "review-1",
        latencyBreakdown: [],
        notes: [],
        summary: { outcome: "transferred", pass: true },
        timeline: [],
        title: "Transfer review",
        transcript: { actual: "transfer me" },
      },
    ],
    sessions: [session],
    tasks: [
      {
        createdAt: 4,
        description: "Verify transfer",
        history: [],
        id: "task-1",
        kind: "transfer-check",
        outcome: "transferred",
        recommendedAction: "Verify handoff",
        status: "open",
        title: "Verify transfer",
        updatedAt: 4,
      },
    ],
  });

  expect(report).toMatchObject({
    failed: 0,
    passed: 1,
    status: "pass",
    total: 1,
  });
  expect(report.contracts[0]?.matched).toMatchObject({
    handoffs: 1,
    integrationEvents: 3,
    reviews: 1,
    sessions: 1,
    tasks: 1,
  });
  expect(report.contracts[0]?.sessionIds).toEqual(["session-outcome"]);
  expect(report.contracts[0]?.operationsRecordHrefs).toEqual([
    "/voice-operations/session-outcome",
  ]);
});

test("createVoiceOutcomeContractRoutes reports missing artifacts", async () => {
  const store = createVoiceMemoryStore();
  const session = await store.getOrCreate("session-completed");
  session.status = "completed";
  await store.set(session.id, session);
  const routes = createVoiceOutcomeContractRoutes({
    contracts: [
      {
        expectedDisposition: "completed",
        id: "completed-review",
        requireReview: true,
      },
    ],
    htmlPath: "/outcome-contracts",
    operationsRecordHref: (sessionId) => `/ops/records/${sessionId}`,
    path: "/api/outcome-contracts",
    sessions: store,
  });
  const json = await routes.handle(
    new Request("http://localhost/api/outcome-contracts"),
  );
  const html = await routes.handle(
    new Request("http://localhost/outcome-contracts"),
  );

  expect(json.status).toBe(200);
  await expect(json.json()).resolves.toMatchObject({
    contracts: [
      {
        operationsRecordHrefs: ["/ops/records/session-completed"],
        sessionIds: ["session-completed"],
      },
    ],
    failed: 1,
    status: "fail",
  });
  const htmlText = await html.text();
  expect(htmlText).toContain("Expected at least one matching review");
  expect(htmlText).toContain("/ops/records/session-completed");
});

test("evaluateVoiceOutcomeContractEvidence accepts complete outcome proof", () => {
  const report = evaluateVoiceOutcomeContractEvidence(
    {
      checkedAt: 1,
      contracts: [
        {
          contractId: "transfer-outcome",
          issues: [],
          matched: {
            handoffs: 1,
            integrationEvents: 3,
            reviews: 1,
            sessions: 1,
            tasks: 1,
          },
          operationsRecordHrefs: ["/voice-operations/session-outcome"],
          pass: true,
          sessionIds: ["session-outcome"],
        },
      ],
      failed: 0,
      passed: 1,
      status: "pass",
      total: 1,
    },
    {
      maxFailed: 0,
      maxIssues: 0,
      minContracts: 1,
      minHandoffs: 1,
      minIntegrationEvents: 3,
      minOperationsRecordHrefs: 1,
      minReviews: 1,
      minSessions: 1,
      minTasks: 1,
      requiredContractIds: ["transfer-outcome"],
      requireOperationRecordHrefs: true,
    },
  );

  expect(report.ok).toBe(true);
  expect(report.sessions).toBe(1);
  expect(report.integrationEvents).toBe(3);
});

test("evaluateVoiceOutcomeContractEvidence reports missing outcome proof", () => {
  const report = evaluateVoiceOutcomeContractEvidence(
    {
      checkedAt: 1,
      contracts: [
        {
          contractId: "completed-review",
          issues: [
            { code: "outcome.review_missing", message: "missing review" },
          ],
          matched: {
            handoffs: 0,
            integrationEvents: 0,
            reviews: 0,
            sessions: 1,
            tasks: 0,
          },
          operationsRecordHrefs: [],
          pass: false,
          sessionIds: ["session-completed"],
        },
      ],
      failed: 1,
      passed: 0,
      status: "fail",
      total: 1,
    },
    {
      maxFailed: 0,
      maxIssues: 0,
      minHandoffs: 1,
      minIntegrationEvents: 1,
      minOperationsRecordHrefs: 1,
      minReviews: 1,
      minTasks: 1,
      requiredContractIds: ["transfer-outcome"],
      requireOperationRecordHrefs: true,
    },
  );

  expect(report.ok).toBe(false);
  expect(report.issues).toEqual(
    expect.arrayContaining([
      "Expected at most 0 failing outcome contract(s), found 1.",
      "Expected at most 0 outcome contract issue(s), found 1.",
      "Expected at least 1 matched outcome review(s), found 0.",
      "Expected at least 1 matched outcome task(s), found 0.",
      "Expected at least 1 matched outcome handoff(s), found 0.",
      "Expected at least 1 matched outcome integration event(s), found 0.",
      "Expected at least 1 outcome operations record href(s), found 0.",
      "Expected every outcome contract to include operations record hrefs; 1 contract(s) missing.",
      "Missing outcome contract: transfer-outcome.",
    ]),
  );
});
