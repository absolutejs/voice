/**
 * Sales-qualifier voice agent.
 *
 * Inbound lead, agent asks BANT-style questions (Budget, Authority, Need,
 * Timeline), scores fit, and writes to the CRM via an apiRequest tool.
 */
import { anthropic } from "@absolutejs/ai";
import { Elysia } from "elysia";
import {
  createAIVoiceModel,
  createVoiceApiRequestTool,
  createVoiceAssistant,
  createVoiceMemoryStore,
  defineVoiceAssistant,
  voice,
} from "@absolutejs/voice";

declare const stt: import("@absolutejs/voice").STTAdapter;
declare const tts: import("@absolutejs/voice").TTSAdapter;

const definition = defineVoiceAssistant({
  agent: {
    model: createAIVoiceModel({
      model: "claude-sonnet-4-5",
      provider: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" }),
      providerName: "anthropic",
      systemPrompt:
        "You qualify inbound sales leads. Get the caller's company, role, " +
        "team size, current solution, timeline, and budget. End each call by " +
        "summarizing into the logQualification tool with a score 1-5.",
    }),
    tools: [
      createVoiceApiRequestTool({
        description: "Write a lead-qualification record to the CRM.",
        method: "POST",
        name: "logQualification",
        parameters: {
          properties: {
            budget: { type: "string" },
            company: { type: "string" },
            score: { maximum: 5, minimum: 1, type: "integer" },
            summary: { type: "string" },
            timeline: { type: "string" },
          },
          required: ["company", "score", "summary"],
          type: "object",
        },
        url: () => `${process.env.CRM_URL ?? ""}/leads`,
        headers: () => ({
          authorization: `Bearer ${process.env.CRM_TOKEN ?? ""}`,
          "content-type": "application/json",
        }),
      }),
    ],
  },
  id: "sales-qualifier",
  voice: { stt, tts },
});

const app = new Elysia()
  .use(
    voice({
      assistant: createVoiceAssistant({
        agent: definition.definition.agent,
        id: definition.id,
      }),
      route: definition.toSessionOptions({
        context: {},
        id: "session",
        socket: null as never,
        store: createVoiceMemoryStore(),
      }).route,
    }),
  )
  .listen(3000);

console.log(`Sales-qualifier agent listening on :${app.server!.port}`);
