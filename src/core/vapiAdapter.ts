import type { VoiceAgent, VoiceAgentModel, VoiceAgentTool } from "./agent";
import {
  createVoiceApiRequestTool,
  createVoiceDTMFTool,
  createVoiceEndCallTool,
  createVoiceTransferCallTool,
  createVoiceVoicemailDetectionTool,
  type VoiceApiRequestToolHttpMethod,
  type VoiceDTMFToolOptions,
} from "./agentTools";
import {
  createVoiceAssistant,
  type VoiceAssistant,
  type VoiceAssistantOptions,
} from "./assistant";
import {
  createVoiceRAGTool,
  type VoiceRAGCollectionLike,
  type VoiceRAGToolOptions,
} from "./ragTool";
import type { VoiceSessionRecord } from "./types";

export type VapiAssistantMessage = {
  content?: string;
  role?: "assistant" | "system" | "user";
};

export type VapiAssistantConfigModel = {
  emotionRecognitionEnabled?: boolean;
  maxTokens?: number;
  messages?: readonly VapiAssistantMessage[];
  model?: string;
  numFastTurns?: number;
  provider?: string;
  systemPrompt?: string;
  temperature?: number;
  toolIds?: readonly string[];
  tools?: readonly VapiAssistantConfigTool[];
};

export type VapiAssistantConfigVoice = {
  provider?: string;
  speed?: number;
  stability?: number;
  style?: number;
  voiceId?: string;
};

export type VapiAssistantConfigTranscriber = {
  confidenceThreshold?: number;
  language?: string;
  model?: string;
  provider?: string;
};

export type VapiAssistantConfigTransferDestination = {
  description?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  number?: string;
  sipUri?: string;
  type?: string;
};

export type VapiAssistantConfigTool = {
  async?: boolean;
  description?: string;
  destinations?: readonly VapiAssistantConfigTransferDestination[];
  function?: {
    description?: string;
    name?: string;
    parameters?: Record<string, unknown>;
  };
  headers?: Record<string, string>;
  knowledgeBases?: readonly string[] | readonly Record<string, unknown>[];
  method?: string;
  name?: string;
  server?: {
    headers?: Record<string, string>;
    url?: string;
  };
  type?: string;
  url?: string;
};

export type VapiAssistantConfig = {
  backgroundDenoisingEnabled?: boolean;
  backgroundSound?: string;
  compliancePlan?: {
    hipaaEnabled?: boolean;
    pciEnabled?: boolean;
  };
  endCallMessage?: string;
  endCallPhrases?: readonly string[];
  firstMessage?: string;
  firstMessageMode?: string;
  knowledgeBaseId?: string;
  maxDurationSeconds?: number;
  model?: VapiAssistantConfigModel;
  monitorPlan?: Record<string, unknown>;
  recordingEnabled?: boolean;
  silenceTimeoutSeconds?: number;
  startSpeakingPlan?: Record<string, unknown>;
  stopSpeakingPlan?: Record<string, unknown>;
  transcriber?: VapiAssistantConfigTranscriber;
  variableValues?: Record<string, unknown>;
  voice?: VapiAssistantConfigVoice;
  voicemailDetection?: {
    provider?: string;
  };
  voicemailMessage?: string;
};

export type VoiceFromVapiModelFactoryInput = {
  model?: string;
  provider?: string;
  raw: VapiAssistantConfigModel;
  temperature?: number;
};

export type VoiceFromVapiModelFactory<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = (
  input: VoiceFromVapiModelFactoryInput,
) => VoiceAgentModel<TContext, TSession, TResult>;

export type VoiceFromVapiCustomToolInput = {
  raw: VapiAssistantConfigTool;
};

export type VoiceFromVapiCustomToolFactory<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = (
  input: VoiceFromVapiCustomToolInput,
) =>
  | VoiceAgentTool<
      TContext,
      TSession,
      Record<string, unknown>,
      unknown,
      TResult
    >
  | undefined;

export type VoiceFromVapiDTMFFactory<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = (input: {
  raw: VapiAssistantConfigTool;
}) => VoiceDTMFToolOptions<TContext, TSession>["send"] | undefined;

export type VoiceFromVapiKnowledgeBase<TContext = unknown> = {
  collection: VoiceRAGCollectionLike;
  toolOptions?: VoiceRAGToolOptions<TContext>;
};

export type VoiceFromVapiUnsupportedReason = {
  detail: string;
  field: string;
};

export type VoiceFromVapiRouteHints = {
  backgroundDenoisingEnabled?: boolean;
  backgroundSound?: string;
  endCallMessage?: string;
  endCallPhrases?: readonly string[];
  firstMessage?: string;
  firstMessageMode?: string;
  hipaaEnabled?: boolean;
  maxDurationSeconds?: number;
  pciEnabled?: boolean;
  recordingEnabled?: boolean;
  silenceTimeoutSeconds?: number;
  stt?: {
    confidenceThreshold?: number;
    language?: string;
    model?: string;
    provider?: string;
  };
  tts?: {
    provider?: string;
    speed?: number;
    stability?: number;
    style?: number;
    voiceId?: string;
  };
  voicemailMessage?: string;
};

export type VoiceFromVapiAssistantOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  assistantId?: string;
  customToolFactory?: VoiceFromVapiCustomToolFactory<
    TContext,
    TSession,
    TResult
  >;
  dtmfSendFactory?: VoiceFromVapiDTMFFactory<TContext, TSession>;
  fetch?: typeof fetch;
  knowledgeBase?: VoiceFromVapiKnowledgeBase<TContext>;
  modelFactory: VoiceFromVapiModelFactory<TContext, TSession, TResult>;
  systemFallback?: string;
  variableResolver?: (
    path: string,
    input: { context: TContext; session: TSession },
  ) => unknown;
};

export type VoiceFromVapiAssistantResult<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  assistant: VoiceAssistant<TContext, TSession, TResult>;
  assistantOptions: VoiceAssistantOptions<TContext, TSession, TResult>;
  modelAgent: VoiceAgent<TContext, TSession, TResult>;
  routeHints: VoiceFromVapiRouteHints;
  tools: ReadonlyArray<
    VoiceAgentTool<
      TContext,
      TSession,
      Record<string, unknown>,
      unknown,
      TResult
    >
  >;
  unsupported: readonly VoiceFromVapiUnsupportedReason[];
};

const VAPI_BUILT_IN_VARIABLES: Record<
  string,
  (input: { context: unknown; session: VoiceSessionRecord }) => string
> = {
  date: () => new Date().toISOString().slice(0, 10),
  now: () => new Date().toISOString(),
  time: () => new Date().toISOString().slice(11, 19),
};

const VAPI_TEMPLATE_REGEX = /\{\{\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/g;
const VAPI_TEMPLATE_FILTER_REGEX = /\{\{[^}]*\|[^}]*\}\}/;

const extractSystemPrompt = (
  model: VapiAssistantConfigModel | undefined,
  fallback: string | undefined,
): string | undefined => {
  if (model?.systemPrompt) return model.systemPrompt;
  const systemMessage = model?.messages?.find(
    (message) =>
      message.role === "system" && typeof message.content === "string",
  );
  if (systemMessage?.content) return systemMessage.content;

  return fallback;
};

const compileVapiSystem = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  template: string | undefined,
  variableResolver:
    | VoiceFromVapiAssistantOptions<TContext, TSession>["variableResolver"]
    | undefined,
): VoiceAssistantOptions<TContext, TSession>["system"] => {
  if (!template) return undefined;
  if (!VAPI_TEMPLATE_REGEX.test(template)) {
    return template;
  }
  VAPI_TEMPLATE_REGEX.lastIndex = 0;

  return (input: { context: TContext; session: TSession }) =>
    template.replace(VAPI_TEMPLATE_REGEX, (match, rawPath: string) => {
      const path = rawPath.trim();
      const builtIn = VAPI_BUILT_IN_VARIABLES[path];
      if (builtIn) {
        return builtIn({ context: input.context, session: input.session });
      }
      if (variableResolver) {
        const resolved = variableResolver(path, input);
        if (resolved !== undefined) return String(resolved);
      }

      return match;
    });
};

const httpMethodFor = (
  raw: string | undefined,
): VoiceApiRequestToolHttpMethod => {
  const upper = (raw ?? "GET").toUpperCase();
  if (
    upper === "GET" ||
    upper === "POST" ||
    upper === "PUT" ||
    upper === "DELETE" ||
    upper === "PATCH"
  ) {
    return upper;
  }

  return "GET";
};

const buildToolFromVapi = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  raw: VapiAssistantConfigTool,
  options: VoiceFromVapiAssistantOptions<TContext, TSession, TResult>,
  unsupported: VoiceFromVapiUnsupportedReason[],
):
  | VoiceAgentTool<
      TContext,
      TSession,
      Record<string, unknown>,
      unknown,
      TResult
    >
  | undefined => {
  const type = raw.type ?? "function";
  if (type === "endCall") {
    return createVoiceEndCallTool<TContext, TSession, TResult>({
      description: raw.function?.description ?? raw.description,
      name: raw.function?.name ?? "endCall",
    }) as VoiceAgentTool<
      TContext,
      TSession,
      Record<string, unknown>,
      unknown,
      TResult
    >;
  }
  if (type === "transferCall") {
    const destinations = (raw.destinations ?? [])
      .map((entry, index) => {
        const target = entry.number ?? entry.sipUri;
        if (!target) return undefined;

        return {
          description: entry.description,
          id:
            target.replace(/[^a-zA-Z0-9_-]/g, "-") ||
            `destination-${String(index)}`,
          message: entry.message,
          metadata: entry.metadata,
          target,
        };
      })
      .filter(
        (entry): entry is NonNullable<typeof entry> => entry !== undefined,
      );
    if (destinations.length === 0) {
      unsupported.push({
        detail:
          "transferCall tool has no usable destinations (need number or sipUri).",
        field: "tools[].destinations",
      });

      return undefined;
    }

    return createVoiceTransferCallTool<TContext, TSession, TResult>({
      description: raw.function?.description ?? raw.description,
      destinations,
      name: raw.function?.name ?? "transferCall",
    }) as VoiceAgentTool<
      TContext,
      TSession,
      Record<string, unknown>,
      unknown,
      TResult
    >;
  }
  if (type === "dtmf") {
    const send = options.dtmfSendFactory?.({ raw });
    if (!send) {
      unsupported.push({
        detail:
          "dtmf tool requires a dtmfSendFactory to map to the telephony adapter.",
        field: "tools[].type=dtmf",
      });

      return undefined;
    }

    return createVoiceDTMFTool<TContext, TSession>({
      description: raw.function?.description ?? raw.description,
      name: raw.function?.name ?? "sendDTMF",
      send,
    }) as VoiceAgentTool<
      TContext,
      TSession,
      Record<string, unknown>,
      unknown,
      TResult
    >;
  }
  if (type === "voicemail") {
    return createVoiceVoicemailDetectionTool<TContext, TSession, TResult>({
      description: raw.function?.description ?? raw.description,
      name: raw.function?.name ?? "markVoicemail",
    }) as VoiceAgentTool<
      TContext,
      TSession,
      Record<string, unknown>,
      unknown,
      TResult
    >;
  }
  if (type === "apiRequest") {
    if (!raw.url) {
      unsupported.push({
        detail: "apiRequest tool is missing url.",
        field: "tools[].url",
      });

      return undefined;
    }

    return createVoiceApiRequestTool<
      TContext,
      TSession,
      Record<string, unknown>
    >({
      description:
        raw.function?.description ?? raw.description ?? `Call ${raw.url}`,
      fetch: options.fetch,
      headers: raw.headers,
      method: httpMethodFor(raw.method),
      name: raw.function?.name ?? raw.name ?? "apiRequest",
      parameters: raw.function?.parameters,
      url: raw.url,
    }) as VoiceAgentTool<
      TContext,
      TSession,
      Record<string, unknown>,
      unknown,
      TResult
    >;
  }
  if (type === "query") {
    if (!options.knowledgeBase) {
      unsupported.push({
        detail:
          "query tool requires a knowledgeBase option (a VoiceRAGCollectionLike).",
        field: "tools[].type=query",
      });

      return undefined;
    }

    return createVoiceRAGTool<TContext, TSession>(
      options.knowledgeBase.collection,
      {
        description: raw.function?.description ?? raw.description,
        name: raw.function?.name ?? "searchKnowledgeBase",
        ...(options.knowledgeBase.toolOptions ?? {}),
      },
    ) as VoiceAgentTool<
      TContext,
      TSession,
      Record<string, unknown>,
      unknown,
      TResult
    >;
  }
  if (type === "function") {
    if (raw.server?.url) {
      return createVoiceApiRequestTool<
        TContext,
        TSession,
        Record<string, unknown>
      >({
        description:
          raw.function?.description ??
          raw.description ??
          `Custom function tool (server: ${raw.server.url}).`,
        fetch: options.fetch,
        headers: raw.server.headers,
        method: "POST",
        name: raw.function?.name ?? raw.name ?? "customFunction",
        parameters: raw.function?.parameters,
        url: raw.server.url,
      }) as VoiceAgentTool<
        TContext,
        TSession,
        Record<string, unknown>,
        unknown,
        TResult
      >;
    }
    const customTool = options.customToolFactory?.({ raw });
    if (customTool) return customTool;
    unsupported.push({
      detail:
        "function tool without server.url; provide customToolFactory to handle it.",
      field: `tools[].name=${raw.function?.name ?? raw.name ?? "<unnamed>"}`,
    });

    return undefined;
  }
  unsupported.push({
    detail: `Unrecognized Vapi tool type "${type}".`,
    field: "tools[].type",
  });

  return undefined;
};

const collectRouteHints = (
  config: VapiAssistantConfig,
): VoiceFromVapiRouteHints => ({
  backgroundDenoisingEnabled: config.backgroundDenoisingEnabled,
  backgroundSound: config.backgroundSound,
  endCallMessage: config.endCallMessage,
  endCallPhrases: config.endCallPhrases,
  firstMessage: config.firstMessage,
  firstMessageMode: config.firstMessageMode,
  hipaaEnabled: config.compliancePlan?.hipaaEnabled,
  maxDurationSeconds: config.maxDurationSeconds,
  pciEnabled: config.compliancePlan?.pciEnabled,
  recordingEnabled: config.recordingEnabled,
  silenceTimeoutSeconds: config.silenceTimeoutSeconds,
  stt: config.transcriber
    ? {
        confidenceThreshold: config.transcriber.confidenceThreshold,
        language: config.transcriber.language,
        model: config.transcriber.model,
        provider: config.transcriber.provider,
      }
    : undefined,
  tts: config.voice
    ? {
        provider: config.voice.provider,
        speed: config.voice.speed,
        stability: config.voice.stability,
        style: config.voice.style,
        voiceId: config.voice.voiceId,
      }
    : undefined,
  voicemailMessage: config.voicemailMessage,
});

const collectAssistantLevelUnsupported = (
  config: VapiAssistantConfig,
  unsupported: VoiceFromVapiUnsupportedReason[],
  hasKnowledgeBaseOption: boolean,
) => {
  if (config.knowledgeBaseId && !hasKnowledgeBaseOption) {
    unsupported.push({
      detail:
        "knowledgeBaseId is set but no knowledgeBase option was provided; configure one to surface a query tool.",
      field: "knowledgeBaseId",
    });
  }
  if (config.voicemailDetection?.provider) {
    unsupported.push({
      detail:
        "voicemailDetection.provider (ML detection) has no direct voice equivalent; wire your carrier's AMD callback and call VoiceSessionHandle.markVoicemail yourself.",
      field: "voicemailDetection.provider",
    });
  }
  if (config.startSpeakingPlan) {
    unsupported.push({
      detail:
        "startSpeakingPlan is a route-level concern; map it to the voice() plugin / barge-in config.",
      field: "startSpeakingPlan",
    });
  }
  if (config.stopSpeakingPlan) {
    unsupported.push({
      detail:
        "stopSpeakingPlan is a route-level concern; map it to the voice() plugin / barge-in config.",
      field: "stopSpeakingPlan",
    });
  }
  if (config.monitorPlan) {
    unsupported.push({
      detail:
        "monitorPlan (listenUrl / controlUrl) has no direct voice equivalent yet; use live-ops routes for control.",
      field: "monitorPlan",
    });
  }
  if (config.firstMessageMode) {
    unsupported.push({
      detail: `firstMessageMode "${config.firstMessageMode}" is a route concern; the system/firstMessage hints are in routeHints.`,
      field: "firstMessageMode",
    });
  }
  const systemPromptText = extractSystemPrompt(config.model, undefined);
  if (systemPromptText && VAPI_TEMPLATE_FILTER_REGEX.test(systemPromptText)) {
    unsupported.push({
      detail:
        "system prompt uses LiquidJS filter syntax (e.g. {{ now | date: ... }}); only bare {{var}} expansion is auto-translated.",
      field: "model.messages[0].content (filters)",
    });
  }
};

export const fromVapiAssistantConfig = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  config: VapiAssistantConfig,
  options: VoiceFromVapiAssistantOptions<TContext, TSession, TResult>,
): VoiceFromVapiAssistantResult<TContext, TSession, TResult> => {
  const unsupported: VoiceFromVapiUnsupportedReason[] = [];
  const model = options.modelFactory({
    model: config.model?.model,
    provider: config.model?.provider,
    raw: config.model ?? {},
    temperature: config.model?.temperature,
  });
  const system = compileVapiSystem<TContext, TSession>(
    extractSystemPrompt(config.model, options.systemFallback),
    options.variableResolver,
  );
  const tools: Array<
    VoiceAgentTool<
      TContext,
      TSession,
      Record<string, unknown>,
      unknown,
      TResult
    >
  > = [];
  for (const raw of config.model?.tools ?? []) {
    const tool = buildToolFromVapi<TContext, TSession, TResult>(
      raw,
      options,
      unsupported,
    );
    if (tool) tools.push(tool);
  }
  if (config.knowledgeBaseId && options.knowledgeBase) {
    const alreadyHas = tools.some(
      (tool) =>
        tool.name ===
        (options.knowledgeBase!.toolOptions?.name ?? "searchKnowledgeBase"),
    );
    if (!alreadyHas) {
      tools.push(
        createVoiceRAGTool<TContext, TSession>(
          options.knowledgeBase.collection,
          options.knowledgeBase.toolOptions,
        ) as VoiceAgentTool<
          TContext,
          TSession,
          Record<string, unknown>,
          unknown,
          TResult
        >,
      );
    }
  }
  if (config.model?.toolIds && config.model.toolIds.length > 0) {
    unsupported.push({
      detail:
        "model.toolIds references saved Vapi tools; provide their definitions via tools[] or customToolFactory.",
      field: "model.toolIds",
    });
  }
  collectAssistantLevelUnsupported(
    config,
    unsupported,
    Boolean(options.knowledgeBase),
  );
  const assistantOptions: VoiceAssistantOptions<TContext, TSession, TResult> = {
    id: options.assistantId ?? "vapi-imported-assistant",
    model,
    system,
    tools,
  };
  const assistant = createVoiceAssistant<TContext, TSession, TResult>(
    assistantOptions,
  );

  return {
    assistant,
    assistantOptions,
    modelAgent: assistant.agent,
    routeHints: collectRouteHints(config),
    tools,
    unsupported,
  };
};
