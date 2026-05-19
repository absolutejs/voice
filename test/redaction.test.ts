import { describe, expect, test } from "bun:test";
import {
  DEFAULT_VOICE_REDACTION_PATTERNS,
  createVoiceTranscriptRedactor,
} from "../src/redaction";

const transcript = (text: string) => ({
  id: "t",
  isFinal: true,
  text,
});

describe("createVoiceTranscriptRedactor", () => {
  test("redacts credit card numbers", () => {
    const redactor = createVoiceTranscriptRedactor();
    const out = redactor(transcript("card is 4242 4242 4242 4242 thanks"));
    expect(out.text).toContain("[REDACTED:CC]");
    expect(out.text).not.toContain("4242 4242 4242 4242");
  });

  test("redacts SSN", () => {
    const redactor = createVoiceTranscriptRedactor();
    const out = redactor(transcript("my social is 123-45-6789"));
    expect(out.text).toBe("my social is [REDACTED:SSN]");
  });

  test("redacts email addresses", () => {
    const redactor = createVoiceTranscriptRedactor();
    const out = redactor(transcript("contact me at alex@example.com please"));
    expect(out.text).toBe("contact me at [REDACTED:EMAIL] please");
  });

  test("redacts phone numbers", () => {
    const redactor = createVoiceTranscriptRedactor();
    const out = redactor(transcript("call 555-123-4567 tomorrow"));
    expect(out.text).toBe("call [REDACTED:PHONE] tomorrow");
  });

  test("returns the same transcript reference when nothing matches", () => {
    const redactor = createVoiceTranscriptRedactor();
    const input = transcript("just some plain words");
    const out = redactor(input);
    expect(out).toBe(input);
  });

  test("custom patterns override defaults", () => {
    const redactor = createVoiceTranscriptRedactor({
      patterns: [
        {
          label: "secret",
          regex: /password/g,
          replacement: "[HIDDEN]",
        },
      ],
    });
    const out = redactor(transcript("the password is hunter2"));
    expect(out.text).toBe("the [HIDDEN] is hunter2");
  });

  test("preserves transcript metadata fields", () => {
    const redactor = createVoiceTranscriptRedactor();
    const input = {
      confidence: 0.9,
      id: "t1",
      isFinal: true,
      speaker: 1,
      text: "my number is 415-555-1212",
      vendor: "deepgram",
    };
    const out = redactor(input);
    expect(out.speaker).toBe(1);
    expect(out.vendor).toBe("deepgram");
    expect(out.confidence).toBe(0.9);
    expect(out.text).toBe("my number is [REDACTED:PHONE]");
  });
});

describe("DEFAULT_VOICE_REDACTION_PATTERNS", () => {
  test("includes the four standard PII categories", () => {
    const labels = DEFAULT_VOICE_REDACTION_PATTERNS.map((p) => p.label);
    expect(labels).toContain("credit-card");
    expect(labels).toContain("ssn");
    expect(labels).toContain("email");
    expect(labels).toContain("phone");
  });
});
