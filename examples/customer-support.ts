/**
 * Customer-support voice agent.
 *
 * Caller dials in, agent answers questions against the knowledge base, escalates
 * to a human queue when the caller asks or the LLM signals it can't handle it.
 *
 * Minimum required env: ANTHROPIC_API_KEY, plus a configured STT/TTS adapter pair.
 *
 *   bun run examples/customer-support.ts
 */
import { anthropic } from "@absolutejs/ai";
import { Elysia } from "elysia";
import {
  createAIVoiceModel,
  createVoiceAssistant,
  createVoiceCallerMemoryNamespace,
  createVoiceMemoryAssistantMemoryStore,
  createVoiceMemoryStore,
  createVoiceMemoryTraceEventStore,
  createVoiceRAGTool,
  createVoiceTranscriptRedactor,
  createVoiceTransferCallTool,
  defineVoiceAssistant,
  voice,
} from "@absolutejs/voice";
// import your TTS/STT adapters of choice — see voice-adapters monorepo.
// import { deepgram } from "@absolutejs/voice-deepgram";
// import { cartesia } from "@absolutejs/voice-cartesia";

declare const stt: import("@absolutejs/voice").STTAdapter;
declare const tts: import("@absolutejs/voice").TTSAdapter;
declare const knowledgeBase: import("@absolutejs/voice").VoiceRAGCollectionLike;

const model = createAIVoiceModel({
  model: "claude-sonnet-4-5",
  provider: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" }),
  providerName: "anthropic",
  systemPrompt:
    "You are a calm, concise customer-support agent. Use the knowledge base " +
    "tool to answer factual questions; when a caller asks to speak with a person " +
    "or you can't help, use the transferCall tool to route them to the support queue.",
});

const tools = [
  createVoiceRAGTool(knowledgeBase),
  createVoiceTransferCallTool({
    destinations: [
      {
        description: "Send the caller to a human support agent.",
        id: "human",
        message: "Connecting you to a teammate now.",
        target: "+18005550101",
      },
    ],
  }),
];

const definition = defineVoiceAssistant({
  agent: { model, tools },
  callSilenceTimeoutMs: 60_000,
  id: "customer-support",
  memory: {
    namespace: createVoiceCallerMemoryNamespace({
      identifyCaller: ({ session }) => {
        const fromPhone = session.metadata?.fromPhone;
        return typeof fromPhone === "string" ? { phone: fromPhone } : undefined;
      },
    }),
    store: createVoiceMemoryAssistantMemoryStore(),
  },
  observability: {
    trace: createVoiceMemoryTraceEventStore(),
  },
  redact: createVoiceTranscriptRedactor(),
  voice: { stt, tts },
});

const app = new Elysia()
  .use(
    voice({
      assistant: createVoiceAssistant({ agent: { model, tools }, id: "customer-support" }),
      route: definition.toSessionOptions({
        context: {},
        id: "session",
        socket: null as never,
        store: createVoiceMemoryStore(),
      }).route,
    }),
  )
  .listen(3000);

console.log(`Customer-support voice agent listening on :${app.server!.port}`);
