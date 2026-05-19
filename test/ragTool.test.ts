import { describe, expect, test } from "bun:test";
import {
  createVoiceRAGTool,
  type VoiceRAGCollectionLike,
  type VoiceRAGQueryResult,
  type VoiceRAGSearchInput,
} from "../src";

const buildFakeCollection = (
  results: readonly VoiceRAGQueryResult[],
) => {
  const calls: VoiceRAGSearchInput[] = [];
  const collection: VoiceRAGCollectionLike = {
    search: (input) => {
      calls.push(input);
      return results;
    },
  };
  return { calls, collection };
};

const stubExecuteEnvironment = (
  args: Record<string, unknown> = {},
) => ({
  api: {} as never,
  args,
  context: {} as never,
  session: {
    createdAt: 0,
    id: "session-1",
    updatedAt: 0,
  } as never,
  turn: {} as never,
});

const sampleResults: readonly VoiceRAGQueryResult[] = [
  {
    chunkId: "chunk-1",
    chunkText: "AbsoluteJS Voice is a self-hosted voice operations layer.",
    score: 0.91,
    source: "voice/README.md",
    title: "Voice intro",
  },
  {
    chunkId: "chunk-2",
    chunkText: "Tools are defined via createVoiceAgentTool.",
    score: 0.84,
    source: "voice/agent.ts",
    title: "Tool authoring",
  },
];

describe("createVoiceRAGTool", () => {
  test("emits a Vapi-shaped JSON schema with default name", () => {
    const { collection } = buildFakeCollection(sampleResults);
    const tool = createVoiceRAGTool(collection);
    expect(tool.name).toBe("searchKnowledgeBase");
    expect(tool.parameters).toMatchObject({
      properties: {
        query: { type: "string" },
        topK: { type: "integer" },
      },
      required: ["query"],
      type: "object",
    });
    const properties = (tool.parameters as { properties: Record<string, unknown> })
      .properties;
    expect(properties).not.toHaveProperty("filter");
  });

  test("exposes a filter property only when allowedFilterKeys is set", () => {
    const { collection } = buildFakeCollection(sampleResults);
    const tool = createVoiceRAGTool(collection, {
      allowedFilterKeys: ["productLine", "language"],
    });
    expect(tool.parameters).toMatchObject({
      properties: {
        filter: {
          properties: {
            language: {},
            productLine: {},
          },
          type: "object",
        },
      },
    });
  });

  test("clamps topK to the configured maxTopK and forwards it to the collection", async () => {
    const { calls, collection } = buildFakeCollection(sampleResults);
    const tool = createVoiceRAGTool(collection, {
      maxTopK: 5,
      topK: 3,
    });
    const result = await tool.execute(
      stubExecuteEnvironment({ query: "hello", topK: 99 }),
    );
    expect(calls[0]?.topK).toBe(5);
    expect(result.topK).toBe(5);
    expect(result.citations).toHaveLength(sampleResults.length);
  });

  test("falls back to default topK when the LLM omits or sends garbage", async () => {
    const { calls, collection } = buildFakeCollection(sampleResults);
    const tool = createVoiceRAGTool(collection, { topK: 4 });
    await tool.execute(stubExecuteEnvironment({ query: "hello" }));
    expect(calls[0]?.topK).toBe(4);
    await tool.execute(
      stubExecuteEnvironment({ query: "hello", topK: "lots" }),
    );
    expect(calls[1]?.topK).toBe(4);
  });

  test("returns a friendly message when query is missing or empty", async () => {
    const { calls, collection } = buildFakeCollection(sampleResults);
    const tool = createVoiceRAGTool(collection);
    const result = await tool.execute(stubExecuteEnvironment({ query: "   " }));
    expect(calls.length).toBe(0);
    expect(result.citations).toEqual([]);
    expect(result.message).toContain("non-empty");
  });

  test("drops disallowed filter keys and merges fixedFilter", async () => {
    const { calls, collection } = buildFakeCollection(sampleResults);
    const tool = createVoiceRAGTool(collection, {
      allowedFilterKeys: ["productLine"],
      fixedFilter: { tenantId: "tenant-9" },
    });
    await tool.execute(
      stubExecuteEnvironment({
        filter: {
          productLine: "voice",
          tenantId: "tenant-impersonated",
        },
        query: "what is voice",
      }),
    );
    expect(calls[0]?.filter).toEqual({
      productLine: "voice",
      tenantId: "tenant-9",
    });
  });

  test("supports a context-derived fixedFilter and exposes the merged filter back to the formatter", async () => {
    const { collection } = buildFakeCollection(sampleResults);
    type Ctx = { tenantId: string };
    const tool = createVoiceRAGTool<Ctx>(collection, {
      fixedFilter: ({ context }) => ({ tenantId: context.tenantId }),
      formatResult: (citations, args) =>
        `tenant=${String((args.filter ?? {}).tenantId)} hits=${String(citations.length)}`,
    });
    const result = await tool.execute({
      ...stubExecuteEnvironment({ query: "anything" }),
      context: { tenantId: "tenant-42" } as never,
    });
    expect(result.message).toBe("tenant=tenant-42 hits=2");
  });

  test("default formatter renders numbered citations with score and source", async () => {
    const { collection } = buildFakeCollection(sampleResults);
    const tool = createVoiceRAGTool(collection);
    const result = await tool.execute(
      stubExecuteEnvironment({ query: "voice intro" }),
    );
    expect(result.message).toContain('Knowledge base results for "voice intro"');
    expect(result.message).toContain("1. Voice intro (score 0.910):");
    expect(result.message).toContain("2. Tool authoring");
  });

  test("renders an empty-results message when nothing matches", async () => {
    const { collection } = buildFakeCollection([]);
    const tool = createVoiceRAGTool(collection);
    const result = await tool.execute(
      stubExecuteEnvironment({ query: "missing topic" }),
    );
    expect(result.citations).toEqual([]);
    expect(result.message).toBe('No knowledge base results for "missing topic".');
  });

  test("truncates long chunk text in the default formatter", async () => {
    const longText = "a".repeat(500);
    const { collection } = buildFakeCollection([
      {
        chunkId: "long",
        chunkText: longText,
        score: 0.5,
        title: "long",
      },
    ]);
    const tool = createVoiceRAGTool(collection, { maxChunkChars: 50 });
    const result = await tool.execute(
      stubExecuteEnvironment({ query: "long" }),
    );
    expect(result.message).toContain("…");
    const truncatedSegment = result.message.split(": ").pop() ?? "";
    expect(truncatedSegment.length).toBeLessThanOrEqual(60);
  });

  test("uses resultToMessage when provided so the LLM sees a custom string", async () => {
    const { collection } = buildFakeCollection(sampleResults);
    const tool = createVoiceRAGTool(collection, {
      resultToMessage: (result) =>
        `Got ${String(result.citations.length)} hits for "${result.query}".`,
    });
    const result = await tool.execute(
      stubExecuteEnvironment({ query: "anything" }),
    );
    expect(tool.resultToMessage?.(result)).toBe(
      'Got 2 hits for "anything".',
    );
  });
});
