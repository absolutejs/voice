import { Elysia } from "elysia";
import {
  summarizeVoiceAuditSinkDeliveries,
  type VoiceAuditSinkDeliveryQueueSummary,
  type VoiceAuditSinkDeliveryStore,
} from "./auditSinks";
import {
  buildVoiceLatencySLOGate,
  renderVoiceLatencySLOMarkdown,
  type VoiceLatencySLOGateOptions,
  type VoiceLatencySLOGateReport,
} from "./latencySlo";
import {
  summarizeVoiceHandoffDeliveries,
  summarizeVoiceTraceSinkDeliveries,
  type VoiceHandoffDeliveryQueueSummary,
  type VoiceTraceSinkDeliveryQueueSummary,
} from "./queue";
import {
  summarizeVoiceProviderHealth,
  type VoiceProviderHealthSummary,
} from "./providerHealth";
import type { VoiceProductionReadinessCheck } from "./productionReadiness";
import type {
  StoredVoiceHandoffDelivery,
  VoiceHandoffDeliveryStore,
} from "./types";
import type {
  StoredVoiceTraceEvent,
  VoiceTraceEventStore,
  VoiceTraceSinkDeliveryStore,
} from "./trace";

export type VoiceOpsRecoveryStatus = "fail" | "pass" | "warn";

export type VoiceOpsRecoveryIssueCode =
  | "voice.ops_recovery.audit_delivery_failed"
  | "voice.ops_recovery.audit_delivery_pending"
  | "voice.ops_recovery.handoff_failed"
  | "voice.ops_recovery.handoff_pending"
  | "voice.ops_recovery.latency_slo_failed"
  | "voice.ops_recovery.latency_slo_warn"
  | "voice.ops_recovery.provider_unresolved_failure"
  | "voice.ops_recovery.trace_delivery_failed"
  | "voice.ops_recovery.trace_delivery_pending";

export type VoiceOpsRecoveryIssue = {
  code: VoiceOpsRecoveryIssueCode;
  detail?: string;
  href?: string;
  label: string;
  severity: Exclude<VoiceOpsRecoveryStatus, "pass">;
  value?: number | string;
};

export type VoiceOpsRecoveryProviderSummary<TProvider extends string = string> =
  {
    healthy: number;
    providers: VoiceProviderHealthSummary<TProvider>[];
    recoveredFallbacks: number;
    unresolvedFailures: number;
  };

export type VoiceOpsRecoveryInterventionSummary = {
  events: Array<{
    action?: string;
    at: number;
    operatorId?: string;
    sessionId: string;
    traceId?: string;
  }>;
  total: number;
};

export type VoiceOpsRecoveryFailedSession = {
  at: number;
  error?: string;
  operationsRecordHref?: string;
  provider?: string;
  sessionId: string;
  traceId?: string;
};

export type VoiceOpsRecoveryReport<TProvider extends string = string> = {
  auditDeliveries?: VoiceAuditSinkDeliveryQueueSummary;
  checkedAt: number;
  failedSessions: VoiceOpsRecoveryFailedSession[];
  handoffDeliveries?: VoiceHandoffDeliveryQueueSummary;
  interventions: VoiceOpsRecoveryInterventionSummary;
  issues: VoiceOpsRecoveryIssue[];
  latency?: VoiceLatencySLOGateReport;
  providers: VoiceOpsRecoveryProviderSummary<TProvider>;
  status: VoiceOpsRecoveryStatus;
  traceDeliveries?: VoiceTraceSinkDeliveryQueueSummary;
};

export type VoiceOpsRecoveryLinks = {
  auditDeliveries?: string;
  handoffs?: string;
  operationsRecords?: string | ((sessionId: string) => string);
  providers?: string;
  sessions?: string | ((sessionId: string) => string);
  traceDeliveries?: string;
  traces?: string | ((sessionId: string) => string);
};

export type VoiceOpsRecoveryReportOptions<TProvider extends string = string> = {
  auditDeliveryDeadLetters?: VoiceAuditSinkDeliveryStore;
  auditDeliveries?: VoiceAuditSinkDeliveryStore;
  events?: StoredVoiceTraceEvent[];
  handoffDeliveryDeadLetters?: VoiceHandoffDeliveryStore;
  handoffDeliveries?: VoiceHandoffDeliveryStore;
  latency?: VoiceLatencySLOGateOptions | false;
  limit?: number;
  links?: VoiceOpsRecoveryLinks;
  providers?: readonly TProvider[];
  traceDeliveryDeadLetters?: VoiceTraceSinkDeliveryStore;
  traceDeliveries?: VoiceTraceSinkDeliveryStore;
  traces?: VoiceTraceEventStore;
};

export type VoiceOpsRecoveryRoutesOptions<TProvider extends string = string> =
  VoiceOpsRecoveryReportOptions<TProvider> & {
    headers?: HeadersInit;
    htmlPath?: false | string;
    markdownPath?: false | string;
    name?: string;
    path?: string;
    render?: (
      report: VoiceOpsRecoveryReport<TProvider>,
    ) => string | Promise<string>;
    title?: string;
  };

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const hrefForSession = (
  value: VoiceOpsRecoveryLinks[keyof VoiceOpsRecoveryLinks],
  sessionId: string,
) => {
  if (typeof value === "function") {
    return value(sessionId);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const encoded = encodeURIComponent(sessionId);
  if (value.includes(":sessionId")) {
    return value.replace(":sessionId", encoded);
  }
  return value;
};

const operationsRecordHrefForSession = (
  links: VoiceOpsRecoveryLinks | undefined,
  sessionId: string,
) => hrefForSession(links?.operationsRecords, sessionId);

const rollupStatus = (
  issues: VoiceOpsRecoveryIssue[],
): VoiceOpsRecoveryStatus =>
  issues.some((issue) => issue.severity === "fail")
    ? "fail"
    : issues.some((issue) => issue.severity === "warn")
      ? "warn"
      : "pass";

const providerUnresolved = (provider: VoiceProviderHealthSummary) =>
  provider.status === "degraded" ||
  provider.status === "rate-limited" ||
  provider.status === "suppressed";

const collectFailedSessions = (
  events: StoredVoiceTraceEvent[],
  limit: number,
  links?: VoiceOpsRecoveryLinks,
): VoiceOpsRecoveryFailedSession[] =>
  events
    .filter((event) => {
      if (event.type !== "session.error") {
        return false;
      }
      const providerStatus = event.payload.providerStatus;
      return providerStatus !== "success" && providerStatus !== "fallback";
    })
    .sort((left, right) => right.at - left.at)
    .slice(0, limit)
    .map((event) => ({
      at: event.at,
      error: getString(event.payload.error),
      operationsRecordHref: operationsRecordHrefForSession(
        links,
        event.sessionId,
      ),
      provider: getString(event.payload.provider),
      sessionId: event.sessionId,
      traceId: event.traceId,
    }));

const collectInterventions = (
  events: StoredVoiceTraceEvent[],
  limit: number,
): VoiceOpsRecoveryInterventionSummary => {
  const interventionEvents = events
    .filter((event) => event.type === "operator.action")
    .sort((left, right) => right.at - left.at);

  return {
    events: interventionEvents.slice(0, limit).map((event) => ({
      action: getString(event.payload.action),
      at: event.at,
      operatorId:
        getString(event.payload.operatorId) ?? getString(event.payload.actorId),
      sessionId: event.sessionId,
      traceId: event.traceId,
    })),
    total: interventionEvents.length,
  };
};

const addDeliveryIssues = (
  issues: VoiceOpsRecoveryIssue[],
  input: {
    failedCode:
      | "voice.ops_recovery.audit_delivery_failed"
      | "voice.ops_recovery.trace_delivery_failed"
      | "voice.ops_recovery.handoff_failed";
    failedLabel: string;
    href?: string;
    pendingCode:
      | "voice.ops_recovery.audit_delivery_pending"
      | "voice.ops_recovery.trace_delivery_pending"
      | "voice.ops_recovery.handoff_pending";
    pendingLabel: string;
    summary:
      | VoiceAuditSinkDeliveryQueueSummary
      | VoiceTraceSinkDeliveryQueueSummary
      | VoiceHandoffDeliveryQueueSummary
      | undefined;
  },
) => {
  if (!input.summary) {
    return;
  }
  const failed = input.summary.failed + input.summary.deadLettered;
  if (failed > 0) {
    issues.push({
      code: input.failedCode,
      detail: `${failed} failed or dead-lettered delivery record(s).`,
      href: input.href,
      label: input.failedLabel,
      severity: "fail",
      value: failed,
    });
  }
  const pending = input.summary.pending + input.summary.retryEligible;
  if (pending > 0) {
    issues.push({
      code: input.pendingCode,
      detail: `${pending} pending or retry-eligible delivery record(s).`,
      href: input.href,
      label: input.pendingLabel,
      severity: "warn",
      value: pending,
    });
  }
};

export const buildVoiceOpsRecoveryReport = async <
  TProvider extends string = string,
>(
  options: VoiceOpsRecoveryReportOptions<TProvider> = {},
): Promise<VoiceOpsRecoveryReport<TProvider>> => {
  const limit = options.limit ?? 50;
  const events =
    options.events ??
    (await options.traces?.list({ limit: Math.max(limit, 500) })) ??
    [];
  const providers = await summarizeVoiceProviderHealth<TProvider>({
    events,
    providers: options.providers,
  });
  const auditDeliveries = options.auditDeliveries
    ? await summarizeVoiceAuditSinkDeliveries(
        await options.auditDeliveries.list(),
        {
          deadLetters: options.auditDeliveryDeadLetters,
        },
      )
    : undefined;
  const traceDeliveries = options.traceDeliveries
    ? await summarizeVoiceTraceSinkDeliveries(
        await options.traceDeliveries.list(),
        {
          deadLetters: options.traceDeliveryDeadLetters,
        },
      )
    : undefined;
  const handoffDeliveries = options.handoffDeliveries
    ? await summarizeVoiceHandoffDeliveries(
        (await options.handoffDeliveries.list()) as StoredVoiceHandoffDelivery[],
        {
          deadLetters: options.handoffDeliveryDeadLetters as
            | VoiceHandoffDeliveryStore<StoredVoiceHandoffDelivery>
            | undefined,
        },
      )
    : undefined;
  const latency =
    options.latency === false
      ? undefined
      : await buildVoiceLatencySLOGate({
          events,
          ...(options.latency ?? {}),
        });
  const failedSessions = collectFailedSessions(events, limit, options.links);
  const interventions = collectInterventions(events, limit);
  const issues: VoiceOpsRecoveryIssue[] = [];
  const unresolvedProviders = providers.filter(providerUnresolved);

  for (const provider of unresolvedProviders) {
    const failedSession = failedSessions.find(
      (session) => session.provider === provider.provider,
    );
    issues.push({
      code: "voice.ops_recovery.provider_unresolved_failure",
      detail:
        provider.lastError ??
        `${provider.provider} status is ${provider.status}.`,
      href: failedSession?.operationsRecordHref ?? options.links?.providers,
      label: `Provider ${provider.provider} needs recovery`,
      severity: "fail",
      value: provider.status,
    });
  }

  addDeliveryIssues(issues, {
    failedCode: "voice.ops_recovery.audit_delivery_failed",
    failedLabel: "Audit delivery failures",
    href: options.links?.auditDeliveries,
    pendingCode: "voice.ops_recovery.audit_delivery_pending",
    pendingLabel: "Audit delivery backlog",
    summary: auditDeliveries,
  });
  addDeliveryIssues(issues, {
    failedCode: "voice.ops_recovery.trace_delivery_failed",
    failedLabel: "Trace delivery failures",
    href: options.links?.traceDeliveries,
    pendingCode: "voice.ops_recovery.trace_delivery_pending",
    pendingLabel: "Trace delivery backlog",
    summary: traceDeliveries,
  });
  addDeliveryIssues(issues, {
    failedCode: "voice.ops_recovery.handoff_failed",
    failedLabel: "Handoff delivery failures",
    href: options.links?.handoffs,
    pendingCode: "voice.ops_recovery.handoff_pending",
    pendingLabel: "Handoff delivery backlog",
    summary: handoffDeliveries,
  });

  if (latency?.failed) {
    const failedMeasurement = latency.measurements.find(
      (measurement) => measurement.status === "fail",
    );
    issues.push({
      code: "voice.ops_recovery.latency_slo_failed",
      detail: `${latency.failed} latency SLO measurement(s) failed.`,
      href: failedMeasurement
        ? (operationsRecordHrefForSession(
            options.links,
            failedMeasurement.sessionId,
          ) ??
          hrefForSession(options.links?.traces, failedMeasurement.sessionId))
        : undefined,
      label: "Latency SLO failures",
      severity: "fail",
      value: latency.failed,
    });
  } else if (latency?.warnings) {
    issues.push({
      code: "voice.ops_recovery.latency_slo_warn",
      detail: `${latency.warnings} latency SLO measurement(s) are warning.`,
      label: "Latency SLO warnings",
      severity: "warn",
      value: latency.warnings,
    });
  }

  return {
    auditDeliveries,
    checkedAt: Date.now(),
    failedSessions,
    handoffDeliveries,
    interventions,
    issues,
    latency,
    providers: {
      healthy: providers.filter((provider) => provider.status === "healthy")
        .length,
      providers,
      recoveredFallbacks: providers.reduce(
        (total, provider) => total + provider.fallbackCount,
        0,
      ),
      unresolvedFailures: unresolvedProviders.length,
    },
    status: rollupStatus(issues),
    traceDeliveries,
  };
};

export const buildVoiceOpsRecoveryReadinessCheck = (
  report: VoiceOpsRecoveryReport,
  options: { href?: string; label?: string } = {},
): VoiceProductionReadinessCheck => ({
  detail:
    report.status === "pass"
      ? `${report.providers.recoveredFallbacks} recovered fallback(s), ${report.interventions.total} operator intervention(s), and no unresolved recovery issues.`
      : `${report.issues.length} recovery issue(s) require attention.`,
  href: options.href,
  label: options.label ?? "Ops recovery",
  status: report.status,
  value: report.issues.length,
});

export const renderVoiceOpsRecoveryMarkdown = (
  report: VoiceOpsRecoveryReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Ops Recovery";
  const issueRows = report.issues
    .map(
      (issue) =>
        `| ${issue.severity} | ${issue.code} | ${issue.href ? `[${issue.label}](${issue.href})` : issue.label} | ${issue.value ?? ""} | ${issue.detail ?? ""} |`,
    )
    .join("\n");
  const providers = report.providers.providers
    .map(
      (provider) =>
        `| ${provider.provider} | ${provider.status} | ${provider.runCount} | ${provider.errorCount} | ${provider.fallbackCount} | ${provider.lastError ?? ""} |`,
    )
    .join("\n");
  const failedSessions = report.failedSessions
    .map(
      (session) =>
        `- ${session.operationsRecordHref ? `[${session.sessionId}](${session.operationsRecordHref})` : session.sessionId}${session.provider ? ` via ${session.provider}` : ""}${session.error ? `: ${session.error}` : ""}`,
    )
    .join("\n");

  return `# ${title}

Status: ${report.status}

Checked at: ${new Date(report.checkedAt).toISOString()}

Recovered fallbacks: ${report.providers.recoveredFallbacks}
Unresolved provider failures: ${report.providers.unresolvedFailures}
Operator interventions: ${report.interventions.total}

## Issues

| Severity | Code | Label | Value | Detail |
| --- | --- | --- | ---: | --- |
${issueRows || "| pass | none | No recovery issues | 0 | |"}

## Providers

| Provider | Status | Runs | Errors | Fallbacks | Last error |
| --- | --- | ---: | ---: | ---: | --- |
${providers || "| none | idle | 0 | 0 | 0 | |"}

## Failed Sessions

${failedSessions || "None."}

## Latency

${report.latency ? renderVoiceLatencySLOMarkdown(report.latency, { title: "Latency SLO" }) : "Latency SLO disabled."}
`;
};

const renderDeliverySummary = (
  label: string,
  summary:
    | VoiceAuditSinkDeliveryQueueSummary
    | VoiceTraceSinkDeliveryQueueSummary
    | VoiceHandoffDeliveryQueueSummary
    | undefined,
) =>
  summary
    ? `<article><span>${escapeHtml(label)}</span><strong>${String(summary.failed + summary.deadLettered)} failed</strong><small>${String(summary.pending)} pending · ${String(summary.retryEligible)} retry eligible · ${String(summary.total)} total</small></article>`
    : `<article><span>${escapeHtml(label)}</span><strong>not configured</strong></article>`;

export const renderVoiceOpsRecoveryHTML = (
  report: VoiceOpsRecoveryReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Ops Recovery";
  const issues = report.issues
    .map(
      (issue) =>
        `<tr><td>${escapeHtml(issue.severity)}</td><td><code>${escapeHtml(issue.code)}</code></td><td>${issue.href ? `<a href="${escapeHtml(issue.href)}">${escapeHtml(issue.label)}</a>` : escapeHtml(issue.label)}</td><td>${escapeHtml(String(issue.value ?? ""))}</td><td>${escapeHtml(issue.detail ?? "")}</td></tr>`,
    )
    .join("");
  const providers = report.providers.providers
    .map(
      (provider) =>
        `<tr><td>${escapeHtml(provider.provider)}</td><td>${escapeHtml(provider.status)}</td><td>${String(provider.runCount)}</td><td>${String(provider.errorCount)}</td><td>${String(provider.fallbackCount)}</td><td>${escapeHtml(provider.lastError ?? "")}</td></tr>`,
    )
    .join("");
  const failedSessions = report.failedSessions
    .map(
      (session) =>
        `<li>${session.operationsRecordHref ? `<a href="${escapeHtml(session.operationsRecordHref)}">${escapeHtml(session.sessionId)}</a>` : escapeHtml(session.sessionId)}${session.provider ? ` via ${escapeHtml(session.provider)}` : ""}${session.error ? `: ${escapeHtml(session.error)}` : ""}</li>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#f8fafc;color:#172033;margin:2rem;line-height:1.45}main{max-width:1180px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.75rem;margin:1rem 0}article{background:white;border:1px solid #dbe3ef;border-radius:14px;padding:1rem;box-shadow:0 10px 28px rgba(15,23,42,.05)}article span{display:block;color:#64748b;font-size:.85rem}article strong{display:block;font-size:1.5rem;margin:.2rem 0}article small{color:#64748b}table{border-collapse:collapse;width:100%;background:white;border:1px solid #dbe3ef;border-radius:14px;overflow:hidden}th,td{border-bottom:1px solid #e2e8f0;padding:.7rem;text-align:left;vertical-align:top}code{font-size:.85em}.status{display:inline-flex;border-radius:999px;padding:.35rem .7rem;background:${report.status === "fail" ? "#fee2e2" : report.status === "warn" ? "#fef3c7" : "#dcfce7"};color:${report.status === "fail" ? "#991b1b" : report.status === "warn" ? "#92400e" : "#166534"};font-weight:700}</style></head><body><main><h1>${escapeHtml(title)}</h1><p><span class="status">${escapeHtml(report.status)}</span> Checked ${escapeHtml(new Date(report.checkedAt).toLocaleString())}</p><section class="grid"><article><span>Recovered fallbacks</span><strong>${String(report.providers.recoveredFallbacks)}</strong></article><article><span>Unresolved providers</span><strong>${String(report.providers.unresolvedFailures)}</strong></article><article><span>Operator interventions</span><strong>${String(report.interventions.total)}</strong></article><article><span>Latency status</span><strong>${escapeHtml(report.latency?.status ?? "disabled")}</strong></article>${renderDeliverySummary("Audit delivery", report.auditDeliveries)}${renderDeliverySummary("Trace delivery", report.traceDeliveries)}${renderDeliverySummary("Handoff delivery", report.handoffDeliveries)}</section><h2>Issues</h2><table><thead><tr><th>Severity</th><th>Code</th><th>Label</th><th>Value</th><th>Detail</th></tr></thead><tbody>${issues || '<tr><td colspan="5">No recovery issues.</td></tr>'}</tbody></table><h2>Providers</h2><table><thead><tr><th>Provider</th><th>Status</th><th>Runs</th><th>Errors</th><th>Fallbacks</th><th>Last error</th></tr></thead><tbody>${providers || '<tr><td colspan="6">No provider activity.</td></tr>'}</tbody></table><h2>Failed Sessions</h2><ul>${failedSessions || "<li>None.</li>"}</ul></main></body></html>`;
};

export const createVoiceOpsRecoveryRoutes = <TProvider extends string = string>(
  options: VoiceOpsRecoveryRoutesOptions<TProvider> = {},
) => {
  const path = options.path ?? "/api/voice/ops-recovery";
  const htmlPath =
    options.htmlPath === undefined ? "/ops-recovery" : options.htmlPath;
  const markdownPath =
    options.markdownPath === undefined ? `${path}.md` : options.markdownPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-ops-recovery",
  }).get(path, async () => buildVoiceOpsRecoveryReport(options));

  if (htmlPath) {
    routes.get(htmlPath, async () => {
      const report = await buildVoiceOpsRecoveryReport(options);
      const render = options.render ?? renderVoiceOpsRecoveryHTML;
      return new Response(await render(report), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  if (markdownPath) {
    routes.get(markdownPath, async () => {
      const report = await buildVoiceOpsRecoveryReport(options);
      return new Response(
        renderVoiceOpsRecoveryMarkdown(report, { title: options.title }),
        {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            ...options.headers,
          },
        },
      );
    });
  }

  return routes;
};
