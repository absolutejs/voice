import { createVoiceAgentTool, type VoiceAgentTool } from "./agent";
import type { VoiceSessionRecord } from "./types";

/**
 * Minimal structural shapes from the Model Context Protocol. Any MCP client
 * (`@modelcontextprotocol/sdk` over stdio / SSE / streamable-HTTP, or a custom
 * transport) that exposes `listTools` + `callTool` satisfies this — voice does
 * not bundle an MCP SDK.
 */
export type MCPToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type MCPToolContentBlock =
  | { type: "text"; text: string }
  | { type: string; [key: string]: unknown };

export type MCPToolCallResult = {
  content?: MCPToolContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
};

export type MCPClientLike = {
  listTools: () =>
    | Promise<{ tools: MCPToolDefinition[] }>
    | { tools: MCPToolDefinition[] };
  callTool: (input: {
    name: string;
    arguments?: Record<string, unknown>;
  }) => Promise<MCPToolCallResult> | MCPToolCallResult;
};

export type VoiceMCPToolResult = {
  text: string;
  structuredContent?: unknown;
  isError: boolean;
  raw: MCPToolCallResult;
};

export type CreateVoiceMCPToolsetOptions = {
  client: MCPClientLike;
  /** Prefix applied to every exposed tool name (e.g. "mcp_"). */
  namePrefix?: string;
  /** Only expose tools whose (unprefixed) name is in this allow-list. */
  allowedTools?: ReadonlyArray<string>;
  /** Drop tools whose (unprefixed) name is in this block-list. */
  blockedTools?: ReadonlyArray<string>;
  /** Override how an MCP result is flattened to the assistant-visible string. */
  resultToMessage?: (result: VoiceMCPToolResult) => string;
};

const flattenContent = (result: MCPToolCallResult): string => {
  const blocks = result.content ?? [];
  const text = blocks
    .filter(
      (block): block is { type: "text"; text: string } =>
        block.type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (text.length > 0) return text;
  if (result.structuredContent !== undefined) {
    return JSON.stringify(result.structuredContent);
  }

  return "";
};

/**
 * Bridges the tools exposed by an MCP server into `VoiceAgentTool`s. Call once
 * at setup; the returned array spreads straight into `createVoiceAgent({ tools })`.
 */
export const createVoiceMCPToolset = async <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  options: CreateVoiceMCPToolsetOptions,
): Promise<
  VoiceAgentTool<
    TContext,
    TSession,
    Record<string, unknown>,
    VoiceMCPToolResult
  >[]
> => {
  const prefix = options.namePrefix ?? "";
  const allowed = options.allowedTools
    ? new Set(options.allowedTools)
    : undefined;
  const blocked = options.blockedTools
    ? new Set(options.blockedTools)
    : undefined;
  const listed = await Promise.resolve(options.client.listTools());

  const tools: VoiceAgentTool<
    TContext,
    TSession,
    Record<string, unknown>,
    VoiceMCPToolResult
  >[] = [];

  for (const definition of listed.tools) {
    if (allowed && !allowed.has(definition.name)) continue;
    if (blocked && blocked.has(definition.name)) continue;
    const exposedName = `${prefix}${definition.name}`;
    tools.push(
      createVoiceAgentTool<
        TContext,
        TSession,
        Record<string, unknown>,
        VoiceMCPToolResult
      >({
        ...(definition.description !== undefined
          ? { description: definition.description }
          : {}),
        execute: async ({ args }) => {
          const raw = await Promise.resolve(
            options.client.callTool({
              arguments: args,
              name: definition.name,
            }),
          );
          const result: VoiceMCPToolResult = {
            isError: raw.isError === true,
            raw,
            text: flattenContent(raw),
            ...(raw.structuredContent !== undefined
              ? { structuredContent: raw.structuredContent }
              : {}),
          };

          return result;
        },
        name: exposedName,
        ...(definition.inputSchema !== undefined
          ? { parameters: definition.inputSchema }
          : {}),
        resultToMessage:
          options.resultToMessage ??
          ((result) =>
            result.isError
              ? `Tool error: ${result.text || "unknown error"}`
              : result.text || "(no output)"),
      }),
    );
  }

  return tools;
};
