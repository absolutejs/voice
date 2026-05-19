import { describe, expect, test } from "bun:test";
import { createVoiceOAuth2TokenSource } from "../src/oauth2TokenSource";

const mockFetch = (
  responses: Array<{
    body: Record<string, unknown>;
    status?: number;
  }>,
): { calls: number; fn: typeof fetch } => {
  const state = { calls: 0 };
  const fn = (async () => {
    const next = responses[state.calls] ?? responses.at(-1)!;
    state.calls += 1;
    return new Response(JSON.stringify(next.body), {
      headers: { "content-type": "application/json" },
      status: next.status ?? 200,
    });
  }) as typeof fetch;
  return { calls: 0, fn };
};

describe("createVoiceOAuth2TokenSource", () => {
  test("requests a fresh token on first call", async () => {
    const fetchMock = mockFetch([
      { body: { access_token: "t1", expires_in: 3_600 } },
    ]);
    const source = createVoiceOAuth2TokenSource({
      clientId: "c",
      clientSecret: "s",
      fetch: fetchMock.fn,
      tokenUrl: "https://auth.example/token",
    });
    const token = await source.token();
    expect(token).toBe("t1");
  });

  test("caches the token across subsequent calls", async () => {
    let calls = 0;
    const fetchMock = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ access_token: `t${calls}`, expires_in: 3_600 }),
      );
    }) as typeof fetch;
    const source = createVoiceOAuth2TokenSource({
      clientId: "c",
      clientSecret: "s",
      fetch: fetchMock,
      tokenUrl: "https://auth.example/token",
    });
    expect(await source.token()).toBe("t1");
    expect(await source.token()).toBe("t1");
    expect(calls).toBe(1);
  });

  test("refetches after invalidate()", async () => {
    let calls = 0;
    const fetchMock = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ access_token: `t${calls}`, expires_in: 3_600 }),
      );
    }) as typeof fetch;
    const source = createVoiceOAuth2TokenSource({
      clientId: "c",
      clientSecret: "s",
      fetch: fetchMock,
      tokenUrl: "https://auth.example/token",
    });
    await source.token();
    source.invalidate();
    expect(await source.token()).toBe("t2");
    expect(calls).toBe(2);
  });

  test("throws on a non-2xx response with body context", async () => {
    const fetchMock = (async () => {
      return new Response("bad credentials", { status: 401 });
    }) as typeof fetch;
    const source = createVoiceOAuth2TokenSource({
      clientId: "c",
      clientSecret: "wrong",
      fetch: fetchMock,
      tokenUrl: "https://auth.example/token",
    });
    await expect(source.token()).rejects.toThrow(/401/);
  });

  test("dedupes concurrent token() calls into a single fetch", async () => {
    let calls = 0;
    const fetchMock = (async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(
        JSON.stringify({ access_token: "shared", expires_in: 3_600 }),
      );
    }) as typeof fetch;
    const source = createVoiceOAuth2TokenSource({
      clientId: "c",
      clientSecret: "s",
      fetch: fetchMock,
      tokenUrl: "https://auth.example/token",
    });
    const tokens = await Promise.all([
      source.token(),
      source.token(),
      source.token(),
    ]);
    expect(new Set(tokens).size).toBe(1);
    expect(calls).toBe(1);
  });
});
