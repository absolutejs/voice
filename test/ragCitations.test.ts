import { describe, expect, test } from "bun:test";
import {
  extractVoiceRAGCitations,
  type VoiceRAGToolResult,
} from "../src/ragTool";

const ragResult = (chunks: Array<{ id: string; score: number; title?: string }>): VoiceRAGToolResult => ({
  citations: chunks.map((chunk) => ({
    chunkId: chunk.id,
    chunkText: `text for ${chunk.id}`,
    score: chunk.score,
    title: chunk.title,
  })),
  message: "",
  query: "q",
  topK: chunks.length,
});

describe("extractVoiceRAGCitations", () => {
  test("returns citations from matching tool results", () => {
    const citations = extractVoiceRAGCitations([
      {
        result: ragResult([
          { id: "chunk-1", score: 0.91, title: "Policy" },
          { id: "chunk-2", score: 0.7 },
        ]),
        toolName: "searchKnowledgeBase",
      },
    ]);
    expect(citations).toEqual([
      {
        chunkId: "chunk-1",
        score: 0.91,
        source: undefined,
        title: "Policy",
      },
      {
        chunkId: "chunk-2",
        score: 0.7,
        source: undefined,
        title: undefined,
      },
    ]);
  });

  test("skips tool results from other tools", () => {
    const citations = extractVoiceRAGCitations([
      {
        result: ragResult([{ id: "c1", score: 0.9 }]),
        toolName: "endCall",
      },
      {
        result: ragResult([{ id: "c2", score: 0.8 }]),
        toolName: "searchKnowledgeBase",
      },
    ]);
    expect(citations).toHaveLength(1);
    expect(citations[0]!.chunkId).toBe("c2");
  });

  test("honors a custom tool name", () => {
    const citations = extractVoiceRAGCitations(
      [
        {
          result: ragResult([{ id: "c3", score: 0.5 }]),
          toolName: "kbLookup",
        },
      ],
      "kbLookup",
    );
    expect(citations).toHaveLength(1);
    expect(citations[0]!.chunkId).toBe("c3");
  });

  test("returns empty when tool result has no citations", () => {
    const citations = extractVoiceRAGCitations([
      {
        result: { message: "", query: "q", topK: 0 },
        toolName: "searchKnowledgeBase",
      },
    ]);
    expect(citations).toEqual([]);
  });
});
