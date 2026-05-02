import { expect, test } from "bun:test";
import {
  createVoiceMemoryStore,
  createVoiceSessionRecord,
  createVoiceTurnQualityRoutes,
  renderVoiceTurnQualityHTML,
  summarizeVoiceTurnQuality,
} from "../src";

test("summarizeVoiceTurnQuality reports fallback correction and confidence warnings", async () => {
  const session = createVoiceSessionRecord("session-quality");
  session.turns.push(
    {
      committedAt: 200,
      id: "turn-1",
      quality: {
        averageConfidence: 0.66,
        confidenceSampleCount: 1,
        correction: {
          attempted: true,
          changed: true,
          correctedText: "book an AbsoluteJS demo",
          originalText: "book an absolute jazz demo",
          provider: "lexicon",
          reason: "phrase-hint",
        },
        fallback: {
          attempted: true,
          fallbackConfidence: 0.91,
          fallbackText: "book an AbsoluteJS demo",
          fallbackWordCount: 4,
          primaryConfidence: 0.42,
          primaryText: "book an absolute jazz demo",
          primaryWordCount: 5,
          selected: true,
          selectionReason: "confidence-margin",
          trigger: "low-confidence",
        },
        fallbackUsed: true,
        finalTranscriptCount: 1,
        partialTranscriptCount: 0,
        selectedTranscriptCount: 1,
        source: "fallback",
      },
      text: "book an AbsoluteJS demo",
      transcripts: [
        {
          confidence: 0.91,
          endedAtMs: 120,
          id: "final-1",
          isFinal: true,
          text: "book an AbsoluteJS demo",
        },
      ],
    },
    {
      committedAt: 300,
      id: "turn-2",
      quality: {
        averageConfidence: 0.95,
        confidenceSampleCount: 1,
        fallbackUsed: false,
        finalTranscriptCount: 1,
        partialTranscriptCount: 0,
        selectedTranscriptCount: 1,
        source: "primary",
      },
      text: "clean primary turn",
      transcripts: [],
    },
  );

  const report = await summarizeVoiceTurnQuality({ sessions: [session] });

  expect(report).toMatchObject({
    failed: 0,
    sessions: 1,
    status: "warn",
    total: 2,
    warnings: 1,
  });
  expect(report.turns).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        correctionChanged: true,
        correctionProvider: "lexicon",
        fallbackSelectionReason: "confidence-margin",
        fallbackUsed: true,
        latencyMs: 80,
        source: "fallback",
        status: "warn",
      }),
      expect.objectContaining({
        source: "primary",
        status: "pass",
      }),
    ]),
  );
  expect(renderVoiceTurnQualityHTML(report)).toContain("AbsoluteJS demo");
});

test("createVoiceTurnQualityRoutes reads recent sessions from a store", async () => {
  const store = createVoiceMemoryStore();
  const session = await store.getOrCreate("session-route-quality");
  session.turns.push({
    committedAt: Date.now(),
    id: "turn-route",
    quality: {
      confidenceSampleCount: 0,
      fallbackUsed: false,
      finalTranscriptCount: 0,
      partialTranscriptCount: 0,
      selectedTranscriptCount: 0,
      source: "primary",
    },
    text: "",
    transcripts: [],
  });
  await store.set(session.id, session);

  const routes = createVoiceTurnQualityRoutes({
    htmlPath: "/turn-quality",
    path: "/api/turn-quality",
    store,
  });
  const json = await routes.handle(
    new Request("http://localhost/api/turn-quality"),
  );
  const html = await routes.handle(
    new Request("http://localhost/turn-quality"),
  );

  expect(json.status).toBe(200);
  await expect(json.json()).resolves.toMatchObject({
    failed: 1,
    status: "fail",
    total: 1,
  });
  expect(html.status).toBe(200);
  expect(await html.text()).toContain("Voice Turn Quality");
});

test("summarizeVoiceTurnQuality hydrates explicit session ids without listing the store", async () => {
  const session = createVoiceSessionRecord("session-explicit-quality");
  session.turns.push({
    committedAt: 100,
    id: "turn-explicit",
    text: "explicit session quality",
    transcripts: [],
  });

  const report = await summarizeVoiceTurnQuality({
    sessionIds: [session.id],
    store: {
      get: async (id) => (id === session.id ? session : undefined),
      getOrCreate: async () => session,
      list: async () => {
        throw new Error("list should not be called for explicit session ids");
      },
      remove: async () => {},
      set: async () => {},
    },
  });

  expect(report).toMatchObject({
    sessions: 1,
    total: 1,
  });
  expect(report.turns[0]?.sessionId).toBe(session.id);
});
