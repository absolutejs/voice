import { expect, test } from "bun:test";
import {
  hardenFetch,
  VoiceFetchHeadersTimeoutError,
} from "../src/core/hardenedFetch";

const stalledFetch = (onRequest: () => void): typeof fetch =>
  Object.assign(
    async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      onRequest();
      return await new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) return reject(init.signal.reason);
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    },
    { preconnect: () => undefined },
  );

test("header deadline exhausts exactly two attempts with typed metadata", async () => {
  let requests = 0;
  const fetch = hardenFetch(
    stalledFetch(() => requests++),
    { attemptTimeoutMs: 5 },
  );
  const error = await fetch("https://example.test").catch(
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(VoiceFetchHeadersTimeoutError);
  expect(error).toMatchObject({ timeoutMs: 5, attempt: 2 });
  expect(requests).toBe(2);
});

test("caller cancellation is preserved and does not retry", async () => {
  let requests = 0;
  const controller = new AbortController();
  const reason = new Error("turn ended");
  const fetch = hardenFetch(
    stalledFetch(() => requests++),
    { attemptTimeoutMs: 100 },
  );
  const request = fetch("https://example.test", { signal: controller.signal });
  controller.abort(reason);
  await expect(request).rejects.toBe(reason);
  expect(requests).toBe(1);
});

test("successful headers clear the deadline without truncating the response body", async () => {
  let signal: AbortSignal | null | undefined;
  const fetch = hardenFetch(
    Object.assign(
      async (
        _input: Parameters<typeof globalThis.fetch>[0],
        init?: RequestInit,
      ) => {
        signal = init?.signal;
        return new Response("complete");
      },
      { preconnect: () => undefined },
    ),
    { attemptTimeoutMs: 5 },
  );
  const response = await fetch("https://example.test");
  await new Promise((resolve) => setTimeout(resolve, 15));
  expect(signal?.aborted).toBe(false);
  expect(await response.text()).toBe("complete");
});

test("invalid timeout configuration is rejected", () => {
  for (const attemptTimeoutMs of [0, -1, NaN, Infinity]) {
    expect(() => hardenFetch(globalThis.fetch, { attemptTimeoutMs })).toThrow(
      RangeError,
    );
  }
});
