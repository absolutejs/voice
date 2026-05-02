import { Buffer } from "node:buffer";
import { Database } from "bun:sqlite";
import type { RedisClient } from "bun";
import { Elysia } from "elysia";
import {
  evaluateVoiceTelephonyContract,
  type VoiceTelephonyContractReport,
  type VoiceTelephonySetupStatus,
  type VoiceTelephonySmokeCheck,
  type VoiceTelephonySmokeReport,
} from "./contract";
import {
  createVoiceTelephonyOutcomePolicy,
  createVoiceTelephonyWebhookRoutes,
  type VoiceTelephonyOutcomePolicy,
  type VoiceTelephonyWebhookRoutesOptions,
  type VoiceTelephonyWebhookVerificationResult,
} from "../telephonyOutcome";
import type { VoiceServerMessage, VoiceSessionRecord } from "../types";
import type { VoicePostgresClient } from "../postgresStore";
import {
  createTwilioMediaStreamBridge,
  type TwilioInboundMessage,
  type TwilioMediaStreamBridgeOptions,
  type TwilioMediaStreamSocket,
  type TwilioOutboundMessage,
} from "./twilio";

export type PlivoInboundMessage =
  | {
      event: "start";
      sequenceNumber?: number;
      start?: {
        callId?: string;
        callUuid?: string;
        extra_headers?: string;
        mediaFormat?: {
          channels?: number;
          encoding?: string;
          sampleRate?: number;
        };
        streamId?: string;
      };
      streamId?: string;
    }
  | {
      event: "media";
      media: {
        payload: string;
        timestamp?: string;
        track?: "inbound" | "outbound";
      };
      sequenceNumber?: number;
      streamId?: string;
    }
  | {
      event: "dtmf";
      dtmf?: {
        digit?: string;
        timestamp?: string;
        track?: string;
      };
      sequenceNumber?: number;
      streamId?: string;
    }
  | {
      event: "playedStream";
      name?: string;
      sequenceNumber?: number;
      streamId?: string;
    }
  | {
      event: "clearedAudio";
      sequenceNumber?: number;
      streamId?: string;
    }
  | {
      event: "stop";
      sequenceNumber?: number;
      stop?: {
        callId?: string;
        callUuid?: string;
      };
      streamId?: string;
    };

export type PlivoOutboundPlayAudioMessage = {
  event: "playAudio";
  media: {
    contentType: "audio/x-mulaw";
    payload: string;
    sampleRate: 8000;
  };
};

export type PlivoOutboundClearAudioMessage = {
  event: "clearAudio";
  streamId?: string;
};

export type PlivoOutboundCheckpointMessage = {
  event: "checkpoint";
  name: string;
  streamId?: string;
};

export type PlivoOutboundMessage =
  | PlivoOutboundPlayAudioMessage
  | PlivoOutboundClearAudioMessage
  | PlivoOutboundCheckpointMessage;

export type PlivoMediaStreamSocket = {
  close: (code?: number, reason?: string) => void | Promise<void>;
  send: (data: string) => void | Promise<void>;
};

export type PlivoMediaStreamBridgeOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = Omit<
  TwilioMediaStreamBridgeOptions<TContext, TSession, TResult>,
  "onVoiceMessage"
> & {
  onVoiceMessage?: (input: {
    callId?: string;
    message: VoiceServerMessage<TResult>;
    sessionId: string;
    streamId?: string;
  }) => Promise<void> | void;
};

export type PlivoMediaStreamBridge = {
  close: (reason?: string) => Promise<void>;
  getSessionId: () => string | null;
  getStreamId: () => string | null;
  handleMessage: (raw: string | PlivoInboundMessage) => Promise<void>;
};

export type PlivoVoiceResponseOptions = {
  audioTrack?: "both" | "inbound" | "outbound";
  bidirectional?: boolean;
  contentType?:
    | "audio/x-l16;rate=8000"
    | "audio/x-l16;rate=16000"
    | "audio/x-mulaw;rate=8000";
  extraHeaders?: Record<string, string | number | boolean | undefined> | string;
  keepCallAlive?: boolean;
  noiseCancellation?: boolean;
  noiseCancellationLevel?: number;
  statusCallbackMethod?: "GET" | "POST";
  statusCallbackUrl?: string;
  streamTimeout?: number;
  streamUrl: string;
};

export type PlivoVoiceSetupStatus = VoiceTelephonySetupStatus<"plivo"> & {
  urls: VoiceTelephonySetupStatus<"plivo">["urls"] & {
    answer: string;
  };
};

export type PlivoVoiceSetupOptions = {
  path?: false | string;
  requiredEnv?: Record<string, string | undefined>;
  title?: string;
};

export type PlivoVoiceSmokeCheck = VoiceTelephonySmokeCheck;

export type PlivoVoiceSmokeReport = VoiceTelephonySmokeReport<"plivo"> & {
  answer?: {
    status: number;
    streamUrl?: string;
  };
  contract: VoiceTelephonyContractReport<"plivo">;
  setup: PlivoVoiceSetupStatus;
};

export type PlivoVoiceSmokeOptions = {
  callUuid?: string;
  eventType?: string;
  path?: false | string;
  sessionId?: string;
  sipCode?: number;
  status?: string;
  title?: string;
};

export type VoicePlivoWebhookNonceStore = {
  claim?: (nonce: string) => Promise<boolean> | boolean;
  has: (nonce: string) => Promise<boolean> | boolean;
  set: (nonce: string) => Promise<void> | void;
};

export type VoicePlivoWebhookNonceStoreOptions = {
  ttlSeconds?: number;
};

export type VoiceSQLitePlivoWebhookNonceStoreOptions =
  VoicePlivoWebhookNonceStoreOptions & {
    database?: Database;
    path?: string;
    tableName?: string;
    tablePrefix?: string;
  };

export type VoicePostgresPlivoWebhookNonceStoreOptions =
  VoicePlivoWebhookNonceStoreOptions & {
    connectionString?: string;
    schemaName?: string;
    sql?: VoicePostgresClient;
    tableName?: string;
    tablePrefix?: string;
  };

export type VoiceRedisPlivoWebhookNonceClient = Pick<
  RedisClient,
  "exists" | "set"
>;

export type VoiceRedisPlivoWebhookNonceStoreOptions =
  VoicePlivoWebhookNonceStoreOptions & {
    client?: VoiceRedisPlivoWebhookNonceClient;
    keyPrefix?: string;
    url?: string;
  };

export type VoicePlivoWebhookVerifierOptions = {
  authToken?: string;
  nonceStore?: VoicePlivoWebhookNonceStore;
  verificationUrl?:
    | string
    | ((input: { query: Record<string, unknown>; request: Request }) => string);
};

export type PlivoVoiceRoutesOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  answer?: {
    path?: string;
    response?: Omit<PlivoVoiceResponseOptions, "streamUrl">;
    streamUrl?:
      | string
      | ((input: {
          query: Record<string, unknown>;
          request: Request;
          streamPath: string;
        }) => Promise<string> | string);
  };
  bridge?: PlivoMediaStreamBridgeOptions<TContext, TSession, TResult>;
  context?: TContext;
  name?: string;
  outcomePolicy?: VoiceTelephonyOutcomePolicy;
  setup?: PlivoVoiceSetupOptions;
  smoke?: PlivoVoiceSmokeOptions;
  streamPath?: string;
  webhook?: Omit<
    VoiceTelephonyWebhookRoutesOptions<TContext, TSession, TResult>,
    "context" | "path" | "policy" | "provider"
  > & {
    authToken?: string;
    nonceStore?: VoicePlivoWebhookNonceStore;
    path?: string;
    policy?: VoiceTelephonyOutcomePolicy;
    verificationUrl?:
      | string
      | ((input: {
          query: Record<string, unknown>;
          request: Request;
        }) => string);
  };
};

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const joinUrlPath = (origin: string, path: string) =>
  `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

const resolveRequestOrigin = (request: Request) => {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const protocol = forwardedProto ?? url.protocol.replace(":", "");

  return `${protocol}://${host}`;
};

const boolAttr = (value: boolean | undefined) =>
  typeof value === "boolean" ? String(value) : undefined;

const extraHeadersAttr = (
  headers: PlivoVoiceResponseOptions["extraHeaders"],
) => {
  if (!headers || typeof headers === "string") {
    return headers;
  }

  return Object.entries(headers)
    .filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined,
    )
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(",");
};

const extractPlivoStreamUrl = (xml: string) =>
  xml.match(/<Stream\b[^>]*>([^<]+)<\/Stream>/i)?.[1]?.trim();

const createSmokeCheck = (
  name: string,
  status: PlivoVoiceSmokeCheck["status"],
  message?: string,
  details?: Record<string, unknown>,
): PlivoVoiceSmokeCheck => ({
  details,
  message,
  name,
  status,
});

const resolvePlivoStreamUrl = async <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  options: PlivoVoiceRoutesOptions<TContext, TSession, TResult>,
  input: {
    query: Record<string, unknown>;
    request: Request;
    streamPath: string;
  },
) => {
  if (typeof options.answer?.streamUrl === "function") {
    return options.answer.streamUrl(input);
  }

  if (typeof options.answer?.streamUrl === "string") {
    return options.answer.streamUrl;
  }

  const origin = resolveRequestOrigin(input.request);
  const wsOrigin = origin.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${wsOrigin}${input.streamPath}`;
};

export const createPlivoVoiceResponse = (
  options: PlivoVoiceResponseOptions,
) => {
  const attributes = [
    options.bidirectional !== undefined
      ? `bidirectional="${escapeXml(String(options.bidirectional))}"`
      : undefined,
    options.audioTrack
      ? `audioTrack="${escapeXml(options.audioTrack)}"`
      : undefined,
    options.streamTimeout
      ? `streamTimeout="${escapeXml(String(options.streamTimeout))}"`
      : undefined,
    options.contentType
      ? `contentType="${escapeXml(options.contentType)}"`
      : undefined,
    options.keepCallAlive !== undefined
      ? `keepCallAlive="${escapeXml(String(options.keepCallAlive))}"`
      : undefined,
    extraHeadersAttr(options.extraHeaders)
      ? `extraHeaders="${escapeXml(extraHeadersAttr(options.extraHeaders)!)}"`
      : undefined,
    options.statusCallbackUrl
      ? `statusCallbackUrl="${escapeXml(options.statusCallbackUrl)}"`
      : undefined,
    options.statusCallbackMethod
      ? `statusCallbackMethod="${escapeXml(options.statusCallbackMethod)}"`
      : undefined,
    boolAttr(options.noiseCancellation)
      ? `noiseCancellation="${escapeXml(boolAttr(options.noiseCancellation)!)}"`
      : undefined,
    options.noiseCancellationLevel
      ? `noiseCancellationLevel="${escapeXml(String(options.noiseCancellationLevel))}"`
      : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  const openTag = attributes ? `<Stream ${attributes}>` : "<Stream>";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${openTag}${escapeXml(options.streamUrl)}</Stream></Response>`;
};

const parsePlivoMessage = (raw: string | PlivoInboundMessage) => {
  if (typeof raw !== "string") {
    return raw;
  }

  return JSON.parse(raw) as PlivoInboundMessage;
};

const parsePlivoExtraHeaders = (headers: string | undefined) => {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(
    headers
      .split(/[;,]/)
      .map((header) => header.trim())
      .filter(Boolean)
      .map((header) => {
        const separator = header.indexOf("=");
        if (separator === -1) {
          return [header, ""];
        }
        return [
          header.slice(0, separator).trim(),
          header.slice(separator + 1).trim(),
        ];
      })
      .filter(
        (entry): entry is [string, string] => (entry[0] ?? "").length > 0,
      ),
  );
};

const plivoToTwilioMessage = (
  message: PlivoInboundMessage,
): TwilioInboundMessage | null => {
  switch (message.event) {
    case "start": {
      const streamSid =
        message.streamId ?? message.start?.streamId ?? "plivo-stream";
      const callSid = message.start?.callId ?? message.start?.callUuid;
      const customParameters = parsePlivoExtraHeaders(
        message.start?.extra_headers,
      );
      return {
        event: "start",
        start: {
          callSid,
          customParameters,
          mediaFormat: message.start?.mediaFormat,
          streamSid,
        },
        streamSid,
      };
    }
    case "media": {
      const streamSid = message.streamId ?? "plivo-stream";
      return {
        event: "media",
        media: {
          payload: message.media.payload,
          timestamp: message.media.timestamp,
          track: message.media.track ?? "inbound",
        },
        streamSid,
      };
    }
    case "playedStream":
      return {
        event: "mark",
        mark: {
          name: message.name,
        },
        streamSid: message.streamId ?? "plivo-stream",
      };
    case "stop":
      return {
        event: "stop",
        stop: {
          callSid: message.stop?.callId ?? message.stop?.callUuid,
        },
        streamSid: message.streamId ?? "plivo-stream",
      };
    case "clearedAudio":
    case "dtmf":
      return null;
  }
};

const createPlivoTwilioSocketAdapter = (
  socket: PlivoMediaStreamSocket,
): TwilioMediaStreamSocket => ({
  close: (code, reason) => socket.close(code, reason),
  send: async (data) => {
    const message = JSON.parse(data) as TwilioOutboundMessage;
    const plivoMessage: PlivoOutboundMessage | null =
      message.event === "media"
        ? {
            event: "playAudio",
            media: {
              contentType: "audio/x-mulaw",
              payload: message.media.payload,
              sampleRate: 8000,
            },
          }
        : message.event === "clear"
          ? {
              event: "clearAudio",
              streamId: message.streamSid,
            }
          : message.event === "mark"
            ? {
                event: "checkpoint",
                name: message.mark.name,
                streamId: message.streamSid,
              }
            : null;

    if (plivoMessage) {
      await Promise.resolve(socket.send(JSON.stringify(plivoMessage)));
    }
  },
});

export const createPlivoMediaStreamBridge = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  socket: PlivoMediaStreamSocket,
  options: PlivoMediaStreamBridgeOptions<TContext, TSession, TResult>,
): PlivoMediaStreamBridge => {
  const bridge = createTwilioMediaStreamBridge(
    createPlivoTwilioSocketAdapter(socket),
    {
      ...(options as TwilioMediaStreamBridgeOptions<
        TContext,
        TSession,
        TResult
      >),
      telephonyMediaCarrier: "plivo",
      onVoiceMessage: options.onVoiceMessage
        ? (input) =>
            options.onVoiceMessage?.({
              callId: input.callSid,
              message: input.message,
              sessionId: input.sessionId,
              streamId: input.streamSid,
            })
        : undefined,
    },
  );

  return {
    close: bridge.close,
    getSessionId: bridge.getSessionId,
    getStreamId: bridge.getStreamSid,
    handleMessage: async (raw) => {
      const message = plivoToTwilioMessage(parsePlivoMessage(raw));
      if (message) {
        await bridge.handleMessage(message);
      }
    },
  };
};

const toBase64 = (bytes: ArrayBuffer) =>
  Buffer.from(new Uint8Array(bytes)).toString("base64");

const timingSafeEqual = (left: string, right: string) => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index]! ^ rightBytes[index]!;
  }

  return diff === 0;
};

const signHmacSHA256Base64 = async (secret: string, payload: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      hash: "SHA-256",
      name: "HMAC",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );

  return toBase64(signature);
};

const sortedParamsForSignature = (body: unknown) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "";
  }

  return Object.entries(body as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}${String(value)}`)
    .join("");
};

export const signVoicePlivoWebhook = async (input: {
  authToken: string;
  body?: unknown;
  nonce: string;
  url: string;
}) =>
  signHmacSHA256Base64(
    input.authToken,
    `${input.url}${sortedParamsForSignature(input.body)}.${input.nonce}`,
  );

const headerList = (value: string | null) =>
  value
    ?.split(",")
    .map((signature) => signature.trim())
    .filter(Boolean) ?? [];

export const verifyVoicePlivoWebhookSignature = async (input: {
  authToken?: string;
  body?: unknown;
  headers: Headers;
  url: string;
}): Promise<VoiceTelephonyWebhookVerificationResult> => {
  if (!input.authToken) {
    return { ok: false, reason: "missing-secret" };
  }

  const nonce = input.headers.get("x-plivo-signature-v3-nonce");
  const signatures = [
    ...headerList(input.headers.get("x-plivo-signature-v3")),
    ...headerList(input.headers.get("x-plivo-signature-ma-v3")),
  ];
  if (!nonce || signatures.length === 0) {
    return { ok: false, reason: "missing-signature" };
  }

  const expected = await signVoicePlivoWebhook({
    authToken: input.authToken,
    body: input.body,
    nonce,
    url: input.url,
  });

  return signatures.some((signature) => timingSafeEqual(signature, expected))
    ? { ok: true }
    : { ok: false, reason: "invalid-signature" };
};

export const createMemoryVoicePlivoWebhookNonceStore =
  (): VoicePlivoWebhookNonceStore => {
    const nonces = new Set<string>();

    return {
      claim: (nonce) => {
        if (nonces.has(nonce)) {
          return false;
        }
        nonces.add(nonce);
        return true;
      },
      has: (nonce) => nonces.has(nonce),
      set: (nonce) => {
        nonces.add(nonce);
      },
    };
  };

const normalizePlivoStoreIdentifierSegment = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "voice";

const quotePlivoStoreIdentifier = (value: string) =>
  `"${value.replace(/"/g, '""')}"`;

const resolvePlivoNonceTableName = (input: {
  fallback: string;
  tableName?: string;
  tablePrefix?: string;
}) => {
  if (input.tableName) {
    return normalizePlivoStoreIdentifierSegment(input.tableName);
  }

  return `${normalizePlivoStoreIdentifierSegment(input.tablePrefix ?? "voice")}_${normalizePlivoStoreIdentifierSegment(input.fallback)}`;
};

const getPlivoNonceExpiresAt = (ttlSeconds?: number) =>
  typeof ttlSeconds === "number" && ttlSeconds > 0
    ? Date.now() + Math.ceil(ttlSeconds * 1000)
    : null;

export const createVoiceSQLitePlivoWebhookNonceStore = (
  options: VoiceSQLitePlivoWebhookNonceStoreOptions,
): VoicePlivoWebhookNonceStore => {
  const database =
    options.database ??
    new Database(options.path ?? ":memory:", {
      create: true,
    });
  const tableName = resolvePlivoNonceTableName({
    fallback: "plivo_webhook_nonces",
    tableName: options.tableName,
    tablePrefix: options.tablePrefix,
  });

  database.exec(
    `CREATE TABLE IF NOT EXISTS "${tableName}" (
			nonce TEXT PRIMARY KEY,
			created_at INTEGER NOT NULL,
			expires_at INTEGER
		)`,
  );
  const pruneExpired = database.query(
    `DELETE FROM "${tableName}" WHERE expires_at IS NOT NULL AND expires_at <= ?1`,
  );
  const select = database.query(
    `SELECT nonce FROM "${tableName}" WHERE nonce = ?1 AND (expires_at IS NULL OR expires_at > ?2) LIMIT 1`,
  );
  const insert = database.query(
    `INSERT OR IGNORE INTO "${tableName}" (nonce, created_at, expires_at) VALUES (?1, ?2, ?3)`,
  );
  const upsert = database.query(
    `INSERT INTO "${tableName}" (nonce, created_at, expires_at) VALUES (?1, ?2, ?3)
		 ON CONFLICT(nonce) DO UPDATE SET expires_at = excluded.expires_at`,
  );

  return {
    claim: (nonce) => {
      const now = Date.now();
      pruneExpired.run(now);
      const result = insert.run(
        nonce,
        now,
        getPlivoNonceExpiresAt(options.ttlSeconds),
      );
      return result.changes > 0;
    },
    has: (nonce) => Boolean(select.get(nonce, Date.now())),
    set: (nonce) => {
      upsert.run(nonce, Date.now(), getPlivoNonceExpiresAt(options.ttlSeconds));
    },
  };
};

const createVoicePlivoPostgresClient = async (
  options: VoicePostgresPlivoWebhookNonceStoreOptions,
): Promise<VoicePostgresClient> => {
  if (options.sql) {
    return options.sql;
  }

  if (!options.connectionString) {
    throw new Error(
      "createVoicePostgresPlivoWebhookNonceStore requires either options.sql or options.connectionString.",
    );
  }

  const sql = new Bun.SQL(options.connectionString);
  return {
    unsafe: sql.unsafe.bind(sql),
  };
};

const resolvePlivoNonceQualifiedTableName = (
  options: VoicePostgresPlivoWebhookNonceStoreOptions,
) => {
  const schema = normalizePlivoStoreIdentifierSegment(
    options.schemaName ?? "public",
  );
  const table = resolvePlivoNonceTableName({
    fallback: "plivo_webhook_nonces",
    tableName: options.tableName,
    tablePrefix: options.tablePrefix,
  });
  return `${quotePlivoStoreIdentifier(schema)}.${quotePlivoStoreIdentifier(table)}`;
};

export const createVoicePostgresPlivoWebhookNonceStore = (
  options: VoicePostgresPlivoWebhookNonceStoreOptions = {},
): VoicePlivoWebhookNonceStore => {
  const qualifiedTableName = resolvePlivoNonceQualifiedTableName(options);
  const schemaMatch = qualifiedTableName.match(/^"([^"]+)"\./);
  const client = createVoicePlivoPostgresClient(options);
  const initialized = (async () => {
    const sql = await client;
    if (schemaMatch?.[1]) {
      await sql.unsafe(
        `CREATE SCHEMA IF NOT EXISTS ${quotePlivoStoreIdentifier(schemaMatch[1])}`,
      );
    }
    await sql.unsafe(
      `CREATE TABLE IF NOT EXISTS ${qualifiedTableName} (
				nonce TEXT PRIMARY KEY,
				created_at BIGINT NOT NULL,
				expires_at BIGINT
			)`,
    );
  })();

  const pruneExpired = async () => {
    await initialized;
    const sql = await client;
    await sql.unsafe(
      `DELETE FROM ${qualifiedTableName} WHERE expires_at IS NOT NULL AND expires_at <= $1`,
      [Date.now()],
    );
  };

  return {
    claim: async (nonce) => {
      await pruneExpired();
      const sql = await client;
      const rows = await sql.unsafe(
        `INSERT INTO ${qualifiedTableName} (nonce, created_at, expires_at)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (nonce) DO NOTHING
				 RETURNING nonce`,
        [nonce, Date.now(), getPlivoNonceExpiresAt(options.ttlSeconds)],
      );
      return rows.length > 0;
    },
    has: async (nonce) => {
      await initialized;
      const sql = await client;
      const rows = await sql.unsafe(
        `SELECT nonce FROM ${qualifiedTableName}
				 WHERE nonce = $1 AND (expires_at IS NULL OR expires_at > $2)
				 LIMIT 1`,
        [nonce, Date.now()],
      );
      return rows.length > 0;
    },
    set: async (nonce) => {
      await initialized;
      const sql = await client;
      await sql.unsafe(
        `INSERT INTO ${qualifiedTableName} (nonce, created_at, expires_at)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (nonce) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
        [nonce, Date.now(), getPlivoNonceExpiresAt(options.ttlSeconds)],
      );
    },
  };
};

const getPlivoRedisNonceKey = (keyPrefix: string, nonce: string) =>
  `${keyPrefix}:${nonce}`;

export const createVoiceRedisPlivoWebhookNonceStore = (
  options: VoiceRedisPlivoWebhookNonceStoreOptions = {},
): VoicePlivoWebhookNonceStore => {
  const client = options.client ?? new Bun.RedisClient(options.url);
  const keyPrefix = options.keyPrefix?.trim() || "voice:plivo-webhook-nonce";
  const ttlSeconds = options.ttlSeconds;

  const setNonce = async (nonce: string, nx: boolean) => {
    const key = getPlivoRedisNonceKey(keyPrefix, nonce);
    if (typeof ttlSeconds === "number" && ttlSeconds > 0) {
      return client.set(
        key,
        "1",
        "EX",
        String(Math.ceil(ttlSeconds)),
        ...(nx ? (["NX"] as const) : []),
      );
    }

    return client.set(key, "1", ...(nx ? (["NX"] as const) : []));
  };

  return {
    claim: async (nonce) => (await setNonce(nonce, true)) === "OK",
    has: async (nonce) =>
      Boolean(await client.exists(getPlivoRedisNonceKey(keyPrefix, nonce))),
    set: async (nonce) => {
      await setNonce(nonce, false);
    },
  };
};

export const createVoicePlivoWebhookVerifier =
  (options: VoicePlivoWebhookVerifierOptions) =>
  async (input: {
    body: unknown;
    headers: Headers;
    query: Record<string, unknown>;
    request: Request;
  }): Promise<VoiceTelephonyWebhookVerificationResult> => {
    const verificationUrl = options.verificationUrl;
    const verification = await verifyVoicePlivoWebhookSignature({
      authToken: options.authToken,
      body: input.body,
      headers: input.headers,
      url:
        typeof verificationUrl === "function"
          ? verificationUrl({
              query: input.query,
              request: input.request,
            })
          : (verificationUrl ?? input.request.url),
    });
    if (!verification.ok) {
      return verification;
    }

    const nonceStore = options.nonceStore;
    if (!nonceStore) {
      return verification;
    }

    const nonce = input.headers.get("x-plivo-signature-v3-nonce");
    if (!nonce) {
      return { ok: false, reason: "invalid-signature" };
    }

    if (nonceStore.claim) {
      if (!(await nonceStore.claim(nonce))) {
        return { ok: false, reason: "invalid-signature" };
      }
      return verification;
    }

    if (await nonceStore.has(nonce)) {
      return { ok: false, reason: "invalid-signature" };
    }

    await nonceStore.set(nonce);
    return verification;
  };

const buildPlivoVoiceSetupStatus = async <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  options: PlivoVoiceRoutesOptions<TContext, TSession, TResult>,
  input: {
    answerPath: string;
    query: Record<string, unknown>;
    request: Request;
    streamPath: string;
    webhookPath: string;
  },
): Promise<PlivoVoiceSetupStatus> => {
  const origin = resolveRequestOrigin(input.request);
  const stream = await resolvePlivoStreamUrl(options, input);
  const answer = joinUrlPath(origin, input.answerPath);
  const webhook = joinUrlPath(origin, input.webhookPath);
  const missing = Object.entries(options.setup?.requiredEnv ?? {})
    .filter((entry) => !entry[1])
    .map(([name]) => name);
  const signingConfigured = Boolean(
    options.webhook?.authToken || options.webhook?.verify,
  );
  const warnings = [
    ...(stream.startsWith("wss://")
      ? []
      : ["Plivo audio streams should use wss:// in production."]),
    ...(signingConfigured
      ? []
      : ["Webhook signature verification is not configured."]),
  ];

  return {
    generatedAt: Date.now(),
    missing,
    provider: "plivo",
    ready: missing.length === 0 && signingConfigured && warnings.length === 0,
    signing: {
      configured: signingConfigured,
      mode: options.webhook?.verify
        ? "custom"
        : options.webhook?.authToken
          ? "provider-signature"
          : "none",
      verificationUrl: webhook,
    },
    urls: {
      answer,
      stream,
      twiml: answer,
      webhook,
    },
    warnings,
  };
};

const renderPlivoSetupHTML = (
  status: PlivoVoiceSetupStatus,
  title: string,
) => `<main style="font-family: ui-sans-serif, system-ui; max-width: 860px; margin: 40px auto; padding: 0 20px;">
<p style="letter-spacing: .12em; text-transform: uppercase; color: #52606d;">Plivo setup</p>
<h1>${escapeHtml(title)}</h1>
<p><strong>Status:</strong> ${status.ready ? "Ready" : "Needs attention"}</p>
<ul>
<li><strong>Answer XML:</strong> <code>${escapeHtml(status.urls.answer)}</code></li>
<li><strong>Audio stream:</strong> <code>${escapeHtml(status.urls.stream)}</code></li>
<li><strong>Status webhook:</strong> <code>${escapeHtml(status.urls.webhook)}</code></li>
</ul>
${status.missing.length ? `<h2>Missing env</h2><ul>${status.missing.map((name) => `<li><code>${escapeHtml(name)}</code></li>`).join("")}</ul>` : ""}
${status.warnings.length ? `<h2>Warnings</h2><ul>${status.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
</main>`;

const renderPlivoSmokeHTML = (
  report: PlivoVoiceSmokeReport,
  title: string,
) => `<main style="font-family: ui-sans-serif, system-ui; max-width: 860px; margin: 40px auto; padding: 0 20px;">
<p style="letter-spacing: .12em; text-transform: uppercase; color: #52606d;">Plivo smoke test</p>
<h1>${escapeHtml(title)}</h1>
<p><strong>Status:</strong> ${report.pass ? "Pass" : "Fail"}</p>
<ul>${report.checks.map((check) => `<li><strong>${escapeHtml(check.name)}</strong>: ${escapeHtml(check.status)}${check.message ? ` - ${escapeHtml(check.message)}` : ""}</li>`).join("")}</ul>
</main>`;

const runPlivoSmokeTest = async <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(input: {
  answerPath: string;
  app: {
    handle: (request: Request) => Response | Promise<Response>;
  };
  options: PlivoVoiceRoutesOptions<TContext, TSession, TResult>;
  query: Record<string, unknown>;
  request: Request;
  streamPath: string;
  webhookPath: string;
}): Promise<PlivoVoiceSmokeReport> => {
  const setup = await buildPlivoVoiceSetupStatus(input.options, input);
  const checks: PlivoVoiceSmokeCheck[] = [];
  const answerResponse = await input.app.handle(new Request(setup.urls.answer));
  const answerXml = await answerResponse.text();
  const streamUrl = extractPlivoStreamUrl(answerXml);
  checks.push(
    createSmokeCheck(
      "answer-xml",
      answerResponse.ok && Boolean(streamUrl) ? "pass" : "fail",
      streamUrl
        ? "Answer XML includes a Stream URL."
        : "Answer XML is missing <Stream>...</Stream>.",
      {
        status: answerResponse.status,
        streamUrl,
      },
    ),
  );
  checks.push(
    createSmokeCheck(
      "stream-url",
      streamUrl?.startsWith("wss://") ? "pass" : "fail",
      streamUrl?.startsWith("wss://")
        ? "Audio stream URL uses wss://."
        : "Audio stream URL should use wss:// for Plivo.",
      {
        streamUrl,
      },
    ),
  );

  const webhookBody = new URLSearchParams({
    CallUUID: input.options.smoke?.callUuid ?? "plivo-smoke-call",
    Duration: "0",
    Event: input.options.smoke?.eventType ?? "Hangup",
    From: "+15555550100",
    HangupCause: "busy",
    SessionId: input.options.smoke?.sessionId ?? "plivo-smoke-session",
    SipResponseCode: String(input.options.smoke?.sipCode ?? 486),
    To: "+15555550101",
    status: input.options.smoke?.status ?? "busy",
  });
  const webhookResponse = await input.app.handle(
    new Request(setup.urls.webhook, {
      body: webhookBody,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    }),
  );
  const webhookText = await webhookResponse.text();
  const webhookPayload = (() => {
    try {
      return JSON.parse(webhookText) as unknown;
    } catch {
      return webhookText;
    }
  })();
  checks.push(
    createSmokeCheck(
      "webhook",
      webhookResponse.ok ? "pass" : "fail",
      webhookResponse.ok
        ? "Synthetic Plivo event was accepted."
        : "Synthetic Plivo event failed.",
      {
        status: webhookResponse.status,
      },
    ),
  );
  for (const warning of setup.warnings) {
    checks.push(createSmokeCheck("setup-warning", "warn", warning));
  }
  for (const name of setup.missing) {
    checks.push(createSmokeCheck("missing-env", "fail", `${name} is missing.`));
  }

  const baseReport = {
    answer: {
      status: answerResponse.status,
      streamUrl,
    },
    checks,
    generatedAt: Date.now(),
    pass: checks.every((check) => check.status !== "fail"),
    provider: "plivo" as const,
    setup,
    twiml: {
      status: answerResponse.status,
      streamUrl,
    },
    webhook: {
      body: webhookPayload,
      status: webhookResponse.status,
    },
  };

  return {
    ...baseReport,
    contract: evaluateVoiceTelephonyContract({
      setup,
      smoke: baseReport,
    }),
  };
};

export const createPlivoVoiceRoutes = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: PlivoVoiceRoutesOptions<TContext, TSession, TResult> = {},
) => {
  const streamPath = options.streamPath ?? "/api/voice/plivo/stream";
  const answerPath = options.answer?.path ?? "/api/voice/plivo";
  const webhookPath = options.webhook?.path ?? "/api/voice/plivo/webhook";
  const setupPath =
    options.setup?.path === false
      ? false
      : (options.setup?.path ?? "/api/voice/plivo/setup");
  const smokePath =
    options.smoke?.path === false
      ? false
      : (options.smoke?.path ?? "/api/voice/plivo/smoke");
  const bridges = new WeakMap<object, PlivoMediaStreamBridge>();
  const webhookPolicy =
    options.webhook?.policy ??
    options.outcomePolicy ??
    createVoiceTelephonyOutcomePolicy();
  const verify =
    options.webhook?.verify ??
    (options.webhook?.authToken
      ? createVoicePlivoWebhookVerifier({
          authToken: options.webhook.authToken,
          nonceStore: options.webhook.nonceStore,
          verificationUrl: options.webhook.verificationUrl,
        })
      : undefined);
  const app = new Elysia({
    name: options.name ?? "absolutejs-voice-plivo",
  })
    .get(answerPath, async ({ query, request }) => {
      const streamUrl = await resolvePlivoStreamUrl(options, {
        query,
        request,
        streamPath,
      });
      return new Response(
        createPlivoVoiceResponse({
          ...options.answer?.response,
          streamUrl,
        }),
        {
          headers: {
            "content-type": "text/xml; charset=utf-8",
          },
        },
      );
    })
    .post(answerPath, async ({ query, request }) => {
      const streamUrl = await resolvePlivoStreamUrl(options, {
        query,
        request,
        streamPath,
      });
      return new Response(
        createPlivoVoiceResponse({
          ...options.answer?.response,
          streamUrl,
        }),
        {
          headers: {
            "content-type": "text/xml; charset=utf-8",
          },
        },
      );
    })
    .ws(streamPath, {
      close: async (ws, _code, reason) => {
        const bridge = bridges.get(ws as object);
        bridges.delete(ws as object);
        await bridge?.close(reason);
      },
      message: async (ws, raw) => {
        if (!options.bridge) {
          ws.close(1011, "Plivo media bridge is not configured.");
          return;
        }

        let bridge = bridges.get(ws as object);
        if (!bridge) {
          bridge = createPlivoMediaStreamBridge(
            {
              close: (code, reason) => {
                ws.close(code, reason);
              },
              send: (data) => {
                ws.send(data);
              },
            },
            options.bridge,
          );
          bridges.set(ws as object, bridge);
        }

        await bridge.handleMessage(raw as string);
      },
    })
    .use(
      createVoiceTelephonyWebhookRoutes({
        ...(options.webhook ?? {}),
        context: options.context as TContext,
        path: webhookPath,
        policy: webhookPolicy,
        provider: "plivo",
        requireVerification: Boolean(options.webhook?.authToken),
        resolveSessionId:
          options.webhook?.resolveSessionId ??
          (({ event }) => {
            const metadata = event.metadata;
            return typeof metadata?.SessionId === "string"
              ? metadata.SessionId
              : typeof metadata?.sessionId === "string"
                ? metadata.sessionId
                : typeof metadata?.CallUUID === "string"
                  ? metadata.CallUUID
                  : typeof metadata?.call_uuid === "string"
                    ? metadata.call_uuid
                    : undefined;
          }),
        verify,
      }),
    );

  const withSetup = setupPath
    ? app.get(setupPath, async ({ query, request }) => {
        const status = await buildPlivoVoiceSetupStatus(options, {
          answerPath,
          query,
          request,
          streamPath,
          webhookPath,
        });
        if (query.format === "html") {
          return new Response(
            renderPlivoSetupHTML(
              status,
              options.setup?.title ?? "AbsoluteJS Plivo Voice Setup",
            ),
            {
              headers: {
                "content-type": "text/html; charset=utf-8",
              },
            },
          );
        }
        return status;
      })
    : app;

  if (!smokePath) {
    return withSetup;
  }

  return withSetup.get(smokePath, async ({ query, request }) => {
    const report = await runPlivoSmokeTest({
      answerPath,
      app,
      options,
      query,
      request,
      streamPath,
      webhookPath,
    });
    if (query.format === "html") {
      return new Response(
        renderPlivoSmokeHTML(
          report,
          options.smoke?.title ?? "AbsoluteJS Plivo Voice Smoke Test",
        ),
        {
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        },
      );
    }
    return report;
  });
};
