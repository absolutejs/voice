# Upstream issues we work around

Tracked third-party bugs that `@absolutejs/voice` patches around. Each entry says
what breaks, what we do *now* to cope, and exactly what to rip out once the
upstream fix ships. Grep the codebase for the entry's anchor (e.g.
`bun-fetch-stale-keepalive`) to find every touch point.

---

## bun-fetch-stale-keepalive — Bun `fetch()` hangs on a stale keep-alive socket

**Status:** open (as of 2026-06-05) · **Runtime:** Bun (confirmed 1.3.14) ·
**Severity:** high — silently breaks long-running voice sessions ·
**Filed:** [oven-sh/bun#31894](https://github.com/oven-sh/bun/issues/31894).

### Symptom

In a long-lived process (e.g. a compiled voice server), an LLM/TTS `fetch()`
intermittently **hangs ~60s before any response headers arrive**, then either
completes very late or the turn has already been abandoned. Observed live as
voice intake "stopped answering after I responded": the per-stage timing showed
`generate-start` immediately followed (62s later) by `generate-done`, with **no
`fetch-returned` stamp in between** — i.e. `await fetch(...)` itself never
returned. The same provider is ~1s from `curl` and from a short-lived `bun run`
script on the same box, so it is **not** the provider, the model, the SSE parse,
or `bun build --compile` specifically — it is Bun's HTTP client.

### Cause

Bun's `fetch()` keeps a persistent **keep-alive connection pool**. After an idle
gap, the remote (the API, a load balancer, or a NAT/gateway) closes the pooled
TCP socket. Bun does not validate the socket before reuse and **does not
reconnect** — it writes onto the dead socket and the request black-holes until an
OS-level socket timeout (~60s). Voice turns and calls have exactly these idle
gaps (a user speaking for 10–20s; pauses between calls), so the next request
reuses a socket that went stale in the meantime.

This is the long-running-process + idle pattern; a long-lived `bun run` process
hits it too. It is not unique to `--compile`.

### Why the obvious fix doesn't work

`fetch(url, { keepalive: false })` does **not** disable Bun's pool — the option
is ignored (bun #14538). The only lever that reliably opts out of pooling is the
**`Connection: close`** request header.

### What we do now (the patch)

`src/core/hardenedFetch.ts` exports `hardenFetch()`, applied to every model
adapter's fetch in `src/core/modelAdapters.ts` (`createOpenAIVoiceAssistantModel`,
`createAnthropicVoiceAssistantModel`, `createGeminiVoiceAssistantModel`). Two
layers:

1. **Prevention (Bun only):** send `Connection: close` so Bun never pools a
   socket that can go stale — a fresh connection per request. TLS session
   resumption makes the reconnect ~free (measured: no per-request penalty vs
   keep-alive; ~540ms to headers on a fresh connection in Bun 1.3.14).
2. **Backstop (all runtimes):** bound each attempt's time-to-headers
   (`ATTEMPT_TIMEOUT_MS = 6s`) and retry once on a fresh connection
   (`MAX_ATTEMPTS = 2`), in case a socket pooled by another code path is handed
   to us. A retry fires only when NO response was received, so re-sending is safe.

`hardenFetch` is exported from the package root, so consumers can wrap their own
direct provider fetches (e.g. a warmup ping) the same way.

### Tracking

- **oven-sh/bun#31894** — our dedicated report: a reused keep-alive socket isn't
  liveness-checked, so a half-open pooled connection hangs the request (up to
  Bun's 5-min ceiling) instead of reconnecting. Includes a deterministic
  two-server repro (graceful-FIN reconnects ✅ vs half-open hangs ❌):
  https://github.com/oven-sh/bun/issues/31894 — **watch this; the revert below
  is gated on it being fixed + released.**
- bun #14538 — `fetch` does not respect `keepalive: false` (why the header is the
  only opt-out lever): https://github.com/oven-sh/bun/issues/14538
- bun #16682 — `fetch` hardcodes a 5-min timeout (the ceiling the hang bottoms
  out at; separate bug): https://github.com/oven-sh/bun/issues/16682
- Bun fetch docs (documents `Connection: close` as the pooling opt-out):
  https://bun.com/docs/runtime/networking/fetch
- Deterministic repro kept at `test/repro/bun-fetch-stale-pool.ts` (mirror of the
  script in #31894) — re-run after a Bun bump to check if it's fixed.

### When Bun fixes it (the revert)

Once Bun validates idle pooled connections (or reconnects on a stale socket) in a
released version:

1. Bump the floor to that Bun version in CI / `engines`.
2. In `hardenedFetch.ts`, drop the `Connection: close` line (layer 1). Keep or
   drop layer 2 (timeout + single retry) at your discretion — a bounded retry is
   defensible defense-in-depth, but if you remove it, revert the adapters'
   `hardenFetch(options.fetch)` back to `options.fetch ?? globalThis.fetch` and
   delete `hardenedFetch.ts` + its export from `src/index.ts`.
3. Drop `Connection: close` from any consumer's direct provider fetches (grep
   consumers for `connection: "close"` near an `api.openai.com` / provider URL).
4. Re-verify with the voice timing debug mode (`ABSOLUTEJS_VOICE_TIMING=1`): a
   long idle gap between turns should no longer produce a missing `fetch-returned`
   stamp / ~60s `generate-done`.
