import { expect, test } from "bun:test";
import {
  assertVoicePhoneCallControlEvidence,
  assertVoicePhoneAssistantEvidence,
  createVoiceMemoryTraceEventStore,
  createVoiceTraceEvent,
  createVoicePhoneAgent,
  evaluateVoicePhoneCallControlEvidence,
  evaluateVoicePhoneAssistantEvidence,
  runVoiceCampaignDialerProof,
} from "../src";

test("createVoicePhoneAgent mounts carrier routes and exposes setup readiness", async () => {
  const phoneAgent = createVoicePhoneAgent({
    carriers: [
      {
        name: "primary telnyx",
        options: {
          setup: {
            requiredEnv: {
              TELNYX_PUBLIC_KEY: "present",
            },
          },
          smoke: {
            title: "Phone agent Telnyx smoke",
          },
          texml: {
            streamUrl: "wss://voice.example.test/api/voice/telnyx/stream",
          },
          webhook: {
            verify: () => ({ ok: true }),
          },
        },
        provider: "telnyx",
      },
    ],
    setup: {
      path: "/api/voice/phone/setup",
      title: "Demo Phone Agent",
    },
  });

  expect(phoneAgent.setupPath).toBe("/api/voice/phone/setup");
  expect(phoneAgent.matrixPath).toBe("/api/voice/phone/carriers");
  expect(phoneAgent.carriers).toEqual([
    {
      name: "primary telnyx",
      provider: "telnyx",
      setupPath: "/api/voice/telnyx/setup",
      smokePath: "/api/voice/telnyx/smoke",
    },
  ]);

  const setupResponse = await phoneAgent.routes.handle(
    new Request("https://voice.example.test/api/voice/phone/setup"),
  );
  const setup = await setupResponse.json();

  expect(setup).toMatchObject({
    ready: true,
    title: "Demo Phone Agent",
    matrix: {
      pass: true,
      summary: {
        providers: 1,
        ready: 1,
        smokePassing: 1,
      },
    },
  });
  expect(setup.lifecycleStages).toContain("media-started");
  expect(setup.lifecycleStages).toContain("assistant-response");
  expect(setup.lifecycleStages).toContain("transfer");
  expect(setup.setupInstructions).toEqual([
    expect.objectContaining({
      answerLabel: "TeXML URL",
      answerUrl: "https://voice.example.test/api/voice/telnyx",
      carrierName: "primary telnyx",
      provider: "telnyx",
      status: "pass",
      streamUrl: "wss://voice.example.test/api/voice/telnyx/stream",
      webhookUrl: "https://voice.example.test/api/voice/telnyx/webhook",
    }),
  ]);
  expect(setup.setupInstructions[0].steps).toContain(
    "Set TeXML URL to https://voice.example.test/api/voice/telnyx.",
  );
  expect(setup.setupInstructions[0].steps).toContain(
    "Run carrier smoke /api/voice/telnyx/smoke?format=html.",
  );

  const matrixResponse = await phoneAgent.routes.handle(
    new Request("https://voice.example.test/api/voice/phone/carriers"),
  );
  const matrix = await matrixResponse.json();

  expect(matrix).toMatchObject({
    pass: true,
    summary: {
      providers: 1,
      ready: 1,
      smokePassing: 1,
    },
  });
});

test("evaluateVoicePhoneAssistantEvidence gates carrier setup and dialer proof", async () => {
  const phoneAgent = createVoicePhoneAgent({
    carriers: [
      {
        options: {
          setup: {
            requiredEnv: {
              PLIVO_AUTH_TOKEN: "present",
            },
          },
          answer: {
            streamUrl: "wss://voice.example.test/api/voice/plivo/stream",
          },
          webhook: {
            verify: () => ({ ok: true }),
          },
        },
        provider: "plivo",
      },
      {
        options: {
          setup: {
            requiredEnv: {
              TELNYX_PUBLIC_KEY: "present",
            },
          },
          texml: {
            streamUrl: "wss://voice.example.test/api/voice/telnyx/stream",
          },
          webhook: {
            verify: () => ({ ok: true }),
          },
        },
        provider: "telnyx",
      },
      {
        options: {
          setup: {
            requiredEnv: {
              TWILIO_AUTH_TOKEN: "present",
            },
          },
          twiml: {
            streamUrl: "wss://voice.example.test/api/voice/twilio/stream",
          },
          webhook: {
            verificationUrl:
              "https://voice.example.test/api/voice/twilio/webhook",
            verify: () => ({ ok: true }),
          },
        },
        provider: "twilio",
      },
    ],
  });
  const setupResponse = await phoneAgent.routes.handle(
    new Request("https://voice.example.test/api/voice/phone/setup"),
  );
  const setup = await setupResponse.json();
  const dialerProof = await runVoiceCampaignDialerProof();

  const assertion = evaluateVoicePhoneAssistantEvidence(setup, {
    dialerProof,
    maxCarrierFailures: 0,
    maxFailedDialerProviders: 0,
    minCarriers: 3,
    minDialerCarrierRequests: 3,
    minReadyCarriers: 3,
    minSmokePassing: 3,
    minSuccessfulDialerOutcomes: 3,
    requiredDialerProviders: ["plivo", "telnyx", "twilio"],
    requiredLifecycleStages: [
      "media-started",
      "assistant-response",
      "transfer",
    ],
    requiredProviders: ["plivo", "telnyx", "twilio"],
    requireDialerProof: true,
  });

  expect(assertion.ok).toBe(true);
  expect(assertion.providers).toEqual(["plivo", "telnyx", "twilio"]);
  expect(assertion.dialer?.carrierRequests).toBe(3);
  expect(() =>
    assertVoicePhoneAssistantEvidence(setup, {
      minCarriers: 4,
      requiredProviders: ["plivo", "telnyx", "twilio"],
    }),
  ).toThrow("Voice phone assistant evidence assertion failed");
});

test("evaluateVoicePhoneCallControlEvidence gates concrete lifecycle outcomes", async () => {
  const phoneAgent = createVoicePhoneAgent({
    carriers: [
      {
        options: {
          setup: {
            requiredEnv: {
              TWILIO_AUTH_TOKEN: "present",
            },
          },
          twiml: {
            streamUrl: "wss://voice.example.test/api/voice/twilio/stream",
          },
          webhook: {
            verify: () => ({ ok: true }),
          },
        },
        provider: "twilio",
      },
    ],
  });
  const setup = await (
    await phoneAgent.routes.handle(
      new Request("https://voice.example.test/api/voice/phone/setup"),
    )
  ).json();
  const smokeBase = {
    contractId: "phone-call-control-proof",
    generatedAt: 200,
    issues: [],
    observed: {
      assistantResponses: 1,
      carrierContract: true,
      latestEventAt: 150,
      mediaStarts: 1,
      sessionErrors: 0,
      transcripts: 1,
    },
    pass: true,
    provider: "twilio" as const,
    required: [
      "media-started",
      "transcript",
      "assistant-response",
      "lifecycle-outcome",
      "no-session-error",
    ] as const,
  };

  const assertion = evaluateVoicePhoneCallControlEvidence({
    maxFailedSmokeReports: 0,
    minPassingSmokeReports: 4,
    productionSmokes: [
      {
        ...smokeBase,
        observed: {
          ...smokeBase.observed,
          lifecycleOutcomes: ["completed"],
        },
        sessionId: "completed",
      },
      {
        ...smokeBase,
        observed: {
          ...smokeBase.observed,
          lifecycleOutcomes: ["transferred"],
        },
        sessionId: "transfer",
      },
      {
        ...smokeBase,
        observed: {
          ...smokeBase.observed,
          lifecycleOutcomes: ["voicemail"],
        },
        sessionId: "voicemail",
      },
      {
        ...smokeBase,
        observed: {
          ...smokeBase.observed,
          lifecycleOutcomes: ["no-answer"],
        },
        sessionId: "no-answer",
      },
    ],
    requiredLifecycleStages: [
      "completed",
      "no-answer",
      "transfer",
      "voicemail",
    ],
    requiredOutcomes: ["completed", "no-answer", "transferred", "voicemail"],
    requiredProviders: ["twilio"],
    setup,
  });

  expect(assertion.ok).toBe(true);
  expect(assertion.outcomes).toEqual([
    "completed",
    "no-answer",
    "transferred",
    "voicemail",
  ]);
  expect(() =>
    assertVoicePhoneCallControlEvidence({
      productionSmokes: [],
      requiredOutcomes: ["transferred"],
    }),
  ).toThrow("Voice phone call-control evidence assertion failed");
});

test("createVoicePhoneAgent renders the setup report as HTML", async () => {
  const phoneAgent = createVoicePhoneAgent({
    carriers: [
      {
        options: {
          setup: {
            requiredEnv: {
              PLIVO_AUTH_TOKEN: "present",
            },
          },
          answer: {
            streamUrl: "wss://voice.example.test/api/voice/plivo/stream",
          },
          webhook: {
            verify: () => ({ ok: true }),
          },
        },
        provider: "plivo",
      },
    ],
  });

  const response = await phoneAgent.routes.handle(
    new Request("https://voice.example.test/api/voice/phone/setup?format=html"),
  );
  const html = await response.text();

  expect(response.headers.get("content-type")).toContain("text/html");
  expect(html).toContain("Phone agent setup");
  expect(html).toContain("plivo");
  expect(html).toContain("media-started");
  expect(html).toContain("Copy into your app");
  expect(html).toContain("createVoicePhoneAgent");
  expect(html).toContain("createVoiceProductionReadinessRoutes");
});

test("createVoicePhoneAgent can mount production smoke contract routes", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  const sessionId = "phone-agent-smoke-session";
  await Promise.all([
    trace.append(
      createVoiceTraceEvent({
        payload: {
          type: "start",
        },
        sessionId,
        type: "call.lifecycle",
      }),
    ),
    trace.append(
      createVoiceTraceEvent({
        payload: {
          text: "hello from phone",
        },
        sessionId,
        type: "turn.transcript",
      }),
    ),
    trace.append(
      createVoiceTraceEvent({
        payload: {
          text: "hello back",
        },
        sessionId,
        type: "turn.assistant",
      }),
    ),
    trace.append(
      createVoiceTraceEvent({
        payload: {
          disposition: "completed",
          type: "end",
        },
        sessionId,
        type: "call.lifecycle",
      }),
    ),
  ]);
  const phoneAgent = createVoicePhoneAgent({
    carriers: [
      {
        options: {
          setup: {
            requiredEnv: {
              TELNYX_PUBLIC_KEY: "present",
            },
          },
          smoke: {
            title: "Phone agent Telnyx smoke",
          },
          texml: {
            streamUrl: "wss://voice.example.test/api/voice/telnyx/stream",
          },
          webhook: {
            verify: () => ({ ok: true }),
          },
        },
        provider: "telnyx",
      },
    ],
    productionSmoke: {
      required: [
        "carrier-contract",
        "media-started",
        "transcript",
        "assistant-response",
        "lifecycle-outcome",
        "no-session-error",
      ],
      store: trace,
    },
  });

  expect(phoneAgent.productionSmokePath).toBe(
    "/api/voice/phone/smoke-contract",
  );

  const setupResponse = await phoneAgent.routes.handle(
    new Request("https://voice.example.test/api/voice/phone/setup"),
  );
  const setup = await setupResponse.json();
  expect(setup.productionSmokePath).toBe("/api/voice/phone/smoke-contract");

  const smokeResponse = await phoneAgent.routes.handle(
    new Request(
      `https://voice.example.test/api/voice/phone/smoke-contract?sessionId=${sessionId}&provider=telnyx`,
    ),
  );
  const smoke = await smokeResponse.json();

  expect(smoke).toMatchObject({
    observed: {
      carrierContract: true,
      mediaStarts: 1,
      transcripts: 1,
      assistantResponses: 1,
    },
    pass: true,
    provider: "telnyx",
    sessionId,
  });
});
