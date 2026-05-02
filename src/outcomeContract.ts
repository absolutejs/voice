import { Elysia } from "elysia";
import type {
  StoredVoiceHandoffDelivery,
  VoiceCallDisposition,
  VoiceHandoffAction,
  VoiceHandoffDeliveryStore,
  VoiceSessionRecord,
  VoiceSessionStore,
  VoiceSessionSummary,
} from "./types";
import type {
  StoredVoiceIntegrationEvent,
  StoredVoiceOpsTask,
  VoiceIntegrationEventType,
} from "./ops";
import type { StoredVoiceCallReviewArtifact } from "./testing/review";

export type VoiceOutcomeContractStatus = "pass" | "fail";

export type VoiceOutcomeContractDefinition = {
  description?: string;
  expectedDisposition?: VoiceCallDisposition;
  id: string;
  label?: string;
  minSessions?: number;
  minTasks?: number;
  requireHandoffActions?: VoiceHandoffAction[];
  requireIntegrationEvents?: VoiceIntegrationEventType[];
  requireReview?: boolean;
  requireTask?: boolean;
  scenarioId?: string;
};

export type VoiceOutcomeContractIssue = {
  code: string;
  message: string;
};

export type VoiceOutcomeContractReport = {
  contractId: string;
  description?: string;
  issues: VoiceOutcomeContractIssue[];
  label?: string;
  matched: {
    handoffs: number;
    integrationEvents: number;
    reviews: number;
    sessions: number;
    tasks: number;
  };
  operationsRecordHrefs: string[];
  pass: boolean;
  sessionIds: string[];
};

export type VoiceOutcomeContractSuiteReport = {
  checkedAt: number;
  contracts: VoiceOutcomeContractReport[];
  failed: number;
  passed: number;
  status: VoiceOutcomeContractStatus;
  total: number;
};

export type VoiceOutcomeContractAssertionInput = {
  maxFailed?: number;
  maxIssues?: number;
  minContracts?: number;
  minHandoffs?: number;
  minIntegrationEvents?: number;
  minOperationsRecordHrefs?: number;
  minReviews?: number;
  minSessions?: number;
  minTasks?: number;
  requiredContractIds?: string[];
  requireOperationRecordHrefs?: boolean;
};

export type VoiceOutcomeContractAssertionReport = {
  contractIds: string[];
  failed: number;
  handoffs: number;
  integrationEvents: number;
  issues: string[];
  issueCount: number;
  ok: boolean;
  operationsRecordHrefs: number;
  passed: number;
  reviews: number;
  sessions: number;
  status: VoiceOutcomeContractStatus;
  tasks: number;
  total: number;
};

type ListStore<T> = {
  list: () => Promise<T[]> | T[];
};

export type VoiceOutcomeContractOptions<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = {
  contracts: VoiceOutcomeContractDefinition[];
  events?:
    | StoredVoiceIntegrationEvent[]
    | ListStore<StoredVoiceIntegrationEvent>;
  handoffs?: StoredVoiceHandoffDelivery[] | VoiceHandoffDeliveryStore;
  operationsRecordHref?: false | string | ((sessionId: string) => string);
  reviews?:
    | StoredVoiceCallReviewArtifact[]
    | ListStore<StoredVoiceCallReviewArtifact>;
  sessions?: TSession[] | VoiceSessionStore<TSession>;
  tasks?: StoredVoiceOpsTask[] | ListStore<StoredVoiceOpsTask>;
};

export type VoiceOutcomeContractHTMLHandlerOptions<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = VoiceOutcomeContractOptions<TSession> & {
  headers?: HeadersInit;
  render?: (
    report: VoiceOutcomeContractSuiteReport,
  ) => string | Promise<string>;
  title?: string;
};

export type VoiceOutcomeContractRoutesOptions<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = VoiceOutcomeContractHTMLHandlerOptions<TSession> & {
  htmlPath?: false | string;
  name?: string;
  path?: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const resolveSessionHref = (
  value: false | string | ((sessionId: string) => string) | undefined,
  sessionId: string,
) => {
  if (value === false) {
    return undefined;
  }
  const href = value ?? "/voice-operations/:sessionId";
  if (typeof href === "function") {
    return href(sessionId);
  }
  const encoded = encodeURIComponent(sessionId);
  return href.includes(":sessionId")
    ? href.replace(":sessionId", encoded)
    : `${href.replace(/\/$/, "")}/${encoded}`;
};

const getPayloadString = (
  event: StoredVoiceIntegrationEvent,
  key: string,
): string | undefined =>
  typeof event.payload[key] === "string"
    ? (event.payload[key] as string)
    : undefined;

const toList = async <T>(input: T[] | ListStore<T> | undefined) =>
  Array.isArray(input) ? input : ((await input?.list()) ?? []);

const hydrateSessions = async <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  input: TSession[] | VoiceSessionStore<TSession> | undefined,
) => {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  const summaries = (await input.list()) as VoiceSessionSummary[];
  const sessions = await Promise.all(
    summaries.map((summary) => input.get(summary.id)),
  );
  const hydrated: TSession[] = [];
  for (const session of sessions) {
    if (session) {
      hydrated.push(session as TSession);
    }
  }
  return hydrated;
};

const dispositionForSession = (session: VoiceSessionRecord) =>
  session.call?.disposition ??
  (session.status === "completed" ? "completed" : undefined);

const matchesDisposition = (
  disposition: VoiceCallDisposition | undefined,
  expected: VoiceCallDisposition | undefined,
) => expected === undefined || disposition === expected;

const reportContract = (input: {
  contract: VoiceOutcomeContractDefinition;
  events: StoredVoiceIntegrationEvent[];
  handoffs: StoredVoiceHandoffDelivery[];
  operationsRecordHref?: false | string | ((sessionId: string) => string);
  reviews: StoredVoiceCallReviewArtifact[];
  sessions: VoiceSessionRecord[];
  tasks: StoredVoiceOpsTask[];
}): VoiceOutcomeContractReport => {
  const { contract } = input;
  const sessions = input.sessions.filter(
    (session) =>
      (!contract.scenarioId || session.scenarioId === contract.scenarioId) &&
      matchesDisposition(
        dispositionForSession(session),
        contract.expectedDisposition,
      ),
  );
  const sessionIds = new Set(sessions.map((session) => session.id));
  const operationsRecordHrefs = [...sessionIds]
    .map((sessionId) =>
      resolveSessionHref(input.operationsRecordHref, sessionId),
    )
    .filter((href): href is string => Boolean(href));
  const reviews = input.reviews.filter((review) =>
    matchesDisposition(review.summary.outcome, contract.expectedDisposition),
  );
  const tasks = input.tasks.filter((task) =>
    matchesDisposition(task.outcome, contract.expectedDisposition),
  );
  const handoffs = input.handoffs.filter(
    (handoff) =>
      (!contract.expectedDisposition ||
        handoff.action === contract.expectedDisposition ||
        (contract.expectedDisposition === "transferred" &&
          handoff.action === "transfer") ||
        (contract.expectedDisposition === "escalated" &&
          handoff.action === "escalate")) &&
      (sessionIds.size === 0 || sessionIds.has(handoff.sessionId)),
  );
  const events = input.events.filter((event) => {
    const eventSessionId = getPayloadString(event, "sessionId");
    const eventOutcome =
      getPayloadString(event, "outcome") ??
      getPayloadString(event, "disposition");
    return (
      (sessionIds.size === 0 ||
        !eventSessionId ||
        sessionIds.has(eventSessionId)) &&
      (!contract.expectedDisposition ||
        eventOutcome === contract.expectedDisposition)
    );
  });
  const issues: VoiceOutcomeContractIssue[] = [];
  const minSessions = contract.minSessions ?? 1;

  if (sessions.length < minSessions) {
    issues.push({
      code: "outcome.sessions_missing",
      message: `Expected at least ${minSessions} matching session(s), saw ${sessions.length}.`,
    });
  }
  if (contract.requireReview !== false && reviews.length === 0) {
    issues.push({
      code: "outcome.review_missing",
      message: "Expected at least one matching review artifact.",
    });
  }
  if (contract.requireTask && tasks.length < (contract.minTasks ?? 1)) {
    issues.push({
      code: "outcome.task_missing",
      message: `Expected at least ${contract.minTasks ?? 1} matching task(s), saw ${tasks.length}.`,
    });
  }
  for (const action of contract.requireHandoffActions ?? []) {
    if (!handoffs.some((handoff) => handoff.action === action)) {
      issues.push({
        code: "outcome.handoff_missing",
        message: `Expected handoff action ${action}.`,
      });
    }
  }
  for (const type of contract.requireIntegrationEvents ?? []) {
    if (!events.some((event) => event.type === type)) {
      issues.push({
        code: "outcome.integration_event_missing",
        message: `Expected integration event ${type}.`,
      });
    }
  }

  return {
    contractId: contract.id,
    description: contract.description,
    issues,
    label: contract.label,
    matched: {
      handoffs: handoffs.length,
      integrationEvents: events.length,
      reviews: reviews.length,
      sessions: sessions.length,
      tasks: tasks.length,
    },
    operationsRecordHrefs,
    pass: issues.length === 0,
    sessionIds: [...sessionIds],
  };
};

export const runVoiceOutcomeContractSuite = async <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  options: VoiceOutcomeContractOptions<TSession>,
): Promise<VoiceOutcomeContractSuiteReport> => {
  const [sessions, reviews, tasks, events, handoffs] = await Promise.all([
    hydrateSessions(options.sessions),
    toList(options.reviews),
    toList(options.tasks),
    toList(options.events),
    toList(options.handoffs),
  ]);
  const contracts = options.contracts.map((contract) =>
    reportContract({
      contract,
      events,
      handoffs,
      operationsRecordHref: options.operationsRecordHref,
      reviews,
      sessions,
      tasks,
    }),
  );
  const passed = contracts.filter((contract) => contract.pass).length;
  const failed = contracts.length - passed;
  return {
    checkedAt: Date.now(),
    contracts,
    failed,
    passed,
    status: failed > 0 ? "fail" : "pass",
    total: contracts.length,
  };
};

export const evaluateVoiceOutcomeContractEvidence = (
  report: VoiceOutcomeContractSuiteReport,
  input: VoiceOutcomeContractAssertionInput = {},
): VoiceOutcomeContractAssertionReport => {
  const issues: string[] = [];
  const maxFailed = input.maxFailed ?? 0;
  const maxIssues = input.maxIssues ?? 0;
  const contractIds = [
    ...new Set(report.contracts.map((contract) => contract.contractId)),
  ].sort();
  const issueCount = report.contracts.reduce(
    (total, contract) => total + contract.issues.length,
    0,
  );
  const totals = report.contracts.reduce(
    (result, contract) => ({
      handoffs: result.handoffs + contract.matched.handoffs,
      integrationEvents:
        result.integrationEvents + contract.matched.integrationEvents,
      operationsRecordHrefs:
        result.operationsRecordHrefs + contract.operationsRecordHrefs.length,
      reviews: result.reviews + contract.matched.reviews,
      sessions: result.sessions + contract.matched.sessions,
      tasks: result.tasks + contract.matched.tasks,
    }),
    {
      handoffs: 0,
      integrationEvents: 0,
      operationsRecordHrefs: 0,
      reviews: 0,
      sessions: 0,
      tasks: 0,
    },
  );
  const contractsMissingOperationRecordHrefs = report.contracts.filter(
    (contract) => contract.operationsRecordHrefs.length === 0,
  ).length;

  if (input.minContracts !== undefined && report.total < input.minContracts) {
    issues.push(
      `Expected at least ${String(input.minContracts)} outcome contract(s), found ${String(report.total)}.`,
    );
  }
  if (report.failed > maxFailed) {
    issues.push(
      `Expected at most ${String(maxFailed)} failing outcome contract(s), found ${String(report.failed)}.`,
    );
  }
  if (issueCount > maxIssues) {
    issues.push(
      `Expected at most ${String(maxIssues)} outcome contract issue(s), found ${String(issueCount)}.`,
    );
  }
  if (input.minSessions !== undefined && totals.sessions < input.minSessions) {
    issues.push(
      `Expected at least ${String(input.minSessions)} matched outcome session(s), found ${String(totals.sessions)}.`,
    );
  }
  if (input.minReviews !== undefined && totals.reviews < input.minReviews) {
    issues.push(
      `Expected at least ${String(input.minReviews)} matched outcome review(s), found ${String(totals.reviews)}.`,
    );
  }
  if (input.minTasks !== undefined && totals.tasks < input.minTasks) {
    issues.push(
      `Expected at least ${String(input.minTasks)} matched outcome task(s), found ${String(totals.tasks)}.`,
    );
  }
  if (input.minHandoffs !== undefined && totals.handoffs < input.minHandoffs) {
    issues.push(
      `Expected at least ${String(input.minHandoffs)} matched outcome handoff(s), found ${String(totals.handoffs)}.`,
    );
  }
  if (
    input.minIntegrationEvents !== undefined &&
    totals.integrationEvents < input.minIntegrationEvents
  ) {
    issues.push(
      `Expected at least ${String(input.minIntegrationEvents)} matched outcome integration event(s), found ${String(totals.integrationEvents)}.`,
    );
  }
  if (
    input.minOperationsRecordHrefs !== undefined &&
    totals.operationsRecordHrefs < input.minOperationsRecordHrefs
  ) {
    issues.push(
      `Expected at least ${String(input.minOperationsRecordHrefs)} outcome operations record href(s), found ${String(totals.operationsRecordHrefs)}.`,
    );
  }
  if (
    (input.requireOperationRecordHrefs ?? false) &&
    contractsMissingOperationRecordHrefs > 0
  ) {
    issues.push(
      `Expected every outcome contract to include operations record hrefs; ${String(contractsMissingOperationRecordHrefs)} contract(s) missing.`,
    );
  }
  for (const contractId of input.requiredContractIds ?? []) {
    if (!contractIds.includes(contractId)) {
      issues.push(`Missing outcome contract: ${contractId}.`);
    }
  }

  return {
    contractIds,
    failed: report.failed,
    handoffs: totals.handoffs,
    integrationEvents: totals.integrationEvents,
    issues,
    issueCount,
    ok: issues.length === 0,
    operationsRecordHrefs: totals.operationsRecordHrefs,
    passed: report.passed,
    reviews: totals.reviews,
    sessions: totals.sessions,
    status: report.status,
    tasks: totals.tasks,
    total: report.total,
  };
};

export const assertVoiceOutcomeContractEvidence = (
  report: VoiceOutcomeContractSuiteReport,
  input: VoiceOutcomeContractAssertionInput = {},
): VoiceOutcomeContractAssertionReport => {
  const assertion = evaluateVoiceOutcomeContractEvidence(report, input);
  if (!assertion.ok) {
    throw new Error(
      `Voice outcome contract evidence assertion failed: ${assertion.issues.join(" ")}`,
    );
  }
  return assertion;
};

export const renderVoiceOutcomeContractHTML = (
  report: VoiceOutcomeContractSuiteReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Outcome Contracts";
  const contracts = report.contracts
    .map((contract) => {
      const sessionLinks = contract.operationsRecordHrefs.length
        ? `<p>${contract.operationsRecordHrefs.map((href, index) => `<a href="${escapeHtml(href)}">${escapeHtml(contract.sessionIds[index] ?? href)}</a>`).join(" · ")}</p>`
        : "";
      return `<section class="contract ${contract.pass ? "pass" : "fail"}">
  <div class="contract-header">
    <div>
      <p class="eyebrow">${escapeHtml(contract.contractId)}</p>
      <h2>${escapeHtml(contract.label ?? contract.contractId)}</h2>
      ${contract.description ? `<p>${escapeHtml(contract.description)}</p>` : ""}
      ${sessionLinks}
    </div>
    <strong>${contract.pass ? "pass" : "fail"}</strong>
  </div>
  <div class="grid">
    <span>sessions ${String(contract.matched.sessions)}</span>
    <span>reviews ${String(contract.matched.reviews)}</span>
    <span>tasks ${String(contract.matched.tasks)}</span>
    <span>handoffs ${String(contract.matched.handoffs)}</span>
    <span>events ${String(contract.matched.integrationEvents)}</span>
  </div>
  ${contract.issues.length ? `<ul>${contract.issues.map((issue) => `<li>${escapeHtml(issue.message)}</li>`).join("")}</ul>` : ""}
</section>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101316;color:#f6f2e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}.hero,.contract{background:#181d22;border:1px solid #2a323a;border-radius:20px;margin-bottom:16px;padding:20px}.hero{background:linear-gradient(135deg,rgba(34,197,94,.14),rgba(14,165,233,.12))}.eyebrow{color:#7dd3fc;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,5rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}h2{margin:.2rem 0}.summary,.grid{display:flex;flex-wrap:wrap;gap:10px}.pill,.grid span{background:#0f1217;border:1px solid #3f3f46;border-radius:999px;padding:7px 10px}.contract-header{display:flex;gap:16px;justify-content:space-between}.pass{color:#86efac}.fail{color:#fca5a5}.contract.fail{border-color:rgba(248,113,113,.45)}li{margin:8px 0}@media(max-width:800px){main{padding:18px}.contract-header{display:block}}</style></head><body><main><section class="hero"><p class="eyebrow">Business Outcome Verification</p><h1>${escapeHtml(title)}</h1><div class="summary"><span class="pill ${report.status}">${report.status}</span><span class="pill">${String(report.passed)} passing</span><span class="pill">${String(report.failed)} failing</span><span class="pill">${String(report.total)} contracts</span></div></section>${contracts || '<section class="contract"><p>No outcome contracts configured.</p></section>'}</main></body></html>`;
};

export const createVoiceOutcomeContractJSONHandler =
  <TSession extends VoiceSessionRecord = VoiceSessionRecord>(
    options: VoiceOutcomeContractOptions<TSession>,
  ) =>
  async () =>
    runVoiceOutcomeContractSuite(options);

export const createVoiceOutcomeContractHTMLHandler =
  <TSession extends VoiceSessionRecord = VoiceSessionRecord>(
    options: VoiceOutcomeContractHTMLHandlerOptions<TSession>,
  ) =>
  async () => {
    const report = await runVoiceOutcomeContractSuite(options);
    const render =
      options.render ??
      ((input) => renderVoiceOutcomeContractHTML(input, options));
    return new Response(await render(report), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...options.headers,
      },
    });
  };

export const createVoiceOutcomeContractRoutes = <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  options: VoiceOutcomeContractRoutesOptions<TSession>,
) => {
  const path = options.path ?? "/api/outcome-contracts";
  const htmlPath =
    options.htmlPath === undefined ? `${path}/htmx` : options.htmlPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-outcome-contracts",
  }).get(path, createVoiceOutcomeContractJSONHandler(options));
  if (htmlPath) {
    routes.get(htmlPath, createVoiceOutcomeContractHTMLHandler(options));
  }
  return routes;
};
