import { afterEach, expect, test } from "bun:test";
import { voice } from "../src";
import { createVoiceMemoryStore } from "../src/core/memoryStore";
import type { STTAdapter, TTSAdapter } from "../src/core/types";

// Regression test for the "agent spammed the intro 2-3x" bug (Kyle 2026-06-17):
// createManagedSession awaits (profile-switch guard / phrase hints / lexicon)
// BEFORE the new session is registered in runtime.activeSessions. A browser
// streams mic audio immediately on call start, so the WS `open` handler and the
// first audio `message` frames all ran inside that gap, each saw no active
// session, and each created one + fired the greeting. The fix dedupes session
// creation per sessionId (ensureManagedSession + the pendingSessions promise) so
// create + connect + greeting happen exactly once. These tests drive the real
// plugin over a live socket and assert the greeting count.

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

  app.listen(0);
  const port = app.server?.port;
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
  await delay(100);

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

  app.listen(0);
  const port = app.server?.port;
  cleanup = () => {
    app.server?.stop(true);
  };

  const base = `ws://localhost:${String(port)}/voice?sessionId=`;
  const first = await openSocket(`${base}session-a`);
  const second = await openSocket(`${base}session-b`);
  await delay(100);

  const greetingCount = spoken.filter((line) => line === GREETING).length;
  expect(greetingCount).toBe(2);

  first.close();
  second.close();
});
