import { describe, expect, test } from "bun:test";
import {
  DEFAULT_VOICE_PRICE_BOOK,
  createVoiceCostAccountant,
} from "../src/core/costAccounting";

describe("createVoiceCostAccountant", () => {
  test("accumulates LLM tokens and prices them against the price book", () => {
    const accountant = createVoiceCostAccountant({
      sessionId: "session-cost",
    });
    accountant.recordLLM({
      cachedInputTokens: 500,
      inputTokens: 1_500,
      model: "claude-sonnet-4-5",
      outputTokens: 300,
      provider: "anthropic",
    });
    const snapshot = accountant.snapshot();
    expect(snapshot.llm.inputTokens).toBe(1_500);
    expect(snapshot.llm.cachedInputTokens).toBe(500);
    expect(snapshot.llm.outputTokens).toBe(300);
    // 1000 fresh input @ $3/M + 500 cached @ $0.3/M + 300 output @ $15/M
    expect(snapshot.llm.usd).toBeCloseTo(0.003 + 0.000_15 + 0.0045, 6);
    expect(snapshot.sessionId).toBe("session-cost");
  });

  test("prices TTS by characters when rate is per-million-characters", () => {
    const accountant = createVoiceCostAccountant();
    accountant.recordTTS({
      characters: 1_000,
      provider: "cartesia",
      voice: "sonic-2",
    });
    const snapshot = accountant.snapshot();
    expect(snapshot.tts.characters).toBe(1_000);
    // 1000 chars @ $65/M
    expect(snapshot.tts.usd).toBeCloseTo(0.065, 6);
  });

  test("prices STT by audio seconds", () => {
    const accountant = createVoiceCostAccountant();
    accountant.recordSTT({
      audioMs: 30_000,
      model: "nova-3",
      provider: "deepgram",
    });
    const snapshot = accountant.snapshot();
    expect(snapshot.stt.audioMs).toBe(30_000);
    // 30 seconds @ $0.000077/sec
    expect(snapshot.stt.usd).toBeCloseTo(30 * 0.000_077, 6);
  });

  test("prices telephony by minute", () => {
    const accountant = createVoiceCostAccountant();
    accountant.recordTelephony({ minutes: 5, provider: "twilio" });
    const snapshot = accountant.snapshot();
    expect(snapshot.telephony.minutes).toBe(5);
    expect(snapshot.telephony.usd).toBeCloseTo(5 * 0.014, 6);
  });

  test("totalUsd sums every modality", () => {
    const accountant = createVoiceCostAccountant();
    accountant.recordLLM({
      inputTokens: 1_000_000,
      model: "gpt-4o-mini",
      outputTokens: 1_000_000,
      provider: "openai",
    });
    accountant.recordTTS({
      characters: 1_000_000,
      provider: "cartesia",
      voice: "sonic-2",
    });
    accountant.recordSTT({
      audioMs: 60_000,
      model: "nova-3",
      provider: "deepgram",
    });
    accountant.recordTelephony({ minutes: 1, provider: "twilio" });
    const snapshot = accountant.snapshot();
    // gpt-4o-mini: 1M in @ $0.15 + 1M out @ $0.60 = $0.75
    // cartesia: 1M chars @ $65 = $65
    // deepgram: 60s @ $0.000077 = $0.00462
    // twilio: 1min @ $0.014 = $0.014
    expect(snapshot.totalUsd).toBeCloseTo(
      0.75 + 65 + 60 * 0.000_077 + 0.014,
      4,
    );
  });

  test("skips pricing when provider is unknown but still records counts", () => {
    const accountant = createVoiceCostAccountant({ priceBook: {} });
    accountant.recordLLM({
      inputTokens: 100,
      model: "unknown",
      outputTokens: 50,
      provider: "obscure",
    });
    const snapshot = accountant.snapshot();
    expect(snapshot.llm.inputTokens).toBe(100);
    expect(snapshot.llm.outputTokens).toBe(50);
    expect(snapshot.llm.usd).toBe(0);
  });

  test("custom price book overrides defaults", () => {
    const accountant = createVoiceCostAccountant({
      priceBook: {
        ...DEFAULT_VOICE_PRICE_BOOK,
        "openai:gpt-4o-mini": {
          llm: {
            inputPerMillionTokensUsd: 1,
            outputPerMillionTokensUsd: 4,
          },
        },
      },
    });
    accountant.recordLLM({
      inputTokens: 1_000_000,
      model: "gpt-4o-mini",
      outputTokens: 1_000_000,
      provider: "openai",
    });
    const snapshot = accountant.snapshot();
    expect(snapshot.llm.usd).toBeCloseTo(5, 6);
  });
});
