import { describe, expect, test } from "bun:test";
import {
  fromVapiAssistantConfig,
  type VapiAssistantConfig,
  type VoiceAgentModel,
  type VoiceRAGCollectionLike,
  type VoiceSessionRecord,
} from "../src";

const stubModelFactory = (): VoiceAgentModel<unknown, VoiceSessionRecord, unknown> => ({
  generate: async () => ({ assistantText: "", complete: true }),
});

const baseOptions = {
  modelFactory: () => stubModelFactory(),
};

describe("fromVapiAssistantConfig", () => {
  test("translates a minimal Vapi config and surfaces route hints", () => {
    const config: VapiAssistantConfig = {
      firstMessage: "Hi, this is Acme support.",
      maxDurationSeconds: 600,
      model: {
        messages: [
          { content: "You are a friendly support agent.", role: "system" },
        ],
        model: "gpt-4.1-mini",
        provider: "openai",
        temperature: 0.4,
      },
      silenceTimeoutSeconds: 30,
      transcriber: { language: "en", model: "nova-3", provider: "deepgram" },
      voice: { provider: "11labs", speed: 1.05, voiceId: "abcd" },
    };
    const result = fromVapiAssistantConfig(config, baseOptions);
    expect(result.assistantOptions.id).toBe("vapi-imported-assistant");
    expect(result.tools).toEqual([]);
    expect(result.unsupported).toEqual([]);
    expect(result.routeHints.firstMessage).toBe("Hi, this is Acme support.");
    expect(result.routeHints.maxDurationSeconds).toBe(600);
    expect(result.routeHints.silenceTimeoutSeconds).toBe(30);
    expect(result.routeHints.tts).toEqual({
      provider: "11labs",
      speed: 1.05,
      stability: undefined,
      style: undefined,
      voiceId: "abcd",
    });
    expect(result.routeHints.stt).toEqual({
      confidenceThreshold: undefined,
      language: "en",
      model: "nova-3",
      provider: "deepgram",
    });
    expect(typeof result.assistantOptions.system).toBe("string");
  });

  test("compiles {{var}} templates against built-ins and variableResolver", () => {
    const config: VapiAssistantConfig = {
      model: {
        messages: [
          {
            content:
              "Hi {{customer.name}}, the current time is {{now}}. Account: {{customer.accountId}}.",
            role: "system",
          },
        ],
        provider: "openai",
      },
    };
    const result = fromVapiAssistantConfig<{
      customer: { name: string; accountId: string };
    }>(config, {
      ...baseOptions,
      variableResolver: (path, { context }) => {
        if (path === "customer.name") return context.customer.name;
        if (path === "customer.accountId") return context.customer.accountId;
        return undefined;
      },
    });
    expect(typeof result.assistantOptions.system).toBe("function");
    const system = result.assistantOptions.system;
    expect(typeof system).toBe("function");
    const rendered = (system as (input: {
      context: {
        customer: { name: string; accountId: string };
      };
      session: VoiceSessionRecord;
    }) => string)({
      context: { customer: { accountId: "acct-1", name: "Alex" } },
      session: { createdAt: 0, id: "s", updatedAt: 0 },
    });
    expect(rendered).toContain("Hi Alex");
    expect(rendered).toContain("Account: acct-1");
    expect(rendered).toMatch(/the current time is \d{4}-\d{2}-\d{2}T/);
  });

  test("maps the Vapi tool catalog and surfaces unsupported entries", () => {
    const config: VapiAssistantConfig = {
      knowledgeBaseId: "kb-1",
      model: {
        provider: "openai",
        tools: [
          { type: "endCall", function: { name: "hangUp" } },
          {
            destinations: [
              { message: "Connecting you to billing.", number: "+15551234567" },
              { sipUri: "sip:supervisor@pbx" },
              { type: "unsupported-channel" },
            ],
            type: "transferCall",
          },
          { type: "voicemail" },
          { type: "dtmf" },
          {
            function: { name: "lookup" },
            method: "GET",
            type: "apiRequest",
            url: "https://example.com/api/lookup",
          },
          {
            function: { name: "createTicket" },
            server: { url: "https://example.com/api/tickets" },
            type: "function",
          },
          {
            function: { name: "secretRitual" },
            type: "function",
          },
          { type: "exoticType" },
        ],
      },
      voicemailDetection: { provider: "twilio" },
    };
    const stubCollection: VoiceRAGCollectionLike = {
      search: async () => [],
    };
    const result = fromVapiAssistantConfig(config, {
      ...baseOptions,
      knowledgeBase: { collection: stubCollection },
    });
    const toolNames = result.tools.map((tool) => tool.name);
    expect(toolNames).toContain("hangUp");
    expect(toolNames).toContain("transferCall");
    expect(toolNames).toContain("markVoicemail");
    expect(toolNames).toContain("lookup");
    expect(toolNames).toContain("createTicket");
    expect(toolNames).toContain("searchKnowledgeBase");
    expect(toolNames).not.toContain("sendDTMF");
    const fields = result.unsupported.map((entry) => entry.field);
    expect(fields).toContain("tools[].type=dtmf");
    expect(fields).toContain("tools[].name=secretRitual");
    expect(fields).toContain("tools[].type");
    expect(fields).toContain("voicemailDetection.provider");
  });

  test("dtmfSendFactory unlocks the DTMF tool", () => {
    const config: VapiAssistantConfig = {
      model: {
        provider: "openai",
        tools: [{ type: "dtmf" }],
      },
    };
    let dtmfSent = "";
    const result = fromVapiAssistantConfig(config, {
      ...baseOptions,
      dtmfSendFactory: () => ({ args }) => {
        dtmfSent = args.digits;
      },
    });
    expect(result.tools.map((tool) => tool.name)).toContain("sendDTMF");
    expect(result.unsupported.some((entry) => entry.field === "tools[].type=dtmf")).toBe(false);
    expect(dtmfSent).toBe("");
  });

  test("flags toolIds, monitorPlan, startSpeakingPlan, and LiquidJS filter templates", () => {
    const config: VapiAssistantConfig = {
      model: {
        messages: [
          {
            content: 'It is {{ "now" | date: "%Y-%m-%d" }} today.',
            role: "system",
          },
        ],
        provider: "openai",
        toolIds: ["saved-tool-1"],
      },
      monitorPlan: { listenUrl: "x" } as Record<string, unknown>,
      startSpeakingPlan: { waitSeconds: 0.4 } as Record<string, unknown>,
    };
    const result = fromVapiAssistantConfig(config, baseOptions);
    const fields = result.unsupported.map((entry) => entry.field);
    expect(fields).toContain("model.toolIds");
    expect(fields).toContain("monitorPlan");
    expect(fields).toContain("startSpeakingPlan");
    expect(fields).toContain("model.messages[0].content (filters)");
  });
});
