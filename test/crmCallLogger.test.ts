import { describe, expect, test } from "bun:test";
import { createVoiceCRMCallLogger } from "../src/crmCallLogger";
import type {
  VoiceCRMCallActivityInput,
  VoiceCRMContract,
} from "../src/crmContract";

const buildContract = (
  overrides: Partial<VoiceCRMContract> = {},
): VoiceCRMContract => ({
  vendor: "hubspot",
  addNote: async () => ({ noteId: "n_1" }),
  createLead: async (i) => ({ ...i, id: "c_1", vendor: "hubspot" }),
  logCall: async () => ({ activityId: "a_1" }),
  lookupByEmail: async () => null,
  lookupByPhone: async () => null,
  ...overrides,
});

describe("createVoiceCRMCallLogger", () => {
  test("logCallEnd computes duration from startedAt/endedAt", async () => {
    let captured: VoiceCRMCallActivityInput | null = null;
    const logger = createVoiceCRMCallLogger({
      contract: buildContract({
        logCall: async (input) => {
          captured = input;
          return { activityId: "a_1" };
        },
      }),
      now: () => 0,
    });
    const result = await logger.logCallEnd({
      contactId: "c_42",
      endedAt: 60_000,
      sessionId: "call_1",
      startedAt: 0,
      summary: "Customer paid invoice.",
    });
    expect(result?.activityId).toBe("a_1");
    expect(captured?.durationSeconds).toBe(60);
  });

  test("swallow policy returns null on failure", async () => {
    const errors: string[] = [];
    const logger = createVoiceCRMCallLogger({
      contract: buildContract({
        logCall: async () => {
          throw new Error("API down");
        },
      }),
      onError: (e) => {
        errors.push(e.message);
      },
    });
    const result = await logger.logCallEnd({
      contactId: "c_42",
      sessionId: "call_1",
      startedAt: 0,
    });
    expect(result).toBeNull();
    expect(errors).toEqual(["API down"]);
  });

  test("throw policy re-raises", async () => {
    const logger = createVoiceCRMCallLogger({
      contract: buildContract({
        logCall: async () => {
          throw new Error("API down");
        },
      }),
      errorPolicy: "throw",
    });
    await expect(
      logger.logCallEnd({ sessionId: "call_1", startedAt: 0 }),
    ).rejects.toThrow(/API down/);
  });

  test("queue policy enqueues on failure", async () => {
    const queued: { sessionId: string }[] = [];
    const logger = createVoiceCRMCallLogger({
      contract: buildContract({
        logCall: async () => {
          throw new Error("API down");
        },
      }),
      enqueueOnFailure: async (input) => {
        queued.push({ sessionId: input.sessionId });
      },
      errorPolicy: "queue",
    });
    await logger.logCallEnd({ sessionId: "call_1", startedAt: 0 });
    expect(queued).toEqual([{ sessionId: "call_1" }]);
  });

  test("noteOnContact routes through addNote", async () => {
    const logger = createVoiceCRMCallLogger({
      contract: buildContract({
        addNote: async () => ({ noteId: "n_77" }),
      }),
    });
    const result = await logger.noteOnContact({
      body: "Caller mentioned competitor.",
      contactId: "c_42",
    });
    expect(result?.noteId).toBe("n_77");
  });
});
