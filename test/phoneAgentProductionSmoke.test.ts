import { expect, test } from "bun:test";
import {
  createVoicePhoneAgentProductionSmokeRoutes,
  createVoiceMemoryTraceEventStore,
  runVoicePhoneAgentProductionSmokeContract,
} from "../src";
import type { VoiceTelephonyContractReport } from "../src";

const createCarrierContract = (
  overrides: Partial<VoiceTelephonyContractReport<"twilio">> = {},
): VoiceTelephonyContractReport<"twilio"> => ({
  issues: [],
  pass: true,
  provider: "twilio",
  requirements: [
    "stream-url",
    "wss-stream",
    "webhook-url",
    "signed-webhook",
    "smoke-pass",
  ],
  setup: {
    generatedAt: 100,
    missing: [],
    provider: "twilio",
    ready: true,
    signing: {
      configured: true,
      mode: "twilio-signature",
    },
    urls: {
      stream: "wss://voice.example.test/voice/twilio/stream",
      twiml: "https://voice.example.test/voice/twilio",
      webhook: "https://voice.example.test/voice/twilio/webhook",
    },
    warnings: [],
  },
  ...overrides,
});

const appendPassingPhoneSmokeTrace = async (
  store: ReturnType<typeof createVoiceMemoryTraceEventStore>,
  input: {
    at?: number;
    sessionId?: string;
  },
) => {
  const at = input.at ?? 1_000;
  const sessionId = input.sessionId ?? "phone-smoke-session";
  await Promise.all([
    store.append({
      at,
      payload: {
        type: "start",
      },
      sessionId,
      type: "call.lifecycle",
    }),
    store.append({
      at: at + 10,
      payload: {
        isFinal: true,
        text: "I need help with billing",
      },
      sessionId,
      type: "turn.transcript",
    }),
    store.append({
      at: at + 20,
      payload: {
        text: "I can help with billing.",
      },
      sessionId,
      type: "turn.assistant",
    }),
    store.append({
      at: at + 30,
      payload: {
        disposition: "completed",
        type: "end",
      },
      sessionId,
      type: "call.lifecycle",
    }),
  ]);
};

test("runVoicePhoneAgentProductionSmokeContract passes a complete phone call trace", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await appendPassingPhoneSmokeTrace(store, {
    sessionId: "phone-smoke-session",
  });

  const report = await runVoicePhoneAgentProductionSmokeContract({
    contract: createCarrierContract(),
    required: [
      "carrier-contract",
      "media-started",
      "transcript",
      "assistant-response",
      "lifecycle-outcome",
      "no-session-error",
    ],
    sessionId: "phone-smoke-session",
    store,
  });

  expect(report.pass).toBe(true);
  expect(report.observed).toMatchObject({
    assistantResponses: 1,
    carrierContract: true,
    mediaStarts: 1,
    sessionErrors: 0,
    transcripts: 1,
  });
  expect(report.observed.lifecycleOutcomes).toEqual(["completed"]);
});

test("runVoicePhoneAgentProductionSmokeContract reports missing call path evidence", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await store.append({
    at: 1_000,
    payload: {
      type: "start",
    },
    sessionId: "phone-smoke-missing",
    type: "call.lifecycle",
  });

  const report = await runVoicePhoneAgentProductionSmokeContract({
    sessionId: "phone-smoke-missing",
    store,
  });

  expect(report.pass).toBe(false);
  expect(report.issues.map((issue) => issue.requirement)).toEqual([
    "transcript",
    "assistant-response",
    "lifecycle-outcome",
  ]);
});

test("runVoicePhoneAgentProductionSmokeContract can require fresh smoke traces", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await appendPassingPhoneSmokeTrace(store, {
    at: 1_000,
    sessionId: "phone-smoke-stale",
  });

  const report = await runVoicePhoneAgentProductionSmokeContract({
    maxAgeMs: 500,
    now: 2_000,
    required: [
      "media-started",
      "transcript",
      "assistant-response",
      "fresh-trace",
    ],
    sessionId: "phone-smoke-stale",
    store,
  });

  expect(report.pass).toBe(false);
  expect(report.issues.map((issue) => issue.requirement)).toEqual([
    "fresh-trace",
  ]);
});

test("runVoicePhoneAgentProductionSmokeContract fails session errors", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await appendPassingPhoneSmokeTrace(store, {
    sessionId: "phone-smoke-error",
  });
  await store.append({
    at: 1_100,
    payload: {
      error: "provider failed",
    },
    sessionId: "phone-smoke-error",
    type: "session.error",
  });

  const report = await runVoicePhoneAgentProductionSmokeContract({
    sessionId: "phone-smoke-error",
    store,
  });

  expect(report.pass).toBe(false);
  expect(report.issues.map((issue) => issue.requirement)).toContain(
    "no-session-error",
  );
});

test("createVoicePhoneAgentProductionSmokeRoutes exposes json and html reports", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await appendPassingPhoneSmokeTrace(store, {
    sessionId: "phone-smoke-route",
  });
  const routes = createVoicePhoneAgentProductionSmokeRoutes({
    getContract: () => createCarrierContract(),
    store,
  });

  const json = await routes.handle(
    new Request(
      "http://localhost/api/voice/phone/smoke-contract?sessionId=phone-smoke-route",
    ),
  );
  const html = await routes.handle(
    new Request(
      "http://localhost/voice/phone/smoke-contract?sessionId=phone-smoke-route",
    ),
  );

  expect(await json.json()).toMatchObject({
    observed: {
      assistantResponses: 1,
      carrierContract: true,
      mediaStarts: 1,
      transcripts: 1,
    },
    pass: true,
    sessionId: "phone-smoke-route",
  });
  expect(await html.text()).toContain("Phone agent production smoke");
});

test("createVoicePhoneAgentProductionSmokeRoutes can disable html path", async () => {
  const store = createVoiceMemoryTraceEventStore();
  const routes = createVoicePhoneAgentProductionSmokeRoutes({
    htmlPath: false,
    sessionId: "missing",
    store,
  });

  const html = await routes.handle(
    new Request("http://localhost/voice/phone/smoke-contract"),
  );

  expect(html.status).toBe(404);
});
