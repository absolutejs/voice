import type {
  AIProviderConfig,
  AIProviderMessage,
  AIProviderToolDefinition,
  AIUsage,
} from "@absolutejs/ai";
import type {
  VoiceAgentMessage,
  VoiceAgentModel,
  VoiceAgentModelInput,
  VoiceAgentModelOutput,
  VoiceAgentToolCall,
} from "./agent";
import type { VoiceSessionRecord } from "./types";

export type CreateAIVoiceModelOptions = {
  model: string;
  onUsage?: (usage: AIUsage & { model: string; provider?: string }) => void;
  provider: AIProviderConfig;
  providerName?: string;
  signal?: AbortSignal;
  systemPrompt?: string;
};

const toProviderMessages = (
  messages: VoiceAgentMessage[],
): AIProviderMessage[] => {
  const out: AIProviderMessage[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      out.push({
        content: [
          {
            content: message.content,
            tool_use_id: message.toolCallId ?? message.name ?? "",
            type: "tool_result",
          },
        ],
        role: "user",
      });
      continue;
    }
    if (message.role === "system") {
      out.push({ content: message.content, role: "user" });
      continue;
    }
    if (
      message.role === "user" &&
      message.attachments &&
      message.attachments.length > 0
    ) {
      const blocks: AIProviderMessage["content"] = [];
      if (message.content) {
        blocks.push({ content: message.content, type: "text" });
      }
      for (const attachment of message.attachments) {
        if (attachment.kind === "image") {
          blocks.push({
            source: {
              data: attachment.data,
              media_type: attachment.mediaType,
              type: "base64",
            },
            type: "image",
          });
        } else if (attachment.kind === "document") {
          blocks.push({
            name: attachment.name,
            source: {
              data: attachment.data,
              media_type: attachment.mediaType,
              type: "base64",
            },
            type: "document",
          });
        }
      }
      out.push({ content: blocks, role: "user" });
      continue;
    }
    out.push({ content: message.content, role: message.role });
  }

  return out;
};

const toProviderTools = (
  tools: VoiceAgentModelInput["tools"],
): AIProviderToolDefinition[] | undefined => {
  if (tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
    description: tool.description ?? "",
    input_schema: tool.parameters ?? {
      properties: {},
      type: "object",
    },
    name: tool.name,
  }));
};

export const createAIVoiceModel = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: CreateAIVoiceModelOptions,
): VoiceAgentModel<TContext, TSession, TResult> => ({
  generate: async (input) => {
    const systemPrompt = input.system ?? options.systemPrompt;
    const stream = options.provider.stream({
      messages: toProviderMessages(input.messages),
      model: options.model,
      signal: options.signal,
      systemPrompt,
      tools: toProviderTools(input.tools),
    });

    let assistantText = "";
    const toolCalls: VoiceAgentToolCall[] = [];

    for await (const chunk of stream) {
      if (chunk.type === "text") {
        assistantText += chunk.content;
      } else if (chunk.type === "tool_use") {
        toolCalls.push({
          args: (chunk.input as Record<string, unknown> | undefined) ?? {},
          id: chunk.id,
          name: chunk.name,
        });
      } else if (chunk.type === "done" && chunk.usage && options.onUsage) {
        options.onUsage({
          ...chunk.usage,
          model: options.model,
          provider: options.providerName,
        });
      }
    }

    const output: VoiceAgentModelOutput<TResult> = {
      assistantText,
    };
    if (toolCalls.length > 0) {
      output.toolCalls = toolCalls;
    }

    return output;
  },
});
