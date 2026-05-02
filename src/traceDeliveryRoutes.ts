import { Elysia } from "elysia";
import {
  summarizeVoiceTraceSinkDeliveries,
  type VoiceTraceSinkDeliveryQueueSummary,
  type VoiceTraceSinkDeliveryWorkerResult,
} from "./queue";
import type {
  VoiceTraceSinkDeliveryQueueStatus,
  VoiceTraceSinkDeliveryRecord,
  VoiceTraceSinkDeliveryStore,
} from "./trace";

export type VoiceTraceDeliveryReport = {
  checkedAt: number;
  deliveries: VoiceTraceSinkDeliveryRecord[];
  filter: VoiceTraceDeliveryFilter;
  summary: VoiceTraceSinkDeliveryQueueSummary;
};

export type VoiceTraceDeliveryDrainWorker = {
  drain: () =>
    | Promise<VoiceTraceSinkDeliveryWorkerResult>
    | VoiceTraceSinkDeliveryWorkerResult;
};

export type VoiceTraceDeliveryDrainReport =
  VoiceTraceSinkDeliveryWorkerResult & {
    drainedAt: number;
  };

export type VoiceTraceDeliveryFilter = {
  limit?: number;
  q?: string;
  status?: VoiceTraceSinkDeliveryQueueStatus | "all";
};

export type VoiceTraceDeliveryRoutesOptions = {
  deadLetters?: VoiceTraceSinkDeliveryStore;
  filter?: VoiceTraceDeliveryFilter;
  headers?: HeadersInit;
  htmlPath?: false | string;
  limit?: number;
  name?: string;
  path?: string;
  render?: (report: VoiceTraceDeliveryReport) => string | Promise<string>;
  store: VoiceTraceSinkDeliveryStore;
  title?: string;
  worker?: VoiceTraceDeliveryDrainWorker;
  workerPath?: false | string;
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

const getNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const parseStatus = (
  value: unknown,
): VoiceTraceDeliveryFilter["status"] | undefined => {
  const text = getString(value);
  return text === "pending" ||
    text === "delivered" ||
    text === "failed" ||
    text === "skipped" ||
    text === "all"
    ? text
    : undefined;
};

export const resolveVoiceTraceDeliveryFilter = (
  query: Record<string, unknown> = {},
  base: VoiceTraceDeliveryFilter = {},
): VoiceTraceDeliveryFilter => ({
  ...base,
  limit: getNumber(query.limit) ?? base.limit,
  q: getString(query.q) ?? base.q,
  status: parseStatus(query.status) ?? base.status,
});

const deliverySearchText = (delivery: VoiceTraceSinkDeliveryRecord) =>
  [
    delivery.id,
    delivery.deliveryStatus,
    delivery.deliveryError,
    ...delivery.events.flatMap((event) => [
      event.id,
      event.type,
      event.sessionId,
      event.traceId,
      event.turnId,
      event.scenarioId,
    ]),
    ...Object.entries(delivery.sinkDeliveries ?? {}).flatMap(
      ([sinkId, result]) => [
        sinkId,
        result.status,
        result.deliveredTo,
        result.error,
      ],
    ),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

const filterDeliveries = (
  deliveries: VoiceTraceSinkDeliveryRecord[],
  filter: VoiceTraceDeliveryFilter,
) => {
  const search = filter.q?.toLowerCase();
  const filtered = deliveries.filter((delivery) => {
    if (
      filter.status &&
      filter.status !== "all" &&
      delivery.deliveryStatus !== filter.status
    ) {
      return false;
    }

    return search ? deliverySearchText(delivery).includes(search) : true;
  });

  return filtered
    .sort(
      (left, right) =>
        right.createdAt - left.createdAt || left.id.localeCompare(right.id),
    )
    .slice(0, filter.limit ?? 50);
};

export const buildVoiceTraceDeliveryReport = async (
  options: VoiceTraceDeliveryRoutesOptions,
  filter: VoiceTraceDeliveryFilter = {},
): Promise<VoiceTraceDeliveryReport> => {
  const resolvedFilter = {
    ...options.filter,
    ...filter,
    limit: filter.limit ?? options.filter?.limit ?? options.limit,
  };
  const deliveries = filterDeliveries(
    await options.store.list(),
    resolvedFilter,
  );
  const summary = await summarizeVoiceTraceSinkDeliveries(deliveries, {
    deadLetters: options.deadLetters,
  });

  return {
    checkedAt: Date.now(),
    deliveries,
    filter: resolvedFilter,
    summary,
  };
};

const renderMetricGrid = (report: VoiceTraceDeliveryReport) =>
  [
    '<section class="grid">',
    `<article><span>Total</span><strong>${String(report.summary.total)}</strong></article>`,
    `<article><span>Pending</span><strong>${String(report.summary.pending)}</strong></article>`,
    `<article><span>Failed</span><strong>${String(report.summary.failed)}</strong></article>`,
    `<article><span>Dead letters</span><strong>${String(report.summary.deadLettered)}</strong></article>`,
    "</section>",
  ].join("");

const renderSinkResults = (delivery: VoiceTraceSinkDeliveryRecord) => {
  const entries = Object.entries(delivery.sinkDeliveries ?? {});
  if (entries.length === 0) {
    return "<p>No sink delivery attempts recorded yet.</p>";
  }

  return `<ul>${entries
    .map(
      ([sinkId, result]) =>
        `<li><strong>${escapeHtml(sinkId)}</strong>: ${escapeHtml(result.status)}${result.deliveredTo ? ` to ${escapeHtml(result.deliveredTo)}` : ""}${result.error ? ` (${escapeHtml(result.error)})` : ""}</li>`,
    )
    .join("")}</ul>`;
};

const renderEventList = (delivery: VoiceTraceSinkDeliveryRecord) =>
  delivery.events.length === 0
    ? "<p>No trace events in this delivery.</p>"
    : `<ul>${delivery.events
        .map(
          (event) =>
            `<li>${escapeHtml(event.type)} <small>${escapeHtml(event.id)}</small>${event.sessionId ? ` session=${escapeHtml(event.sessionId)}` : ""}</li>`,
        )
        .join("")}</ul>`;

export const renderVoiceTraceDeliveryHTML = (
  report: VoiceTraceDeliveryReport,
  options: {
    title?: string;
    workerPath?: false | string;
  } = {},
) => {
  const title = options.title ?? "AbsoluteJS Voice Trace Deliveries";
  const drainAction =
    options.workerPath === false
      ? ""
      : `<form method="post" action="${escapeHtml(options.workerPath ?? "/api/voice-trace-deliveries/drain")}"><button type="submit">Drain trace deliveries</button></form>`;
  const rows = report.deliveries
    .map(
      (delivery) =>
        `<article class="delivery ${escapeHtml(delivery.deliveryStatus)}"><div class="head"><div><span>${escapeHtml(delivery.deliveryStatus)}</span><h2>${escapeHtml(delivery.id)}</h2><p>${escapeHtml(new Date(delivery.createdAt).toLocaleString())}${delivery.deliveredAt ? ` · delivered ${escapeHtml(new Date(delivery.deliveredAt).toLocaleString())}` : ""}</p></div><strong>${String(delivery.deliveryAttempts ?? 0)} attempt(s)</strong></div>${delivery.deliveryError ? `<p class="error">${escapeHtml(delivery.deliveryError)}</p>` : ""}<h3>Sinks</h3>${renderSinkResults(delivery)}<h3>Events</h3>${renderEventList(delivery)}</article>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0f1318;color:#f4efe1;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1120px;padding:32px}.hero{background:linear-gradient(135deg,rgba(34,197,94,.16),rgba(14,165,233,.14));border:1px solid #26313d;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#86efac;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.2rem,5vw,4.8rem);line-height:.92;margin:.2rem 0 1rem}.grid{display:grid;gap:12px;grid-template-columns:repeat(4,1fr);margin-bottom:16px}.grid article,.delivery{background:#151b22;border:1px solid #26313d;border-radius:22px;padding:18px}.grid span,.delivery span{color:#86efac;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.grid strong{display:block;font-size:2rem}.deliveries{display:grid;gap:14px}.delivery.failed{border-color:rgba(239,68,68,.75)}.delivery.pending{border-color:rgba(245,158,11,.7)}.delivery.delivered{border-color:rgba(34,197,94,.55)}.delivery.skipped{border-color:rgba(148,163,184,.6)}.head{align-items:start;display:flex;gap:14px;justify-content:space-between}.delivery h2{font-size:1.05rem;margin:.3rem 0;overflow-wrap:anywhere}.delivery h3{margin:1rem 0 .3rem}.delivery p,.delivery li{color:#c8d0d8}.error{color:#fecaca!important}button{background:#86efac;border:0;border-radius:999px;color:#07111f;cursor:pointer;font-weight:900;margin-top:12px;padding:10px 14px}@media(max-width:760px){main{padding:20px}.grid{grid-template-columns:1fr 1fr}.head{display:block}}</style></head><body><main><section class="hero"><p class="eyebrow">Trace export health</p><h1>${escapeHtml(title)}</h1><p>Checked ${escapeHtml(new Date(report.checkedAt).toLocaleString())}. Showing ${String(report.deliveries.length)} delivery item(s).</p>${drainAction}</section>${renderMetricGrid(report)}<section class="deliveries">${rows || "<p>No trace deliveries match this filter.</p>"}</section></main></body></html>`;
};

export const createVoiceTraceDeliveryJSONHandler =
  (options: VoiceTraceDeliveryRoutesOptions) =>
  async ({ query }: { query?: Record<string, string | undefined> }) =>
    buildVoiceTraceDeliveryReport(
      options,
      resolveVoiceTraceDeliveryFilter(query, options.filter),
    );

export const createVoiceTraceDeliveryHTMLHandler =
  (options: VoiceTraceDeliveryRoutesOptions) =>
  async ({ query }: { query?: Record<string, string | undefined> }) => {
    const report = await buildVoiceTraceDeliveryReport(
      options,
      resolveVoiceTraceDeliveryFilter(query, options.filter),
    );
    const body = await (options.render?.(report) ??
      renderVoiceTraceDeliveryHTML(report, {
        title: options.title,
        workerPath: options.worker ? options.workerPath : false,
      }));

    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...options.headers,
      },
    });
  };

export const createVoiceTraceDeliveryRoutes = (
  options: VoiceTraceDeliveryRoutesOptions,
) => {
  const path = options.path ?? "/api/voice-trace-deliveries";
  const htmlPath =
    options.htmlPath === undefined ? "/traces/deliveries" : options.htmlPath;
  const workerPath =
    options.workerPath === undefined ? `${path}/drain` : options.workerPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-trace-deliveries",
  }).get(path, createVoiceTraceDeliveryJSONHandler(options));

  if (htmlPath !== false) {
    routes.get(htmlPath, createVoiceTraceDeliveryHTMLHandler(options));
  }

  if (options.worker && workerPath !== false) {
    routes.post(workerPath, async () => {
      const result = await options.worker!.drain();

      return {
        ...result,
        drainedAt: Date.now(),
      } satisfies VoiceTraceDeliveryDrainReport;
    });
  }

  return routes;
};
