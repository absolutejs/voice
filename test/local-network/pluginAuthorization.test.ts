import { afterEach, expect, test } from "bun:test";
import { voice } from "../../src";
import { createVoiceMemoryStore } from "../../src/core/memoryStore";
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
  const app = voice({
    authorizeConnection: ({ query, sessionId }) => {
      authorizedSession =
        query.admission === "valid" ? sessionId : "invalid-query";

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
  ws.close();
});
