import {
  defineImplementation,
  defineManifest,
  toolFactory,
} from "@absolutejs/manifest";
import { Type } from "@sinclair/typebox";
import type { VoiceFileStoreOptions } from "./core/fileStore";
import type { VoicePostgresStoreOptions } from "./core/postgresStore";
import type { VoiceSQLiteStoreOptions } from "./core/sqliteStore";
import type { VoicePluginConfig, VoiceSessionStore } from "./core/types";

const tool = toolFactory<VoiceSessionStore>();

const MAX_LIST_LIMIT = 200;
const MAX_TRANSCRIPT_TURNS = 20;

/* Serializable subset of VoicePluginConfig: the conversational knobs. The
 * stt/tts/realtime adapters and the session store are instance-valued →
 * slots; onTurn (the assistant's brain) is a function → wiring concern. */
export const manifest = defineManifest<VoicePluginConfig, VoiceSessionStore>()({
  contract: 2,
  identity: {
    accent: "#f43f5e",
    category: "voice",
    description:
      "Self-hosted voice assistant runtime for Elysia: browser and phone-call sessions over WebSockets, pluggable speech-to-text (`voice/stt`), text-to-speech (`voice/tts`), and speech-to-speech (`voice/realtime`) vendor adapters, turn detection, barge-in, greetings, reconnect recovery, session stores (`voice/session-store`), traces, evals, and live-monitor surfaces — the orchestration hosted voice platforms keep behind their dashboards, inside your own server.",
    docsUrl: "https://github.com/absolutejs/voice",
    name: "@absolutejs/voice",
    tagline: "Let people talk to your site and get spoken answers.",
  },
  implements: [
    defineImplementation<never>()({
      contract: "voice/session-store",
      factory: "createVoiceMemoryStore",
      from: "@absolutejs/voice",
      title: "In memory (development only — calls are forgotten on restart)",
      wiring: {
        code: "createVoiceMemoryStore()",
        imports: [
          { from: "@absolutejs/voice", names: ["createVoiceMemoryStore"] },
        ],
      },
    }),
    defineImplementation<VoiceSQLiteStoreOptions>()({
      contract: "voice/session-store",
      factory: "createVoiceSQLiteSessionStore",
      from: "@absolutejs/voice",
      settings: Type.Object({
        path: Type.String({
          description:
            "Database file on this machine where call sessions are kept. Created if missing.",
          examples: ["./var/voice-sessions.sqlite"],
          title: "Database file",
        }),
        tableName: Type.Optional(
          Type.String({
            description: "Table the sessions are stored in.",
            title: "Table name",
          }),
        ),
      }),
      title: "SQLite file on this machine",
      wiring: {
        code: "createVoiceSQLiteSessionStore(${settings})",
        imports: [
          {
            from: "@absolutejs/voice",
            names: ["createVoiceSQLiteSessionStore"],
          },
        ],
      },
    }),
    defineImplementation<VoicePostgresStoreOptions>()({
      contract: "voice/session-store",
      factory: "createVoicePostgresSessionStore",
      from: "@absolutejs/voice",
      requires: {
        env: [
          {
            description:
              "Postgres connection string (call sessions are stored here)",
            example: "postgres://user:pass@host/db",
            key: "DATABASE_URL",
            secret: true,
          },
        ],
        services: [
          {
            description: "Stores call sessions durably",
            id: "postgres",
          },
        ],
      },
      settings: Type.Object({
        schemaName: Type.Optional(
          Type.String({
            description: "Postgres schema the table lives in.",
            title: "Schema name",
          }),
        ),
        tableName: Type.Optional(
          Type.String({
            description: "Table the sessions are stored in.",
            title: "Table name",
          }),
        ),
      }),
      title: "Postgres",
      wiring: {
        code: 'createVoicePostgresSessionStore({ connectionString: ${env.DATABASE_URL} ?? "", ...${settings} })',
        imports: [
          {
            from: "@absolutejs/voice",
            names: ["createVoicePostgresSessionStore"],
          },
        ],
      },
    }),
    defineImplementation<VoiceFileStoreOptions>()({
      contract: "voice/session-store",
      factory: "createVoiceFileSessionStore",
      from: "@absolutejs/voice",
      settings: Type.Object({
        directory: Type.String({
          description:
            "Folder on this machine where each call session is kept as a JSON file. Created if missing.",
          examples: ["./var/voice-sessions"],
          title: "Storage folder",
        }),
      }),
      title: "JSON files on this machine",
      wiring: {
        code: "createVoiceFileSessionStore(${settings})",
        imports: [
          { from: "@absolutejs/voice", names: ["createVoiceFileSessionStore"] },
        ],
      },
    }),
  ],
  requires: {
    peers: [{ name: "elysia", range: ">= 1.4.18", reason: "plugin host" }],
  },
  settings: Type.Object({
    backchannelBargeInGuard: Type.Optional(
      Type.Boolean({
        description:
          'Keep the assistant talking through listening cues like "mm-hm" or "right" instead of treating them as interruptions.',
        title: "Ignore listening cues",
      }),
    ),
    greeting: Type.Optional(
      Type.String({
        description:
          "Spoken by the assistant the moment a call connects, before the caller says anything.",
        examples: ["Hi! How can I help you today?"],
        title: "Opening greeting",
      }),
    ),
    normalizeNumbers: Type.Optional(
      Type.Boolean({
        description:
          'Rewrite spoken numbers to digits in transcripts ("ten million" becomes "10 million") so downstream systems read them consistently.',
        title: "Write numbers as digits",
      }),
    ),
    path: Type.Optional(
      Type.String({
        default: "/voice/realtime",
        description: "The WebSocket route callers connect to.",
        title: "Call route",
      }),
    ),
    preset: Type.Optional(
      Type.Union(
        [
          Type.Literal("default"),
          Type.Literal("chat"),
          Type.Literal("guided-intake"),
          Type.Literal("dictation"),
          Type.Literal("noisy-room"),
          Type.Literal("pstn-balanced"),
          Type.Literal("pstn-fast"),
          Type.Literal("reliability"),
        ],
        {
          description:
            "Tuned bundle of turn-taking and latency defaults for the kind of calls you take — casual chat, guided intake, dictation, noisy rooms, or phone lines.",
          title: "Conversation preset",
        },
      ),
    ),
    resumeGreeting: Type.Optional(
      Type.String({
        description:
          "Spoken when a dropped call reconnects, so the caller knows they are back.",
        examples: ["Sorry, we got cut off — where were we?"],
        title: "Reconnect greeting",
      }),
    ),
  }),
  slots: {
    realtime: {
      configPath: "realtime",
      contract: "voice/realtime",
      description:
        "One speech-to-speech model that listens and talks in a single stream — an alternative to picking separate speech-to-text and text-to-speech services.",
      known: ["@absolutejs/voice-openai", "@absolutejs/voice-gemini"],
    },
    session: {
      configPath: "session",
      contract: "voice/session-store",
      description:
        "Where each call's transcript and state is kept while it runs (and after, for review)",
      known: [
        "@absolutejs/voice#memory",
        "@absolutejs/voice#sqlite",
        "@absolutejs/voice#postgres",
        "@absolutejs/voice#file",
      ],
      required: true,
    },
    stt: {
      configPath: "stt",
      contract: "voice/stt",
      description:
        "The service that turns the caller's speech into text. Not needed when a speech-to-speech (realtime) adapter is chosen instead.",
      known: [
        "@absolutejs/voice-deepgram",
        "@absolutejs/voice-assemblyai",
        "@absolutejs/voice-gladia",
        "@absolutejs/voice-soniox",
        "@absolutejs/voice-speechmatics",
        "@absolutejs/voice-azure",
        "@absolutejs/voice-google-speech",
        "@absolutejs/voice-openai-whisper",
      ],
    },
    tts: {
      configPath: "tts",
      contract: "voice/tts",
      description:
        "The service that speaks the assistant's replies out loud. Not needed when a speech-to-speech (realtime) adapter is chosen instead.",
      known: [
        "@absolutejs/voice-elevenlabs",
        "@absolutejs/voice-cartesia",
        "@absolutejs/voice-azure",
        "@absolutejs/voice-lmnt",
        "@absolutejs/voice-playht",
        "@absolutejs/voice-rime",
        "@absolutejs/voice-smallest",
        "@absolutejs/voice-neets",
      ],
    },
  },
  tools: {
    delete_session: tool.runtime({
      annotations: { destructiveHint: true, idempotentHint: true },
      authorization: {
        approval: "policy",
        audience: "owner",
        effects: ["delete"],
        idempotency: { mode: "resource" },
        requiredScopes: ["voice:sessions:delete"],
        resource: { idField: "id", type: "voice-session" },
        reversible: false,
      },
      description:
        "Delete one call session (its transcript and state) by id. Deleting an unknown id succeeds.",
      input: Type.Object({ id: Type.String({ minLength: 1 }) }),
      handler: async ({ id }, store) => {
        await store.remove(id);

        return `deleted session ${id}`;
      },
    }),
    get_session: tool.runtime({
      annotations: { readOnlyHint: true },
      authorization: {
        approval: "never",
        audience: "owner",
        effects: ["read"],
        requiredScopes: ["voice:sessions:read"],
        resource: { idField: "id", type: "voice-session" },
      },
      description:
        "Fetch one call session by id: status, timing, and the committed conversation turns (caller text and assistant reply), most recent last.",
      input: Type.Object({
        id: Type.String({ minLength: 1 }),
        maxTurns: Type.Optional(
          Type.Integer({ maximum: MAX_LIST_LIMIT, minimum: 1 }),
        ),
      }),
      handler: async ({ id, maxTurns }, store) => {
        const session = await store.get(id);
        if (session === undefined) return `no session with id ${id}`;

        const limit = maxTurns ?? MAX_TRANSCRIPT_TURNS;

        return JSON.stringify({
          createdAt: session.createdAt,
          disposition: session.call?.disposition,
          id: session.id,
          lastActivityAt: session.lastActivityAt,
          status: session.status,
          turnCount: session.turns.length,
          turns: session.turns.slice(-limit).map((turn) => ({
            assistantText: turn.assistantText,
            committedAt: turn.committedAt,
            userText: turn.text,
          })),
        });
      },
    }),
    list_sessions: tool.runtime({
      annotations: { readOnlyHint: true },
      authorization: {
        approval: "never",
        audience: "owner",
        effects: ["read"],
        requiredScopes: ["voice:sessions:read"],
      },
      description:
        "List call sessions with status, creation time, last activity, and turn count — most recently active first.",
      input: Type.Object({
        limit: Type.Optional(
          Type.Integer({ maximum: MAX_LIST_LIMIT, minimum: 1 }),
        ),
      }),
      handler: async ({ limit }, store) => {
        const sessions = await store.list();

        return JSON.stringify(sessions.slice(0, limit ?? MAX_LIST_LIMIT));
      },
    }),
  },
  wiring: [
    {
      description:
        "Pick a speech-to-text and a text-to-speech service, choose where call sessions are stored, and write the onTurn handler — the assistant's brain.",
      id: "default",
      server: {
        code: [
          "// Every call's transcript and state lives in the session store.",
          "const voiceSessions = ${slot.session};",
          "",
          "// Mount with .use(voiceAssistant); callers connect over WebSocket at `path`.",
          "const voiceAssistant = voice({",
          "\tonTurn: async (session, turn) => {",
          "\t\t// TODO: generate the assistant's reply (call your LLM here).",
          '\t\treturn { assistantText: "You said: " + turn.text };',
          "\t},",
          "\tsession: voiceSessions,",
          "\tstt: ${slot.stt},",
          "\ttts: ${slot.tts},",
          "\t...${settings}",
          "});",
        ].join("\n"),
        imports: [{ from: "@absolutejs/voice", names: ["voice"] }],
        placement: "module-scope",
      },
      title: "Voice assistant with separate STT + TTS",
    },
    {
      description:
        "Use one speech-to-speech model (OpenAI Realtime, Gemini Live) that listens and talks in a single stream instead of separate STT and TTS services.",
      id: "realtime",
      server: {
        code: [
          "// Every call's transcript and state lives in the session store.",
          "const voiceSessions = ${slot.session};",
          "",
          "// Mount with .use(voiceAssistant); callers connect over WebSocket at `path`.",
          "const voiceAssistant = voice({",
          "\tonTurn: async (session, turn) => {",
          "\t\t// TODO: generate the assistant's reply (call your LLM here).",
          '\t\treturn { assistantText: "You said: " + turn.text };',
          "\t},",
          "\trealtime: ${slot.realtime},",
          "\tsession: voiceSessions,",
          "\t...${settings}",
          "});",
        ].join("\n"),
        imports: [{ from: "@absolutejs/voice", names: ["voice"] }],
        placement: "module-scope",
      },
      title: "Voice assistant with a speech-to-speech model",
    },
  ],
});
