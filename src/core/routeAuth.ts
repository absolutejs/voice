import { Elysia } from "elysia";
import {
  extractVoiceWebhookSignatureFromHeaders,
  verifyVoiceWebhookSignature,
} from "./webhookVerification";

export type VoiceRouteAuthDecision =
  | { allow: true }
  | { allow: false; reason: string; status?: number };

export type VoiceRouteAuthInput = {
  body?: string;
  headers: Headers;
  method: string;
  url: string;
};

export type VoiceRouteAuthVerifier = (
  input: VoiceRouteAuthInput,
) => Promise<VoiceRouteAuthDecision> | VoiceRouteAuthDecision;

export type VoiceRouteAuthOptions = {
  bypassPaths?: ReadonlyArray<string>;
  name?: string;
  verify: VoiceRouteAuthVerifier;
};

export const createVoiceBearerAuthVerifier = (input: {
  expectedToken: string;
  headerName?: string;
}): VoiceRouteAuthVerifier => {
  const headerName = (input.headerName ?? "authorization").toLowerCase();
  const expected = `Bearer ${input.expectedToken}`;

  return ({ headers }) => {
    const value = headers.get(headerName);
    if (!value) {
      return { allow: false, reason: "missing-bearer", status: 401 };
    }
    if (value !== expected) {
      return { allow: false, reason: "bearer-mismatch", status: 401 };
    }

    return { allow: true };
  };
};

export const createVoiceHMACAuthVerifier = (input: {
  secret: string;
  toleranceMs?: number;
}): VoiceRouteAuthVerifier => async ({ body, headers }) => {
    const { signature, timestamp } =
      extractVoiceWebhookSignatureFromHeaders(headers);
    const result = await verifyVoiceWebhookSignature({
      body: body ?? "",
      secret: input.secret,
      signature,
      timestamp,
      toleranceMs: input.toleranceMs,
    });
    if (!result.ok) {
      return { allow: false, reason: result.reason, status: 401 };
    }

    return { allow: true };
  };

const isBypassed = (
  bypassPaths: ReadonlyArray<string>,
  url: string,
): boolean => {
  for (const path of bypassPaths) {
    if (url.includes(path)) return true;
  }

  return false;
};

export const createVoiceRouteAuth = (options: VoiceRouteAuthOptions) => {
  const bypassPaths = options.bypassPaths ?? [];

  return new Elysia({ name: options.name ?? "voice-route-auth" }).onRequest(
    async ({ request, set }) => {
      const {url} = request;
      if (isBypassed(bypassPaths, url)) return;
      const cloned = request.clone();
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? ""
          : await cloned.text().catch(() => "");
      const decision = await Promise.resolve(
        options.verify({
          body,
          headers: request.headers,
          method: request.method,
          url,
        }),
      );
      if (!decision.allow) {
        set.status = decision.status ?? 401;

        return new Response(
          JSON.stringify({ error: decision.reason, ok: false }),
          {
            headers: { "content-type": "application/json" },
            status: decision.status ?? 401,
          },
        );
      }
    },
  );
};
