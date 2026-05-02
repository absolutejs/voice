import { expect, test } from "bun:test";
import {
  buildVoiceSessionObservabilityReport,
  createVoiceMemoryTraceEventStore,
  createVoiceProviderDecisionTraceEvent,
  createVoiceSessionObservabilityRoutes,
  createVoiceTraceEvent,
  renderVoiceSessionObservabilityMarkdown,
} from "../src";

const createSessionEvents = () => [
  createVoiceTraceEvent({
    at: 100,
    payload: { type: "start" },
    sessionId: "session-observable",
    type: "call.lifecycle",
  }),
  createVoiceTraceEvent({
    at: 125,
    payload: {
      elapsedMs: 25,
      isFinal: true,
      provider: "deepgram",
      providerStatus: "success",
      text: "I need to reschedule.",
    },
    sessionId: "session-observable",
    turnId: "turn-1",
    type: "turn.transcript",
  }),
  createVoiceTraceEvent({
    at: 140,
    payload: {
      text: "I need to reschedule.",
    },
    sessionId: "session-observable",
    turnId: "turn-1",
    type: "turn.committed",
  }),
  createVoiceProviderDecisionTraceEvent({
    at: 165,
    elapsedMs: 60,
    kind: "llm",
    provider: "openai",
    reason: "primary model exceeded the live turn budget",
    selectedProvider: "openai",
    sessionId: "session-observable",
    status: "selected",
    surface: "live-call",
    turnId: "turn-1",
  }),
  createVoiceProviderDecisionTraceEvent({
    at: 185,
    elapsedMs: 90,
    fallbackProvider: "anthropic",
    kind: "llm",
    provider: "openai",
    reason: "fallback recovered the turn",
    selectedProvider: "anthropic",
    sessionId: "session-observable",
    status: "fallback",
    surface: "live-call",
    turnId: "turn-1",
  }),
  createVoiceTraceEvent({
    at: 210,
    payload: {
      elapsedMs: 30,
      status: "ok",
      toolCallId: "tool-1",
      toolName: "reschedule_appointment",
    },
    sessionId: "session-observable",
    turnId: "turn-1",
    type: "agent.tool",
  }),
  createVoiceTraceEvent({
    at: 250,
    payload: {
      text: "I can help reschedule that appointment.",
    },
    sessionId: "session-observable",
    turnId: "turn-1",
    type: "turn.assistant",
  }),
  createVoiceTraceEvent({
    at: 300,
    payload: { disposition: "completed", type: "end" },
    sessionId: "session-observable",
    type: "call.lifecycle",
  }),
];

test("buildVoiceSessionObservabilityReport creates call-level and turn-level support evidence", async () => {
  const store = createVoiceMemoryTraceEventStore();
  for (const event of createSessionEvents()) {
    await store.append(event);
  }

  const report = await buildVoiceSessionObservabilityReport({
    callDebuggerHref: "/voice/debug/:sessionId",
    incidentMarkdownHref: "/voice/observability/:sessionId/incident.md",
    operationsRecordHref: "/voice/operations/:sessionId",
    sessionId: "session-observable",
    store,
    traceTimelineHref: "/voice/traces/:sessionId",
  });

  expect(report).toMatchObject({
    sessionId: "session-observable",
    status: "healthy",
    summary: {
      durationMs: 200,
      events: 8,
      fallbacks: 1,
      providerRecoveryStatus: "recovered",
      providers: ["anthropic", "deepgram", "openai"],
      toolCalls: 1,
      turns: 1,
    },
  });
  expect(report.links).toEqual(
    expect.arrayContaining([
      {
        href: "/voice/operations/session-observable",
        label: "Open operations record",
        rel: "operations-record",
      },
      {
        href: "/voice/traces/session-observable",
        label: "Open trace timeline",
        rel: "trace-timeline",
      },
    ]),
  );
  expect(report.turns[0]).toMatchObject({
    assistantReplies: 1,
    providerDecisions: 2,
    toolCalls: 1,
    transcripts: 1,
    turnId: "turn-1",
  });
  expect(report.turns[0]?.stages.map((stage) => stage.type)).toEqual([
    "turn.transcript",
    "turn.committed",
    "provider.decision",
    "provider.decision",
    "agent.tool",
    "turn.assistant",
  ]);

  const markdown = renderVoiceSessionObservabilityMarkdown(report);
  expect(markdown).toContain("Voice session observability");
  expect(markdown).toContain("Turn Waterfalls");
  expect(markdown).toContain("fallback recovered the turn");
});

test("createVoiceSessionObservabilityRoutes exposes JSON HTML and Markdown", async () => {
  const store = createVoiceMemoryTraceEventStore();
  for (const event of createSessionEvents()) {
    await store.append(event);
  }
  const app = createVoiceSessionObservabilityRoutes({
    callDebuggerHref: "/voice/debug/:sessionId",
    operationsRecordHref: "/voice/operations/:sessionId",
    store,
    traceTimelineHref: "/voice/traces/:sessionId",
  });

  const json = await app.handle(
    new Request(
      "http://localhost/api/voice/session-observability/session-observable",
    ),
  );
  expect(json.status).toBe(200);
  await expect(json.json()).resolves.toMatchObject({
    sessionId: "session-observable",
    summary: {
      fallbacks: 1,
      toolCalls: 1,
    },
  });

  const html = await app.handle(
    new Request(
      "http://localhost/voice/session-observability/session-observable",
    ),
  );
  const htmlText = await html.text();
  expect(htmlText).toContain("Session observability");
  expect(htmlText).toContain("Turn Waterfalls");
  expect(htmlText).toContain("/voice/operations/session-observable");

  const markdown = await app.handle(
    new Request(
      "http://localhost/api/voice/session-observability/session-observable/incident.md",
    ),
  );
  const markdownText = await markdown.text();
  expect(markdown.status).toBe(200);
  expect(markdownText).toContain("Voice session observability");
  expect(markdownText).toContain("Incident Handoff");
});
