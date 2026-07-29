import { afterEach, expect, test } from "bun:test";
import { voice } from "../../src";
import { createVoiceMemoryStore } from "../../src/core/memoryStore";
import { resolveSocketHeaders } from "../../src/core/plugin";
import type { STTAdapter, TTSAdapter } from "../../src/core/types";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const buildStt = (): STTAdapter => ({
  kind: "stt",
  open: () => ({
    close: async () => {},
    on: () => () => {},
    send: async () => {},
  }),
});

const listenOnAvailablePort = (app: ReturnType<typeof voice>) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = 20_000 + Math.floor(Math.random() * 40_000);
    try {
      app.listen({ port, reusePort: false });

      return port;
    } catch {}
  }
  throw new Error("Unable to allocate a test server port");
};

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

test("rejects an unauthorized socket before creating provider resources", async () => {
  let sttOpens = 0;
  let ttsOpens = 0;
  const stt = buildStt();
  const app = voice({
    authorizeConnection: ({ query, sessionId }) =>
      query.admission === "valid" && sessionId === "allowed",
    onTurn: () => {},
    path: "/voice",
    session: createVoiceMemoryStore(),
    stt: {
      ...stt,
      open: (...args) => {
        sttOpens += 1;

        return stt.open(...args);
      },
    },
    tts: {
      kind: "tts",
      open: () => {
        ttsOpens += 1;

        return {
          close: async () => {},
          on: () => () => {},
          send: async () => {},
        };
      },
    } satisfies TTSAdapter,
  });
  const port = listenOnAvailablePort(app);
  cleanup = () => app.server?.stop(true);

  const rejected = new WebSocket(
    `ws://localhost:${String(port)}/voice?sessionId=allowed&admission=wrong`,
  );
  const closeEvent = await new Promise<CloseEvent>((resolve) =>
    rejected.addEventListener("close", resolve, { once: true }),
  );
  await delay(20);

  expect(closeEvent.code).toBe(4401);
  expect(sttOpens).toBe(0);
  expect(ttsOpens).toBe(0);
});

test("admits a valid socket and passes its query to authorization", async () => {
  let authorizedSession = "";
  let authorizedHost = "";
  const app = voice({
    authorizeConnection: ({ headers, query, sessionId }) => {
      authorizedSession =
        query.admission === "valid" ? sessionId : "invalid-query";
      authorizedHost = headers.get("host") ?? "";

      return true;
    },
    onTurn: () => {},
    path: "/voice",
    session: createVoiceMemoryStore(),
    stt: buildStt(),
  });
  const port = listenOnAvailablePort(app);
  cleanup = () => app.server?.stop(true);

  const ws = new WebSocket(
    `ws://localhost:${String(port)}/voice?sessionId=allowed&admission=valid`,
  );
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  expect(authorizedSession).toBe("allowed");
  expect(authorizedHost).toBe(`localhost:${String(port)}`);
  ws.close();
});

test("passes WebSocket upgrade cookies to authorization", async () => {
  let admissionCookie = "";
  const app = voice({
    authorizeConnection: ({ headers }) => {
      admissionCookie = headers.get("cookie") ?? "";

      return admissionCookie === "voice_admission=valid";
    },
    onTurn: () => {},
    path: "/voice",
    session: createVoiceMemoryStore(),
    stt: buildStt(),
  });
  const port = listenOnAvailablePort(app);
  cleanup = () => app.server?.stop(true);

  const ws = new WebSocket(
    `ws://localhost:${String(port)}/voice?sessionId=allowed`,
    {
      headers: {
        cookie: "voice_admission=valid",
      },
    },
  );
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  expect(admissionCookie).toBe("voice_admission=valid");
  ws.close();
});

test("waits for pending authorization before handling the first audio frame", async () => {
  const authorization = Promise.withResolvers<boolean>();
  let audioFrames = 0;
  let closeCode: number | null = null;
  const app = voice({
    authorizeConnection: () => authorization.promise,
    onTurn: () => {},
    path: "/voice",
    session: createVoiceMemoryStore(),
    stt: {
      kind: "stt",
      open: () => ({
        close: async () => {},
        on: () => () => {},
        send: async () => {
          audioFrames += 1;
        },
      }),
    },
  });
  const port = listenOnAvailablePort(app);
  cleanup = () => app.server?.stop(true);

  const ws = new WebSocket(
    `ws://localhost:${String(port)}/voice?sessionId=allowed`,
  );
  ws.addEventListener("close", (event) => {
    closeCode = event.code;
  });
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.send(new Uint8Array([0, 0]));
  await delay(20);

  expect(audioFrames).toBe(0);
  expect(closeCode).toBeNull();

  authorization.resolve(true);
  for (let attempt = 0; attempt < 20 && audioFrames === 0; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- bounded async delivery poll
    await delay(10);
  }

  expect(audioFrames).toBe(1);
  expect(closeCode).toBeNull();
  ws.close();
});

test("does not create provider resources after a socket closes during authorization", async () => {
  const authorization = Promise.withResolvers<boolean>();
  let sttOpens = 0;
  const app = voice({
    authorizeConnection: () => authorization.promise,
    onTurn: () => {},
    path: "/voice",
    session: createVoiceMemoryStore(),
    stt: {
      kind: "stt",
      open: () => {
        sttOpens += 1;

        return {
          close: async () => {},
          on: () => () => {},
          send: async () => {},
        };
      },
    },
  });
  const port = listenOnAvailablePort(app);
  cleanup = () => app.server?.stop(true);

  const ws = new WebSocket(
    `ws://localhost:${String(port)}/voice?sessionId=closed-during-auth`,
  );
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.close();
  await new Promise<void>((resolve) =>
    ws.addEventListener("close", () => resolve(), { once: true }),
  );
  await delay(30);
  authorization.resolve(true);
  await delay(30);

  expect(sttOpens).toBe(0);
});

test("provider initialization failure closes once and is not retried by queued audio", async () => {
  let sttOpens = 0;
  const store = createVoiceMemoryStore();
  const app = voice({
    onTurn: () => {},
    path: "/voice",
    session: store,
    stt: {
      kind: "stt",
      open: () => {
        sttOpens += 1;
        throw new Error("provider unavailable");
      },
    },
  });
  const port = listenOnAvailablePort(app);
  cleanup = () => app.server?.stop(true);

  const ws = new WebSocket(
    `ws://localhost:${String(port)}/voice?sessionId=provider-failure`,
  );
  const closeEvent = new Promise<CloseEvent>((resolve) =>
    ws.addEventListener("close", resolve, { once: true }),
  );
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener(
      "open",
      () => {
        const frame = new Uint8Array(320);
        for (let index = 0; index < 5; index += 1) ws.send(frame);
        resolve();
      },
      { once: true },
    );
    ws.addEventListener("error", reject, { once: true });
  });

  expect((await closeEvent).code).toBe(4500);
  await delay(30);
  expect(sttOpens).toBe(1);
  expect((await store.get("provider-failure"))?.status).toBe("failed");
});

test("pre-provider resolver failure closes once without opening or retrying providers", async () => {
  let lexiconCalls = 0;
  let sttOpens = 0;
  const app = voice({
    lexicon: async () => {
      lexiconCalls += 1;
      throw new Error("lexicon database unavailable");
    },
    onTurn: () => {},
    path: "/voice",
    session: createVoiceMemoryStore(),
    stt: {
      kind: "stt",
      open: () => {
        sttOpens += 1;

        return buildStt().open({});
      },
    },
  });
  const port = listenOnAvailablePort(app);
  cleanup = () => app.server?.stop(true);
  const ws = new WebSocket(
    `ws://localhost:${String(port)}/voice?sessionId=resolver-failure`,
  );
  const closeEvent = new Promise<CloseEvent>((resolve) =>
    ws.addEventListener("close", resolve, { once: true }),
  );
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener(
      "open",
      () => {
        const frame = new Uint8Array(320);
        for (let index = 0; index < 5; index += 1) ws.send(frame);
        resolve();
      },
      { once: true },
    );
    ws.addEventListener("error", reject, { once: true });
  });

  expect((await closeEvent).code).toBe(4500);
  await delay(30);
  expect(lexiconCalls).toBe(1);
  expect(sttOpens).toBe(0);
});

test("partial provider initialization is rolled back and persisted as failed", async () => {
  let providerCloses = 0;
  const store = createVoiceMemoryStore();
  const app = voice({
    onTurn: () => {},
    path: "/voice",
    session: store,
    stt: {
      kind: "stt",
      open: () => ({
        close: async () => {
          providerCloses += 1;
        },
        on: () => {
          throw new Error("listener setup failed");
        },
        send: async () => {},
      }),
    },
  });
  const port = listenOnAvailablePort(app);
  cleanup = () => app.server?.stop(true);
  const ws = new WebSocket(
    `ws://localhost:${String(port)}/voice?sessionId=partial-provider-failure`,
  );
  const closeEvent = await new Promise<CloseEvent>((resolve) =>
    ws.addEventListener("close", resolve, { once: true }),
  );

  expect(closeEvent.code).toBe(4500);
  expect(providerCloses).toBe(1);
  expect((await store.get("partial-provider-failure"))?.status).toBe("failed");
});

test("normalizes upgrade request headers without Request identity", () => {
  const headerValues = new Map([["cookie", "voice_admission=valid"]]);
  const headers = resolveSocketHeaders({
    data: {
      request: {
        headers: {
          entries: () => headerValues.entries(),
          get: (name: string) => headerValues.get(name) ?? null,
        },
      },
    },
  });

  expect(headers.get("cookie")).toBe("voice_admission=valid");
});
