import { expect, test } from "bun:test";
import {
  createVoiceMemoryTraceEventStore,
  createVoiceTraceEvent,
  createVoiceTraceTimelineRoutes,
  summarizeVoiceTraceTimeline,
} from "../src";

const createTimelineEvents = () => [
  createVoiceTraceEvent({
    at: 100,
    payload: { type: "start" },
    sessionId: "session-timeline",
    type: "call.lifecycle",
  }),
  createVoiceTraceEvent({
    at: 130,
    payload: {
      elapsedMs: 30,
      provider: "deepgram",
      providerStatus: "success",
    },
    sessionId: "session-timeline",
    type: "turn.transcript",
  }),
  createVoiceTraceEvent({
    at: 160,
    payload: {
      elapsedMs: 42,
      provider: "openai",
      providerStatus: "fallback",
      selectedProvider: "gemini",
    },
    sessionId: "session-timeline",
    turnId: "turn-1",
    type: "assistant.run",
  }),
  createVoiceTraceEvent({
    at: 200,
    payload: {
      disposition: "completed",
      type: "end",
    },
    sessionId: "session-timeline",
    type: "call.lifecycle",
  }),
];

test("summarizeVoiceTraceTimeline groups sessions with provider latency", () => {
  const report = summarizeVoiceTraceTimeline(createTimelineEvents(), {
    operationsRecordHref: "/voice-operations/:sessionId",
  });

  expect(report).toMatchObject({
    failed: 0,
    total: 1,
  });
  expect(report.sessions[0]).toMatchObject({
    sessionId: "session-timeline",
    operationsRecordHref: "/voice-operations/session-timeline",
    status: "warning",
    summary: {
      callDurationMs: 100,
      eventCount: 4,
    },
  });
  expect(report.sessions[0]?.providers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        averageElapsedMs: 42,
        fallbackCount: 1,
        provider: "openai",
      }),
      expect.objectContaining({
        averageElapsedMs: 30,
        provider: "deepgram",
        successCount: 1,
      }),
    ]),
  );
  expect(report.sessions[0]?.events[1]).toMatchObject({
    offsetMs: 30,
    provider: "deepgram",
  });
});

test("createVoiceTraceTimelineRoutes exposes list and session views", async () => {
  const store = createVoiceMemoryTraceEventStore();
  for (const event of createTimelineEvents()) {
    await store.append(event);
  }

  const app = createVoiceTraceTimelineRoutes({
    operationsRecordHref: "/voice-operations/:sessionId",
    store,
  });

  const json = await app.handle(
    new Request("http://localhost/api/voice-traces"),
  );
  expect(json.status).toBe(200);
  await expect(json.json()).resolves.toMatchObject({
    sessions: [
      {
        operationsRecordHref: "/voice-operations/session-timeline",
        sessionId: "session-timeline",
      },
    ],
  });

  const session = await app.handle(
    new Request("http://localhost/api/voice-traces/session-timeline"),
  );
  expect(session.status).toBe(200);
  await expect(session.json()).resolves.toMatchObject({
    providers: expect.arrayContaining([
      expect.objectContaining({
        provider: "openai",
      }),
    ]),
  });

  const html = await app.handle(new Request("http://localhost/traces"));
  const htmlText = await html.text();
  expect(htmlText).toContain("Voice Trace Timelines");
  expect(htmlText).toContain("Copy into your app");
  expect(htmlText).toContain("createVoiceTraceTimelineRoutes");
  expect(htmlText).toContain("createVoiceProductionReadinessRoutes");
  expect(htmlText).toContain("/voice-operations/session-timeline");

  const sessionHtml = await app.handle(
    new Request("http://localhost/traces/session-timeline"),
  );
  const sessionHtmlText = await sessionHtml.text();
  expect(sessionHtmlText).toContain("Call timeline");
  expect(sessionHtmlText).toContain("Open operations record");
});
