import { describe, expect, test } from "bun:test";
import { createVoiceWebhookFanout } from "../src/core/webhookFanout";

const captureFetch = (
  responses: Array<{ ok?: boolean; status: number; body?: unknown }>,
) => {
  let index = 0;
  const requests: Array<{ body?: unknown; headers?: Headers; url: string }> =
    [];
  const fetchImpl = (async (
    url: string | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    requests.push({
      body: init?.body,
      headers: new Headers(init?.headers as HeadersInit | undefined),
      url: typeof url === "string" ? url : url.toString(),
    });
    const response = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    return new Response(
      typeof response.body === "string"
        ? response.body
        : JSON.stringify(response.body ?? {}),
      { status: response.status },
    );
  }) as typeof fetch;
  return { fetch: fetchImpl, requests };
};

describe("createVoiceWebhookFanout", () => {
  test("delivers to every sink that accepts the event", async () => {
    const slack = captureFetch([{ status: 200 }]);
    const fanout = createVoiceWebhookFanout({
      fetch: slack.fetch,
      sinks: [
        { id: "slack", url: "https://slack.example/webhook" },
        { id: "zapier", url: "https://zapier.example/webhook" },
      ],
    });
    const report = await fanout.deliver({ payload: { foo: 1 }, type: "test" });
    expect(report.succeeded).toBe(2);
    expect(report.failed).toBe(0);
    expect(slack.requests).toHaveLength(2);
  });

  test("acceptEvent filter excludes a sink", async () => {
    const recorded = captureFetch([{ status: 200 }]);
    const fanout = createVoiceWebhookFanout({
      fetch: recorded.fetch,
      sinks: [
        {
          acceptEvent: ({ type }) => type === "recording.ready",
          id: "recording-store",
          url: "https://recording.example/webhook",
        },
        {
          acceptEvent: ({ type }) => type === "cost.ready",
          id: "billing",
          url: "https://billing.example/webhook",
        },
      ],
    });
    await fanout.deliver({
      payload: { sessionId: "s" },
      type: "recording.ready",
    });
    expect(recorded.requests).toHaveLength(1);
    expect(recorded.requests[0]!.url).toContain("recording.example");
  });

  test("retries on non-2xx up to maxRetries", async () => {
    const fail = captureFetch([
      { status: 500 },
      { status: 502 },
      { status: 200 },
    ]);
    const fanout = createVoiceWebhookFanout({
      fetch: fail.fetch,
      sinks: [
        {
          backoffMs: 5,
          id: "flaky",
          maxRetries: 3,
          url: "https://flaky.example",
        },
      ],
    });
    const report = await fanout.deliver({ payload: {}, type: "x" });
    expect(report.succeeded).toBe(1);
    expect(fail.requests).toHaveLength(3);
    expect(report.deliveries[0]!.attempt).toBe(3);
  });

  test("emits HMAC signature when signingSecret is set", async () => {
    const captured = captureFetch([{ status: 200 }]);
    const fanout = createVoiceWebhookFanout({
      fetch: captured.fetch,
      sinks: [
        {
          id: "signed",
          signingSecret: "rotate-me",
          url: "https://signed.example",
        },
      ],
    });
    await fanout.deliver({ payload: { ok: true }, type: "evt" });
    const headers = captured.requests[0]!.headers!;
    expect(headers.get("x-absolutejs-signature")).toMatch(/^sha256=/);
    expect(headers.get("x-absolutejs-timestamp")).toBeTruthy();
  });

  test("aggregates failures cleanly", async () => {
    const failing = captureFetch([{ status: 500 }]);
    const fanout = createVoiceWebhookFanout({
      fetch: failing.fetch,
      sinks: [{ id: "down", maxRetries: 1, url: "https://down.example" }],
    });
    const report = await fanout.deliver({ payload: {}, type: "x" });
    expect(report.failed).toBe(1);
    expect(report.deliveries[0]!.error).toContain("HTTP 500");
  });
});
