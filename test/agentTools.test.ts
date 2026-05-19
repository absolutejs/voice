import { describe, expect, test } from "bun:test";
import {
  createVoiceApiRequestTool,
  createVoiceDTMFTool,
  createVoiceEndCallTool,
  createVoiceTransferCallTool,
  createVoiceVoicemailDetectionTool,
} from "../src";
import type {
  VoiceSessionHandle,
  VoiceSessionRecord,
} from "../src";

type StubCall = {
  args?: unknown;
  method: string;
};

const buildStubApi = () => {
  const calls: StubCall[] = [];
  const noop = async () => undefined;
  const api = {
    close: noop,
    commitTurn: noop,
    complete: async (result?: unknown) => {
      calls.push({ args: result, method: "complete" });
    },
    connect: noop,
    disconnect: noop,
    escalate: async (input: unknown) => {
      calls.push({ args: input, method: "escalate" });
    },
    fail: noop,
    id: "session-1",
    markNoAnswer: async (input?: unknown) => {
      calls.push({ args: input, method: "markNoAnswer" });
    },
    markVoicemail: async (input?: unknown) => {
      calls.push({ args: input, method: "markVoicemail" });
    },
    receiveAudio: noop,
    snapshot: async () => ({
      createdAt: 0,
      id: "session-1",
      updatedAt: 0,
    }) as VoiceSessionRecord,
    transfer: async (input: unknown) => {
      calls.push({ args: input, method: "transfer" });
    },
  } satisfies VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>;
  return { api, calls };
};

const buildExecuteEnv = (args: Record<string, unknown> = {}) => {
  const { api, calls } = buildStubApi();
  return {
    api,
    args,
    calls,
    context: {} as never,
    session: {
      createdAt: 0,
      id: "session-1",
      updatedAt: 0,
    } as VoiceSessionRecord,
    turn: {} as never,
  };
};

describe("createVoiceEndCallTool", () => {
  test("invokes api.complete with no params and returns ok=true", async () => {
    const env = buildExecuteEnv();
    const tool = createVoiceEndCallTool();
    const result = await tool.execute(env);
    expect(result.ok).toBe(true);
    expect(env.calls).toEqual([{ args: undefined, method: "complete" }]);
    expect(tool.resultToMessage?.(result)).toBe("Call ended.");
  });

  test("uses farewell function and resolveResult", async () => {
    const env = buildExecuteEnv({ reason: "caller satisfied" });
    const tool = createVoiceEndCallTool<unknown, VoiceSessionRecord, { wrap: string }>({
      farewell: ({ args }) =>
        args.reason ? `Goodbye — ${args.reason}.` : undefined,
      resolveResult: ({ args }) => ({ wrap: args.reason ?? "" }),
    });
    const result = await tool.execute(env);
    expect(result.farewell).toBe("Goodbye — caller satisfied.");
    expect(env.calls[0]).toEqual({
      args: { wrap: "caller satisfied" },
      method: "complete",
    });
    expect(tool.resultToMessage?.(result)).toBe("Goodbye — caller satisfied.");
  });
});

describe("createVoiceTransferCallTool", () => {
  test("rejects construction with empty destinations", () => {
    expect(() =>
      createVoiceTransferCallTool({ destinations: [] }),
    ).toThrow();
  });

  test("emits a JSON schema enum of destination ids", () => {
    const tool = createVoiceTransferCallTool({
      destinations: [
        { id: "billing", target: "+15551234567" },
        { id: "supervisor", target: "sip:supervisor@pbx" },
      ],
    });
    expect(tool.parameters).toMatchObject({
      properties: {
        destinationId: { enum: ["billing", "supervisor"] },
      },
      required: ["destinationId"],
    });
  });

  test("invokes api.transfer with the resolved destination", async () => {
    const env = buildExecuteEnv({
      destinationId: "billing",
      reason: "billing question",
    });
    const tool = createVoiceTransferCallTool({
      destinations: [
        {
          id: "billing",
          message: "Connecting you to billing.",
          metadata: { queue: "tier-2" },
          target: "+15551234567",
        },
      ],
    });
    const result = await tool.execute(env);
    expect(result).toEqual({
      destinationId: "billing",
      message: "Connecting you to billing.",
      ok: true,
      target: "+15551234567",
    });
    expect(env.calls[0]).toMatchObject({
      args: {
        metadata: { queue: "tier-2" },
        reason: "billing question",
        target: "+15551234567",
      },
      method: "transfer",
    });
    expect(tool.resultToMessage?.(result)).toBe("Connecting you to billing.");
  });

  test("throws when LLM picks an unknown destination", async () => {
    const env = buildExecuteEnv({ destinationId: "ghost" });
    const tool = createVoiceTransferCallTool({
      destinations: [{ id: "billing", target: "+15551234567" }],
    });
    await expect(tool.execute(env)).rejects.toThrow(/Unknown transfer destination/);
  });
});

describe("createVoiceDTMFTool", () => {
  test("calls send() with the trimmed digits and returns ok=true", async () => {
    const sent: string[] = [];
    const env = buildExecuteEnv({ digits: " 123*# " });
    const tool = createVoiceDTMFTool({
      send: ({ args }) => {
        sent.push(args.digits);
      },
    });
    const result = await tool.execute(env);
    expect(sent).toEqual(["123*#"]);
    expect(result.digits).toBe("123*#");
    expect(tool.resultToMessage?.(result)).toBe("Sent DTMF: 123*#");
  });

  test("rejects empty, too-long, or disallowed digits", async () => {
    const tool = createVoiceDTMFTool({
      allowedDigits: "0123456789",
      maxDigits: 4,
      send: () => undefined,
    });
    await expect(
      tool.execute(buildExecuteEnv({ digits: "" })),
    ).rejects.toThrow(/non-empty/);
    await expect(
      tool.execute(buildExecuteEnv({ digits: "12345" })),
    ).rejects.toThrow(/maxDigits=4/);
    await expect(
      tool.execute(buildExecuteEnv({ digits: "12#" })),
    ).rejects.toThrow(/not in the allowed set/);
  });
});

describe("createVoiceVoicemailDetectionTool", () => {
  test("marks voicemail and completes by default", async () => {
    const env = buildExecuteEnv({ confidence: 0.92, reason: "beep heard" });
    const tool = createVoiceVoicemailDetectionTool();
    const result = await tool.execute(env);
    expect(env.calls.map((entry) => entry.method)).toEqual([
      "markVoicemail",
      "complete",
    ]);
    expect(env.calls[0]?.args).toEqual({
      metadata: { confidence: 0.92, reason: "beep heard" },
      result: undefined,
    });
    expect(result.confidence).toBe(0.92);
    expect(tool.resultToMessage?.(result)).toContain("Voicemail detected");
  });

  test("can be configured to skip completion", async () => {
    const env = buildExecuteEnv();
    const tool = createVoiceVoicemailDetectionTool({ completeAfterMarking: false });
    await tool.execute(env);
    expect(env.calls.map((entry) => entry.method)).toEqual(["markVoicemail"]);
  });
});

describe("createVoiceApiRequestTool", () => {
  test("issues a GET with buildQuery and returns parsed JSON", async () => {
    let requested: Request | undefined;
    const tool = createVoiceApiRequestTool<unknown, VoiceSessionRecord, { lookupId: string }>({
      buildQuery: ({ args }) => ({ id: args.lookupId }),
      description: "Look up a record",
      fetch: (request) => {
        requested = request;
        return new Response(
          JSON.stringify({ found: true, id: "abc-123" }),
          { headers: { "content-type": "application/json" } },
        );
      },
      method: "GET",
      name: "lookupRecord",
      parameters: {
        properties: { lookupId: { type: "string" } },
        required: ["lookupId"],
        type: "object",
      },
      url: "https://example.com/api/records",
    });
    const env = buildExecuteEnv({ lookupId: "abc-123" });
    const result = await tool.execute(
      env as unknown as Parameters<typeof tool.execute>[0],
    );
    expect(requested?.method).toBe("GET");
    expect(requested?.url).toBe("https://example.com/api/records?id=abc-123");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ found: true, id: "abc-123" });
    expect(tool.resultToMessage?.(result)).toContain("succeeded (200)");
  });

  test("sends args as JSON body for POST and applies dynamic headers", async () => {
    let requested: Request | undefined;
    const tool = createVoiceApiRequestTool({
      buildHeaders: () => ({ authorization: "Bearer demo" }),
      description: "Create a record",
      fetch: (request) => {
        requested = request;
        return new Response(
          JSON.stringify({ created: true }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      },
      method: "POST",
      name: "createRecord",
      url: "https://example.com/api/records",
    });
    const env = buildExecuteEnv({ title: "Demo" });
    const result = await tool.execute(env);
    expect(requested?.method).toBe("POST");
    expect(requested?.headers.get("authorization")).toBe("Bearer demo");
    expect(requested?.headers.get("content-type")).toBe("application/json");
    expect(await requested?.json()).toEqual({ title: "Demo" });
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ created: true });
  });

  test("propagates non-2xx and exposes ok=false", async () => {
    const tool = createVoiceApiRequestTool({
      description: "Look up",
      fetch: () =>
        new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      method: "GET",
      name: "lookup",
      url: "https://example.com/api/lookup",
    });
    const result = await tool.execute(buildExecuteEnv());
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(tool.resultToMessage?.(result)).toContain("failed with status 404");
  });
});
