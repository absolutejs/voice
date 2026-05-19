import { describe, expect, test } from "bun:test";
import {
  collectVoiceDTMFInput,
  validateVoiceDTMFLuhn,
} from "../src/dtmfCollector";

describe("collectVoiceDTMFInput", () => {
  test("completes when max length is reached", () => {
    const collector = collectVoiceDTMFInput({
      maxLength: 4,
      minLength: 4,
      prompt: "Enter your PIN",
      terminator: null,
    });
    collector.feed("1", 0);
    collector.feed("2", 100);
    collector.feed("3", 200);
    const state = collector.feed("4", 300);
    expect(state).toEqual({
      digits: "1234",
      reason: "length",
      status: "completed",
    });
  });

  test("completes early on terminator digit", () => {
    const collector = collectVoiceDTMFInput({
      maxLength: 10,
      minLength: 3,
      prompt: "Enter account number",
    });
    collector.feed("5", 0);
    collector.feed("5", 100);
    collector.feed("5", 200);
    const state = collector.feed("#", 300);
    expect(state.status).toBe("completed");
    expect((state as { digits: string }).digits).toBe("555");
  });

  test("rejects on invalid digit", () => {
    const collector = collectVoiceDTMFInput({
      maxLength: 4,
      minLength: 4,
      prompt: "PIN",
    });
    const state = collector.feed("A", 0);
    expect(state.status).toBe("rejected");
  });

  test("rejects on overall timeout", () => {
    const collector = collectVoiceDTMFInput({
      maxLength: 4,
      minLength: 4,
      now: () => 0,
      prompt: "PIN",
      timeoutMs: 1_000,
    });
    const state = collector.feed("1", 2_000);
    expect(state.status).toBe("rejected");
    expect((state as { reason: string }).reason).toBe("timeout");
  });

  test("rejects on inter-digit timeout via tick", () => {
    const collector = collectVoiceDTMFInput({
      interDigitTimeoutMs: 500,
      maxLength: 4,
      minLength: 4,
      now: () => 0,
      prompt: "PIN",
      timeoutMs: 10_000,
    });
    collector.feed("1", 0);
    const state = collector.tick(800);
    expect(state.status).toBe("rejected");
    expect((state as { reason: string }).reason).toBe("timeout");
  });

  test("rejects too-short input on terminator", () => {
    const collector = collectVoiceDTMFInput({
      maxLength: 4,
      minLength: 4,
      prompt: "PIN",
    });
    collector.feed("1", 0);
    const state = collector.feed("#", 100);
    expect(state.status).toBe("rejected");
    expect((state as { reason: string }).reason).toBe("too-short");
  });

  test("runs validator when present", () => {
    const collector = collectVoiceDTMFInput({
      maxLength: 4,
      minLength: 4,
      prompt: "PIN",
      terminator: null,
      validator: (digits) => digits !== "0000",
    });
    collector.feed("0", 0);
    collector.feed("0", 100);
    collector.feed("0", 200);
    const state = collector.feed("0", 300);
    expect(state.status).toBe("rejected");
    expect((state as { reason: string }).reason).toBe("invalid");
  });

  test("notifies subscribers", () => {
    const collector = collectVoiceDTMFInput({
      maxLength: 4,
      minLength: 4,
      prompt: "PIN",
      terminator: null,
    });
    const seen: string[] = [];
    collector.subscribe((s) => seen.push(s.status));
    collector.feed("1", 0);
    collector.feed("2", 100);
    collector.feed("3", 200);
    collector.feed("4", 300);
    expect(seen[seen.length - 1]).toBe("completed");
  });

  test("cancel halts collection", () => {
    const collector = collectVoiceDTMFInput({
      maxLength: 4,
      minLength: 4,
      prompt: "PIN",
    });
    collector.feed("1", 0);
    const state = collector.cancel();
    expect(state.status).toBe("cancelled");
  });
});

describe("validateVoiceDTMFLuhn", () => {
  test("accepts valid Luhn numbers", () => {
    expect(validateVoiceDTMFLuhn("4242424242424242")).toBe(true);
  });

  test("rejects invalid Luhn numbers", () => {
    expect(validateVoiceDTMFLuhn("4242424242424241")).toBe(false);
  });

  test("rejects non-digit strings", () => {
    expect(validateVoiceDTMFLuhn("not-a-number")).toBe(false);
  });
});
