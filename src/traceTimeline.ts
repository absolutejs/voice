import { Elysia } from "elysia";
import {
  evaluateVoiceTrace,
  filterVoiceTraceEvents,
  redactVoiceTraceEvents,
  summarizeVoiceTrace,
  type StoredVoiceTraceEvent,
  type VoiceTraceEvaluationOptions,
  type VoiceTraceEventStore,
  type VoiceTraceRedactionConfig,
  type VoiceTraceSummary,
} from "./trace";

export type VoiceTraceTimelineEvent = {
  at: number;
  elapsedMs?: number;
  id: string;
  label: string;
  offsetMs: number;
  payload: Record<string, unknown>;
  provider?: string;
  status?: string;
  turnId?: string;
  type: StoredVoiceTraceEvent["type"];
};

export type VoiceTraceTimelineProviderSummary = {
  averageElapsedMs?: number;
  errorCount: number;
  eventCount: number;
  fallbackCount: number;
  maxElapsedMs?: number;
  provider: string;
  successCount: number;
  timeoutCount: number;
};

export type VoiceTraceTimelineSession = {
  endedAt?: number;
  evaluation: ReturnType<typeof evaluateVoiceTrace>;
  events: VoiceTraceTimelineEvent[];
  lastEventAt?: number;
  operationsRecordHref?: string;
  providers: VoiceTraceTimelineProviderSummary[];
  sessionId: string;
  startedAt?: number;
  status: "failed" | "healthy" | "warning";
  summary: VoiceTraceSummary;
};

export type VoiceTraceTimelineReport = {
  checkedAt: number;
  failed: number;
  sessions: VoiceTraceTimelineSession[];
  total: number;
  warnings: number;
};

export type VoiceTraceTimelineRoutesOptions = {
  evaluation?: VoiceTraceEvaluationOptions;
  headers?: HeadersInit;
  htmlPath?: string;
  limit?: number;
  name?: string;
  operationsRecordHref?: false | string | ((sessionId: string) => string);
  path?: string;
  redact?: VoiceTraceRedactionConfig;
  render?: (report: VoiceTraceTimelineReport) => string | Promise<string>;
  renderSession?: (
    session: VoiceTraceTimelineSession,
  ) => string | Promise<string>;
  store: VoiceTraceEventStore;
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
  typeof value === "string" && value.trim() ? value : undefined;

const getNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const firstString = (payload: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = getString(payload[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
};

const firstNumber = (payload: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = getNumber(payload[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
};

const eventProvider = (event: StoredVoiceTraceEvent) =>
  firstString(event.payload, [
    "provider",
    "selectedProvider",
    "fallbackProvider",
    "variantId",
  ]);

const eventStatus = (event: StoredVoiceTraceEvent) =>
  firstString(event.payload, [
    "providerStatus",
    "status",
    "disposition",
    "type",
    "reason",
  ]);

const eventElapsedMs = (event: StoredVoiceTraceEvent) =>
  firstNumber(event.payload, ["elapsedMs", "latencyMs", "durationMs"]);

const resolveSessionHref = (
  value: false | string | ((sessionId: string) => string) | undefined,
  sessionId: string,
) => {
  if (value === false) {
    return undefined;
  }
  if (typeof value === "function") {
    return value(sessionId);
  }
  if (typeof value === "string") {
    const encoded = encodeURIComponent(sessionId);
    return value.includes(":sessionId")
      ? value.replace(":sessionId", encoded)
      : `${value.replace(/\/$/, "")}/${encoded}`;
  }
  return undefined;
};

const timelineLabel = (event: StoredVoiceTraceEvent) => {
  switch (event.type) {
    case "call.lifecycle":
      return `Call ${eventStatus(event) ?? "lifecycle"}`;
    case "turn.transcript":
      return event.payload.isFinal === true
        ? "Final transcript"
        : "Partial transcript";
    case "turn.committed":
      return `Committed turn${getString(event.payload.reason) ? ` (${getString(event.payload.reason)})` : ""}`;
    case "turn.assistant":
      return "Assistant reply";
    case "agent.model":
      return `Model call${eventProvider(event) ? ` via ${eventProvider(event)}` : ""}`;
    case "agent.tool":
      return `Tool ${getString(event.payload.toolName) ?? "call"}`;
    case "agent.handoff":
      return `Agent handoff${getString(event.payload.targetAgentId) ? ` to ${getString(event.payload.targetAgentId)}` : ""}`;
    case "assistant.run":
      return `Assistant run${eventProvider(event) ? ` via ${eventProvider(event)}` : ""}`;
    case "assistant.guardrail":
      return `Guardrail ${eventStatus(event) ?? "check"}`;
    case "call.handoff":
      return `Call handoff ${eventStatus(event) ?? ""}`.trim();
    case "client.live_latency":
      return `Live latency${eventElapsedMs(event) !== undefined ? ` ${eventElapsedMs(event)}ms` : ""}`;
    case "session.error":
      return `Error${getString(event.payload.error) ? `: ${getString(event.payload.error)}` : ""}`;
    case "turn.cost":
      return "Cost telemetry";
    case "turn_latency.stage":
      return `Latency ${getString(event.payload.stage) ?? "stage"}`;
    case "workflow.contract":
      return `Workflow contract ${eventStatus(event) ?? ""}`.trim();
    default:
      return event.type;
  }
};

const summarizeProviders = (
  events: StoredVoiceTraceEvent[],
): VoiceTraceTimelineProviderSummary[] => {
  const entries = new Map<
    string,
    {
      elapsed: number[];
      errorCount: number;
      eventCount: number;
      fallbackCount: number;
      successCount: number;
      timeoutCount: number;
    }
  >();
  const getEntry = (provider: string) => {
    const existing = entries.get(provider);
    if (existing) {
      return existing;
    }
    const entry = {
      elapsed: [],
      errorCount: 0,
      eventCount: 0,
      fallbackCount: 0,
      successCount: 0,
      timeoutCount: 0,
    };
    entries.set(provider, entry);
    return entry;
  };

  for (const event of events) {
    const provider = eventProvider(event);
    if (!provider) {
      continue;
    }
    const entry = getEntry(provider);
    const status = eventStatus(event);
    const elapsedMs = eventElapsedMs(event);
    entry.eventCount += 1;
    if (elapsedMs !== undefined) {
      entry.elapsed.push(elapsedMs);
    }
    if (status === "success") {
      entry.successCount += 1;
    }
    if (status === "fallback") {
      entry.fallbackCount += 1;
    }
    if (status === "error") {
      entry.errorCount += 1;
    }
    if (status === "timeout") {
      entry.timeoutCount += 1;
    }
  }

  return [...entries.entries()]
    .map(([provider, entry]) => ({
      averageElapsedMs:
        entry.elapsed.length > 0
          ? Math.round(
              entry.elapsed.reduce((total, value) => total + value, 0) /
                entry.elapsed.length,
            )
          : undefined,
      errorCount: entry.errorCount,
      eventCount: entry.eventCount,
      fallbackCount: entry.fallbackCount,
      maxElapsedMs:
        entry.elapsed.length > 0 ? Math.max(...entry.elapsed) : undefined,
      provider,
      successCount: entry.successCount,
      timeoutCount: entry.timeoutCount,
    }))
    .sort((left, right) => right.eventCount - left.eventCount);
};

export const summarizeVoiceTraceTimeline = (
  events: StoredVoiceTraceEvent[],
  options: {
    evaluation?: VoiceTraceEvaluationOptions;
    limit?: number;
    operationsRecordHref?: false | string | ((sessionId: string) => string);
    redact?: VoiceTraceRedactionConfig;
  } = {},
): VoiceTraceTimelineReport => {
  const source = options.redact
    ? redactVoiceTraceEvents(events, options.redact)
    : events;
  const grouped = new Map<string, StoredVoiceTraceEvent[]>();

  for (const event of filterVoiceTraceEvents(source)) {
    grouped.set(event.sessionId, [
      ...(grouped.get(event.sessionId) ?? []),
      event,
    ]);
  }

  const sessions = [...grouped.entries()]
    .map(([sessionId, sessionEvents]) => {
      const sorted = filterVoiceTraceEvents(sessionEvents);
      const summary = summarizeVoiceTrace(sorted);
      const evaluation = evaluateVoiceTrace(sorted, options.evaluation);
      const startedAt = summary.startedAt ?? sorted[0]?.at ?? 0;
      const status = summary.failed
        ? "failed"
        : evaluation.issues.length > 0
          ? "warning"
          : "healthy";

      return {
        endedAt: summary.endedAt,
        evaluation,
        events: sorted.map((event) => ({
          at: event.at,
          elapsedMs: eventElapsedMs(event),
          id: event.id,
          label: timelineLabel(event),
          offsetMs: Math.max(0, event.at - startedAt),
          payload: event.payload,
          provider: eventProvider(event),
          status: eventStatus(event),
          turnId: event.turnId,
          type: event.type,
        })),
        lastEventAt: sorted.at(-1)?.at,
        operationsRecordHref: resolveSessionHref(
          options.operationsRecordHref,
          sessionId,
        ),
        providers: summarizeProviders(sorted),
        sessionId,
        startedAt: summary.startedAt,
        status,
        summary,
      } satisfies VoiceTraceTimelineSession;
    })
    .sort((left, right) => (right.lastEventAt ?? 0) - (left.lastEventAt ?? 0))
    .slice(0, options.limit ?? 50);

  return {
    checkedAt: Date.now(),
    failed: sessions.filter((session) => session.status === "failed").length,
    sessions,
    total: sessions.length,
    warnings: sessions.filter((session) => session.status === "warning").length,
  };
};

const formatMs = (value: number | undefined) =>
  value === undefined ? "n/a" : `${String(value)}ms`;

const renderProviderCards = (session: VoiceTraceTimelineSession) =>
  session.providers.length === 0
    ? '<p class="muted">No provider events recorded for this session.</p>'
    : `<div class="providers">${session.providers
        .map(
          (provider) =>
            `<article><strong>${escapeHtml(provider.provider)}</strong><dl><div><dt>Events</dt><dd>${String(provider.eventCount)}</dd></div><div><dt>Avg</dt><dd>${formatMs(provider.averageElapsedMs)}</dd></div><div><dt>Max</dt><dd>${formatMs(provider.maxElapsedMs)}</dd></div><div><dt>Errors</dt><dd>${String(provider.errorCount)}</dd></div><div><dt>Fallbacks</dt><dd>${String(provider.fallbackCount)}</dd></div><div><dt>Timeouts</dt><dd>${String(provider.timeoutCount)}</dd></div></dl></article>`,
        )
        .join("")}</div>`;

export const renderVoiceTraceTimelineSessionHTML = (
  session: VoiceTraceTimelineSession,
  options: { title?: string } = {},
) => {
  const events = session.events
    .map(
      (event) =>
        `<tr class="${escapeHtml(event.status ?? "")}"><td>+${String(event.offsetMs)}ms</td><td>${escapeHtml(event.type)}</td><td>${escapeHtml(event.label)}</td><td>${escapeHtml(event.provider ?? "")}</td><td>${escapeHtml(event.status ?? "")}</td><td>${formatMs(event.elapsedMs)}</td></tr>`,
    )
    .join("");
  const issues = session.evaluation.issues.length
    ? session.evaluation.issues
        .map(
          (issue) =>
            `<li class="${escapeHtml(issue.severity)}">${escapeHtml(issue.code)}: ${escapeHtml(issue.message)}</li>`,
        )
        .join("")
    : "<li>none</li>";
  const supportLinks = session.operationsRecordHref
    ? `<p><a href="${escapeHtml(session.operationsRecordHref)}">Open operations record</a></p>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(options.title ?? "Voice Trace Timeline")}</title><style>${timelineCSS}</style></head><body><main><a href="/traces">Back to traces</a><header><p class="eyebrow">Call timeline</p><h1>${escapeHtml(session.sessionId)}</h1><p class="status ${escapeHtml(session.status)}">${escapeHtml(session.status)}</p>${supportLinks}</header><section class="metrics"><article><span>Events</span><strong>${String(session.summary.eventCount)}</strong></article><article><span>Turns</span><strong>${String(session.summary.turnCount)}</strong></article><article><span>Errors</span><strong>${String(session.summary.errorCount)}</strong></article><article><span>Duration</span><strong>${formatMs(session.summary.callDurationMs)}</strong></article></section><section><h2>Providers</h2>${renderProviderCards(session)}</section><section><h2>Issues</h2><ul>${issues}</ul></section><section><h2>Timeline</h2><table><thead><tr><th>Offset</th><th>Type</th><th>Event</th><th>Provider</th><th>Status</th><th>Latency</th></tr></thead><tbody>${events}</tbody></table></section></main></body></html>`;
};

const renderSessionRows = (report: VoiceTraceTimelineReport) =>
  report.sessions.length === 0
    ? '<tr><td colspan="7">No trace events recorded yet.</td></tr>'
    : report.sessions
        .map(
          (session) =>
            `<tr class="${escapeHtml(session.status)}"><td>${session.operationsRecordHref ? `<a href="${escapeHtml(session.operationsRecordHref)}">${escapeHtml(session.sessionId)}</a>` : `<a href="/traces/${encodeURIComponent(session.sessionId)}">${escapeHtml(session.sessionId)}</a>`}</td><td>${escapeHtml(session.status)}</td><td>${String(session.summary.eventCount)}</td><td>${String(session.summary.turnCount)}</td><td>${String(session.summary.errorCount)}</td><td>${formatMs(session.summary.callDurationMs)}</td><td>${session.providers.map((provider) => escapeHtml(provider.provider)).join(", ")}</td></tr>`,
        )
        .join("");

const timelineCSS =
  "body{background:#0f1318;color:#f6f2e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}a{color:#fbbf24}.eyebrow{color:#fbbf24;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,4.5rem);line-height:.92;margin:.2rem 0 1rem}.status{border:1px solid #475569;border-radius:999px;display:inline-flex;padding:8px 12px}.healthy{color:#86efac}.warning{color:#fbbf24}.failed,.error{color:#fca5a5}.metrics,.providers{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin:20px 0}.metrics article,.providers article{background:#181f27;border:1px solid #2b3642;border-radius:20px;padding:16px}.metrics span,dt,.muted{color:#a8b0b8}.metrics strong{display:block;font-size:2rem}dl{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));margin:12px 0 0}dd{font-weight:800;margin:4px 0 0}table{background:#181f27;border-collapse:collapse;border-radius:18px;overflow:hidden;width:100%}td,th{border-bottom:1px solid #2b3642;padding:12px;text-align:left}section{margin-top:28px}@media(max-width:760px){main{padding:20px}table{font-size:.9rem}}";

export const renderVoiceTraceTimelineHTML = (
  report: VoiceTraceTimelineReport,
  options: { title?: string } = {},
) => {
  const snippet = escapeHtml(`const traceStore = createVoiceTraceSinkStore({
	store: runtimeStorage.traces,
	sinks: [
		createVoiceTraceHTTPSink({
			endpoint: process.env.VOICE_TRACE_WEBHOOK_URL
		})
	]
});

app.use(
	createVoiceTraceTimelineRoutes({
		htmlPath: '/traces',
		path: '/api/voice-traces',
		redact: {
			keys: ['authorization', 'apiKey', 'token']
		},
		store: traceStore
	})
);

app.use(
	createVoiceProductionReadinessRoutes({
		store: traceStore,
		traceDeliveries: runtimeStorage.traceDeliveries
	})
);`);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(options.title ?? "Voice Trace Timelines")}</title><style>${timelineCSS}.primitive{background:#181f27;border:1px solid #334155;border-radius:20px;margin:20px 0;padding:18px}.primitive p{line-height:1.55}.primitive pre{background:#0b1118;border:1px solid #2b3642;border-radius:16px;color:#dbeafe;overflow:auto;padding:14px}.primitive code{color:#bfdbfe}</style></head><body><main><header><p class="eyebrow">Self-hosted voice debugging</p><h1>${escapeHtml(options.title ?? "Voice Trace Timelines")}</h1><p class="muted">Per-call event timelines with provider latency, fallback, timeout, handoff, and error context.</p></header><section class="metrics"><article><span>Sessions</span><strong>${String(report.total)}</strong></article><article><span>Failed</span><strong>${String(report.failed)}</strong></article><article><span>Warnings</span><strong>${String(report.warnings)}</strong></article></section><section class="primitive"><p class="eyebrow">Copy into your app</p><h2><code>createVoiceTraceTimelineRoutes(...)</code> makes traces the proof backbone</h2><p class="muted">Mount trace timelines from the same trace store used by readiness, simulations, provider recovery, delivery sinks, and phone-agent smoke proof.</p><pre><code>${snippet}</code></pre></section><table><thead><tr><th>Session</th><th>Status</th><th>Events</th><th>Turns</th><th>Errors</th><th>Duration</th><th>Providers</th></tr></thead><tbody>${renderSessionRows(report)}</tbody></table></main></body></html>`;
};

export const createVoiceTraceTimelineRoutes = (
  options: VoiceTraceTimelineRoutesOptions,
) => {
  const path = options.path ?? "/api/voice-traces";
  const htmlPath = options.htmlPath ?? "/traces";
  const title = options.title ?? "AbsoluteJS Voice Trace Timelines";
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-trace-timelines",
  });

  const buildReport = async () =>
    summarizeVoiceTraceTimeline(await options.store.list(), {
      evaluation: options.evaluation,
      limit: options.limit,
      operationsRecordHref: options.operationsRecordHref,
      redact: options.redact,
    });

  const findSession = async (sessionId: string) => {
    const report = summarizeVoiceTraceTimeline(
      await options.store.list({ sessionId }),
      {
        evaluation: options.evaluation,
        limit: 1,
        operationsRecordHref: options.operationsRecordHref,
        redact: options.redact,
      },
    );
    return report.sessions[0];
  };

  routes.get(path, async () => Response.json(await buildReport()));
  routes.get(`${path}/:sessionId`, async ({ params }) => {
    const session = await findSession(params.sessionId);
    return session
      ? Response.json(session)
      : Response.json(
          { error: "Voice trace session not found." },
          { status: 404 },
        );
  });
  routes.get(htmlPath, async () => {
    const report = await buildReport();
    const body = await (
      options.render ??
      ((input) => renderVoiceTraceTimelineHTML(input, { title }))
    )(report);
    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...options.headers,
      },
    });
  });
  routes.get(`${htmlPath}/:sessionId`, async ({ params }) => {
    const session = await findSession(params.sessionId);
    if (!session) {
      return Response.json(
        { error: "Voice trace session not found." },
        { status: 404 },
      );
    }
    const body = await (
      options.renderSession ??
      ((input) => renderVoiceTraceTimelineSessionHTML(input, { title }))
    )(session);
    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...options.headers,
      },
    });
  });

  return routes;
};
