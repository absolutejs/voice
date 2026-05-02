import type {
  VoiceHandoffAction,
  VoiceHandoffAdapter,
  VoiceHandoffConfig,
  VoiceHandoffDeliveryStore,
  VoiceHandoffInput,
  VoiceHandoffResult,
  VoiceSessionRecord,
  StoredVoiceHandoffDelivery,
} from "./types";

type MaybePromise<T> = T | Promise<T>;

export type VoiceHandoffDelivery = VoiceHandoffResult & {
  adapterId: string;
  adapterKind?: string;
};

export type VoiceHandoffDeliveryRecord<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = StoredVoiceHandoffDelivery<TContext, TSession, TResult>;

export type VoiceHandoffFanoutResult = {
  action: VoiceHandoffAction;
  deliveries: Record<string, VoiceHandoffDelivery>;
  status: VoiceHandoffResult["status"];
};

export type VoiceHandoffDeliveryRecordInput<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = Omit<VoiceHandoffInput<TContext, TSession, TResult>, "api"> & {
  id?: string;
};

export type VoiceQueuedHandoffDeliveryOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  adapters: VoiceHandoffAdapter<TContext, TSession, TResult>[];
  api: VoiceHandoffInput<TContext, TSession, TResult>["api"];
  delivery: VoiceHandoffDeliveryRecord<TContext, TSession, TResult>;
  failMode?: VoiceHandoffConfig<TContext, TSession, TResult>["failMode"];
};

export type VoiceWebhookHandoffAdapterOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  actions?: VoiceHandoffAction[];
  body?: (
    input: VoiceHandoffInput<TContext, TSession, TResult>,
  ) => MaybePromise<Record<string, unknown>>;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  id: string;
  kind?: string;
  method?: "POST" | "PUT" | "PATCH";
  signingSecret?: string;
  timeoutMs?: number;
  url: string;
};

export type VoiceTwilioRedirectHandoffAdapterOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  accountSid: string;
  actions?: VoiceHandoffAction[];
  authToken: string;
  buildTwiML?: (
    input: VoiceHandoffInput<TContext, TSession, TResult>,
  ) => MaybePromise<string>;
  callSid?:
    | string
    | ((
        input: VoiceHandoffInput<TContext, TSession, TResult>,
      ) => MaybePromise<string | undefined>);
  fetch?: typeof fetch;
  id?: string;
  timeoutMs?: number;
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const signHandoffBody = async (input: {
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

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const createSkippedDelivery = <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  adapter: VoiceHandoffAdapter<TContext, TSession, TResult>,
): VoiceHandoffDelivery => ({
  adapterId: adapter.id,
  adapterKind: adapter.kind,
  status: "skipped",
});

const aggregateHandoffStatus = (
  deliveries: Record<string, VoiceHandoffDelivery>,
): VoiceHandoffResult["status"] => {
  const statuses = Object.values(deliveries).map((delivery) => delivery.status);
  if (statuses.some((status) => status === "failed")) {
    return "failed";
  }

  if (statuses.some((status) => status === "delivered")) {
    return "delivered";
  }

  return "skipped";
};

const createHandoffDeliveryId = (input: {
  action: VoiceHandoffAction;
  sessionId: string;
}) =>
  [
    "voice-handoff",
    input.sessionId,
    input.action,
    Date.now(),
    crypto.randomUUID(),
  ].join(":");

const resolveHandoffDeliveryError = (
  deliveries: Record<string, VoiceHandoffDelivery>,
) =>
  Object.values(deliveries)
    .map((delivery) => delivery.error)
    .find(Boolean);

const defaultWebhookBody = <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  input: VoiceHandoffInput<TContext, TSession, TResult>,
) => ({
  action: input.action,
  metadata: input.metadata,
  reason: input.reason,
  result: input.result,
  session: {
    id: input.session.id,
    scenarioId: input.session.scenarioId,
    status: input.session.status,
  },
  source: "absolutejs-voice",
  target: input.target,
});

export const deliverVoiceHandoff = async <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(input: {
  config?: VoiceHandoffConfig<TContext, TSession, TResult>;
  handoff: VoiceHandoffInput<TContext, TSession, TResult>;
}): Promise<VoiceHandoffFanoutResult | undefined> => {
  if (!input.config || input.config.adapters.length === 0) {
    return undefined;
  }

  const deliveries: Record<string, VoiceHandoffDelivery> = {};
  for (const adapter of input.config.adapters) {
    if (adapter.actions && !adapter.actions.includes(input.handoff.action)) {
      deliveries[adapter.id] = createSkippedDelivery(adapter);
      continue;
    }

    try {
      const result = await adapter.handoff(input.handoff);
      deliveries[adapter.id] = {
        ...result,
        adapterId: adapter.id,
        adapterKind: adapter.kind,
      };
    } catch (error) {
      deliveries[adapter.id] = {
        adapterId: adapter.id,
        adapterKind: adapter.kind,
        error: toErrorMessage(error),
        status: "failed",
      };

      if (input.config.failMode === "throw") {
        throw error;
      }
    }
  }

  return {
    action: input.handoff.action,
    deliveries,
    status: aggregateHandoffStatus(deliveries),
  };
};

export const createVoiceHandoffDeliveryRecord = <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  input: VoiceHandoffDeliveryRecordInput<TContext, TSession, TResult>,
): VoiceHandoffDeliveryRecord<TContext, TSession, TResult> => {
  const now = Date.now();
  return {
    action: input.action,
    context: input.context,
    createdAt: now,
    deliveryAttempts: 0,
    deliveryStatus: "pending",
    id:
      input.id ??
      createHandoffDeliveryId({
        action: input.action,
        sessionId: input.session.id,
      }),
    metadata: input.metadata,
    reason: input.reason,
    result: input.result,
    session: input.session,
    sessionId: input.session.id,
    target: input.target,
    updatedAt: now,
  };
};

export const applyVoiceHandoffDeliveryResult = <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  delivery: VoiceHandoffDeliveryRecord<TContext, TSession, TResult>,
  result: VoiceHandoffFanoutResult,
): VoiceHandoffDeliveryRecord<TContext, TSession, TResult> => ({
  ...delivery,
  deliveredAt:
    result.status === "delivered" || result.status === "skipped"
      ? Date.now()
      : delivery.deliveredAt,
  deliveries: result.deliveries,
  deliveryAttempts: (delivery.deliveryAttempts ?? 0) + 1,
  deliveryError:
    result.status === "failed"
      ? resolveHandoffDeliveryError(result.deliveries)
      : undefined,
  deliveryStatus: result.status,
  updatedAt: Date.now(),
});

export const deliverVoiceHandoffDelivery = async <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  options: VoiceQueuedHandoffDeliveryOptions<TContext, TSession, TResult>,
): Promise<VoiceHandoffDeliveryRecord<TContext, TSession, TResult>> => {
  const result = await deliverVoiceHandoff({
    config: {
      adapters: options.adapters,
      failMode: options.failMode,
    },
    handoff: {
      action: options.delivery.action,
      api: options.api,
      context: options.delivery.context,
      metadata: options.delivery.metadata,
      reason: options.delivery.reason,
      result: options.delivery.result,
      session: options.delivery.session,
      target: options.delivery.target,
    },
  });

  return result
    ? applyVoiceHandoffDeliveryResult(options.delivery, result)
    : {
        ...options.delivery,
        deliveryAttempts: (options.delivery.deliveryAttempts ?? 0) + 1,
        deliveryStatus: "skipped",
        updatedAt: Date.now(),
      };
};

export const createVoiceMemoryHandoffDeliveryStore = <
  TDelivery extends VoiceHandoffDeliveryRecord = VoiceHandoffDeliveryRecord,
>(): VoiceHandoffDeliveryStore<TDelivery> => {
  const deliveries = new Map<string, TDelivery>();

  return {
    get: async (id) => deliveries.get(id),
    list: async () =>
      [...deliveries.values()].sort(
        (left, right) =>
          left.createdAt - right.createdAt || left.id.localeCompare(right.id),
      ),
    remove: async (id) => {
      deliveries.delete(id);
    },
    set: async (id, delivery) => {
      deliveries.set(id, delivery);
    },
  };
};

export const createVoiceWebhookHandoffAdapter = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: VoiceWebhookHandoffAdapterOptions<TContext, TSession, TResult>,
): VoiceHandoffAdapter<TContext, TSession, TResult> => ({
  actions: options.actions,
  handoff: async (input) => {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      return {
        deliveredTo: options.url,
        error:
          "Handoff delivery failed: fetch is not available in this runtime.",
        status: "failed",
      };
    }

    const body = JSON.stringify(
      (await options.body?.(input)) ?? defaultWebhookBody(input),
    );
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...options.headers,
    };
    if (options.signingSecret) {
      const timestamp = String(Date.now());
      headers["x-absolutejs-timestamp"] = timestamp;
      headers["x-absolutejs-signature"] = await signHandoffBody({
        body,
        secret: options.signingSecret,
        timestamp,
      });
    }

    const controller =
      options.timeoutMs && options.timeoutMs > 0
        ? new AbortController()
        : undefined;
    const timeout =
      controller && options.timeoutMs
        ? setTimeout(() => controller.abort(), options.timeoutMs)
        : undefined;

    try {
      const response = await fetchImpl(options.url, {
        body,
        headers,
        method: options.method ?? "POST",
        signal: controller?.signal,
      });
      if (!response.ok) {
        return {
          deliveredTo: options.url,
          error: `Handoff delivery failed with response ${response.status}.`,
          status: "failed",
        };
      }

      return {
        deliveredAt: Date.now(),
        deliveredTo: options.url,
        status: "delivered",
      };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  },
  id: options.id,
  kind: options.kind ?? "webhook",
});

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const defaultTwilioTransferTwiML = <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  input: VoiceHandoffInput<TContext, TSession, TResult>,
) => {
  if (!input.target) {
    return "<Response><Hangup /></Response>";
  }

  return `<Response><Dial>${escapeXml(input.target)}</Dial></Response>`;
};

const resolveTwilioCallSid = async <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  resolver: VoiceTwilioRedirectHandoffAdapterOptions<
    TContext,
    TSession,
    TResult
  >["callSid"],
  input: VoiceHandoffInput<TContext, TSession, TResult>,
) => {
  if (typeof resolver === "function") {
    return resolver(input);
  }

  if (typeof resolver === "string" && resolver.length > 0) {
    return resolver;
  }

  const metadataSid =
    typeof input.metadata?.callSid === "string"
      ? input.metadata.callSid
      : undefined;
  const sessionMetadata =
    input.session.metadata && typeof input.session.metadata === "object"
      ? (input.session.metadata as Record<string, unknown>)
      : undefined;
  const sessionSid =
    typeof sessionMetadata?.callSid === "string"
      ? sessionMetadata.callSid
      : undefined;

  return metadataSid ?? sessionSid;
};

export const createVoiceTwilioRedirectHandoffAdapter = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: VoiceTwilioRedirectHandoffAdapterOptions<
    TContext,
    TSession,
    TResult
  >,
): VoiceHandoffAdapter<TContext, TSession, TResult> => ({
  actions: options.actions ?? ["transfer"],
  handoff: async (input) => {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const callSid = await resolveTwilioCallSid(options.callSid, input);
    if (!callSid) {
      return {
        error: "Twilio handoff requires a callSid.",
        status: "failed",
      };
    }

    if (typeof fetchImpl !== "function") {
      return {
        error: "Twilio handoff failed: fetch is not available in this runtime.",
        status: "failed",
      };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      options.accountSid,
    )}/Calls/${encodeURIComponent(callSid)}.json`;
    const body = new URLSearchParams({
      Twiml: await (options.buildTwiML?.(input) ??
        defaultTwilioTransferTwiML(input)),
    });
    const auth = btoa(`${options.accountSid}:${options.authToken}`);
    const controller =
      options.timeoutMs && options.timeoutMs > 0
        ? new AbortController()
        : undefined;
    const timeout =
      controller && options.timeoutMs
        ? setTimeout(() => controller.abort(), options.timeoutMs)
        : undefined;

    try {
      const response = await fetchImpl(url, {
        body,
        headers: {
          authorization: `Basic ${auth}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
        signal: controller?.signal,
      });
      if (!response.ok) {
        return {
          deliveredTo: url,
          error: `Twilio handoff failed with response ${response.status}.`,
          status: "failed",
        };
      }

      return {
        deliveredAt: Date.now(),
        deliveredTo: url,
        metadata: {
          callSid,
        },
        status: "delivered",
      };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  },
  id: options.id ?? "twilio-redirect",
  kind: "twilio-redirect",
});
