import type {
  AIChunk,
  AIProviderConfig,
  AIProviderStreamParams,
} from "@absolutejs/ai";
import { describe, expect, test } from "bun:test";
import { createAIVoiceModel } from "../src/aiVoiceModel";
import type { VoiceSessionRecord, VoiceTurnRecord } from "../src/types";

const emptyTurn: VoiceTurnRecord = {
  committedAt: 0,
  id: "turn-1",
  text: "",
  transcripts: [],
};

const emptySession: VoiceSessionRecord = {
  committedTurnIds: [],
  createdAt: 0,
  currentTurn: {
    finalText: "",
    partialText: "",
    transcripts: [],
  },
  id: "session-1",
  reconnect: { attempts: 0 },
  status: "active",
  transcripts: [],
  turns: [],
};

const makeProvider = (chunks: AIChunk[]) => {
  const captured: AIProviderStreamParams[] = [];
  const provider: AIProviderConfig = {
    stream: (params: AIProviderStreamParams) => {
      captured.push(params);
      return (async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      })();
    },
  };
  return { captured, provider };
};

describe("createAIVoiceModel", () => {
  test("accumulates text chunks into assistantText", async () => {
    const { provider } = makeProvider([
      { content: "Hello, ", type: "text" },
      { content: "world", type: "text" },
      { type: "done" },
    ]);

    const model = createAIVoiceModel({ model: "test", provider });
    const output = await model.generate({
      agentId: "a",
      context: {},
      messages: [{ content: "hi", role: "user" }],
      session: emptySession,
      tools: [],
      turn: emptyTurn,
    });

    expect(output.assistantText).toBe("Hello, world");
    expect(output.toolCalls).toBeUndefined();
  });

  test("collects tool_use chunks into toolCalls", async () => {
    const { provider } = makeProvider([
      { content: "calling tool: ", type: "text" },
      { id: "call-1", input: { x: 1 }, name: "lookup", type: "tool_use" },
      { type: "done" },
    ]);

    const model = createAIVoiceModel({ model: "test", provider });
    const output = await model.generate({
      agentId: "a",
      context: {},
      messages: [{ content: "hi", role: "user" }],
      session: emptySession,
      tools: [
        {
          description: "Look something up",
          name: "lookup",
          parameters: {
            properties: { x: { type: "number" } },
            type: "object",
          },
        },
      ],
      turn: emptyTurn,
    });

    expect(output.assistantText).toBe("calling tool: ");
    expect(output.toolCalls).toEqual([
      { args: { x: 1 }, id: "call-1", name: "lookup" },
    ]);
  });

  test("translates tool messages to tool_result content blocks", async () => {
    const { captured, provider } = makeProvider([{ type: "done" }]);

    const model = createAIVoiceModel({
      model: "test",
      provider,
      systemPrompt: "you are friendly",
    });
    await model.generate({
      agentId: "a",
      context: {},
      messages: [
        { content: "hi", role: "user" },
        { content: "ok", role: "assistant" },
        {
          content: "result data",
          name: "lookup",
          role: "tool",
          toolCallId: "call-1",
        },
      ],
      session: emptySession,
      tools: [],
      turn: emptyTurn,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.systemPrompt).toBe("you are friendly");
    const toolResultMessage = captured[0]?.messages.at(-1);
    expect(toolResultMessage?.role).toBe("user");
    expect(toolResultMessage?.content).toEqual([
      {
        content: "result data",
        tool_use_id: "call-1",
        type: "tool_result",
      },
    ]);
  });
});
