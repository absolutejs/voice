import { afterEach, expect, test } from "bun:test";
import { createVoiceConnection } from "../src/client/connection";
import { createMicrophoneCapture } from "../src/client/microphone";

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalWebSocket = globalThis.WebSocket;

afterEach(() => {
  Object.assign(globalThis, {
    WebSocket: originalWebSocket,
    navigator: originalNavigator,
    window: originalWindow,
  });
});

test("explicit connection close sends the terminal protocol message first", () => {
  const sent: unknown[] = [];
  class FakeWebSocket {
    static OPEN = 1;
    binaryType = "";
    onclose: ((event: CloseEvent) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onopen: (() => void) | null = null;
    readyState = 1;

    constructor(readonly url: string) {}

    close(code?: number) {
      expect(code).toBe(1000);
    }

    send(value: unknown) {
      sent.push(value);
    }
  }
  Object.assign(globalThis, {
    WebSocket: FakeWebSocket,
    window: {
      location: { hostname: "example.test", port: "", protocol: "https:" },
    },
  });

  const connection = createVoiceConnection("/voice", {
    query: { admission: "token" },
    sessionId: "session",
  });
  connection.close("member-ended");

  expect((FakeWebSocket as unknown as { last?: unknown }).last).toBeUndefined();
  expect(sent).toEqual([
    JSON.stringify({ reason: "member-ended", type: "close" }),
  ]);
});

test("recoverable disconnect closes without sending a terminal message", () => {
  const sent: unknown[] = [];
  class FakeWebSocket {
    static OPEN = 1;
    binaryType = "";
    readyState = 1;

    constructor(readonly url: string) {}

    close(code?: number) {
      expect(code).toBe(1000);
    }

    send(value: unknown) {
      sent.push(value);
    }
  }
  Object.assign(globalThis, {
    WebSocket: FakeWebSocket,
    window: {
      location: {
        hostname: "example.test",
        port: "",
        protocol: "https:",
      },
    },
  });

  const connection = createVoiceConnection("/voice", {
    sessionId: "session",
  });
  connection.disconnect();

  expect(sent).toEqual([]);
});

test("a flapping accepted socket exhausts its reconnect budget", async () => {
  let sockets = 0;
  const reconnectStates: string[] = [];
  class FakeWebSocket {
    static OPEN = 1;
    binaryType = "";
    onclose: ((event: CloseEvent) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onopen: (() => void) | null = null;
    readyState = 0;

    constructor(readonly url: string) {
      sockets += 1;
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
        queueMicrotask(() => {
          this.readyState = 3;
          this.onclose?.({ code: 4000 } as CloseEvent);
        });
      });
    }

    close() {
      this.readyState = 3;
    }

    send() {}
  }
  Object.assign(globalThis, {
    WebSocket: FakeWebSocket,
    window: {
      location: { hostname: "example.test", port: "", protocol: "https:" },
    },
  });

  const connection = createVoiceConnection("/voice", {
    maxReconnectAttempts: 2,
    reconnectMaxDelayMs: 1,
    reconnectResetAfterMs: 100,
  });
  connection.subscribe((message) => {
    if (message.type === "connection") {
      reconnectStates.push(message.reconnect.status);
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(sockets).toBe(3);
  expect(reconnectStates.at(-1)).toBe("exhausted");
});

test("partial microphone startup failure releases the supplied stream and context", async () => {
  let contextClosed = false;
  let trackStopped = false;
  const stream = {
    getTracks: () => [{ stop: () => (trackStopped = true) }],
  } as unknown as MediaStream;
  class FakeAudioContext {
    destination = {};
    sampleRate = 48_000;
    state = "running";
    close() {
      contextClosed = true;

      return Promise.resolve();
    }
    createMediaStreamSource() {
      throw new Error("source setup failed");
    }
  }
  Object.assign(globalThis, {
    window: { AudioContext: FakeAudioContext },
  });

  const capture = createMicrophoneCapture({
    onAudio: () => {},
    stream,
  });
  await expect(capture.start()).rejects.toThrow("source setup failed");

  expect(trackStopped).toBe(true);
  expect(contextClosed).toBe(true);
});
