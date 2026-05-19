/**
 * Scheduler voice agent.
 *
 * Caller books an appointment by speaking. Agent confirms time, name, and reason
 * via a structured-output tool that writes to your calendar backend.
 */
import { anthropic } from "@absolutejs/ai";
import { Elysia } from "elysia";
import {
  createAIVoiceModel,
  createVoiceAgentTool,
  createVoiceAssistant,
  createVoiceMemoryStore,
  defineVoiceAssistant,
  voice,
} from "@absolutejs/voice";

declare const stt: import("@absolutejs/voice").STTAdapter;
declare const tts: import("@absolutejs/voice").TTSAdapter;

const bookAppointment = createVoiceAgentTool<
  unknown,
  import("@absolutejs/voice").VoiceSessionRecord,
  { atIso: string; durationMin: number; reason?: string; visitor: string }
>({
  description: "Book an appointment on the company calendar.",
  execute: async ({ args }) => {
    // Replace with your real calendar call (Google/Calendly/Outlook/etc.).
    const response = await fetch(`${process.env.CALENDAR_URL}/book`, {
      body: JSON.stringify({
        durationMinutes: args.durationMin,
        reason: args.reason,
        startsAt: args.atIso,
        visitor: args.visitor,
      }),
      headers: {
        authorization: `Bearer ${process.env.CALENDAR_TOKEN ?? ""}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      return { booked: false, reason: `Calendar API returned ${response.status}` };
    }
    return { booked: true, confirmation: await response.json() };
  },
  name: "bookAppointment",
  parameters: {
    properties: {
      atIso: { description: "Appointment start in ISO 8601.", type: "string" },
      durationMin: { type: "integer" },
      reason: { type: "string" },
      visitor: { type: "string" },
    },
    required: ["atIso", "durationMin", "visitor"],
    type: "object",
  },
});

const definition = defineVoiceAssistant({
  agent: {
    model: createAIVoiceModel({
      model: "claude-sonnet-4-5",
      provider: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" }),
      providerName: "anthropic",
      systemPrompt:
        "You are a friendly scheduler. Collect the caller's name, preferred " +
        "time, and reason for the visit. Confirm the booking with bookAppointment.",
    }),
    tools: [bookAppointment],
  },
  callSilenceTimeoutMs: 45_000,
  id: "scheduler",
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

console.log(`Scheduler agent listening on :${app.server!.port}`);
