import { expect, test } from "bun:test";
import {
  buildVoiceDiagnosticsMarkdown,
  createVoiceDiagnosticsRoutes,
  createVoiceTraceEvent,
  createVoiceMemoryTraceEventStore,
} from "../src";

const createTraceEvents = () => [
  createVoiceTraceEvent({
    at: 100,
    payload: { type: "start" },
    sessionId: "session-trace",
    type: "call.lifecycle",
  }),
  createVoiceTraceEvent({
    at: 120,
    payload: { isFinal: true, text: "order status" },
    sessionId: "session-trace",
    type: "turn.transcript",
  }),
  createVoiceTraceEvent({
    at: 140,
    payload: { text: "order status" },
    sessionId: "session-trace",
    turnId: "turn-1",
    type: "turn.committed",
  }),
  createVoiceTraceEvent({
    at: 160,
    payload: { text: "I can help." },
    sessionId: "session-trace",
    turnId: "turn-1",
    type: "turn.assistant",
  }),
];

test("buildVoiceDiagnosticsMarkdown renders a redacted bug report body", () => {
  const markdown = buildVoiceDiagnosticsMarkdown(createTraceEvents(), {
    title: "Debug Packet",
  });

  expect(markdown).toContain("# Debug Packet");
  expect(markdown).toContain("## Issues");
  expect(markdown).toContain("## Trace");
  expect(markdown).toContain("session-trace");
});

test("createVoiceDiagnosticsRoutes exports filtered json markdown and html", async () => {
  const store = createVoiceMemoryTraceEventStore();
  for (const event of createTraceEvents()) {
    await store.append(event);
  }
  await store.append({
    at: 300,
    payload: {
      provider: "deepgram",
      providerStatus: "error",
      text: "Email alex@example.com",
    },
    sessionId: "session-provider",
    type: "session.error",
  });
  const app = createVoiceDiagnosticsRoutes({
    store,
  });

  const index = await app.handle(new Request("http://localhost/diagnostics"));
  expect(await index.text()).toContain("session-trace");

  const json = await app.handle(
    new Request(
      "http://localhost/diagnostics/json?provider=deepgram&redact=true",
    ),
  );
  const payload = await json.json();
  expect(payload.filteredCount).toBe(1);
  expect(payload.events[0].payload.text).toBe("Email [redacted]");

  const markdown = await app.handle(
    new Request(
      "http://localhost/diagnostics/markdown?sessionId=session-trace",
    ),
  );
  expect(markdown.headers.get("content-type")).toContain("text/markdown");
  expect(await markdown.text()).toContain("Voice Diagnostics");

  const html = await app.handle(
    new Request("http://localhost/diagnostics/html?sessionId=session-trace"),
  );
  expect(await html.text()).toContain("<table>");
});
