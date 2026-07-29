import type {
  VoiceClientMessage,
  VoiceConnectionOptions,
  VoiceServerMessage,
} from "../core/types";

const WS_OPEN = 1;
const WS_CLOSED = 3;
const WS_NORMAL_CLOSURE = 1000;
const WS_UNAUTHORIZED = 4401;
const WS_FORBIDDEN = 4403;
// 15 attempts of exponential backoff capped at 8s ≈ a 95s retry window — long
// enough to ride out a server redeploy (build + drain + restart) so a caller
// mid-intake reconnects to their resumed session instead of losing the call.
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 15;
const DEFAULT_PING_INTERVAL = 30_000;
const DEFAULT_RECONNECT_RESET_AFTER_MS = 30_000;
const DEFAULT_CALL_CONTROL_ACK_TIMEOUT_MS = 5_000;
const DEFAULT_PREPARE_RECONNECT_TIMEOUT_MS = 10_000;
const MAX_PENDING_CONTROL_MESSAGES = 100;
const RECONNECT_BASE_DELAY_MS = 500;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 8_000;

/** Exponential reconnect backoff for attempt N (1-based): baseMs doubles each
 *  attempt, capped at maxDelayMs. Exported so the backoff window is unit-tested
 *  without a DOM/WebSocket harness. */
export const computeVoiceReconnectDelayMs = (
  attempt: number,
  baseMs: number,
  maxDelayMs: number,
) => Math.min(maxDelayMs, baseMs * 2 ** (Math.max(1, attempt) - 1));

const DEFAULT_SCENARIO_QUERY_PARAM = "scenarioId";

type VoiceConnectionState = {
  isConnected: boolean;
  pendingMessages: string[];
  pingInterval: ReturnType<typeof setInterval> | null;
  scenarioId: string | null;
  reconnectAttempts: number;
  reconnectResetTimeout: ReturnType<typeof setTimeout> | null;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  sessionId: string;
  ws: WebSocket | null;
};

type VoiceConnectionHandle = {
  callControl: (
    message: Omit<
      VoiceClientMessage & { type: "call_control" },
      "requestId" | "type"
    >,
  ) => Promise<void>;
  start: (input?: { sessionId?: string; scenarioId?: string }) => void;
  close: (reason?: string) => void;
  disconnect: () => void;
  endTurn: () => void;
  getReadyState: () => number;
  getScenarioId: () => string;
  getSessionId: () => string;
  send: (message: VoiceClientMessage) => void;
  sendAudio: (audio: Uint8Array | ArrayBuffer) => void;
  simulateDisconnect: () => void;
  subscribe: (callback: (message: VoiceServerMessage) => void) => () => void;
};

export class VoiceReconnectRejectedError extends Error {
  constructor(message = "Voice authorization could not be renewed.") {
    super(message);
    this.name = "VoiceReconnectRejectedError";
  }
}

const noop = () => {};
const noopAsync = () => Promise.resolve();
const noopUnsubscribe = () => noop;

const NOOP_CONNECTION: VoiceConnectionHandle = {
  callControl: noopAsync,
  close: noop,
  disconnect: noop,
  endTurn: noop,
  send: noop,
  sendAudio: noop,
  simulateDisconnect: noop,
  subscribe: noopUnsubscribe,
  getReadyState: () => WS_CLOSED,
  getScenarioId: () => "",
  getSessionId: () => "",
  start: () => {},
};

const createSessionId = () => crypto.randomUUID();

const buildWsUrl = (
  path: string,
  sessionId: string,
  scenarioId: string | null,
  query: Record<string, string>,
) => {
  const { hostname, port, protocol } = window.location;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  const portSuffix = port ? `:${port}` : "";
  const url = new URL(`${wsProtocol}//${hostname}${portSuffix}${path}`);
  url.searchParams.set("sessionId", sessionId);

  if (scenarioId) {
    url.searchParams.set(DEFAULT_SCENARIO_QUERY_PARAM, scenarioId);
  }
  for (const [key, value] of Object.entries(query)) {
    if (key !== "sessionId" && key !== DEFAULT_SCENARIO_QUERY_PARAM && value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
};

const isVoiceServerMessage = (value: unknown): value is VoiceServerMessage => {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }

  switch (value.type) {
    case "audio":
    case "assistant":
    case "call_lifecycle":
    case "call_control_ack":
    case "complete":
    case "connection":
    case "error":
    case "final":
    case "partial":
    case "pong":
    case "replay":
    case "session":
    case "turn":
      return true;
    default:
      return false;
  }
};

const parseServerMessage = (event: MessageEvent) => {
  if (typeof event.data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(event.data) as unknown;

    return isVoiceServerMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const createVoiceConnection = (
  path: string,
  options: VoiceConnectionOptions = {},
) => {
  if (typeof window === "undefined") {
    return NOOP_CONNECTION;
  }

  const listeners = new Set<(message: VoiceServerMessage) => void>();
  const pendingCallControls = new Map<
    string,
    {
      reject: (error: Error) => void;
      resolve: () => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  const shouldReconnect = options.reconnect !== false;
  const maxReconnectAttempts =
    options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
  const reconnectMaxDelayMs =
    options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
  const pingInterval = options.pingInterval ?? DEFAULT_PING_INTERVAL;
  const reconnectResetAfterMs =
    options.reconnectResetAfterMs ?? DEFAULT_RECONNECT_RESET_AFTER_MS;
  let lifecycleGeneration = 0;
  let disposed = false;
  let reconnectPreparationAbort: AbortController | null = null;

  // Exponential backoff: 500ms, 1s, 2s, 4s, 8s, 8s… capped at reconnectMaxDelayMs.
  // A short first retry recovers instantly from a blip; the cap keeps later
  // retries spanning a long outage (a deploy) without hammering the server.
  const computeReconnectDelayMs = (attempt: number) =>
    computeVoiceReconnectDelayMs(
      attempt,
      RECONNECT_BASE_DELAY_MS,
      reconnectMaxDelayMs,
    );

  const state: VoiceConnectionState = {
    isConnected: false,
    pendingMessages: [],
    scenarioId: options.scenarioId ?? null,
    pingInterval: null,
    reconnectAttempts: 0,
    reconnectResetTimeout: null,
    reconnectTimeout: null,
    sessionId: options.sessionId ?? createSessionId(),
    ws: null,
  };

  const emitConnection = (
    reconnect: VoiceServerMessage & { type: "connection" },
  ) => {
    listeners.forEach((listener) => listener(reconnect));
  };
  const emitTerminalFailure = (message: string) => {
    listeners.forEach((listener) =>
      listener({
        message,
        recoverable: false,
        type: "error",
      }),
    );
    emitConnection({
      reconnect: {
        attempts: state.reconnectAttempts,
        maxAttempts: maxReconnectAttempts,
        status: "exhausted",
      },
      type: "connection",
    });
  };

  const clearTimers = () => {
    if (state.pingInterval) {
      clearInterval(state.pingInterval);
      state.pingInterval = null;
    }

    if (state.reconnectTimeout) {
      clearTimeout(state.reconnectTimeout);
      state.reconnectTimeout = null;
    }

    if (state.reconnectResetTimeout) {
      clearTimeout(state.reconnectResetTimeout);
      state.reconnectResetTimeout = null;
    }
  };

  const flushPendingMessages = () => {
    if (state.ws?.readyState !== WS_OPEN) {
      return;
    }

    while (state.pendingMessages.length > 0) {
      const next = state.pendingMessages.shift();

      if (next !== undefined) {
        state.ws.send(next);
      }
    }
  };

  const rejectPendingCallControls = (message: string) => {
    for (const pending of pendingCallControls.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    pendingCallControls.clear();
  };

  const scheduleReconnect = () => {
    if (disposed) return;
    const scheduledGeneration = lifecycleGeneration;
    state.reconnectAttempts += 1;
    const delayMs = computeReconnectDelayMs(state.reconnectAttempts);
    const nextAttemptAt = Date.now() + delayMs;
    emitConnection({
      reconnect: {
        attempts: state.reconnectAttempts,
        lastDisconnectAt: Date.now(),
        maxAttempts: maxReconnectAttempts,
        nextAttemptAt,
        status: "reconnecting",
      },
      type: "connection",
    });
    state.reconnectTimeout = setTimeout(async () => {
      if (disposed || lifecycleGeneration !== scheduledGeneration) return;
      if (state.reconnectAttempts > maxReconnectAttempts) {
        emitTerminalFailure("Voice connection could not be restored.");

        return;
      }

      try {
        if (options.prepareReconnect) {
          const preparationAbort = new AbortController();
          reconnectPreparationAbort = preparationAbort;
          const timeout = setTimeout(
            () =>
              preparationAbort.abort("Voice reconnect preparation timed out"),
            options.prepareReconnectTimeoutMs ??
              DEFAULT_PREPARE_RECONNECT_TIMEOUT_MS,
          );
          try {
            await Promise.race([
              options.prepareReconnect({
                attempt: state.reconnectAttempts,
                path,
                scenarioId: state.scenarioId,
                sessionId: state.sessionId,
                signal: preparationAbort.signal,
              }),
              new Promise<never>((_, reject) => {
                preparationAbort.signal.addEventListener(
                  "abort",
                  () =>
                    reject(new Error("Voice reconnect preparation timed out.")),
                  { once: true },
                );
              }),
            ]);
          } finally {
            clearTimeout(timeout);
            if (reconnectPreparationAbort === preparationAbort) {
              reconnectPreparationAbort = null;
            }
          }
        }
      } catch (error) {
        if (disposed || lifecycleGeneration !== scheduledGeneration) return;
        if (error instanceof VoiceReconnectRejectedError) {
          emitTerminalFailure(error.message);

          return;
        }
        if (state.reconnectAttempts < maxReconnectAttempts) {
          scheduleReconnect();
        } else {
          emitTerminalFailure(
            "Voice authorization could not be renewed for reconnect.",
          );
        }

        return;
      }

      if (disposed || lifecycleGeneration !== scheduledGeneration) return;
      connect();
    }, delayMs);
  };

  const connect = () => {
    if (disposed) return;
    const ws = new WebSocket(
      buildWsUrl(path, state.sessionId, state.scenarioId, options.query ?? {}),
    );
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      if (state.ws !== ws) {
        ws.close(WS_NORMAL_CLOSURE);

        return;
      }
      const wasReconnecting = state.reconnectAttempts > 0;
      state.isConnected = true;
      flushPendingMessages();

      if (wasReconnecting) {
        emitConnection({
          reconnect: {
            attempts: state.reconnectAttempts,
            lastResumedAt: Date.now(),
            maxAttempts: maxReconnectAttempts,
            status: "resumed",
          },
          type: "connection",
        });
        state.reconnectResetTimeout = setTimeout(() => {
          if (state.ws === ws && ws.readyState === WS_OPEN) {
            state.reconnectAttempts = 0;
          }
          state.reconnectResetTimeout = null;
        }, reconnectResetAfterMs);
      }

      listeners.forEach((listener) =>
        listener({
          scenarioId: state.scenarioId ?? undefined,
          sessionId: state.sessionId,
          status: "active",
          type: "session",
        }),
      );

      state.pingInterval = setInterval(() => {
        if (ws.readyState === WS_OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, pingInterval);
    };

    ws.onmessage = (event) => {
      if (state.ws !== ws) return;
      const parsed = parseServerMessage(event);
      if (!parsed) {
        return;
      }

      if (parsed.type === "session") {
        state.sessionId = parsed.sessionId;
        state.scenarioId = parsed.scenarioId ?? state.scenarioId;
      }

      if (parsed.type === "call_control_ack") {
        const pending = pendingCallControls.get(parsed.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingCallControls.delete(parsed.requestId);
          if (parsed.ok) {
            pending.resolve();
          } else {
            pending.reject(
              new Error(parsed.message ?? `${parsed.action} was not applied`),
            );
          }
        }
      }

      listeners.forEach((listener) => listener(parsed));
    };

    ws.onclose = (event) => {
      if (state.ws !== ws) return;
      state.ws = null;
      state.isConnected = false;
      clearTimers();
      rejectPendingCallControls("Voice connection interrupted");

      const reconnectable =
        shouldReconnect &&
        event.code !== WS_NORMAL_CLOSURE &&
        event.code !== WS_UNAUTHORIZED &&
        event.code !== WS_FORBIDDEN &&
        state.reconnectAttempts < maxReconnectAttempts;
      const authorizationFailure =
        event.code === WS_UNAUTHORIZED || event.code === WS_FORBIDDEN;
      if (authorizationFailure) {
        listeners.forEach((listener) =>
          listener({
            message:
              event.code === WS_UNAUTHORIZED
                ? "Voice authorization expired or was rejected."
                : "Voice authorization was forbidden.",
            recoverable: false,
            type: "error",
          }),
        );
      }

      if (reconnectable) {
        scheduleReconnect();
      } else if (shouldReconnect && event.code !== WS_NORMAL_CLOSURE) {
        if (authorizationFailure) {
          emitConnection({
            reconnect: {
              attempts: state.reconnectAttempts,
              lastDisconnectAt: Date.now(),
              maxAttempts: maxReconnectAttempts,
              status: "exhausted",
            },
            type: "connection",
          });
        } else {
          emitTerminalFailure("Voice connection could not be restored.");
        }
      }
    };

    state.ws = ws;
  };

  const sendSerialized = (value: string | Uint8Array | ArrayBuffer) => {
    if (disposed) return;
    if (state.ws?.readyState === WS_OPEN) {
      state.ws.send(value);

      return;
    }

    if (typeof value !== "string") {
      return;
    }
    if (state.pendingMessages.length >= MAX_PENDING_CONTROL_MESSAGES) {
      state.pendingMessages.shift();
    }
    state.pendingMessages.push(value);
  };

  const send = (message: VoiceClientMessage) => {
    sendSerialized(JSON.stringify(message));
  };

  const start = (input: { sessionId?: string; scenarioId?: string } = {}) => {
    if (input.sessionId) {
      state.sessionId = input.sessionId;
    }

    if (input.scenarioId) {
      state.scenarioId = input.scenarioId;
    }

    send({
      scenarioId: state.scenarioId ?? undefined,
      sessionId: state.sessionId,
      type: "start",
    });
  };

  const sendAudio = (audio: Uint8Array | ArrayBuffer) => {
    sendSerialized(audio);
  };

  const endTurn = () => {
    send({ type: "end_turn" });
  };

  const callControl = (
    message: Omit<
      VoiceClientMessage & { type: "call_control" },
      "requestId" | "type"
    >,
  ) => {
    if (state.ws?.readyState !== WS_OPEN) {
      return Promise.reject(
        new Error(`${message.action} is unavailable while disconnected`),
      );
    }
    const requestId = crypto.randomUUID();
    const { promise, reject, resolve } = Promise.withResolvers<void>();
    const timeout = setTimeout(() => {
      pendingCallControls.delete(requestId);
      reject(new Error(`${message.action} acknowledgement timed out`));
    }, DEFAULT_CALL_CONTROL_ACK_TIMEOUT_MS);
    pendingCallControls.set(requestId, { reject, resolve, timeout });
    state.ws.send(
      JSON.stringify({
        ...message,
        requestId,
        type: "call_control",
      }),
    );

    return promise;
  };

  const close = (reason = "client-close") => {
    disposed = true;
    reconnectPreparationAbort?.abort();
    reconnectPreparationAbort = null;
    lifecycleGeneration += 1;
    clearTimers();
    rejectPendingCallControls("Voice connection closed");
    state.pendingMessages.length = 0;

    if (state.ws) {
      const ws = state.ws;
      state.ws = null;
      if (ws.readyState === WS_OPEN) {
        ws.send(JSON.stringify({ reason, type: "close" }));
      }
      ws.close(WS_NORMAL_CLOSURE);
    }

    state.isConnected = false;
    listeners.clear();
  };

  const disconnect = () => {
    disposed = true;
    reconnectPreparationAbort?.abort();
    reconnectPreparationAbort = null;
    lifecycleGeneration += 1;
    clearTimers();
    rejectPendingCallControls("Voice connection disconnected");
    state.pendingMessages.length = 0;
    if (state.ws) {
      const ws = state.ws;
      state.ws = null;
      ws.close(WS_NORMAL_CLOSURE);
    }
    state.isConnected = false;
    listeners.clear();
  };

  const simulateDisconnect = () => {
    if (state.ws?.readyState === WS_OPEN) {
      state.ws.close(4000, "absolutejs-voice-reconnect-proof");
    }
  };

  const subscribe = (callback: (message: VoiceServerMessage) => void) => {
    listeners.add(callback);

    return () => {
      listeners.delete(callback);
    };
  };

  connect();

  return {
    callControl,
    close,
    disconnect,
    endTurn,
    send,
    sendAudio,
    simulateDisconnect,
    start,
    subscribe,
    getReadyState: () => state.ws?.readyState ?? WS_CLOSED,
    getScenarioId: () => state.scenarioId ?? "",
    getSessionId: () => state.sessionId,
  };
};
