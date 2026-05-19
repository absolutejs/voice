export type VoiceIceServer = {
  credential?: string;
  urls: string | string[];
  username?: string;
};

export type CreateCoturnIceServersInput = {
  /** TURN realm. */
  realm: string;
  /** Credential TTL in seconds. Default 3600. */
  ttlSec?: number;
  /** Coturn shared secret (use_auth_secret). */
  sharedSecret: string;
  /** TURN endpoint host:port (e.g. 'turn.example.com:3478'). */
  turnHost: string;
  /** Username to derive ephemeral credential for. */
  username: string;
  /** Optional STUN endpoints to prepend. Default ['stun:stun.l.google.com:19302']. */
  stunUrls?: string[];
  /** UTC unix-seconds NOW override for testing. */
  now?: number;
  /** SHA-1 HMAC implementation for testing. Defaults to crypto.subtle. */
  hmacSha1Base64?: (key: string, message: string) => Promise<string>;
};

const toBase64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
};

const defaultHmacSha1Base64 = async (
  key: string,
  message: string,
): Promise<string> => {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { hash: "SHA-1", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );
  return toBase64(new Uint8Array(signature));
};

/**
 * Builds an iceServers array using the coturn `use-auth-secret` REST API
 * pattern: username = `${expires}:${callerId}`, credential = HMAC-SHA1(secret, username) base64-encoded.
 */
export const createCoturnIceServers = async (
  input: CreateCoturnIceServersInput,
): Promise<VoiceIceServer[]> => {
  const ttlSec = input.ttlSec ?? 3_600;
  const now = input.now ?? Math.floor(Date.now() / 1_000);
  const expires = now + ttlSec;
  const ephemeralUsername = `${expires}:${input.username}`;
  const credential = await (input.hmacSha1Base64 ?? defaultHmacSha1Base64)(
    input.sharedSecret,
    ephemeralUsername,
  );
  const stun = input.stunUrls ?? ["stun:stun.l.google.com:19302"];
  return [
    { urls: stun },
    {
      credential,
      urls: [
        `turn:${input.turnHost}?transport=udp`,
        `turn:${input.turnHost}?transport=tcp`,
        `turns:${input.turnHost}?transport=tcp`,
      ],
      username: ephemeralUsername,
    },
  ];
};

export type CreateTwilioNTSIceServersInput = {
  accountSid: string;
  authToken: string;
  fetch?: typeof fetch;
};

type TwilioNTSResponse = {
  ice_servers?: Array<{
    credential?: string;
    url?: string;
    urls?: string;
    username?: string;
  }>;
  password?: string;
  username?: string;
};

const toBasicAuth = (sid: string, token: string) =>
  `Basic ${btoa(`${sid}:${token}`)}`;

export const createTwilioNTSIceServers = async (
  input: CreateTwilioNTSIceServersInput,
): Promise<VoiceIceServer[]> => {
  if (!input.accountSid || !input.authToken) {
    throw new Error("Twilio NTS requires accountSid + authToken");
  }
  const fetchImpl = input.fetch ?? globalThis.fetch.bind(globalThis);
  const response = await fetchImpl(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      input.accountSid,
    )}/Tokens.json`,
    {
      headers: {
        accept: "application/json",
        authorization: toBasicAuth(input.accountSid, input.authToken),
      },
      method: "POST",
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Twilio NTS Tokens failed: ${response.status} ${response.statusText} ${text.slice(0, 200)}`,
    );
  }
  const payload = (await response.json()) as TwilioNTSResponse;
  const entries = payload.ice_servers ?? [];
  return entries.map((entry) => ({
    credential: entry.credential,
    urls: entry.urls ?? entry.url ?? [],
    username: entry.username,
  }));
};
