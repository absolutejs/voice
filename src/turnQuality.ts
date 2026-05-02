import { Elysia } from "elysia";
import type {
  VoiceSessionRecord,
  VoiceSessionStore,
  VoiceSessionSummary,
  VoiceTranscriptQuality,
  VoiceTurnRecord,
} from "./types";

export type VoiceTurnQualityStatus = "pass" | "warn" | "fail" | "unknown";

export type VoiceTurnQualityItem = {
  averageConfidence?: number;
  committedAt: number;
  correctionChanged: boolean;
  correctionProvider?: string;
  correctionReason?: string;
  costUnits?: number;
  fallbackSelectionReason?: string;
  fallbackUsed: boolean;
  finalTranscriptCount: number;
  latencyMs?: number;
  partialTranscriptCount: number;
  selectedTranscriptCount: number;
  sessionId: string;
  source?: VoiceTranscriptQuality["source"];
  status: VoiceTurnQualityStatus;
  text: string;
  turnId: string;
};

export type VoiceTurnQualityReport = {
  checkedAt: number;
  failed: number;
  sessions: number;
  status: VoiceTurnQualityStatus;
  total: number;
  turns: VoiceTurnQualityItem[];
  warnings: number;
};

export type VoiceTurnQualityOptions<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = {
  confidenceWarnThreshold?: number;
  limit?: number;
  sessionIds?: string[];
  sessions?: TSession[];
  store?: VoiceSessionStore<TSession>;
};

export type VoiceTurnQualityHTMLHandlerOptions<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = VoiceTurnQualityOptions<TSession> & {
  headers?: HeadersInit;
  render?: (report: VoiceTurnQualityReport) => string | Promise<string>;
  title?: string;
};

export type VoiceTurnQualityRoutesOptions<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = VoiceTurnQualityHTMLHandlerOptions<TSession> & {
  htmlPath?: false | string;
  name?: string;
  path?: string;
};

const DEFAULT_CONFIDENCE_WARN_THRESHOLD = 0.72;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getTurnLatencyMs = (turn: VoiceTurnRecord) => {
  const firstTranscriptAt = turn.transcripts
    .map((transcript) => transcript.endedAtMs ?? transcript.startedAtMs)
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => left - right)[0];
  if (firstTranscriptAt === undefined) {
    return undefined;
  }
  return Math.max(0, turn.committedAt - firstTranscriptAt);
};

const summarizeTurn = (
  sessionId: string,
  turn: VoiceTurnRecord,
  options: { confidenceWarnThreshold: number },
): VoiceTurnQualityItem => {
  const quality = turn.quality;
  const correctionChanged = quality?.correction?.changed === true;
  const fallbackUsed = quality?.fallbackUsed === true;
  const lowConfidence =
    typeof quality?.averageConfidence === "number" &&
    quality.averageConfidence < options.confidenceWarnThreshold;
  const hasNoQuality = !quality;
  const status: VoiceTurnQualityStatus = hasNoQuality
    ? "unknown"
    : quality.selectedTranscriptCount === 0 || turn.text.trim().length === 0
      ? "fail"
      : fallbackUsed || correctionChanged || lowConfidence
        ? "warn"
        : "pass";

  return {
    averageConfidence: quality?.averageConfidence,
    committedAt: turn.committedAt,
    correctionChanged,
    correctionProvider: quality?.correction?.provider,
    correctionReason: quality?.correction?.reason,
    costUnits: quality?.cost?.estimatedRelativeCostUnits,
    fallbackSelectionReason: quality?.fallback?.selectionReason,
    fallbackUsed,
    finalTranscriptCount: quality?.finalTranscriptCount ?? 0,
    latencyMs: getTurnLatencyMs(turn),
    partialTranscriptCount: quality?.partialTranscriptCount ?? 0,
    selectedTranscriptCount: quality?.selectedTranscriptCount ?? 0,
    sessionId,
    source: quality?.source,
    status,
    text: turn.text,
    turnId: turn.id,
  };
};

const resolveSessions = async <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  options: VoiceTurnQualityOptions<TSession>,
) => {
  if (options.sessions) {
    return options.sessions;
  }
  if (!options.store) {
    return [];
  }
  const ids =
    options.sessionIds ??
    ((await options.store.list()) as VoiceSessionSummary[]).map(
      (summary) => summary.id,
    );
  const hydrated = await Promise.all(
    ids.slice(0, options.limit ?? 25).map((id) => options.store?.get(id)),
  );
  const sessions: TSession[] = [];
  for (const session of hydrated) {
    if (session) {
      sessions.push(session as TSession);
    }
  }
  return sessions;
};

export const summarizeVoiceTurnQuality = async <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  options: VoiceTurnQualityOptions<TSession>,
): Promise<VoiceTurnQualityReport> => {
  const sessions = await resolveSessions(options);
  const confidenceWarnThreshold =
    options.confidenceWarnThreshold ?? DEFAULT_CONFIDENCE_WARN_THRESHOLD;
  const turns = sessions
    .flatMap((session) =>
      session.turns.map((turn) =>
        summarizeTurn(session.id, turn, { confidenceWarnThreshold }),
      ),
    )
    .sort((left, right) => right.committedAt - left.committedAt);
  const failed = turns.filter((turn) => turn.status === "fail").length;
  const warnings = turns.filter((turn) => turn.status === "warn").length;

  return {
    checkedAt: Date.now(),
    failed,
    sessions: sessions.length,
    status: failed > 0 ? "fail" : warnings > 0 ? "warn" : "pass",
    total: turns.length,
    turns,
    warnings,
  };
};

export const renderVoiceTurnQualityHTML = (
  report: VoiceTurnQualityReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Turn Quality";
  const turns = report.turns
    .map(
      (turn) => `<article class="turn ${escapeHtml(turn.status)}">
  <div class="turn-header">
    <div>
      <p class="eyebrow">${escapeHtml(turn.sessionId)} · ${escapeHtml(turn.turnId)}</p>
      <h2>${escapeHtml(turn.text || "Empty turn")}</h2>
    </div>
    <strong>${escapeHtml(turn.status)}</strong>
  </div>
  <dl>
    <div><dt>Source</dt><dd>${escapeHtml(turn.source ?? "unknown")}</dd></div>
    <div><dt>Confidence</dt><dd>${turn.averageConfidence === undefined ? "n/a" : `${Math.round(turn.averageConfidence * 100)}%`}</dd></div>
    <div><dt>Fallback</dt><dd>${turn.fallbackUsed ? `yes (${escapeHtml(turn.fallbackSelectionReason ?? "selected")})` : "no"}</dd></div>
    <div><dt>Correction</dt><dd>${turn.correctionChanged ? `changed${turn.correctionProvider ? ` by ${escapeHtml(turn.correctionProvider)}` : ""}` : "none"}</dd></div>
    <div><dt>Transcripts</dt><dd>${String(turn.selectedTranscriptCount)} selected · ${String(turn.finalTranscriptCount)} final · ${String(turn.partialTranscriptCount)} partial</dd></div>
    <div><dt>Cost</dt><dd>${turn.costUnits === undefined ? "n/a" : String(turn.costUnits)}</dd></div>
  </dl>
</article>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101316;color:#f6f2e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}.hero,.turn{background:#181d22;border:1px solid #2a323a;border-radius:20px;margin-bottom:16px;padding:20px}.hero{background:linear-gradient(135deg,rgba(251,191,36,.16),rgba(34,197,94,.1))}.eyebrow{color:#fbbf24;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,5rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}h2{margin:.2rem 0 1rem}.summary{display:flex;flex-wrap:wrap;gap:10px}.pill{background:#0f1217;border:1px solid #3f3f46;border-radius:999px;padding:7px 10px}.turn-header{align-items:flex-start;display:flex;gap:16px;justify-content:space-between}.pass{color:#86efac}.warn,.unknown{color:#fde68a}.fail{color:#fca5a5}.turn.fail{border-color:rgba(248,113,113,.45)}dl{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}dt{color:#a8b0b8;font-size:.8rem}dd{margin:0}@media(max-width:800px){main{padding:18px}.turn-header{display:block}}</style></head><body><main><section class="hero"><p class="eyebrow">Realtime STT Debugging</p><h1>${escapeHtml(title)}</h1><div class="summary"><span class="pill ${escapeHtml(report.status)}">${escapeHtml(report.status)}</span><span class="pill">${String(report.total)} turns</span><span class="pill">${String(report.warnings)} warnings</span><span class="pill">${String(report.failed)} failed</span><span class="pill">${String(report.sessions)} sessions</span></div></section>${turns || '<section class="turn"><p>No committed turns found.</p></section>'}</main></body></html>`;
};

export const createVoiceTurnQualityJSONHandler =
  <TSession extends VoiceSessionRecord = VoiceSessionRecord>(
    options: VoiceTurnQualityOptions<TSession>,
  ) =>
  async () =>
    summarizeVoiceTurnQuality(options);

export const createVoiceTurnQualityHTMLHandler =
  <TSession extends VoiceSessionRecord = VoiceSessionRecord>(
    options: VoiceTurnQualityHTMLHandlerOptions<TSession>,
  ) =>
  async () => {
    const report = await summarizeVoiceTurnQuality(options);
    const render =
      options.render ?? ((input) => renderVoiceTurnQualityHTML(input, options));
    const body = await render(report);

    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...options.headers,
      },
    });
  };

export const createVoiceTurnQualityRoutes = <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  options: VoiceTurnQualityRoutesOptions<TSession>,
) => {
  const path = options.path ?? "/api/turn-quality";
  const htmlPath =
    options.htmlPath === undefined ? `${path}/htmx` : options.htmlPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-turn-quality",
  }).get(path, createVoiceTurnQualityJSONHandler(options));

  if (htmlPath) {
    routes.get(htmlPath, createVoiceTurnQualityHTMLHandler(options));
  }

  return routes;
};
