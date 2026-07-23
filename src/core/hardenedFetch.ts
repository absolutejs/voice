// Hardened fetch — works around an UPSTREAM BUN BUG. See UPSTREAM_ISSUES.md
// (bun-fetch-stale-keepalive) for the full write-up, tracking links, and the
// exact revert to do once Bun ships a fix.
//
// Symptom: in a long-lived process, an LLM/TTS `fetch()` intermittently hangs
// ~60s before any response headers, then completes (or the turn has already been
// abandoned). The provider itself is ~1s direct.
//
// Cause: Bun's `fetch()` keep-alive connection pool reuses a stale TCP socket
// after an idle gap (the peer closed it) and the request black-holes with no
// reconnect until an OS-level socket timeout. Voice turns/calls have exactly
// those idle gaps. `keepalive: false` does NOT fix it (bun #14538 — it's
// ignored), so the header is the only working lever.
//
// Mitigation (two layers):
//   1. Prevention (Bun only): send `Connection: close` so Bun never pools a
//      socket that can go stale — fresh connection per request. TLS session
//      resumption keeps that ~free (measured: no per-request penalty).
//   2. Backstop (all runtimes): bound each attempt's time-to-headers and retry
//      once on a fresh connection, in case a socket pooled by another code path
//      is still handed to us. A retry only happens when NO response was received
//      (timeout/network error before headers), so re-sending is safe.
//
// `fetch()` resolves on response HEADERS; the body is streamed afterwards. The
// attempt timeout therefore bounds connection/time-to-headers only and never
// truncates a long streaming body.

const ATTEMPT_TIMEOUT_MS = 6_000;
const isBun = "Bun" in globalThis;

const oneAttempt = async (
  baseFetch: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
) => {
  const controller = new AbortController();
  const callerSignal = init?.signal ?? undefined;
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) controller.abort(callerSignal.reason);
  else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort(
      new Error(
        `fetch exceeded ${ATTEMPT_TIMEOUT_MS}ms before response headers (stale Bun keep-alive socket?)`,
      ),
    );
  }, ATTEMPT_TIMEOUT_MS);
  const headers = new Headers(init?.headers);
  if (isBun) headers.set("Connection", "close");
  try {
    return await baseFetch(input, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
};

// Wrap a fetch (default: global) so every request opts out of Bun's keep-alive
// pool and survives a single stale-socket hang. Drop-in: same call signature as
// `fetch`, including `preconnect`.
export const hardenFetch = (baseFetch = globalThis.fetch) => {
  const hardenedFetch = async (
    input: Parameters<typeof fetch>[0],
    init: Parameters<typeof fetch>[1],
  ) => {
    try {
      return await oneAttempt(baseFetch, input, init);
    } catch (error) {
      // A real caller abort (turn ended) must NOT be retried.
      if (init?.signal?.aborted) throw error;
      console.warn(
        `[voice] hardened fetch retrying on a fresh connection: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return oneAttempt(baseFetch, input, init);
    }
  };

  return typeof baseFetch.preconnect === "function"
    ? Object.assign(hardenedFetch, {
        preconnect: baseFetch.preconnect.bind(baseFetch),
      })
    : hardenedFetch;
};
