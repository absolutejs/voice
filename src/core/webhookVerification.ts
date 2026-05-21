export type VoiceWebhookVerificationReason =
  | "missing-secret"
  | "missing-signature"
  | "missing-timestamp"
  | "signature-mismatch"
  | "stale-timestamp"
  | "unsupported-algorithm";

export type VoiceWebhookVerificationResult =
  | { ok: true }
  | { ok: false; reason: VoiceWebhookVerificationReason };

export type VoiceWebhookVerificationInput = {
  body: string;
  now?: number;
  secret?: string;
  signature?: string | null;
  timestamp?: string | null;
  toleranceMs?: number;
};

export const VOICE_WEBHOOK_SIGNATURE_HEADER = "x-absolutejs-signature";
export const VOICE_WEBHOOK_TIMESTAMP_HEADER = "x-absolutejs-timestamp";

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) {
    return false;
  }
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
};

const computeSignature = async (input: {
  body: string;
  secret: string;
  timestamp: string;
}) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const payload = encoder.encode(`${input.timestamp}.${input.body}`);
  const signature = await crypto.subtle.sign("HMAC", key, payload);

  return `sha256=${toHex(new Uint8Array(signature))}`;
};

export const extractVoiceWebhookSignatureFromHeaders = (
  headers: Headers | Record<string, string | string[] | undefined>,
): { signature: string | null; timestamp: string | null } => {
  const get = (name: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    const lowerTarget = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerTarget) {
        if (Array.isArray(value)) {
          return value[0] ?? null;
        }

        return value ?? null;
      }
    }

    return null;
  };

  return {
    signature: get(VOICE_WEBHOOK_SIGNATURE_HEADER),
    timestamp: get(VOICE_WEBHOOK_TIMESTAMP_HEADER),
  };
};
export const signVoiceWebhookBody = async (input: {
  body: string;
  secret: string;
  timestamp: string;
}) => computeSignature(input);
export const verifyVoiceWebhookSignature = async (
  input: VoiceWebhookVerificationInput,
): Promise<VoiceWebhookVerificationResult> => {
  if (!input.secret) {
    return { ok: false, reason: "missing-secret" };
  }
  if (!input.signature) {
    return { ok: false, reason: "missing-signature" };
  }
  if (!input.signature.startsWith("sha256=")) {
    return { ok: false, reason: "unsupported-algorithm" };
  }
  if (!input.timestamp) {
    return { ok: false, reason: "missing-timestamp" };
  }
  const timestampMs = Number(input.timestamp);
  const toleranceMs = Math.max(0, input.toleranceMs ?? 5 * 60 * 1000);
  if (
    !Number.isFinite(timestampMs) ||
    (toleranceMs > 0 &&
      Math.abs((input.now ?? Date.now()) - timestampMs) > toleranceMs)
  ) {
    return { ok: false, reason: "stale-timestamp" };
  }
  const expected = await computeSignature({
    body: input.body,
    secret: input.secret,
    timestamp: input.timestamp,
  });
  if (!timingSafeEqual(expected, input.signature)) {
    return { ok: false, reason: "signature-mismatch" };
  }

  return { ok: true };
};
