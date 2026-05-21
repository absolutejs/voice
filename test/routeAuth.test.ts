import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  createVoiceBearerAuthVerifier,
  createVoiceHMACAuthVerifier,
  createVoiceRouteAuth,
} from "../src/core/routeAuth";
import { signVoiceWebhookBody } from "../src/core/webhookVerification";

const buildApp = (verify: ReturnType<typeof createVoiceBearerAuthVerifier>) =>
  new Elysia()
    .use(createVoiceRouteAuth({ verify }))
    .get("/voice/ops", () => ({ ok: true }))
    .post("/voice/event", () => ({ ok: true }));

describe("createVoiceRouteAuth bearer", () => {
  test("admits requests with matching bearer", async () => {
    const verify = createVoiceBearerAuthVerifier({ expectedToken: "abc" });
    const app = buildApp(verify);
    const res = await app.handle(
      new Request("http://localhost/voice/ops", {
        headers: { authorization: "Bearer abc" },
      }),
    );
    expect(res.status).toBe(200);
  });

  test("rejects missing bearer with 401", async () => {
    const verify = createVoiceBearerAuthVerifier({ expectedToken: "abc" });
    const app = buildApp(verify);
    const res = await app.handle(new Request("http://localhost/voice/ops"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("missing-bearer");
  });

  test("rejects mismatched bearer", async () => {
    const verify = createVoiceBearerAuthVerifier({ expectedToken: "abc" });
    const app = buildApp(verify);
    const res = await app.handle(
      new Request("http://localhost/voice/ops", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  test("honors bypassPaths", async () => {
    const verify = createVoiceBearerAuthVerifier({ expectedToken: "abc" });
    const app = new Elysia()
      .use(createVoiceRouteAuth({ bypassPaths: ["/health"], verify }))
      .get("/health", () => ({ ok: true }));
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
  });
});

describe("createVoiceRouteAuth HMAC", () => {
  test("admits requests with valid HMAC signature", async () => {
    const secret = "rotate-me";
    const body = JSON.stringify({ event: "test" });
    const timestamp = String(Date.now());
    const signature = await signVoiceWebhookBody({ body, secret, timestamp });
    const verify = createVoiceHMACAuthVerifier({ secret });
    const app = new Elysia()
      .use(createVoiceRouteAuth({ verify }))
      .post("/voice/event", () => ({ ok: true }));
    const res = await app.handle(
      new Request("http://localhost/voice/event", {
        body,
        headers: {
          "content-type": "application/json",
          "x-absolutejs-signature": signature,
          "x-absolutejs-timestamp": timestamp,
        },
        method: "POST",
      }),
    );
    expect(res.status).toBe(200);
  });

  test("rejects HMAC requests with no signature", async () => {
    const verify = createVoiceHMACAuthVerifier({ secret: "s" });
    const app = new Elysia()
      .use(createVoiceRouteAuth({ verify }))
      .post("/voice/event", () => ({ ok: true }));
    const res = await app.handle(
      new Request("http://localhost/voice/event", {
        body: "{}",
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });
});
