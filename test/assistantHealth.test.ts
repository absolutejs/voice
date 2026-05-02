import { expect, test } from "bun:test";
import {
  createVoiceAssistantHealthHTMLHandler,
  createVoiceAssistantHealthRoutes,
  createVoiceMemoryTraceEventStore,
  createVoiceTraceEvent,
  renderVoiceAssistantHealthHTML,
  summarizeVoiceAssistantHealth,
} from "../src";

test("summarizeVoiceAssistantHealth combines assistant, provider, and failure summaries", async () => {
  const events = [
    createVoiceTraceEvent({
      at: 1_000,
      payload: {
        assistantId: "support",
        elapsedMs: 25,
        outcome: "completed",
        toolNames: ["lookup"],
        variantId: "openai",
      },
      sessionId: "session-health",
      type: "assistant.run",
    }),
    createVoiceTraceEvent({
      at: 1_010,
      payload: {
        error: "OpenAI voice assistant model failed: HTTP 429",
        provider: "openai",
        providerStatus: "error",
        rateLimited: true,
        selectedProvider: "openai",
      },
      sessionId: "session-health",
      type: "session.error",
    }),
    createVoiceTraceEvent({
      at: 1_020,
      payload: {
        provider: "anthropic",
        providerStatus: "fallback",
        selectedProvider: "openai",
      },
      sessionId: "session-health",
      type: "session.error",
    }),
  ];

  expect(
    await summarizeVoiceAssistantHealth({
      events,
      providers: ["openai", "anthropic"],
    }),
  ).toMatchObject({
    assistantRuns: {
      assistants: [
        {
          assistantId: "support",
          averageElapsedMs: 25,
          outcomes: {
            completed: 1,
          },
          runCount: 1,
          toolCalls: {
            lookup: 1,
          },
        },
      ],
      totalRuns: 1,
    },
    providerHealth: [
      {
        provider: "openai",
        rateLimited: true,
        status: "rate-limited",
      },
      {
        provider: "anthropic",
        status: "healthy",
      },
    ],
    recentFailures: [
      {
        error: "OpenAI voice assistant model failed: HTTP 429",
        provider: "openai",
        rateLimited: true,
        replayHref: "/api/voice-sessions/session-health/replay/htmx",
        status: "error",
      },
    ],
  });
  expect(
    (
      await summarizeVoiceAssistantHealth({
        events,
        providers: ["openai", "anthropic"],
      })
    ).recentFailures,
  ).toHaveLength(1);
});

test("renderVoiceAssistantHealthHTML renders portable dashboard sections", async () => {
  const summary = await summarizeVoiceAssistantHealth({
    events: [],
    providers: ["openai"],
  });

  expect(renderVoiceAssistantHealthHTML(summary)).toContain("Provider Health");
  expect(renderVoiceAssistantHealthHTML(summary)).toContain("Recent Failures");
});

test("summarizeVoiceAssistantHealth supports custom replay hrefs", async () => {
  const summary = await summarizeVoiceAssistantHealth({
    events: [
      createVoiceTraceEvent({
        at: 1_000,
        payload: {
          error: "failed",
          provider: "openai",
          providerStatus: "error",
        },
        sessionId: "session-custom",
        type: "session.error",
      }),
    ],
    replayHref: (failure) => `/debug/${failure.sessionId}`,
  });

  expect(summary.recentFailures[0]?.replayHref).toBe("/debug/session-custom");
});

test("createVoiceAssistantHealthHTMLHandler returns an HTMX-ready panel", async () => {
  const response = await createVoiceAssistantHealthHTMLHandler({
    events: [],
    providers: ["openai"],
  })();

  expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  expect(await response.text()).toContain("voice-assistant-health");
});

test("createVoiceAssistantHealthRoutes exposes json and html endpoints", async () => {
  const store = createVoiceMemoryTraceEventStore();
  const routes = createVoiceAssistantHealthRoutes({
    providers: ["openai"],
    store,
  });

  const json = await routes.handle(
    new Request("http://localhost/api/assistant-health"),
  );
  const html = await routes.handle(
    new Request("http://localhost/api/assistant-health/htmx"),
  );

  expect(await json.json()).toMatchObject({
    assistantRuns: {
      totalRuns: 0,
    },
    providerHealth: [
      {
        provider: "openai",
        status: "idle",
      },
    ],
  });
  expect(await html.text()).toContain("voice-assistant-health");
});
