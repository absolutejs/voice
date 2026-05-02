import { Elysia } from "elysia";
import type {
  StoredVoiceIntegrationEvent,
  VoiceIntegrationEventType,
} from "./ops";
import type {
  VoiceIntegrationHTTPSinkOptions,
  VoiceIntegrationSink,
} from "./opsSinks";
import { createVoiceIntegrationHTTPSink } from "./opsSinks";

type MaybePromise<T> = T | Promise<T>;

export type VoiceOpsWebhookLinkResolver =
  | string
  | ((input: {
      event: StoredVoiceIntegrationEvent;
    }) => MaybePromise<string | undefined>);

export type VoiceOpsWebhookEntity = {
  disposition?: string;
  outcome?: string;
  priority?: string;
  queue?: string;
  reviewId?: string;
  scenarioId?: string;
  sessionId?: string;
  status?: string;
  target?: string;
  taskId?: string;
};

export type VoiceOpsWebhookEnvelope = {
  entity: VoiceOpsWebhookEntity;
  event: {
    createdAt: number;
    id: string;
    payload: Record<string, unknown>;
    type: VoiceIntegrationEventType;
  };
  links?: {
    event?: string;
    replay?: string;
    review?: string;
    task?: string;
  };
  schemaVersion: 1;
  source: "absolutejs-voice";
};

export type VoiceOpsWebhookSinkOptions = Omit<
  VoiceIntegrationHTTPSinkOptions<VoiceOpsWebhookEnvelope>,
  "body"
> & {
  baseUrl?: string;
  eventHref?: VoiceOpsWebhookLinkResolver;
  replayHref?: VoiceOpsWebhookLinkResolver;
  reviewHref?: VoiceOpsWebhookLinkResolver;
  taskHref?: VoiceOpsWebhookLinkResolver;
};

export type VoiceOpsWebhookVerificationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason:
        | "invalid-signature"
        | "missing-secret"
        | "missing-signature"
        | "missing-timestamp"
        | "stale-timestamp"
        | "unsupported-algorithm";
    };

export type VoiceOpsWebhookReceiverRoutesOptions = {
  onEnvelope?: (input: {
    envelope: VoiceOpsWebhookEnvelope;
    request: Request;
  }) => MaybePromise<void>;
  path?: string;
  signingSecret?: string;
  toleranceMs?: number;
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const signVoiceOpsWebhookBody = async (input: {
  body: string;
  secret: string;
  timestamp: string;
}) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
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
    encoder.encode(`${input.timestamp}.${input.body}`),
  );

  return `sha256=${toHex(new Uint8Array(signature))}`;
};

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

const resolveWebhookLink = async (
  resolver: VoiceOpsWebhookLinkResolver | undefined,
  event: StoredVoiceIntegrationEvent,
) => {
  if (typeof resolver === "function") {
    return resolver({
      event,
    });
  }

  return resolver;
};

const joinBaseUrl = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const asString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const buildVoiceOpsWebhookEntity = (
  event: StoredVoiceIntegrationEvent,
): VoiceOpsWebhookEntity => ({
  disposition: asString(event.payload.disposition),
  outcome: asString(event.payload.outcome),
  priority: asString(event.payload.priority),
  queue: asString(event.payload.queue),
  reviewId: asString(event.payload.reviewId),
  scenarioId: asString(event.payload.scenarioId),
  sessionId: asString(event.payload.sessionId),
  status: asString(event.payload.status),
  target: asString(event.payload.target),
  taskId: asString(event.payload.taskId),
});

export const createVoiceOpsWebhookEnvelope = async (input: {
  baseUrl?: string;
  event: StoredVoiceIntegrationEvent;
  eventHref?: VoiceOpsWebhookLinkResolver;
  replayHref?: VoiceOpsWebhookLinkResolver;
  reviewHref?: VoiceOpsWebhookLinkResolver;
  taskHref?: VoiceOpsWebhookLinkResolver;
}): Promise<VoiceOpsWebhookEnvelope> => {
  const entity = buildVoiceOpsWebhookEntity(input.event);
  const replayHref =
    (await resolveWebhookLink(input.replayHref, input.event)) ??
    (input.baseUrl && entity.sessionId
      ? joinBaseUrl(
          input.baseUrl,
          `/api/voice-sessions/${encodeURIComponent(entity.sessionId)}/replay`,
        )
      : undefined);
  const links = {
    event: await resolveWebhookLink(input.eventHref, input.event),
    replay: replayHref,
    review: await resolveWebhookLink(input.reviewHref, input.event),
    task: await resolveWebhookLink(input.taskHref, input.event),
  };

  return {
    entity,
    event: {
      createdAt: input.event.createdAt,
      id: input.event.id,
      payload: input.event.payload,
      type: input.event.type,
    },
    links:
      links.event || links.replay || links.review || links.task
        ? links
        : undefined,
    schemaVersion: 1,
    source: "absolutejs-voice",
  };
};

export const createVoiceOpsWebhookSink = (
  options: VoiceOpsWebhookSinkOptions,
): VoiceIntegrationSink =>
  createVoiceIntegrationHTTPSink<VoiceOpsWebhookEnvelope>({
    ...options,
    body: ({ event }) =>
      createVoiceOpsWebhookEnvelope({
        baseUrl: options.baseUrl,
        event,
        eventHref: options.eventHref,
        replayHref: options.replayHref,
        reviewHref: options.reviewHref,
        taskHref: options.taskHref,
      }),
    kind: options.kind ?? "ops-webhook",
  });

export const verifyVoiceOpsWebhookSignature = async (input: {
  body: string;
  now?: number;
  secret?: string;
  signature?: string | null;
  timestamp?: string | null;
  toleranceMs?: number;
}): Promise<VoiceOpsWebhookVerificationResult> => {
  if (!input.secret) {
    return {
      ok: false,
      reason: "missing-secret",
    };
  }

  if (!input.signature) {
    return {
      ok: false,
      reason: "missing-signature",
    };
  }

  if (!input.signature.startsWith("sha256=")) {
    return {
      ok: false,
      reason: "unsupported-algorithm",
    };
  }

  if (!input.timestamp) {
    return {
      ok: false,
      reason: "missing-timestamp",
    };
  }

  const timestampMs = Number(input.timestamp);
  const toleranceMs = Math.max(0, input.toleranceMs ?? 5 * 60 * 1000);
  if (
    !Number.isFinite(timestampMs) ||
    (toleranceMs > 0 &&
      Math.abs((input.now ?? Date.now()) - timestampMs) > toleranceMs)
  ) {
    return {
      ok: false,
      reason: "stale-timestamp",
    };
  }

  const expected = await signVoiceOpsWebhookBody({
    body: input.body,
    secret: input.secret,
    timestamp: input.timestamp,
  });

  if (!timingSafeEqual(expected, input.signature)) {
    return {
      ok: false,
      reason: "invalid-signature",
    };
  }

  return {
    ok: true,
  };
};

export const createVoiceOpsWebhookReceiverRoutes = (
  options: VoiceOpsWebhookReceiverRoutesOptions = {},
) => {
  const path = options.path ?? "/api/voice-ops/webhook";

  return new Elysia().post(
    path,
    async ({ body, request, set }) => {
      const bodyText = typeof body === "string" ? body : JSON.stringify(body);
      if (options.signingSecret) {
        const verification = await verifyVoiceOpsWebhookSignature({
          body: bodyText,
          secret: options.signingSecret,
          signature: request.headers.get("x-absolutejs-signature"),
          timestamp: request.headers.get("x-absolutejs-timestamp"),
          toleranceMs: options.toleranceMs,
        });
        if (!verification.ok) {
          set.status = 401;
          return {
            ok: false,
            reason: verification.reason,
          };
        }
      }

      const envelope = JSON.parse(bodyText) as VoiceOpsWebhookEnvelope;
      await options.onEnvelope?.({
        envelope,
        request,
      });

      return {
        eventId: envelope.event?.id,
        ok: true,
        type: envelope.event?.type,
      };
    },
    {
      parse: "text",
    },
  );
};
