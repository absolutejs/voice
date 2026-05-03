import { expect, test } from "bun:test";
import {
  assertVoiceProductionReadinessEvidence,
  buildVoiceMediaPipelineReport,
  buildVoiceProductionReadinessGate,
  buildVoiceProductionReadinessReport,
  buildVoiceReadinessRecoveryActions,
  buildVoiceProviderOrchestrationReport,
  buildVoiceObservabilityArtifactIndex,
  buildVoiceOpsRecoveryReport,
  buildVoiceObservabilityExport,
  buildVoiceObservabilityExportReplayReport,
  buildVoiceMonitorRunReport,
  createVoiceMemoryObservabilityExportDeliveryReceiptStore,
  createVoiceMemoryMonitorIssueStore,
  deliverVoiceMonitorIssueNotifications,
  buildVoiceProviderContractMatrix,
  buildVoiceReconnectProofReport,
  createVoiceAuditEvent,
  createVoiceAuditSinkDeliveryRecord,
  createVoiceMemoryAuditEventStore,
  createVoiceMemoryAuditSinkDeliveryStore,
  createVoiceMemoryTraceEventStore,
  createVoiceMemoryTraceSinkDeliveryStore,
  createVoiceProviderOrchestrationProfile,
  createVoiceProductionReadinessProofRuntime,
  createVoiceProductionReadinessRoutes,
  createVoiceTelephonyCarrierMatrix,
  createVoiceTraceEvent,
  createVoiceTraceSinkDeliveryRecord,
  buildVoiceSessionObservabilityReport,
  recordVoiceOpsActionAudit,
  renderVoiceProductionReadinessHTML,
  createVoiceProviderDecisionTraceEvent,
  runVoiceCampaignReadinessProof,
  evaluateVoiceProductionReadinessEvidence,
  summarizeVoiceProductionReadinessGate,
} from "../src";
import { createMediaFrame } from "@absolutejs/media";

test("buildVoiceReadinessRecoveryActions normalizes failing and warning check actions", () => {
  const plan = buildVoiceReadinessRecoveryActions(
    [
      {
        actions: [
          {
            href: "/api/voice/real-call-profile-history/collect-phone-proof",
            label: "Run phone proof",
            method: "POST",
          },
        ],
        detail: "Phone proof is missing.",
        href: "/production-readiness",
        label: "Real-call profile history",
        status: "fail",
      },
      {
        actions: [
          {
            href: "/api/voice/real-call-profile-history/collect-phone-proof",
            label: "Run phone proof",
            method: "POST",
          },
          {
            href: "/voice/real-call-profile-recovery",
            label: "Open recovery jobs",
          },
        ],
        label: "Real-call recovery job history",
        status: "warn",
      },
      {
        actions: [
          {
            href: "/ignored",
            label: "Ignored",
          },
        ],
        label: "Passing check",
        status: "pass",
      },
    ],
    {
      now: () => new Date("2026-04-30T12:00:00.000Z"),
    },
  );

  expect(plan).toMatchObject({
    generatedAt: "2026-04-30T12:00:00.000Z",
    sourceChecks: 2,
  });
  expect(plan.actions).toHaveLength(3);
  expect(plan.actions).toContainEqual(
    expect.objectContaining({
      href: "/api/voice/real-call-profile-history/collect-phone-proof",
      key: "POST:/api/voice/real-call-profile-history/collect-phone-proof:Real-call profile history",
      method: "POST",
      sourceCheckLabel: "Real-call profile history",
      sourceStatus: "fail",
    }),
  );
  expect(plan.actions).toContainEqual(
    expect.objectContaining({
      href: "/voice/real-call-profile-recovery",
      method: "GET",
      sourceCheckLabel: "Real-call recovery job history",
      sourceStatus: "warn",
    }),
  );
});

const raw24k = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 24_000,
} as const;

const createSessionObservabilityEvents = () => [
  createVoiceTraceEvent({
    at: 100,
    payload: { type: "start" },
    sessionId: "session-observable",
    type: "call.lifecycle",
  }),
  createVoiceTraceEvent({
    at: 125,
    payload: {
      elapsedMs: 25,
      isFinal: true,
      provider: "deepgram",
      providerStatus: "success",
      text: "I need to reschedule.",
    },
    sessionId: "session-observable",
    turnId: "turn-1",
    type: "turn.transcript",
  }),
  createVoiceTraceEvent({
    at: 140,
    payload: {
      text: "I need to reschedule.",
    },
    sessionId: "session-observable",
    turnId: "turn-1",
    type: "turn.committed",
  }),
  createVoiceProviderDecisionTraceEvent({
    at: 165,
    elapsedMs: 60,
    fallbackProvider: "anthropic",
    kind: "llm",
    provider: "openai",
    reason: "primary model exceeded the live turn budget",
    selectedProvider: "openai",
    sessionId: "session-observable",
    status: "selected",
    surface: "live-call",
    turnId: "turn-1",
  }),
  createVoiceProviderDecisionTraceEvent({
    at: 185,
    elapsedMs: 90,
    fallbackProvider: "anthropic",
    kind: "llm",
    provider: "openai",
    reason: "fallback recovered the turn",
    selectedProvider: "anthropic",
    sessionId: "session-observable",
    status: "fallback",
    surface: "live-call",
    turnId: "turn-1",
  }),
  createVoiceTraceEvent({
    at: 210,
    payload: {
      elapsedMs: 30,
      status: "ok",
      toolCallId: "tool-1",
      toolName: "reschedule_appointment",
    },
    sessionId: "session-observable",
    turnId: "turn-1",
    type: "agent.tool",
  }),
  createVoiceTraceEvent({
    at: 250,
    payload: {
      text: "I can help reschedule that appointment.",
    },
    sessionId: "session-observable",
    turnId: "turn-1",
    type: "turn.assistant",
  }),
  createVoiceTraceEvent({
    at: 300,
    payload: { disposition: "completed", type: "end" },
    sessionId: "session-observable",
    type: "call.lifecycle",
  }),
];

test("buildVoiceProductionReadinessReport warns when deployment has no runtime proof", async () => {
  const report = await buildVoiceProductionReadinessReport({
    llmProviders: ["openai"],
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report).toMatchObject({
    status: "warn",
    summary: {
      quality: {
        status: "pass",
      },
      routing: {
        events: 0,
        sessions: 0,
      },
      sessions: {
        failed: 0,
        total: 0,
      },
    },
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Routing evidence",
        actions: expect.arrayContaining([
          expect.objectContaining({
            label: "Open routing evidence",
          }),
        ]),
        status: "warn",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport reports section timings", async () => {
  const timings: string[] = [];
  await buildVoiceProductionReadinessReport({
    llmProviders: ["openai"],
    onTiming: (timing) => {
      expect(timing.durationMs).toBeGreaterThanOrEqual(0);
      expect(timing.endedAt).toBeGreaterThanOrEqual(timing.startedAt);
      timings.push(timing.label);
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(timings).toContain("traceEvents");
  expect(timings).toContain("quality");
  expect(timings).toContain("providers");
  expect(timings).toContain("sessions");
  expect(timings).toContain("additionalChecks");
});

test("evaluateVoiceProductionReadinessEvidence verifies gate status and required checks", async () => {
  const report = await buildVoiceProductionReadinessReport({
    llmProviders: ["openai"],
    store: createVoiceMemoryTraceEventStore(),
  });

  const warningReport = evaluateVoiceProductionReadinessEvidence(report, {
    maxFailures: 0,
    requireGateOk: true,
    requireStatus: "warn",
    requiredChecks: ["Quality gates", "Session health"],
  });

  expect(warningReport).toMatchObject({
    failures: 0,
    gateOk: true,
    ok: true,
    status: "warn",
  });
  expect(
    assertVoiceProductionReadinessEvidence(report, {
      requireStatus: "warn",
      requiredChecks: ["Session health"],
    }).ok,
  ).toBe(true);

  const failed = evaluateVoiceProductionReadinessEvidence(report, {
    requireStatus: "pass",
    requiredChecks: ["Missing check"],
  });
  expect(failed.ok).toBe(false);
  expect(failed.issues).toContain(
    "Expected production readiness status pass, found warn.",
  );
  expect(failed.issues).toContain(
    "Missing production readiness check: Missing check.",
  );
  expect(() =>
    assertVoiceProductionReadinessEvidence(report, { requireStatus: "pass" }),
  ).toThrow("Voice production readiness assertion failed");
});

test("createVoiceProductionReadinessProofRuntime seeds bounded proof and freshness checks", async () => {
  const runtime = createVoiceProductionReadinessProofRuntime({
    cacheMs: 1_000,
    runId: () => "proof-runtime-test",
  });
  let refreshes = 0;
  await runtime.refresh(async () => {
    refreshes += 1;
    await runtime.seedTraceProof({
      llmProvider: "openai",
      sttProvider: "deepgram",
      ttsProvider: "openai",
    });
  });

  const report = await buildVoiceProductionReadinessReport({
    additionalChecks: async () => [await runtime.buildFreshnessCheck()],
    llmProviders: ["openai"],
    providerSlo: {
      events: await runtime.store.list(),
      requiredKinds: ["llm", "stt", "tts"],
    },
    store: runtime.store,
    ...runtime.options,
  });

  expect(refreshes).toBe(1);
  expect(report.summary.providerSlo).toMatchObject({
    eventsWithLatency: 3,
    status: "pass",
  });
  expect(report.summary.liveLatency).toMatchObject({
    status: "pass",
    total: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Proof freshness",
        status: "pass",
        value: expect.stringContaining("old"),
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport includes profile switch readiness checks", async () => {
  const report = await buildVoiceProductionReadinessReport({
    llmProviders: ["openai"],
    profileSwitchReadiness: {
      generatedAt: new Date().toISOString(),
      issues: [],
      live: {
        generatedAt: new Date().toISOString(),
        ok: true,
        sessions: [],
        summary: {
          auditEvents: 1,
          autoApplied: 1,
          blocked: 0,
          decisions: 2,
          recommendations: 0,
          sessions: 1,
          switches: 1,
          traceEvents: 1,
        },
      },
      policy: {
        generatedAt: new Date().toISOString(),
        ok: true,
        observed: {},
        results: [],
        summary: {
          failed: 0,
          passed: 6,
          total: 6,
        },
      },
      status: "pass",
      summary: {
        auditEvents: 1,
        autoApplied: 1,
        blocked: 0,
        decisions: 2,
        policyCases: 6,
        sessions: 1,
        switches: 1,
        traceEvents: 1,
      },
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.profileSwitchReadiness).toMatchObject({
    decisions: 2,
    issues: 0,
    policyCases: 6,
    sessions: 1,
    status: "pass",
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Profile switch readiness",
        status: "pass",
        value: "1/2",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport includes campaign readiness proof", async () => {
  const campaignReadiness = await runVoiceCampaignReadinessProof();
  const report = await buildVoiceProductionReadinessReport({
    campaignReadiness,
    links: {
      campaignReadiness: "/campaign-proof",
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.campaignReadiness).toMatchObject({
    failed: 0,
    passed: campaignReadiness.checks.length,
    status: "pass",
    total: campaignReadiness.checks.length,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/campaign-proof",
        label: "Campaign readiness proof",
        status: "pass",
        value: `${campaignReadiness.checks.length}/${campaignReadiness.checks.length}`,
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport includes session observability evidence check", async () => {
  const sessionObservability = await buildVoiceSessionObservabilityReport({
    callDebuggerHref: "/voice/debug/:sessionId",
    events: createSessionObservabilityEvents(),
    incidentMarkdownHref: "/voice/observability/:sessionId/incident.md",
    operationsRecordHref: "/voice/operations/:sessionId",
    sessionId: "session-observable",
    traceTimelineHref: "/voice/traces/:sessionId",
  });
  const report = await buildVoiceProductionReadinessReport({
    links: {
      sessionObservability: "/voice/session-observability",
    },
    sessionObservability,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.sessionObservability).toMatchObject({
    failed: 0,
    passed: 1,
    status: "pass",
    total: 1,
    warnings: 0,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/voice/session-observability",
        label: "Session observability evidence",
        status: "pass",
        value: "1/1",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport warns on weak session observability evidence", async () => {
  const sessionObservability = await buildVoiceSessionObservabilityReport({
    callDebuggerHref: "/voice/debug/:sessionId",
    events: createSessionObservabilityEvents(),
    incidentMarkdownHref: "/voice/observability/:sessionId/incident.md",
    operationsRecordHref: "/voice/operations/:sessionId",
    sessionId: "session-observable",
    traceTimelineHref: "/voice/traces/:sessionId",
  });
  const report = await buildVoiceProductionReadinessReport({
    links: {
      sessionObservability: "/voice/session-observability",
    },
    sessionObservability,
    sessionObservabilityEvidence: {
      minTurns: 2,
      minProviderDecisions: 3,
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.sessionObservability).toMatchObject({
    failed: 0,
    passed: 0,
    status: "warn",
    total: 1,
    warnings: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/voice/session-observability",
        label: "Session observability evidence",
        status: "warn",
        value: "0/1",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport gates media pipeline quality and links operations records", async () => {
  const mediaPipeline = buildVoiceMediaPipelineReport({
    expectedInputFormat: raw24k,
    expectedOutputFormat: raw24k,
    frames: [
      createMediaFrame({
        at: 100,
        durationMs: 20,
        format: raw24k,
        id: "input-1",
        kind: "input-audio",
        metadata: { speechProbability: 0.1 },
        sessionId: "session-media",
        source: "browser",
        traceEventId: "trace-input-1",
      }),
      createMediaFrame({
        at: 500,
        durationMs: 20,
        format: raw24k,
        id: "assistant-1",
        kind: "assistant-audio",
        metadata: { jitterMs: 120 },
        sessionId: "session-media",
        source: "provider",
        traceEventId: "trace-assistant-1",
      }),
    ],
    maxMediaGapMs: 100,
    maxMediaJitterMs: 50,
    minMediaSpeechRatio: 0.8,
    requireTraceEvidence: true,
    surface: "browser-realtime",
  });
  const report = await buildVoiceProductionReadinessReport({
    links: {
      mediaPipeline: "/voice/media-pipeline",
      operationsRecords: "/voice-operations/:sessionId",
    },
    mediaPipeline,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.mediaPipeline).toMatchObject({
    assistantAudioFrames: 1,
    gapCount: 1,
    inputAudioFrames: 1,
    issues: expect.any(Number),
    jitterMs: 120,
    speechRatio: 0,
    status: "fail",
  });
  expect(report.operationsRecords?.mediaQuality).toEqual([
    expect.objectContaining({
      href: "/voice-operations/session-media",
      sessionId: "session-media",
      status: "fail",
    }),
  ]);
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/voice-operations/session-media",
        label: "Media pipeline quality",
        status: "fail",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport gates browser media transport stats", async () => {
  const report = await buildVoiceProductionReadinessReport({
    browserMedia: {
      activeCandidatePairs: 0,
      bytesReceived: 100,
      bytesSent: 0,
      checkedAt: Date.now(),
      endedAudioTracks: 1,
      inboundPackets: 90,
      issues: [
        {
          code: "media.webrtc_packet_loss",
          message: "Observed WebRTC packet loss ratio 0.1 above 0.02.",
          severity: "warning",
        },
      ],
      jitterMs: 80,
      liveAudioTracks: 0,
      outboundPackets: 0,
      packetLossRatio: 0.1,
      packetsLost: 10,
      roundTripTimeMs: 350,
      status: "warn",
      totalStats: 3,
    },
    links: {
      browserMedia: "/voice/browser-media",
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.browserMedia).toMatchObject({
    activeCandidatePairs: 0,
    issues: 1,
    liveAudioTracks: 0,
    packetLossRatio: 0.1,
    status: "fail",
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/voice/browser-media",
        label: "Browser media transport",
        status: "fail",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport enforces browser media breadth thresholds", async () => {
  const report = await buildVoiceProductionReadinessReport({
    browserMedia: {
      activeCandidatePairs: 0,
      bytesReceived: 100,
      bytesSent: 0,
      checkedAt: Date.now(),
      endedAudioTracks: 1,
      inboundPackets: 90,
      issues: [],
      jitterMs: 1,
      liveAudioTracks: 0,
      outboundPackets: 0,
      packetLossRatio: 0.01,
      packetsLost: 0,
      roundTripTimeMs: 20,
      status: "pass",
      totalStats: 1,
    },
    browserMediaMinActiveCandidatePairs: 1,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.browserMedia).toMatchObject({
    activeCandidatePairs: 0,
    status: "fail",
  });

  const check = report.checks.find(
    (check) => check.label === "Browser media transport",
  );
  expect(check?.status).toBe("fail");
  expect(check?.detail).toContain(
    "Expected at least 1 active candidate pair(s), observed 0.",
  );
});

test("buildVoiceProductionReadinessReport applies meeting-recorder profile defaults", async () => {
  const report = await buildVoiceProductionReadinessReport({
    profile: {
      description: "meeting recorder profile",
      name: "meeting-recorder",
      purpose: "Browser proof for meetings and notes.",
      surfaces: [],
    },
    store: createVoiceMemoryTraceEventStore(),
    browserMedia: {
      activeCandidatePairs: 0,
      bytesReceived: 100,
      bytesSent: 10,
      checkedAt: Date.now(),
      endedAudioTracks: 1,
      inboundPackets: 90,
      issues: [],
      jitterMs: 1,
      liveAudioTracks: 0,
      outboundPackets: 0,
      packetLossRatio: 0.01,
      packetsLost: 0,
      roundTripTimeMs: 20,
      status: "pass",
      totalStats: 1,
    },
  });

  const check = report.checks.find(
    (check) => check.label === "Browser media transport",
  );

  expect(check?.status).toBe("fail");
  expect(check?.detail).toContain(
    "Expected at least 1 active candidate pair(s), observed 0.",
  );
});

test("buildVoiceProductionReadinessReport applies phone-agent profile defaults", async () => {
  const report = await buildVoiceProductionReadinessReport({
    profile: {
      description: "phone-agent profile",
      name: "phone-agent",
      purpose: "Phone agent readiness checks.",
      surfaces: [],
    },
    store: createVoiceMemoryTraceEventStore(),
    telephonyMedia: {
      carriers: [
        {
          audioBytes: 4,
          carrier: "twilio",
          issues: [],
          lifecycle: {
            audioBytes: 4,
            checkedAt: Date.now(),
            events: [
              {
                audioBytes: 4,
                carrier: "twilio",
                direction: "unknown",
                kind: "start",
                streamId: "twilio-stream-1",
              },
              {
                audioBytes: 4,
                carrier: "twilio",
                direction: "unknown",
                kind: "media",
                streamId: "twilio-stream-1",
              },
              {
                audioBytes: 4,
                carrier: "twilio",
                direction: "unknown",
                kind: "stop",
                streamId: "twilio-stream-1",
              },
            ],
            issues: [],
            mediaEvents: 1,
            started: true,
            status: "pass",
            stopped: true,
            streamIds: ["twilio-stream-1"],
          },
          status: "pass",
        },
      ],
      checkedAt: Date.now(),
      issues: [],
      status: "pass",
    },
  });

  const check = report.checks.find(
    (check) => check.label === "Telephony media serializers",
  );

  expect(check?.status).toBe("fail");
  expect(check?.detail).toContain(
    "Expected at least 2 telephony media event(s), observed 1.",
  );
});

test("buildVoiceProductionReadinessReport gates telephony media serializers", async () => {
  const report = await buildVoiceProductionReadinessReport({
    links: {
      operationsRecords: "/voice-operations/:sessionId",
      telephonyMedia: "/voice/telephony-media",
    },
    store: createVoiceMemoryTraceEventStore(),
    telephonyMedia: {
      carriers: [
        {
          audioBytes: 0,
          carrier: "twilio",
          issues: ["Telephony media stream did not include a stop event."],
          lifecycle: {
            audioBytes: 4,
            checkedAt: Date.now(),
            events: [
              {
                audioBytes: 0,
                carrier: "twilio",
                direction: "unknown",
                kind: "start",
                streamId: "twilio-stream-1",
              },
              {
                audioBytes: 4,
                carrier: "twilio",
                direction: "inbound",
                kind: "media",
                streamId: "twilio-stream-1",
              },
            ],
            issues: [
              {
                code: "media.telephony_missing_stop",
                message: "Telephony media stream did not include a stop event.",
                severity: "error",
              },
            ],
            mediaEvents: 1,
            started: true,
            status: "fail",
            stopped: false,
            streamIds: ["twilio-stream-1"],
          },
          status: "fail",
        },
      ],
      checkedAt: Date.now(),
      issues: ["twilio: Telephony media stream did not include a stop event."],
      status: "fail",
    },
  });

  expect(report.status).toBe("fail");
  expect(report.summary.telephonyMedia).toMatchObject({
    audioBytes: 0,
    carriers: 1,
    failed: 1,
    issues: 1,
    lifecycleFailures: 1,
    mediaEvents: 1,
    passed: 0,
    status: "fail",
  });
  expect(report.operationsRecords?.telephonyMedia).toEqual([
    expect.objectContaining({
      detail: "Telephony media stream did not include a stop event.",
      href: "/voice-operations/twilio-stream-1",
      sessionId: "twilio-stream-1",
      status: "fail",
    }),
  ]);
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/voice-operations/twilio-stream-1",
        label: "Telephony media serializers",
        status: "fail",
        value: "1/1 failing",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport enforces telephony media breadth thresholds", async () => {
  const report = await buildVoiceProductionReadinessReport({
    links: {
      telephonyMedia: "/voice-operations/twilio-stream-1",
    },
    store: createVoiceMemoryTraceEventStore(),
    telephonyMedia: {
      carriers: [
        {
          audioBytes: 4,
          carrier: "twilio",
          issues: [],
          lifecycle: {
            audioBytes: 4,
            checkedAt: Date.now(),
            events: [
              {
                audioBytes: 4,
                carrier: "twilio",
                direction: "unknown",
                kind: "start",
                streamId: "twilio-stream-1",
              },
            ],
            issues: [],
            mediaEvents: 1,
            started: true,
            status: "pass",
            stopped: true,
            streamIds: ["twilio-stream-1"],
          },
          status: "pass",
        },
      ],
      checkedAt: Date.now(),
      issues: [],
      status: "pass",
    },
    telephonyMediaMinCarriers: 2,
  });

  expect(report.summary.telephonyMedia).toMatchObject({
    carriers: 1,
    status: "fail",
  });

  const check = report.checks.find(
    (check) => check.label === "Telephony media serializers",
  );
  expect(check?.status).toBe("fail");
  expect(check?.detail).toContain(
    "Expected at least 2 telephony carrier(s), observed 1.",
  );
});

test("buildVoiceProductionReadinessReport gates carrier webhook security", async () => {
  const report = await buildVoiceProductionReadinessReport({
    links: {
      telephonyWebhookSecurity: "/webhook-security",
    },
    store: createVoiceMemoryTraceEventStore(),
    telephonyWebhookSecurity: {
      plivo: {
        authToken: "plivo-secret",
      },
      store: {
        kind: "sqlite",
        path: ":memory:",
      },
      telnyx: {
        publicKey: "telnyx-public-key",
      },
      twilio: {
        authToken: "twilio-secret",
      },
    },
  });

  expect(report.summary.telephonyWebhookSecurity).toMatchObject({
    enabled: 3,
    failed: 0,
    passed: 3,
    status: "pass",
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/webhook-security",
        label: "Carrier webhook security",
        status: "pass",
        value: "3/3",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport fails insecure carrier webhook security", async () => {
  const report = await buildVoiceProductionReadinessReport({
    store: createVoiceMemoryTraceEventStore(),
    telephonyWebhookSecurity: {
      plivo: {},
      twilio: {
        authToken: "twilio-secret",
      },
    },
  });

  expect(report.status).toBe("fail");
  expect(report.summary.telephonyWebhookSecurity).toMatchObject({
    enabled: 2,
    failed: 2,
    status: "fail",
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Carrier webhook security",
        status: "fail",
        value: "0/2",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport fails open critical monitor issues", async () => {
  const monitoring = await buildVoiceMonitorRunReport({
    evidence: {
      errorRate: 0.06,
    },
    issueStore: createVoiceMemoryMonitorIssueStore(),
    monitors: [
      {
        evaluate: ({ evidence }) => ({
          detail: `Error rate is ${evidence.errorRate}.`,
          status: evidence.errorRate > 0.02 ? "fail" : "pass",
          threshold: 0.02,
          value: evidence.errorRate,
        }),
        id: "error-rate",
        label: "Error rate",
        severity: "critical",
      },
    ],
    now: 100,
  });

  const report = await buildVoiceProductionReadinessReport({
    links: {
      monitoring: "/voice/monitors",
    },
    monitoring,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.monitoring).toMatchObject({
    criticalOpen: 1,
    open: 1,
    status: "fail",
    total: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/voice/monitors",
        label: "Monitoring issues",
        status: "fail",
        value: "0/1",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport gates monitor notifier delivery", async () => {
  const issueStore = createVoiceMemoryMonitorIssueStore();
  await buildVoiceMonitorRunReport({
    evidence: {
      errorRate: 0.06,
    },
    issueStore,
    monitors: [
      {
        evaluate: ({ evidence }) => ({
          status: evidence.errorRate > 0.02 ? "fail" : "pass",
          threshold: 0.02,
          value: evidence.errorRate,
        }),
        id: "error-rate",
        label: "Error rate",
        severity: "critical",
      },
    ],
    now: 100,
  });
  const monitoringNotifierDelivery =
    await deliverVoiceMonitorIssueNotifications({
      issueStore,
      notifiers: [
        {
          deliver: () => ({
            detail: "webhook down",
            status: "failed",
          }),
          id: "ops-webhook",
          label: "Ops webhook",
        },
      ],
      now: 150,
    });

  const report = await buildVoiceProductionReadinessReport({
    links: {
      monitoringNotifierDelivery: "/monitor-notifications",
    },
    monitoringNotifierDelivery,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.monitoringNotifierDelivery).toMatchObject({
    failed: 1,
    sent: 0,
    status: "fail",
    total: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/monitor-notifications",
        label: "Monitor notifier delivery",
        status: "fail",
        value: "0/1",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport gates observability export proof", async () => {
  const store = createVoiceMemoryTraceEventStore();
  const event = await store.append(
    createVoiceTraceEvent({
      at: 1_000,
      payload: { type: "start" },
      sessionId: "session-1",
      type: "call.lifecycle",
    }),
  );
  const observabilityExport = await buildVoiceObservabilityExport({
    artifacts: [
      {
        id: "latest-proof-pack",
        kind: "proof-pack",
        label: "Latest proof pack",
        path: ".voice-runtime/proof-pack/latest.md",
      },
    ],
    links: {
      operationsRecord: (sessionId) => `/voice-operations/${sessionId}`,
    },
    store,
    traceDeliveries: [
      createVoiceTraceSinkDeliveryRecord({
        deliveredAt: 1_100,
        deliveryStatus: "delivered",
        events: [event],
        id: "trace-delivery-1",
      }),
    ],
  });
  const report = await buildVoiceProductionReadinessReport({
    links: {
      observabilityExport: "/voice/observability-export",
    },
    observabilityExport,
    store,
  });

  expect(report.summary.observabilityExport).toMatchObject({
    artifacts: 1,
    issues: 0,
    status: "pass",
    traceEvents: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/voice/observability-export",
        label: "Observability export",
        status: "pass",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport gates incident recovery outcomes", async () => {
  const report = await buildVoiceProductionReadinessReport({
    incidentRecoveryOutcomes: {
      checkedAt: 1_000,
      entries: [
        {
          actionId: "support.bundle",
          afterStatus: "fail",
          at: 950,
          beforeStatus: "warn",
          eventId: "audit-recovery-1",
          outcome: "regressed",
        },
      ],
      failed: 0,
      improved: 0,
      regressed: 1,
      total: 1,
      unchanged: 0,
    },
    incidentRecoveryOutcomeReadiness: {
      href: "/voice/incident-recovery-outcomes",
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.incidentRecoveryOutcomes).toMatchObject({
    regressed: 1,
    status: "fail",
    total: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/voice/incident-recovery-outcomes",
        label: "Incident recovery outcomes",
        status: "fail",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport gates observability export delivery history", async () => {
  const store = createVoiceMemoryTraceEventStore();
  const receipts = createVoiceMemoryObservabilityExportDeliveryReceiptStore();
  await receipts.set("receipt-1", {
    checkedAt: Date.now() - 1_000,
    destinations: [],
    exportStatus: "pass",
    id: "receipt-1",
    runId: "run-1",
    status: "pass",
    summary: {
      delivered: 2,
      failed: 0,
      total: 2,
    },
  });

  const report = await buildVoiceProductionReadinessReport({
    links: {
      observabilityExportDeliveries:
        "/api/voice/observability-export/deliveries",
    },
    observabilityExportDeliveryHistory: {
      failOnMissing: true,
      failOnStale: true,
      maxAgeMs: 60_000,
      store: receipts,
    },
    store,
  });

  expect(report.summary.observabilityExportDeliveryHistory).toMatchObject({
    delivered: 2,
    failed: 0,
    receipts: 1,
    status: "pass",
    totalDestinations: 2,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/api/voice/observability-export/deliveries",
        label: "Observability export delivery",
        status: "pass",
        value: "2/2",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport gates calibrated monitoring runtime ceilings", async () => {
  const report = await buildVoiceProductionReadinessReport({
    monitoring: {
      checkedAt: 100,
      elapsedMs: 1_200,
      issues: [],
      runs: [],
      status: "pass",
      summary: {
        acknowledged: 0,
        criticalOpen: 0,
        failed: 0,
        muted: 0,
        open: 0,
        passed: 1,
        resolved: 0,
        total: 1,
        warned: 0,
      },
    },
    monitoringNotifierDelivery: {
      checkedAt: 100,
      elapsedMs: 900,
      receipts: [],
      status: "pass",
      summary: {
        failed: 0,
        notifiers: 1,
        sent: 1,
        skipped: 0,
        total: 1,
      },
    },
    monitoringNotifierDeliveryFailAfterMs: 800,
    monitoringRunFailAfterMs: 1_000,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.monitoring).toMatchObject({
    elapsedMs: 1_200,
    status: "fail",
  });
  expect(report.summary.monitoringNotifierDelivery).toMatchObject({
    elapsedMs: 900,
    status: "fail",
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        detail: expect.stringContaining("Monitor run took 1200ms"),
        label: "Monitoring issues",
        status: "fail",
      }),
      expect.objectContaining({
        detail: expect.stringContaining(
          "Monitor notification delivery took 900ms",
        ),
        label: "Monitor notifier delivery",
        status: "fail",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessGate fails missing observability export delivery history when required", async () => {
  const report = await buildVoiceProductionReadinessReport({
    observabilityExportDeliveryHistory: {
      failOnMissing: true,
      store: createVoiceMemoryObservabilityExportDeliveryReceiptStore(),
    },
    store: createVoiceMemoryTraceEventStore(),
  });
  const gate = summarizeVoiceProductionReadinessGate(report);

  expect(report.summary.observabilityExportDeliveryHistory).toMatchObject({
    receipts: 0,
    status: "fail",
  });
  expect(gate.ok).toBe(false);
  expect(gate.failures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "voice.readiness.observability_export_delivery",
        label: "Observability export delivery",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport gates observability export replay proof", async () => {
  const observabilityExport = await buildVoiceObservabilityExport({
    artifacts: [
      {
        id: "proof-pack",
        kind: "proof-pack",
        label: "Proof pack",
        status: "pass",
      },
    ],
  });
  const replay = buildVoiceObservabilityExportReplayReport({
    artifactIndex: buildVoiceObservabilityArtifactIndex(observabilityExport),
    manifest: observabilityExport,
  });

  const report = await buildVoiceProductionReadinessReport({
    observabilityExportReplay: replay,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.observabilityExportReplay).toMatchObject({
    artifacts: 1,
    failedArtifacts: 0,
    status: "pass",
    validationIssues: 0,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Observability export replay",
        status: "pass",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessGate fails failed observability export replay", async () => {
  const observabilityExport = await buildVoiceObservabilityExport({
    artifacts: [
      {
        id: "proof-pack",
        kind: "proof-pack",
        label: "Proof pack",
        status: "pass",
      },
    ],
  });
  const replay = buildVoiceObservabilityExportReplayReport({
    artifactIndex: buildVoiceObservabilityArtifactIndex(observabilityExport),
    manifest: {
      ...observabilityExport,
      schema: {
        id: "com.absolutejs.voice.observability-export",
        version: "0.9.0",
      },
    },
  });

  const report = await buildVoiceProductionReadinessReport({
    observabilityExportReplay: replay,
    store: createVoiceMemoryTraceEventStore(),
  });
  const gate = summarizeVoiceProductionReadinessGate(report);

  expect(report.summary.observabilityExportReplay).toMatchObject({
    status: "fail",
    validationIssues: 1,
  });
  expect(gate.ok).toBe(false);
  expect(gate.failures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "voice.readiness.observability_export_replay",
        label: "Observability export replay",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessGate fails failed observability export proof", async () => {
  const store = createVoiceMemoryTraceEventStore();
  const event = await store.append(
    createVoiceTraceEvent({
      at: 1_000,
      payload: { type: "start" },
      sessionId: "session-1",
      type: "call.lifecycle",
    }),
  );
  const observabilityExport = await buildVoiceObservabilityExport({
    store,
    traceDeliveries: [
      createVoiceTraceSinkDeliveryRecord({
        deliveryAttempts: 1,
        deliveryError: "warehouse unavailable",
        deliveryStatus: "failed",
        events: [event],
        id: "trace-delivery-failed",
      }),
    ],
  });
  const report = await buildVoiceProductionReadinessReport({
    observabilityExport,
    store,
  });
  const gate = summarizeVoiceProductionReadinessGate(report);

  expect(report.status).toBe("fail");
  expect(report.summary.observabilityExport).toMatchObject({
    issues: 1,
    status: "fail",
  });
  expect(gate.ok).toBe(false);
  expect(gate.failures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "voice.readiness.observability_export",
        label: "Observability export",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessGate fails failed campaign readiness proof", async () => {
  const campaignReadiness = await runVoiceCampaignReadinessProof();
  const report = await buildVoiceProductionReadinessReport({
    campaignReadiness: {
      ...campaignReadiness,
      checks: [
        ...campaignReadiness.checks,
        {
          name: "forced-campaign-failure",
          status: "fail",
        },
      ],
      ok: false,
    },
    store: createVoiceMemoryTraceEventStore(),
  });
  const gate = summarizeVoiceProductionReadinessGate(report);

  expect(report.status).toBe("fail");
  expect(report.summary.campaignReadiness).toMatchObject({
    failed: 1,
    status: "fail",
  });
  expect(gate.ok).toBe(false);
  expect(gate.failures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "voice.readiness.campaign_readiness",
        label: "Campaign readiness proof",
      }),
    ]),
  );
});

test("summarizeVoiceProductionReadinessGate exposes stable deploy failure codes", async () => {
  const report = await buildVoiceProductionReadinessReport({
    llmProviders: ["openai"],
    store: createVoiceMemoryTraceEventStore(),
  });
  const gate = summarizeVoiceProductionReadinessGate(report);

  expect(gate.ok).toBe(true);
  expect(gate.status).toBe("warn");
  expect(gate.failures).toEqual([]);
  expect(gate.warnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "voice.readiness.routing_evidence",
        label: "Routing evidence",
        status: "warn",
      }),
      expect.objectContaining({
        code: "voice.readiness.session_health",
        label: "Session health",
        status: "warn",
      }),
    ]),
  );
});

test("summarizeVoiceProductionReadinessGate groups issues by profile surface", async () => {
  const report = await buildVoiceProductionReadinessReport({
    gate: {
      failOnWarnings: true,
    },
    profile: {
      description: "Phone-agent readiness.",
      name: "phone-agent",
      purpose: "Certifies phone-agent proof surfaces.",
      surfaces: [
        {
          configured: true,
          href: "/sessions",
          key: "sessions",
          label: "Session health",
        },
        {
          configured: true,
          href: "/delivery-runtime",
          key: "deliveryRuntime",
          label: "Delivery runtime",
        },
      ],
    },
    store: createVoiceMemoryTraceEventStore(),
  });
  const gate = summarizeVoiceProductionReadinessGate(report, {
    failOnWarnings: true,
  });

  expect(gate.profile).toMatchObject({
    name: "phone-agent",
    surfaces: expect.arrayContaining([
      expect.objectContaining({
        key: "sessions",
        status: "warn",
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: "voice.readiness.session_health",
          }),
        ]),
      }),
      expect.objectContaining({
        key: "deliveryRuntime",
        status: "pass",
        issues: [],
      }),
    ]),
  });
});

test("buildVoiceProductionReadinessGate can close deploy gate on warnings", async () => {
  const gate = await buildVoiceProductionReadinessGate({
    gate: {
      failOnWarnings: true,
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(gate.ok).toBe(false);
  expect(gate.status).toBe("fail");
  expect(gate.failures).toEqual([]);
  expect(gate.warnings.length).toBeGreaterThan(0);
});

test("buildVoiceProductionReadinessReport fails missing audit evidence", async () => {
  const audit = createVoiceMemoryAuditEventStore();
  await audit.append({
    action: "llm.provider.call",
    outcome: "success",
    payload: {
      kind: "llm",
      provider: "openai",
    },
    resource: {
      id: "openai",
      type: "provider",
    },
    type: "provider.call",
  });

  const report = await buildVoiceProductionReadinessReport({
    audit,
    links: {
      audit: "/ops/audit",
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.audit).toMatchObject({
    events: 1,
    status: "fail",
  });
  expect(
    report.summary.audit?.missing.map((requirement) => requirement.type),
  ).toEqual(["retention.policy", "operator.action"]);
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/ops/audit",
        label: "Audit evidence",
        status: "fail",
        value: "1/3",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport accepts complete audit evidence", async () => {
  const audit = createVoiceMemoryAuditEventStore();
  await Promise.all([
    audit.append({
      action: "llm.provider.call",
      outcome: "success",
      type: "provider.call",
    }),
    audit.append({
      action: "retention.apply",
      outcome: "success",
      type: "retention.policy",
    }),
    audit.append({
      action: "review.approve",
      actor: {
        id: "operator-1",
        kind: "operator",
      },
      outcome: "success",
      type: "operator.action",
    }),
  ]);

  const report = await buildVoiceProductionReadinessReport({
    audit,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.audit).toMatchObject({
    events: 3,
    status: "pass",
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Audit evidence",
        status: "pass",
        value: "3/3",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport fails failed operator action history", async () => {
  const audit = createVoiceMemoryAuditEventStore();
  await recordVoiceOpsActionAudit(
    {
      actionId: "delivery-runtime.tick",
      error: "worker unavailable",
      ok: false,
      ranAt: Date.now(),
      status: 503,
    },
    { audit },
  );

  const report = await buildVoiceProductionReadinessReport({
    links: {
      opsActions: "/ops/actions",
    },
    opsActionHistory: audit,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.opsActionHistory).toMatchObject({
    failed: 1,
    passed: 0,
    status: "fail",
    total: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/ops/actions",
        label: "Operator action history",
        status: "fail",
        value: "0/1",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport can warn on failed operator action history", async () => {
  const audit = createVoiceMemoryAuditEventStore();
  await recordVoiceOpsActionAudit(
    {
      actionId: "delivery-runtime.requeue-dead-letters",
      error: "no lease",
      ok: false,
      ranAt: Date.now(),
      status: 409,
    },
    { audit },
  );

  const report = await buildVoiceProductionReadinessReport({
    opsActionHistory: {
      failOnFailedActions: false,
      store: audit,
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.opsActionHistory).toMatchObject({
    failed: 1,
    status: "warn",
    total: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Operator action history",
        status: "warn",
        value: "0/1",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport fails stale retention audit evidence", async () => {
  const audit = createVoiceMemoryAuditEventStore();
  const staleRetentionAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
  await Promise.all([
    audit.append({
      action: "llm.provider.call",
      outcome: "success",
      type: "provider.call",
    }),
    audit.append({
      action: "retention.apply",
      at: staleRetentionAt,
      outcome: "success",
      type: "retention.policy",
    }),
    audit.append({
      action: "review.approve",
      actor: {
        id: "operator-1",
        kind: "operator",
      },
      outcome: "success",
      type: "operator.action",
    }),
  ]);

  const report = await buildVoiceProductionReadinessReport({
    audit,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(
    report.summary.audit?.missing.map((requirement) => requirement.type),
  ).toEqual(["retention.policy"]);
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Audit evidence",
        status: "fail",
        value: "2/3",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport allows custom retention freshness windows", async () => {
  const audit = createVoiceMemoryAuditEventStore();
  const retentionAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
  await Promise.all([
    audit.append({
      action: "llm.provider.call",
      outcome: "success",
      type: "provider.call",
    }),
    audit.append({
      action: "retention.apply",
      at: retentionAt,
      outcome: "success",
      type: "retention.policy",
    }),
    audit.append({
      action: "review.approve",
      actor: {
        id: "operator-1",
        kind: "operator",
      },
      outcome: "success",
      type: "operator.action",
    }),
  ]);

  const report = await buildVoiceProductionReadinessReport({
    audit: {
      require: [
        "provider.call",
        {
          maxAgeMs: 14 * 24 * 60 * 60 * 1000,
          type: "retention.policy",
        },
        "operator.action",
      ],
      store: audit,
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.audit).toMatchObject({
    status: "pass",
  });
});

test("buildVoiceProductionReadinessReport fails unhealthy audit sink deliveries", async () => {
  const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
  const event = createVoiceAuditEvent({
    action: "provider.call",
    type: "provider.call",
  });
  await auditDeliveries.set(
    "audit-delivery-failed",
    createVoiceAuditSinkDeliveryRecord({
      events: [event],
      id: "audit-delivery-failed",
      deliveryAttempts: 2,
      deliveryError: "warehouse unavailable",
      deliveryStatus: "failed",
    }),
  );

  const report = await buildVoiceProductionReadinessReport({
    auditDeliveries,
    links: {
      auditDeliveries: "/ops/audit-deliveries",
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.auditDeliveries).toMatchObject({
    failed: 1,
    status: "fail",
    total: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/ops/audit-deliveries",
        label: "Audit sink delivery",
        status: "fail",
        value: "0/1",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport warns then fails stale audit sink backlog", async () => {
  const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
  const event = createVoiceAuditEvent({
    action: "tool.call",
    type: "tool.call",
  });
  await auditDeliveries.set(
    "audit-delivery-pending",
    createVoiceAuditSinkDeliveryRecord({
      createdAt: Date.now() - 2_000,
      events: [event],
      id: "audit-delivery-pending",
    }),
  );

  const warningReport = await buildVoiceProductionReadinessReport({
    auditDeliveries: {
      failPendingAfterMs: 10_000,
      store: auditDeliveries,
      warnPendingAfterMs: 1_000,
    },
    store: createVoiceMemoryTraceEventStore(),
  });
  const failingReport = await buildVoiceProductionReadinessReport({
    auditDeliveries: {
      failPendingAfterMs: 1_000,
      store: auditDeliveries,
      warnPendingAfterMs: 500,
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(warningReport.summary.auditDeliveries).toMatchObject({
    pending: 1,
    staleWarning: 1,
    status: "warn",
  });
  expect(failingReport.summary.auditDeliveries).toMatchObject({
    pending: 1,
    staleFailing: 1,
    status: "fail",
  });
});

test("buildVoiceProductionReadinessReport fails unhealthy trace sink deliveries", async () => {
  const traceDeliveries = createVoiceMemoryTraceSinkDeliveryStore();
  const event = createVoiceTraceEvent({
    at: 100,
    payload: {
      error: "provider failed",
    },
    sessionId: "session-trace",
    type: "session.error",
  });
  await traceDeliveries.set(
    "trace-delivery-failed",
    createVoiceTraceSinkDeliveryRecord({
      events: [event],
      id: "trace-delivery-failed",
      deliveryAttempts: 2,
      deliveryError: "trace warehouse unavailable",
      deliveryStatus: "failed",
    }),
  );

  const report = await buildVoiceProductionReadinessReport({
    links: {
      traceDeliveries: "/ops/trace-deliveries",
    },
    store: createVoiceMemoryTraceEventStore(),
    traceDeliveries,
  });

  expect(report.status).toBe("fail");
  expect(report.summary.traceDeliveries).toMatchObject({
    failed: 1,
    status: "fail",
    total: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/ops/trace-deliveries",
        label: "Trace sink delivery",
        status: "fail",
        value: "0/1",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport warns then fails stale trace sink backlog", async () => {
  const traceDeliveries = createVoiceMemoryTraceSinkDeliveryStore();
  const event = createVoiceTraceEvent({
    at: 100,
    payload: {
      text: "hello",
    },
    sessionId: "session-trace",
    type: "turn.assistant",
  });
  await traceDeliveries.set(
    "trace-delivery-pending",
    createVoiceTraceSinkDeliveryRecord({
      createdAt: Date.now() - 2_000,
      events: [event],
      id: "trace-delivery-pending",
    }),
  );

  const warningReport = await buildVoiceProductionReadinessReport({
    store: createVoiceMemoryTraceEventStore(),
    traceDeliveries: {
      failPendingAfterMs: 10_000,
      store: traceDeliveries,
      warnPendingAfterMs: 1_000,
    },
  });
  const failingReport = await buildVoiceProductionReadinessReport({
    store: createVoiceMemoryTraceEventStore(),
    traceDeliveries: {
      failPendingAfterMs: 1_000,
      store: traceDeliveries,
      warnPendingAfterMs: 500,
    },
  });

  expect(warningReport.summary.traceDeliveries).toMatchObject({
    pending: 1,
    staleWarning: 1,
    status: "warn",
  });
  expect(failingReport.summary.traceDeliveries).toMatchObject({
    pending: 1,
    staleFailing: 1,
    status: "fail",
  });
});

test("buildVoiceProductionReadinessReport fails provider and carrier blockers", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await store.append({
    at: 100,
    payload: {
      error: "OpenAI voice TTS failed: HTTP 503",
      kind: "tts",
      provider: "openai",
      providerStatus: "error",
      suppressedUntil: 500,
    },
    sessionId: "call-1",
    type: "session.error",
  });
  await store.append({
    at: 110,
    payload: {
      fallbackProvider: "emergency",
      kind: "tts",
      provider: "emergency",
      providerStatus: "fallback",
      selectedProvider: "openai",
    },
    sessionId: "call-1",
    type: "session.error",
  });

  const report = await buildVoiceProductionReadinessReport({
    carriers: [
      {
        setup: {
          generatedAt: 100,
          missing: ["VOICE_DEMO_PUBLIC_BASE_URL"],
          provider: "twilio",
          ready: false,
          signing: {
            configured: false,
            mode: "none",
          },
          urls: {
            stream: "",
            webhook: "",
          },
          warnings: [],
        },
      },
    ],
    store,
    ttsProviders: ["openai", "emergency"],
  });

  expect(report.status).toBe("fail");
  expect(report.summary.carriers).toMatchObject({
    failing: 1,
    providers: 1,
    status: "fail",
  });
  expect(report.summary.sessions.failed).toBe(1);
  expect(report.summary.providerRecovery).toEqual({
    recovered: 0,
    recoveredSessions: 0,
    recoveredTurns: 0,
    status: "fail",
    total: 1,
    unresolvedErrors: 1,
    unresolvedSessions: 1,
  });
  expect(report.summary.routing.events).toBe(2);
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Provider fallback recovery",
        status: "fail",
        value: "0/1",
      }),
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            label: "Replay failed sessions",
          }),
        ]),
        label: "Session health",
      }),
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            label: "Open carrier matrix",
          }),
        ]),
        label: "Carrier readiness",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport can ignore stale trace failures", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await store.append({
    at: Date.now() - 60 * 60 * 1000,
    payload: {
      error: "stale provider outage",
      kind: "llm",
      provider: "openai",
      providerStatus: "error",
    },
    sessionId: "stale-failed-session",
    type: "session.error",
  });

  const report = await buildVoiceProductionReadinessReport({
    llmProviders: ["openai"],
    store,
    traceMaxAgeMs: 1_000,
  });

  expect(report.summary.providerRecovery).toMatchObject({
    status: "pass",
    total: 0,
    unresolvedErrors: 0,
  });
  expect(report.summary.sessions).toMatchObject({
    failed: 0,
    total: 0,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Provider fallback recovery",
        status: "pass",
        value: "0 events",
      }),
      expect.objectContaining({
        label: "Session health",
        status: "warn",
        value: "0/0",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport links failures to operations records", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await Promise.all([
    store.append(
      createVoiceTraceEvent({
        at: 100,
        payload: {
          type: "start",
        },
        sessionId: "call-ops-fail",
        type: "call.lifecycle",
      }),
    ),
    store.append(
      createVoiceTraceEvent({
        at: 120,
        payload: {
          error: "OpenAI realtime failed",
          provider: "openai",
          providerStatus: "error",
        },
        sessionId: "call-ops-fail",
        type: "session.error",
      }),
    ),
    store.append(
      createVoiceTraceEvent({
        at: 140,
        payload: {
          latencyMs: 3400,
        },
        sessionId: "call-ops-fail",
        turnId: "turn-1",
        type: "client.live_latency",
      }),
    ),
  ]);

  const report = await buildVoiceProductionReadinessReport({
    links: {
      operationsRecords: "/ops/records/:sessionId",
      sessions: "/sessions",
      liveLatency: "/latency",
      resilience: "/resilience",
    },
    store,
  });

  expect(report.operationsRecords).toMatchObject({
    failedSessions: [
      {
        href: "/ops/records/call-ops-fail",
        sessionId: "call-ops-fail",
        status: "fail",
      },
    ],
    failingLatency: [
      {
        href: "/ops/records/call-ops-fail",
        sessionId: "call-ops-fail",
        status: "fail",
      },
    ],
    providerErrors: [
      {
        href: "/ops/records/call-ops-fail",
        sessionId: "call-ops-fail",
        status: "fail",
      },
    ],
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/ops/records/call-ops-fail",
        label: "Session health",
        actions: expect.arrayContaining([
          expect.objectContaining({
            href: "/ops/records/call-ops-fail",
            label: "Open failed operations record",
          }),
          expect.objectContaining({
            href: "/sessions?status=failed",
            label: "Replay failed sessions",
          }),
        ]),
      }),
      expect.objectContaining({
        href: "/ops/records/call-ops-fail",
        label: "Provider fallback recovery",
        actions: expect.arrayContaining([
          expect.objectContaining({
            href: "/ops/records/call-ops-fail",
            label: "Open failing operations record",
          }),
        ]),
      }),
      expect.objectContaining({
        href: "/ops/records/call-ops-fail",
        label: "Live latency proof",
        actions: expect.arrayContaining([
          expect.objectContaining({
            href: "/ops/records/call-ops-fail",
            label: "Open latency operations record",
          }),
        ]),
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport gates ops recovery with operations record links", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await store.append(
    createVoiceTraceEvent({
      at: 100,
      payload: {
        error: "provider outage",
        provider: "openai",
        providerStatus: "error",
        rateLimited: true,
      },
      sessionId: "ops-recovery-fail",
      type: "session.error",
    }),
  );
  const opsRecovery = await buildVoiceOpsRecoveryReport({
    links: {
      operationsRecords: "/voice-operations/:sessionId",
      providers: "/provider-status",
    },
    providers: ["openai"],
    traces: store,
  });

  const report = await buildVoiceProductionReadinessReport({
    links: {
      operationsRecords: "/voice-operations/:sessionId",
      opsRecovery: "/ops-recovery",
    },
    opsRecovery,
    store,
  });
  const gate = summarizeVoiceProductionReadinessGate(report);

  expect(report.summary.opsRecovery).toMatchObject({
    issues: 1,
    status: "fail",
    unresolvedProviderFailures: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/ops-recovery",
        label: "Ops recovery",
        status: "fail",
        actions: expect.arrayContaining([
          expect.objectContaining({
            href: "/voice-operations/ops-recovery-fail",
            label: "Open impacted operations record",
          }),
        ]),
      }),
    ]),
  );
  expect(gate.failures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "voice.readiness.ops_recovery",
        label: "Ops recovery",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport fails failing agent squad contracts", async () => {
  const report = await buildVoiceProductionReadinessReport({
    agentSquadContracts: [
      {
        contractId: "billing-route",
        issues: [],
        pass: true,
        sessionId: "contract-session-1",
        turns: [],
      },
      {
        contractId: "legal-route",
        issues: [
          {
            code: "agent_squad.handoff_mismatch",
            message: "Expected legal handoff to be blocked.",
          },
        ],
        pass: false,
        sessionId: "contract-session-2",
        turns: [],
      },
    ],
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.agentSquadContracts).toEqual({
    failed: 1,
    passed: 1,
    status: "fail",
    total: 2,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            label: "Open squad contracts",
          }),
        ]),
        label: "Agent squad contracts",
        status: "fail",
        value: "1/2",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport accepts resolved agent squad contracts", async () => {
  const report = await buildVoiceProductionReadinessReport({
    agentSquadContracts: async () => [
      {
        contractId: "billing-route",
        issues: [],
        pass: true,
        sessionId: "contract-session-1",
        turns: [],
      },
    ],
    links: {
      agentSquadContracts: "/agent-squad-contract",
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.agentSquadContracts).toEqual({
    failed: 0,
    passed: 1,
    status: "pass",
    total: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/agent-squad-contract",
        label: "Agent squad contracts",
        status: "pass",
        value: "1/1",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport fails failing provider routing contracts", async () => {
  const report = await buildVoiceProductionReadinessReport({
    providerRoutingContracts: [
      {
        contractId: "openai-anthropic-fallback",
        events: [],
        issues: [],
        pass: true,
      },
      {
        contractId: "openai-gemini-fallback",
        events: [],
        issues: [
          {
            code: "provider_routing.expected_event_missing",
            message: "Expected Gemini fallback.",
          },
        ],
        pass: false,
      },
    ],
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.providerRoutingContracts).toEqual({
    failed: 1,
    passed: 1,
    status: "fail",
    total: 2,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            label: "Open provider routing contracts",
          }),
        ]),
        label: "Provider routing contracts",
        status: "fail",
        value: "1/2",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport gates provider SLO reports", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await store.append(
    createVoiceTraceEvent({
      at: 1_000,
      payload: {
        elapsedMs: 4_200,
        kind: "llm",
        provider: "openai",
        providerStatus: "success",
      },
      sessionId: "provider-slo-session",
      type: "session.error",
    }),
  );
  const report = await buildVoiceProductionReadinessReport({
    links: {
      providerSlo: "/voice/provider-slos",
    },
    providerSlo: {
      requiredKinds: ["llm"],
      thresholds: {
        llm: {
          maxAverageElapsedMs: 1_000,
          maxP95ElapsedMs: 1_000,
        },
      },
    },
    store,
  });

  expect(report.status).toBe("fail");
  expect(report.summary.providerSlo).toMatchObject({
    events: 1,
    eventsWithLatency: 1,
    status: "fail",
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Provider SLO gates",
        status: "fail",
        href: "/voice/provider-slos",
        actions: expect.arrayContaining([
          expect.objectContaining({
            label: "Open provider SLO report",
          }),
        ]),
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport gates provider orchestration profiles", async () => {
  const profile = createVoiceProviderOrchestrationProfile({
    id: "readiness-provider-policy",
    surfaces: {
      "live-call": {
        policy: "latency-first",
        providerProfiles: {
          openai: { latencyMs: 650, quality: 0.92 },
        },
      },
    },
  });
  const providerOrchestration = buildVoiceProviderOrchestrationReport({
    profile,
    requirements: {
      "live-call": {
        minProviders: 2,
        requireBudgetPolicy: true,
        requireCircuitBreaker: true,
        requireFallback: true,
        requireTimeoutBudget: true,
      },
    },
  });
  const report = await buildVoiceProductionReadinessReport({
    links: {
      providerOrchestration: "/voice/provider-orchestration",
    },
    providerOrchestration,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.providerOrchestration).toMatchObject({
    failed: 1,
    issues: 5,
    status: "fail",
    surfaces: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            label: "Open provider orchestration proof",
          }),
        ]),
        href: "/voice/provider-orchestration",
        label: "Provider orchestration profiles",
        status: "fail",
        value: "0/1",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport fails failing phone-agent production smoke contracts", async () => {
  const report = await buildVoiceProductionReadinessReport({
    links: {
      phoneAgentSmoke: "/ops/phone-smoke",
    },
    phoneAgentSmokes: [
      {
        contractId: "twilio-phone-smoke",
        generatedAt: 100,
        issues: [],
        observed: {
          assistantResponses: 1,
          lifecycleOutcomes: ["completed"],
          latestEventAt: 100,
          mediaStarts: 1,
          sessionErrors: 0,
          transcripts: 1,
        },
        pass: true,
        provider: "twilio",
        required: [
          "media-started",
          "transcript",
          "assistant-response",
          "lifecycle-outcome",
          "no-session-error",
        ],
        sessionId: "phone-smoke-pass",
      },
      {
        contractId: "telnyx-phone-smoke",
        generatedAt: 100,
        issues: [
          {
            message: "No assistant response trace was recorded.",
            requirement: "assistant-response",
            severity: "error",
          },
        ],
        observed: {
          assistantResponses: 0,
          lifecycleOutcomes: ["completed"],
          latestEventAt: 100,
          mediaStarts: 1,
          sessionErrors: 0,
          transcripts: 1,
        },
        pass: false,
        provider: "telnyx",
        required: [
          "media-started",
          "transcript",
          "assistant-response",
          "lifecycle-outcome",
          "no-session-error",
        ],
        sessionId: "phone-smoke-fail",
      },
    ],
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.phoneAgentSmokes).toEqual({
    failed: 1,
    passed: 1,
    status: "fail",
    total: 2,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/ops/phone-smoke",
        label: "Phone agent production smoke",
        status: "fail",
        value: "1/2",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport fails failing reconnect contracts", async () => {
  const report = await buildVoiceProductionReadinessReport({
    links: {
      reconnectContracts: "/voice/reconnect-contract",
    },
    reconnectContracts: [
      {
        checkedAt: 100,
        issues: [],
        pass: true,
        snapshotCount: 2,
        statuses: ["reconnecting", "resumed"],
        summary: {
          attempts: 1,
          duplicateTurnIds: [],
          exhausted: false,
          maxAttempts: 10,
          reconnected: true,
          resumed: true,
        },
      },
      {
        checkedAt: 100,
        issues: [
          {
            code: "reconnect.resume_not_observed",
            message: "Reconnect started but no resumed state was observed.",
            severity: "error",
          },
        ],
        pass: false,
        snapshotCount: 1,
        statuses: ["reconnecting"],
        summary: {
          attempts: 1,
          duplicateTurnIds: [],
          exhausted: false,
          maxAttempts: 10,
          reconnected: true,
          resumed: false,
        },
      },
    ],
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.reconnectContracts).toEqual({
    failed: 1,
    passed: 1,
    status: "fail",
    total: 2,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/voice/reconnect-contract",
        label: "Reconnect recovery contracts",
        status: "fail",
        value: "1/2",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport gates calibrated reconnect resume latency", async () => {
  const report = await buildVoiceProductionReadinessReport({
    links: {
      reconnectContracts: "/voice/reconnect-contract",
    },
    reconnectContracts: [
      {
        checkedAt: 100,
        issues: [],
        pass: true,
        resumeLatencyP95Ms: 1_800,
        snapshotCount: 2,
        statuses: ["reconnecting", "resumed"],
        summary: {
          attempts: 1,
          duplicateTurnIds: [],
          exhausted: false,
          maxAttempts: 10,
          reconnected: true,
          resumed: true,
        },
      },
    ],
    reconnectResumeFailAfterMs: 1_500,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.reconnectContracts).toMatchObject({
    failed: 1,
    passed: 0,
    resumeLatencyP95Ms: 1_800,
    status: "fail",
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        detail: expect.stringContaining("Reconnect resume p95 1800ms"),
        href: "/voice/reconnect-contract",
        label: "Reconnect recovery contracts",
        status: "fail",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport enforces reconnect contract breadth thresholds", async () => {
  const report = await buildVoiceProductionReadinessReport({
    links: {
      reconnectContracts: "/voice/reconnect-contract",
    },
    reconnectContracts: [
      {
        checkedAt: 100,
        issues: [],
        pass: true,
        snapshotCount: 1,
        statuses: ["reconnecting", "resumed"],
        summary: {
          attempts: 1,
          duplicateTurnIds: [],
          exhausted: false,
          maxAttempts: 10,
          reconnected: true,
          resumed: true,
        },
      },
    ],
    reconnectContractsMinCount: 2,
    reconnectContractsMinSnapshotsPerContract: 2,
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.reconnectContracts).toMatchObject({
    failed: 1,
    passed: 0,
    status: "fail",
    total: 1,
  });

  const check = report.checks.find(
    (check) => check.label === "Reconnect recovery contracts",
  );
  expect(check?.status).toBe("fail");
  expect(check?.detail).toContain(
    "Expected at least 2 reconnect contract(s), observed 1.",
  );
  expect(check?.detail).toContain(
    "1 reconnect contract(s) with fewer than 2 snapshot(s).",
  );
});

test("buildVoiceProductionReadinessReport accepts reconnect proof reports and requires observed resume", async () => {
  const report = await buildVoiceProductionReadinessReport({
    links: {
      reconnectContracts: "/api/voice/reconnect-proof",
    },
    reconnectContracts: [
      buildVoiceReconnectProofReport({
        completedSessionCount: 1,
      }),
    ],
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.reconnectContracts).toMatchObject({
    failed: 1,
    passed: 0,
    status: "fail",
    total: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        detail: expect.stringContaining("did not observe reconnect resume"),
        href: "/api/voice/reconnect-proof",
        label: "Reconnect recovery contracts",
        status: "fail",
        value: "0/1",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport passes reconnect proof reports with observed resume", async () => {
  const report = await buildVoiceProductionReadinessReport({
    links: {
      reconnectContracts: "/api/voice/reconnect-proof",
    },
    reconnectContracts: [
      buildVoiceReconnectProofReport({
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
      }),
    ],
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.summary.reconnectContracts).toMatchObject({
    failed: 0,
    passed: 1,
    status: "pass",
    total: 1,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/api/voice/reconnect-proof",
        label: "Reconnect recovery contracts",
        status: "pass",
        value: "1/1",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport fails failing barge-in proof reports", async () => {
  const report = await buildVoiceProductionReadinessReport({
    bargeInReports: [
      {
        averageLatencyMs: 94,
        checkedAt: 100,
        events: [],
        failed: 0,
        lastEvent: undefined,
        passed: 1,
        sessions: [],
        status: "pass",
        thresholdMs: 250,
        total: 1,
      },
      {
        averageLatencyMs: 390,
        checkedAt: 100,
        events: [],
        failed: 1,
        lastEvent: undefined,
        passed: 0,
        sessions: [],
        status: "fail",
        thresholdMs: 250,
        total: 1,
      },
    ],
    links: {
      bargeIn: "/barge-in",
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("fail");
  expect(report.summary.bargeIn).toEqual({
    failed: 1,
    passed: 1,
    status: "fail",
    total: 2,
    warnings: 0,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/barge-in",
        label: "Barge-in interruption proof",
        status: "fail",
        value: "1/2",
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport attaches proof sources to readiness checks", async () => {
  const report = await buildVoiceProductionReadinessReport({
    bargeInReports: [
      {
        averageLatencyMs: 94,
        checkedAt: 100,
        events: [],
        failed: 0,
        lastEvent: undefined,
        passed: 1,
        sessions: [],
        status: "pass",
        thresholdMs: 250,
        total: 1,
      },
    ],
    proofSources: {
      bargeIn: {
        detail: "Captured from browser interruption traces.",
        href: "/barge-in",
        source: "live",
        sourceLabel: "Live browser barge-in traces",
      },
      reconnectContracts: {
        href: "/voice/reconnect-contract",
        source: "live",
        sourceLabel: "Live reconnect traces",
      },
    },
    reconnectContracts: [
      {
        checkedAt: 100,
        issues: [],
        pass: true,
        snapshotCount: 2,
        statuses: ["reconnecting", "resumed"],
        summary: {
          attempts: 1,
          duplicateTurnIds: [],
          exhausted: false,
          maxAttempts: 10,
          reconnected: true,
          resumed: true,
        },
      },
    ],
    store: createVoiceMemoryTraceEventStore(),
  });
  const html = renderVoiceProductionReadinessHTML(report);

  expect(report.proofSources?.bargeIn?.source).toBe("live");
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Barge-in interruption proof",
        proofSource: expect.objectContaining({
          sourceLabel: "Live browser barge-in traces",
        }),
      }),
      expect.objectContaining({
        label: "Reconnect recovery contracts",
        proofSource: expect.objectContaining({
          sourceLabel: "Live reconnect traces",
        }),
      }),
    ]),
  );
  expect(html).toContain("Proof source:");
  expect(html).toContain("Live browser barge-in traces");
  expect(html).toContain("Live reconnect traces");
});

test("buildVoiceProductionReadinessReport attaches proof sources to evidence checks", async () => {
  const auditStore = createVoiceMemoryAuditSinkDeliveryStore();
  const traceStore = createVoiceMemoryTraceSinkDeliveryStore();
  const auditEvent = createVoiceAuditEvent({
    action: "provider.call",
    type: "provider.call",
  });
  const traceEvent = createVoiceTraceEvent({
    at: 100,
    payload: {
      provider: "openai",
    },
    sessionId: "routing-proof",
    type: "provider.selected",
  });
  await auditStore.set(
    "audit-delivery-proof",
    createVoiceAuditSinkDeliveryRecord({
      deliveredAt: Date.now(),
      deliveryStatus: "delivered",
      events: [auditEvent],
      id: "audit-delivery-proof",
    }),
  );
  await traceStore.set(
    "trace-delivery-proof",
    createVoiceTraceSinkDeliveryRecord({
      deliveredAt: Date.now(),
      deliveryStatus: "delivered",
      events: [traceEvent],
      id: "trace-delivery-proof",
    }),
  );
  const traceEventStore = createVoiceMemoryTraceEventStore();
  await traceEventStore.append(
    createVoiceTraceEvent({
      payload: {
        elapsedMs: 120,
        latencyMs: 120,
      },
      sessionId: "latency-proof",
      type: "client.live_latency",
    }),
  );
  const report = await buildVoiceProductionReadinessReport({
    auditDeliveries: auditStore,
    proofSources: {
      auditDeliveries: {
        source: "sink",
        sourceLabel: "Audit sink delivery store",
      },
      liveLatency: {
        source: "browser",
        sourceLabel: "Browser latency traces",
      },
      providerRoutingContracts: {
        source: "contract",
        sourceLabel: "Provider routing contract reports",
      },
      traceDeliveries: {
        source: "sink",
        sourceLabel: "Trace sink delivery store",
      },
    },
    providerRoutingContracts: [
      {
        checkedAt: 100,
        failures: [],
        pass: true,
        results: [
          {
            decision: {
              at: 100,
              metadata: {},
              primary: "openai",
              provider: "openai",
              reason: "healthy-primary",
              status: "selected",
            },
            expectedProvider: "openai",
            pass: true,
            scenario: "healthy-primary",
          },
        ],
        summary: {
          failed: 0,
          passed: 1,
          total: 1,
        },
      },
    ],
    store: traceEventStore,
    traceDeliveries: traceStore,
  });

  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Live latency proof",
        proofSource: expect.objectContaining({
          sourceLabel: "Browser latency traces",
        }),
      }),
      expect.objectContaining({
        label: "Provider routing contracts",
        proofSource: expect.objectContaining({
          sourceLabel: "Provider routing contract reports",
        }),
      }),
      expect.objectContaining({
        label: "Audit sink delivery",
        proofSource: expect.objectContaining({
          sourceLabel: "Audit sink delivery store",
        }),
      }),
      expect.objectContaining({
        label: "Trace sink delivery",
        proofSource: expect.objectContaining({
          sourceLabel: "Trace sink delivery store",
        }),
      }),
    ]),
  );
});

test("buildVoiceProductionReadinessReport links provider contract matrix to provider contracts surface", async () => {
  const report = await buildVoiceProductionReadinessReport({
    links: {
      providerContracts: "/provider-contracts",
    },
    proofSources: {
      providerContractMatrix: {
        href: "/provider-contracts",
        source: "preset",
        sourceLabel: "Provider contract matrix preset",
      },
    },
    providerContractMatrix: buildVoiceProviderContractMatrix({
      contracts: [
        {
          capabilities: ["tool calling"],
          kind: "llm",
          provider: "openai",
          requiredCapabilities: ["tool calling"],
          streaming: true,
        },
      ],
    }),
    store: createVoiceMemoryTraceEventStore(),
  });
  const check = report.checks.find(
    (item) => item.label === "Provider contract matrix",
  );

  expect(check).toMatchObject({
    href: "/provider-contracts",
    proofSource: {
      href: "/provider-contracts",
      sourceLabel: "Provider contract matrix preset",
    },
  });
  expect(renderVoiceProductionReadinessHTML(report)).toContain(
    'href="/provider-contracts"',
  );
});

test("buildVoiceProductionReadinessReport includes delivery runtime health", async () => {
  const report = await buildVoiceProductionReadinessReport({
    deliveryRuntime: {
      audit: {
        deadLettered: 0,
        delivered: 1,
        failed: 0,
        pending: 0,
        retryEligible: 0,
        skipped: 0,
        total: 1,
      },
      trace: {
        deadLettered: 0,
        delivered: 0,
        failed: 0,
        pending: 1,
        retryEligible: 0,
        skipped: 0,
        total: 1,
      },
    },
    links: {
      deliveryRuntime: "/ops/delivery-runtime",
    },
    proofSources: {
      deliveryRuntime: {
        source: "runtime",
        sourceLabel: "Delivery runtime control plane",
      },
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  expect(report.status).toBe("warn");
  expect(report.summary.deliveryRuntime).toMatchObject({
    delivered: 1,
    pending: 1,
    status: "warn",
    total: 2,
  });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/ops/delivery-runtime",
        label: "Delivery runtime",
        proofSource: expect.objectContaining({
          sourceLabel: "Delivery runtime control plane",
        }),
        status: "warn",
        value: "1/2",
      }),
    ]),
  );
});

test("production readiness routes expose json and html reports", async () => {
  const app = createVoiceProductionReadinessRoutes({
    links: {
      sloReadinessThresholds: "/voice/slo-readiness-thresholds",
    },
    store: createVoiceMemoryTraceEventStore(),
  });
  const json = await app.handle(
    new Request("http://localhost/api/production-readiness"),
  );
  const gate = await app.handle(
    new Request("http://localhost/api/production-readiness/gate"),
  );
  const html = await app.handle(
    new Request("http://localhost/production-readiness"),
  );

  expect(json.status).toBe(200);
  await expect(json.json()).resolves.toMatchObject({
    status: "warn",
  });
  expect(gate.status).toBe(200);
  await expect(gate.json()).resolves.toMatchObject({
    ok: true,
    status: "warn",
  });
  expect(html.status).toBe(200);
  const htmlBody = await html.text();
  expect(htmlBody).toContain("Production Readiness");
  expect(htmlBody).toContain("/voice/slo-readiness-thresholds");
  expect(htmlBody).toContain("Active Readiness Gate");
});

test("production readiness routes resolve dynamic threshold options per request", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await store.append(
    createVoiceTraceEvent({
      payload: {
        latencyMs: 700,
      },
      sessionId: "calibrated-live-latency",
      type: "client.live_latency",
    }),
  );

  const app = createVoiceProductionReadinessRoutes({
    liveLatencyFailAfterMs: 600,
    resolveOptions: () => ({
      liveLatencyFailAfterMs: 900,
      liveLatencyWarnAfterMs: 800,
    }),
    store,
  });
  const response = await app.handle(
    new Request("http://localhost/api/production-readiness"),
  );
  const report = await response.json();

  expect(report.summary.liveLatency).toMatchObject({
    failed: 0,
    status: "pass",
    warnings: 0,
  });
});

test("production readiness links calibrated threshold source from warned gates", async () => {
  const store = createVoiceMemoryTraceEventStore();
  await store.append(
    createVoiceTraceEvent({
      payload: {
        latencyMs: 700,
      },
      sessionId: "warned-live-latency",
      type: "client.live_latency",
    }),
  );

  const report = await buildVoiceProductionReadinessReport({
    links: {
      sloReadinessThresholds: "/voice/slo-readiness-thresholds",
    },
    liveLatencyFailAfterMs: 900,
    liveLatencyWarnAfterMs: 600,
    store,
  });
  const liveLatency = report.checks.find(
    (check) => check.label === "Live latency proof",
  );

  expect(report.links.sloReadinessThresholds).toBe(
    "/voice/slo-readiness-thresholds",
  );
  expect(liveLatency?.status).toBe("warn");
  expect(liveLatency?.gateExplanation).toMatchObject({
    evidenceHref: "/voice-operations/warned-live-latency",
    observed: 700,
    sourceHref: "/voice/slo-readiness-thresholds",
    threshold: 600,
    thresholdLabel: "Live latency warn after",
    unit: "ms",
  });
  expect(liveLatency?.actions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/voice/slo-readiness-thresholds",
        label: "Open calibrated gate source",
      }),
    ]),
  );
  expect(renderVoiceProductionReadinessHTML(report)).toContain(
    "/voice/slo-readiness-thresholds",
  );
  expect(renderVoiceProductionReadinessHTML(report)).toContain(
    "Why this gate is warn",
  );
});

test("buildVoiceProductionReadinessReport can bound live latency to recent samples", async () => {
  const store = createVoiceMemoryTraceEventStore();
  const now = Date.now();
  await Promise.all([
    store.append(
      createVoiceTraceEvent({
        at: now - 60_000,
        payload: {
          latencyMs: 500,
        },
        sessionId: "recent-live-latency",
        type: "client.live_latency",
      }),
    ),
    store.append(
      createVoiceTraceEvent({
        at: now - 60 * 60 * 1000,
        payload: {
          latencyMs: 2_000,
        },
        sessionId: "stale-live-latency",
        type: "client.live_latency",
      }),
    ),
  ]);

  const report = await buildVoiceProductionReadinessReport({
    liveLatencyFailAfterMs: 630,
    liveLatencyMaxAgeMs: 5 * 60 * 1000,
    liveLatencyWarnAfterMs: 600,
    store,
  });

  expect(report.summary.liveLatency).toMatchObject({
    failed: 0,
    status: "pass",
    total: 1,
    warnings: 0,
  });
  expect(report.operationsRecords?.failingLatency).toEqual([]);
});

test("production readiness gate route returns 503 when closed", async () => {
  const app = createVoiceProductionReadinessRoutes({
    gate: {
      failOnWarnings: true,
    },
    store: createVoiceMemoryTraceEventStore(),
  });

  const response = await app.handle(
    new Request("http://localhost/api/production-readiness/gate"),
  );

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    status: "fail",
    warnings: expect.arrayContaining([
      expect.objectContaining({
        code: "voice.readiness.routing_evidence",
      }),
    ]),
  });
});

test("renderVoiceProductionReadinessHTML renders check statuses", () => {
  const matrix = createVoiceTelephonyCarrierMatrix({
    providers: [
      {
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
            stream: "wss://example.test/api/twilio/stream",
            webhook: "https://example.test/api/telephony-webhook",
          },
          warnings: [],
        },
      },
    ],
  });
  const html = renderVoiceProductionReadinessHTML({
    checkedAt: 100,
    checks: [
      {
        actions: [
          {
            href: "/api/voice-handoffs/retry",
            label: "Retry handoff deliveries",
            method: "POST",
          },
        ],
        label: "Carrier readiness",
        status: matrix.pass ? "pass" : "fail",
        value: matrix.summary.ready,
      },
    ],
    links: {},
    profile: {
      description: "Phone-agent readiness.",
      name: "phone-agent",
      purpose: "Certifies phone-agent proof surfaces.",
      surfaces: [
        {
          configured: true,
          href: "/carriers",
          key: "carriers",
          label: "Carrier readiness",
        },
      ],
    },
    status: "pass",
    summary: {
      carriers: {
        failing: matrix.summary.failing,
        providers: matrix.summary.providers,
        ready: matrix.summary.ready,
        status: "pass",
        warnings: matrix.summary.warnings,
      },
      handoffs: {
        failed: 0,
        total: 0,
      },
      providers: {
        degraded: 0,
        total: 0,
      },
      quality: {
        status: "pass",
      },
      routing: {
        events: 0,
        sessions: 0,
      },
      sessions: {
        failed: 0,
        total: 0,
      },
    },
  });

  expect(html).toContain("Carrier readiness");
  expect(html).toContain("Overall: PASS");
  expect(html).toContain("Readiness profile");
  expect(html).toContain("phone-agent");
  expect(html).toContain("Retry handoff deliveries");
  expect(html).toContain("data-readiness-action");
  expect(html).toContain("Copy into your app");
  expect(html).toContain("createVoiceProductionReadinessRoutes");
  expect(html).toContain("providerContractMatrix");
});
