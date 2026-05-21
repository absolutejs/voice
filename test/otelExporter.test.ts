import { describe, expect, test } from "bun:test";
import {
  aggregateVoiceTurnLatencySpans,
  buildOTELSpanId,
  buildOTELTraceId,
  buildVoiceOTELPayload,
  createVoiceOTELHTTPExporter,
} from "../src/core/otelExporter";
import type { StoredVoiceTraceEvent } from "../src/core/trace";

const stageEvent = (
  at: number,
  sessionId: string,
  turnId: string,
  stage: string,
): StoredVoiceTraceEvent => ({
  at,
  id: `${turnId}-${stage}`,
  payload: { stage },
  sessionId,
  turnId,
  type: "turn_latency.stage",
});

describe("aggregateVoiceTurnLatencySpans", () => {
  test("buckets events by session and turn", () => {
    const events: StoredVoiceTraceEvent[] = [
      stageEvent(1_000, "s1", "t1", "speech_detected"),
      stageEvent(1_500, "s1", "t1", "final_transcript"),
      stageEvent(2_000, "s1", "t1", "turn_committed"),
      stageEvent(3_000, "s1", "t2", "speech_detected"),
    ];
    const spans = aggregateVoiceTurnLatencySpans(events);
    expect(spans).toHaveLength(2);
    expect(spans[0]!.turnId).toBe("t1");
    expect(spans[0]!.stages.map((stage) => stage.stage)).toEqual([
      "speech_detected",
      "final_transcript",
      "turn_committed",
    ]);
    expect(spans[0]!.startedAt).toBe(1_000);
    expect(spans[0]!.endedAt).toBe(2_000);
  });

  test("ignores events that are not turn_latency.stage or have no turnId", () => {
    const events: StoredVoiceTraceEvent[] = [
      stageEvent(1_000, "s1", "t1", "speech_detected"),
      {
        at: 1_100,
        id: "x",
        payload: { stage: "ignored" },
        sessionId: "s1",
        type: "turn.assistant",
      },
      {
        at: 1_200,
        id: "y",
        payload: { stage: "no-turn" },
        sessionId: "s1",
        type: "turn_latency.stage",
      },
    ];
    const spans = aggregateVoiceTurnLatencySpans(events);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.stages).toHaveLength(1);
  });
});

describe("buildOTELTraceId / buildOTELSpanId", () => {
  test("returns deterministic hex of the right length", () => {
    const traceId = buildOTELTraceId("session-otel");
    const spanId = buildOTELSpanId("session-otel", "turn:t1");
    expect(traceId).toHaveLength(32);
    expect(traceId).toMatch(/^[0-9a-f]+$/);
    expect(spanId).toHaveLength(16);
    expect(spanId).toMatch(/^[0-9a-f]+$/);
    // determinism
    expect(buildOTELTraceId("session-otel")).toBe(traceId);
  });
});

describe("buildVoiceOTELPayload", () => {
  test("emits one parent span per turn plus child spans per stage", () => {
    const events: StoredVoiceTraceEvent[] = [
      stageEvent(1_000, "s1", "t1", "speech_detected"),
      stageEvent(1_500, "s1", "t1", "final_transcript"),
      stageEvent(2_000, "s1", "t1", "turn_committed"),
    ];
    const payload = buildVoiceOTELPayload(
      aggregateVoiceTurnLatencySpans(events),
      { serviceName: "test-svc" },
    );
    const spans = payload.resourceSpans[0]!.scopeSpans[0]!.spans;
    // 1 parent + 3 stage children = 4
    expect(spans).toHaveLength(4);
    const parent = spans.find((span) => span.name === "voice.turn");
    expect(parent).toBeDefined();
    expect(parent!.parentSpanId).toBeUndefined();
    expect(parent!.startTimeUnixNano).toBe(`${1_000 * 1_000_000}`);
    const stageNames = spans
      .filter((span) => span.name.startsWith("voice.turn.stage."))
      .map((span) => span.name);
    expect(stageNames).toEqual([
      "voice.turn.stage.speech_detected",
      "voice.turn.stage.final_transcript",
      "voice.turn.stage.turn_committed",
    ]);
    expect(
      payload.resourceSpans[0]!.resource.attributes.find(
        (attr) => attr.key === "service.name",
      ),
    ).toEqual({ key: "service.name", value: { stringValue: "test-svc" } });
  });
});

describe("createVoiceOTELHTTPExporter", () => {
  test("POSTs OTLP JSON to the configured endpoint", async () => {
    const captured: Array<{ body: unknown; url: string }> = [];
    const exporter = createVoiceOTELHTTPExporter({
      fetch: (async (url, init) => {
        captured.push({
          body: JSON.parse(init!.body as string),
          url: typeof url === "string" ? url : url.toString(),
        });
        return new Response(null, { status: 200 });
      }) as typeof fetch,
      headers: { authorization: "Bearer xyz" },
      url: "https://otlp.example.com/v1/traces",
    });
    const result = await exporter.export([
      stageEvent(1_000, "s1", "t1", "speech_detected"),
      stageEvent(2_000, "s1", "t1", "turn_committed"),
    ]);
    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe("https://otlp.example.com/v1/traces");
    const body = captured[0]!.body as { resourceSpans: unknown[] };
    expect(body.resourceSpans).toHaveLength(1);
  });

  test("short-circuits when there are no turn_latency events", async () => {
    let calls = 0;
    const exporter = createVoiceOTELHTTPExporter({
      fetch: (async () => {
        calls += 1;
        return new Response(null, { status: 200 });
      }) as typeof fetch,
      url: "https://otlp.example.com/v1/traces",
    });
    const result = await exporter.export([
      {
        at: 1,
        id: "x",
        payload: {},
        sessionId: "s",
        type: "turn.assistant",
      },
    ]);
    expect(result.ok).toBe(true);
    expect(calls).toBe(0);
  });
});
