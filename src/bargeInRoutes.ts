import { Elysia } from "elysia";
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from "./trace";
import type {
  VoiceBargeInMonitorEvent,
  VoiceBargeInMonitorSnapshot,
} from "./types";

export type VoiceBargeInRoutesOptions = {
  headers?: HeadersInit;
  htmlPath?: string;
  name?: string;
  path?: string;
  store: VoiceTraceEventStore;
  thresholdMs?: number;
  title?: string;
};

export type VoiceBargeInReport = VoiceBargeInMonitorSnapshot & {
  checkedAt: number;
  sessions: Array<{
    averageLatencyMs?: number;
    failed: number;
    passed: number;
    sessionId: string;
    total: number;
  }>;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const isBargeInPayload = (value: unknown): value is VoiceBargeInMonitorEvent =>
  !!value &&
  typeof value === "object" &&
  typeof (value as VoiceBargeInMonitorEvent).at === "number" &&
  typeof (value as VoiceBargeInMonitorEvent).id === "string" &&
  typeof (value as VoiceBargeInMonitorEvent).reason === "string" &&
  typeof (value as VoiceBargeInMonitorEvent).status === "string";

const toBargeInEvent = (
  event: StoredVoiceTraceEvent,
): VoiceBargeInMonitorEvent | undefined =>
  event.type === "client.barge_in" && isBargeInPayload(event.payload)
    ? event.payload
    : undefined;

export const summarizeVoiceBargeIn = (
  events: StoredVoiceTraceEvent[],
  options: { thresholdMs?: number } = {},
): VoiceBargeInReport => {
  const thresholdMs = options.thresholdMs ?? 250;
  const bargeInEvents = events
    .map(toBargeInEvent)
    .filter((event): event is VoiceBargeInMonitorEvent => !!event)
    .sort((left, right) => left.at - right.at);
  const stopped = bargeInEvents.filter((event) => event.status === "stopped");
  const latencies = stopped
    .map((event) => event.latencyMs)
    .filter((value): value is number => typeof value === "number");
  const failed = stopped.filter(
    (event) =>
      typeof event.latencyMs === "number" && event.latencyMs > thresholdMs,
  ).length;
  const passed = stopped.length - failed;
  const grouped = new Map<string, VoiceBargeInMonitorEvent[]>();

  for (const event of stopped) {
    const sessionId = event.sessionId ?? "unknown";
    grouped.set(sessionId, [...(grouped.get(sessionId) ?? []), event]);
  }

  return {
    averageLatencyMs:
      latencies.length > 0
        ? Math.round(
            latencies.reduce((total, value) => total + value, 0) /
              latencies.length,
          )
        : undefined,
    checkedAt: Date.now(),
    events: bargeInEvents,
    failed,
    lastEvent: bargeInEvents.at(-1),
    passed,
    sessions: [...grouped.entries()]
      .map(([sessionId, sessionEvents]) => {
        const sessionLatencies = sessionEvents
          .map((event) => event.latencyMs)
          .filter((value): value is number => typeof value === "number");
        const sessionFailed = sessionEvents.filter(
          (event) =>
            typeof event.latencyMs === "number" &&
            event.latencyMs > thresholdMs,
        ).length;

        return {
          averageLatencyMs:
            sessionLatencies.length > 0
              ? Math.round(
                  sessionLatencies.reduce((total, value) => total + value, 0) /
                    sessionLatencies.length,
                )
              : undefined,
          failed: sessionFailed,
          passed: sessionEvents.length - sessionFailed,
          sessionId,
          total: sessionEvents.length,
        };
      })
      .sort((left, right) => right.total - left.total),
    status:
      bargeInEvents.length === 0
        ? "empty"
        : failed > 0
          ? "fail"
          : stopped.length === 0
            ? "warn"
            : "pass",
    thresholdMs,
    total: stopped.length,
  };
};

export const renderVoiceBargeInHTML = (
  report: VoiceBargeInReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Barge-In";
  const snippet = `const traceStore = createVoiceMemoryTraceEventStore();

app.use(
  createVoiceBargeInRoutes({
    htmlPath: '/barge-in',
    path: '/api/voice-barge-in',
    store: traceStore,
    thresholdMs: 250
  })
);

// Browser/runtime side:
const bargeInMonitor = createVoiceBargeInMonitor({
  path: '/api/voice-barge-in',
  sessionId
});`;
  const sessions = report.sessions.length
    ? report.sessions
        .map(
          (session) =>
            `<tr><td>${escapeHtml(session.sessionId)}</td><td>${String(session.total)}</td><td>${String(session.passed)}</td><td>${String(session.failed)}</td><td>${String(session.averageLatencyMs ?? 0)}ms</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5">No barge-in events yet.</td></tr>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101316;color:#f6f2e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1100px;padding:32px}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,4.5rem);line-height:.92;margin:.2rem 0 1rem}.status{border:1px solid #475569;border-radius:999px;display:inline-flex;padding:8px 12px}.pass{color:#86efac}.warn{color:#fbbf24}.fail{color:#fca5a5}.empty{color:#cbd5e1}.metrics{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin:20px 0}.metrics article,.primitive{background:#181f27;border:1px solid #2b3642;border-radius:20px;padding:16px}.metrics span{color:#a8b0b8}.metrics strong{display:block;font-size:2rem}.primitive{margin:0 0 20px}.primitive h2{margin:.2rem 0 .5rem}.primitive p{color:#cbd5e1}.primitive pre{background:#0a0d10;border:1px solid #2b3642;border-radius:16px;color:#d9fff7;overflow:auto;padding:16px}table{background:#181f27;border-collapse:collapse;border-radius:18px;overflow:hidden;width:100%}td,th{border-bottom:1px solid #2b3642;padding:12px;text-align:left}</style></head><body><main><p class="eyebrow">Interruption quality</p><h1>${escapeHtml(title)}</h1><p class="status ${escapeHtml(report.status)}">Status: ${escapeHtml(report.status)}</p><section class="metrics"><article><span>Interruptions</span><strong>${String(report.total)}</strong></article><article><span>Avg latency</span><strong>${String(report.averageLatencyMs ?? 0)}ms</strong></article><article><span>Passed</span><strong>${String(report.passed)}</strong></article><article><span>Failed</span><strong>${String(report.failed)}</strong></article></section><section class="primitive"><p class="eyebrow">Copy into your app</p><h2><code>createVoiceBargeInRoutes(...)</code> proves interruption quality</h2><p>Use the shared trace store for browser interrupts, readiness gates, trace timelines, and production evidence instead of trusting a black-box hosted dashboard.</p><pre><code>${escapeHtml(snippet)}</code></pre></section><table><thead><tr><th>Session</th><th>Total</th><th>Passed</th><th>Failed</th><th>Avg latency</th></tr></thead><tbody>${sessions}</tbody></table></main></body></html>`;
};

export const createVoiceBargeInRoutes = (
  options: VoiceBargeInRoutesOptions,
) => {
  const path = options.path ?? "/api/voice-barge-in";
  const htmlPath = options.htmlPath ?? "/barge-in";
  const title = options.title ?? "AbsoluteJS Voice Barge-In";
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-barge-in",
  });

  routes.get(path, async () =>
    summarizeVoiceBargeIn(await options.store.list(), {
      thresholdMs: options.thresholdMs,
    }),
  );
  routes.post(path, async ({ body }) => {
    if (!isBargeInPayload(body)) {
      return Response.json(
        { error: "Invalid barge-in event." },
        { status: 400 },
      );
    }
    await options.store.append({
      at: body.at,
      payload: body as unknown as Record<string, unknown>,
      sessionId: body.sessionId ?? "unknown",
      type: "client.barge_in",
    });
    return Response.json({ ok: true });
  });
  routes.get(htmlPath, async () => {
    const report = summarizeVoiceBargeIn(await options.store.list(), {
      thresholdMs: options.thresholdMs,
    });
    return new Response(renderVoiceBargeInHTML(report, { title }), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...options.headers,
      },
    });
  });

  return routes;
};
