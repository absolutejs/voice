import { expect, test } from "bun:test";
import {
  buildVoicePostCallAnalysisReport,
  createStoredVoiceCallReviewArtifact,
  createStoredVoiceIntegrationEvent,
  createStoredVoiceOpsTask,
  createVoicePostCallAnalysisRoutes,
  renderVoicePostCallAnalysisMarkdown,
} from "../src";

const review = createStoredVoiceCallReviewArtifact("session-1:review", {
  errors: [],
  generatedAt: 100,
  latencyBreakdown: [],
  notes: [],
  postCall: {
    label: "Support triage",
    recommendedAction: "Create support follow-up.",
    summary: "Caller needs billing support.",
    target: "customer-1",
  },
  summary: {
    outcome: "completed",
    pass: true,
    turnCount: 3,
  },
  title: "Support call",
  timeline: [],
  transcript: {
    actual: "I need help with my invoice.",
  },
});

const task = createStoredVoiceOpsTask("session-1:review:support-triage", {
  createdAt: 120,
  description: "Route billing issue.",
  history: [],
  intakeId: "session-1:review",
  kind: "support-triage",
  recommendedAction: "Send to billing support.",
  reviewId: "session-1:review",
  status: "open",
  title: "Review billing issue",
  updatedAt: 120,
});

const deliveredEvent = createStoredVoiceIntegrationEvent(
  "session-1:review:event",
  {
    createdAt: 130,
    deliveredAt: 140,
    deliveryStatus: "delivered",
    payload: {
      reviewId: "session-1:review",
      sessionId: "session-1",
    },
    type: "task.created",
  },
);

test("buildVoicePostCallAnalysisReport proves extraction tasks and delivery", async () => {
  const report = await buildVoicePostCallAnalysisReport({
    extractedFields: {
      category: "billing",
      customerId: "customer-1",
    },
    fields: [
      { path: "customerId" },
      { path: "category" },
      { path: "review.postCall.target", label: "Review target" },
    ],
    integrationEvents: [deliveredEvent],
    operationRecordBasePath: "/voice-operations/:sessionId",
    requiredTaskKinds: ["support-triage"],
    review,
    tasks: [task],
  });

  expect(report).toMatchObject({
    operationRecordHref: "/voice-operations/session-1",
    reviewId: "session-1:review",
    sessionId: "session-1",
    status: "pass",
    summary: {
      deliveredIntegrationEvents: 1,
      missingRequiredFields: 0,
      missingRequiredTasks: 0,
      tasks: 1,
    },
  });
  expect(report.fields.map((field) => field.path)).toEqual([
    "customerId",
    "category",
    "review.postCall.target",
  ]);
  expect(renderVoicePostCallAnalysisMarkdown(report)).toContain(
    "Operations record: /voice-operations/session-1",
  );
});

test("buildVoicePostCallAnalysisReport fails missing required analysis evidence", async () => {
  const failedEvent = createStoredVoiceIntegrationEvent(
    "session-2:review:event",
    {
      createdAt: 130,
      deliveryError: "webhook timed out",
      deliveryStatus: "failed",
      payload: {
        reviewId: "session-2:review",
        sessionId: "session-2",
      },
      type: "task.created",
    },
  );
  const report = await buildVoicePostCallAnalysisReport({
    fields: [{ path: "customerId" }],
    integrationEvents: [failedEvent],
    requireDeliveredIntegrationEvent: true,
    requiredTaskKinds: ["support-triage"],
    review: {
      ...review,
      id: "session-2:review",
    },
    tasks: [],
  });

  expect(report.status).toBe("fail");
  expect(report.issues.map((issue) => issue.code)).toEqual([
    "voice.post_call_analysis.required_field_missing",
    "voice.post_call_analysis.required_task_missing",
    "voice.post_call_analysis.integration_missing",
    "voice.post_call_analysis.integration_failed",
  ]);
});

test("createVoicePostCallAnalysisRoutes exposes JSON and Markdown proof", async () => {
  const app = createVoicePostCallAnalysisRoutes({
    fields: [{ path: "customerId" }],
    integrationEvents: [deliveredEvent],
    path: "/proof/post-call",
    requiredTaskKinds: ["support-triage"],
    reviews: [review],
    source: ({ reviewId }) => ({
      extractedFields: {
        customerId: "customer-1",
      },
      reviewId,
      tasks: [task],
    }),
  });

  const json = await app.handle(
    new Request("http://localhost/proof/post-call?reviewId=session-1:review"),
  );
  expect(json.status).toBe(200);
  expect(await json.json()).toMatchObject({
    status: "pass",
  });

  const markdown = await app.handle(
    new Request(
      "http://localhost/proof/post-call.md?reviewId=session-1:review",
    ),
  );
  expect(await markdown.text()).toContain("# Voice Post-Call Analysis");
});
