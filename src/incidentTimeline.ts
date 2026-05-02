import { Elysia } from "elysia";
import { recordVoiceOpsActionAudit } from "./opsActionAuditRoutes";
import type {
  VoiceFailureReplayReport,
  VoiceOperationsRecord,
} from "./operationsRecord";
import type { VoiceOperationalStatusReport } from "./operationalStatus";
import type { VoiceOpsRecoveryReport } from "./opsRecovery";
import type { VoiceProductionReadinessCheck } from "./productionReadiness";
import type { StoredVoiceAuditEvent, VoiceAuditEventStore } from "./audit";
import type { VoiceTraceEventStore } from "./trace";
import type { VoiceMonitorIssue } from "./voiceMonitoring";

export type VoiceIncidentTimelineStatus = "fail" | "pass" | "warn";

export type VoiceIncidentTimelineSeverity = "critical" | "info" | "warn";

export type VoiceIncidentTimelineAction = {
  href?: string;
  label: string;
  method?: "GET" | "POST";
};

export type VoiceIncidentRecoveryAction = {
  detail?: string;
  disabled?: boolean;
  eventId?: string;
  href?: string;
  id: string;
  label: string;
  method?: "GET" | "POST";
  sessionId?: string;
};

export type VoiceIncidentRecoveryActionResult = {
  actionId: string;
  afterStatus?: VoiceIncidentTimelineStatus;
  beforeStatus?: VoiceIncidentTimelineStatus;
  detail?: string;
  href?: string;
  ok: boolean;
  status?: string;
};

export type VoiceIncidentRecoveryActionHandlerInput = {
  action: VoiceIncidentRecoveryAction;
  actionId: string;
  report: VoiceIncidentTimelineReport;
  request: Request;
};

export type VoiceIncidentRecoveryActionHandler = (
  input: VoiceIncidentRecoveryActionHandlerInput,
) =>
  | Promise<VoiceIncidentRecoveryActionResult>
  | VoiceIncidentRecoveryActionResult;

export type VoiceIncidentRecoveryOutcome =
  | "failed"
  | "improved"
  | "regressed"
  | "unchanged";

export type VoiceIncidentRecoveryOutcomeEntry = {
  actionId: string;
  afterStatus?: VoiceIncidentTimelineStatus;
  at: number;
  beforeStatus?: VoiceIncidentTimelineStatus;
  detail?: string;
  eventId: string;
  outcome: VoiceIncidentRecoveryOutcome;
  status?: number;
  traceId?: string;
};

export type VoiceIncidentRecoveryOutcomeReport = {
  checkedAt: number;
  entries: VoiceIncidentRecoveryOutcomeEntry[];
  failed: number;
  improved: number;
  regressed: number;
  total: number;
  unchanged: number;
};

export type VoiceIncidentRecoveryTrendStatus =
  | "empty"
  | "fail"
  | "pass"
  | "warn";

export type VoiceIncidentRecoveryTrendSloMode = "aggregate" | "latest";

export type VoiceIncidentRecoveryTrendSloOptions = {
  href?: string;
  label?: string;
  maxFailureRate?: number;
  maxRegressionRate?: number;
  maxUnchangedRate?: number;
  minActions?: number;
  minCycles?: number;
  minImprovementRate?: number;
  warnWhenEmpty?: boolean;
  mode?: VoiceIncidentRecoveryTrendSloMode;
};

export type VoiceIncidentRecoveryTrendCycle = {
  checkedAt: number;
  failed: number;
  failureRate: number;
  improved: number;
  improvementRate: number;
  regressed: number;
  regressionRate: number;
  total: number;
  unchanged: number;
  unchangedRate: number;
};

export type VoiceIncidentRecoveryTrendReport = {
  checkedAt: number;
  cycles: VoiceIncidentRecoveryTrendCycle[];
  latest?: VoiceIncidentRecoveryTrendCycle;
  previous?: VoiceIncidentRecoveryTrendCycle;
  status: VoiceIncidentRecoveryTrendStatus;
  summary: {
    cycles: number;
    failed: number;
    failureRate: number;
    improved: number;
    improvementRate: number;
    regressed: number;
    regressionRate: number;
    total: number;
    unchanged: number;
    unchangedRate: number;
  };
  trend: {
    failureRateDelta?: number;
    improvementRateDelta?: number;
    regressionRateDelta?: number;
    unchangedRateDelta?: number;
  };
};

export type VoiceIncidentRecoveryOutcomeOptions = {
  audit?: VoiceAuditEventStore;
  limit?: number;
};

export type VoiceIncidentRecoveryOutcomeReadinessOptions = {
  failOnFailed?: boolean;
  failOnRegressed?: boolean;
  href?: string;
  label?: string;
  maxUnchanged?: number;
  warnWhenEmpty?: boolean;
};

export type VoiceIncidentTimelineEvent = {
  action?: VoiceIncidentTimelineAction;
  at: number;
  category:
    | "call"
    | "delivery"
    | "failure-replay"
    | "monitor"
    | "operational-status"
    | "readiness"
    | "recovery";
  detail?: string;
  href?: string;
  id: string;
  label: string;
  sessionId?: string;
  severity: VoiceIncidentTimelineSeverity;
  source: string;
  value?: number | string;
};

export type VoiceIncidentTimelineReport = {
  actions: VoiceIncidentRecoveryAction[];
  events: VoiceIncidentTimelineEvent[];
  generatedAt: number;
  links: VoiceIncidentTimelineLinks;
  status: VoiceIncidentTimelineStatus;
  summary: {
    critical: number;
    info: number;
    total: number;
    warn: number;
  };
  windowMs?: number;
};

export type VoiceIncidentTimelineValue<TValue> =
  | TValue
  | (() => Promise<TValue> | TValue);

export type VoiceIncidentTimelineLinks = {
  callDebugger?: string | ((sessionId: string) => string);
  deliveryRuntime?: string;
  failureReplay?: string | ((sessionId: string) => string);
  monitorIssues?: string;
  operationalStatus?: string;
  operationsRecords?: string | ((sessionId: string) => string);
  productionReadiness?: string;
  proofPack?: string;
  supportBundle?: string | ((sessionId: string) => string);
};

export type VoiceIncidentTimelineOptions = {
  failureReplays?: VoiceIncidentTimelineValue<
    readonly VoiceFailureReplayReport[]
  >;
  links?: VoiceIncidentTimelineLinks;
  limit?: number;
  monitorIssues?: VoiceIncidentTimelineValue<readonly VoiceMonitorIssue[]>;
  now?: number;
  operationalStatus?: VoiceIncidentTimelineValue<VoiceOperationalStatusReport>;
  operationsRecords?: VoiceIncidentTimelineValue<
    readonly VoiceOperationsRecord[]
  >;
  opsRecovery?: VoiceIncidentTimelineValue<VoiceOpsRecoveryReport>;
  recoveryActions?:
    | readonly VoiceIncidentRecoveryAction[]
    | ((input: {
        events: readonly VoiceIncidentTimelineEvent[];
        report: Omit<VoiceIncidentTimelineReport, "actions">;
      }) =>
        | Promise<readonly VoiceIncidentRecoveryAction[]>
        | readonly VoiceIncidentRecoveryAction[]);
  windowMs?: number;
};

export type VoiceIncidentTimelineRoutesOptions =
  VoiceIncidentTimelineOptions & {
    actionHandlers?: Record<string, VoiceIncidentRecoveryActionHandler>;
    actionPath?: false | string;
    audit?: VoiceAuditEventStore;
    headers?: HeadersInit;
    htmlPath?: false | string;
    markdownPath?: false | string;
    name?: string;
    path?: string;
    render?: (report: VoiceIncidentTimelineReport) => string | Promise<string>;
    recoveryOutcomeHtmlPath?: false | string;
    recoveryOutcomePath?: false | string;
    recoveryTrendHtmlPath?: false | string;
    recoveryTrendMarkdownPath?: false | string;
    recoveryTrendPath?: false | string;
    recoveryTrendReports?:
      | VoiceIncidentRecoveryOutcomeReport[]
      | (() =>
          | VoiceIncidentRecoveryOutcomeReport[]
          | Promise<VoiceIncidentRecoveryOutcomeReport[]>);
    title?: string;
    trace?: VoiceTraceEventStore;
  };

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const resolveValue = async <TValue>(
  value: VoiceIncidentTimelineValue<TValue> | undefined,
) =>
  typeof value === "function"
    ? await (value as () => Promise<TValue> | TValue)()
    : value;

const linkForSession = (
  link: string | ((sessionId: string) => string) | undefined,
  sessionId: string | undefined,
) => {
  if (!link || !sessionId) {
    return undefined;
  }

  return typeof link === "function" ? link(sessionId) : link;
};

const statusToSeverity = (
  status:
    | "fail"
    | "failed"
    | "healthy"
    | "pass"
    | "recovered"
    | "warn"
    | "warning",
): VoiceIncidentTimelineSeverity =>
  status === "fail" || status === "failed"
    ? "critical"
    : status === "warn" || status === "warning" || status === "recovered"
      ? "warn"
      : "info";

const failureReplayStatusToSeverity = (
  status: VoiceFailureReplayReport["status"],
): VoiceIncidentTimelineSeverity =>
  status === "failed" ? "critical" : status === "healthy" ? "info" : "warn";

const withinWindow = (
  event: VoiceIncidentTimelineEvent,
  now: number,
  windowMs: number | undefined,
) => !windowMs || event.at >= now - windowMs;

const eventStatus = (
  event: VoiceIncidentTimelineEvent,
): VoiceIncidentTimelineStatus =>
  event.severity === "critical"
    ? "fail"
    : event.severity === "warn"
      ? "warn"
      : "pass";

const defaultIncidentRecoveryActions = (
  events: readonly VoiceIncidentTimelineEvent[],
  links: VoiceIncidentTimelineLinks,
): VoiceIncidentRecoveryAction[] => {
  const actions: VoiceIncidentRecoveryAction[] = [];
  const add = (action: VoiceIncidentRecoveryAction) => {
    const key = `${action.id}:${action.sessionId ?? ""}:${action.href ?? ""}`;
    if (
      actions.some(
        (existing) =>
          `${existing.id}:${existing.sessionId ?? ""}:${existing.href ?? ""}` ===
          key,
      )
    ) {
      return;
    }
    actions.push(action);
  };

  for (const event of events) {
    if (event.category === "delivery") {
      add({
        detail:
          "Ask the app to tick delivery workers or retry failed delivery queue work.",
        eventId: event.id,
        href: links.deliveryRuntime,
        id: "delivery.retry",
        label: "Retry delivery work",
        method: "POST",
        sessionId: event.sessionId,
      });
    }
    if (
      event.category === "readiness" ||
      event.category === "operational-status"
    ) {
      add({
        detail:
          "Refresh production readiness and proof freshness before declaring the incident resolved.",
        eventId: event.id,
        href: links.productionReadiness ?? links.operationalStatus,
        id: "readiness.refresh",
        label: "Refresh readiness proof",
        method: "POST",
        sessionId: event.sessionId,
      });
    }
    if (event.sessionId) {
      add({
        detail:
          "Generate or open a support/debug artifact for the affected call.",
        eventId: event.id,
        href:
          linkForSession(links.supportBundle, event.sessionId) ??
          linkForSession(links.callDebugger, event.sessionId),
        id: "support.bundle",
        label: "Generate support bundle",
        method: "POST",
        sessionId: event.sessionId,
      });
    }
  }

  if (events.some((event) => event.severity !== "info")) {
    add({
      detail:
        "Rerun the app proof pack to confirm the current release evidence is fresh.",
      href: links.proofPack,
      id: "proof.rerun",
      label: "Rerun proof pack",
      method: "POST",
    });
  }

  return actions;
};

const worstStatus = (
  statuses: readonly VoiceIncidentTimelineStatus[],
): VoiceIncidentTimelineStatus =>
  statuses.includes("fail")
    ? "fail"
    : statuses.includes("warn")
      ? "warn"
      : "pass";

const statusRank = (status: VoiceIncidentTimelineStatus | undefined) =>
  status === "fail" ? 3 : status === "warn" ? 2 : status === "pass" ? 1 : 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const getIncidentRecoveryBody = (event: StoredVoiceAuditEvent) => {
  const payload = isRecord(event.payload) ? event.payload : {};
  return isRecord(payload.body) ? payload.body : {};
};

const getIncidentRecoveryStatus = (
  value: unknown,
): VoiceIncidentTimelineStatus | undefined =>
  value === "fail" || value === "pass" || value === "warn" ? value : undefined;

const getIncidentRecoveryDetail = (event: StoredVoiceAuditEvent) => {
  const payload = isRecord(event.payload) ? event.payload : {};
  const body = getIncidentRecoveryBody(event);
  const result = isRecord(body.result) ? body.result : {};
  const detail = result.detail ?? payload.error;

  return typeof detail === "string" ? detail : undefined;
};

const toIncidentRecoveryOutcomeEntry = (
  event: StoredVoiceAuditEvent,
): VoiceIncidentRecoveryOutcomeEntry => {
  const body = getIncidentRecoveryBody(event);
  const beforeStatus = getIncidentRecoveryStatus(body.beforeStatus);
  const afterStatus = getIncidentRecoveryStatus(body.afterStatus);
  const beforeRank = statusRank(beforeStatus);
  const afterRank = statusRank(afterStatus);
  const outcome: VoiceIncidentRecoveryOutcome =
    event.outcome === "error"
      ? "failed"
      : beforeRank > 0 && afterRank > 0 && afterRank < beforeRank
        ? "improved"
        : beforeRank > 0 && afterRank > beforeRank
          ? "regressed"
          : "unchanged";
  const payload = isRecord(event.payload) ? event.payload : {};

  return {
    actionId: event.action.replace(/^incident\./, ""),
    afterStatus,
    at: event.at,
    beforeStatus,
    detail: getIncidentRecoveryDetail(event),
    eventId: event.id,
    outcome,
    status: typeof payload.status === "number" ? payload.status : undefined,
    traceId: event.traceId,
  };
};

export const buildVoiceIncidentRecoveryOutcomeReport = async (
  options: VoiceIncidentRecoveryOutcomeOptions,
): Promise<VoiceIncidentRecoveryOutcomeReport> => {
  const events = options.audit
    ? await options.audit.list({
        limit: options.limit ?? 50,
        resourceType: "voice.ops.action",
        type: "operator.action",
      })
    : [];
  const entries = events
    .filter((event) => event.action.startsWith("incident."))
    .map(toIncidentRecoveryOutcomeEntry)
    .sort((left, right) => right.at - left.at);

  return {
    checkedAt: Date.now(),
    entries,
    failed: entries.filter((entry) => entry.outcome === "failed").length,
    improved: entries.filter((entry) => entry.outcome === "improved").length,
    regressed: entries.filter((entry) => entry.outcome === "regressed").length,
    total: entries.length,
    unchanged: entries.filter((entry) => entry.outcome === "unchanged").length,
  };
};

export const renderVoiceIncidentRecoveryOutcomeHTML = (
  report: VoiceIncidentRecoveryOutcomeReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "AbsoluteJS Voice Incident Recovery Outcomes";
  const rows = report.entries
    .map(
      (entry) =>
        `<article class="${escapeHtml(entry.outcome)}"><span>${escapeHtml(entry.outcome.toUpperCase())}</span><h2>${escapeHtml(entry.actionId)}</h2><p>${escapeHtml(new Date(entry.at).toLocaleString())}</p><strong>${escapeHtml(entry.beforeStatus ?? "unknown")} -> ${escapeHtml(entry.afterStatus ?? "unknown")}</strong>${entry.detail ? `<p>${escapeHtml(entry.detail)}</p>` : ""}</article>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#10120d;color:#fbf4df;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:980px;padding:32px}.hero,article{background:#181711;border:1px solid #39301d;border-radius:24px;padding:20px}.hero{margin-bottom:16px}h1{font-size:clamp(2rem,6vw,4.5rem);line-height:.95}.summary{display:flex;flex-wrap:wrap;gap:10px}.summary span{border:1px solid #4a3f23;border-radius:999px;padding:8px 12px}section{display:grid;gap:12px}article.improved{border-color:rgba(34,197,94,.65)}article.failed,article.regressed{border-color:rgba(239,68,68,.8)}article.unchanged{border-color:rgba(245,158,11,.7)}article span{color:#fcd34d;font-weight:900;letter-spacing:.08em}article strong{display:block;font-size:1.4rem;margin:.5rem 0}p{color:#cfc5a8}</style></head><body><main><section class="hero"><span>Recovery proof</span><h1>${escapeHtml(title)}</h1><div class="summary"><span>${String(report.improved)} improved</span><span>${String(report.unchanged)} unchanged</span><span>${String(report.regressed)} regressed</span><span>${String(report.failed)} failed</span><span>${String(report.total)} total</span></div></section><section>${rows || "<p>No incident recovery actions have been recorded.</p>"}</section></main></body></html>`;
};

export const buildVoiceIncidentRecoveryOutcomeReadinessCheck = (
  report: VoiceIncidentRecoveryOutcomeReport,
  options: VoiceIncidentRecoveryOutcomeReadinessOptions = {},
): VoiceProductionReadinessCheck => {
  const failOnFailed = options.failOnFailed ?? true;
  const failOnRegressed = options.failOnRegressed ?? true;
  const warnWhenEmpty = options.warnWhenEmpty ?? false;
  const maxUnchanged = options.maxUnchanged ?? Number.POSITIVE_INFINITY;
  const tooManyUnchanged = report.unchanged > maxUnchanged;
  const status =
    (failOnFailed && report.failed > 0) ||
    (failOnRegressed && report.regressed > 0)
      ? "fail"
      : report.failed > 0 ||
          report.regressed > 0 ||
          tooManyUnchanged ||
          (warnWhenEmpty && report.total === 0)
        ? "warn"
        : "pass";

  return {
    actions:
      status === "pass"
        ? []
        : [
            {
              description:
                "Open incident recovery outcomes to inspect failed, regressed, or unchanged operator actions.",
              href:
                options.href ??
                "/api/voice/incident-timeline/recovery-outcomes",
              label: "Open recovery outcomes",
            },
          ],
    detail:
      status === "pass"
        ? `${report.improved} improved recovery action(s), ${report.unchanged} unchanged, ${report.regressed} regressed, and ${report.failed} failed.`
        : `${report.failed} failed, ${report.regressed} regressed, and ${report.unchanged} unchanged incident recovery action(s) need review.`,
    gateExplanation: {
      evidenceHref:
        options.href ?? "/api/voice/incident-timeline/recovery-outcomes",
      observed: `${report.failed} failed, ${report.regressed} regressed, ${report.unchanged} unchanged`,
      remediation:
        "Inspect recent incident recovery actions, fix failed or regressed handlers, rerun the recovery, and refresh readiness before deploy.",
      threshold: `failed <= ${failOnFailed ? 0 : "warn"}, regressed <= ${failOnRegressed ? 0 : "warn"}, unchanged <= ${Number.isFinite(maxUnchanged) ? maxUnchanged : "unbounded"}`,
      thresholdLabel: "Incident recovery outcome budget",
      unit: "count",
    },
    href: options.href ?? "/api/voice/incident-timeline/recovery-outcomes",
    label: options.label ?? "Incident recovery outcomes",
    status,
    value: `${report.improved}/${report.total} improved`,
  };
};

export const buildVoiceIncidentRecoveryTrendSLOReadinessCheck = (
  report: VoiceIncidentRecoveryTrendReport,
  options: VoiceIncidentRecoveryTrendSloOptions = {},
): VoiceProductionReadinessCheck => {
  const mode = options.mode ?? "latest";
  const minCycles = Math.max(1, options.minCycles ?? 1);
  const minActions = Math.max(1, options.minActions ?? 1);
  const minImprovementRate = options.minImprovementRate ?? 0;
  const maxRegressionRate = options.maxRegressionRate ?? 0;
  const maxFailureRate = options.maxFailureRate ?? 0;
  const maxUnchangedRate = options.maxUnchangedRate ?? 1;
  const warnWhenEmpty = options.warnWhenEmpty ?? true;
  const href = options.href ?? "/api/voice/incident-timeline/recovery-trends";

  const modeLatestCycle = report.latest;
  const modeAggregate = report.summary.cycles > 0;
  const modeTarget =
    mode === "aggregate"
      ? modeAggregate
        ? {
            failed: report.summary.failed,
            failureRate: report.summary.failureRate,
            improved: report.summary.improved,
            improvementRate: report.summary.improvementRate,
            regressed: report.summary.regressed,
            regressionRate: report.summary.regressionRate,
            total: report.summary.total,
            unchanged: report.summary.unchanged,
            unchangedRate: report.summary.unchangedRate,
          }
        : undefined
      : modeLatestCycle;

  const insufficientCycles = report.cycles.length < minCycles;
  const empty = !modeTarget || modeTarget.total === 0;
  const insufficientActions = !empty && modeTarget.total < minActions;
  const failedRate = modeTarget?.failureRate ?? 0;
  const regressedRate = modeTarget?.regressionRate ?? 0;
  const unchangedRate = modeTarget?.unchangedRate ?? 0;
  const improvementRate = modeTarget?.improvementRate ?? 0;

  const issues: string[] = [];
  if (empty && warnWhenEmpty) {
    issues.push(
      "No incident recovery actions found in the configured trend window.",
    );
  }
  if (insufficientCycles) {
    issues.push(
      `Need at least ${minCycles} trend cycle(s) before enforcing trend SLOs, found ${report.cycles.length}.`,
    );
  }
  if (insufficientActions) {
    issues.push(
      `Need at least ${minActions} recovery actions in the trend cycle, found ${modeTarget?.total ?? 0}.`,
    );
  }
  if (improvementRate < minImprovementRate) {
    issues.push(
      `Improvement rate ${Math.round(improvementRate * 100)}% is below minimum ${Math.round(minImprovementRate * 100)}%.`,
    );
  }
  if (regressedRate > maxRegressionRate) {
    issues.push(
      `Regression rate ${Math.round(regressedRate * 100)}% is above maximum ${Math.round(maxRegressionRate * 100)}%.`,
    );
  }
  if (failedRate > maxFailureRate) {
    issues.push(
      `Failure rate ${Math.round(failedRate * 100)}% is above maximum ${Math.round(maxFailureRate * 100)}%.`,
    );
  }
  if (unchangedRate > maxUnchangedRate) {
    issues.push(
      `Unchanged rate ${Math.round(unchangedRate * 100)}% is above maximum ${Math.round(maxUnchangedRate * 100)}%.`,
    );
  }

  const fail = issues.some(
    (issue) =>
      issue.includes("Regression rate") || issue.includes("Failure rate"),
  );
  const status: "pass" | "warn" | "fail" = fail
    ? "fail"
    : issues.length > 0
      ? "warn"
      : "pass";

  const detail =
    empty && warnWhenEmpty
      ? `${mode} trend is empty; set up recovery action execution before release.`
      : `${mode} trend has ${modeTarget?.total ?? 0} recovery action(s), ${Math.round(improvementRate * 100)}% improved, ${Math.round(regressedRate * 100)}% regressed, ${Math.round(failedRate * 100)}% failed, ${Math.round(unchangedRate * 100)}% unchanged.`;

  return {
    actions:
      status === "pass"
        ? []
        : [
            {
              description: `Open recovery trend report and tighten recovery handling before deploy.`,
              href,
              label: `Open recovery trend report`,
            },
          ],
    detail,
    gateExplanation: modeTarget
      ? {
          evidenceHref: href,
          observed: `improvement ${Math.round(improvementRate * 100)}%, regression ${Math.round(regressedRate * 100)}%, failure ${Math.round(failedRate * 100)}%, unchanged ${Math.round(unchangedRate * 100)}%`,
          threshold: `cycles >= ${minCycles}, actions >= ${minActions}`,
          thresholdLabel: "Incident recovery trend SLO budget",
          unit: "rate",
          remediation:
            "Run recovery recovery actions and harden handler fallbacks, then rerun recovery trend capture.",
        }
      : undefined,
    href,
    label: options.label ?? "Incident recovery trend SLO",
    status,
    value: `${Math.round(improvementRate * 100)}% improved, ${Math.round(regressedRate * 100)}% regressed`,
  };
};

const rate = (count: number, total: number) => (total > 0 ? count / total : 0);

const toIncidentRecoveryTrendCycle = (
  report: VoiceIncidentRecoveryOutcomeReport,
): VoiceIncidentRecoveryTrendCycle => ({
  checkedAt: report.checkedAt,
  failed: report.failed,
  failureRate: rate(report.failed, report.total),
  improved: report.improved,
  improvementRate: rate(report.improved, report.total),
  regressed: report.regressed,
  regressionRate: rate(report.regressed, report.total),
  total: report.total,
  unchanged: report.unchanged,
  unchangedRate: rate(report.unchanged, report.total),
});

export const buildVoiceIncidentRecoveryTrendReport = (
  reports: readonly VoiceIncidentRecoveryOutcomeReport[] = [],
): VoiceIncidentRecoveryTrendReport => {
  const cycles = reports
    .map(toIncidentRecoveryTrendCycle)
    .sort((left, right) => left.checkedAt - right.checkedAt);
  const totals = cycles.reduce(
    (summary, cycle) => ({
      failed: summary.failed + cycle.failed,
      improved: summary.improved + cycle.improved,
      regressed: summary.regressed + cycle.regressed,
      total: summary.total + cycle.total,
      unchanged: summary.unchanged + cycle.unchanged,
    }),
    { failed: 0, improved: 0, regressed: 0, total: 0, unchanged: 0 },
  );
  const latest = cycles.at(-1);
  const previous = cycles.at(-2);
  const status: VoiceIncidentRecoveryTrendStatus =
    cycles.length === 0
      ? "empty"
      : latest && (latest.failed > 0 || latest.regressed > 0)
        ? "fail"
        : latest &&
            previous &&
            (latest.improvementRate < previous.improvementRate ||
              latest.unchangedRate > previous.unchangedRate)
          ? "warn"
          : "pass";

  return {
    checkedAt: Date.now(),
    cycles,
    latest,
    previous,
    status,
    summary: {
      cycles: cycles.length,
      failed: totals.failed,
      failureRate: rate(totals.failed, totals.total),
      improved: totals.improved,
      improvementRate: rate(totals.improved, totals.total),
      regressed: totals.regressed,
      regressionRate: rate(totals.regressed, totals.total),
      total: totals.total,
      unchanged: totals.unchanged,
      unchangedRate: rate(totals.unchanged, totals.total),
    },
    trend: {
      failureRateDelta:
        latest && previous
          ? latest.failureRate - previous.failureRate
          : undefined,
      improvementRateDelta:
        latest && previous
          ? latest.improvementRate - previous.improvementRate
          : undefined,
      regressionRateDelta:
        latest && previous
          ? latest.regressionRate - previous.regressionRate
          : undefined,
      unchangedRateDelta:
        latest && previous
          ? latest.unchangedRate - previous.unchangedRate
          : undefined,
    },
  };
};

const percent = (value: number | undefined) =>
  value === undefined ? "n/a" : `${Math.round(value * 100)}%`;

export const renderVoiceIncidentRecoveryTrendMarkdown = (
  report: VoiceIncidentRecoveryTrendReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Incident Recovery Trend";
  const rows = report.cycles
    .map(
      (cycle) =>
        `| ${new Date(cycle.checkedAt).toISOString()} | ${cycle.total} | ${cycle.improved} | ${cycle.unchanged} | ${cycle.regressed} | ${cycle.failed} | ${percent(cycle.improvementRate)} | ${percent(cycle.regressionRate)} |`,
    )
    .join("\n");

  return `# ${title}

Generated: ${new Date(report.checkedAt).toISOString()}

Status: **${report.status}**

Cycles: ${report.summary.cycles}

Total actions: ${report.summary.total}

Improvement rate: ${percent(report.summary.improvementRate)}

Regression rate: ${percent(report.summary.regressionRate)}

Failure rate: ${percent(report.summary.failureRate)}

Unchanged rate: ${percent(report.summary.unchangedRate)}

Improvement delta: ${percent(report.trend.improvementRateDelta)}

Regression delta: ${percent(report.trend.regressionRateDelta)}

## Cycles

| Checked at | Total | Improved | Unchanged | Regressed | Failed | Improve % | Regress % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows || "| n/a | 0 | 0 | 0 | 0 | 0 | n/a | n/a |"}
`;
};

export const renderVoiceIncidentRecoveryTrendHTML = (
  report: VoiceIncidentRecoveryTrendReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "AbsoluteJS Voice Incident Recovery Trend";
  const rows = report.cycles
    .map(
      (cycle) =>
        `<tr><td>${escapeHtml(new Date(cycle.checkedAt).toLocaleString())}</td><td>${String(cycle.total)}</td><td>${String(cycle.improved)}</td><td>${String(cycle.unchanged)}</td><td>${String(cycle.regressed)}</td><td>${String(cycle.failed)}</td><td>${escapeHtml(percent(cycle.improvementRate))}</td><td>${escapeHtml(percent(cycle.regressionRate))}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#10120d;color:#fbf4df;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1080px;padding:32px}.hero,table{background:#181711;border:1px solid #39301d;border-radius:24px}.hero{margin-bottom:16px;padding:24px}h1{font-size:clamp(2rem,6vw,4.5rem);line-height:.95}.summary{display:flex;flex-wrap:wrap;gap:10px}.summary span{border:1px solid #4a3f23;border-radius:999px;padding:8px 12px}table{border-collapse:collapse;overflow:hidden;width:100%}td,th{border-bottom:1px solid #39301d;padding:12px;text-align:left}.pass{color:#86efac}.warn,.empty{color:#fcd34d}.fail{color:#fca5a5}p{color:#cfc5a8}</style></head><body><main><section class="hero"><span>Recovery trend</span><h1>${escapeHtml(title)}</h1><p class="${escapeHtml(report.status)}">Status: ${escapeHtml(report.status)}</p><div class="summary"><span>${String(report.summary.cycles)} cycles</span><span>${String(report.summary.total)} actions</span><span>${escapeHtml(percent(report.summary.improvementRate))} improved</span><span>${escapeHtml(percent(report.summary.regressionRate))} regressed</span><span>${escapeHtml(percent(report.trend.improvementRateDelta))} improvement delta</span></div></section><table><thead><tr><th>Checked at</th><th>Total</th><th>Improved</th><th>Unchanged</th><th>Regressed</th><th>Failed</th><th>Improve %</th><th>Regress %</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No recovery outcome history has been recorded.</td></tr>'}</tbody></table></main></body></html>`;
};

const pushOperationalStatusEvents = (
  events: VoiceIncidentTimelineEvent[],
  report: VoiceOperationalStatusReport | undefined,
  links: VoiceIncidentTimelineLinks,
) => {
  if (!report) {
    return;
  }

  for (const check of report.checks) {
    if (check.status === "pass") {
      continue;
    }

    events.push({
      action: {
        href: check.href ?? links.operationalStatus,
        label: "Open source",
      },
      at: report.checkedAt,
      category: check.label.toLowerCase().includes("readiness")
        ? "readiness"
        : "operational-status",
      detail: check.detail,
      href: check.href ?? links.operationalStatus,
      id: `operational:${check.label}`,
      label: check.label,
      severity: statusToSeverity(check.status),
      source: "operational-status",
      value: check.value,
    });
  }
};

const pushOpsRecoveryEvents = (
  events: VoiceIncidentTimelineEvent[],
  report: VoiceOpsRecoveryReport | undefined,
  links: VoiceIncidentTimelineLinks,
) => {
  if (!report) {
    return;
  }

  for (const issue of report.issues) {
    events.push({
      action: {
        href: issue.href ?? links.operationalStatus,
        label: "Inspect recovery issue",
      },
      at: report.checkedAt,
      category: "recovery",
      detail: issue.detail,
      href: issue.href,
      id: `ops-recovery:${issue.code}`,
      label: issue.label,
      severity: issue.severity === "fail" ? "critical" : "warn",
      source: "ops-recovery",
      value: issue.value,
    });
  }

  for (const session of report.failedSessions) {
    events.push({
      action: {
        href:
          session.operationsRecordHref ??
          linkForSession(links.operationsRecords, session.sessionId) ??
          linkForSession(links.callDebugger, session.sessionId),
        label: "Open affected call",
      },
      at: session.at,
      category: "call",
      detail: session.error,
      href:
        session.operationsRecordHref ??
        linkForSession(links.operationsRecords, session.sessionId),
      id: `failed-session:${session.sessionId}:${session.at}`,
      label: "Failed session",
      sessionId: session.sessionId,
      severity: "critical",
      source: "ops-recovery",
      value: session.provider,
    });
  }
};

const pushMonitorEvents = (
  events: VoiceIncidentTimelineEvent[],
  issues: readonly VoiceMonitorIssue[] | undefined,
  links: VoiceIncidentTimelineLinks,
) => {
  if (!issues) {
    return;
  }

  for (const issue of issues) {
    if (issue.status === "resolved") {
      continue;
    }
    const sessionId = issue.impactedSessions[0];

    events.push({
      action: {
        href:
          issue.operationsRecordHrefs[0] ??
          linkForSession(links.operationsRecords, sessionId) ??
          links.monitorIssues,
        label: "Open monitor evidence",
      },
      at: issue.lastSeenAt,
      category: "monitor",
      detail: issue.detail,
      href:
        issue.operationsRecordHrefs[0] ??
        linkForSession(links.operationsRecords, sessionId) ??
        links.monitorIssues,
      id: `monitor:${issue.id}`,
      label: issue.label,
      sessionId,
      severity:
        issue.severity === "critical"
          ? "critical"
          : issue.severity === "warn"
            ? "warn"
            : "info",
      source: `monitor:${issue.monitorId}`,
      value: issue.value,
    });
  }
};

const pushOperationsRecordEvents = (
  events: VoiceIncidentTimelineEvent[],
  records: readonly VoiceOperationsRecord[] | undefined,
  links: VoiceIncidentTimelineLinks,
) => {
  if (!records) {
    return;
  }

  for (const record of records) {
    if (record.status === "healthy") {
      continue;
    }

    const href = linkForSession(links.operationsRecords, record.sessionId);
    const debuggerHref = linkForSession(links.callDebugger, record.sessionId);
    events.push({
      action: {
        href: debuggerHref ?? href,
        label: debuggerHref ? "Open call debugger" : "Open operations record",
      },
      at: record.checkedAt,
      category: "call",
      detail:
        record.status === "failed"
          ? "Call operations record failed."
          : "Call operations record has warnings.",
      href,
      id: `operations-record:${record.sessionId}`,
      label: `Operations record ${record.status}`,
      sessionId: record.sessionId,
      severity: statusToSeverity(record.status),
      source: "operations-record",
      value: record.outcome.complete ? "complete" : "incomplete",
    });
  }
};

const pushFailureReplayEvents = (
  events: VoiceIncidentTimelineEvent[],
  replays: readonly VoiceFailureReplayReport[] | undefined,
  links: VoiceIncidentTimelineLinks,
) => {
  if (!replays) {
    return;
  }

  for (const replay of replays) {
    if (replay.status === "healthy") {
      continue;
    }

    const href =
      replay.operationsRecordHref ??
      linkForSession(links.failureReplay, replay.sessionId) ??
      linkForSession(links.callDebugger, replay.sessionId);
    events.push({
      action: {
        href:
          linkForSession(links.callDebugger, replay.sessionId) ??
          href ??
          linkForSession(links.supportBundle, replay.sessionId),
        label: "Open replay/debug artifact",
      },
      at:
        replay.providers.steps[0]?.at ??
        replay.media.steps[0]?.at ??
        Date.now(),
      category: "failure-replay",
      detail:
        replay.summary.issues.join("; ") ||
        replay.summary.userHeard.join(" ") ||
        `Failure replay is ${replay.status}.`,
      href,
      id: `failure-replay:${replay.sessionId}`,
      label: `Failure replay ${replay.status}`,
      sessionId: replay.sessionId,
      severity: failureReplayStatusToSeverity(replay.status),
      source: "failure-replay",
      value: `${replay.providers.errors} provider errors / ${replay.media.errors} media errors`,
    });
  }
};

export const buildVoiceIncidentTimelineReport = async (
  options: VoiceIncidentTimelineOptions,
): Promise<VoiceIncidentTimelineReport> => {
  const now = options.now ?? Date.now();
  const links = options.links ?? {};
  const [
    operationalStatus,
    opsRecovery,
    monitorIssues,
    operationsRecords,
    failureReplays,
  ] = await Promise.all([
    resolveValue(options.operationalStatus),
    resolveValue(options.opsRecovery),
    resolveValue(options.monitorIssues),
    resolveValue(options.operationsRecords),
    resolveValue(options.failureReplays),
  ]);
  const events: VoiceIncidentTimelineEvent[] = [];

  pushOperationalStatusEvents(events, operationalStatus, links);
  pushOpsRecoveryEvents(events, opsRecovery, links);
  pushMonitorEvents(events, monitorIssues, links);
  pushOperationsRecordEvents(events, operationsRecords, links);
  pushFailureReplayEvents(events, failureReplays, links);

  const filtered = events
    .filter((event) => withinWindow(event, now, options.windowMs))
    .sort((left, right) => right.at - left.at)
    .slice(0, options.limit ?? 50);
  const summary = {
    critical: filtered.filter((event) => event.severity === "critical").length,
    info: filtered.filter((event) => event.severity === "info").length,
    total: filtered.length,
    warn: filtered.filter((event) => event.severity === "warn").length,
  };

  const baseReport: Omit<VoiceIncidentTimelineReport, "actions"> = {
    events: filtered,
    generatedAt: now,
    links,
    status: worstStatus(filtered.map(eventStatus)),
    summary,
    windowMs: options.windowMs,
  };
  const configuredActions =
    typeof options.recoveryActions === "function"
      ? await options.recoveryActions({
          events: filtered,
          report: baseReport,
        })
      : options.recoveryActions;

  return {
    ...baseReport,
    actions:
      configuredActions === undefined
        ? defaultIncidentRecoveryActions(filtered, links)
        : [...configuredActions],
  };
};

export const renderVoiceIncidentTimelineMarkdown = (
  report: VoiceIncidentTimelineReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "AbsoluteJS Voice Incident Timeline";
  const rows = report.events
    .map((event) => {
      const when = new Date(event.at).toISOString();
      const target = event.href ? ` [open](${event.href})` : "";
      const session = event.sessionId ? ` session=${event.sessionId}` : "";
      const value = event.value === undefined ? "" : ` value=${event.value}`;

      return `- ${when} ${event.severity.toUpperCase()} ${event.label}${session}${value}${target}${event.detail ? ` - ${event.detail}` : ""}`;
    })
    .join("\n");

  return `# ${title}

Status: ${report.status}

Generated: ${new Date(report.generatedAt).toISOString()}

Summary: ${report.summary.critical} critical, ${report.summary.warn} warn, ${report.summary.info} info, ${report.summary.total} total.

## Events

${rows || "- No incident timeline events."}

## Recovery Actions

${report.actions.map((action) => `- ${action.method ?? "GET"} ${action.id}: ${action.label}${action.href ? ` (${action.href})` : ""}${action.detail ? ` - ${action.detail}` : ""}`).join("\n") || "- No recovery actions."}
`;
};

export const renderVoiceIncidentTimelineHTML = (
  report: VoiceIncidentTimelineReport,
  options: { actionPath?: string; title?: string } = {},
) => {
  const title = options.title ?? "AbsoluteJS Voice Incident Timeline";
  const actionPath =
    options.actionPath ?? "/api/voice/incident-timeline/actions";
  const events = report.events
    .map(
      (event) => `<article class="${escapeHtml(event.severity)}">
  <span>${escapeHtml(event.severity.toUpperCase())} / ${escapeHtml(event.category)}</span>
  <h2>${escapeHtml(event.label)}</h2>
  <p>${escapeHtml(new Date(event.at).toLocaleString())}${event.sessionId ? ` · session ${escapeHtml(event.sessionId)}` : ""}</p>
  ${event.value === undefined ? "" : `<strong>${escapeHtml(String(event.value))}</strong>`}
  ${event.detail ? `<p>${escapeHtml(event.detail)}</p>` : ""}
  <div>${event.href ? `<a href="${escapeHtml(event.href)}">Open source</a>` : ""}${event.action?.href ? `<a href="${escapeHtml(event.action.href)}">${escapeHtml(event.action.label)}</a>` : ""}</div>
</article>`,
    )
    .join("");
  const actions = report.actions
    .map((action) => {
      const label = escapeHtml(action.label);
      const detail = action.detail ? `<p>${escapeHtml(action.detail)}</p>` : "";
      const href = action.href
        ? `<a href="${escapeHtml(action.href)}">Open target</a>`
        : "";
      const control =
        action.method === "POST"
          ? `<button type="button" data-voice-incident-action="${escapeHtml(action.id)}" ${action.disabled ? "disabled" : ""}>${label}</button>`
          : href;

      return `<article class="action"><span>${escapeHtml(action.method ?? "GET")}</span><h2>${label}</h2>${detail}<div>${control}${href && action.method === "POST" ? href : ""}</div></article>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#11110d;color:#faf4df;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1100px;padding:32px}.hero{background:linear-gradient(135deg,rgba(248,113,113,.2),rgba(245,158,11,.13),rgba(34,197,94,.12));border:1px solid #39301d;border-radius:30px;margin-bottom:18px;padding:28px}.eyebrow{color:#fcd34d;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}.status{border:1px solid #575030;border-radius:999px;display:inline-flex;font-weight:900;padding:8px 12px}.status.pass{border-color:rgba(34,197,94,.65)}.status.warn{border-color:rgba(245,158,11,.75)}.status.fail{border-color:rgba(239,68,68,.85)}.grid{display:grid;gap:14px}.actions{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin:0 0 18px}.summary{display:flex;flex-wrap:wrap;gap:10px}.summary span{background:#181711;border:1px solid #39301d;border-radius:999px;padding:8px 12px}article{background:#181711;border:1px solid #39301d;border-radius:22px;padding:18px}article.critical{border-color:rgba(239,68,68,.85)}article.warn{border-color:rgba(245,158,11,.75)}article.info{border-color:rgba(34,197,94,.55)}article.action{border-color:#5b4a22}article span{color:#fcd34d;font-size:.78rem;font-weight:900;letter-spacing:.08em}article h2{margin:.35rem 0}.muted,article p{color:#cfc5a8}article strong{display:block;font-size:1.3rem;margin:.5rem 0}a{color:#fde68a;margin-right:12px}button{background:#fcd34d;border:0;border-radius:999px;color:#171307;cursor:pointer;font-weight:900;padding:10px 14px}button:disabled{cursor:not-allowed;opacity:.55}</style></head><body><main><section class="hero"><p class="eyebrow">Operational triage</p><h1>${escapeHtml(title)}</h1><p class="status ${escapeHtml(report.status)}">Overall: ${escapeHtml(report.status.toUpperCase())}</p><p class="muted">Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())}</p><div class="summary"><span>${String(report.summary.critical)} critical</span><span>${String(report.summary.warn)} warn</span><span>${String(report.summary.info)} info</span><span>${String(report.summary.total)} total</span></div></section><h2>Recovery actions</h2><section class="actions">${actions || '<article class="action"><span>NONE</span><h2>No recovery actions</h2><p>No executable actions are available for this report.</p></article>'}</section><h2>Timeline</h2><section class="grid">${events || '<article class="info"><span>INFO</span><h2>No incident events</h2><p>No non-pass operational events were found in this window.</p></article>'}</section></main><script>const voiceIncidentActionPath=${JSON.stringify(actionPath)};document.querySelectorAll("[data-voice-incident-action]").forEach((button)=>{button.addEventListener("click",async()=>{const id=button.getAttribute("data-voice-incident-action");if(!id)return;button.disabled=true;const original=button.textContent;button.textContent="Running...";try{const response=await fetch(voiceIncidentActionPath+"/"+encodeURIComponent(id),{method:"POST"});button.textContent=response.ok?"Done":"Failed";if(response.ok)setTimeout(()=>location.reload(),700)}catch{button.textContent="Failed"}finally{setTimeout(()=>{button.disabled=false;button.textContent=original},1600)}})});</script></body></html>`;
};

export const createVoiceIncidentTimelineRoutes = (
  options: VoiceIncidentTimelineRoutesOptions,
) => {
  const path = options.path ?? "/api/voice/incident-timeline";
  const htmlPath =
    options.htmlPath === undefined
      ? "/voice/incident-timeline"
      : options.htmlPath;
  const markdownPath =
    options.markdownPath === undefined
      ? "/voice/incident-timeline.md"
      : options.markdownPath;
  const actionPath =
    options.actionPath === undefined
      ? "/api/voice/incident-timeline/actions"
      : options.actionPath;
  const recoveryOutcomePath =
    options.recoveryOutcomePath === undefined
      ? "/api/voice/incident-timeline/recovery-outcomes"
      : options.recoveryOutcomePath;
  const recoveryOutcomeHtmlPath =
    options.recoveryOutcomeHtmlPath === undefined
      ? "/voice/incident-recovery-outcomes"
      : options.recoveryOutcomeHtmlPath;
  const recoveryTrendPath =
    options.recoveryTrendPath === undefined
      ? "/api/voice/incident-timeline/recovery-trends"
      : options.recoveryTrendPath;
  const recoveryTrendHtmlPath =
    options.recoveryTrendHtmlPath === undefined
      ? "/voice/incident-recovery-trends"
      : options.recoveryTrendHtmlPath;
  const recoveryTrendMarkdownPath =
    options.recoveryTrendMarkdownPath === undefined
      ? "/voice/incident-recovery-trends.md"
      : options.recoveryTrendMarkdownPath;
  const buildRecoveryTrendReport = async () => {
    const reports =
      typeof options.recoveryTrendReports === "function"
        ? await options.recoveryTrendReports()
        : options.recoveryTrendReports;
    return buildVoiceIncidentRecoveryTrendReport(
      reports ?? [
        await buildVoiceIncidentRecoveryOutcomeReport({
          audit: options.audit,
        }),
      ],
    );
  };
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-incident-timeline",
  }).get(path, async () => {
    const report = await buildVoiceIncidentTimelineReport(options);

    return new Response(JSON.stringify(report), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...options.headers,
      },
      status: report.status === "fail" ? 503 : 200,
    });
  });

  if (htmlPath !== false) {
    routes.get(htmlPath, async () => {
      const report = await buildVoiceIncidentTimelineReport(options);
      const body = await (
        options.render ??
        ((input) =>
          renderVoiceIncidentTimelineHTML(input, {
            actionPath: actionPath === false ? undefined : actionPath,
            title: options.title,
          }))
      )(report);

      return new Response(body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  if (markdownPath !== false) {
    routes.get(markdownPath, async () => {
      const report = await buildVoiceIncidentTimelineReport(options);

      return new Response(
        renderVoiceIncidentTimelineMarkdown(report, {
          title: options.title,
        }),
        {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            ...options.headers,
          },
        },
      );
    });
  }

  if (actionPath !== false) {
    routes
      .get(actionPath, async () => {
        const report = await buildVoiceIncidentTimelineReport(options);

        return new Response(
          JSON.stringify({
            actions: report.actions,
            generatedAt: report.generatedAt,
            status: report.status,
          }),
          {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              ...options.headers,
            },
          },
        );
      })
      .post(`${actionPath}/:actionId`, async ({ params, request }) => {
        const actionId = params.actionId;
        const report = await buildVoiceIncidentTimelineReport(options);
        const action = report.actions.find((item) => item.id === actionId);
        const handler = options.actionHandlers?.[actionId];

        if (!action) {
          return new Response(
            JSON.stringify({
              actionId,
              ok: false,
              status: "not_found",
            } satisfies VoiceIncidentRecoveryActionResult),
            {
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                ...options.headers,
              },
              status: 404,
            },
          );
        }
        if (action.disabled || action.method !== "POST" || !handler) {
          return new Response(
            JSON.stringify({
              actionId,
              ok: false,
              status: action.disabled ? "disabled" : "not_executable",
            } satisfies VoiceIncidentRecoveryActionResult),
            {
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                ...options.headers,
              },
              status: 409,
            },
          );
        }

        const result = await handler({
          action,
          actionId,
          report,
          request,
        });
        const status = result.ok ? 200 : 500;
        const afterReport = await buildVoiceIncidentTimelineReport(options);
        const resultWithStatus: VoiceIncidentRecoveryActionResult = {
          ...result,
          afterStatus: result.afterStatus ?? afterReport.status,
          beforeStatus: result.beforeStatus ?? report.status,
        };
        await recordVoiceOpsActionAudit(
          {
            actionId: `incident.${actionId}`,
            body: {
              action,
              afterStatus: resultWithStatus.afterStatus,
              beforeStatus: resultWithStatus.beforeStatus,
              eventIds: report.events.map((event) => event.id),
              result,
            },
            error: result.ok ? undefined : (result.detail ?? result.status),
            ok: result.ok,
            ranAt: Date.now(),
            status,
          },
          {
            audit: options.audit,
            trace: options.trace,
          },
        );

        return new Response(JSON.stringify(resultWithStatus), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...options.headers,
          },
          status,
        });
      });
  }

  if (recoveryOutcomePath !== false) {
    routes.get(recoveryOutcomePath, async () => {
      const report = await buildVoiceIncidentRecoveryOutcomeReport({
        audit: options.audit,
      });

      return new Response(JSON.stringify(report), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  if (recoveryOutcomeHtmlPath !== false) {
    routes.get(recoveryOutcomeHtmlPath, async () => {
      const report = await buildVoiceIncidentRecoveryOutcomeReport({
        audit: options.audit,
      });

      return new Response(
        renderVoiceIncidentRecoveryOutcomeHTML(report, {
          title: `${options.title ?? "AbsoluteJS Voice Incident Timeline"} Recovery Outcomes`,
        }),
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...options.headers,
          },
        },
      );
    });
  }

  if (recoveryTrendPath !== false) {
    routes.get(recoveryTrendPath, async () => {
      const report = await buildRecoveryTrendReport();

      return new Response(JSON.stringify(report), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  if (recoveryTrendHtmlPath !== false) {
    routes.get(recoveryTrendHtmlPath, async () => {
      const report = await buildRecoveryTrendReport();

      return new Response(
        renderVoiceIncidentRecoveryTrendHTML(report, {
          title: `${options.title ?? "AbsoluteJS Voice Incident Timeline"} Recovery Trend`,
        }),
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...options.headers,
          },
        },
      );
    });
  }

  if (recoveryTrendMarkdownPath !== false) {
    routes.get(recoveryTrendMarkdownPath, async () => {
      const report = await buildRecoveryTrendReport();

      return new Response(
        renderVoiceIncidentRecoveryTrendMarkdown(report, {
          title: `${options.title ?? "AbsoluteJS Voice Incident Timeline"} Recovery Trend`,
        }),
        {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            ...options.headers,
          },
        },
      );
    });
  }

  return routes;
};
