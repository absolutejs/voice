import { Elysia } from "elysia";
import type {
  VoiceProviderOrchestrationProfile,
  VoiceProviderOrchestrationResolvedSurface,
  VoiceProviderOrchestrationSurface,
  VoiceProviderRouterProviderProfile,
} from "./modelAdapters";
import type { VoiceSessionRecord } from "./types";

export type VoiceProviderOrchestrationStatus = "fail" | "pass" | "warn";

export type VoiceProviderOrchestrationRequirement = {
  minProviders?: number;
  requireBudgetPolicy?: boolean;
  requireCircuitBreaker?: boolean;
  requireFallback?: boolean;
  requireTimeoutBudget?: boolean;
};

export type VoiceProviderOrchestrationIssue = {
  code: string;
  message: string;
  status: Exclude<VoiceProviderOrchestrationStatus, "pass">;
  surface?: string;
};

export type VoiceProviderOrchestrationSurfaceReport = {
  allowProviders: string[];
  budgetPolicy: {
    maxCost?: number;
    maxLatencyMs?: number;
    minQuality?: number;
  };
  circuitBreaker: boolean;
  fallbackMode?: string;
  fallbackProviders: string[];
  issues: VoiceProviderOrchestrationIssue[];
  providerProfiles: Record<string, VoiceProviderRouterProviderProfile>;
  providers: string[];
  status: VoiceProviderOrchestrationStatus;
  strategy?: string;
  surface: string;
  timeoutBudget: boolean;
  timeoutMs?: number;
};

export type VoiceProviderOrchestrationReport = {
  checkedAt: number;
  issues: VoiceProviderOrchestrationIssue[];
  profileId: string;
  status: VoiceProviderOrchestrationStatus;
  summary: {
    failed: number;
    passed: number;
    providers: number;
    surfaces: number;
    warned: number;
  };
  surfaces: VoiceProviderOrchestrationSurfaceReport[];
};

export type VoiceProviderOrchestrationReportOptions<
  TProvider extends string = string,
  TSurface extends string = string,
> = {
  defaultRequirement?: VoiceProviderOrchestrationRequirement;
  profile: VoiceProviderOrchestrationProfile<
    unknown,
    VoiceSessionRecord,
    TProvider,
    TSurface
  >;
  requirements?: Partial<
    Record<TSurface, VoiceProviderOrchestrationRequirement>
  >;
};

export type VoiceProviderOrchestrationRoutesOptions<
  TProvider extends string = string,
  TSurface extends string = string,
> = VoiceProviderOrchestrationReportOptions<TProvider, TSurface> & {
  headers?: HeadersInit;
  htmlPath?: false | string;
  markdownPath?: false | string;
  name?: string;
  path?: string;
  render?: (
    report: VoiceProviderOrchestrationReport,
  ) => string | Promise<string>;
  title?: string;
};

const defaultRequirement: Required<VoiceProviderOrchestrationRequirement> = {
  minProviders: 1,
  requireBudgetPolicy: false,
  requireCircuitBreaker: false,
  requireFallback: false,
  requireTimeoutBudget: false,
};

const statusRank: Record<VoiceProviderOrchestrationStatus, number> = {
  pass: 0,
  warn: 1,
  fail: 2,
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const isProviderList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const uniqueSorted = (values: Array<string | undefined>) =>
  [
    ...new Set(
      values.filter((value): value is string => typeof value === "string"),
    ),
  ].sort();

const policyRecord = <TProvider extends string>(
  surface: VoiceProviderOrchestrationResolvedSurface<
    unknown,
    VoiceSessionRecord,
    TProvider
  >,
): Record<string, unknown> =>
  surface.policy && typeof surface.policy === "object" ? surface.policy : {};

const surfaceProviderNames = <TProvider extends string>(
  surface: VoiceProviderOrchestrationResolvedSurface<
    unknown,
    VoiceSessionRecord,
    TProvider
  >,
) =>
  uniqueSorted([
    ...Object.keys(surface.providerProfiles ?? {}),
    ...(isProviderList(surface.fallback) ? surface.fallback : []),
    ...(isProviderList(surface.allowProviders) ? surface.allowProviders : []),
  ]);

const surfaceStatus = (
  issues: readonly VoiceProviderOrchestrationIssue[],
): VoiceProviderOrchestrationStatus =>
  issues.reduce<VoiceProviderOrchestrationStatus>(
    (status, issue) =>
      statusRank[issue.status] > statusRank[status] ? issue.status : status,
    "pass",
  );

const resolvedRequirement = <TSurface extends string>(
  surface: TSurface,
  options: Pick<
    VoiceProviderOrchestrationReportOptions<string, TSurface>,
    "defaultRequirement" | "requirements"
  >,
): Required<VoiceProviderOrchestrationRequirement> => ({
  ...defaultRequirement,
  ...(options.defaultRequirement ?? {}),
  ...(options.requirements?.[surface] ?? {}),
});

const buildSurfaceReport = <TProvider extends string, TSurface extends string>(
  surfaceName: TSurface,
  config: VoiceProviderOrchestrationSurface<
    unknown,
    VoiceSessionRecord,
    TProvider
  >,
  resolved: VoiceProviderOrchestrationResolvedSurface<
    unknown,
    VoiceSessionRecord,
    TProvider
  >,
  requirement: Required<VoiceProviderOrchestrationRequirement>,
): VoiceProviderOrchestrationSurfaceReport => {
  const policy = policyRecord(resolved);
  const providers = surfaceProviderNames(resolved);
  const fallbackProviders = isProviderList(resolved.fallback)
    ? [...resolved.fallback]
    : [];
  const allowProviders = isProviderList(resolved.allowProviders)
    ? [...resolved.allowProviders]
    : [];
  const providerProfiles = Object.fromEntries(
    Object.entries(resolved.providerProfiles ?? {}).filter(
      (entry): entry is [string, VoiceProviderRouterProviderProfile] =>
        Boolean(entry[1]),
    ),
  );
  const timeoutMs =
    typeof resolved.timeoutMs === "number"
      ? resolved.timeoutMs
      : Object.values(providerProfiles).find(
          (profile) => typeof profile.timeoutMs === "number",
        )?.timeoutMs;
  const issues: VoiceProviderOrchestrationIssue[] = [];
  const budgetPolicy = {
    maxCost: typeof policy.maxCost === "number" ? policy.maxCost : undefined,
    maxLatencyMs:
      typeof policy.maxLatencyMs === "number" ? policy.maxLatencyMs : undefined,
    minQuality:
      typeof policy.minQuality === "number" ? policy.minQuality : undefined,
  };
  const hasBudgetPolicy = Object.values(budgetPolicy).some(
    (value) => typeof value === "number",
  );
  const circuitBreaker = Boolean(resolved.providerHealth);
  const timeoutBudget = typeof timeoutMs === "number";

  if (providers.length < requirement.minProviders) {
    issues.push({
      code: "voice.provider_orchestration.min_providers",
      message: `Surface ${surfaceName} has ${String(providers.length)} provider(s); expected at least ${String(requirement.minProviders)}.`,
      status: "fail",
      surface: surfaceName,
    });
  }
  if (requirement.requireFallback && fallbackProviders.length === 0) {
    issues.push({
      code: "voice.provider_orchestration.fallback_missing",
      message: `Surface ${surfaceName} requires a fallback order.`,
      status: "fail",
      surface: surfaceName,
    });
  }
  if (requirement.requireCircuitBreaker && !circuitBreaker) {
    issues.push({
      code: "voice.provider_orchestration.circuit_breaker_missing",
      message: `Surface ${surfaceName} requires providerHealth circuit-breaker settings.`,
      status: "fail",
      surface: surfaceName,
    });
  }
  if (requirement.requireTimeoutBudget && !timeoutBudget) {
    issues.push({
      code: "voice.provider_orchestration.timeout_budget_missing",
      message: `Surface ${surfaceName} requires a route-level or provider-level timeout budget.`,
      status: "fail",
      surface: surfaceName,
    });
  }
  if (requirement.requireBudgetPolicy && !hasBudgetPolicy) {
    issues.push({
      code: "voice.provider_orchestration.budget_policy_missing",
      message: `Surface ${surfaceName} requires maxCost, maxLatencyMs, or minQuality policy bounds.`,
      status: "fail",
      surface: surfaceName,
    });
  }
  if (
    !requirement.requireFallback &&
    fallbackProviders.length === 0 &&
    providers.length > 1
  ) {
    issues.push({
      code: "voice.provider_orchestration.fallback_unset",
      message: `Surface ${surfaceName} has multiple providers but no explicit fallback order.`,
      status: "warn",
      surface: surfaceName,
    });
  }

  return {
    allowProviders,
    budgetPolicy,
    circuitBreaker,
    fallbackMode: resolved.fallbackMode ?? String(policy.fallbackMode ?? ""),
    fallbackProviders,
    issues,
    providerProfiles,
    providers,
    status: surfaceStatus(issues),
    strategy:
      typeof policy.strategy === "string"
        ? policy.strategy
        : typeof config.policy === "string"
          ? config.policy
          : undefined,
    surface: surfaceName,
    timeoutBudget,
    timeoutMs,
  };
};

export const buildVoiceProviderOrchestrationReport = <
  TProvider extends string = string,
  TSurface extends string = string,
>(
  options: VoiceProviderOrchestrationReportOptions<TProvider, TSurface>,
): VoiceProviderOrchestrationReport => {
  const surfaceNames = Object.keys(options.profile.surfaces) as TSurface[];
  const surfaces = surfaceNames.map((surfaceName) =>
    buildSurfaceReport(
      surfaceName,
      options.profile.surfaces[surfaceName],
      options.profile.resolve(surfaceName),
      resolvedRequirement(surfaceName, options),
    ),
  );
  const issues = surfaces.flatMap((surface) => surface.issues);
  const status = surfaceStatus(issues);
  const providers = uniqueSorted(
    surfaces.flatMap((surface) => surface.providers),
  ).length;

  return {
    checkedAt: Date.now(),
    issues,
    profileId: options.profile.id,
    status,
    summary: {
      failed: surfaces.filter((surface) => surface.status === "fail").length,
      passed: surfaces.filter((surface) => surface.status === "pass").length,
      providers,
      surfaces: surfaces.length,
      warned: surfaces.filter((surface) => surface.status === "warn").length,
    },
    surfaces,
  };
};

export const renderVoiceProviderOrchestrationMarkdown = (
  report: VoiceProviderOrchestrationReport,
) => {
  const lines = [
    "# Voice Provider Orchestration",
    "",
    `- Profile: ${report.profileId}`,
    `- Status: ${report.status}`,
    `- Surfaces: ${String(report.summary.surfaces)}`,
    `- Providers: ${String(report.summary.providers)}`,
    "",
  ];
  for (const surface of report.surfaces) {
    lines.push(
      `## ${surface.surface}`,
      "",
      `- Status: ${surface.status}`,
      `- Strategy: ${surface.strategy ?? "default"}`,
      `- Providers: ${surface.providers.join(", ") || "none"}`,
      `- Fallback: ${surface.fallbackProviders.join(" -> ") || "none"}`,
      `- Circuit breaker: ${surface.circuitBreaker ? "yes" : "no"}`,
      `- Timeout budget: ${surface.timeoutBudget ? `${String(surface.timeoutMs)}ms` : "none"}`,
      "",
    );
    for (const issue of surface.issues) {
      lines.push(`- ${issue.status.toUpperCase()}: ${issue.message}`);
    }
    if (surface.issues.length > 0) {
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
};

export const renderVoiceProviderOrchestrationHTML = (
  report: VoiceProviderOrchestrationReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Provider Orchestration";
  const cards = report.surfaces
    .map(
      (surface) => `<article class="card ${escapeHtml(surface.status)}">
  <div class="card-header"><div><p class="eyebrow">${escapeHtml(surface.surface)}</p><h2>${escapeHtml(surface.strategy ?? "default policy")}</h2></div><strong>${escapeHtml(surface.status)}</strong></div>
  <dl>
    <div><dt>Providers</dt><dd>${escapeHtml(surface.providers.join(", ") || "none")}</dd></div>
    <div><dt>Fallback</dt><dd>${escapeHtml(surface.fallbackProviders.join(" -> ") || "none")}</dd></div>
    <div><dt>Circuit breaker</dt><dd>${surface.circuitBreaker ? "yes" : "no"}</dd></div>
    <div><dt>Timeout</dt><dd>${surface.timeoutBudget ? `${String(surface.timeoutMs)}ms` : "none"}</dd></div>
    <div><dt>Max cost</dt><dd>${surface.budgetPolicy.maxCost ?? "none"}</dd></div>
    <div><dt>Max latency</dt><dd>${surface.budgetPolicy.maxLatencyMs ? `${String(surface.budgetPolicy.maxLatencyMs)}ms` : "none"}</dd></div>
    <div><dt>Min quality</dt><dd>${surface.budgetPolicy.minQuality ?? "none"}</dd></div>
    <div><dt>Fallback mode</dt><dd>${escapeHtml(surface.fallbackMode || "default")}</dd></div>
  </dl>
  ${
    surface.issues.length
      ? `<ul>${surface.issues.map((issue) => `<li><strong>${escapeHtml(issue.status)}</strong> ${escapeHtml(issue.message)}</li>`).join("")}</ul>`
      : "<p>No orchestration issues.</p>"
  }
</article>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#111827;color:#f9fafb;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}.hero,.card{background:#172033;border:1px solid #2d3b55;border-radius:22px;margin-bottom:16px;padding:20px}.hero{background:linear-gradient(135deg,rgba(59,130,246,.18),rgba(20,184,166,.12))}.eyebrow{color:#93c5fd;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,5rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}h2{margin:.2rem 0}.summary{display:flex;flex-wrap:wrap;gap:10px}.pill{background:#0f172a;border:1px solid #334155;border-radius:999px;padding:7px 10px}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}.card-header{align-items:flex-start;display:flex;gap:16px;justify-content:space-between}.pass strong{color:#86efac}.warn strong{color:#fde68a}.fail strong{color:#fca5a5}dl{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}dt{color:#a8b0b8;font-size:.8rem}dd{margin:0;overflow-wrap:anywhere}li{margin:.35rem 0}@media(max-width:800px){main{padding:18px}.card-header{display:block}}</style></head><body><main><section class="hero"><p class="eyebrow">Provider Policy Proof</p><h1>${escapeHtml(title)}</h1><div class="summary"><span class="pill">${escapeHtml(report.profileId)}</span><span class="pill">${escapeHtml(report.status)}</span><span class="pill">${String(report.summary.surfaces)} surfaces</span><span class="pill">${String(report.summary.providers)} providers</span><span class="pill">${String(report.issues.length)} issues</span></div></section><section class="grid">${cards || '<article class="card"><p>No provider orchestration surfaces configured.</p></article>'}</section></main></body></html>`;
};

export const createVoiceProviderOrchestrationRoutes = <
  TProvider extends string = string,
  TSurface extends string = string,
>(
  options: VoiceProviderOrchestrationRoutesOptions<TProvider, TSurface>,
) => {
  const path = options.path ?? "/api/voice/provider-orchestration";
  const htmlPath =
    options.htmlPath === undefined
      ? "/voice/provider-orchestration"
      : options.htmlPath;
  const markdownPath =
    options.markdownPath === undefined
      ? "/voice/provider-orchestration.md"
      : options.markdownPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-provider-orchestration",
  }).get(path, () => buildVoiceProviderOrchestrationReport(options));

  if (htmlPath) {
    routes.get(htmlPath, async () => {
      const report = buildVoiceProviderOrchestrationReport(options);
      const render =
        options.render ??
        ((input: VoiceProviderOrchestrationReport) =>
          renderVoiceProviderOrchestrationHTML(input, options));
      const body = await render(report);
      return new Response(body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  if (markdownPath) {
    routes.get(markdownPath, () => {
      const report = buildVoiceProviderOrchestrationReport(options);
      return new Response(renderVoiceProviderOrchestrationMarkdown(report), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  return routes;
};
