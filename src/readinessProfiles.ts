import type {
  VoiceProductionReadinessAuditOptions,
  VoiceProductionReadinessAuditDeliveryOptions,
  VoiceProductionReadinessOpsActionHistoryOptions,
  VoiceProductionReadinessProfileExplanation,
  VoiceProductionReadinessRoutesOptions,
  VoiceProductionReadinessTraceDeliveryOptions,
} from "./productionReadiness";

export type VoiceReadinessProfileName =
  | "meeting-recorder"
  | "ops-heavy"
  | "phone-agent";

export type VoiceReadinessProfileOptions = {
  audit?: VoiceProductionReadinessAuditOptions;
  auditDeliveries?: VoiceProductionReadinessAuditDeliveryOptions;
  bargeInReports?: VoiceProductionReadinessRoutesOptions["bargeInReports"];
  campaignReadiness?: VoiceProductionReadinessRoutesOptions["campaignReadiness"];
  carriers?: VoiceProductionReadinessRoutesOptions["carriers"];
  deliveryRuntime?: VoiceProductionReadinessRoutesOptions["deliveryRuntime"];
  explain?: boolean;
  gate?: VoiceProductionReadinessRoutesOptions["gate"];
  links?: VoiceProductionReadinessRoutesOptions["links"];
  observabilityExportDeliveryHistory?: VoiceProductionReadinessRoutesOptions["observabilityExportDeliveryHistory"];
  opsActionHistory?: VoiceProductionReadinessOpsActionHistoryOptions;
  phoneAgentSmokes?: VoiceProductionReadinessRoutesOptions["phoneAgentSmokes"];
  proofSources?: VoiceProductionReadinessRoutesOptions["proofSources"];
  providerRoutingContracts?: VoiceProductionReadinessRoutesOptions["providerRoutingContracts"];
  reconnectContracts?: VoiceProductionReadinessRoutesOptions["reconnectContracts"];
  reconnectContractsMinCount?: VoiceProductionReadinessRoutesOptions["reconnectContractsMinCount"];
  reconnectContractsMinSnapshotsPerContract?: VoiceProductionReadinessRoutesOptions["reconnectContractsMinSnapshotsPerContract"];
  telephonyMediaMinCarriers?: VoiceProductionReadinessRoutesOptions["telephonyMediaMinCarriers"];
  telephonyMediaMinMediaEvents?: VoiceProductionReadinessRoutesOptions["telephonyMediaMinMediaEvents"];
  browserMediaMinActiveCandidatePairs?: VoiceProductionReadinessRoutesOptions["browserMediaMinActiveCandidatePairs"];
  browserMediaMinLiveAudioTracks?: VoiceProductionReadinessRoutesOptions["browserMediaMinLiveAudioTracks"];
  browserMediaMinTotalStats?: VoiceProductionReadinessRoutesOptions["browserMediaMinTotalStats"];
  telephonyWebhookSecurity?: VoiceProductionReadinessRoutesOptions["telephonyWebhookSecurity"];
  traceDeliveries?: VoiceProductionReadinessTraceDeliveryOptions;
};

export type VoiceReadinessProfileRoutesOptions = Partial<
  Omit<VoiceProductionReadinessRoutesOptions, "store">
>;

export type VoiceReadinessProfileRecommendationScore = {
  configured: string[];
  confidence: number;
  missing: string[];
  profile: VoiceReadinessProfileName;
  reasons: string[];
};

export type VoiceReadinessProfileRecommendation = {
  confidence: number;
  missing: string[];
  profile: VoiceReadinessProfileName;
  reasons: string[];
  scores: VoiceReadinessProfileRecommendationScore[];
};

const profileSurfaceLabels: Record<
  VoiceReadinessProfileName,
  Record<string, string>
> = {
  "meeting-recorder": {
    bargeInReports: "barge-in proof configured",
    providerRoutingContracts: "provider routing contracts configured",
    reconnectContracts: "reconnect contracts configured",
  },
  "ops-heavy": {
    audit: "audit evidence configured",
    auditDeliveries: "audit delivery queue configured",
    deliveryRuntime: "delivery runtime configured",
    observabilityExportDeliveryHistory:
      "observability export delivery history configured",
    opsActionHistory: "operator action history configured",
    traceDeliveries: "trace delivery queue configured",
  },
  "phone-agent": {
    auditDeliveries: "audit delivery queue configured",
    campaignReadiness: "campaign readiness proof configured",
    carriers: "carrier readiness configured",
    deliveryRuntime: "delivery runtime configured",
    observabilityExportDeliveryHistory:
      "observability export delivery history configured",
    phoneAgentSmokes: "phone-agent smoke proof configured",
    providerRoutingContracts: "provider routing contracts configured",
    telephonyWebhookSecurity: "carrier webhook security configured",
    traceDeliveries: "trace delivery queue configured",
  },
};

const profileRequiredKeys: Record<VoiceReadinessProfileName, string[]> = {
  "meeting-recorder": [
    "bargeInReports",
    "providerRoutingContracts",
    "reconnectContracts",
  ],
  "ops-heavy": [
    "audit",
    "opsActionHistory",
    "auditDeliveries",
    "traceDeliveries",
    "observabilityExportDeliveryHistory",
    "deliveryRuntime",
  ],
  "phone-agent": [
    "carriers",
    "phoneAgentSmokes",
    "campaignReadiness",
    "providerRoutingContracts",
    "telephonyWebhookSecurity",
    "auditDeliveries",
    "traceDeliveries",
    "observabilityExportDeliveryHistory",
    "deliveryRuntime",
  ],
};

const configuredProfileKeys = (options: VoiceReadinessProfileOptions) => {
  const configured = new Set<string>();

  for (const key of [
    "audit",
    "auditDeliveries",
    "bargeInReports",
    "campaignReadiness",
    "carriers",
    "deliveryRuntime",
    "observabilityExportDeliveryHistory",
    "opsActionHistory",
    "phoneAgentSmokes",
    "providerRoutingContracts",
    "reconnectContracts",
    "telephonyWebhookSecurity",
    "traceDeliveries",
  ]) {
    if (isConfigured(options[key as keyof VoiceReadinessProfileOptions])) {
      configured.add(key);
    }
  }

  if (configured.has("audit")) {
    configured.add("opsActionHistory");
  }

  return configured;
};

const auditStoreFromOptions = (
  audit: VoiceProductionReadinessAuditOptions | undefined,
): VoiceProductionReadinessOpsActionHistoryOptions | undefined => {
  if (!audit) {
    return undefined;
  }

  return "list" in audit ? audit : audit.store;
};

const withDefined = (
  options: VoiceReadinessProfileRoutesOptions,
): VoiceReadinessProfileRoutesOptions =>
  Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  ) as VoiceReadinessProfileRoutesOptions;

const mergeLinks = (
  defaults: NonNullable<VoiceProductionReadinessRoutesOptions["links"]>,
  links: VoiceReadinessProfileOptions["links"],
) => ({
  ...defaults,
  ...links,
});

const isConfigured = (value: unknown) => value !== undefined && value !== false;

const profileExplanation = (
  profile: VoiceReadinessProfileName,
  options: VoiceReadinessProfileOptions,
  links: NonNullable<VoiceProductionReadinessRoutesOptions["links"]>,
): VoiceProductionReadinessProfileExplanation | undefined => {
  if (!options.explain) {
    return undefined;
  }

  if (profile === "meeting-recorder") {
    return {
      description:
        "Browser and meeting-recorder readiness for transcript capture, reconnects, barge-in, provider fallback, and live latency proof.",
      name: "meeting-recorder",
      purpose:
        "Certifies the browser voice surfaces a meeting recorder or browser assistant needs before users rely on captured transcripts and summaries.",
      surfaces: [
        {
          configured: true,
          href: links.liveLatency,
          key: "liveLatency",
          label: "Live latency",
        },
        {
          configured: true,
          href: links.sessions,
          key: "sessions",
          label: "Session health",
        },
        {
          configured: true,
          href: links.resilience,
          key: "providerFallback",
          label: "Provider fallback",
        },
        {
          configured: isConfigured(options.providerRoutingContracts),
          href: links.providerRoutingContracts,
          key: "providerRoutingContracts",
          label: "Provider routing contracts",
        },
        {
          configured: isConfigured(options.reconnectContracts),
          href: links.reconnectContracts,
          key: "reconnectContracts",
          label: "Reconnect contracts",
        },
        {
          configured: isConfigured(options.bargeInReports),
          href: links.bargeIn,
          key: "bargeInReports",
          label: "Barge-in proof",
        },
      ],
    };
  }

  if (profile === "phone-agent") {
    return {
      description:
        "Carrier-backed phone-agent readiness for setup parity, phone smoke proof, handoffs, routing contracts, and delivery queues.",
      name: "phone-agent",
      purpose:
        "Certifies the proof surfaces a self-hosted phone agent needs before routing real carrier calls through the app.",
      surfaces: [
        {
          configured: isConfigured(options.carriers),
          href: links.carriers,
          key: "carriers",
          label: "Carrier readiness",
        },
        {
          configured: isConfigured(options.phoneAgentSmokes),
          href: links.phoneAgentSmoke,
          key: "phoneAgentSmokes",
          label: "Phone agent smoke",
        },
        {
          configured: isConfigured(options.campaignReadiness),
          href: links.campaignReadiness,
          key: "campaignReadiness",
          label: "Campaign readiness proof",
        },
        {
          configured: true,
          href: links.handoffs,
          key: "handoffs",
          label: "Handoff delivery",
        },
        {
          configured: isConfigured(options.providerRoutingContracts),
          href: links.providerRoutingContracts,
          key: "providerRoutingContracts",
          label: "Provider routing contracts",
        },
        {
          configured: isConfigured(options.telephonyWebhookSecurity),
          href: links.telephonyWebhookSecurity,
          key: "telephonyWebhookSecurity",
          label: "Carrier webhook security",
        },
        {
          configured: isConfigured(options.deliveryRuntime),
          href: links.deliveryRuntime,
          key: "deliveryRuntime",
          label: "Delivery runtime",
        },
        {
          configured: isConfigured(options.observabilityExportDeliveryHistory),
          href: links.observabilityExportDeliveries,
          key: "observabilityExportDeliveryHistory",
          label: "Observability export delivery",
        },
        {
          configured: isConfigured(options.auditDeliveries),
          href: links.auditDeliveries,
          key: "auditDeliveries",
          label: "Audit deliveries",
        },
        {
          configured: isConfigured(options.traceDeliveries),
          href: links.traceDeliveries,
          key: "traceDeliveries",
          label: "Trace deliveries",
        },
      ],
    };
  }

  return {
    description:
      "Operations-heavy readiness for audit evidence, operator action history, delivery health, runtime queues, and deploy gate status.",
    name: "ops-heavy",
    purpose:
      "Certifies the operational control-plane proof surfaces that should block releases when evidence, queues, or operator actions are unhealthy.",
    surfaces: [
      {
        configured: isConfigured(options.audit),
        href: links.audit,
        key: "audit",
        label: "Audit evidence",
      },
      {
        configured: isConfigured(options.opsActionHistory ?? options.audit),
        href: links.opsActions,
        key: "opsActionHistory",
        label: "Operator action history",
      },
      {
        configured: isConfigured(options.deliveryRuntime),
        href: links.deliveryRuntime,
        key: "deliveryRuntime",
        label: "Delivery runtime",
      },
      {
        configured: isConfigured(options.observabilityExportDeliveryHistory),
        href: links.observabilityExportDeliveries,
        key: "observabilityExportDeliveryHistory",
        label: "Observability export delivery",
      },
      {
        configured: isConfigured(options.auditDeliveries),
        href: links.auditDeliveries,
        key: "auditDeliveries",
        label: "Audit deliveries",
      },
      {
        configured: isConfigured(options.traceDeliveries),
        href: links.traceDeliveries,
        key: "traceDeliveries",
        label: "Trace deliveries",
      },
    ],
  };
};

export const createVoiceReadinessProfile = (
  profile: VoiceReadinessProfileName,
  options: VoiceReadinessProfileOptions = {},
): VoiceReadinessProfileRoutesOptions => {
  if (profile === "meeting-recorder") {
    const links = mergeLinks(
      {
        bargeIn: "/barge-in",
        liveLatency: "/live-latency",
        providerRoutingContracts: "/resilience",
        quality: "/quality",
        reconnectContracts: "/voice/reconnect-contract",
        resilience: "/resilience",
        sessions: "/sessions",
      },
      options.links,
    );
    return withDefined({
      bargeInReports: options.bargeInReports,
      gate: options.gate,
      links,
      browserMediaMinActiveCandidatePairs:
        options.browserMediaMinActiveCandidatePairs ?? 1,
      browserMediaMinLiveAudioTracks:
        options.browserMediaMinLiveAudioTracks ?? 1,
      browserMediaMinTotalStats: options.browserMediaMinTotalStats ?? 3,
      reconnectContractsMinCount: options.reconnectContractsMinCount ?? 1,
      reconnectContractsMinSnapshotsPerContract:
        options.reconnectContractsMinSnapshotsPerContract ?? 1,
      profile: profileExplanation(profile, options, links),
      proofSources: options.proofSources,
      providerRoutingContracts: options.providerRoutingContracts,
      reconnectContracts: options.reconnectContracts,
    });
  }

  if (profile === "phone-agent") {
    const links = mergeLinks(
      {
        auditDeliveries: "/audit/deliveries",
        campaignReadiness: "/api/voice/campaigns/readiness-proof",
        carriers: "/carriers",
        deliveryRuntime: "/delivery-runtime",
        handoffs: "/handoffs",
        observabilityExportDeliveries:
          "/api/voice/observability-export/deliveries",
        phoneAgentSmoke: "/sessions",
        providerRoutingContracts: "/resilience",
        resilience: "/resilience",
        sessions: "/sessions",
        telephonyWebhookSecurity: "/api/voice/telephony/webhook-security",
        traceDeliveries: "/traces/deliveries",
      },
      options.links,
    );
    return withDefined({
      auditDeliveries: options.auditDeliveries,
      campaignReadiness: options.campaignReadiness,
      carriers: options.carriers,
      deliveryRuntime: options.deliveryRuntime,
      gate: options.gate,
      links,
      observabilityExportDeliveryHistory:
        options.observabilityExportDeliveryHistory,
      phoneAgentSmokes: options.phoneAgentSmokes,
      profile: profileExplanation(profile, options, links),
      proofSources: options.proofSources,
      providerRoutingContracts: options.providerRoutingContracts,
      reconnectContractsMinCount: options.reconnectContractsMinCount ?? 1,
      reconnectContractsMinSnapshotsPerContract:
        options.reconnectContractsMinSnapshotsPerContract ?? 1,
      telephonyMediaMinCarriers: options.telephonyMediaMinCarriers ?? 1,
      telephonyMediaMinMediaEvents: options.telephonyMediaMinMediaEvents ?? 2,
      browserMediaMinActiveCandidatePairs:
        options.browserMediaMinActiveCandidatePairs ?? 1,
      browserMediaMinLiveAudioTracks:
        options.browserMediaMinLiveAudioTracks ?? 1,
      browserMediaMinTotalStats: options.browserMediaMinTotalStats ?? 3,
      telephonyWebhookSecurity: options.telephonyWebhookSecurity,
      traceDeliveries: options.traceDeliveries,
    });
  }

  const opsActionHistory =
    options.opsActionHistory ?? auditStoreFromOptions(options.audit);
  const links = mergeLinks(
    {
      audit: "/audit",
      auditDeliveries: "/audit/deliveries",
      deliveryRuntime: "/delivery-runtime",
      observabilityExportDeliveries:
        "/api/voice/observability-export/deliveries",
      opsActions: "/voice/ops-actions",
      traceDeliveries: "/traces/deliveries",
    },
    options.links,
  );

  return withDefined({
    audit: options.audit,
    auditDeliveries: options.auditDeliveries,
    deliveryRuntime: options.deliveryRuntime,
    gate: options.gate,
    links,
    observabilityExportDeliveryHistory:
      options.observabilityExportDeliveryHistory,
    opsActionHistory,
    profile: profileExplanation(profile, options, links),
    proofSources: options.proofSources,
    traceDeliveries: options.traceDeliveries,
  });
};

export const recommendVoiceReadinessProfile = (
  options: VoiceReadinessProfileOptions,
): VoiceReadinessProfileRecommendation => {
  const configured = configuredProfileKeys(options);
  const scores = (
    ["phone-agent", "meeting-recorder", "ops-heavy"] as const
  ).map((profile): VoiceReadinessProfileRecommendationScore => {
    const required = profileRequiredKeys[profile];
    const configuredKeys = required.filter((key) => configured.has(key));
    const missing = required.filter((key) => !configured.has(key));
    const reasons = configuredKeys.map(
      (key) => profileSurfaceLabels[profile][key] ?? `${key} configured`,
    );

    return {
      configured: configuredKeys,
      confidence:
        required.length === 0
          ? 0
          : Math.round((configuredKeys.length / required.length) * 100) / 100,
      missing,
      profile,
      reasons,
    };
  });
  const [best] = scores.toSorted((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    return right.configured.length - left.configured.length;
  });
  if (!best) {
    throw new Error("No voice readiness profiles are available.");
  }

  return {
    confidence: best.confidence,
    missing: best.missing,
    profile: best.profile,
    reasons: best.reasons,
    scores,
  };
};
