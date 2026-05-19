/**
 * Intake-form voice agent.
 *
 * Caller dictates a structured intake form (e.g. healthcare, legal, insurance).
 * Agent walks through fields one at a time, captures answers, ends with a
 * structured submission. Pairs PII redaction with the call-recording artifact.
 */
import { anthropic } from "@absolutejs/ai";
import { Elysia } from "elysia";
import {
  createAIVoiceModel,
  createVoiceAgentTool,
  createVoiceAssistant,
  createVoiceMemoryRecordingStore,
  createVoiceMemoryStore,
  createVoiceTranscriptRedactor,
  defineVoiceAssistant,
  voice,
} from "@absolutejs/voice";

declare const stt: import("@absolutejs/voice").STTAdapter;
declare const tts: import("@absolutejs/voice").TTSAdapter;

type IntakeFields = {
  dateOfBirth: string;
  fullName: string;
  primaryConcern: string;
  reasonForVisit: string;
};

const submitIntake = createVoiceAgentTool<
  unknown,
  import("@absolutejs/voice").VoiceSessionRecord,
  IntakeFields
>({
  description: "Submit the completed intake form to the backend.",
  execute: async ({ args }) => {
    const response = await fetch(`${process.env.INTAKE_URL ?? ""}/submit`, {
      body: JSON.stringify(args),
      headers: {
        authorization: `Bearer ${process.env.INTAKE_TOKEN ?? ""}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    return { ok: response.ok, status: response.status };
  },
  name: "submitIntake",
  parameters: {
    properties: {
      dateOfBirth: { description: "ISO 8601 date.", type: "string" },
      fullName: { type: "string" },
      primaryConcern: { type: "string" },
      reasonForVisit: { type: "string" },
    },
    required: ["fullName", "dateOfBirth", "reasonForVisit", "primaryConcern"],
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
        "Walk the caller through the intake form one question at a time. " +
        "After collecting fullName, dateOfBirth, reasonForVisit, and " +
        "primaryConcern, confirm verbatim then call submitIntake.",
    }),
    tools: [submitIntake],
  },
  callSilenceTimeoutMs: 90_000,
  id: "intake-form",
  observability: {
    recording: {
      store: createVoiceMemoryRecordingStore(),
      userInputFormat: {
        channels: 1,
        container: "raw",
        encoding: "pcm_s16le",
        sampleRateHz: 16_000,
      },
    },
  },
  redact: createVoiceTranscriptRedactor(),
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

console.log(`Intake-form agent listening on :${app.server!.port}`);
