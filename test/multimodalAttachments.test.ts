import type {
  AIChunk,
  AIProviderConfig,
  AIProviderMessage,
  AIProviderStreamParams,
} from "@absolutejs/ai";
import { describe, expect, test } from "bun:test";
import { createAIVoiceModel } from "../src/core/aiVoiceModel";
import type {
  VoiceAgentMessage,
  VoiceAgentMessageAttachment,
} from "../src/core/agent";
import type { VoiceSessionRecord, VoiceTurnRecord } from "../src/core/types";

const emptyTurn: VoiceTurnRecord = {
  committedAt: 0,
  id: "turn-1",
  text: "",
  transcripts: [],
};

const emptySession: VoiceSessionRecord = {
  committedTurnIds: [],
  createdAt: 0,
  currentTurn: { finalText: "", partialText: "", transcripts: [] },
  id: "session-1",
  reconnect: { attempts: 0 },
  status: "active",
  transcripts: [],
  turns: [],
};

const captureProvider = () => {
  const captured: AIProviderStreamParams[] = [];
  const provider: AIProviderConfig = {
    stream: (params) => {
      captured.push(params);
      return (async function* () {
        yield { type: "done" } as AIChunk;
      })();
    },
  };
  return { captured, provider };
};

const imageAttachment: VoiceAgentMessageAttachment = {
  data: "iVBORw0KGgo=",
  kind: "image",
  mediaType: "image/png",
};

describe("createAIVoiceModel multimodal translation", () => {
  test("turns attachments into image content blocks alongside text", async () => {
    const { captured, provider } = captureProvider();
    const model = createAIVoiceModel({ model: "test", provider });
    const messages: VoiceAgentMessage[] = [
      {
        attachments: [imageAttachment],
        content: "What's in this picture?",
        role: "user",
      },
    ];
    await model.generate({
      agentId: "a",
      context: {},
      messages,
      session: emptySession,
      tools: [],
      turn: emptyTurn,
    });
    const sentMessage = captured[0]!.messages[0]! as AIProviderMessage;
    expect(Array.isArray(sentMessage.content)).toBe(true);
    const blocks = sentMessage.content as Array<{ type: string }>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      content: "What's in this picture?",
      type: "text",
    });
    expect(blocks[1]).toMatchObject({
      source: {
        data: "iVBORw0KGgo=",
        media_type: "image/png",
        type: "base64",
      },
      type: "image",
    });
  });

  test("turns document attachments into document content blocks with optional name", async () => {
    const { captured, provider } = captureProvider();
    const model = createAIVoiceModel({ model: "test", provider });
    const messages: VoiceAgentMessage[] = [
      {
        attachments: [
          {
            data: "JVBERi0xLjQ",
            kind: "document",
            mediaType: "application/pdf",
            name: "policy.pdf",
          },
        ],
        content: "Summarize this",
        role: "user",
      },
    ];
    await model.generate({
      agentId: "a",
      context: {},
      messages,
      session: emptySession,
      tools: [],
      turn: emptyTurn,
    });
    const sentMessage = captured[0]!.messages[0]! as AIProviderMessage;
    const blocks = sentMessage.content as Array<{
      name?: string;
      type: string;
    }>;
    const documentBlock = blocks.find((b) => b.type === "document");
    expect(documentBlock).toBeDefined();
    expect(documentBlock!.name).toBe("policy.pdf");
  });

  test("keeps the user message as plain string when no attachments are present", async () => {
    const { captured, provider } = captureProvider();
    const model = createAIVoiceModel({ model: "test", provider });
    await model.generate({
      agentId: "a",
      context: {},
      messages: [{ content: "hi", role: "user" }],
      session: emptySession,
      tools: [],
      turn: emptyTurn,
    });
    const sentMessage = captured[0]!.messages[0]! as AIProviderMessage;
    expect(typeof sentMessage.content).toBe("string");
    expect(sentMessage.content).toBe("hi");
  });
});
