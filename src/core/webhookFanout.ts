import { signVoiceWebhookBody } from "./webhookVerification";

export type VoiceWebhookSinkDeliveryResult = {
  attempt: number;
  durationMs: number;
  error?: string;
  ok: boolean;
  sinkId: string;
  status?: number;
};

export type VoiceWebhookSink = {
  /** Apply only when this filter returns true. Default: accept all. */
  acceptEvent?: (event: { payload?: unknown; type?: string }) => boolean;
  /** Backoff between retries in ms. Default 1_000. */
  backoffMs?: number;
  /** Extra headers. */
  headers?: Record<string, string>;
  /** Stable id used for retry queues + dead-letter tracking. */
  id: string;
  /** Max retry attempts. Default 3. */
  maxRetries?: number;
  /** HMAC signing secret. When present, signature headers are emitted. */
  signingSecret?: string;
  /** Per-request fetch timeout in ms. Default 10_000. */
  timeoutMs?: number;
  /** Target URL. */
  url: string;
};

export type VoiceWebhookFanoutOptions = {
  /** Custom fetch — used for testing. */
  fetch?: typeof fetch;
  /** Sinks to deliver to. */
  sinks: ReadonlyArray<VoiceWebhookSink>;
};

export type VoiceWebhookFanoutEvent = {
  payload: unknown;
  type?: string;
};

export type VoiceWebhookFanoutReport = {
  deliveries: VoiceWebhookSinkDeliveryResult[];
  failed: number;
  succeeded: number;
};

const deliverOnce = async (input: {
  body: string;
  fetchImpl: typeof fetch;
  sink: VoiceWebhookSink;
}): Promise<VoiceWebhookSinkDeliveryResult> => {
  const startedAt = Date.now();
  const timeoutMs = input.sink.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...input.sink.headers,
  };
  if (input.sink.signingSecret) {
    const timestamp = String(Date.now());
    headers["x-absolutejs-timestamp"] = timestamp;
    headers["x-absolutejs-signature"] = await signVoiceWebhookBody({
      body: input.body,
      secret: input.sink.signingSecret,
      timestamp,
    });
  }
  try {
    const response = await input.fetchImpl(input.sink.url, {
      body: input.body,
      headers,
      method: "POST",
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    if (!response.ok) {
      return {
        attempt: 0,
        durationMs,
        error: `HTTP ${response.status}`,
        ok: false,
        sinkId: input.sink.id,
        status: response.status,
      };
    }

    return {
      attempt: 0,
      durationMs,
      ok: true,
      sinkId: input.sink.id,
      status: response.status,
    };
  } catch (error) {
    return {
      attempt: 0,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      sinkId: input.sink.id,
    };
  } finally {
    clearTimeout(timer);
  }
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const deliverWithRetry = async (input: {
  body: string;
  fetchImpl: typeof fetch;
  sink: VoiceWebhookSink;
}): Promise<VoiceWebhookSinkDeliveryResult> => {
  const maxRetries = input.sink.maxRetries ?? 3;
  const backoffMs = input.sink.backoffMs ?? 1_000;
  let last: VoiceWebhookSinkDeliveryResult | undefined;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    last = await deliverOnce(input);
    last.attempt = attempt;
    if (last.ok) {
      return last;
    }
    if (attempt < maxRetries) {
      await sleep(backoffMs * attempt);
    }
  }

  return (
    last ?? {
      attempt: 0,
      durationMs: 0,
      error: "no attempts ran",
      ok: false,
      sinkId: input.sink.id,
    }
  );
};

export type VoiceWebhookFanout = {
  deliver: (
    event: VoiceWebhookFanoutEvent,
  ) => Promise<VoiceWebhookFanoutReport>;
};

export const createVoiceWebhookFanout = (
  options: VoiceWebhookFanoutOptions,
): VoiceWebhookFanout => {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    deliver: async (event) => {
      const body = JSON.stringify({
        payload: event.payload,
        type: event.type,
      });
      const matching = options.sinks.filter((sink) =>
        sink.acceptEvent ? sink.acceptEvent(event) : true,
      );
      const deliveries = await Promise.all(
        matching.map((sink) => deliverWithRetry({ body, fetchImpl, sink })),
      );
      const succeeded = deliveries.filter((d) => d.ok).length;

      return {
        deliveries,
        failed: deliveries.length - succeeded,
        succeeded,
      };
    },
  };
};
