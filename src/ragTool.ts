import {
  createVoiceAgentTool,
  type VoiceAgentTool,
} from "./agent";
import type { VoiceSessionRecord } from "./types";

export type VoiceRAGQueryResult = {
  chunkId: string;
  chunkText: string;
  score: number;
  source?: string;
  title?: string;
  metadata?: Record<string, unknown>;
};

export type VoiceRAGSearchInput = {
  filter?: Record<string, unknown>;
  query: string;
  scoreThreshold?: number;
  signal?: AbortSignal;
  topK?: number;
};

export type VoiceRAGCollectionLike = {
  search: (
    input: VoiceRAGSearchInput,
  ) =>
    | Promise<readonly VoiceRAGQueryResult[]>
    | readonly VoiceRAGQueryResult[];
};

export type VoiceRAGToolArgs = {
  filter?: Record<string, unknown>;
  query: string;
  topK?: number;
};

export type VoiceRAGToolResult = {
  citations: VoiceRAGQueryResult[];
  message: string;
  query: string;
  topK: number;
};

export type VoiceRAGCitationSummary = {
  chunkId: string;
  score: number;
  source?: string;
  title?: string;
};

export const extractVoiceRAGCitations = (
  toolResults: ReadonlyArray<{
    result?: unknown;
    toolName: string;
  }>,
  toolName = "searchKnowledgeBase",
): VoiceRAGCitationSummary[] => {
  const out: VoiceRAGCitationSummary[] = [];
  for (const entry of toolResults) {
    if (entry.toolName !== toolName) {
      continue;
    }
    const result = entry.result as VoiceRAGToolResult | undefined;
    const citations = result?.citations;
    if (!Array.isArray(citations)) {
      continue;
    }
    for (const citation of citations) {
      out.push({
        chunkId: citation.chunkId,
        score: citation.score,
        source: citation.source,
        title: citation.title,
      });
    }
  }
  return out;
};

export type VoiceRAGToolOptions<TContext = unknown> = {
  allowedFilterKeys?: readonly string[];
  description?: string;
  fixedFilter?:
    | Record<string, unknown>
    | ((input: { context: TContext }) => Record<string, unknown> | undefined);
  formatResult?: (
    citations: readonly VoiceRAGQueryResult[],
    args: VoiceRAGToolArgs,
  ) => string;
  maxChunkChars?: number;
  maxTopK?: number;
  name?: string;
  parameters?: Record<string, unknown>;
  resultToMessage?: (result: VoiceRAGToolResult) => string;
  scoreThreshold?: number;
  topK?: number;
};

const DEFAULT_TOOL_NAME = "searchKnowledgeBase";
const DEFAULT_DESCRIPTION =
  "Search the knowledge base and return short grounded citations. Use this whenever the caller asks a question that may be answered by indexed reference material.";
const DEFAULT_TOP_K = 6;
const DEFAULT_MAX_TOP_K = 20;
const DEFAULT_MAX_CHUNK_CHARS = 320;

const truncate = (value: string, limit: number): string => {
  if (limit <= 0 || value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

const formatScore = (score: number): string => {
  if (!Number.isFinite(score)) return "n/a";
  return score.toFixed(3);
};

const buildDefaultCitationMessage = (
  citations: readonly VoiceRAGQueryResult[],
  args: VoiceRAGToolArgs,
  maxChunkChars: number,
): string => {
  if (citations.length === 0) {
    return `No knowledge base results for "${args.query}".`;
  }
  const lines = citations.map((citation, index) => {
    const label = citation.title ?? citation.source ?? citation.chunkId;
    const text = truncate(citation.chunkText, maxChunkChars);
    return `${String(index + 1)}. ${label} (score ${formatScore(citation.score)}): ${text}`;
  });
  return [
    `Knowledge base results for "${args.query}":`,
    ...lines,
  ].join("\n");
};

const filterAllowedFilterKeys = (
  filter: Record<string, unknown> | undefined,
  allowedKeys: readonly string[] | undefined,
): Record<string, unknown> | undefined => {
  if (!filter) return undefined;
  if (!allowedKeys) return filter;
  const allowed = new Set(allowedKeys);
  const entries = Object.entries(filter).filter(([key]) => allowed.has(key));
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};

const mergeFilters = (
  ...filters: ReadonlyArray<Record<string, unknown> | undefined>
): Record<string, unknown> | undefined => {
  const present = filters.filter(
    (entry): entry is Record<string, unknown> => entry !== undefined,
  );
  if (present.length === 0) return undefined;
  return Object.assign({}, ...present);
};

const buildVoiceRAGToolParameters = (
  options: Pick<
    VoiceRAGToolOptions,
    "allowedFilterKeys" | "maxTopK" | "parameters" | "topK"
  >,
): Record<string, unknown> => {
  if (options.parameters) return options.parameters;
  const defaultTopK = options.topK ?? DEFAULT_TOP_K;
  const maxTopK = options.maxTopK ?? DEFAULT_MAX_TOP_K;
  const properties: Record<string, unknown> = {
    query: {
      description:
        "Natural-language question to look up in the knowledge base.",
      type: "string",
    },
    topK: {
      default: defaultTopK,
      description: `How many citations to return (1-${String(maxTopK)}).`,
      maximum: maxTopK,
      minimum: 1,
      type: "integer",
    },
  };
  if (options.allowedFilterKeys && options.allowedFilterKeys.length > 0) {
    properties.filter = {
      additionalProperties: false,
      description:
        "Optional metadata filter. Only keys listed here are honored: " +
        options.allowedFilterKeys.join(", "),
      properties: Object.fromEntries(
        options.allowedFilterKeys.map((key) => [key, {}]),
      ),
      type: "object",
    };
  }
  return {
    additionalProperties: false,
    properties,
    required: ["query"],
    type: "object",
  };
};

export const createVoiceRAGTool = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  collection: VoiceRAGCollectionLike,
  options: VoiceRAGToolOptions<TContext> = {},
): VoiceAgentTool<TContext, TSession, VoiceRAGToolArgs, VoiceRAGToolResult> => {
  const name = options.name ?? DEFAULT_TOOL_NAME;
  const description = options.description ?? DEFAULT_DESCRIPTION;
  const defaultTopK = options.topK ?? DEFAULT_TOP_K;
  const maxTopK = options.maxTopK ?? DEFAULT_MAX_TOP_K;
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const parameters = buildVoiceRAGToolParameters(options);

  return createVoiceAgentTool<
    TContext,
    TSession,
    VoiceRAGToolArgs,
    VoiceRAGToolResult
  >({
    description,
    execute: async ({ args, context }) => {
      const query =
        typeof args?.query === "string" ? args.query.trim() : "";
      if (query.length === 0) {
        const empty: VoiceRAGToolResult = {
          citations: [],
          message: "Knowledge base search requires a non-empty query.",
          query: "",
          topK: 0,
        };
        return empty;
      }
      const requestedTopK =
        typeof args?.topK === "number" && Number.isFinite(args.topK)
          ? Math.min(maxTopK, Math.max(1, Math.floor(args.topK)))
          : defaultTopK;
      const llmFilter = filterAllowedFilterKeys(
        args?.filter,
        options.allowedFilterKeys,
      );
      const fixedFilter =
        typeof options.fixedFilter === "function"
          ? options.fixedFilter({ context })
          : options.fixedFilter;
      const filter = mergeFilters(fixedFilter, llmFilter);
      const rawResults = await collection.search({
        filter,
        query,
        scoreThreshold: options.scoreThreshold,
        topK: requestedTopK,
      });
      const citations = Array.from(rawResults).slice(0, requestedTopK);
      const formatter = options.formatResult
        ? options.formatResult
        : (
            entries: readonly VoiceRAGQueryResult[],
            innerArgs: VoiceRAGToolArgs,
          ) =>
            buildDefaultCitationMessage(entries, innerArgs, maxChunkChars);
      const message = formatter(citations, {
        filter,
        query,
        topK: requestedTopK,
      });
      return {
        citations,
        message,
        query,
        topK: requestedTopK,
      };
    },
    name,
    parameters,
    resultToMessage:
      options.resultToMessage ?? ((result) => result.message),
  });
};
