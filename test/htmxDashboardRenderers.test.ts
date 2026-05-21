import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  createVoiceCostDashboardHTMXRoute,
  createVoiceLiveCallViewerHTMXRoute,
  createVoiceReplayTimelineHTMXRoute,
} from "../src/core/htmxDashboardRoutes";
import {
  renderVoiceCostDashboardHTMX,
  renderVoiceLiveCallViewerHTMX,
  renderVoiceReplayTimelineHTMX,
  resolveVoiceDashboardRenderers,
} from "../src/client/htmxDashboardRenderers";
import { createLiveCallViewer } from "../src/client/liveCallViewer";
import type { StoredVoiceTraceEvent } from "../src/core/trace";
import type { VoiceCallReviewArtifact } from "../src/testing/review";

const costEvent = (at: number, totalUsd: number): StoredVoiceTraceEvent => ({
  at,
  id: `cost-${at}`,
  payload: {
    llm: {
      cachedInputTokens: 0,
      inputTokens: 100,
      outputTokens: 50,
      usd: totalUsd * 0.6,
    },
    sessionId: "s",
    stt: { audioMs: 30_000, usd: totalUsd * 0.1 },
    telephony: { minutes: 1, usd: totalUsd * 0.1 },
    totalUsd,
    tts: { audioMs: 0, characters: 200, usd: totalUsd * 0.2 },
  },
  sessionId: "s",
  type: "cost.ready",
});

describe("renderVoiceCostDashboardHTMX", () => {
  test("renders an aria-labeled section with the formatted total", () => {
    const html = renderVoiceCostDashboardHTMX({
      report: {
        buckets: [],
        generatedAt: 0,
        grandTotal: {
          bucketKey: "total",
          callCount: 0,
          llmUsd: 0,
          sttUsd: 0,
          telephonyMinutes: 0,
          telephonyUsd: 0,
          totalUsd: 0,
          ttsUsd: 0,
        },
        windowEndMs: 0,
        windowStartMs: 0,
      },
    });
    expect(html).toContain('aria-label="voice-cost-dashboard"');
    expect(html).toContain("grand total");
  });

  test("emits hx-get + hx-trigger when poll attributes are set", () => {
    const html = renderVoiceCostDashboardHTMX({
      attributes: {
        poll: true,
        pollIntervalMs: 5_000,
        refreshUrl: "/voice/htmx/cost-dashboard",
      },
      report: {
        buckets: [],
        generatedAt: 0,
        grandTotal: {
          bucketKey: "total",
          callCount: 0,
          llmUsd: 0,
          sttUsd: 0,
          telephonyMinutes: 0,
          telephonyUsd: 0,
          totalUsd: 0,
          ttsUsd: 0,
        },
        windowEndMs: 0,
        windowStartMs: 0,
      },
    });
    expect(html).toContain('hx-get="/voice/htmx/cost-dashboard"');
    expect(html).toContain('hx-trigger="every 5s"');
    expect(html).toContain('hx-swap="outerHTML"');
  });
});

describe("renderVoiceReplayTimelineHTMX", () => {
  test("escapes user-controlled detail text", () => {
    const html = renderVoiceReplayTimelineHTMX({
      report: {
        duration: 0,
        events: [
          {
            at: 0,
            category: "user",
            detail: "<script>alert(1)</script>",
            label: "stt.final",
          },
        ],
        metadata: { artifactId: "a", title: "T" },
        startedAt: 0,
        summary: { agentTurns: 0, toolCalls: 0, userTurns: 1 },
      },
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderVoiceLiveCallViewerHTMX", () => {
  test("includes data-agent-state attribute from the view state", () => {
    const viewer = createLiveCallViewer({ sessionId: "abc" });
    viewer.notePartial("hello", 100);
    const html = renderVoiceLiveCallViewerHTMX({ state: viewer.getState() });
    expect(html).toMatch(
      /data-agent-state="(idle|listening|thinking|speaking)"/,
    );
    expect(html).toContain("hello");
  });
});

describe("resolveVoiceDashboardRenderers", () => {
  test("custom renderers override defaults; missing ones fall back", () => {
    const renderers = resolveVoiceDashboardRenderers({
      costDashboard: () => "<custom-cost />",
    });
    expect(renderers.costDashboard({} as never)).toBe("<custom-cost />");
    expect(typeof renderers.replayTimeline).toBe("function");
    expect(typeof renderers.liveCallViewer).toBe("function");
  });
});

describe("createVoiceCostDashboardHTMXRoute (Elysia)", () => {
  test("serves the rendered HTML at the configured path", async () => {
    const app = new Elysia().use(
      createVoiceCostDashboardHTMXRoute({
        path: "/voice/htmx/cost-dashboard",
        pollIntervalMs: 5_000,
        resolveEvents: () => [costEvent(1, 1)],
      }),
    );
    const res = await app.handle(
      new Request("http://localhost/voice/htmx/cost-dashboard"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("voice-cost-dashboard");
    expect(body).toContain("hx-trigger=");
  });
});

describe("createVoiceReplayTimelineHTMXRoute", () => {
  test("404s when the artifact is missing", async () => {
    const app = new Elysia().use(
      createVoiceReplayTimelineHTMXRoute({
        path: "/voice/htmx/replay",
        resolveArtifact: () => undefined,
      }),
    );
    const res = await app.handle(
      new Request("http://localhost/voice/htmx/replay/missing"),
    );
    expect(res.status).toBe(404);
  });

  test("serves the artifact HTML when found", async () => {
    const artifact: VoiceCallReviewArtifact & { id: string } = {
      errors: [],
      id: "abc",
      latencyBreakdown: [],
      notes: [],
      summary: { pass: true },
      timeline: [
        { atMs: 0, event: "call.lifecycle.start", source: "voice-runtime" },
      ],
      title: "Run",
      transcript: { actual: "hi" },
    };
    const app = new Elysia().use(
      createVoiceReplayTimelineHTMXRoute({
        path: "/voice/htmx/replay",
        resolveArtifact: () => artifact,
      }),
    );
    const res = await app.handle(
      new Request("http://localhost/voice/htmx/replay/abc"),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("voice-replay-timeline");
    expect(body).toContain("call.lifecycle.start");
  });
});

describe("createVoiceLiveCallViewerHTMXRoute", () => {
  test("renders the current viewer state", async () => {
    const viewer = createLiveCallViewer({ sessionId: "s1" });
    viewer.notePartial("hi", 100);
    const app = new Elysia().use(
      createVoiceLiveCallViewerHTMXRoute({
        path: "/voice/htmx/live",
        pollIntervalMs: 3_000,
        resolveViewer: () => viewer,
      }),
    );
    const res = await app.handle(
      new Request("http://localhost/voice/htmx/live/s1"),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("voice-live-call-viewer");
    expect(body).toContain('hx-trigger="every 3s"');
  });
});
