import { Elysia } from "elysia";
import {
  buildVoiceFailureReplay,
  buildVoiceOperationsRecord,
  renderVoiceOperationsRecordIncidentMarkdown,
  type VoiceFailureReplayReport,
  type VoiceOperationsRecord,
  type VoiceOperationsRecordOptions,
} from "./operationsRecord";
import type { StoredVoiceTraceEvent } from "./trace";

export type VoiceSessionObservabilityStatus = "failed" | "healthy" | "warning";

export type VoiceSessionObservabilityLink = {
  href: string;
  label: string;
  rel:
    | "call-debugger"
    | "incident-markdown"
    | "operations-record"
    | "trace-timeline"
    | "custom";
};

export type VoiceSessionObservabilityStage = {
  at: number;
  elapsedMs?: number;
  label: string;
  offsetMs: number;
  provider?: string;
  status?: string;
  type: StoredVoiceTraceEvent["type"];
};

export type VoiceSessionObservabilityTurn = {
  assistantReplies: number;
  durationMs?: number;
  endedAt?: number;
  errors: number;
  providerDecisions: number;
  stages: VoiceSessionObservabilityStage[];
  startedAt?: number;
  toolCalls: number;
  transcripts: number;
  turnId: string;
};

export type VoiceSessionObservabilityReport = {
  checkedAt: number;
  failureReplay: VoiceFailureReplayReport;
  incidentMarkdown: string;
  links: VoiceSessionObservabilityLink[];
  record: VoiceOperationsRecord;
  sessionId: string;
  status: VoiceSessionObservabilityStatus;
  summary: {
    durationMs?: number;
    errors: number;
    events: number;
    fallbacks: number;
    guardrailBlocks: number;
    handoffs: number;
    providerRecoveryStatus: VoiceOperationsRecord["providerDecisionSummary"]["recoveryStatus"];
    providers: string[];
    telephonyMediaEvents: number;
    toolCalls: number;
    turns: number;
  };
  turns: VoiceSessionObservabilityTurn[];
};

export type VoiceSessionObservabilityReportOptions = Omit<
  VoiceOperationsRecordOptions,
  "sessionId"
> & {
  callDebuggerHref?: false | string | ((sessionId: string) => string);
  customLinks?: readonly VoiceSessionObservabilityLink[];
  incidentMarkdownHref?: false | string | ((sessionId: string) => string);
  operationsRecordHref?: false | string | ((sessionId: string) => string);
  sessionId: string;
  traceTimelineHref?: false | string | ((sessionId: string) => string);
};

export type VoiceSessionObservabilityRoutesOptions = Omit<
  VoiceSessionObservabilityReportOptions,
  "sessionId"
> & {
  headers?: HeadersInit;
  htmlPath?: false | string;
  incidentPath?: false | string;
  name?: string;
  path?: string;
  render?: (
    report: VoiceSessionObservabilityReport,
  ) => Promise<string> | string;
  renderIncidentMarkdown?: (
    report: VoiceSessionObservabilityReport,
  ) => Promise<string> | string;
  title?: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatMs = (value: number | undefined) =>
  value === undefined ? "n/a" : `${String(value)}ms`;

const resolveHref = (
  href: false | string | ((sessionId: string) => string) | undefined,
  sessionId: string,
) => {
  if (href === false) {
    return undefined;
  }
  if (typeof href === "function") {
    return href(sessionId);
  }
  if (typeof href === "string") {
    return href.includes(":sessionId")
      ? href.replaceAll(":sessionId", encodeURIComponent(sessionId))
      : `${href.replace(/\/$/, "")}/${encodeURIComponent(sessionId)}`;
  }
  return undefined;
};

const buildLinks = (
  options: VoiceSessionObservabilityReportOptions,
): VoiceSessionObservabilityLink[] => {
  const links: VoiceSessionObservabilityLink[] = [];
  const add = (
    rel: VoiceSessionObservabilityLink["rel"],
    label: string,
    href: string | undefined,
  ) => {
    if (href) {
      links.push({ href, label, rel });
    }
  };

  add(
    "operations-record",
    "Open operations record",
    resolveHref(options.operationsRecordHref, options.sessionId),
  );
  add(
    "trace-timeline",
    "Open trace timeline",
    resolveHref(options.traceTimelineHref, options.sessionId),
  );
  add(
    "call-debugger",
    "Open call debugger",
    resolveHref(options.callDebuggerHref, options.sessionId),
  );
  add(
    "incident-markdown",
    "Download incident Markdown",
    resolveHref(options.incidentMarkdownHref, options.sessionId),
  );

  return [...links, ...(options.customLinks ?? [])];
};

const buildTurnWaterfalls = (
  record: VoiceOperationsRecord,
): VoiceSessionObservabilityTurn[] => {
  const byTurn = new Map<
    string,
    {
      assistantReplies: number;
      errors: number;
      providerDecisions: number;
      stages: VoiceSessionObservabilityStage[];
      toolCalls: number;
      transcripts: number;
    }
  >();
  const getTurn = (turnId: string) => {
    const existing = byTurn.get(turnId);
    if (existing) {
      return existing;
    }
    const turn = {
      assistantReplies: 0,
      errors: 0,
      providerDecisions: 0,
      stages: [],
      toolCalls: 0,
      transcripts: 0,
    };
    byTurn.set(turnId, turn);
    return turn;
  };

  for (const event of record.timeline) {
    if (!event.turnId) {
      continue;
    }
    const turn = getTurn(event.turnId);
    turn.stages.push({
      at: event.at,
      elapsedMs: event.elapsedMs,
      label: event.label,
      offsetMs: event.offsetMs,
      provider: event.provider,
      status: event.status,
      type: event.type,
    });
    if (event.type === "turn.transcript") {
      turn.transcripts += 1;
    }
    if (event.type === "turn.assistant") {
      turn.assistantReplies += 1;
    }
    if (event.type === "agent.tool") {
      turn.toolCalls += 1;
    }
    if (event.type === "provider.decision") {
      turn.providerDecisions += 1;
    }
    if (event.type === "session.error" || event.status === "error") {
      turn.errors += 1;
    }
  }

  for (const transcript of record.transcript) {
    const turn = getTurn(transcript.id);
    turn.assistantReplies = Math.max(
      turn.assistantReplies,
      transcript.assistantReplies.length,
    );
    turn.errors += transcript.errors.length;
    turn.transcripts = Math.max(
      turn.transcripts,
      transcript.transcripts.length,
    );
  }

  return [...byTurn.entries()]
    .map(([turnId, turn]) => {
      const startedAt = turn.stages[0]?.at;
      const endedAt = turn.stages.at(-1)?.at;
      return {
        assistantReplies: turn.assistantReplies,
        durationMs:
          startedAt !== undefined && endedAt !== undefined
            ? Math.max(0, endedAt - startedAt)
            : undefined,
        endedAt,
        errors: turn.errors,
        providerDecisions: turn.providerDecisions,
        stages: turn.stages,
        startedAt,
        toolCalls: turn.toolCalls,
        transcripts: turn.transcripts,
        turnId,
      };
    })
    .sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0));
};

export const buildVoiceSessionObservabilityReport = async (
  options: VoiceSessionObservabilityReportOptions,
): Promise<VoiceSessionObservabilityReport> => {
  const record = await buildVoiceOperationsRecord({
    audit: options.audit,
    evaluation: options.evaluation,
    events: options.events,
    integrationEvents: options.integrationEvents,
    redact: options.redact,
    reviews: options.reviews,
    sessionId: options.sessionId,
    store: options.store,
    tasks: options.tasks,
  });
  const failureReplay = buildVoiceFailureReplay(record, {
    operationsRecordHref: resolveHref(
      options.operationsRecordHref,
      options.sessionId,
    ),
  });
  const incidentMarkdown = renderVoiceOperationsRecordIncidentMarkdown(record);
  const statuses = [
    record.status,
    failureReplay.status === "failed"
      ? "failed"
      : failureReplay.status === "degraded"
        ? "warning"
        : "healthy",
  ];
  const status = statuses.includes("failed")
    ? "failed"
    : statuses.includes("warning")
      ? "warning"
      : "healthy";

  return {
    checkedAt: Date.now(),
    failureReplay,
    incidentMarkdown,
    links: buildLinks(options),
    record,
    sessionId: options.sessionId,
    status,
    summary: {
      durationMs: record.summary.callDurationMs,
      errors: record.summary.errorCount,
      events: record.summary.eventCount,
      fallbacks: record.providerDecisionSummary.fallbacks,
      guardrailBlocks: record.guardrails.blocked,
      handoffs: record.handoffs.length,
      providerRecoveryStatus: record.providerDecisionSummary.recoveryStatus,
      providers: record.providerDecisionSummary.providers,
      telephonyMediaEvents: record.telephonyMedia.total,
      toolCalls: record.tools.length,
      turns: record.summary.turnCount,
    },
    turns: buildTurnWaterfalls(record),
  };
};

const renderLinks = (links: readonly VoiceSessionObservabilityLink[]) =>
  links.length === 0
    ? ""
    : `<div class="actions">${links
        .map(
          (link) =>
            `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`,
        )
        .join("")}</div>`;

const renderTurns = (turns: readonly VoiceSessionObservabilityTurn[]) =>
  turns.length === 0
    ? '<p class="muted">No turn-level events recorded yet.</p>'
    : turns
        .map(
          (turn) =>
            `<article class="turn"><header><strong>${escapeHtml(turn.turnId)}</strong><span>${formatMs(turn.durationMs)}</span></header><dl><div><dt>Transcripts</dt><dd>${String(turn.transcripts)}</dd></div><div><dt>Assistant</dt><dd>${String(turn.assistantReplies)}</dd></div><div><dt>Tools</dt><dd>${String(turn.toolCalls)}</dd></div><div><dt>Providers</dt><dd>${String(turn.providerDecisions)}</dd></div><div><dt>Errors</dt><dd>${String(turn.errors)}</dd></div></dl><table><thead><tr><th>Offset</th><th>Type</th><th>Stage</th><th>Provider</th><th>Status</th><th>Latency</th></tr></thead><tbody>${turn.stages
              .map(
                (stage) =>
                  `<tr><td>+${String(stage.offsetMs)}ms</td><td>${escapeHtml(stage.type)}</td><td>${escapeHtml(stage.label)}</td><td>${escapeHtml(stage.provider ?? "")}</td><td>${escapeHtml(stage.status ?? "")}</td><td>${formatMs(stage.elapsedMs)}</td></tr>`,
              )
              .join("")}</tbody></table></article>`,
        )
        .join("");

export const renderVoiceSessionObservabilityMarkdown = (
  report: VoiceSessionObservabilityReport,
) => `# Voice session observability: ${report.sessionId}

Status: ${report.status}

- Events: ${report.summary.events}
- Turns: ${report.summary.turns}
- Errors: ${report.summary.errors}
- Duration: ${formatMs(report.summary.durationMs)}
- Providers: ${report.summary.providers.join(", ") || "none"}
- Provider recovery: ${report.summary.providerRecoveryStatus}
- Fallbacks: ${report.summary.fallbacks}
- Tool calls: ${report.summary.toolCalls}
- Handoffs: ${report.summary.handoffs}
- Guardrail blocks: ${report.summary.guardrailBlocks}
- Telephony media events: ${report.summary.telephonyMediaEvents}

## Links

${
  report.links.length
    ? report.links.map((link) => `- [${link.label}](${link.href})`).join("\n")
    : "- none"
}

## Turn Waterfalls

${
  report.turns.length
    ? report.turns
        .map(
          (turn) =>
            `### ${turn.turnId}

- Duration: ${formatMs(turn.durationMs)}
- Transcripts: ${turn.transcripts}
- Assistant replies: ${turn.assistantReplies}
- Tool calls: ${turn.toolCalls}
- Provider decisions: ${turn.providerDecisions}
- Errors: ${turn.errors}

${turn.stages
  .map(
    (stage) =>
      `- +${stage.offsetMs}ms ${stage.type}: ${stage.label}${stage.provider ? ` (${stage.provider})` : ""}${stage.status ? ` [${stage.status}]` : ""}`,
  )
  .join("\n")}`,
        )
        .join("\n\n")
    : "No turn-level events recorded."
}

## Incident Handoff

${report.incidentMarkdown}`;

export const renderVoiceSessionObservabilityHTML = (
  report: VoiceSessionObservabilityReport,
  options: { title?: string } = {},
) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(options.title ?? "Voice Session Observability")}</title><style>body{background:#0d1412;color:#f7f2e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}.eyebrow{color:#fbbf24;font-size:.78rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,4.8rem);line-height:.9;margin:.2rem 0 1rem}.status{border:1px solid #425046;border-radius:999px;display:inline-flex;padding:8px 12px}.healthy{color:#86efac}.warning{color:#fbbf24}.failed,.error{color:#fca5a5}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}.actions a{background:#fbbf24;border-radius:999px;color:#111827;font-weight:900;padding:10px 14px;text-decoration:none}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin:22px 0}.card,.turn,.incident{background:#17201c;border:1px solid #2e3c35;border-radius:20px;padding:16px}.card span,.muted,dt{color:#a8b4ad}.card strong{display:block;font-size:2rem}section{margin-top:30px}.turn{margin:16px 0}.turn header{align-items:center;display:flex;justify-content:space-between;gap:14px}dl{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));margin:14px 0}dd{font-weight:900;margin:3px 0 0}table{border-collapse:collapse;margin-top:14px;width:100%}td,th{border-top:1px solid #2e3c35;padding:10px;text-align:left}pre{background:#08100d;border:1px solid #2e3c35;border-radius:16px;color:#d9f99d;overflow:auto;padding:14px}@media(max-width:760px){main{padding:20px}table{font-size:.9rem}}</style></head><body><main><header><p class="eyebrow">Session observability</p><h1>${escapeHtml(report.sessionId)}</h1><p class="status ${escapeHtml(report.status)}">${escapeHtml(report.status)}</p>${renderLinks(report.links)}<p class="muted">One support/debug report across trace timeline, operations record, provider recovery, turn waterfalls, guardrails, tools, handoffs, failure replay, and incident handoff.</p></header><section class="grid"><article class="card"><span>Events</span><strong>${String(report.summary.events)}</strong></article><article class="card"><span>Turns</span><strong>${String(report.summary.turns)}</strong></article><article class="card"><span>Errors</span><strong>${String(report.summary.errors)}</strong></article><article class="card"><span>Duration</span><strong>${formatMs(report.summary.durationMs)}</strong></article><article class="card"><span>Fallbacks</span><strong>${String(report.summary.fallbacks)}</strong></article><article class="card"><span>Tools</span><strong>${String(report.summary.toolCalls)}</strong></article><article class="card"><span>Handoffs</span><strong>${String(report.summary.handoffs)}</strong></article><article class="card"><span>Guardrails blocked</span><strong>${String(report.summary.guardrailBlocks)}</strong></article><article class="card"><span>Telephony media</span><strong>${String(report.summary.telephonyMediaEvents)}</strong></article></section><section><h2>Turn Waterfalls</h2>${renderTurns(report.turns)}</section><section class="incident"><h2>Incident Handoff</h2><pre><code>${escapeHtml(report.incidentMarkdown)}</code></pre></section></main></body></html>`;

const routeSessionId = (params: Record<string, unknown>) =>
  typeof params.sessionId === "string" ? params.sessionId : "";

export const createVoiceSessionObservabilityRoutes = (
  options: VoiceSessionObservabilityRoutesOptions,
) => {
  const path = options.path ?? "/api/voice/session-observability/:sessionId";
  const htmlPath =
    options.htmlPath ?? "/voice/session-observability/:sessionId";
  const incidentPath =
    options.incidentPath ??
    "/api/voice/session-observability/:sessionId/incident.md";
  const title = options.title ?? "AbsoluteJS Voice Session Observability";
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-session-observability",
  });
  const build = (sessionId: string) =>
    buildVoiceSessionObservabilityReport({
      audit: options.audit,
      callDebuggerHref: options.callDebuggerHref,
      customLinks: options.customLinks,
      evaluation: options.evaluation,
      events: options.events,
      incidentMarkdownHref:
        options.incidentMarkdownHref ??
        (incidentPath === false ? false : incidentPath),
      integrationEvents: options.integrationEvents,
      operationsRecordHref: options.operationsRecordHref,
      redact: options.redact,
      reviews: options.reviews,
      sessionId,
      store: options.store,
      tasks: options.tasks,
      traceTimelineHref: options.traceTimelineHref,
    });

  routes.get(path, async ({ params }) =>
    Response.json(await build(routeSessionId(params))),
  );

  if (htmlPath !== false) {
    routes.get(htmlPath, async ({ params }) => {
      const report = await build(routeSessionId(params));
      const body = await (
        options.render ??
        ((input) => renderVoiceSessionObservabilityHTML(input, { title }))
      )(report);
      return new Response(body, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  if (incidentPath !== false) {
    routes.get(incidentPath, async ({ params }) => {
      const report = await build(routeSessionId(params));
      const body = await (
        options.renderIncidentMarkdown ??
        renderVoiceSessionObservabilityMarkdown
      )(report);
      return new Response(body, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  return routes;
};
