import { expect, test } from "bun:test";
import { buildVoiceOpsTaskFromReview } from "../src/ops";
import { createVoiceIntegrationHTTPSink } from "../src/opsSinks";
import {
  createVoiceCallReviewFromSession,
  recordVoiceRuntimeOps,
} from "../src/runtimeOps";
import { createVoiceSessionRecord } from "../src/store";
import type {
  StoredVoiceCallReviewArtifact,
  StoredVoiceIntegrationEvent,
  StoredVoiceOpsTask,
} from "../src";
import type { VoiceSessionHandle, VoiceSessionRecord } from "../src/types";

const createStore = <T extends { id: string }>() => {
  const values = new Map<string, T>();

  return {
    get: (id: string) => values.get(id),
    list: () => [...values.values()],
    remove: (id: string) => {
      values.delete(id);
    },
    set: (id: string, value: T) => {
      values.set(id, value);
    },
  };
};

const createFakeHandle = () =>
  ({
    close: async () => {},
    commitTurn: async () => {},
    complete: async () => {},
    connect: async () => {},
    disconnect: async () => {},
    escalate: async () => {},
    fail: async () => {},
    id: "session-1",
    markNoAnswer: async () => {},
    markVoicemail: async () => {},
    receiveAudio: async () => {},
    snapshot: async () => createVoiceSessionRecord("session-1"),
    transfer: async () => {},
  }) as VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>;

test("createVoiceCallReviewFromSession derives a portable review artifact", () => {
  const session = createVoiceSessionRecord("session-review", "demo-scenario");
  session.lastActivityAt = session.createdAt + 1_250;
  session.turns.push({
    committedAt: session.createdAt + 400,
    id: "turn-1",
    text: "Please transfer me to billing.",
    transcripts: [],
  });
  session.call = {
    disposition: "transferred",
    endedAt: session.createdAt + 1_250,
    events: [
      {
        at: session.createdAt,
        type: "start",
      },
      {
        at: session.createdAt + 800,
        target: "billing",
        type: "transfer",
      },
      {
        at: session.createdAt + 1_250,
        disposition: "transferred",
        target: "billing",
        type: "end",
      },
    ],
    lastEventAt: session.createdAt + 1_250,
    startedAt: session.createdAt,
  };

  const review = createVoiceCallReviewFromSession({
    disposition: "transferred",
    session,
    target: "billing",
  });

  expect(review.summary.outcome).toBe("transferred");
  expect(review.summary.turnCount).toBe(1);
  expect(review.transcript.actual).toContain("billing");
  expect(review.postCall?.recommendedAction).toContain("billing");
  expect(review.timeline).toHaveLength(3);
});

test("recordVoiceRuntimeOps persists reviews, tasks, and integration events", async () => {
  const session = createVoiceSessionRecord("session-1", "voice-demo");
  session.status = "completed";
  session.lastActivityAt = session.createdAt + 2_000;
  session.turns.push({
    assistantText: "Transferring you now.",
    committedAt: session.createdAt + 500,
    id: "turn-1",
    result: {
      queue: "billing",
    },
    text: "Please transfer me to billing.",
    transcripts: [],
  });
  session.call = {
    disposition: "transferred",
    endedAt: session.createdAt + 2_000,
    events: [
      {
        at: session.createdAt,
        type: "start",
      },
      {
        at: session.createdAt + 1_000,
        reason: "billing-request",
        target: "billing",
        type: "transfer",
      },
      {
        at: session.createdAt + 2_000,
        disposition: "transferred",
        target: "billing",
        type: "end",
      },
    ],
    lastEventAt: session.createdAt + 2_000,
    startedAt: session.createdAt,
  };

  const reviews = createStore<StoredVoiceCallReviewArtifact>();
  const tasks = createStore<StoredVoiceOpsTask>();
  const events = createStore<StoredVoiceIntegrationEvent>();
  const emitted: string[] = [];

  await recordVoiceRuntimeOps({
    api: createFakeHandle(),
    config: {
      events,
      onEvent: ({ event }) => {
        emitted.push(event.type);
      },
      reviews,
      tasks,
    },
    context: {
      channel: "pstn",
    },
    disposition: "transferred",
    reason: "billing-request",
    session,
    target: "billing",
  });

  const savedReview = reviews.list()[0];
  const savedTask = tasks.list()[0];

  expect(savedReview?.summary.outcome).toBe("transferred");
  expect(savedReview?.id).toBe("session-1:review");
  expect(savedTask?.id).toBe("session-1:review:ops");
  expect(savedTask?.kind).toBe("transfer-check");
  expect(events.list().map((event) => event.type)).toEqual([
    "review.saved",
    "task.created",
    "call.completed",
  ]);
  expect(emitted).toEqual(["review.saved", "task.created", "call.completed"]);
});

test("recordVoiceRuntimeOps delivers events through the built-in webhook config", async () => {
  const session = createVoiceSessionRecord("session-webhook-runtime");
  session.status = "completed";
  session.lastActivityAt = session.createdAt + 1_500;
  session.turns.push({
    committedAt: session.createdAt + 500,
    id: "turn-1",
    text: "Thanks, that solved it.",
    transcripts: [],
  });

  const events = createStore<StoredVoiceIntegrationEvent>();
  const deliveredStatuses: Array<string | undefined> = [];
  let webhookPosts = 0;

  await recordVoiceRuntimeOps({
    api: createFakeHandle(),
    config: {
      events,
      onEvent: ({ event }) => {
        deliveredStatuses.push(event.deliveryStatus);
      },
      webhook: {
        fetch: async () => {
          webhookPosts += 1;
          return new Response(null, {
            status: 200,
          });
        },
        url: "https://example.test/hooks/runtime",
      },
    },
    context: {},
    disposition: "completed",
    session,
  });

  expect(webhookPosts).toBe(2);
  expect(events.list().map((event) => event.deliveryStatus)).toEqual([
    "delivered",
    "delivered",
  ]);
  expect(
    events
      .list()
      .every(
        (event) => event.deliveredTo === "https://example.test/hooks/runtime",
      ),
  ).toBe(true);
  expect(deliveredStatuses).toEqual(["delivered", "delivered"]);
});

test("recordVoiceRuntimeOps fans out integration events through configured sinks", async () => {
  const session = createVoiceSessionRecord("session-sinks-runtime");
  session.status = "completed";
  session.lastActivityAt = session.createdAt + 1_000;
  session.turns.push({
    committedAt: session.createdAt + 300,
    id: "turn-1",
    text: "That solved it.",
    transcripts: [],
  });

  const events = createStore<StoredVoiceIntegrationEvent>();
  const sinkBodies: Array<Record<string, unknown>> = [];
  const sinkStatuses: Array<string | undefined> = [];

  await recordVoiceRuntimeOps({
    api: createFakeHandle(),
    config: {
      events,
      onEvent: ({ event }) => {
        sinkStatuses.push(event.sinkDeliveries?.crm?.status);
      },
      sinks: [
        createVoiceIntegrationHTTPSink({
          body: ({ event }) => ({
            eventId: event.id,
            type: event.type,
          }),
          fetch: async (_url, init) => {
            sinkBodies.push(JSON.parse(String(init?.body ?? "{}")));
            return new Response(null, {
              status: 200,
            });
          },
          id: "crm",
          kind: "crm-activity",
          url: "https://example.test/sinks/crm",
        }),
      ],
    },
    context: {},
    disposition: "completed",
    session,
  });

  expect(sinkBodies).toEqual([
    {
      eventId: "session-sinks-runtime:review:review.saved",
      type: "review.saved",
    },
    {
      eventId: "session-sinks-runtime:call.completed",
      type: "call.completed",
    },
  ]);
  expect(
    events
      .list()
      .every(
        (event) =>
          event.deliveryStatus === "delivered" &&
          event.sinkDeliveries?.crm?.status === "delivered",
      ),
  ).toBe(true);
  expect(sinkStatuses).toEqual(["delivered", "delivered"]);
});

test("recordVoiceRuntimeOps respects custom review and task builders", async () => {
  const session = createVoiceSessionRecord("session-custom");
  session.status = "completed";
  session.lastActivityAt = session.createdAt + 900;
  session.turns.push({
    committedAt: session.createdAt + 300,
    id: "turn-1",
    text: "Escalate this call.",
    transcripts: [],
  });

  const reviews = createStore<StoredVoiceCallReviewArtifact>();
  const tasks = createStore<StoredVoiceOpsTask>();

  await recordVoiceRuntimeOps({
    api: createFakeHandle(),
    config: {
      buildReview: ({ disposition }) => ({
        errors: [],
        generatedAt: 123,
        latencyBreakdown: [],
        notes: ["custom"],
        postCall: {
          label: "Custom",
          recommendedAction: "Handle manually.",
          summary: "Custom review builder.",
        },
        summary: {
          outcome: disposition,
          pass: true,
          turnCount: 1,
        },
        title: "Custom Review",
        timeline: [],
        transcript: {
          actual: "Escalate this call.",
        },
      }),
      createTaskFromReview: ({ review }) => {
        const task = buildVoiceOpsTaskFromReview(review);
        return task
          ? {
              ...task,
              title: "Custom Task Title",
            }
          : undefined;
      },
      reviews,
      tasks,
    },
    context: {},
    disposition: "failed",
    reason: "human-review",
    session,
  });

  expect(reviews.list()[0]?.title).toBe("Custom Review");
  expect(tasks.list()[0]?.title).toBe("Custom Task Title");
});

test("recordVoiceRuntimeOps applies configured task policies", async () => {
  const session = createVoiceSessionRecord("session-policy");
  session.status = "completed";
  session.lastActivityAt = session.createdAt + 900;
  session.turns.push({
    committedAt: session.createdAt + 300,
    id: "turn-1",
    text: "Please call me back later.",
    transcripts: [],
  });

  const tasks = createStore<StoredVoiceOpsTask>();

  await recordVoiceRuntimeOps({
    api: createFakeHandle(),
    config: {
      buildReview: ({ disposition }) => ({
        errors: [],
        generatedAt: 1_000,
        latencyBreakdown: [],
        notes: [],
        postCall: {
          label: "Voicemail",
          recommendedAction: "Call back.",
          summary: "Left voicemail.",
        },
        summary: {
          outcome: disposition,
          pass: true,
          turnCount: 1,
        },
        title: "Policy Review",
        timeline: [],
        transcript: {
          actual: "Please call me back later.",
        },
      }),
      taskPolicies: {
        voicemail: {
          assignee: "callbacks",
          dueInMs: 5 * 60_000,
          name: "custom-voicemail-fast-lane",
          priority: "urgent",
        },
      },
      tasks,
    },
    context: {},
    disposition: "voicemail",
    session,
  });

  const task = tasks.list()[0];
  expect(task?.assignee).toBe("callbacks");
  expect(task?.priority).toBe("urgent");
  expect(task?.policyName).toBe("custom-voicemail-fast-lane");
  expect(task?.dueAt).toBe(1_000 + 5 * 60_000);
  expect(task?.history.at(-1)?.type).toBe("policy-applied");
});

test("recordVoiceRuntimeOps applies configured task assignment rules after policy", async () => {
  const session = createVoiceSessionRecord("session-assignment");
  session.status = "completed";
  session.lastActivityAt = session.createdAt + 900;
  session.turns.push({
    committedAt: session.createdAt + 300,
    id: "turn-1",
    text: "Please call me back now.",
    transcripts: [],
  });

  const tasks = createStore<StoredVoiceOpsTask>();

  await recordVoiceRuntimeOps({
    api: createFakeHandle(),
    config: {
      buildReview: ({ disposition }) => ({
        errors: [],
        generatedAt: 1_000,
        latencyBreakdown: [],
        notes: [],
        postCall: {
          label: "Voicemail",
          recommendedAction: "Call back.",
          summary: "Left voicemail.",
        },
        summary: {
          outcome: disposition,
          pass: true,
          turnCount: 1,
        },
        title: "Assignment Review",
        timeline: [],
        transcript: {
          actual: "Please call me back now.",
        },
      }),
      taskAssignmentRules: [
        {
          assign: "priority-callbacks",
          name: "priority-callback-routing",
          queue: "priority-callbacks",
          when: {
            kind: "callback",
            priority: "high",
          },
        },
      ],
      taskPolicies: {
        voicemail: {
          assignee: "callbacks",
          name: "voicemail-fast-lane",
          priority: "high",
          queue: "callbacks",
        },
      },
      tasks,
    },
    context: {},
    disposition: "voicemail",
    session,
  });

  const task = tasks.list()[0];
  expect(task?.policyName).toBe("voicemail-fast-lane");
  expect(task?.assignee).toBe("priority-callbacks");
  expect(task?.queue).toBe("priority-callbacks");
  expect(task?.history.at(-1)?.type).toBe("assigned");
});
