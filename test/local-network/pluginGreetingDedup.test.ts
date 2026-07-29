import { afterEach, expect, test } from "bun:test";
import { voice } from "../../src";
import { createVoiceMemoryStore } from "../../src/core/memoryStore";
import type { STTAdapter, TTSAdapter } from "../../src/core/types";

// Regression test for the "agent spammed the intro 2-3x" bug (Kyle 2026-06-17):
// createManagedSession awaits (profile-switch guard / phrase hints / lexicon)
// BEFORE the new session is registered in runtime.activeSessions. A browser
// streams mic audio immediately on call start, so the WS `open` handler and the
// first audio `message` frames all ran inside that gap, each saw no active
// session, and each created one + fired the greeting. The fix dedupes session
// creation per sessionId (ensureManagedSession + the pendingSessions promise) so
// create + connect + greeting happen exactly once. These tests drive the real
// plugin over a live socket and assert the greeting count.

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const waitForGreetingCount = async (
  spoken: string[],
  greeting: string,
  expected: number,
) => {
  const deadline = Date.now() + 2_000;

  while (
    spoken.filter((line) => line === greeting).length < expected &&
    Date.now() < deadline
  ) {
    await delay(10);
  }
};

const listenOnAvailablePort = (app: ReturnType<typeof voice>) => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = 20_000 + Math.floor(Math.random() * 40_000);

    try {
      app.listen({ port, reusePort: false });

      return port;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to allocate a test server port");
};

const buildStt = (): STTAdapter => ({
  kind: "stt",
  open: () => ({
    close: async () => {},
    on: () => () => {},
    send: async () => {},
  }),
});

// Records every line it's asked to speak. The greeting is sent here on each
// connect, so the count of greeting lines == the number of greetings fired.
const buildTts = (spoken: string[]): TTSAdapter => ({
  kind: "tts",
  open: () => ({
    close: async () => {},
    on: () => () => {},
    send: async (text: string) => {
      spoken.push(text);
    },
  }),
});

const openSocket = (url: string) =>
  new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", (event) => reject(event));
  });

let cleanup: (() => Promise<void> | void) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

test("greets exactly once when the open handler races concurrent audio frames", async () => {
  const GREETING = "TEST_GREETING_LINE";
  const spoken: string[] = [];
  let releaseLexicon = () => {};
  const lexiconGate = new Promise<void>((resolve) => {
    releaseLexicon = resolve;
  });

  const app = voice({
    greeting: GREETING,
    // One of the awaited steps inside createManagedSession. Holding it open keeps
    // every concurrent open/audio handler parked inside the session-creation
    // window — the exact race that fired the greeting 3x — until we release it,
    // making the race deterministic instead of timing-dependent.
    lexicon: async () => {
      await lexiconGate;

      return [];
    },
    onTurn: () => {},
    path: "/voice",
    session: createVoiceMemoryStore(),
    stt: buildStt(),
    tts: buildTts(spoken),
  });

  const port = listenOnAvailablePort(app);
  cleanup = () => {
    // Force-close active sockets; app.stop() waits for drain and hangs the hook.
    app.server?.stop(true);
  };
  expect(port).toBeGreaterThan(0);

  const ws = await openSocket(
    `ws://localhost:${String(port)}/voice?sessionId=race-session`,
  );

  // Stream several audio frames immediately. These race the still-pending
  // open-handler session creation (all parked on the lexicon gate).
  const frame = new Uint8Array(320);
  for (let i = 0; i < 5; i += 1) {
    ws.send(frame);
  }

  // localhost delivery is sub-millisecond, so by now the open handler + all five
  // audio handlers have entered session creation and are parked on the gate.
  await delay(100);
  releaseLexicon();
  await waitForGreetingCount(spoken, GREETING, 1);

  const greetingCount = spoken.filter((line) => line === GREETING).length;
  expect(greetingCount).toBe(1);

  ws.close();
});

test("dedup is per-session: two distinct sessions each greet once", async () => {
  const GREETING = "PER_SESSION_GREETING";
  const spoken: string[] = [];

  const app = voice({
    greeting: GREETING,
    onTurn: () => {},
    path: "/voice",
    session: createVoiceMemoryStore(),
    stt: buildStt(),
    tts: buildTts(spoken),
  });

  const port = listenOnAvailablePort(app);
  cleanup = () => {
    app.server?.stop(true);
  };

  const base = `ws://localhost:${String(port)}/voice?sessionId=`;
  const first = await openSocket(`${base}session-a`);
  const second = await openSocket(`${base}session-b`);
  await waitForGreetingCount(spoken, GREETING, 2);

  const greetingCount = spoken.filter((line) => line === GREETING).length;
  expect(greetingCount).toBe(2);

  first.close();
  second.close();
});

test("a replacement socket never inherits pending creation bound to the old socket", async () => {
  const GREETING = "REPLACEMENT_GREETING";
  const spoken: string[] = [];
  const lexicon = Promise.withResolvers<void>();
  const app = voice({
    greeting: GREETING,
    lexicon: async () => {
      await lexicon.promise;

      return [];
    },
    onTurn: () => {},
    path: "/voice",
    session: createVoiceMemoryStore(),
    stt: buildStt(),
    tts: buildTts(spoken),
  });
  const port = listenOnAvailablePort(app);
  cleanup = () => {
    app.server?.stop(true);
  };
  const url = `ws://localhost:${String(port)}/voice?sessionId=replaced`;
  const first = await openSocket(url);
  const firstClosed = new Promise<void>((resolve) =>
    first.addEventListener("close", () => resolve(), { once: true }),
  );
  const firstMessages: string[] = [];
  first.addEventListener("message", (event) => {
    firstMessages.push(String(event.data));
  });
  const second = await openSocket(url);
  const secondMessages: string[] = [];
  second.addEventListener("message", (event) => {
    secondMessages.push(String(event.data));
  });

  await delay(30);
  lexicon.resolve();
  await waitForGreetingCount(spoken, GREETING, 1);
  for (
    let attempt = 0;
    attempt < 20 &&
    !secondMessages.some((message) => message.includes('"type":"session"'));
    attempt += 1
  ) {
    // eslint-disable-next-line no-await-in-loop -- bounded delivery poll
    await delay(10);
  }

  expect(
    firstMessages.some((message) => message.includes('"type":"session"')),
  ).toBe(false);
  expect(
    secondMessages.some((message) => message.includes('"type":"session"')),
  ).toBe(true);
  expect(spoken.filter((line) => line === GREETING)).toHaveLength(1);

  const secondClosed = new Promise<void>((resolve) =>
    second.addEventListener("close", () => resolve(), { once: true }),
  );
  if (first.readyState < WebSocket.CLOSING) first.close();
  second.close();
  await Promise.all([firstClosed, secondClosed]);
});
