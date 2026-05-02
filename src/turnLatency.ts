import { Elysia } from "elysia";
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from "./trace";
import type {
  VoiceSessionRecord,
  VoiceSessionStore,
  VoiceSessionSummary,
  VoiceTurnRecord,
} from "./types";

export type VoiceTurnLatencyStatus = "pass" | "warn" | "fail" | "empty";

export type VoiceTurnLatencyStage = {
  label: string;
  valueMs?: number;
};

export type VoiceTurnLatencyItem = {
  assistantTextStartedAt?: number;
  committedAt: number;
  finalTranscriptAt?: number;
  firstTranscriptAt?: number;
  sessionId: string;
  stages: VoiceTurnLatencyStage[];
  status: VoiceTurnLatencyStatus;
  text: string;
  totalMs?: number;
  turnId: string;
};

export type VoiceTurnLatencyReport = {
  averageTotalMs?: number;
  checkedAt: number;
  failed: number;
  sessions: number;
  status: VoiceTurnLatencyStatus;
  total: number;
  turns: VoiceTurnLatencyItem[];
  warnings: number;
};

export type VoiceTurnLatencyOptions<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = {
  limit?: number;
  sessionIds?: string[];
  sessions?: TSession[];
  store?: VoiceSessionStore<TSession>;
  traceStore?: VoiceTraceEventStore;
  warnAfterMs?: number;
  failAfterMs?: number;
};

export type VoiceTurnLatencyHTMLHandlerOptions<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = VoiceTurnLatencyOptions<TSession> & {
  headers?: HeadersInit;
  render?: (report: VoiceTurnLatencyReport) => string | Promise<string>;
  title?: string;
};

export type VoiceTurnLatencyRoutesOptions<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = VoiceTurnLatencyHTMLHandlerOptions<TSession> & {
  htmlPath?: false | string;
  name?: string;
  path?: string;
};

const DEFAULT_WARN_AFTER_MS = 1800;
const DEFAULT_FAIL_AFTER_MS = 3200;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const firstNumber = (values: Array<number | undefined>) =>
  values
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => left - right)[0];

const getString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : undefined;

const createTraceStageIndex = (events: StoredVoiceTraceEvent[]) => {
  const index = new Map<string, Map<string, number>>();
  for (const event of events) {
    if (event.type !== "turn_latency.stage" || !event.turnId) {
      continue;
    }
    const stage = getString(event.payload.stage);
    if (!stage) {
      continue;
    }
    const key = `${event.sessionId}:${event.turnId}`;
    const stages = index.get(key) ?? new Map<string, number>();
    const previous = stages.get(stage);
    if (previous === undefined || event.at < previous) {
      stages.set(stage, event.at);
    }
    index.set(key, stages);
  }
  return index;
};

const summarizeTurn = (
  sessionId: string,
  turn: VoiceTurnRecord,
  options: {
    failAfterMs: number;
    stageIndex?: Map<string, Map<string, number>>;
    warnAfterMs: number;
  },
): VoiceTurnLatencyItem => {
  const traceStages = options.stageIndex?.get(`${sessionId}:${turn.id}`);
  const firstTranscriptAt =
    traceStages?.get("speech_detected") ??
    firstNumber(
      turn.transcripts.map(
        (transcript) => transcript.endedAtMs ?? transcript.startedAtMs,
      ),
    );
  const finalTranscriptAt =
    traceStages?.get("final_transcript") ??
    firstNumber(
      turn.transcripts
        .filter((transcript) => transcript.isFinal)
        .map((transcript) => transcript.endedAtMs ?? transcript.startedAtMs),
    );
  const committedAt = traceStages?.get("turn_committed") ?? turn.committedAt;
  const assistantTextStartedAt =
    traceStages?.get("assistant_text_started") ??
    (turn.assistantText ? committedAt : undefined);
  const ttsSendStartedAt = traceStages?.get("tts_send_started");
  const ttsSendCompletedAt = traceStages?.get("tts_send_completed");
  const assistantAudioReceivedAt = traceStages?.get("assistant_audio_received");
  const commitAfterFirstMs =
    firstTranscriptAt === undefined
      ? undefined
      : Math.max(0, committedAt - firstTranscriptAt);
  const commitAfterFinalMs =
    finalTranscriptAt === undefined
      ? undefined
      : Math.max(0, committedAt - finalTranscriptAt);
  const totalEndAt =
    assistantAudioReceivedAt ?? assistantTextStartedAt ?? committedAt;
  const totalMs =
    firstTranscriptAt === undefined
      ? commitAfterFirstMs
      : Math.max(0, totalEndAt - firstTranscriptAt);
  const status: VoiceTurnLatencyStatus =
    totalMs === undefined
      ? "warn"
      : totalMs > options.failAfterMs
        ? "fail"
        : totalMs > options.warnAfterMs
          ? "warn"
          : "pass";

  return {
    assistantTextStartedAt,
    committedAt,
    finalTranscriptAt,
    firstTranscriptAt,
    sessionId,
    stages: [
      { label: "Speech to commit", valueMs: commitAfterFirstMs },
      { label: "Final transcript to commit", valueMs: commitAfterFinalMs },
      {
        label: "Commit to assistant text",
        valueMs:
          assistantTextStartedAt === undefined
            ? undefined
            : Math.max(0, assistantTextStartedAt - committedAt),
      },
      {
        label: "Assistant text to TTS send",
        valueMs:
          ttsSendStartedAt === undefined || assistantTextStartedAt === undefined
            ? undefined
            : Math.max(0, ttsSendStartedAt - assistantTextStartedAt),
      },
      {
        label: "TTS send duration",
        valueMs:
          ttsSendCompletedAt === undefined || ttsSendStartedAt === undefined
            ? undefined
            : Math.max(0, ttsSendCompletedAt - ttsSendStartedAt),
      },
      {
        label: "TTS to first audio",
        valueMs:
          assistantAudioReceivedAt === undefined ||
          ttsSendCompletedAt === undefined
            ? undefined
            : Math.max(0, assistantAudioReceivedAt - ttsSendCompletedAt),
      },
    ],
    status,
    text: turn.text,
    totalMs,
    turnId: turn.id,
  };
};

const resolveSessions = async <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  options: VoiceTurnLatencyOptions<TSession>,
) => {
  if (options.sessions) {
    return options.sessions;
  }
  if (!options.store) {
    return [];
  }
  const summaries = (await options.store.list()) as VoiceSessionSummary[];
  const ids = options.sessionIds ?? summaries.map((summary) => summary.id);
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

export const summarizeVoiceTurnLatency = async <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  options: VoiceTurnLatencyOptions<TSession>,
): Promise<VoiceTurnLatencyReport> => {
  const sessions = await resolveSessions(options);
  const traceEvents = options.traceStore
    ? await options.traceStore.list({
        limit: 1000,
        type: "turn_latency.stage",
      })
    : [];
  const stageIndex = createTraceStageIndex(traceEvents);
  const warnAfterMs = options.warnAfterMs ?? DEFAULT_WARN_AFTER_MS;
  const failAfterMs = options.failAfterMs ?? DEFAULT_FAIL_AFTER_MS;
  const turns = sessions
    .flatMap((session) =>
      session.turns.map((turn) =>
        summarizeTurn(session.id, turn, {
          failAfterMs,
          stageIndex,
          warnAfterMs,
        }),
      ),
    )
    .sort((left, right) => right.committedAt - left.committedAt);
  const totals = turns
    .map((turn) => turn.totalMs)
    .filter((value): value is number => typeof value === "number");
  const failed = turns.filter((turn) => turn.status === "fail").length;
  const warnings = turns.filter((turn) => turn.status === "warn").length;

  return {
    averageTotalMs:
      totals.length > 0
        ? Math.round(
            totals.reduce((total, value) => total + value, 0) / totals.length,
          )
        : undefined,
    checkedAt: Date.now(),
    failed,
    sessions: sessions.length,
    status:
      turns.length === 0
        ? "empty"
        : failed > 0
          ? "fail"
          : warnings > 0
            ? "warn"
            : "pass",
    total: turns.length,
    turns,
    warnings,
  };
};

const formatMs = (value?: number) =>
  typeof value === "number" ? `${Math.round(value)}ms` : "n/a";

export const renderVoiceTurnLatencyHTML = (
  report: VoiceTurnLatencyReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Turn Latency";
  const snippet = `app.use(
  createVoiceTurnLatencyRoutes({
    failAfterMs: 3200,
    htmlPath: '/turn-latency',
    path: '/api/turn-latency',
    store: sessionStore,
    traceStore,
    warnAfterMs: 1800
  })
);

await traceStore.append({
  at: Date.now(),
  payload: { stage: 'assistant_audio_received' },
  sessionId,
  turnId,
  type: 'turn_latency.stage'
});`;
  const turns = report.turns
    .map(
      (turn) => `<article class="turn ${escapeHtml(turn.status)}">
  <header><div><p class="eyebrow">${escapeHtml(turn.sessionId)} · ${escapeHtml(turn.turnId)}</p><h2>${escapeHtml(turn.text || "Empty turn")}</h2></div><strong>${escapeHtml(turn.status)}</strong></header>
  <dl>${turn.stages
    .map(
      (stage) =>
        `<div><dt>${escapeHtml(stage.label)}</dt><dd>${escapeHtml(formatMs(stage.valueMs))}</dd></div>`,
    )
    .join("")}</dl>
</article>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101316;color:#f6f2e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}.hero,.turn,.primitive{background:#181d22;border:1px solid #2a323a;border-radius:20px;margin-bottom:16px;padding:20px}.hero{background:linear-gradient(135deg,rgba(94,234,212,.16),rgba(251,191,36,.1))}.eyebrow{color:#5eead4;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,5rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}h2{margin:.2rem 0 1rem}.summary{display:flex;flex-wrap:wrap;gap:10px}.pill{background:#0f1217;border:1px solid #3f3f46;border-radius:999px;padding:7px 10px}.primitive p{color:#cbd5e1}.primitive pre{background:#0a0d10;border:1px solid #2a323a;border-radius:16px;color:#d9fff7;overflow:auto;padding:16px}.turn header{align-items:flex-start;display:flex;gap:16px;justify-content:space-between}.pass{color:#86efac}.warn,.empty{color:#fde68a}.fail{color:#fca5a5}.turn.fail{border-color:rgba(248,113,113,.45)}dl{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}dt{color:#a8b0b8;font-size:.8rem}dd{font-weight:900;margin:0}@media(max-width:800px){main{padding:18px}.turn header{display:block}}</style></head><body><main><section class="hero"><p class="eyebrow">End-to-end responsiveness</p><h1>${escapeHtml(title)}</h1><div class="summary"><span class="pill ${escapeHtml(report.status)}">${escapeHtml(report.status)}</span><span class="pill">${String(report.total)} turns</span><span class="pill">avg ${escapeHtml(formatMs(report.averageTotalMs))}</span><span class="pill">${String(report.warnings)} warnings</span><span class="pill">${String(report.failed)} failed</span></div></section><section class="primitive"><p class="eyebrow">Copy into your app</p><h2><code>createVoiceTurnLatencyRoutes(...)</code> exposes the full turn waterfall</h2><p>Attach stage traces for speech detection, commit, model response, TTS send, and first audio so teams can prove where latency actually comes from.</p><pre><code>${escapeHtml(snippet)}</code></pre></section>${turns || '<section class="turn"><p>No committed turns found.</p></section>'}</main></body></html>`;
};

export const createVoiceTurnLatencyJSONHandler =
  <TSession extends VoiceSessionRecord = VoiceSessionRecord>(
    options: VoiceTurnLatencyOptions<TSession>,
  ) =>
  async () =>
    summarizeVoiceTurnLatency(options);

export const createVoiceTurnLatencyHTMLHandler =
  <TSession extends VoiceSessionRecord = VoiceSessionRecord>(
    options: VoiceTurnLatencyHTMLHandlerOptions<TSession>,
  ) =>
  async () => {
    const report = await summarizeVoiceTurnLatency(options);
    const render =
      options.render ?? ((input) => renderVoiceTurnLatencyHTML(input, options));
    const body = await render(report);

    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...options.headers,
      },
    });
  };

export const createVoiceTurnLatencyRoutes = <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  options: VoiceTurnLatencyRoutesOptions<TSession>,
) => {
  const path = options.path ?? "/api/turn-latency";
  const htmlPath =
    options.htmlPath === undefined ? `${path}/htmx` : options.htmlPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-turn-latency",
  }).get(path, createVoiceTurnLatencyJSONHandler(options));

  if (htmlPath) {
    routes.get(htmlPath, createVoiceTurnLatencyHTMLHandler(options));
  }

  return routes;
};
