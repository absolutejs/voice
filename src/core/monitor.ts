import { Elysia } from "elysia";
import type {
  AudioFormat,
  VoiceMonitorRuntimeBinding,
  VoiceMonitorRuntimeRegisterInput,
  VoiceMonitorRuntimeSessionBinding,
  VoiceSessionHandle,
  VoiceSessionRecord,
} from "./types";

export type VoiceMonitorAudioSource = "assistant" | "caller" | (string & {});

export type VoiceMonitorAudioEvent = {
  at: number;
  chunk: Uint8Array;
  format: AudioFormat;
  source: VoiceMonitorAudioSource;
};

export type VoiceMonitorSessionRecord = {
  handle: VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>;
  metadata?: Record<string, unknown>;
  onAudio: (handler: (event: VoiceMonitorAudioEvent) => void) => () => void;
  onClose: (handler: (reason?: string) => void) => () => void;
  sessionId: string;
};

export type VoiceMonitorRegistry = {
  get: (sessionId: string) => VoiceMonitorSessionRecord | undefined;
  list: () => readonly { sessionId: string }[];
};

export type VoiceMonitorMutableRegistry = VoiceMonitorRegistry & {
  emit: (sessionId: string, event: VoiceMonitorAudioEvent) => void;
  emitClose: (sessionId: string, reason?: string) => void;
  /**
   * Deregister a session by id. No-op if the id isn't registered. The
   * `reason` flows into the close fan-out exactly once.
   */
  deregister: (sessionId: string, reason?: string) => void;
  register: (record: VoiceMonitorSessionRecord) => (reason?: string) => void;
};

export type VoiceMonitorRegistryRegisterInput = {
  handle: VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>;
  metadata?: Record<string, unknown>;
  sessionId: string;
};

const buildAudioFanout = () => {
  const handlers = new Set<(event: VoiceMonitorAudioEvent) => void>();

  return {
    emit: (event: VoiceMonitorAudioEvent) => {
      for (const handler of handlers) handler(event);
    },
    onAudio: (handler: (event: VoiceMonitorAudioEvent) => void) => {
      handlers.add(handler);

      return () => {
        handlers.delete(handler);
      };
    },
  };
};

const buildCloseFanout = () => {
  const handlers = new Set<(reason?: string) => void>();

  return {
    emitClose: (reason?: string) => {
      for (const handler of handlers) handler(reason);
    },
    onClose: (handler: (reason?: string) => void) => {
      handlers.add(handler);

      return () => {
        handlers.delete(handler);
      };
    },
  };
};

export const createVoiceInMemoryMonitorRegistry =
  (): VoiceMonitorMutableRegistry => {
    const records = new Map<
      string,
      VoiceMonitorSessionRecord & {
        emit: (event: VoiceMonitorAudioEvent) => void;
        emitClose: (reason?: string) => void;
      }
    >();
    const deregister = (sessionId: string, reason?: string) => {
      const existing = records.get(sessionId);
      if (!existing) return;
      records.delete(sessionId);
      existing.emitClose(reason ?? "deregistered");
    };

    return {
      deregister,
      emit: (sessionId, event) => {
        records.get(sessionId)?.emit(event);
      },
      emitClose: (sessionId, reason) => {
        records.get(sessionId)?.emitClose(reason);
      },
      get: (sessionId) => records.get(sessionId),
      list: () =>
        Array.from(records.keys()).map((sessionId) => ({ sessionId })),
      register: (record) => {
        const existing = records.get(record.sessionId);
        if (existing) {
          throw new Error(
            `VoiceMonitorRegistry already has a session "${record.sessionId}"; deregister it before re-registering.`,
          );
        }
        const wrapped =
          "emit" in record &&
          typeof (record as { emit?: unknown }).emit === "function"
            ? (record as VoiceMonitorSessionRecord & {
                emit: (event: VoiceMonitorAudioEvent) => void;
                emitClose: (reason?: string) => void;
              })
            : createVoiceMonitorSession({
                handle: record.handle,
                metadata: record.metadata,
                sessionId: record.sessionId,
              });
        // If the caller passed a raw record (without emit/emitClose helpers),
        // we adopt the wrapper but also forward onAudio/onClose subscriptions
        // so any future event from the caller still flows through.
        if (wrapped !== record) {
          record.onAudio((event) => wrapped.emit(event));
          record.onClose((reason) => wrapped.emitClose(reason));
        }
        records.set(record.sessionId, wrapped);

        return (reason?: string) => deregister(record.sessionId, reason);
      },
    };
  };
export const createVoiceMonitorSession = (
  input: VoiceMonitorRegistryRegisterInput,
): VoiceMonitorSessionRecord & {
  emit: (event: VoiceMonitorAudioEvent) => void;
  emitClose: (reason?: string) => void;
} => {
  const audio = buildAudioFanout();
  const close = buildCloseFanout();

  return {
    emit: audio.emit,
    emitClose: close.emitClose,
    handle: input.handle,
    metadata: input.metadata,
    onAudio: audio.onAudio,
    onClose: close.onClose,
    sessionId: input.sessionId,
  };
};

export type VoiceMonitorControlMessage =
  | {
      metadata?: Record<string, unknown>;
      reason?: string;
      target: string;
      type: "transfer";
    }
  | {
      reason?: string;
      type: "hangup";
    }
  | {
      metadata?: Record<string, unknown>;
      reason?: string;
      type: "escalate";
    }
  | {
      metadata?: Record<string, unknown>;
      type: "voicemail";
    }
  | {
      metadata?: Record<string, unknown>;
      type: "no-answer";
    }
  | {
      muted: boolean;
      target: "assistant" | "caller";
      type: "mute";
    }
  | {
      interrupt?: boolean;
      text: string;
      type: "say";
    }
  | {
      role: "assistant" | "system" | "user";
      text: string;
      type: "inject";
    };

export type VoiceMonitorControlAck =
  | {
      detail?: string;
      ok: true;
      type: VoiceMonitorControlMessage["type"];
    }
  | {
      error: string;
      ok: false;
      type: VoiceMonitorControlMessage["type"];
    };

export type VoiceMonitorControlHandlerInput = {
  message: VoiceMonitorControlMessage;
  raw: unknown;
  session: VoiceMonitorSessionRecord;
};

export type VoiceMonitorControlHandler = (
  input: VoiceMonitorControlHandlerInput,
) => Promise<VoiceMonitorControlAck> | VoiceMonitorControlAck;

const buildDefaultControlHandler = (
  type: VoiceMonitorControlMessage["type"],
): VoiceMonitorControlHandler | undefined => {
  if (type === "transfer") {
    return async ({ message, session }) => {
      if (message.type !== "transfer") {
        return { error: "internal: type mismatch", ok: false, type };
      }
      await session.handle.transfer({
        metadata: message.metadata,
        reason: message.reason,
        target: message.target,
      });

      return { detail: `Transferred to ${message.target}.`, ok: true, type };
    };
  }
  if (type === "hangup") {
    return async ({ message, session }) => {
      if (message.type !== "hangup") {
        return { error: "internal: type mismatch", ok: false, type };
      }
      await session.handle.complete();

      return {
        detail: message.reason ? `Hangup: ${message.reason}` : "Hangup.",
        ok: true,
        type,
      };
    };
  }
  if (type === "escalate") {
    return async ({ message, session }) => {
      if (message.type !== "escalate") {
        return { error: "internal: type mismatch", ok: false, type };
      }
      await session.handle.escalate({
        metadata: message.metadata,
        reason: message.reason ?? "monitor-requested-escalation",
      });

      return { detail: "Escalated.", ok: true, type };
    };
  }
  if (type === "voicemail") {
    return async ({ message, session }) => {
      if (message.type !== "voicemail") {
        return { error: "internal: type mismatch", ok: false, type };
      }
      await session.handle.markVoicemail({ metadata: message.metadata });

      return { detail: "Voicemail marked.", ok: true, type };
    };
  }
  if (type === "no-answer") {
    return async ({ message, session }) => {
      if (message.type !== "no-answer") {
        return { error: "internal: type mismatch", ok: false, type };
      }
      await session.handle.markNoAnswer({ metadata: message.metadata });

      return { detail: "Marked no-answer.", ok: true, type };
    };
  }

  // 'mute', 'say', 'inject' have no VoiceSessionHandle verb today;
  // callers must supply their own handler.
  return undefined;
};

const parseControlMessage = (
  raw: unknown,
): VoiceMonitorControlMessage | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const { type } = record;
  if (typeof type !== "string") return undefined;
  if (type === "transfer") {
    if (typeof record.target !== "string") return undefined;

    return {
      metadata: record.metadata as Record<string, unknown> | undefined,
      reason: typeof record.reason === "string" ? record.reason : undefined,
      target: record.target,
      type,
    };
  }
  if (type === "hangup") {
    return {
      reason: typeof record.reason === "string" ? record.reason : undefined,
      type,
    };
  }
  if (type === "escalate") {
    return {
      metadata: record.metadata as Record<string, unknown> | undefined,
      reason: typeof record.reason === "string" ? record.reason : undefined,
      type,
    };
  }
  if (type === "voicemail" || type === "no-answer") {
    return {
      metadata: record.metadata as Record<string, unknown> | undefined,
      type,
    };
  }
  if (type === "mute") {
    if (
      typeof record.muted !== "boolean" ||
      (record.target !== "assistant" && record.target !== "caller")
    ) {
      return undefined;
    }

    return { muted: record.muted, target: record.target, type };
  }
  if (type === "say") {
    if (typeof record.text !== "string") return undefined;

    return {
      interrupt:
        typeof record.interrupt === "boolean" ? record.interrupt : undefined,
      text: record.text,
      type,
    };
  }
  if (type === "inject") {
    if (
      typeof record.text !== "string" ||
      (record.role !== "assistant" &&
        record.role !== "system" &&
        record.role !== "user")
    ) {
      return undefined;
    }

    return { role: record.role, text: record.text, type };
  }

  return undefined;
};

export type VoiceMonitorAuthenticateInput = {
  request: unknown;
  route: "control" | "listen";
  sessionId: string;
};

export type VoiceMonitorAuthenticate = (
  input: VoiceMonitorAuthenticateInput,
) => boolean | Promise<boolean>;

export type VoiceLiveMonitorRoutesOptions = {
  authenticate?: VoiceMonitorAuthenticate;
  basePath?: string;
  controlHandlers?: Partial<
    Record<VoiceMonitorControlMessage["type"], VoiceMonitorControlHandler>
  >;
  controlPath?: false | string;
  htmlPath?: false | string;
  listenPath?: false | string;
  registry: VoiceMonitorRegistry;
};

export type VoiceMonitorPlanInput = {
  basePath?: string;
  baseUrl: string;
  controlPath?: string;
  listenPath?: string;
  sessionId: string;
};

export type VoiceMonitorPlan = {
  controlUrl: string;
  listenUrl: string;
};

const DEFAULT_BASE_PATH = "/api/voice/monitor";
const DEFAULT_LISTEN_PATH = ":sessionId/listen";
const DEFAULT_CONTROL_PATH = ":sessionId/control";

const joinPath = (...parts: readonly string[]): string =>
  parts
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter((part) => part.length > 0)
    .reduce((path, part) => `${path}/${part}`, "");

const substituteSessionId = (template: string, sessionId: string): string =>
  template.replace(":sessionId", encodeURIComponent(sessionId));

export const buildVoiceMonitorPlan = (
  input: VoiceMonitorPlanInput,
): VoiceMonitorPlan => {
  const basePath = input.basePath ?? DEFAULT_BASE_PATH;
  const listenTemplate =
    input.listenPath ?? joinPath(basePath, DEFAULT_LISTEN_PATH);
  const controlTemplate =
    input.controlPath ?? joinPath(basePath, DEFAULT_CONTROL_PATH);
  const baseUrl = input.baseUrl.replace(/\/+$/, "");

  return {
    controlUrl: `${baseUrl}${substituteSessionId(controlTemplate, input.sessionId)}`,
    listenUrl: `${baseUrl}${substituteSessionId(listenTemplate, input.sessionId)}`,
  };
};

export type VoiceMonitorRuntimeBindingOptions = {
  audioFormat?: AudioFormat;
  defaultSource?: VoiceMonitorAudioSource;
};

const DEFAULT_RUNTIME_AUDIO_FORMAT: AudioFormat = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 16_000,
};

const toUint8 = (chunk: Uint8Array | ArrayBuffer): Uint8Array =>
  chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);

export const createVoiceMonitorRuntimeBinding = (
  registry: VoiceMonitorMutableRegistry,
  options: VoiceMonitorRuntimeBindingOptions = {},
): VoiceMonitorRuntimeBinding => {
  const audioFormat = options.audioFormat ?? DEFAULT_RUNTIME_AUDIO_FORMAT;
  const defaultSource: VoiceMonitorAudioSource =
    options.defaultSource ?? "assistant";

  return {
    registerSession: (
      input: VoiceMonitorRuntimeRegisterInput,
    ): VoiceMonitorRuntimeSessionBinding => {
      // The plugin lifecycle can legitimately re-issue a session id (e.g.
      // session-switch on the same socket). Force-tear any previous record
      // down so the new register call succeeds.
      registry.deregister(input.sessionId, "superseded");
      const record = createVoiceMonitorSession({
        handle: input.handle,
        metadata: input.metadata,
        sessionId: input.sessionId,
      });
      const deregisterFromRegistry = registry.register(record);
      let closed = false;

      return {
        deregister: (reason?: string) => {
          if (closed) return;
          closed = true;
          try {
            deregisterFromRegistry(reason);
          } catch {}
        },
        emitAudio: (
          chunk: Uint8Array | ArrayBuffer,
          opts?: { source?: VoiceMonitorAudioSource },
        ) => {
          if (closed) return;
          const bytes = toUint8(chunk);
          if (bytes.byteLength === 0) return;
          record.emit({
            at: Date.now(),
            chunk: bytes,
            format: audioFormat,
            source: opts?.source ?? defaultSource,
          });
        },
      };
    },
  };
};

type ElysiaWebSocketLike = {
  close: (code?: number, reason?: string) => void;
  data?: {
    params?: Record<string, string | undefined>;
    query?: Record<string, unknown>;
  };
  raw?: { request?: unknown };
  send: (payload: ArrayBuffer | ArrayBufferView | string | Uint8Array) => void;
};

const resolveSessionId = (ws: ElysiaWebSocketLike): string | undefined => {
  const params = ws.data?.params;
  if (!params) return undefined;
  const value = params.sessionId;
  if (typeof value !== "string" || value.length === 0) return undefined;

  return value;
};

const resolveAuthenticate = async (
  authenticate: VoiceMonitorAuthenticate | undefined,
  input: VoiceMonitorAuthenticateInput,
): Promise<boolean> => {
  if (!authenticate) return true;

  return await authenticate(input);
};

export const createVoiceLiveMonitorRoutes = (
  options: VoiceLiveMonitorRoutesOptions,
) => {
  const basePath = options.basePath ?? DEFAULT_BASE_PATH;
  const listenPath =
    options.listenPath === undefined
      ? joinPath(basePath, DEFAULT_LISTEN_PATH)
      : options.listenPath;
  const controlPath =
    options.controlPath === undefined
      ? joinPath(basePath, DEFAULT_CONTROL_PATH)
      : options.controlPath;
  const handlers: Record<
    VoiceMonitorControlMessage["type"],
    VoiceMonitorControlHandler | undefined
  > = {
    escalate:
      options.controlHandlers?.escalate ??
      buildDefaultControlHandler("escalate"),
    hangup:
      options.controlHandlers?.hangup ?? buildDefaultControlHandler("hangup"),
    inject: options.controlHandlers?.inject,
    mute: options.controlHandlers?.mute,
    "no-answer":
      options.controlHandlers?.["no-answer"] ??
      buildDefaultControlHandler("no-answer"),
    say: options.controlHandlers?.say,
    transfer:
      options.controlHandlers?.transfer ??
      buildDefaultControlHandler("transfer"),
    voicemail:
      options.controlHandlers?.voicemail ??
      buildDefaultControlHandler("voicemail"),
  };

  const app = new Elysia({ name: "absolutejs-voice-monitor" });
  const unsubscribers = new WeakMap<object, Array<() => void>>();

  if (listenPath !== false && listenPath.length > 0) {
    app.ws(`/${listenPath.replace(/^\/+/, "")}`, {
      close: (ws) => {
        const subs = unsubscribers.get(ws);
        if (subs) {
          for (const unsub of subs) unsub();
          unsubscribers.delete(ws);
        }
      },
      open: async (ws) => {
        const webSocket = ws as unknown as ElysiaWebSocketLike;
        const sessionId = resolveSessionId(webSocket);
        if (!sessionId) {
          webSocket.send(
            JSON.stringify({
              error: "missing sessionId in path params",
              type: "error",
            }),
          );
          webSocket.close(4400, "missing sessionId");

          return;
        }
        const authed = await resolveAuthenticate(options.authenticate, {
          request: webSocket.raw?.request,
          route: "listen",
          sessionId,
        });
        if (!authed) {
          webSocket.send(
            JSON.stringify({ error: "unauthorized", type: "error" }),
          );
          webSocket.close(4401, "unauthorized");

          return;
        }
        const record = options.registry.get(sessionId);
        if (!record) {
          webSocket.send(
            JSON.stringify({
              error: `session "${sessionId}" not found`,
              type: "error",
            }),
          );
          webSocket.close(4404, "session not found");

          return;
        }
        const subs: Array<() => void> = [];
        webSocket.send(
          JSON.stringify({
            sessionId,
            type: "subscribed",
          }),
        );
        subs.push(
          record.onAudio((event) => {
            webSocket.send(event.chunk);
          }),
        );
        subs.push(
          record.onClose((reason) => {
            webSocket.send(
              JSON.stringify({
                reason,
                sessionId,
                type: "session-closed",
              }),
            );
            webSocket.close(1000, reason ?? "session-closed");
          }),
        );
        unsubscribers.set(ws, subs);
      },
    });
  }

  if (controlPath !== false && controlPath.length > 0) {
    app.ws(`/${controlPath.replace(/^\/+/, "")}`, {
      close: (ws) => {
        unsubscribers.delete(ws);
      },
      message: async (ws, raw) => {
        const webSocket = ws as unknown as ElysiaWebSocketLike;
        const sessionId = resolveSessionId(webSocket);
        if (!sessionId) {
          webSocket.send(
            JSON.stringify({
              error: "missing sessionId in path params",
              ok: false,
              type: "error",
            }),
          );

          return;
        }
        const message = parseControlMessage(raw);
        if (!message) {
          webSocket.send(
            JSON.stringify({
              error: "invalid control message",
              ok: false,
              type: "error",
            }),
          );

          return;
        }
        const record = options.registry.get(sessionId);
        if (!record) {
          webSocket.send(
            JSON.stringify({
              error: `session "${sessionId}" not found`,
              ok: false,
              type: message.type,
            }),
          );

          return;
        }
        const handler = handlers[message.type];
        if (!handler) {
          webSocket.send(
            JSON.stringify({
              error: `no handler registered for control type "${message.type}"`,
              ok: false,
              type: message.type,
            }),
          );

          return;
        }
        try {
          const ack = await handler({
            message,
            raw,
            session: record,
          });
          webSocket.send(JSON.stringify(ack));
        } catch (error) {
          webSocket.send(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              ok: false,
              type: message.type,
            } satisfies VoiceMonitorControlAck),
          );
        }
      },
      open: async (ws) => {
        const webSocket = ws as unknown as ElysiaWebSocketLike;
        const sessionId = resolveSessionId(webSocket);
        if (!sessionId) {
          webSocket.send(
            JSON.stringify({
              error: "missing sessionId in path params",
              type: "error",
            }),
          );
          webSocket.close(4400, "missing sessionId");

          return;
        }
        const authed = await resolveAuthenticate(options.authenticate, {
          request: webSocket.raw?.request,
          route: "control",
          sessionId,
        });
        if (!authed) {
          webSocket.send(
            JSON.stringify({ error: "unauthorized", type: "error" }),
          );
          webSocket.close(4401, "unauthorized");

          return;
        }
        const record = options.registry.get(sessionId);
        if (!record) {
          webSocket.send(
            JSON.stringify({
              error: `session "${sessionId}" not found`,
              type: "error",
            }),
          );
          webSocket.close(4404, "session not found");

          return;
        }
        webSocket.send(
          JSON.stringify({
            sessionId,
            supports: Object.entries(handlers)
              .filter(([, value]) => value !== undefined)
              .map(([key]) => key),
            type: "ready",
          }),
        );
      },
    });
  }

  if (options.htmlPath !== undefined && options.htmlPath !== false) {
    const path = options.htmlPath;
    app.get(path, () => {
      const sessions = options.registry
        .list()
        .map((entry) => `<li><code>${entry.sessionId}</code></li>`)
        .join("");
      const body = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Voice Monitor</title><style>body{background:#0b1216;color:#f6f1e7;font-family:ui-sans-serif,system-ui,sans-serif;margin:0;padding:32px}main{margin:auto;max-width:960px}h1{font-size:clamp(2rem,5vw,3.2rem);letter-spacing:-.04em;margin:.2rem 0 1rem}code{background:#171f25;border:1px solid #2c3a44;border-radius:8px;padding:2px 6px}ul{margin:8px 0;padding-left:18px}p.muted{color:#9aa8b2}</style></head><body><main><h1>Voice Monitor</h1><p class="muted">Active sessions registered with this monitor registry.</p><ul>${sessions || "<li><em>None.</em></li>"}</ul><p class="muted">Open <code>${listenPath}</code> and <code>${controlPath}</code> via WebSocket per session for live listen + control.</p></main></body></html>`;

      return new Response(body, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });
  }

  return app;
};
