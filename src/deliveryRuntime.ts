import { Elysia } from "elysia";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createVoiceAuditHTTPSink,
  createVoiceAuditS3Sink,
  createVoiceAuditSinkDeliveryWorker,
  createVoiceAuditSinkDeliveryWorkerLoop,
  summarizeVoiceAuditSinkDeliveries,
  type VoiceAuditSink,
  type VoiceAuditSinkDeliveryQueueSummary,
  type VoiceAuditSinkDeliveryRecord,
  type VoiceAuditSinkDeliveryStore,
  type VoiceAuditSinkDeliveryWorkerLoop,
  type VoiceAuditSinkDeliveryWorkerOptions,
  type VoiceAuditSinkDeliveryWorkerResult,
  type VoiceS3AuditSinkClient,
} from "./auditSinks";
import {
  createVoiceTraceSinkDeliveryWorker,
  createVoiceTraceSinkDeliveryWorkerLoop,
  summarizeVoiceTraceSinkDeliveries,
  type VoiceRedisTaskLeaseCoordinator,
  type VoiceTraceSinkDeliveryQueueSummary,
  type VoiceTraceSinkDeliveryWorkerLoop,
  type VoiceTraceSinkDeliveryWorkerOptions,
  type VoiceTraceSinkDeliveryWorkerResult,
} from "./queue";
import {
  createVoiceTraceHTTPSink,
  createVoiceTraceS3Sink,
  type StoredVoiceTraceEvent,
  type VoiceS3TraceSinkClient,
  type VoiceTraceSink,
  type VoiceTraceSinkDeliveryRecord,
  type VoiceTraceSinkDeliveryStore,
} from "./trace";
import type { StoredVoiceAuditEvent } from "./audit";

export type VoiceDeliveryRuntimeAuditConfig<
  TDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord,
> = VoiceAuditSinkDeliveryWorkerOptions<TDelivery> & {
  autoStart?: boolean;
  onError?: (error: unknown) => Promise<void> | void;
  pollIntervalMs?: number;
};

export type VoiceDeliveryRuntimeTraceConfig<
  TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord,
> = VoiceTraceSinkDeliveryWorkerOptions<TDelivery> & {
  autoStart?: boolean;
  onError?: (error: unknown) => Promise<void> | void;
  pollIntervalMs?: number;
};

export type VoiceDeliveryRuntimeConfig<
  TAuditDelivery extends VoiceAuditSinkDeliveryRecord =
    VoiceAuditSinkDeliveryRecord,
  TTraceDelivery extends VoiceTraceSinkDeliveryRecord =
    VoiceTraceSinkDeliveryRecord,
> = {
  audit?: VoiceDeliveryRuntimeAuditConfig<TAuditDelivery>;
  trace?: VoiceDeliveryRuntimeTraceConfig<TTraceDelivery>;
};

export type VoiceDeliveryRuntimeTickResult = {
  audit?: VoiceAuditSinkDeliveryWorkerResult;
  trace?: VoiceTraceSinkDeliveryWorkerResult;
};

export type VoiceDeliveryRuntimeRequeueDeadLettersResult = {
  audit: number;
  trace: number;
  total: number;
};

export type VoiceDeliveryRuntimeSummary = {
  audit?: VoiceAuditSinkDeliveryQueueSummary;
  trace?: VoiceTraceSinkDeliveryQueueSummary;
};

export type VoiceDeliveryRuntime = {
  audit?: ReturnType<typeof createVoiceAuditSinkDeliveryWorker>;
  isRunning: () => boolean;
  requeueDeadLetters: () => Promise<VoiceDeliveryRuntimeRequeueDeadLettersResult>;
  start: () => void;
  stop: () => void;
  summarize: () => Promise<VoiceDeliveryRuntimeSummary>;
  tick: () => Promise<VoiceDeliveryRuntimeTickResult>;
  trace?: ReturnType<typeof createVoiceTraceSinkDeliveryWorker>;
};

export type VoiceDeliveryRuntimeReport = {
  checkedAt: number;
  isRunning: boolean;
  summary: VoiceDeliveryRuntimeSummary;
};

export type VoiceDeliveryRuntimeRoutesOptions = {
  headers?: HeadersInit;
  htmlPath?: false | string;
  name?: string;
  path?: string;
  render?: (
    report: VoiceDeliveryRuntimeReport,
    options: {
      requeueDeadLettersPath?: false | string;
      tickPath?: false | string;
      title?: string;
    },
  ) => string | Promise<string>;
  runtime: VoiceDeliveryRuntime;
  requeueDeadLettersPath?: false | string;
  tickPath?: false | string;
  title?: string;
};

export type VoiceDeliveryRuntimePresetMode = "file" | "s3" | "webhook";

export type VoiceDeliveryRuntimePresetLeaseConfig =
  | VoiceRedisTaskLeaseCoordinator
  | {
      audit: VoiceRedisTaskLeaseCoordinator;
      trace: VoiceRedisTaskLeaseCoordinator;
    };

export type VoiceDeliveryRuntimePresetBaseOptions = {
  auditDeliveries: VoiceAuditSinkDeliveryStore;
  auditSinkId?: string;
  auditWorkerId?: string;
  autoStart?: boolean;
  failures?: {
    maxFailures?: number;
  };
  leases: VoiceDeliveryRuntimePresetLeaseConfig;
  pollIntervalMs?: number;
  traceDeliveries: VoiceTraceSinkDeliveryStore;
  traceSinkId?: string;
  traceWorkerId?: string;
};

export type VoiceDeliveryRuntimeWebhookPresetOptions =
  VoiceDeliveryRuntimePresetBaseOptions & {
    backoffMs?: number;
    body?: {
      audit?: (input: {
        events: StoredVoiceAuditEvent[];
      }) => Promise<Record<string, unknown>> | Record<string, unknown>;
      trace?: (input: {
        events: StoredVoiceTraceEvent[];
      }) => Promise<Record<string, unknown>> | Record<string, unknown>;
    };
    fetch?: typeof fetch;
    headers?: Record<string, string>;
    mode: "webhook";
    retries?: number;
    signingSecret?: string;
    timeoutMs?: number;
    url: string;
  };

export type VoiceDeliveryRuntimeS3PresetOptions =
  VoiceDeliveryRuntimePresetBaseOptions & {
    bucket?: string;
    client?: VoiceS3AuditSinkClient & VoiceS3TraceSinkClient;
    keyPrefix?: string;
    mode: "s3";
  };

export type VoiceDeliveryRuntimeFilePresetOptions =
  VoiceDeliveryRuntimePresetBaseOptions & {
    directory: string;
    mode: "file";
  };

export type VoiceDeliveryRuntimePresetOptions =
  | VoiceDeliveryRuntimeFilePresetOptions
  | VoiceDeliveryRuntimeS3PresetOptions
  | VoiceDeliveryRuntimeWebhookPresetOptions;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderSummaryCard = (
  label: string,
  summary:
    | VoiceAuditSinkDeliveryQueueSummary
    | VoiceTraceSinkDeliveryQueueSummary
    | undefined,
) => {
  if (!summary) {
    return `<article><span>${escapeHtml(label)}</span><strong>Disabled</strong><p class="muted">No worker configured.</p></article>`;
  }

  return `<article><span>${escapeHtml(label)}</span><strong>${String(summary.delivered)}/${String(summary.total)}</strong><p class="muted">${String(summary.pending)} pending &middot; ${String(summary.failed)} failed &middot; ${String(summary.deadLettered)} dead-lettered</p></article>`;
};

const resolvePresetLeases = (leases: VoiceDeliveryRuntimePresetLeaseConfig) =>
  "claim" in leases
    ? {
        audit: leases,
        trace: leases,
      }
    : leases;

const requeueDelivery = <
  TDelivery extends VoiceAuditSinkDeliveryRecord | VoiceTraceSinkDeliveryRecord,
>(
  delivery: TDelivery,
): TDelivery =>
  ({
    ...delivery,
    deliveredAt: undefined,
    deliveryAttempts: 0,
    deliveryError: undefined,
    deliveryStatus: "pending",
    sinkDeliveries: undefined,
    updatedAt: Date.now(),
  }) as TDelivery;

const createDeliveryRuntimeFileSink = <TEvent extends { id: string }>(input: {
  directory: string;
  id: string;
  kind: "audit" | "trace";
}): {
  deliver: (delivery: { events: TEvent[] }) => Promise<{
    attempts: number;
    deliveredAt: number;
    deliveredTo: string;
    eventCount: number;
    responseBody: { path: string };
    status: "delivered";
  }>;
  id: string;
  kind: string;
} => ({
  deliver: async ({ events }) => {
    const firstEvent = events[0];
    const fileName = `${Date.now()}-${encodeURIComponent(firstEvent?.id ?? crypto.randomUUID())}.json`;
    const path = join(input.directory, input.kind, fileName);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(
      path,
      JSON.stringify(
        {
          eventCount: events.length,
          events,
          source: "absolutejs-voice",
        },
        null,
        2,
      ),
    );

    return {
      attempts: 1,
      deliveredAt: Date.now(),
      deliveredTo: `file://${path}`,
      eventCount: events.length,
      responseBody: { path },
      status: "delivered",
    };
  },
  id: input.id,
  kind: "file",
});

const createPresetSinks = (
  options: VoiceDeliveryRuntimePresetOptions,
): { audit: VoiceAuditSink; trace: VoiceTraceSink } => {
  const auditSinkId = options.auditSinkId ?? `voice-${options.mode}-audit-sink`;
  const traceSinkId = options.traceSinkId ?? `voice-${options.mode}-trace-sink`;

  if (options.mode === "webhook") {
    return {
      audit: createVoiceAuditHTTPSink({
        backoffMs: options.backoffMs,
        body: options.body?.audit,
        fetch: options.fetch,
        headers: options.headers,
        id: auditSinkId,
        retries: options.retries,
        signingSecret: options.signingSecret,
        timeoutMs: options.timeoutMs,
        url: options.url,
      }),
      trace: createVoiceTraceHTTPSink({
        backoffMs: options.backoffMs,
        body: options.body?.trace,
        fetch: options.fetch,
        headers: options.headers,
        id: traceSinkId,
        retries: options.retries,
        signingSecret: options.signingSecret,
        timeoutMs: options.timeoutMs,
        url: options.url,
      }),
    };
  }

  if (options.mode === "s3") {
    return {
      audit: createVoiceAuditS3Sink({
        bucket: options.bucket,
        client: options.client,
        id: auditSinkId,
        keyPrefix: `${options.keyPrefix ?? "voice/deliveries"}/audit`,
      }),
      trace: createVoiceTraceS3Sink({
        bucket: options.bucket,
        client: options.client,
        id: traceSinkId,
        keyPrefix: `${options.keyPrefix ?? "voice/deliveries"}/trace`,
      }),
    };
  }

  return {
    audit: createDeliveryRuntimeFileSink<StoredVoiceAuditEvent>({
      directory: options.directory,
      id: auditSinkId,
      kind: "audit",
    }),
    trace: createDeliveryRuntimeFileSink<StoredVoiceTraceEvent>({
      directory: options.directory,
      id: traceSinkId,
      kind: "trace",
    }),
  };
};

export const createVoiceDeliveryRuntimePresetConfig = (
  options: VoiceDeliveryRuntimePresetOptions,
): VoiceDeliveryRuntimeConfig => {
  const leases = resolvePresetLeases(options.leases);
  const sinks = createPresetSinks(options);

  return {
    audit: {
      autoStart: options.autoStart,
      deliveries: options.auditDeliveries,
      leases: leases.audit,
      maxFailures: options.failures?.maxFailures,
      pollIntervalMs: options.pollIntervalMs,
      sinks: [sinks.audit],
      workerId: options.auditWorkerId ?? `voice-${options.mode}-audit-worker`,
    },
    trace: {
      autoStart: options.autoStart,
      deliveries: options.traceDeliveries,
      leases: leases.trace,
      maxFailures: options.failures?.maxFailures,
      pollIntervalMs: options.pollIntervalMs,
      sinks: [sinks.trace],
      workerId: options.traceWorkerId ?? `voice-${options.mode}-trace-worker`,
    },
  };
};

export const createVoiceDeliveryRuntime = <
  TAuditDelivery extends VoiceAuditSinkDeliveryRecord =
    VoiceAuditSinkDeliveryRecord,
  TTraceDelivery extends VoiceTraceSinkDeliveryRecord =
    VoiceTraceSinkDeliveryRecord,
>(
  config: VoiceDeliveryRuntimeConfig<TAuditDelivery, TTraceDelivery>,
): VoiceDeliveryRuntime => {
  const audit = config.audit
    ? createVoiceAuditSinkDeliveryWorker(config.audit)
    : undefined;
  const trace = config.trace
    ? createVoiceTraceSinkDeliveryWorker(config.trace)
    : undefined;
  let auditLoop: VoiceAuditSinkDeliveryWorkerLoop | undefined;
  let traceLoop: VoiceTraceSinkDeliveryWorkerLoop | undefined;

  if (audit && config.audit) {
    auditLoop = createVoiceAuditSinkDeliveryWorkerLoop({
      onError: config.audit.onError,
      pollIntervalMs: config.audit.pollIntervalMs,
      worker: audit,
    });
  }

  if (trace && config.trace) {
    traceLoop = createVoiceTraceSinkDeliveryWorkerLoop({
      onError: config.trace.onError,
      pollIntervalMs: config.trace.pollIntervalMs,
      worker: trace,
    });
  }

  return {
    audit,
    isRunning: () => Boolean(auditLoop?.isRunning() || traceLoop?.isRunning()),
    requeueDeadLetters: async () => {
      let audit = 0;
      let trace = 0;

      if (config.audit?.deadLetters) {
        for (const delivery of await config.audit.deadLetters.list()) {
          await config.audit.deliveries.set(
            delivery.id,
            requeueDelivery(delivery),
          );
          await config.audit.deadLetters.remove(delivery.id);
          audit += 1;
        }
      }

      if (config.trace?.deadLetters) {
        for (const delivery of await config.trace.deadLetters.list()) {
          await config.trace.deliveries.set(
            delivery.id,
            requeueDelivery(delivery),
          );
          await config.trace.deadLetters.remove(delivery.id);
          trace += 1;
        }
      }

      return {
        audit,
        trace,
        total: audit + trace,
      };
    },
    start: () => {
      if (config.audit?.autoStart) {
        auditLoop?.start();
      }
      if (config.trace?.autoStart) {
        traceLoop?.start();
      }
    },
    stop: () => {
      auditLoop?.stop();
      traceLoop?.stop();
    },
    summarize: async () => {
      const summary: VoiceDeliveryRuntimeSummary = {};
      if (config.audit) {
        summary.audit = await summarizeVoiceAuditSinkDeliveries(
          await config.audit.deliveries.list(),
          {
            deadLetters: config.audit.deadLetters as
              | VoiceAuditSinkDeliveryStore<VoiceAuditSinkDeliveryRecord>
              | undefined,
          },
        );
      }
      if (config.trace) {
        summary.trace = await summarizeVoiceTraceSinkDeliveries(
          await config.trace.deliveries.list(),
          {
            deadLetters: config.trace.deadLetters as
              | VoiceTraceSinkDeliveryStore<VoiceTraceSinkDeliveryRecord>
              | undefined,
          },
        );
      }

      return summary;
    },
    tick: async () => {
      const result: VoiceDeliveryRuntimeTickResult = {};
      if (auditLoop) {
        result.audit = await auditLoop.tick();
      }
      if (traceLoop) {
        result.trace = await traceLoop.tick();
      }

      return result;
    },
    trace,
  };
};

export const buildVoiceDeliveryRuntimeReport = async (
  runtime: VoiceDeliveryRuntime,
): Promise<VoiceDeliveryRuntimeReport> => ({
  checkedAt: Date.now(),
  isRunning: runtime.isRunning(),
  summary: await runtime.summarize(),
});

export const renderVoiceDeliveryRuntimeHTML = (
  report: VoiceDeliveryRuntimeReport,
  options: {
    requeueDeadLettersPath?: false | string;
    tickPath?: false | string;
    title?: string;
  } = {},
) => {
  const title = options.title ?? "AbsoluteJS Voice Delivery Runtime";
  const tickForm =
    options.tickPath === false
      ? ""
      : `<form method="post" action="${escapeHtml(options.tickPath ?? "/api/voice-delivery-runtime/tick")}"><button type="submit">Tick delivery workers</button></form>`;
  const requeueForm =
    options.requeueDeadLettersPath === false
      ? ""
      : `<form method="post" action="${escapeHtml(options.requeueDeadLettersPath ?? "/api/voice-delivery-runtime/requeue-dead-letters")}"><button type="submit">Requeue dead letters</button></form>`;
  const snippet =
    escapeHtml(`const deliveryRuntime = createVoiceDeliveryRuntime(
	createVoiceDeliveryRuntimePresetConfig({
		audit: {
			deliveries: runtimeStorage.auditDeliveries,
			leases: runtimeStorage.auditDeliveryLeases,
			sinks: [auditSink],
			workerId: 'voice-audit-delivery'
		},
		trace: {
			deliveries: runtimeStorage.traceDeliveries,
			leases: runtimeStorage.traceDeliveryLeases,
			sinks: [traceSink],
			workerId: 'voice-trace-delivery'
		}
	})
);

app.use(createVoiceDeliveryRuntimeRoutes({ runtime: deliveryRuntime }));

app.use(
	createVoiceProductionReadinessRoutes({
		deliveryRuntime,
		auditDeliveries: runtimeStorage.auditDeliveries,
		traceDeliveries: runtimeStorage.traceDeliveries
	})
);`);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0f1411;color:#f7f2df;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1080px;padding:32px}a{color:#86efac;text-decoration:none}.hero{background:linear-gradient(135deg,rgba(34,197,94,.18),rgba(14,165,233,.13));border:1px solid #263a30;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#86efac;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.2rem,5vw,4.8rem);line-height:.92;margin:.2rem 0 1rem}.status{border:1px solid #64748b;border-radius:999px;display:inline-flex;font-weight:900;padding:8px 12px}.status.running{border-color:rgba(34,197,94,.7);color:#bbf7d0}.muted{color:#b9c3b4}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin:18px 0}article,.card{background:#151d18;border:1px solid #263a30;border-radius:22px;padding:18px}.primitive{background:#111a15;border-color:#41604a}article span{color:#b9c3b4;display:block;font-weight:800}article strong{display:block;font-size:2.3rem;margin-top:8px}.actions{display:flex;flex-wrap:wrap;gap:10px}button{background:#86efac;border:0;border-radius:999px;color:#07120b;cursor:pointer;font-weight:900;margin-top:12px;padding:10px 14px}pre{background:#09100c;border:1px solid #263a30;border-radius:18px;color:#dcfce7;overflow:auto;padding:16px}.primitive p{color:#c8d8ca;line-height:1.55}.primitive code{color:#bbf7d0}</style></head><body><main><p><a href="/delivery-sinks">Delivery sinks</a></p><section class="hero"><p class="eyebrow">Worker control plane</p><h1>${escapeHtml(title)}</h1><p class="muted">Inspect queue summaries, manually tick failed/pending audit and trace deliveries, and requeue dead letters after operator review.</p><p class="status ${report.isRunning ? "running" : ""}">${report.isRunning ? "Running" : "Stopped"}</p><p class="muted">Checked ${escapeHtml(new Date(report.checkedAt).toLocaleString())}</p><div class="actions">${tickForm}${requeueForm}</div></section><section class="grid">${renderSummaryCard("Audit", report.summary.audit)}${renderSummaryCard("Trace", report.summary.trace)}</section><section class="card primitive"><p class="eyebrow">Copy into your app</p><h2><code>createVoiceDeliveryRuntimeRoutes(...)</code> builds this control plane</h2><p>Own the audit and trace delivery queues in your app, mount one runtime route group, and pass the same runtime into production readiness so failed or dead-lettered exports block deploys.</p><pre><code>${snippet}</code></pre></section></main></body></html>`;
};

export const createVoiceDeliveryRuntimeRoutes = (
  options: VoiceDeliveryRuntimeRoutesOptions,
) => {
  const path = options.path ?? "/api/voice-delivery-runtime";
  const htmlPath =
    options.htmlPath === undefined ? "/delivery-runtime" : options.htmlPath;
  const tickPath =
    options.tickPath === undefined
      ? "/api/voice-delivery-runtime/tick"
      : options.tickPath;
  const requeueDeadLettersPath =
    options.requeueDeadLettersPath === undefined
      ? "/api/voice-delivery-runtime/requeue-dead-letters"
      : options.requeueDeadLettersPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-delivery-runtime",
  }).get(path, () => buildVoiceDeliveryRuntimeReport(options.runtime));

  if (tickPath !== false) {
    routes.post(tickPath, async () => ({
      drainedAt: Date.now(),
      result: await options.runtime.tick(),
      summary: await options.runtime.summarize(),
    }));
  }

  if (requeueDeadLettersPath !== false) {
    routes.post(requeueDeadLettersPath, async () => ({
      requeuedAt: Date.now(),
      result: await options.runtime.requeueDeadLetters(),
      summary: await options.runtime.summarize(),
    }));
  }

  if (htmlPath !== false) {
    routes.get(htmlPath, async () => {
      const report = await buildVoiceDeliveryRuntimeReport(options.runtime);
      const body = await (options.render ?? renderVoiceDeliveryRuntimeHTML)(
        report,
        {
          tickPath,
          requeueDeadLettersPath,
          title: options.title,
        },
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
