import { describe, expect, test } from "bun:test";
import {
  buildVoiceCallerMemoryNamespace,
  createVoiceCallerMemoryNamespace,
  summarizeVoiceCallerTranscript,
} from "../src/callerMemory";
import type { VoiceCallerMemoryCompletion } from "../src/callerMemory";
import type { VoiceSessionRecord, VoiceTurnRecord } from "../src/types";

const baseSession: VoiceSessionRecord = {
  committedTurnIds: [],
  createdAt: 0,
  currentTurn: { finalText: "", partialText: "", transcripts: [] },
  id: "s1",
  reconnect: { attempts: 0 },
  status: "active",
  transcripts: [],
  turns: [],
};

const turn = (text: string, assistantText?: string): VoiceTurnRecord => ({
  assistantText,
  committedAt: 0,
  id: text,
  text,
  transcripts: [],
});

const fakeCompletion =
  (response: string): VoiceCallerMemoryCompletion =>
  async () => response;

describe("buildVoiceCallerMemoryNamespace", () => {
  test("prefers externalId, then phone, then email", () => {
    expect(
      buildVoiceCallerMemoryNamespace({
        email: "a@b.com",
        externalId: "ext-1",
        phone: "+14155551212",
      }),
    ).toBe("caller:ext-1");
    expect(
      buildVoiceCallerMemoryNamespace({
        email: "a@b.com",
        phone: "+14155551212",
      }),
    ).toBe("caller:+14155551212");
    expect(
      buildVoiceCallerMemoryNamespace({ email: "Alex@Example.com" }),
    ).toBe("caller:alex@example.com");
  });

  test("returns anonymous for missing identity", () => {
    expect(buildVoiceCallerMemoryNamespace(undefined)).toBe("caller:anonymous");
  });

  test("honors prefix override", () => {
    expect(
      buildVoiceCallerMemoryNamespace({ phone: "+1" }, "support"),
    ).toBe("support:+1");
  });
});

describe("createVoiceCallerMemoryNamespace", () => {
  test("resolves identity through the caller hook", async () => {
    const resolver = createVoiceCallerMemoryNamespace<
      { caller?: string },
      VoiceSessionRecord
    >({
      identifyCaller: ({ context }) =>
        context.caller ? { externalId: context.caller } : undefined,
    });
    expect(
      await resolver({
        assistantId: "a",
        context: { caller: "user-42" },
        session: baseSession,
      }),
    ).toBe("caller:user-42");
    expect(
      await resolver({
        assistantId: "a",
        context: {},
        session: baseSession,
      }),
    ).toBe("caller:anonymous");
  });
});

describe("summarizeVoiceCallerTranscript", () => {
  test("merges turns into a structured snapshot via the completion callback", async () => {
    const snapshot = await summarizeVoiceCallerTranscript({
      identity: { externalId: "user-42" },
      options: {
        completion: fakeCompletion(
          JSON.stringify({
            facts: { plan: "Pro" },
            openActions: ["send refund email"],
            summary: "Caller wanted refund.",
          }),
        ),
      },
      turns: [turn("I need a refund", "I can help with that.")],
    });
    expect(snapshot.summary).toBe("Caller wanted refund.");
    expect(snapshot.facts.plan).toBe("Pro");
    expect(snapshot.openActions).toEqual(["send refund email"]);
    expect(snapshot.identity).toEqual({ externalId: "user-42" });
    expect(snapshot.lastSessionAt).toBeGreaterThan(0);
  });

  test("accepts snake_case open_actions and coerces non-string facts", async () => {
    const snapshot = await summarizeVoiceCallerTranscript({
      identity: { phone: "+14155551212" },
      options: {
        completion: fakeCompletion(
          JSON.stringify({
            facts: { age: 42, plan: "Free" },
            open_actions: ["follow up tuesday"],
            summary: "OK.",
          }),
        ),
      },
      turns: [turn("hi")],
    });
    expect(snapshot.facts).toEqual({ age: "42", plan: "Free" });
    expect(snapshot.openActions).toEqual(["follow up tuesday"]);
  });

  test("throws on invalid JSON", async () => {
    await expect(
      summarizeVoiceCallerTranscript({
        identity: { phone: "+1" },
        options: { completion: fakeCompletion("not json") },
        turns: [turn("hi")],
      }),
    ).rejects.toThrow();
  });
});
