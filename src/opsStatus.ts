import {
  runVoiceScenarioFixtureEvals,
  runVoiceScenarioEvals,
  type VoiceEvalLink,
  type VoiceEvalRoutesOptions,
} from "./evalRoutes";
import {
  buildVoiceDeliverySinkReport,
  type VoiceDeliverySinkRoutesOptions,
} from "./deliverySinkRoutes";
import { summarizeVoiceHandoffHealth } from "./handoffHealth";
import { summarizeVoiceProviderHealth } from "./providerHealth";
import {
  evaluateVoiceQuality,
  type VoiceQualityRoutesOptions,
} from "./qualityRoutes";
import {
  summarizeVoiceProviderFallbackRecovery,
  summarizeVoiceSessions,
  type VoiceProviderFallbackRecoverySummary,
} from "./sessionReplay";
import {
  filterVoiceTraceEvents,
  type StoredVoiceTraceEvent,
  type VoiceTraceEventStore,
} from "./trace";

export type VoiceOpsStatus = "pass" | "fail";

export type VoiceOpsStatusLink = VoiceEvalLink & {
  description?: string;
  statusHref?: string;
};

export type VoiceOpsStatusOptions<TProvider extends string = string> = {
  deliverySinks?: false | VoiceDeliverySinkRoutesOptions;
  evals?: false | Partial<VoiceEvalRoutesOptions>;
  include?: {
    deliverySinks?: boolean;
    handoffs?: boolean;
    providers?: boolean;
    providerRecovery?: boolean;
    quality?: boolean;
    sessions?: boolean;
    workflows?: boolean;
  };
  links?: VoiceOpsStatusLink[];
  llmProviders?: readonly TProvider[];
  preferFixtureWorkflows?: boolean;
  quality?: false | Partial<VoiceQualityRoutesOptions>;
  store: VoiceTraceEventStore;
  sttProviders?: readonly string[];
  ttsProviders?: readonly string[];
};

export type VoiceOpsStatusReport = {
  checkedAt: number;
  failed: number;
  links: VoiceOpsStatusLink[];
  passed: number;
  status: VoiceOpsStatus;
  surfaces: {
    handoffs?: {
      failed: number;
      status: VoiceOpsStatus;
      total: number;
    };
    deliverySinks?: {
      auditTotal: number;
      status: VoiceOpsStatus;
      traceTotal: number;
    };
    providers?: {
      degraded: number;
      status: VoiceOpsStatus;
      total: number;
    };
    providerRecovery?: VoiceProviderFallbackRecoverySummary;
    quality?: {
      status: VoiceOpsStatus;
    };
    sessions?: {
      failed: number;
      status: VoiceOpsStatus;
      total: number;
    };
    workflows?: {
      failed: number;
      source: "fixtures" | "live";
      status: VoiceOpsStatus;
      total: number;
    };
  };
  total: number;
};

export type VoiceOpsStatusRoutesOptions<TProvider extends string = string> =
  VoiceOpsStatusOptions<TProvider> & {
    headers?: HeadersInit;
    name?: string;
    path?: string;
  };

const DEFAULT_LINKS: VoiceOpsStatusLink[] = [
  {
    description: "Production quality gates.",
    href: "/quality",
    label: "Quality",
    statusHref: "/quality/status",
  },
  {
    description: "Replay sessions against evals and workflow contracts.",
    href: "/evals",
    label: "Evals",
    statusHref: "/evals/status",
  },
  {
    description: "Provider routing, fallback, and resilience controls.",
    href: "/resilience",
    label: "Resilience",
  },
  {
    description: "One JSON/HTML production readiness rollup.",
    href: "/production-readiness",
    label: "Production Readiness",
    statusHref: "/api/production-readiness",
  },
  {
    description: "Recent sessions and replay links.",
    href: "/sessions",
    label: "Sessions",
  },
  {
    description: "Trace-backed phone-agent production smoke proof.",
    href: "/voice/phone/smoke-contract",
    label: "Phone Smoke",
    statusHref: "/api/voice/phone/smoke-contract",
  },
];

const countStatus = (statuses: VoiceOpsStatus[]) => ({
  failed: statuses.filter((status) => status === "fail").length,
  passed: statuses.filter((status) => status === "pass").length,
  total: statuses.length,
});

export const summarizeVoiceOpsStatus = async <
  TProvider extends string = string,
>(
  options: VoiceOpsStatusOptions<TProvider>,
): Promise<VoiceOpsStatusReport> => {
  const include = options.include;
  const shouldInclude = (surface: keyof NonNullable<typeof include>) =>
    include?.[surface] !== false;
  const evals = options.evals === false ? undefined : options.evals;
  const events: StoredVoiceTraceEvent[] = filterVoiceTraceEvents(
    await options.store.list(),
  );
  const [quality, workflows, providers, sessions, handoffs, deliverySinks] =
    await Promise.all([
      options.quality === false || !shouldInclude("quality")
        ? undefined
        : evaluateVoiceQuality({
            events,
            thresholds: options.quality?.thresholds,
          }),
      !evals || !shouldInclude("workflows")
        ? undefined
        : (async () => {
            const fixtureReport = await runVoiceScenarioFixtureEvals({
              fixtures: evals.fixtures,
              fixtureStore: evals.fixtureStore,
              scenarios: evals.scenarios,
            });

            if (
              (options.preferFixtureWorkflows ?? true) &&
              fixtureReport.total > 0
            ) {
              return {
                failed: fixtureReport.failed,
                source: "fixtures" as const,
                status: fixtureReport.status,
                total: fixtureReport.total,
              };
            }

            const liveReport = await runVoiceScenarioEvals({
              events,
              scenarios: evals.scenarios,
            });

            return {
              failed: liveReport.failed,
              source: "live" as const,
              status: liveReport.status,
              total: liveReport.total,
            };
          })(),
      !shouldInclude("providers")
        ? undefined
        : Promise.all([
            summarizeVoiceProviderHealth({
              events,
              providers: options.llmProviders,
            }),
            summarizeVoiceProviderHealth({
              events: events.filter((event) => event.payload.kind === "stt"),
              providers: options.sttProviders,
            }),
            summarizeVoiceProviderHealth({
              events: events.filter((event) => event.payload.kind === "tts"),
              providers: options.ttsProviders,
            }),
          ]).then((groups) => groups.flat()),
      !shouldInclude("sessions")
        ? undefined
        : summarizeVoiceSessions({
            events,
          }),
      !shouldInclude("handoffs")
        ? undefined
        : summarizeVoiceHandoffHealth({
            events,
          }),
      !options.deliverySinks || !shouldInclude("deliverySinks")
        ? undefined
        : buildVoiceDeliverySinkReport(options.deliverySinks),
    ]);
  const providerRecovery = shouldInclude("providerRecovery")
    ? summarizeVoiceProviderFallbackRecovery(events)
    : undefined;
  const surfaces: VoiceOpsStatusReport["surfaces"] = {};
  const statuses: VoiceOpsStatus[] = [];

  if (quality) {
    surfaces.quality = { status: quality.status };
    statuses.push(quality.status);
  }
  if (workflows) {
    surfaces.workflows = workflows;
    statuses.push(workflows.status);
  }
  if (providers) {
    const degraded = providers.filter(
      (provider) =>
        provider.status === "degraded" ||
        provider.status === "rate-limited" ||
        provider.status === "suppressed",
    ).length;
    const status = degraded > 0 ? "fail" : "pass";
    surfaces.providers = {
      degraded,
      status,
      total: providers.length,
    };
    statuses.push(status);
  }
  if (providerRecovery) {
    surfaces.providerRecovery = providerRecovery;
    statuses.push(providerRecovery.status);
  }
  if (sessions) {
    const failed = sessions.filter(
      (session) => session.status === "failed",
    ).length;
    const status = failed > 0 ? "fail" : "pass";
    surfaces.sessions = {
      failed,
      status,
      total: sessions.length,
    };
    statuses.push(status);
  }
  if (handoffs) {
    const status = handoffs.failed > 0 ? "fail" : "pass";
    surfaces.handoffs = {
      failed: handoffs.failed,
      status,
      total: handoffs.total,
    };
    statuses.push(status);
  }
  if (deliverySinks) {
    const status = deliverySinks.status === "fail" ? "fail" : "pass";
    surfaces.deliverySinks = {
      auditTotal: deliverySinks.auditDeliveries?.summary.total ?? 0,
      status,
      traceTotal: deliverySinks.traceDeliveries?.summary.total ?? 0,
    };
    statuses.push(status);
  }

  const baseLinks = options.links ?? DEFAULT_LINKS;
  const deliverySinkOptions = options.deliverySinks || undefined;
  const links =
    deliverySinkOptions &&
    !baseLinks.some(
      (link) =>
        link.href === (deliverySinkOptions.htmlPath ?? "/delivery-sinks") ||
        link.statusHref ===
          (deliverySinkOptions.path ?? "/api/voice-delivery-sinks"),
    )
      ? [
          ...baseLinks,
          {
            description: "Audit and trace delivery sink health.",
            href:
              deliverySinkOptions.htmlPath === false
                ? (deliverySinkOptions.path ?? "/api/voice-delivery-sinks")
                : (deliverySinkOptions.htmlPath ?? "/delivery-sinks"),
            label: "Delivery Sinks",
            statusHref: deliverySinkOptions.path ?? "/api/voice-delivery-sinks",
          },
        ]
      : baseLinks;

  return {
    checkedAt: Date.now(),
    links,
    status: statuses.includes("fail") ? "fail" : "pass",
    surfaces,
    ...countStatus(statuses),
  };
};
