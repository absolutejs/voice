import { describe, expect, test } from "bun:test";
import {
  createVoiceAgent,
  createVoiceMCPToolset,
  createVoiceSessionRecord,
  type MCPClientLike,
  type VoiceAgentModel,
  type VoiceSessionHandle,
} from "../src";

const mockClient = (
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>,
  calls: Array<{ name: string; arguments?: Record<string, unknown> }>,
  respond: (name: string) => Awaited<ReturnType<MCPClientLike["callTool"]>>,
): MCPClientLike => ({
  callTool: (input) => {
    calls.push(input);
    return respond(input.name);
  },
  listTools: () => ({ tools }),
});

const api = {} as VoiceSessionHandle<unknown, ReturnType<typeof createVoiceSessionRecord>, unknown>;
const turn = { committedAt: 0, id: "t", text: "hi", transcripts: [] };

describe("createVoiceMCPToolset", () => {
  test("bridges MCP tools into VoiceAgentTools with schema + description", async () => {
    const tools = await createVoiceMCPToolset({
      client: mockClient(
        [
          {
            description: "Look up weather",
            inputSchema: { properties: { city: { type: "string" } }, type: "object" },
            name: "get_weather",
          },
        ],
        [],
        () => ({ content: [{ text: "Sunny, 72F", type: "text" }] }),
      ),
    });
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("get_weather");
    expect(tools[0]?.description).toBe("Look up weather");
    expect(tools[0]?.parameters).toMatchObject({ type: "object" });
  });

  test("applies namePrefix and forwards args to callTool", async () => {
    const calls: Array<{ name: string; arguments?: Record<string, unknown> }> = [];
    const tools = await createVoiceMCPToolset({
      client: mockClient(
        [{ name: "search" }],
        calls,
        () => ({ content: [{ text: "results", type: "text" }] }),
      ),
      namePrefix: "mcp_",
    });
    expect(tools[0]?.name).toBe("mcp_search");
    const result = await tools[0]?.execute({
      api,
      args: { q: "voice agents" },
      context: {},
      session: createVoiceSessionRecord("s"),
      turn,
    });
    expect(calls[0]).toEqual({ arguments: { q: "voice agents" }, name: "search" });
    expect(result?.text).toBe("results");
    expect(result?.isError).toBe(false);
  });

  test("allow-list and block-list filter exposed tools", async () => {
    const allowOnly = await createVoiceMCPToolset({
      allowedTools: ["a"],
      client: mockClient(
        [{ name: "a" }, { name: "b" }, { name: "c" }],
        [],
        () => ({ content: [] }),
      ),
    });
    expect(allowOnly.map((tool) => tool.name)).toEqual(["a"]);

    const blocked = await createVoiceMCPToolset({
      blockedTools: ["b"],
      client: mockClient(
        [{ name: "a" }, { name: "b" }, { name: "c" }],
        [],
        () => ({ content: [] }),
      ),
    });
    expect(blocked.map((tool) => tool.name)).toEqual(["a", "c"]);
  });

  test("flattens multiple text blocks and falls back to structuredContent", async () => {
    const [textTool, structuredTool] = await createVoiceMCPToolset({
      client: mockClient(
        [{ name: "multi" }, { name: "structured" }],
        [],
        (name) =>
          name === "multi"
            ? {
                content: [
                  { text: "line one", type: "text" },
                  { text: "line two", type: "text" },
                ],
              }
            : { structuredContent: { ok: true } },
      ),
    });
    const multi = await textTool?.execute({
      api,
      args: {},
      context: {},
      session: createVoiceSessionRecord("s"),
      turn,
    });
    expect(multi?.text).toBe("line one\nline two");
    const structured = await structuredTool?.execute({
      api,
      args: {},
      context: {},
      session: createVoiceSessionRecord("s"),
      turn,
    });
    expect(structured?.text).toBe('{"ok":true}');
  });

  test("marks isError and the resultToMessage reflects it", async () => {
    const [tool] = await createVoiceMCPToolset({
      client: mockClient(
        [{ name: "boom" }],
        [],
        () => ({ content: [{ text: "permission denied", type: "text" }], isError: true }),
      ),
    });
    const result = await tool?.execute({
      api,
      args: {},
      context: {},
      session: createVoiceSessionRecord("s"),
      turn,
    });
    expect(result?.isError).toBe(true);
    expect(tool?.resultToMessage?.(result!)).toBe("Tool error: permission denied");
  });

  test("an agent can call a bridged MCP tool end to end", async () => {
    const tools = await createVoiceMCPToolset({
      client: mockClient(
        [{ description: "Get account balance", name: "get_balance" }],
        [],
        () => ({ content: [{ text: "$42.00", type: "text" }] }),
      ),
    });
    const model: VoiceAgentModel = {
      generate: ({ messages }) => {
        const toolMessage = messages.find((message) => message.role === "tool");
        if (!toolMessage) {
          return {
            toolCalls: [{ args: {}, id: "c1", name: "get_balance" }],
          };
        }
        return { assistantText: `Your balance is ${toolMessage.content}.` };
      },
    };
    const agent = createVoiceAgent({ id: "mcp-agent", model, tools });
    const result = await agent.run({
      api,
      context: {},
      session: createVoiceSessionRecord("s"),
      turn: { committedAt: 0, id: "t", text: "balance?", transcripts: [] },
    });
    expect(result.assistantText).toBe("Your balance is $42.00.");
  });
});
