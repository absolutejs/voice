import { createVoiceAgentTool, type VoiceAgentTool } from "./agent";
import type {
  VoiceRouteResult,
  VoiceSessionHandle,
  VoiceSessionRecord,
} from "./types";

export type VoiceEndCallToolArgs = {
  reason?: string;
};

export type VoiceEndCallToolResult = {
  farewell?: string;
  ok: true;
  reason?: string;
};

export type VoiceEndCallToolOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  description?: string;
  farewell?:
    | string
    | ((input: {
        args: VoiceEndCallToolArgs;
        context: TContext;
        session: TSession;
      }) => string | undefined);
  name?: string;
  resolveResult?: (input: {
    args: VoiceEndCallToolArgs;
    context: TContext;
    session: TSession;
  }) => TResult | undefined;
};

export const createVoiceEndCallTool = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: VoiceEndCallToolOptions<TContext, TSession, TResult> = {},
): VoiceAgentTool<
  TContext,
  TSession,
  VoiceEndCallToolArgs,
  VoiceEndCallToolResult,
  TResult
> =>
  createVoiceAgentTool<
    TContext,
    TSession,
    VoiceEndCallToolArgs,
    VoiceEndCallToolResult,
    TResult
  >({
    description:
      options.description ??
      "End the call gracefully. Call this only when the conversation is complete or the caller asks to hang up.",
    name: options.name ?? "endCall",
    parameters: {
      additionalProperties: false,
      properties: {
        reason: {
          description: "Optional one-line note about why the call is ending.",
          type: "string",
        },
      },
      type: "object",
    },
    execute: async ({ api, args, context, session }) => {
      const farewell =
        typeof options.farewell === "function"
          ? options.farewell({ args, context, session })
          : options.farewell;
      const result = options.resolveResult?.({ args, context, session });
      await api.complete(result);

      return {
        farewell,
        ok: true,
        reason: args?.reason,
      };
    },
    resultToMessage: (result) => result.farewell ?? "Call ended.",
  });

export type VoiceTransferCallToolDestination = {
  description?: string;
  id: string;
  message?: string;
  metadata?: Record<string, unknown>;
  target: string;
  transferMode?: "cold" | "warm";
};

export type VoiceTransferCallToolArgs = {
  destinationId: string;
  reason?: string;
};

export type VoiceTransferCallToolResult = {
  destinationId: string;
  message?: string;
  ok: true;
  target: string;
};

export type VoiceTransferCallToolOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  description?: string;
  destinations: readonly VoiceTransferCallToolDestination[];
  name?: string;
  resolveResult?: (input: {
    args: VoiceTransferCallToolArgs;
    context: TContext;
    destination: VoiceTransferCallToolDestination;
    session: TSession;
  }) => TResult | undefined;
};

export const createVoiceTransferCallTool = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: VoiceTransferCallToolOptions<TContext, TSession, TResult>,
): VoiceAgentTool<
  TContext,
  TSession,
  VoiceTransferCallToolArgs,
  VoiceTransferCallToolResult,
  TResult
> => {
  if (options.destinations.length === 0) {
    throw new Error(
      "createVoiceTransferCallTool requires at least one destination.",
    );
  }
  const destinationIds = options.destinations.map((entry) => entry.id);
  const destinationDocs = options.destinations
    .map(
      (entry) =>
        `- ${entry.id} → ${entry.target}${entry.description ? `: ${entry.description}` : ""}`,
    )
    .join("\n");

  return createVoiceAgentTool<
    TContext,
    TSession,
    VoiceTransferCallToolArgs,
    VoiceTransferCallToolResult,
    TResult
  >({
    description:
      options.description ??
      `Transfer the caller to a human or another route. Available destinations:\n${destinationDocs}`,
    name: options.name ?? "transferCall",
    parameters: {
      additionalProperties: false,
      properties: {
        destinationId: {
          description: "Which configured destination to transfer the call to.",
          enum: destinationIds,
          type: "string",
        },
        reason: {
          description:
            "Optional one-line summary of why the transfer is happening.",
          type: "string",
        },
      },
      required: ["destinationId"],
      type: "object",
    },
    execute: async ({ api, args, context, session }) => {
      const destination = options.destinations.find(
        (entry) => entry.id === args?.destinationId,
      );
      if (!destination) {
        throw new Error(
          `Unknown transfer destination "${String(args?.destinationId)}". Allowed: ${destinationIds.join(", ")}.`,
        );
      }
      const result = options.resolveResult?.({
        args,
        context,
        destination,
        session,
      });
      await api.transfer({
        metadata: destination.metadata,
        reason: args?.reason,
        result,
        target: destination.target,
        transferMode: destination.transferMode,
      });

      return {
        destinationId: destination.id,
        message: destination.message,
        ok: true,
        target: destination.target,
      };
    },
    resultToMessage: (result) =>
      result.message ?? `Transferring you to ${result.target}.`,
  });
};

export type VoiceDTMFToolArgs = {
  digits: string;
};

export type VoiceDTMFToolResult = {
  digits: string;
  ok: true;
};

export type VoiceDTMFToolOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = {
  allowedDigits?: string;
  description?: string;
  maxDigits?: number;
  name?: string;
  send: (input: {
    api: VoiceSessionHandle<TContext, TSession>;
    args: VoiceDTMFToolArgs;
    context: TContext;
    session: TSession;
  }) => Promise<void> | void;
};

const DEFAULT_DTMF_ALLOWED = "0123456789*#";

export const createVoiceDTMFTool = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  options: VoiceDTMFToolOptions<TContext, TSession>,
): VoiceAgentTool<
  TContext,
  TSession,
  VoiceDTMFToolArgs,
  VoiceDTMFToolResult
> => {
  const allowedSet = new Set(
    (options.allowedDigits ?? DEFAULT_DTMF_ALLOWED).split(""),
  );
  const maxDigits = options.maxDigits ?? 32;

  return createVoiceAgentTool<
    TContext,
    TSession,
    VoiceDTMFToolArgs,
    VoiceDTMFToolResult
  >({
    description:
      options.description ??
      "Send DTMF (touch-tone) digits to the active call. Use for IVR navigation and keypad entry.",
    name: options.name ?? "sendDTMF",
    parameters: {
      additionalProperties: false,
      properties: {
        digits: {
          description: `Digits to send. Allowed characters: ${options.allowedDigits ?? DEFAULT_DTMF_ALLOWED}. Max length ${String(maxDigits)}.`,
          maxLength: maxDigits,
          minLength: 1,
          type: "string",
        },
      },
      required: ["digits"],
      type: "object",
    },
    execute: async ({ api, args, context, session }) => {
      const raw = typeof args?.digits === "string" ? args.digits.trim() : "";
      if (raw.length === 0) {
        throw new Error("DTMF tool requires a non-empty digits string.");
      }
      if (raw.length > maxDigits) {
        throw new Error(
          `DTMF digits exceed configured maxDigits=${String(maxDigits)}.`,
        );
      }
      for (const character of raw) {
        if (!allowedSet.has(character)) {
          throw new Error(
            `DTMF digit "${character}" is not in the allowed set "${options.allowedDigits ?? DEFAULT_DTMF_ALLOWED}".`,
          );
        }
      }
      await options.send({
        api,
        args: { digits: raw },
        context,
        session,
      });

      return {
        digits: raw,
        ok: true,
      };
    },
    resultToMessage: (result) => `Sent DTMF: ${result.digits}`,
  });
};

export type VoiceVoicemailDetectionToolArgs = {
  confidence?: number;
  reason?: string;
};

export type VoiceVoicemailDetectionToolResult = {
  confidence?: number;
  ok: true;
  reason?: string;
};

export type VoiceVoicemailDetectionToolOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  completeAfterMarking?: boolean;
  description?: string;
  message?: string;
  name?: string;
  resolveResult?: (input: {
    args: VoiceVoicemailDetectionToolArgs;
    context: TContext;
    session: TSession;
  }) => TResult | undefined;
};

export const createVoiceVoicemailDetectionTool = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: VoiceVoicemailDetectionToolOptions<TContext, TSession, TResult> = {},
): VoiceAgentTool<
  TContext,
  TSession,
  VoiceVoicemailDetectionToolArgs,
  VoiceVoicemailDetectionToolResult,
  TResult
> => {
  const completeAfterMarking = options.completeAfterMarking ?? true;

  return createVoiceAgentTool<
    TContext,
    TSession,
    VoiceVoicemailDetectionToolArgs,
    VoiceVoicemailDetectionToolResult,
    TResult
  >({
    description:
      options.description ??
      "Mark the call as a voicemail when you hear a beep, a 'please leave a message' prompt, or other voicemail cues. Call exactly once per detection.",
    name: options.name ?? "markVoicemail",
    parameters: {
      additionalProperties: false,
      properties: {
        confidence: {
          description: "Optional model confidence in the 0..1 range.",
          maximum: 1,
          minimum: 0,
          type: "number",
        },
        reason: {
          description:
            "One-line description of the cue that triggered detection.",
          type: "string",
        },
      },
      type: "object",
    },
    execute: async ({ api, args, context, session }) => {
      const metadata: Record<string, unknown> = {};
      if (typeof args?.confidence === "number") {
        metadata.confidence = args.confidence;
      }
      if (typeof args?.reason === "string" && args.reason.length > 0) {
        metadata.reason = args.reason;
      }
      const result = options.resolveResult?.({ args, context, session });
      await api.markVoicemail({ metadata, result });
      if (completeAfterMarking) {
        await api.complete(result);
      }

      return {
        confidence: args?.confidence,
        ok: true,
        reason: args?.reason,
      };
    },
    resultToMessage: (result) =>
      options.message ??
      `Voicemail detected${typeof result.confidence === "number" ? ` (confidence ${result.confidence.toFixed(2)})` : ""}.`,
  });
};

export type VoiceApiRequestToolHttpMethod =
  | "DELETE"
  | "GET"
  | "PATCH"
  | "POST"
  | "PUT";

export type VoiceApiRequestToolArgs = Record<string, unknown>;

export type VoiceApiRequestToolResult<TResponse = unknown> = {
  body: TResponse;
  ok: boolean;
  status: number;
  url: string;
};

export type VoiceApiRequestToolFetch = (
  request: Request,
) => Promise<Response> | Response;

export type VoiceApiRequestToolOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TArgs extends VoiceApiRequestToolArgs = VoiceApiRequestToolArgs,
  TResponse = unknown,
> = {
  buildBody?: (input: {
    args: TArgs;
    context: TContext;
    session: TSession;
  }) => unknown;
  buildHeaders?: (input: {
    args: TArgs;
    context: TContext;
    session: TSession;
  }) => HeadersInit | undefined;
  buildQuery?: (input: {
    args: TArgs;
    context: TContext;
    session: TSession;
  }) => Record<string, string | number | undefined> | undefined;
  description: string;
  fetch?: VoiceApiRequestToolFetch;
  formatResult?: (result: VoiceApiRequestToolResult<TResponse>) => string;
  headers?: HeadersInit;
  method?: VoiceApiRequestToolHttpMethod;
  name: string;
  parameters?: Record<string, unknown>;
  parseResponse?: (response: Response) => Promise<TResponse> | TResponse;
  url: string;
};

const appendSearchParams = (
  url: URL,
  entries: Record<string, string | number | undefined> | undefined,
): void => {
  if (!entries) return;
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
};

export const createVoiceApiRequestTool = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TArgs extends VoiceApiRequestToolArgs = VoiceApiRequestToolArgs,
  TResponse = unknown,
>(
  options: VoiceApiRequestToolOptions<TContext, TSession, TArgs, TResponse>,
): VoiceAgentTool<
  TContext,
  TSession,
  TArgs,
  VoiceApiRequestToolResult<TResponse>
> => {
  const method = options.method ?? "GET";
  const fetchImpl: VoiceApiRequestToolFetch =
    options.fetch ?? ((request) => fetch(request));

  return createVoiceAgentTool<
    TContext,
    TSession,
    TArgs,
    VoiceApiRequestToolResult<TResponse>
  >({
    description: options.description,
    name: options.name,
    parameters: options.parameters,
    resultToMessage:
      options.formatResult ??
      ((result) =>
        result.ok
          ? `API request ${options.name} succeeded (${String(result.status)}).`
          : `API request ${options.name} failed with status ${String(result.status)}.`),
    execute: async ({ args, context, session }) => {
      const url = new URL(options.url);
      appendSearchParams(url, options.buildQuery?.({ args, context, session }));
      const baseHeaders = new Headers(options.headers ?? {});
      const dynamicHeaders = options.buildHeaders?.({
        args,
        context,
        session,
      });
      if (dynamicHeaders) {
        const merged = new Headers(dynamicHeaders);
        merged.forEach((value, key) => baseHeaders.set(key, value));
      }
      const body =
        method === "GET" || method === "DELETE"
          ? undefined
          : options.buildBody
            ? JSON.stringify(options.buildBody({ args, context, session }))
            : JSON.stringify(args);
      if (body !== undefined && !baseHeaders.has("content-type")) {
        baseHeaders.set("content-type", "application/json");
      }
      const request = new Request(url, {
        body,
        headers: baseHeaders,
        method,
      });
      const response = await fetchImpl(request);
      const parsedBody = options.parseResponse
        ? await options.parseResponse(response)
        : ((await response.json().catch(() => undefined)) as TResponse);

      return {
        body: parsedBody,
        ok: response.ok,
        status: response.status,
        url: url.toString(),
      };
    },
  });
};
