import { expect, test } from "bun:test";
import {
  createVoiceHandoffDeliveryWorker,
  createVoiceMemoryHandoffDeliveryStore,
  createVoiceMemoryStore,
  createVoiceSession,
  createVoiceTwilioRedirectHandoffAdapter,
  createVoiceWebhookHandoffAdapter,
  summarizeVoiceHandoffDeliveries,
} from "../src";
import { createVoiceMemoryTraceEventStore } from "../src/trace";
import type {
  AudioChunk,
  STTAdapter,
  STTAdapterOpenOptions,
  STTAdapterSession,
  STTSessionEventMap,
  VoiceSocket,
} from "../src/types";

type ListenerMap = {
  [K in keyof STTSessionEventMap]: Array<
    (payload: STTSessionEventMap[K]) => void | Promise<void>
  >;
};

const createFakeAdapter = () => {
  const adapter: STTAdapter = {
    kind: "stt",
    open: (_options: STTAdapterOpenOptions) => {
      const listeners: ListenerMap = {
        close: [],
        endOfTurn: [],
        error: [],
        final: [],
        partial: [],
      };
      const session: STTAdapterSession = {
        close: async () => {},
        on: (event, handler) => {
          listeners[event].push(handler as never);
          return () => {};
        },
        send: async (_audio: AudioChunk) => {},
      };
      return session;
    },
  };

  return adapter;
};

const createMockSocket = () => {
  const messages: string[] = [];
  const socket: VoiceSocket = {
    close: async () => {},
    send: async (data) => {
      messages.push(typeof data === "string" ? data : "[binary]");
    },
  };

  return { messages, socket };
};

const createMemoryLeaseCoordinator = () => {
  const leases = new Map<string, string>();

  return {
    claim: async (input: { taskId: string; workerId: string }) => {
      if (leases.has(input.taskId)) {
        return false;
      }

      leases.set(input.taskId, input.workerId);
      return true;
    },
    get: async (taskId: string) => {
      const workerId = leases.get(taskId);
      return workerId
        ? {
            expiresAt: Date.now() + 30_000,
            taskId,
            workerId,
          }
        : null;
    },
    release: async (input: { taskId: string; workerId: string }) => {
      if (leases.get(input.taskId) !== input.workerId) {
        return false;
      }

      leases.delete(input.taskId);
      return true;
    },
    renew: async (input: { taskId: string; workerId: string }) =>
      leases.get(input.taskId) === input.workerId,
  };
};

test("voice session runs configured handoff adapters for transfer lifecycle actions", async () => {
  const requests: Array<{
    body: Record<string, unknown>;
    headers: Headers;
    url: string;
  }> = [];
  const trace = createVoiceMemoryTraceEventStore();
  const socket = createMockSocket();
  const session = createVoiceSession({
    context: {},
    handoff: {
      adapters: [
        createVoiceWebhookHandoffAdapter({
          fetch: async (url, init) => {
            requests.push({
              body: JSON.parse(String(init?.body ?? "{}")),
              headers: new Headers(init?.headers),
              url: String(url),
            });
            return new Response(null, {
              status: 202,
            });
          },
          id: "ops-transfer",
          signingSecret: "secret",
          url: "https://example.test/voice/handoff",
        }),
      ],
    },
    id: "session-handoff-transfer",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => {},
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: createFakeAdapter(),
    sttLifecycle: "continuous",
    trace,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.transfer({
    metadata: {
      source: "button",
    },
    reason: "caller-requested-transfer",
    target: "billing",
  });

  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    body: {
      action: "transfer",
      metadata: {
        source: "button",
      },
      reason: "caller-requested-transfer",
      target: "billing",
    },
    url: "https://example.test/voice/handoff",
  });
  expect(requests[0]?.headers.get("x-absolutejs-signature")).toStartWith(
    "sha256=",
  );
  expect(await trace.list({ type: "call.handoff" })).toMatchObject([
    {
      payload: {
        action: "transfer",
        deliveries: {
          "ops-transfer": {
            status: "delivered",
          },
        },
        status: "delivered",
        target: "billing",
      },
    },
  ]);
});

test("voice session queues failed handoffs and worker retries delivery", async () => {
  const queue = createVoiceMemoryHandoffDeliveryStore();
  const deadLetters = createVoiceMemoryHandoffDeliveryStore();
  let shouldFail = true;
  const adapter = createVoiceWebhookHandoffAdapter({
    fetch: async () =>
      shouldFail
        ? new Response(null, { status: 500 })
        : new Response(null, { status: 202 }),
    id: "ops-transfer",
    url: "https://example.test/voice/handoff",
  });
  const trace = createVoiceMemoryTraceEventStore();
  const socket = createMockSocket();
  const session = createVoiceSession({
    context: {},
    handoff: {
      adapters: [adapter],
      deliveryQueue: queue,
    },
    id: "session-handoff-retry",
    logger: {},
    reconnect: {
      maxAttempts: 1,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      onComplete: async () => {},
      onTurn: async () => {},
    },
    socket: socket.socket,
    store: createVoiceMemoryStore(),
    stt: createFakeAdapter(),
    sttLifecycle: "continuous",
    trace,
    turnDetection: {
      silenceMs: 20,
      speechThreshold: 0.01,
      transcriptStabilityMs: 5,
    },
  });

  await session.connect(socket.socket);
  await session.transfer({
    reason: "handoff-webhook-down",
    target: "billing",
  });

  const failed = await queue.list();
  expect(failed).toHaveLength(1);
  expect(failed[0]).toMatchObject({
    deliveryAttempts: 1,
    deliveryStatus: "failed",
    target: "billing",
  });

  shouldFail = false;
  const worker = createVoiceHandoffDeliveryWorker({
    adapters: [adapter],
    api: session,
    deadLetters,
    deliveries: queue,
    leases: createMemoryLeaseCoordinator(),
    maxFailures: 3,
    workerId: "handoff-worker-1",
  });
  expect(await worker.drain()).toMatchObject({
    attempted: 1,
    delivered: 1,
    failed: 0,
  });

  const retried = await queue.list();
  expect(retried[0]).toMatchObject({
    deliveryAttempts: 2,
    deliveryStatus: "delivered",
  });
  expect(
    await summarizeVoiceHandoffDeliveries(retried, { deadLetters }),
  ).toMatchObject({
    deadLettered: 0,
    delivered: 1,
    retryEligible: 0,
    total: 1,
  });
});

test("handoff delivery worker dead-letters exhausted deliveries", async () => {
  const queue = createVoiceMemoryHandoffDeliveryStore();
  const deadLetters = createVoiceMemoryHandoffDeliveryStore();
  const delivery = {
    action: "transfer" as const,
    context: {},
    createdAt: Date.now(),
    deliveryAttempts: 2,
    deliveryStatus: "failed" as const,
    id: "handoff-dead-letter",
    session: {
      committedTurnIds: [],
      createdAt: 100,
      currentTurn: {
        finalText: "",
        partialText: "",
        transcripts: [],
      },
      id: "session-handoff-dead-letter",
      reconnect: {
        attempts: 0,
      },
      status: "active" as const,
      transcripts: [],
      turns: [],
    },
    sessionId: "session-handoff-dead-letter",
    target: "billing",
    updatedAt: Date.now(),
  };
  await queue.set(delivery.id, delivery);

  const worker = createVoiceHandoffDeliveryWorker({
    adapters: [
      {
        handoff: () => ({
          error: "should not run after maxFailures",
          status: "failed",
        }),
        id: "ops-transfer",
      },
    ],
    api: {} as never,
    deadLetters,
    deliveries: queue,
    leases: createMemoryLeaseCoordinator(),
    maxFailures: 2,
    workerId: "handoff-worker-1",
  });

  expect(await worker.drain()).toMatchObject({
    attempted: 0,
    deadLettered: 1,
  });
  expect(await deadLetters.get(delivery.id)).toMatchObject({
    deliveryStatus: "failed",
  });
});

test("Twilio redirect handoff adapter posts TwiML to the active call", async () => {
  const requests: Array<{
    body: string;
    headers: Headers;
    url: string;
  }> = [];
  const adapter = createVoiceTwilioRedirectHandoffAdapter({
    accountSid: "AC123",
    authToken: "token",
    fetch: async (url, init) => {
      requests.push({
        body: String(init?.body ?? ""),
        headers: new Headers(init?.headers),
        url: String(url),
      });
      return new Response(null, {
        status: 200,
      });
    },
  });
  const result = await adapter.handoff({
    action: "transfer",
    api: {} as never,
    context: {},
    metadata: {
      callSid: "CA456",
    },
    session: {
      committedTurnIds: [],
      createdAt: 100,
      currentTurn: {
        finalText: "",
        partialText: "",
        transcripts: [],
      },
      id: "session-twilio-handoff",
      reconnect: {
        attempts: 0,
      },
      status: "active",
      transcripts: [],
      turns: [],
    },
    target: "+15551234567",
  });

  expect(result).toMatchObject({
    deliveredTo:
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Calls/CA456.json",
    status: "delivered",
  });
  expect(requests[0]?.body).toContain(
    "Twiml=%3CResponse%3E%3CDial%3E%2B15551234567%3C%2FDial%3E%3C%2FResponse%3E",
  );
  expect(requests[0]?.headers.get("authorization")).toStartWith("Basic ");
});
