import { expect, test } from "bun:test";
import {
  createStoredVoiceCallReviewArtifact,
  resolveVoiceOutcomeRecipe,
} from "../src";

const createReview = (
  outcome: Parameters<
    typeof createStoredVoiceCallReviewArtifact
  >[1]["summary"]["outcome"],
) =>
  createStoredVoiceCallReviewArtifact(`review-${outcome}`, {
    errors: [],
    generatedAt: 100,
    latencyBreakdown: [],
    notes: [],
    postCall: {
      recommendedAction: "Follow up from recipe.",
      summary: `Call ended as ${outcome}.`,
      target: "customer-1",
    },
    summary: {
      outcome,
      pass: outcome !== "failed",
      turnCount: 2,
    },
    title: `Review ${outcome}`,
    timeline: [],
    transcript: {
      actual: "caller wants help",
    },
  });

test("appointment booking recipe creates confirmation work for completed calls", async () => {
  const recipe = resolveVoiceOutcomeRecipe("appointment-booking", {
    assignee: "front-desk",
    queue: "appointments-east",
  });
  const task = await recipe.createTaskFromReview?.({
    api: {} as never,
    context: undefined,
    disposition: "completed",
    review: createReview("completed"),
    session: {} as never,
  });

  expect(recipe.taskPolicies?.completed).toMatchObject({
    assignee: "front-desk",
    name: "appointment-booking-completed",
    queue: "appointments-east",
  });
  expect(task).toMatchObject({
    assignee: "front-desk",
    kind: "appointment-booking",
    priority: "normal",
    queue: "appointments-east",
    recommendedAction:
      "Verify appointment details, confirm calendar state, and send any required confirmation.",
    title: "Confirm booked appointment: customer-1",
  });
});

test("lead qualification recipe creates sales follow-up and urgent escalations", async () => {
  const recipe = resolveVoiceOutcomeRecipe("lead-qualification", {
    escalationAssignee: "sales-manager",
    escalationQueue: "sales-hot",
    queue: "sales-qualified",
  });
  const completed = await recipe.createTaskFromReview?.({
    api: {} as never,
    context: undefined,
    disposition: "completed",
    review: createReview("completed"),
    session: {} as never,
  });
  const escalated = await recipe.createTaskFromReview?.({
    api: {} as never,
    context: undefined,
    disposition: "escalated",
    review: createReview("escalated"),
    session: {} as never,
  });

  expect(completed).toMatchObject({
    kind: "lead-qualification",
    priority: "high",
    queue: "sales-qualified",
  });
  expect(escalated).toMatchObject({
    assignee: "sales-manager",
    kind: "escalation",
    priority: "urgent",
    queue: "sales-hot",
  });
  expect(recipe.taskAssignmentRules?.[0]).toMatchObject({
    assign: "sales-manager",
    queue: "sales-hot",
    when: {
      priority: "urgent",
    },
  });
});

test("voicemail callback and warm transfer recipes focus task creation on their surfaces", async () => {
  const voicemail = resolveVoiceOutcomeRecipe("voicemail-callback");
  const completedCallback = await voicemail.createTaskFromReview?.({
    api: {} as never,
    context: undefined,
    disposition: "completed",
    review: createReview("completed"),
    session: {} as never,
  });
  const voicemailTask = await voicemail.createTaskFromReview?.({
    api: {} as never,
    context: undefined,
    disposition: "voicemail",
    review: createReview("voicemail"),
    session: {} as never,
  });
  const transfer = resolveVoiceOutcomeRecipe("warm-transfer", {
    queue: "handoff-checks",
  });
  const transferTask = await transfer.createTaskFromReview?.({
    api: {} as never,
    context: undefined,
    disposition: "transferred",
    review: createReview("transferred"),
    session: {} as never,
  });

  expect(completedCallback).toBeNull();
  expect(voicemailTask).toMatchObject({
    kind: "callback",
    queue: "callbacks",
  });
  expect(transferTask).toMatchObject({
    kind: "transfer-check",
    queue: "handoff-checks",
    title: "Verify transfer to customer-1",
  });
});
