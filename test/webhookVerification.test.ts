import { describe, expect, test } from "bun:test";
import {
  VOICE_WEBHOOK_SIGNATURE_HEADER,
  VOICE_WEBHOOK_TIMESTAMP_HEADER,
  extractVoiceWebhookSignatureFromHeaders,
  signVoiceWebhookBody,
  verifyVoiceWebhookSignature,
} from "../src/core/webhookVerification";

describe("signVoiceWebhookBody + verifyVoiceWebhookSignature", () => {
  test("round-trips a valid signature", async () => {
    const body = JSON.stringify({ event: "cost.ready", totalUsd: 0.5 });
    const timestamp = String(Date.now());
    const secret = "rotate-me";
    const signature = await signVoiceWebhookBody({ body, secret, timestamp });
    expect(signature).toMatch(/^sha256=[0-9a-f]+$/);
    const result = await verifyVoiceWebhookSignature({
      body,
      secret,
      signature,
      timestamp,
    });
    expect(result.ok).toBe(true);
  });

  test("rejects tampered bodies", async () => {
    const timestamp = String(Date.now());
    const secret = "s";
    const signature = await signVoiceWebhookBody({
      body: "original",
      secret,
      timestamp,
    });
    const result = await verifyVoiceWebhookSignature({
      body: "tampered",
      secret,
      signature,
      timestamp,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("signature-mismatch");
  });

  test("rejects stale timestamps beyond default tolerance", async () => {
    const body = "{}";
    const timestamp = String(Date.now() - 10 * 60 * 1000);
    const secret = "s";
    const signature = await signVoiceWebhookBody({ body, secret, timestamp });
    const result = await verifyVoiceWebhookSignature({
      body,
      secret,
      signature,
      timestamp,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("stale-timestamp");
  });

  test("respects a wider toleranceMs override", async () => {
    const body = "{}";
    const timestamp = String(Date.now() - 10 * 60 * 1000);
    const secret = "s";
    const signature = await signVoiceWebhookBody({ body, secret, timestamp });
    const result = await verifyVoiceWebhookSignature({
      body,
      secret,
      signature,
      timestamp,
      toleranceMs: 30 * 60 * 1000,
    });
    expect(result.ok).toBe(true);
  });

  test("rejects when secret is missing", async () => {
    const result = await verifyVoiceWebhookSignature({
      body: "{}",
      signature: "sha256=abc",
      timestamp: String(Date.now()),
    });
    expect(result.ok === false && result.reason).toBe("missing-secret");
  });

  test("rejects when signature uses unsupported algorithm", async () => {
    const result = await verifyVoiceWebhookSignature({
      body: "{}",
      secret: "s",
      signature: "md5=abc",
      timestamp: String(Date.now()),
    });
    expect(result.ok === false && result.reason).toBe("unsupported-algorithm");
  });
});

describe("extractVoiceWebhookSignatureFromHeaders", () => {
  test("reads from a Headers instance", () => {
    const headers = new Headers({
      [VOICE_WEBHOOK_SIGNATURE_HEADER]: "sha256=abc",
      [VOICE_WEBHOOK_TIMESTAMP_HEADER]: "123",
    });
    expect(extractVoiceWebhookSignatureFromHeaders(headers)).toEqual({
      signature: "sha256=abc",
      timestamp: "123",
    });
  });

  test("reads from a plain record (case-insensitive)", () => {
    const headers = {
      "X-AbsoluteJS-Signature": "sha256=abc",
      "X-AbsoluteJS-Timestamp": "123",
    };
    expect(
      extractVoiceWebhookSignatureFromHeaders(
        headers as Record<string, string>,
      ),
    ).toEqual({
      signature: "sha256=abc",
      timestamp: "123",
    });
  });
});
