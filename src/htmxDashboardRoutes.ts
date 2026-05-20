import { Elysia } from "elysia";
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from "./trace";
import type {
  StoredVoiceCallReviewArtifact,
  VoiceCallReviewArtifact,
  VoiceCallReviewStore,
} from "./testing/review";
import type { LiveCallViewer } from "./client/liveCallViewer";
import {
  renderVoiceCostDashboardFromEvents,
  renderVoiceLiveCallViewerFromViewer,
  renderVoiceReplayTimelineFromArtifact,
  resolveVoiceDashboardRenderers,
  type VoiceDashboardHTMXAttributes,
  type VoiceDashboardHTMXRendererConfig,
} from "./client/htmxDashboardRenderers";
import type { VoiceCostDashboardOptions } from "./client/costDashboard";

const HTML_HEADERS = { "content-type": "text/html; charset=utf-8" };

export type VoiceHTMXDashboardRoutesShared = {
  name?: string;
  render?: VoiceDashboardHTMXRendererConfig;
};

export type VoiceHTMXCostDashboardRoutesOptions =
  VoiceHTMXDashboardRoutesShared & {
    bucketBy?: VoiceCostDashboardOptions["bucketBy"];
    currency?: string;
    fromMs?: () => number | undefined;
    path?: string;
    pollIntervalMs?: number;
    resolveEvents: () =>
      | Promise<ReadonlyArray<StoredVoiceTraceEvent>>
      | ReadonlyArray<StoredVoiceTraceEvent>;
    title?: string;
    toMs?: () => number | undefined;
  };

export const createVoiceCostDashboardHTMXRoute = (
  options: VoiceHTMXCostDashboardRoutesOptions,
) => {
  const renderers = resolveVoiceDashboardRenderers(options.render);
  const path = options.path ?? "/voice/htmx/cost-dashboard";
  return new Elysia({ name: options.name ?? "voice-cost-dashboard-htmx" }).get(
    path,
    async () => {
      const events = await Promise.resolve(options.resolveEvents());
      const attributes: VoiceDashboardHTMXAttributes = {
        poll: typeof options.pollIntervalMs === "number",
        pollIntervalMs: options.pollIntervalMs,
        refreshUrl: path,
      };
      const html = renderVoiceCostDashboardFromEvents({
        attributes,
        currency: options.currency,
        events,
        options: {
          bucketBy: options.bucketBy,
          fromMs: options.fromMs?.(),
          toMs: options.toMs?.(),
        },
        renderer: renderers.costDashboard,
        title: options.title,
      });
      return new Response(html, { headers: HTML_HEADERS });
    },
  );
};

export type VoiceHTMXReplayTimelineRoutesOptions =
  VoiceHTMXDashboardRoutesShared & {
    /** The HTML route mounts at `${path}/:artifactId`. */
    path?: string;
    resolveArtifact: (
      artifactId: string,
    ) =>
      | Promise<StoredVoiceCallReviewArtifact | undefined>
      | StoredVoiceCallReviewArtifact
      | undefined;
    title?: string;
  };

export const createVoiceReplayTimelineHTMXRoute = (
  options: VoiceHTMXReplayTimelineRoutesOptions,
) => {
  const renderers = resolveVoiceDashboardRenderers(options.render);
  const basePath = options.path ?? "/voice/htmx/replay";
  return new Elysia({
    name: options.name ?? "voice-replay-timeline-htmx",
  }).get(`${basePath}/:artifactId`, async ({ params, set }) => {
    const { artifactId } = params as { artifactId: string };
    const artifact = await Promise.resolve(options.resolveArtifact(artifactId));
    if (!artifact) {
      set.status = 404;
      return new Response(
        `<div class="absolute-voice-replay-timeline" data-status="not-found" style="background:#0f172a;color:#f8fafc;padding:20px;border-radius:16px;">Replay artifact not found.</div>`,
        { headers: HTML_HEADERS, status: 404 },
      );
    }
    const html = renderVoiceReplayTimelineFromArtifact({
      artifact: artifact as VoiceCallReviewArtifact,
      renderer: renderers.replayTimeline,
      title: options.title,
    });
    return new Response(html, { headers: HTML_HEADERS });
  });
};

export type VoiceHTMXLiveCallViewerRoutesOptions =
  VoiceHTMXDashboardRoutesShared & {
    /** Route mounts at `${path}/:sessionId`. */
    path?: string;
    pollIntervalMs?: number;
    resolveViewer: (
      sessionId: string,
    ) => Promise<LiveCallViewer | undefined> | LiveCallViewer | undefined;
    title?: string;
  };

export const createVoiceLiveCallViewerHTMXRoute = (
  options: VoiceHTMXLiveCallViewerRoutesOptions,
) => {
  const renderers = resolveVoiceDashboardRenderers(options.render);
  const basePath = options.path ?? "/voice/htmx/live";
  return new Elysia({
    name: options.name ?? "voice-live-call-viewer-htmx",
  }).get(`${basePath}/:sessionId`, async ({ params, set }) => {
    const { sessionId } = params as { sessionId: string };
    const viewer = await Promise.resolve(options.resolveViewer(sessionId));
    if (!viewer) {
      set.status = 404;
      return new Response(
        `<div class="absolute-voice-live-call-viewer" data-status="not-found" style="background:#0f172a;color:#f8fafc;padding:20px;border-radius:16px;">No active call for ${sessionId}.</div>`,
        { headers: HTML_HEADERS, status: 404 },
      );
    }
    const attributes: VoiceDashboardHTMXAttributes = {
      poll: typeof options.pollIntervalMs === "number",
      pollIntervalMs: options.pollIntervalMs,
      refreshUrl: `${basePath}/${sessionId}`,
    };
    const html = renderVoiceLiveCallViewerFromViewer({
      attributes,
      renderer: renderers.liveCallViewer,
      title: options.title,
      viewer,
    });
    return new Response(html, { headers: HTML_HEADERS });
  });
};

export type VoiceHTMXDashboardRoutesOptions = {
  cost?: Omit<
    VoiceHTMXCostDashboardRoutesOptions,
    keyof VoiceHTMXDashboardRoutesShared
  >;
  liveCall?: Omit<
    VoiceHTMXLiveCallViewerRoutesOptions,
    keyof VoiceHTMXDashboardRoutesShared
  >;
  name?: string;
  render?: VoiceDashboardHTMXRendererConfig;
  replay?: Omit<
    VoiceHTMXReplayTimelineRoutesOptions,
    keyof VoiceHTMXDashboardRoutesShared
  >;
};

export const createVoiceHTMXDashboardRoutes = (
  options: VoiceHTMXDashboardRoutesOptions,
) => {
  let app = new Elysia({ name: options.name ?? "voice-htmx-dashboards" });
  if (options.cost) {
    app = app.use(
      createVoiceCostDashboardHTMXRoute({
        ...options.cost,
        render: options.render,
      }),
    );
  }
  if (options.replay) {
    app = app.use(
      createVoiceReplayTimelineHTMXRoute({
        ...options.replay,
        render: options.render,
      }),
    );
  }
  if (options.liveCall) {
    app = app.use(
      createVoiceLiveCallViewerHTMXRoute({
        ...options.liveCall,
        render: options.render,
      }),
    );
  }
  return app;
};

// Convenience: wire trace + review stores directly.
export type CreateVoiceHTMXDashboardRoutesFromStoresOptions = {
  liveViewerByCallId?: (
    sessionId: string,
  ) => Promise<LiveCallViewer | undefined> | LiveCallViewer | undefined;
  pollIntervalMs?: number;
  render?: VoiceDashboardHTMXRendererConfig;
  reviewStore?: VoiceCallReviewStore;
  traceStore?: VoiceTraceEventStore;
};

export const createVoiceHTMXDashboardRoutesFromStores = (
  options: CreateVoiceHTMXDashboardRoutesFromStoresOptions,
) =>
  createVoiceHTMXDashboardRoutes({
    cost: options.traceStore
      ? {
          pollIntervalMs: options.pollIntervalMs,
          resolveEvents: async () => {
            const events = await options.traceStore!.list({
              type: "cost.ready",
            });
            return events;
          },
        }
      : undefined,
    liveCall: options.liveViewerByCallId
      ? {
          pollIntervalMs: options.pollIntervalMs,
          resolveViewer: options.liveViewerByCallId,
        }
      : undefined,
    render: options.render,
    replay: options.reviewStore
      ? {
          resolveArtifact: async (artifactId) =>
            (await options.reviewStore!.get(artifactId)) ?? undefined,
        }
      : undefined,
  });
