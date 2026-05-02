import { Elysia } from "elysia";
import {
  summarizeVoiceAuditSinkDeliveries,
  type VoiceAuditSinkDeliveryStore,
  type VoiceAuditSinkDeliveryQueueSummary,
} from "./auditSinks";
import {
  summarizeVoiceTraceSinkDeliveries,
  type VoiceTraceSinkDeliveryQueueSummary,
} from "./queue";
import type { VoiceTraceSinkDeliveryStore } from "./trace";

export type VoiceDeliverySinkKind =
  | "file"
  | "postgres"
  | "s3"
  | "sqlite"
  | "webhook"
  | (string & {});

export type VoiceDeliverySinkDescriptor = {
  description?: string;
  href?: string;
  id: string;
  kind: VoiceDeliverySinkKind;
  label: string;
  mode?: string;
  target?: string;
};

export type VoiceDeliverySinkDescriptorInput = {
  description?: string;
  href?: string;
  id?: string;
  kind: VoiceDeliverySinkKind;
  label?: string;
  mode?: string;
  target?: string;
};

export type VoiceDeliverySinkPairOptions = {
  auditHref?: string;
  auditId?: string;
  auditLabel?: string;
  description?: string;
  kind: VoiceDeliverySinkKind;
  mode?: string;
  target?: string;
  traceHref?: string;
  traceId?: string;
  traceLabel?: string;
};

export type VoiceDeliverySinkReport = {
  auditDeliveries?: VoiceTraceDeliverySinkSurface<VoiceAuditSinkDeliveryQueueSummary>;
  checkedAt: number;
  sinks: VoiceDeliverySinkDescriptor[];
  status: "fail" | "pass" | "warn";
  traceDeliveries?: VoiceTraceDeliverySinkSurface<VoiceTraceSinkDeliveryQueueSummary>;
};

export type VoiceTraceDeliverySinkSurface<TSummary> = {
  href?: string;
  label: string;
  summary: TSummary;
};

export type VoiceDeliverySinkRoutesOptions = {
  auditDeliveries?: {
    href?: string;
    label?: string;
    store: VoiceAuditSinkDeliveryStore;
  };
  headers?: HeadersInit;
  htmlPath?: false | string;
  name?: string;
  path?: string;
  render?: (report: VoiceDeliverySinkReport) => string | Promise<string>;
  sinks?: readonly VoiceDeliverySinkDescriptor[];
  title?: string;
  traceDeliveries?: {
    href?: string;
    label?: string;
    store: VoiceTraceSinkDeliveryStore;
  };
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const deliveryStatus = (summary?: {
  deadLettered: number;
  delivered: number;
  failed: number;
  pending: number;
  total: number;
}) => {
  if (!summary) {
    return "warn" as const;
  }

  if (summary.failed > 0 || summary.deadLettered > 0) {
    return "fail" as const;
  }

  if (summary.total === 0 || summary.pending > 0) {
    return "warn" as const;
  }

  return "pass" as const;
};

const rollupDeliverySinkStatus = (
  report: Pick<VoiceDeliverySinkReport, "auditDeliveries" | "traceDeliveries">,
) => {
  const statuses = [
    deliveryStatus(report.auditDeliveries?.summary),
    deliveryStatus(report.traceDeliveries?.summary),
  ];

  return statuses.includes("fail")
    ? "fail"
    : statuses.includes("warn")
      ? "warn"
      : "pass";
};

const deliverySinkLabel = (kind: VoiceDeliverySinkKind) =>
  `${String(kind).replaceAll(/[-_]+/g, " ")} sink`;

export const createVoiceDeliverySinkDescriptor = (
  input: VoiceDeliverySinkDescriptorInput,
): VoiceDeliverySinkDescriptor => ({
  description: input.description,
  href: input.href,
  id: input.id ?? `${input.kind}-sink`,
  kind: input.kind,
  label: input.label ?? deliverySinkLabel(input.kind),
  mode: input.mode,
  target: input.target,
});

export const createVoiceFileDeliverySink = (
  input: Omit<VoiceDeliverySinkDescriptorInput, "kind"> = {},
) =>
  createVoiceDeliverySinkDescriptor({
    ...input,
    kind: "file",
  });

export const createVoiceWebhookDeliverySink = (
  input: Omit<VoiceDeliverySinkDescriptorInput, "kind"> = {},
) =>
  createVoiceDeliverySinkDescriptor({
    ...input,
    kind: "webhook",
  });

export const createVoiceS3DeliverySink = (
  input: Omit<VoiceDeliverySinkDescriptorInput, "kind"> = {},
) =>
  createVoiceDeliverySinkDescriptor({
    ...input,
    kind: "s3",
  });

export const createVoicePostgresDeliverySink = (
  input: Omit<VoiceDeliverySinkDescriptorInput, "kind"> = {},
) =>
  createVoiceDeliverySinkDescriptor({
    ...input,
    kind: "postgres",
  });

export const createVoiceSQLiteDeliverySink = (
  input: Omit<VoiceDeliverySinkDescriptorInput, "kind"> = {},
) =>
  createVoiceDeliverySinkDescriptor({
    ...input,
    kind: "sqlite",
  });

export const createVoiceDeliverySinkPair = (
  options: VoiceDeliverySinkPairOptions,
): VoiceDeliverySinkDescriptor[] => [
  createVoiceDeliverySinkDescriptor({
    description: options.description,
    href: options.auditHref,
    id: options.auditId ?? `${options.kind}-audit-sink`,
    kind: options.kind,
    label: options.auditLabel ?? `${deliverySinkLabel(options.kind)} audit`,
    mode: options.mode,
    target: options.target,
  }),
  createVoiceDeliverySinkDescriptor({
    description: options.description,
    href: options.traceHref,
    id: options.traceId ?? `${options.kind}-trace-sink`,
    kind: options.kind,
    label: options.traceLabel ?? `${deliverySinkLabel(options.kind)} trace`,
    mode: options.mode,
    target: options.target,
  }),
];

export const buildVoiceDeliverySinkReport = async (
  options: VoiceDeliverySinkRoutesOptions,
): Promise<VoiceDeliverySinkReport> => {
  const [auditSummary, traceSummary] = await Promise.all([
    options.auditDeliveries
      ? Promise.resolve(options.auditDeliveries.store.list()).then(
          (deliveries) => summarizeVoiceAuditSinkDeliveries(deliveries),
        )
      : undefined,
    options.traceDeliveries
      ? Promise.resolve(options.traceDeliveries.store.list()).then(
          (deliveries) => summarizeVoiceTraceSinkDeliveries(deliveries),
        )
      : undefined,
  ]);
  const report = {
    auditDeliveries: auditSummary
      ? {
          href: options.auditDeliveries?.href,
          label: options.auditDeliveries?.label ?? "Audit deliveries",
          summary: auditSummary,
        }
      : undefined,
    checkedAt: Date.now(),
    sinks: [...(options.sinks ?? [])],
    traceDeliveries: traceSummary
      ? {
          href: options.traceDeliveries?.href,
          label: options.traceDeliveries?.label ?? "Trace deliveries",
          summary: traceSummary,
        }
      : undefined,
  };

  return {
    ...report,
    status: rollupDeliverySinkStatus(report),
  };
};

const renderSurfaceCard = (
  surface:
    | VoiceTraceDeliverySinkSurface<{
        delivered: number;
        total: number;
      }>
    | undefined,
) => {
  if (!surface) {
    return "";
  }

  const value = `${surface.summary.delivered}/${surface.summary.total}`;
  const body = `<span>${escapeHtml(surface.label)}</span><strong>${escapeHtml(value)}</strong><p class="muted">Delivered export records.</p>`;

  return `<article>${surface.href ? `<a href="${escapeHtml(surface.href)}">${body}</a>` : body}</article>`;
};

export const renderVoiceDeliverySinkHTML = (
  report: VoiceDeliverySinkReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "AbsoluteJS Voice Delivery Sinks";
  const sinks = report.sinks.length
    ? report.sinks
        .map(
          (sink) =>
            `<article><span>${escapeHtml(sink.kind)}</span><strong style="font-size:1.5rem">${escapeHtml(sink.label)}</strong>${sink.description ? `<p class="muted">${escapeHtml(sink.description)}</p>` : ""}${sink.mode ? `<p class="muted">Mode: ${escapeHtml(sink.mode)}</p>` : ""}${sink.target ? `<p class="muted">Target: <code>${escapeHtml(sink.target)}</code></p>` : ""}${sink.href ? `<p><a href="${escapeHtml(sink.href)}">Open sink</a></p>` : ""}</article>`,
        )
        .join("")
    : '<article><span>Sink</span><strong style="font-size:1.5rem">Not described</strong><p class="muted">Pass sink descriptors to document your file, webhook, S3, SQLite, or Postgres targets.</p></article>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#11120d;color:#fbf7e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{max-width:1120px;margin:auto;padding:32px}a{color:#fde68a;text-decoration:none}.hero{background:linear-gradient(135deg,rgba(253,230,138,.2),rgba(34,197,94,.14));border:1px solid #3a3420;border-radius:30px;margin-bottom:18px;padding:28px}.eyebrow{color:#fde68a;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,4.8rem);line-height:.9;margin:.2rem 0 1rem}.status{border:1px solid #575030;border-radius:999px;display:inline-flex;font-weight:900;padding:8px 12px}.status.pass{border-color:rgba(34,197,94,.65)}.status.warn{border-color:rgba(245,158,11,.65)}.status.fail{border-color:rgba(239,68,68,.75)}.muted{color:#b8b093}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin:18px 0}article,.card{background:#191a13;border:1px solid #33311f;border-radius:22px;padding:18px}article span{color:#b8b093;display:block;font-weight:800}article strong{display:block;font-size:2.4rem;margin-top:8px}pre{background:#0c0d09;border:1px solid #33311f;border-radius:18px;color:#fef3c7;overflow:auto;padding:16px}code{color:#fef3c7}</style></head><body><main><p><a href="/production-readiness">Production readiness</a></p><section class="hero"><p class="eyebrow">Composable sink primitive</p><h1>${escapeHtml(title)}</h1><p class="muted">Delivery queues prove audit and trace exports without owning your infrastructure. Swap file, webhook, S3, SQLite, or Postgres sinks behind the same readiness surface.</p><p class="status ${escapeHtml(report.status)}">Overall: ${escapeHtml(report.status.toUpperCase())}</p><p class="muted">Checked ${escapeHtml(new Date(report.checkedAt).toLocaleString())}</p></section><section class="grid">${renderSurfaceCard(report.auditDeliveries)}${renderSurfaceCard(report.traceDeliveries)}${sinks}</section><section class="card"><h2>Primitive shape</h2><p class="muted">Mount delivery sink routes beside audit and trace delivery queues. Production readiness can consume the same stores for pass/fail evidence.</p><pre>createVoiceDeliverySinkRoutes({
  auditDeliveries: { store: runtimeStorage.auditDeliveries },
  traceDeliveries: { store: runtimeStorage.traceDeliveries },
  sinks: createVoiceDeliverySinkPair({
    kind: "file",
    target: "file://.voice-runtime/voice-demo"
  })
})</pre></section></main></body></html>`;
};

export const createVoiceDeliverySinkRoutes = (
  options: VoiceDeliverySinkRoutesOptions,
) => {
  const path = options.path ?? "/api/voice-delivery-sinks";
  const htmlPath =
    options.htmlPath === undefined ? "/delivery-sinks" : options.htmlPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-delivery-sinks",
  }).get(path, () => buildVoiceDeliverySinkReport(options));

  if (htmlPath !== false) {
    routes.get(htmlPath, async () => {
      const report = await buildVoiceDeliverySinkReport(options);
      const body = await (options.render ?? renderVoiceDeliverySinkHTML)(
        report,
        { title: options.title },
      );

      return new Response(body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  return routes;
};
