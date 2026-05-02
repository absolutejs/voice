import { expect, test } from "bun:test";
import {
  createVoiceMemoryAuditEventStore,
  createVoiceMemoryAuditSinkDeliveryStore,
  createVoiceMemoryObservabilityExportDeliveryReceiptStore,
  createVoiceMemoryTraceSinkDeliveryStore,
  createVoiceReadinessProfile,
  recommendVoiceReadinessProfile,
  runVoiceCampaignReadinessProof,
} from "../src";

test("createVoiceReadinessProfile wires meeting recorder proof surfaces", () => {
  const profile = createVoiceReadinessProfile("meeting-recorder", {
    links: {
      sessions: "/calls",
    },
    reconnectContracts: [],
  });

  expect(profile).toMatchObject({
    links: {
      bargeIn: "/barge-in",
      liveLatency: "/live-latency",
      reconnectContracts: "/voice/reconnect-contract",
      sessions: "/calls",
    },
    reconnectContracts: [],
    browserMediaMinActiveCandidatePairs: 1,
    browserMediaMinLiveAudioTracks: 1,
    browserMediaMinTotalStats: 3,
    reconnectContractsMinCount: 1,
    reconnectContractsMinSnapshotsPerContract: 1,
  });
  expect(profile).not.toHaveProperty("audit");
});

test("createVoiceReadinessProfile wires phone agent campaign carrier and delivery surfaces", async () => {
  const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
  const campaignReadiness = await runVoiceCampaignReadinessProof();
  const observabilityExportDeliveryHistory =
    createVoiceMemoryObservabilityExportDeliveryReceiptStore();
  const profile = createVoiceReadinessProfile("phone-agent", {
    auditDeliveries,
    campaignReadiness,
    carriers: [],
    observabilityExportDeliveryHistory,
    phoneAgentSmokes: [],
    telephonyWebhookSecurity: {
      plivo: { authToken: "proof-plivo-secret" },
      store: { kind: "sqlite", path: ":memory:" },
      telnyx: { publicKey: "proof-telnyx-public-key" },
      twilio: {
        authToken: "proof-secret",
        verificationUrl: "https://voice.example.test/carrier",
      },
    },
    traceDeliveries: createVoiceMemoryTraceSinkDeliveryStore(),
  });

  expect(profile).toMatchObject({
    auditDeliveries,
    campaignReadiness,
    carriers: [],
    browserMediaMinActiveCandidatePairs: 1,
    browserMediaMinLiveAudioTracks: 1,
    browserMediaMinTotalStats: 3,
    reconnectContractsMinCount: 1,
    reconnectContractsMinSnapshotsPerContract: 1,
    telephonyMediaMinCarriers: 1,
    telephonyMediaMinMediaEvents: 2,
    links: {
      auditDeliveries: "/audit/deliveries",
      campaignReadiness: "/api/voice/campaigns/readiness-proof",
      carriers: "/carriers",
      handoffs: "/handoffs",
      observabilityExportDeliveries:
        "/api/voice/observability-export/deliveries",
      phoneAgentSmoke: "/sessions",
      telephonyWebhookSecurity: "/api/voice/telephony/webhook-security",
    },
    observabilityExportDeliveryHistory,
    phoneAgentSmokes: [],
    telephonyWebhookSecurity: {
      plivo: { authToken: "proof-plivo-secret" },
    },
  });
});

test("createVoiceReadinessProfile explains configured and expected surfaces", () => {
  const profile = createVoiceReadinessProfile("phone-agent", {
    carriers: [],
    explain: true,
  });

  expect(profile.profile).toMatchObject({
    name: "phone-agent",
    surfaces: expect.arrayContaining([
      expect.objectContaining({
        configured: true,
        key: "carriers",
        label: "Carrier readiness",
      }),
      expect.objectContaining({
        configured: false,
        key: "campaignReadiness",
        label: "Campaign readiness proof",
      }),
      expect.objectContaining({
        configured: false,
        key: "observabilityExportDeliveryHistory",
        label: "Observability export delivery",
      }),
      expect.objectContaining({
        configured: false,
        key: "phoneAgentSmokes",
        label: "Phone agent smoke",
      }),
      expect.objectContaining({
        configured: false,
        key: "telephonyWebhookSecurity",
        label: "Carrier webhook security",
      }),
    ]),
  });
});

test("createVoiceReadinessProfile infers ops action history from audit store", () => {
  const audit = createVoiceMemoryAuditEventStore();
  const profile = createVoiceReadinessProfile("ops-heavy", {
    audit: {
      store: audit,
    },
  });

  expect(profile).toMatchObject({
    audit: {
      store: audit,
    },
    links: {
      audit: "/audit",
      opsActions: "/voice/ops-actions",
    },
    opsActionHistory: audit,
  });
});

test("recommendVoiceReadinessProfile recommends phone agent from carrier surfaces", async () => {
  const recommendation = recommendVoiceReadinessProfile({
    auditDeliveries: createVoiceMemoryAuditSinkDeliveryStore(),
    campaignReadiness: await runVoiceCampaignReadinessProof(),
    carriers: [],
    deliveryRuntime: {
      audit: {
        deadLettered: 0,
        delivered: 0,
        failed: 0,
        pending: 0,
        retryEligible: 0,
        skipped: 0,
        total: 0,
      },
    },
    observabilityExportDeliveryHistory:
      createVoiceMemoryObservabilityExportDeliveryReceiptStore(),
    telephonyWebhookSecurity: {
      store: { kind: "sqlite", path: ":memory:" },
      twilio: {
        authToken: "proof-secret",
        verificationUrl: "https://voice.example.test/carrier",
      },
    },
    traceDeliveries: createVoiceMemoryTraceSinkDeliveryStore(),
  });

  expect(recommendation).toMatchObject({
    profile: "phone-agent",
    reasons: expect.arrayContaining([
      "carrier readiness configured",
      "carrier webhook security configured",
      "delivery runtime configured",
      "observability export delivery history configured",
    ]),
  });
  expect(recommendation.confidence).toBeGreaterThan(0.5);
  expect(recommendation.missing).toEqual(
    expect.arrayContaining(["phoneAgentSmokes"]),
  );
});

test("recommendVoiceReadinessProfile infers ops action history from audit", () => {
  const recommendation = recommendVoiceReadinessProfile({
    audit: createVoiceMemoryAuditEventStore(),
    auditDeliveries: createVoiceMemoryAuditSinkDeliveryStore(),
    traceDeliveries: createVoiceMemoryTraceSinkDeliveryStore(),
  });

  expect(recommendation).toMatchObject({
    profile: "ops-heavy",
    reasons: expect.arrayContaining([
      "audit evidence configured",
      "operator action history configured",
    ]),
  });
});
