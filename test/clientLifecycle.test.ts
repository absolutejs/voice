import { afterEach, expect, test } from "bun:test";
import {
  createVoiceConnection,
  VoiceReconnectRejectedError,
} from "../src/client/connection";
import { createVoiceStream } from "../src/client/createVoiceStream";
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

test("an authorization rejection fails without reconnecting", async () => {
  let sockets = 0;
  const reconnectStates: string[] = [];
  const errors: Array<{ message: string; recoverable?: boolean }> = [];
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
          this.onclose?.({
            code: 4401,
            reason: "unauthorized",
          } as CloseEvent);
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
    maxReconnectAttempts: 15,
    reconnectMaxDelayMs: 1,
  });
  connection.subscribe((message) => {
    if (message.type === "connection") {
      reconnectStates.push(message.reconnect.status);
    }
    if (message.type === "error") {
      errors.push(message);
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(sockets).toBe(1);
  expect(reconnectStates).toEqual(["exhausted"]);
  expect(errors).toEqual([
    {
      message: "Voice authorization expired or was rejected.",
      recoverable: false,
      type: "error",
    },
  ]);
});

test("provider initialization rejection fails without reconnecting", async () => {
  let sockets = 0;
  const errors: string[] = [];
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
          this.onclose?.({
            code: 4500,
            reason: "voice session initialization failed",
          } as CloseEvent);
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
    maxReconnectAttempts: 15,
    reconnectMaxDelayMs: 1,
  });
  connection.subscribe((message) => {
    if (message.type === "error") errors.push(message.message);
  });
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(sockets).toBe(1);
  expect(errors).toEqual(["Voice provider initialization failed."]);
});

test("reconnect preparation completes before a replacement socket opens", async () => {
  const events: string[] = [];
  let sockets = 0;
  class FakeWebSocket {
    static OPEN = 1;
    binaryType = "";
    onclose: ((event: CloseEvent) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onopen: (() => void) | null = null;
    readyState = 0;

    constructor(readonly url: string) {
      sockets += 1;
      events.push(`socket:${sockets}`);
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
        if (sockets === 1) {
          queueMicrotask(() => {
            this.readyState = 3;
            this.onclose?.({ code: 4000 } as CloseEvent);
          });
        }
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

  createVoiceConnection("/voice", {
    maxReconnectAttempts: 1,
    prepareReconnect: async ({ attempt, sessionId }) => {
      events.push(`prepare:${attempt}:${sessionId}`);
    },
    reconnectMaxDelayMs: 1,
    sessionId: "session",
  });
  await new Promise((resolve) => setTimeout(resolve, 15));

  expect(events).toEqual(["socket:1", "prepare:1:session", "socket:2"]);
});

test("teardown invalidates reconnect preparation already in flight", async () => {
  const preparation = Promise.withResolvers<void>();
  let sockets = 0;
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
        if (sockets === 1) {
          queueMicrotask(() => {
            this.readyState = 3;
            this.onclose?.({ code: 4000 } as CloseEvent);
          });
        }
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
    prepareReconnect: () => preparation.promise,
    reconnectMaxDelayMs: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  connection.disconnect();
  preparation.resolve();
  await new Promise((resolve) => setTimeout(resolve, 5));

  expect(sockets).toBe(1);
});

test("definitive reconnect preparation rejection fails immediately", async () => {
  let preparations = 0;
  const errors: string[] = [];
  class FakeWebSocket {
    static OPEN = 1;
    binaryType = "";
    onclose: ((event: CloseEvent) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onopen: (() => void) | null = null;
    readyState = 0;

    constructor(readonly url: string) {
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
    maxReconnectAttempts: 15,
    prepareReconnect: () => {
      preparations += 1;
      throw new VoiceReconnectRejectedError("Voice session no longer exists.");
    },
    reconnectMaxDelayMs: 1,
  });
  connection.subscribe((message) => {
    if (message.type === "error") errors.push(message.message);
  });
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(preparations).toBe(1);
  expect(errors).toEqual(["Voice session no longer exists."]);
});

test("exhausted reconnect preparation emits a terminal failure", async () => {
  const errors: string[] = [];
  class FakeWebSocket {
    static OPEN = 1;
    binaryType = "";
    onclose: ((event: CloseEvent) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onopen: (() => void) | null = null;
    readyState = 0;

    constructor(readonly url: string) {
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
    maxReconnectAttempts: 1,
    prepareReconnect: () => {
      throw new Error("renewal rejected");
    },
    reconnectMaxDelayMs: 1,
  });
  connection.subscribe((message) => {
    if (message.type === "error") errors.push(message.message);
  });
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(errors).toEqual([
    "Voice authorization could not be renewed for reconnect.",
  ]);
});

test("disconnected realtime audio is dropped while control messages remain bounded", () => {
  const sent: unknown[] = [];
  let socket: FakeWebSocket | null = null;
  class FakeWebSocket {
    static OPEN = 1;
    binaryType = "";
    onclose: ((event: CloseEvent) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onopen: (() => void) | null = null;
    readyState = 0;

    constructor(readonly url: string) {
      socket = this;
    }

    close() {
      this.readyState = 3;
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
    sessionId: "session",
  });
  connection.sendAudio(new Uint8Array([1, 2, 3]));
  connection.start({ sessionId: "session" });
  if (!socket) throw new Error("socket was not created");
  socket.readyState = FakeWebSocket.OPEN;
  socket.onopen?.();

  expect(sent).toEqual([
    JSON.stringify({ sessionId: "session", type: "start" }),
  ]);
});

test("start rejects in-socket session switching", () => {
  class FakeWebSocket {
    static OPEN = 1;
    binaryType = "";
    readyState = FakeWebSocket.OPEN;
    constructor(readonly url: string) {}
    close() {}
    send() {}
  }
  Object.assign(globalThis, {
    WebSocket: FakeWebSocket,
    window: {
      location: { hostname: "example.test", port: "", protocol: "https:" },
    },
  });
  const connection = createVoiceConnection("/voice", {
    sessionId: "session-a",
  });

  expect(() => connection.start({ sessionId: "session-b" })).toThrow(
    "Voice session switching requires a new connection instance.",
  );
  connection.disconnect();
});

test("call controls resolve only after the matching server acknowledgement", async () => {
  class FakeWebSocket {
    static OPEN = 1;
    binaryType = "";
    onclose: ((event: CloseEvent) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onopen: (() => void) | null = null;
    readyState = FakeWebSocket.OPEN;

    constructor(readonly url: string) {}

    close() {
      this.readyState = 3;
    }

    send(value: unknown) {
      const message = JSON.parse(String(value)) as {
        action: string;
        requestId: string;
      };
      queueMicrotask(() => {
        this.onmessage?.({
          data: JSON.stringify({
            action: message.action,
            ok: true,
            requestId: message.requestId,
            type: "call_control_ack",
          }),
        } as MessageEvent);
      });
    }
  }
  Object.assign(globalThis, {
    WebSocket: FakeWebSocket,
    window: {
      location: { hostname: "example.test", port: "", protocol: "https:" },
    },
  });

  const connection = createVoiceConnection("/voice", {
    sessionId: "session",
  });

  await expect(
    connection.callControl({ action: "pause" }),
  ).resolves.toBeUndefined();
});

test("call controls fail instead of queueing while disconnected", async () => {
  const sent: unknown[] = [];
  let socket: FakeWebSocket | null = null;
  class FakeWebSocket {
    static OPEN = 1;
    binaryType = "";
    onclose: ((event: CloseEvent) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onopen: (() => void) | null = null;
    readyState = 0;

    constructor(readonly url: string) {
      socket = this;
    }

    close() {
      this.readyState = 3;
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

  const connection = createVoiceConnection("/voice");
  await expect(connection.callControl({ action: "pause" })).rejects.toThrow(
    "pause is unavailable while disconnected",
  );
  if (!socket) throw new Error("socket was not created");
  socket.readyState = FakeWebSocket.OPEN;
  socket.onopen?.();

  expect(sent).toEqual([]);
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

test("stopping while microphone permission is pending releases the eventual stream", async () => {
  const permission = Promise.withResolvers<MediaStream>();
  let trackStopped = false;
  const stream = {
    getTracks: () => [{ stop: () => (trackStopped = true) }],
  } as unknown as MediaStream;
  Object.assign(globalThis, {
    navigator: {
      mediaDevices: {
        getUserMedia: () => permission.promise,
      },
    },
    window: { AudioContext: class {} },
  });
  const capture = createMicrophoneCapture({ onAudio: () => {} });
  const starting = capture.start();
  capture.stop();
  permission.resolve(stream);

  await expect(starting).rejects.toThrow(
    "Microphone capture stopped during startup",
  );
  expect(trackStopped).toBe(true);
});

test("deferred voice stream start is inert after close", async () => {
  let mediaLookups = 0;
  class FakeWebSocket {
    static OPEN = 1;
    binaryType = "";
    onclose = null;
    onmessage = null;
    onopen = null;
    readyState = 0;
    close() {}
    send() {}
  }
  Object.assign(globalThis, {
    WebSocket: FakeWebSocket,
    window: {
      location: { hostname: "example.test", port: "", protocol: "https:" },
    },
  });
  const stream = createVoiceStream("/voice", {
    browserMedia: {
      getPeerConnection: () => {
        mediaLookups += 1;

        return null;
      },
    },
  });
  const starting = stream.start({ sessionId: "session" });
  stream.close();
  await starting;
  await Promise.resolve();

  expect(mediaLookups).toBe(0);
});

test("reconnect preparation timeout aborts the hook and exhausts normally", async () => {
  let preparationAborted = false;
  const errors: string[] = [];
  class FakeWebSocket {
    static OPEN = 1;
    binaryType = "";
    onclose: ((event: CloseEvent) => void) | null = null;
    onmessage = null;
    onopen: (() => void) | null = null;
    readyState = 0;
    constructor() {
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
    maxReconnectAttempts: 1,
    prepareReconnect: ({ signal }) =>
      new Promise<void>(() => {
        signal.addEventListener(
          "abort",
          () => {
            preparationAborted = true;
          },
          { once: true },
        );
      }),
    prepareReconnectTimeoutMs: 1,
    reconnectMaxDelayMs: 1,
  });
  connection.subscribe((message) => {
    if (message.type === "error") errors.push(message.message);
  });
  await new Promise((resolve) => setTimeout(resolve, 15));

  expect(preparationAborted).toBe(true);
  expect(errors).toEqual([
    "Voice authorization could not be renewed for reconnect.",
  ]);
});
