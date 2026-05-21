import { describe, expect, test } from "bun:test";
import {
  createVoiceMemoryTraceEventStore,
  voice,
  type STTAdapter,
  type VoiceSessionStore,
} from "../src";

// Minimal stubs — the quality surface route does not touch stt/session at
// request time, so these only need to satisfy the plugin's construction.
const stubStt = {} as STTAdapter;
const stubSession = {} as VoiceSessionStore;

const buildApp = (enableQuality: boolean) => {
  const store = createVoiceMemoryTraceEventStore();
  return voice({
    onTurn: () => {},
    path: "/voice",
    session: stubSession,
    stt: stubStt,
    ...(enableQuality ? { quality: { path: "/quality", store } } : {}),
  });
};

describe("voice() surface mounting", () => {
  test("mounts a surface route when its config key is provided", async () => {
    const app = buildApp(true);
    const res = await app.handle(new Request("http://localhost/quality"));
    expect(res.status).toBe(200);
  });

  test("does not mount the surface route when the key is omitted", async () => {
    const app = buildApp(false);
    const res = await app.handle(new Request("http://localhost/quality"));
    expect(res.status).toBe(404);
  });

  test("treats false as disabled", async () => {
    const store = createVoiceMemoryTraceEventStore();
    const app = voice({
      onTurn: () => {},
      path: "/voice",
      quality: false,
      session: stubSession,
      stt: stubStt,
      trace: store,
    });
    const res = await app.handle(new Request("http://localhost/quality"));
    expect(res.status).toBe(404);
  });
});
