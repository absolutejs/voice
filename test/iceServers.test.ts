import { describe, expect, test } from "bun:test";
import {
  createCoturnIceServers,
  createTwilioNTSIceServers,
} from "../src/core/iceServers";

describe("createCoturnIceServers", () => {
  test("returns stun + turn entries with HMAC-derived ephemeral credentials", async () => {
    const servers = await createCoturnIceServers({
      hmacSha1Base64: async (_key, message) => `signed:${message}`,
      now: 1_700_000_000,
      realm: "voice.example.com",
      sharedSecret: "rotate-me",
      turnHost: "turn.example.com:3478",
      ttlSec: 60,
      username: "user-42",
    });
    expect(servers).toHaveLength(2);
    expect(servers[0]!.urls).toEqual(["stun:stun.l.google.com:19302"]);
    const turn = servers[1]!;
    expect(turn.username).toBe("1700000060:user-42");
    expect(turn.credential).toBe("signed:1700000060:user-42");
    expect(turn.urls).toEqual([
      "turn:turn.example.com:3478?transport=udp",
      "turn:turn.example.com:3478?transport=tcp",
      "turns:turn.example.com:3478?transport=tcp",
    ]);
  });

  test("honors custom stun urls", async () => {
    const servers = await createCoturnIceServers({
      hmacSha1Base64: async () => "x",
      realm: "r",
      sharedSecret: "s",
      stunUrls: ["stun:custom.stun:3478"],
      turnHost: "t.example:3478",
      username: "u",
    });
    expect(servers[0]!.urls).toEqual(["stun:custom.stun:3478"]);
  });
});

describe("createTwilioNTSIceServers", () => {
  test("maps the NTS payload into iceServers", async () => {
    const fetchMock = (async () =>
      new Response(
        JSON.stringify({
          ice_servers: [
            {
              url: "stun:global.stun.twilio.com:3478",
              urls: "stun:global.stun.twilio.com:3478",
            },
            {
              credential: "secret-pass",
              urls: "turn:global.turn.twilio.com:3478?transport=udp",
              username: "ephem-user",
            },
          ],
          password: "secret-pass",
          username: "ephem-user",
        }),
        { headers: { "content-type": "application/json" } },
      )) as typeof fetch;
    const servers = await createTwilioNTSIceServers({
      accountSid: "AC-xxx",
      authToken: "tok",
      fetch: fetchMock,
    });
    expect(servers).toHaveLength(2);
    expect(servers[1]!.credential).toBe("secret-pass");
    expect(servers[1]!.username).toBe("ephem-user");
  });

  test("throws when credentials are missing", async () => {
    await expect(
      createTwilioNTSIceServers({ accountSid: "", authToken: "" }),
    ).rejects.toThrow(/accountSid/);
  });

  test("surfaces HTTP errors", async () => {
    const fetchMock = (async () =>
      new Response("limit reached", { status: 429 })) as typeof fetch;
    await expect(
      createTwilioNTSIceServers({
        accountSid: "AC",
        authToken: "t",
        fetch: fetchMock,
      }),
    ).rejects.toThrow(/429/);
  });
});
