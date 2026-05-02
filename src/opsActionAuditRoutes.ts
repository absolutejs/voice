import { Elysia } from "elysia";
import {
  createVoiceAuditEvent,
  type StoredVoiceAuditEvent,
  type VoiceAuditEventStore,
} from "./audit";
import { createVoiceTraceEvent, type VoiceTraceEventStore } from "./trace";

export type VoiceOpsActionAuditRecord = {
  actionId: string;
  body?: unknown;
  error?: string;
  ok: boolean;
  ranAt: number;
  status: number;
};

export type VoiceOpsActionAuditRoutesOptions = {
  audit?: VoiceAuditEventStore;
  historyHtmlPath?: false | string;
  historyPath?: false | string;
  name?: string;
  path?: string;
  trace?: VoiceTraceEventStore;
};

export type VoiceOpsActionHistoryEntry = {
  actionId: string;
  at: number;
  error?: string;
  eventId: string;
  ok: boolean;
  status?: number;
  traceId?: string;
};

export type VoiceOpsActionHistoryReport = {
  checkedAt: number;
  entries: VoiceOpsActionHistoryEntry[];
  failed: number;
  passed: number;
  total: number;
};

const readRecordBody = (body: unknown): VoiceOpsActionAuditRecord => {
  if (!body || typeof body !== "object") {
    throw new Error("Voice ops action audit requires a JSON body.");
  }
  const record = body as Partial<VoiceOpsActionAuditRecord>;
  if (!record.actionId || typeof record.actionId !== "string") {
    throw new Error("Voice ops action audit requires actionId.");
  }
  return {
    actionId: record.actionId,
    body: record.body,
    error: record.error,
    ok: Boolean(record.ok),
    ranAt: typeof record.ranAt === "number" ? record.ranAt : Date.now(),
    status: typeof record.status === "number" ? record.status : 0,
  };
};

const readRecord = async (
  request: Request,
): Promise<VoiceOpsActionAuditRecord> =>
  readRecordBody(await request.json().catch(() => null));

export const recordVoiceOpsActionAudit = async (
  record: VoiceOpsActionAuditRecord,
  options: Pick<VoiceOpsActionAuditRoutesOptions, "audit" | "trace">,
) => {
  const traceId = `voice-ops-action:${record.actionId}:${record.ranAt}`;
  const outcome = record.ok ? "success" : "error";
  const [audit, trace] = await Promise.all([
    options.audit?.append(
      createVoiceAuditEvent({
        action: record.actionId,
        actor: {
          id: "voice-ops-action-center",
          kind: "operator",
          name: "Voice Ops Action Center",
        },
        at: record.ranAt,
        metadata: {
          source: "voice-ops-action-center",
        },
        outcome,
        payload: {
          body: record.body,
          error: record.error,
          status: record.status,
        },
        resource: {
          id: record.actionId,
          type: "voice.ops.action",
        },
        sessionId: "voice-ops-action-center",
        traceId,
        type: "operator.action",
      }),
    ),
    options.trace?.append(
      createVoiceTraceEvent({
        at: record.ranAt,
        metadata: {
          source: "voice-ops-action-center",
        },
        payload: {
          actionId: record.actionId,
          body: record.body,
          error: record.error,
          ok: record.ok,
          status: record.status,
        },
        sessionId: "voice-ops-action-center",
        traceId,
        type: "operator.action",
      }),
    ),
  ]);

  return {
    audit,
    ok: true,
    trace,
  };
};

export const createVoiceOpsActionAuditRoutes = (
  options: VoiceOpsActionAuditRoutesOptions,
) => {
  const path = options.path ?? "/api/voice/ops-actions/audit";
  const historyPath =
    options.historyPath === undefined
      ? "/api/voice/ops-actions/history"
      : options.historyPath;
  const historyHtmlPath =
    options.historyHtmlPath === undefined
      ? "/voice/ops-actions"
      : options.historyHtmlPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-ops-action-audit",
  }).post(path, async ({ body, request, set }) => {
    try {
      const record =
        body === undefined ? await readRecord(request) : readRecordBody(body);
      return await recordVoiceOpsActionAudit(record, options);
    } catch (error) {
      set.status = 400;
      return {
        error: error instanceof Error ? error.message : String(error),
        ok: false,
      };
    }
  });

  if (historyPath !== false) {
    routes.get(historyPath, async () =>
      buildVoiceOpsActionHistoryReport(options),
    );
  }

  if (historyHtmlPath !== false) {
    routes.get(
      historyHtmlPath,
      async () =>
        new Response(
          renderVoiceOpsActionHistoryHTML(
            await buildVoiceOpsActionHistoryReport(options),
          ),
          {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
            },
          },
        ),
    );
  }

  return routes;
};

const toHistoryEntry = (
  event: StoredVoiceAuditEvent,
): VoiceOpsActionHistoryEntry => ({
  actionId: event.action,
  at: event.at,
  error:
    event.payload &&
    typeof event.payload === "object" &&
    "error" in event.payload &&
    typeof event.payload.error === "string"
      ? event.payload.error
      : undefined,
  eventId: event.id,
  ok: event.outcome !== "error",
  status:
    event.payload &&
    typeof event.payload === "object" &&
    "status" in event.payload &&
    typeof event.payload.status === "number"
      ? event.payload.status
      : undefined,
  traceId: event.traceId,
});

export const buildVoiceOpsActionHistoryReport = async (
  options: Pick<VoiceOpsActionAuditRoutesOptions, "audit">,
): Promise<VoiceOpsActionHistoryReport> => {
  const events = options.audit
    ? await options.audit.list({
        limit: 25,
        resourceType: "voice.ops.action",
        type: "operator.action",
      })
    : [];
  const entries = events
    .map(toHistoryEntry)
    .sort((left, right) => right.at - left.at);

  return {
    checkedAt: Date.now(),
    entries,
    failed: entries.filter((entry) => !entry.ok).length,
    passed: entries.filter((entry) => entry.ok).length,
    total: entries.length,
  };
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderVoiceOpsActionHistoryHTML = (
  report: VoiceOpsActionHistoryReport,
) => {
  const rows = report.entries
    .map(
      (entry) =>
        `<article class="${entry.ok ? "ok" : "fail"}"><span>${escapeHtml(entry.ok ? "success" : "error")}</span><strong>${escapeHtml(entry.actionId)}</strong><p>${escapeHtml(new Date(entry.at).toLocaleString())}${entry.status ? ` · HTTP ${String(entry.status)}` : ""}</p>${entry.error ? `<p>${escapeHtml(entry.error)}</p>` : ""}</article>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Voice Ops Action History</title><style>body{background:#11140f;color:#f7f1df;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:980px;padding:32px}.hero,article{background:#181d15;border:1px solid #2c3327;border-radius:24px;padding:20px}.hero{margin-bottom:16px}h1{font-size:clamp(2rem,6vw,4rem);line-height:.95}section{display:grid;gap:12px}article.ok{border-color:rgba(34,197,94,.55)}article.fail{border-color:rgba(239,68,68,.75)}span{color:#facc15;font-weight:900;text-transform:uppercase}p{color:#c8ccb8}</style></head><body><main><section class="hero"><span>Operator proof</span><h1>Voice Ops Action History</h1><p>${String(report.total)} action(s), ${String(report.failed)} failed.</p></section><section>${rows || "<p>No operator actions have been recorded.</p>"}</section></main></body></html>`;
};
