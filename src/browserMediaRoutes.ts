import { Elysia } from "elysia";
import type {
  MediaPipelineCalibrationIssue,
  MediaWebRTCStatsReport,
  MediaWebRTCStreamContinuityReport,
} from "@absolutejs/media";
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from "./trace";

export type VoiceBrowserMediaStatus = "empty" | "fail" | "pass" | "warn";

export type VoiceBrowserMediaSample = {
  at: number;
  continuity?: MediaWebRTCStreamContinuityReport;
  report: MediaWebRTCStatsReport;
  scenarioId?: string;
  sessionId: string;
  traceId?: string;
};

export type VoiceBrowserMediaReport = {
  checkedAt: number;
  latest?: VoiceBrowserMediaSample;
  recent: VoiceBrowserMediaSample[];
  status: VoiceBrowserMediaStatus;
  stale: boolean;
  total: number;
};

export type VoiceBrowserMediaRoutesOptions = {
  headers?: HeadersInit;
  htmlPath?: false | string;
  maxAgeMs?: number;
  name?: string;
  path?: string;
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

const isMediaWebRTCStatsReport = (
  value: unknown,
): value is MediaWebRTCStatsReport => {
  const report = value as Partial<MediaWebRTCStatsReport> | undefined;

  return (
    !!report &&
    typeof report === "object" &&
    (report.status === "pass" ||
      report.status === "warn" ||
      report.status === "fail") &&
    typeof report.activeCandidatePairs === "number" &&
    typeof report.liveAudioTracks === "number" &&
    typeof report.packetLossRatio === "number" &&
    typeof report.bytesReceived === "number" &&
    typeof report.bytesSent === "number" &&
    Array.isArray(report.issues)
  );
};

const isMediaWebRTCStreamContinuityReport = (
  value: unknown,
): value is MediaWebRTCStreamContinuityReport => {
  const report = value as
    | Partial<MediaWebRTCStreamContinuityReport>
    | undefined;

  return (
    !!report &&
    typeof report === "object" &&
    (report.status === "pass" ||
      report.status === "warn" ||
      report.status === "fail") &&
    typeof report.inboundAudioStreams === "number" &&
    typeof report.outboundAudioStreams === "number" &&
    typeof report.stalledInboundStreams === "number" &&
    typeof report.stalledOutboundStreams === "number" &&
    Array.isArray(report.issues) &&
    Array.isArray(report.streams)
  );
};

const isBrowserMediaPostBody = (
  value: unknown,
): value is {
  at?: number;
  report: MediaWebRTCStatsReport;
  continuity?: MediaWebRTCStreamContinuityReport;
  scenarioId?: string | null;
  sessionId?: string | null;
} => {
  const body = value as
    | {
        report?: unknown;
        scenarioId?: unknown;
        sessionId?: unknown;
      }
    | undefined;

  return !!body && isMediaWebRTCStatsReport(body.report);
};

const mergeIssues = (
  report: MediaWebRTCStatsReport,
  continuity?: MediaWebRTCStreamContinuityReport,
): MediaWebRTCStatsReport => {
  if (!continuity) {
    return report;
  }

  const issues = [
    ...report.issues,
    ...(continuity.issues as MediaPipelineCalibrationIssue[]),
  ];
  const status =
    report.status === "fail" || continuity.status === "fail"
      ? "fail"
      : report.status === "warn" || continuity.status === "warn"
        ? "warn"
        : "pass";

  return {
    ...report,
    issues,
    status,
  };
};

const toBrowserMediaSample = (
  event: StoredVoiceTraceEvent,
): VoiceBrowserMediaSample | undefined => {
  if (
    event.type !== "client.browser_media" ||
    !isMediaWebRTCStatsReport(event.payload.report)
  ) {
    return undefined;
  }

  return {
    at: event.at,
    continuity: isMediaWebRTCStreamContinuityReport(event.payload.continuity)
      ? event.payload.continuity
      : undefined,
    report: event.payload.report,
    scenarioId: event.scenarioId,
    sessionId: event.sessionId,
    traceId: event.traceId,
  };
};

export const summarizeVoiceBrowserMedia = async (
  options: Pick<VoiceBrowserMediaRoutesOptions, "maxAgeMs" | "store">,
): Promise<VoiceBrowserMediaReport> => {
  const events = await options.store.list({
    limit: 100,
    type: "client.browser_media",
  });
  const recent = events
    .map(toBrowserMediaSample)
    .filter((sample): sample is VoiceBrowserMediaSample => !!sample)
    .sort((left, right) => right.at - left.at);
  const latest = recent[0];
  const maxAgeMs = options.maxAgeMs ?? 30_000;
  const stale = latest ? Date.now() - latest.at > maxAgeMs : false;
  const latestReport = latest
    ? mergeIssues(latest.report, latest.continuity)
    : undefined;

  return {
    checkedAt: Date.now(),
    latest,
    recent,
    stale,
    status: latest
      ? latestReport?.status === "pass" && !stale
        ? "pass"
        : stale
          ? "warn"
          : (latestReport?.status ?? latest.report.status)
      : "empty",
    total: recent.length,
  };
};

export const getLatestVoiceBrowserMediaReport = async (
  options: Pick<VoiceBrowserMediaRoutesOptions, "maxAgeMs" | "store">,
): Promise<MediaWebRTCStatsReport | undefined> => {
  const summary = await summarizeVoiceBrowserMedia(options);

  return summary.latest
    ? mergeIssues(summary.latest.report, summary.latest.continuity)
    : undefined;
};

export const renderVoiceBrowserMediaHTML = (
  report: VoiceBrowserMediaReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Browser Media";
  const latest = report.latest?.report;
  const latestContinuity = report.latest?.continuity;
  const rows = report.recent
    .slice(0, 20)
    .map((sample) => {
      const stalledStreams =
        (sample.continuity?.stalledInboundStreams ?? 0) +
        (sample.continuity?.stalledOutboundStreams ?? 0);

      return `<tr><td>${escapeHtml(sample.sessionId)}</td><td>${escapeHtml(mergeIssues(sample.report, sample.continuity).status)}</td><td>${String(sample.report.activeCandidatePairs)}</td><td>${String(sample.report.liveAudioTracks)}</td><td>${String(sample.continuity?.inboundAudioStreams ?? "n/a")}</td><td>${String(sample.continuity?.outboundAudioStreams ?? "n/a")}</td><td>${String(stalledStreams)}</td><td>${String(sample.report.roundTripTimeMs ?? "n/a")}ms</td><td>${String(sample.report.jitterMs ?? "n/a")}ms</td><td>${String(sample.report.packetLossRatio)}</td><td>${escapeHtml(new Date(sample.at).toLocaleString())}</td></tr>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0f172a;color:#e2e8f0;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1120px;padding:32px}.hero,.primitive,table{background:#111827;border:1px solid #334155;border-radius:22px;margin-bottom:16px}.hero,.primitive{padding:22px}.eyebrow{color:#93c5fd;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,4.8rem);line-height:.92;margin:.2rem 0 1rem}.status{border:1px solid #64748b;border-radius:999px;display:inline-flex;font-weight:900;padding:8px 12px}.pass{color:#86efac}.warn,.empty{color:#fde68a}.fail{color:#fecaca}.metrics{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-top:18px}.metric{background:#0b1220;border:1px solid #263244;border-radius:16px;padding:14px}.metric span{color:#94a3b8}.metric strong{display:block;font-size:1.7rem;margin-top:4px}.primitive code{color:#bfdbfe}table{border-collapse:collapse;overflow:hidden;width:100%}td,th{border-bottom:1px solid #334155;padding:10px;text-align:left}</style></head><body><main><section class="hero"><p class="eyebrow">Browser WebRTC media proof</p><h1>${escapeHtml(title)}</h1><p class="status ${escapeHtml(report.status)}">Status: ${escapeHtml(report.status)}</p><p>Recent <code>client.browser_media</code> traces from browser <code>RTCPeerConnection.getStats()</code> reports, including aggregate transport stats and per-stream continuity.</p><section class="metrics"><div class="metric"><span>Reports</span><strong>${String(report.total)}</strong></div><div class="metric"><span>Candidate pairs</span><strong>${String(latest?.activeCandidatePairs ?? 0)}</strong></div><div class="metric"><span>Live audio tracks</span><strong>${String(latest?.liveAudioTracks ?? 0)}</strong></div><div class="metric"><span>Inbound streams</span><strong>${String(latestContinuity?.inboundAudioStreams ?? "n/a")}</strong></div><div class="metric"><span>Outbound streams</span><strong>${String(latestContinuity?.outboundAudioStreams ?? "n/a")}</strong></div><div class="metric"><span>Stalled streams</span><strong>${String((latestContinuity?.stalledInboundStreams ?? 0) + (latestContinuity?.stalledOutboundStreams ?? 0))}</strong></div><div class="metric"><span>RTT</span><strong>${String(latest?.roundTripTimeMs ?? "n/a")}ms</strong></div><div class="metric"><span>Jitter</span><strong>${String(latest?.jitterMs ?? "n/a")}ms</strong></div><div class="metric"><span>Loss</span><strong>${String(latest?.packetLossRatio ?? "n/a")}</strong></div></section></section><section class="primitive"><p class="eyebrow">Copy into your app</p><p><code>createVoiceBrowserMediaReporter({ peerConnection, continuity })</code> runs in the browser and posts reports here. <code>getLatestVoiceBrowserMediaReport(...)</code> can feed production readiness with aggregate and continuity issues merged.</p></section><table><thead><tr><th>Session</th><th>Status</th><th>Pairs</th><th>Tracks</th><th>Inbound</th><th>Outbound</th><th>Stalled</th><th>RTT</th><th>Jitter</th><th>Loss</th><th>Measured</th></tr></thead><tbody>${rows || '<tr><td colspan="11">No browser media reports yet.</td></tr>'}</tbody></table></main></body></html>`;
};

export const createVoiceBrowserMediaRoutes = (
  options: VoiceBrowserMediaRoutesOptions,
) => {
  const path = options.path ?? "/api/voice/browser-media";
  const htmlPath =
    options.htmlPath === undefined ? "/voice/browser-media" : options.htmlPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-browser-media",
  });

  routes.get(path, () => summarizeVoiceBrowserMedia(options));
  routes.post(path, async ({ body }) => {
    if (!isBrowserMediaPostBody(body)) {
      return Response.json(
        { error: "Invalid browser media report." },
        { status: 400 },
      );
    }

    await options.store.append({
      at: typeof body.at === "number" ? body.at : Date.now(),
      payload: {
        continuity: isMediaWebRTCStreamContinuityReport(body.continuity)
          ? body.continuity
          : undefined,
        report: body.report,
      },
      scenarioId:
        typeof body.scenarioId === "string" ? body.scenarioId : undefined,
      sessionId:
        typeof body.sessionId === "string" ? body.sessionId : "unknown",
      type: "client.browser_media",
    });

    return Response.json({ ok: true });
  });

  if (htmlPath) {
    routes.get(htmlPath, async () => {
      const report = await summarizeVoiceBrowserMedia(options);

      return new Response(renderVoiceBrowserMediaHTML(report, options), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  return routes;
};
