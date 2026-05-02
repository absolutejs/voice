import { expect, test } from "bun:test";
import {
  createAnthropicVoiceAssistantModel,
  createGeminiVoiceAssistantModel,
  createJSONVoiceAssistantModel,
  createOpenAIVoiceAssistantModel,
  createVoiceProviderOrchestrationProfile,
  createVoiceProviderRouter,
  resolveVoiceProviderRoutingPolicyPreset,
  createVoiceSessionRecord,
  type VoiceAgentModel,
  type VoiceAgentModelInput,
} from "../src";

const createInput = (): VoiceAgentModelInput => ({
  agentId: "support",
  context: {},
  messages: [
    {
      content: "hello",
      role: "user",
    },
  ],
  session: createVoiceSessionRecord("session-model"),
  system: "Be useful.",
  tools: [
    {
      description: "Lookup an order.",
      name: "lookup_order",
      parameters: {
        properties: {
          orderId: {
            type: "string",
          },
        },
        type: "object",
      },
    },
  ],
  turn: {
    committedAt: 100,
    id: "turn-1",
    text: "hello",
    transcripts: [],
  },
});

test("createJSONVoiceAssistantModel maps JSON into route results", async () => {
  const model = createJSONVoiceAssistantModel({
    generate: () => ({
      assistantText: "Done.",
      complete: true,
    }),
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "Done.",
    complete: true,
  });
});

test("createVoiceProviderRouter uses the selected provider when healthy", async () => {
  const calls: string[] = [];
  const model = createVoiceProviderRouter({
    fallback: ["primary", "backup"],
    providers: {
      backup: {
        generate: async () => {
          calls.push("backup");
          return {
            assistantText: "backup",
          };
        },
      },
      primary: {
        generate: async () => {
          calls.push("primary");
          return {
            assistantText: "primary",
            complete: true,
          };
        },
      },
    } satisfies Record<string, VoiceAgentModel>,
    selectProvider: () => "primary",
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "primary",
    complete: true,
  });
  expect(calls).toEqual(["primary"]);
});

test("createVoiceProviderRouter falls back on provider errors", async () => {
  const events: Array<Record<string, unknown>> = [];
  const model = createVoiceProviderRouter({
    fallback: ["primary", "backup"],
    onProviderEvent: (event) => {
      events.push(event);
    },
    providers: {
      backup: {
        generate: async () => ({
          assistantText: "backup",
          complete: true,
        }),
      },
      primary: {
        generate: async () => {
          throw new Error("OpenAI voice assistant model failed: HTTP 429");
        },
      },
    } satisfies Record<string, VoiceAgentModel>,
    selectProvider: () => "primary",
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "backup",
    complete: true,
  });
  expect(events).toMatchObject([
    {
      fallbackProvider: "backup",
      provider: "primary",
      rateLimited: true,
      selectedProvider: "primary",
      status: "error",
    },
    {
      fallbackProvider: "backup",
      provider: "backup",
      recovered: true,
      selectedProvider: "primary",
      status: "fallback",
    },
  ]);
});

test("createVoiceProviderRouter does not fall back on fatal errors", async () => {
  const events: Array<Record<string, unknown>> = [];
  const model = createVoiceProviderRouter({
    fallback: ["primary", "backup"],
    isProviderError: () => false,
    onProviderEvent: (event) => {
      events.push(event);
    },
    providers: {
      backup: {
        generate: async () => ({
          assistantText: "backup",
        }),
      },
      primary: {
        generate: async () => {
          throw new Error("tool serialization bug");
        },
      },
    } satisfies Record<string, VoiceAgentModel>,
    selectProvider: () => "primary",
  });

  await expect(model.generate(createInput())).rejects.toThrow(
    "tool serialization bug",
  );
  expect(events).toMatchObject([
    {
      provider: "primary",
      selectedProvider: "primary",
      status: "error",
    },
  ]);
  expect(events[0].fallbackProvider).toBeUndefined();
});

test("createVoiceProviderRouter can prefer the cheapest allowed provider", async () => {
  const calls: string[] = [];
  const model = createVoiceProviderRouter({
    allowProviders: ["fast", "cheap"],
    policy: "prefer-cheapest",
    providerProfiles: {
      cheap: {
        cost: 1,
        latencyMs: 900,
      },
      fast: {
        cost: 10,
        latencyMs: 100,
      },
    },
    providers: {
      cheap: {
        generate: async () => {
          calls.push("cheap");
          return {
            assistantText: "cheap",
          };
        },
      },
      fast: {
        generate: async () => {
          calls.push("fast");
          return {
            assistantText: "fast",
          };
        },
      },
      premium: {
        generate: async () => {
          calls.push("premium");
          return {
            assistantText: "premium",
          };
        },
      },
    } satisfies Record<string, VoiceAgentModel>,
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "cheap",
  });
  expect(calls).toEqual(["cheap"]);
});

test("createVoiceProviderRouter can prefer the highest quality provider", async () => {
  const calls: string[] = [];
  const model = createVoiceProviderRouter({
    policy: "quality-first",
    providerProfiles: {
      cheap: {
        cost: 1,
        latencyMs: 90,
        quality: 0.72,
      },
      strong: {
        cost: 8,
        latencyMs: 450,
        quality: 0.96,
      },
    },
    providers: {
      cheap: {
        generate: async () => {
          calls.push("cheap");
          return {
            assistantText: "cheap",
          };
        },
      },
      strong: {
        generate: async () => {
          calls.push("strong");
          return {
            assistantText: "strong",
          };
        },
      },
    } satisfies Record<string, VoiceAgentModel>,
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "strong",
  });
  expect(calls).toEqual(["strong"]);
});

test("createVoiceProviderRouter applies budget filters before ranking", async () => {
  const calls: string[] = [];
  const model = createVoiceProviderRouter({
    policy: {
      maxCost: 5,
      minQuality: 0.8,
      strategy: "quality-first",
    },
    providerProfiles: {
      cheap: {
        cost: 1,
        quality: 0.65,
      },
      premium: {
        cost: 10,
        quality: 0.98,
      },
      standard: {
        cost: 4,
        quality: 0.86,
      },
    },
    providers: {
      cheap: {
        generate: async () => {
          calls.push("cheap");
          return {
            assistantText: "cheap",
          };
        },
      },
      premium: {
        generate: async () => {
          calls.push("premium");
          return {
            assistantText: "premium",
          };
        },
      },
      standard: {
        generate: async () => {
          calls.push("standard");
          return {
            assistantText: "standard",
          };
        },
      },
    } satisfies Record<string, VoiceAgentModel>,
    selectProvider: () => "premium",
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "standard",
  });
  expect(calls).toEqual(["standard"]);
});

test("resolveVoiceProviderRoutingPolicyPreset exposes cost cap routing", async () => {
  const calls: string[] = [];
  const model = createVoiceProviderRouter({
    policy: resolveVoiceProviderRoutingPolicyPreset("cost-cap", {
      maxCost: 3,
    }),
    providerProfiles: {
      cheap: {
        cost: 1,
      },
      expensive: {
        cost: 7,
      },
    },
    providers: {
      cheap: {
        generate: async () => {
          calls.push("cheap");
          return {
            assistantText: "cheap",
          };
        },
      },
      expensive: {
        generate: async () => {
          calls.push("expensive");
          return {
            assistantText: "expensive",
          };
        },
      },
    } satisfies Record<string, VoiceAgentModel>,
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "cheap",
  });
  expect(calls).toEqual(["cheap"]);
});

test("createVoiceProviderOrchestrationProfile resolves surface-specific routing policy", async () => {
  const calls: string[] = [];
  const profile = createVoiceProviderOrchestrationProfile({
    defaultSurface: "live-call",
    id: "support-agent-providers",
    surfaces: {
      "background-summary": {
        fallback: ["cheap", "fast"],
        maxCost: 2,
        minQuality: 0.8,
        policy: "cost-cap",
        providerProfiles: {
          cheap: { cost: 1, latencyMs: 700, quality: 0.84 },
          fast: { cost: 5, latencyMs: 120, quality: 0.9 },
        },
      },
      "live-call": {
        fallback: ["fast", "cheap"],
        maxLatencyMs: 250,
        policy: "latency-first",
        providerHealth: {
          cooldownMs: 30_000,
        },
        providerProfiles: {
          cheap: { cost: 1, latencyMs: 700, quality: 0.84 },
          fast: { cost: 5, latencyMs: 120, quality: 0.9 },
        },
        timeoutMs: 1500,
      },
    },
  });
  const model = createVoiceProviderRouter({
    orchestrationProfile: profile,
    orchestrationSurface: "live-call",
    providers: {
      cheap: {
        generate: async () => {
          calls.push("cheap");
          return {
            assistantText: "cheap",
          };
        },
      },
      fast: {
        generate: async () => {
          calls.push("fast");
          return {
            assistantText: "fast",
          };
        },
      },
    } satisfies Record<string, VoiceAgentModel>,
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "fast",
  });
  expect(calls).toEqual(["fast"]);
  expect(profile.resolve("background-summary").policy).toMatchObject({
    maxCost: 2,
    minQuality: 0.8,
    strategy: "prefer-cheapest",
  });
});

test("createVoiceProviderOrchestrationProfile composes fallback and circuit breaker settings", async () => {
  let currentTime = 5_000;
  const calls: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const profile = createVoiceProviderOrchestrationProfile({
    id: "resilient-live-agent",
    surfaces: {
      live: {
        fallback: ["primary", "backup"],
        fallbackMode: "rate-limit",
        policy: "quality-first",
        providerHealth: {
          cooldownMs: 500,
          now: () => currentTime,
          rateLimitCooldownMs: 1_500,
        },
        providerProfiles: {
          backup: { quality: 0.88 },
          primary: { quality: 0.96 },
        },
      },
    },
  });
  const model = createVoiceProviderRouter({
    onProviderEvent: (event) => {
      events.push(event);
    },
    orchestrationProfile: profile,
    providers: {
      backup: {
        generate: async () => {
          calls.push("backup");
          return {
            assistantText: "backup",
          };
        },
      },
      primary: {
        generate: async () => {
          calls.push("primary");
          throw new Error("HTTP 429 rate limit");
        },
      },
    } satisfies Record<string, VoiceAgentModel>,
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "backup",
  });
  currentTime = 5_100;
  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "backup",
  });
  expect(calls).toEqual(["primary", "backup", "backup"]);
  expect(events[0]).toMatchObject({
    fallbackProvider: "backup",
    provider: "primary",
    providerHealth: {
      status: "suppressed",
      suppressedUntil: 6_500,
    },
    rateLimited: true,
    status: "error",
  });
});

test("createVoiceProviderRouter can fall back only on rate limits", async () => {
  const calls: string[] = [];
  const model = createVoiceProviderRouter({
    fallback: ["primary", "backup"],
    fallbackMode: "rate-limit",
    providers: {
      backup: {
        generate: async () => {
          calls.push("backup");
          return {
            assistantText: "backup",
          };
        },
      },
      primary: {
        generate: async () => {
          calls.push("primary");
          throw new Error("OpenAI voice assistant model failed: HTTP 500");
        },
      },
    } satisfies Record<string, VoiceAgentModel>,
    selectProvider: () => "primary",
  });

  await expect(model.generate(createInput())).rejects.toThrow("HTTP 500");
  expect(calls).toEqual(["primary"]);
});

test("createVoiceProviderRouter suppresses unhealthy providers until cooldown expires", async () => {
  let currentTime = 1_000;
  const calls: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const model = createVoiceProviderRouter({
    fallback: ["primary", "backup"],
    onProviderEvent: (event) => {
      events.push(event);
    },
    providerHealth: {
      cooldownMs: 500,
      now: () => currentTime,
      rateLimitCooldownMs: 1_000,
    },
    providers: {
      backup: {
        generate: async () => {
          calls.push("backup");
          return {
            assistantText: "backup",
          };
        },
      },
      primary: {
        generate: async () => {
          calls.push("primary");
          if (calls.filter((call) => call === "primary").length === 1) {
            throw new Error("OpenAI voice assistant model failed: HTTP 429");
          }
          return {
            assistantText: "primary",
          };
        },
      },
    } satisfies Record<string, VoiceAgentModel>,
    selectProvider: () => "primary",
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "backup",
  });
  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "backup",
  });

  currentTime = 2_001;
  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "primary",
  });
  expect(calls).toEqual(["primary", "backup", "backup", "primary"]);
  expect(events[0]).toMatchObject({
    provider: "primary",
    providerHealth: {
      consecutiveFailures: 1,
      status: "suppressed",
      suppressedUntil: 2_000,
    },
    suppressionRemainingMs: 1_000,
    suppressedUntil: 2_000,
  });
  expect(events.at(-1)).toMatchObject({
    provider: "primary",
    providerHealth: {
      consecutiveFailures: 0,
      status: "healthy",
    },
    status: "success",
  });
});

test("createVoiceProviderRouter falls back when provider exceeds latency budget", async () => {
  const calls: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const model = createVoiceProviderRouter({
    fallback: ["primary", "backup"],
    onProviderEvent: (event) => {
      events.push(event);
    },
    providerHealth: {
      cooldownMs: 1_000,
      now: () => 10_000,
    },
    providerProfiles: {
      primary: {
        timeoutMs: 5,
      },
    },
    providers: {
      backup: {
        generate: async () => {
          calls.push("backup");
          return {
            assistantText: "backup",
          };
        },
      },
      primary: {
        generate: async () => {
          calls.push("primary");
          await new Promise((resolve) => setTimeout(resolve, 30));
          return {
            assistantText: "too late",
          };
        },
      },
    } satisfies Record<string, VoiceAgentModel>,
    selectProvider: () => "primary",
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "backup",
  });
  expect(calls).toEqual(["primary", "backup"]);
  expect(events).toMatchObject([
    {
      attempt: 1,
      fallbackProvider: "backup",
      latencyBudgetMs: 5,
      provider: "primary",
      providerHealth: {
        status: "suppressed",
        suppressedUntil: 11_000,
      },
      selectedProvider: "primary",
      status: "error",
      timedOut: true,
    },
    {
      attempt: 2,
      fallbackProvider: "backup",
      provider: "backup",
      selectedProvider: "primary",
      status: "fallback",
    },
  ]);
});

test("createOpenAIVoiceAssistantModel maps tool calls from responses output", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const model = createOpenAIVoiceAssistantModel({
    apiKey: "test-key",
    fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          output: [
            {
              arguments: '{"orderId":"123"}',
              call_id: "call-1",
              name: "lookup_order",
              type: "function_call",
            },
          ],
        }),
      );
    },
  });

  const result = await model.generate(createInput());

  expect(requests[0]).toMatchObject({
    model: "gpt-4.1-mini",
    tool_choice: "auto",
  });
  expect(result.toolCalls).toEqual([
    {
      args: {
        orderId: "123",
      },
      id: "call-1",
      name: "lookup_order",
    },
  ]);
});

test("createOpenAIVoiceAssistantModel maps JSON text into route results", async () => {
  const usage: Record<string, unknown>[] = [];
  const model = createOpenAIVoiceAssistantModel({
    apiKey: "test-key",
    fetch: async () =>
      new Response(
        JSON.stringify({
          output_text: '{"assistantText":"Hi","complete":true}',
          usage: {
            input_tokens: 10,
            output_tokens: 5,
          },
        }),
      ),
    onUsage: (nextUsage) => {
      usage.push(nextUsage);
    },
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "Hi",
    complete: true,
  });
  expect(usage).toEqual([
    {
      input_tokens: 10,
      output_tokens: 5,
    },
  ]);
});

test("createOpenAIVoiceAssistantModel sends tool outputs as function call outputs", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const model = createOpenAIVoiceAssistantModel({
    apiKey: "test-key",
    fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          output_text: '{"assistantText":"Order shipped"}',
        }),
      );
    },
  });
  const input = createInput();
  input.messages.push(
    {
      content: "",
      metadata: {
        toolCalls: [
          {
            args: {
              orderId: "123",
            },
            id: "call-1",
            name: "lookup_order",
          },
        ],
      },
      role: "assistant",
    },
    {
      content: '{"status":"shipped"}',
      name: "lookup_order",
      role: "tool",
      toolCallId: "call-1",
    },
  );

  await model.generate(input);

  expect(requests[0].input).toContainEqual({
    arguments: '{"orderId":"123"}',
    call_id: "call-1",
    name: "lookup_order",
    type: "function_call",
  });
  expect(requests[0].input).toContainEqual({
    call_id: "call-1",
    output: '{"status":"shipped"}',
    type: "function_call_output",
  });
});

test("createAnthropicVoiceAssistantModel maps tool calls from content blocks", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const model = createAnthropicVoiceAssistantModel({
    apiKey: "test-key",
    fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          content: [
            {
              id: "toolu-1",
              input: {
                orderId: "123",
              },
              name: "lookup_order",
              type: "tool_use",
            },
          ],
          usage: {
            input_tokens: 8,
            output_tokens: 4,
          },
        }),
      );
    },
  });

  const result = await model.generate(createInput());

  expect(requests[0]).toMatchObject({
    max_tokens: 1024,
    model: "claude-sonnet-4-5",
    tool_choice: {
      type: "auto",
    },
  });
  expect(requests[0].tools).toEqual([
    {
      description: "Lookup an order.",
      input_schema: {
        properties: {
          orderId: {
            type: "string",
          },
        },
        type: "object",
      },
      name: "lookup_order",
    },
  ]);
  expect(result.toolCalls).toEqual([
    {
      args: {
        orderId: "123",
      },
      id: "toolu-1",
      name: "lookup_order",
    },
  ]);
});

test("createAnthropicVoiceAssistantModel sends tool results as tool_result blocks", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const model = createAnthropicVoiceAssistantModel({
    apiKey: "test-key",
    fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          content: [
            {
              text: '{"assistantText":"Order shipped"}',
              type: "text",
            },
          ],
        }),
      );
    },
  });
  const input = createInput();
  input.messages.push(
    {
      content: "",
      metadata: {
        toolCalls: [
          {
            args: {
              orderId: "123",
            },
            id: "toolu-1",
            name: "lookup_order",
          },
        ],
      },
      role: "assistant",
    },
    {
      content: '{"status":"shipped"}',
      name: "lookup_order",
      role: "tool",
      toolCallId: "toolu-1",
    },
  );

  await model.generate(input);

  expect(requests[0].messages).toContainEqual({
    content: [
      {
        id: "toolu-1",
        input: {
          orderId: "123",
        },
        name: "lookup_order",
        type: "tool_use",
      },
    ],
    role: "assistant",
  });
  expect(requests[0].messages).toContainEqual({
    content: [
      {
        content: '{"status":"shipped"}',
        tool_use_id: "toolu-1",
        type: "tool_result",
      },
    ],
    role: "user",
  });
});

test("createAnthropicVoiceAssistantModel maps fenced JSON text into route results", async () => {
  const model = createAnthropicVoiceAssistantModel({
    apiKey: "test-key",
    fetch: async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              text: '```json\n{"assistantText":"Done.","complete":true}\n```',
              type: "text",
            },
          ],
        }),
      ),
  });

  expect(await model.generate(createInput())).toMatchObject({
    assistantText: "Done.",
    complete: true,
  });
});

test("createGeminiVoiceAssistantModel maps function calls from candidate parts", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const model = createGeminiVoiceAssistantModel({
    apiKey: "test-key",
    fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      args: {
                        orderId: "123",
                      },
                      id: "fn-1",
                      name: "lookup_order",
                    },
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 8,
          },
        }),
      );
    },
  });

  const result = await model.generate(createInput());

  expect(requests[0]).toMatchObject({
    generationConfig: {},
    tools: [
      {
        functionDeclarations: [
          {
            description: "Lookup an order.",
            name: "lookup_order",
            parameters: {
              properties: {
                orderId: {
                  type: "STRING",
                },
              },
              type: "OBJECT",
            },
          },
        ],
      },
    ],
  });
  expect(result.toolCalls).toEqual([
    {
      args: {
        orderId: "123",
      },
      id: "fn-1",
      name: "lookup_order",
    },
  ]);
});

test("createGeminiVoiceAssistantModel sends function responses", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const model = createGeminiVoiceAssistantModel({
    apiKey: "test-key",
    fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"assistantText":"Order shipped"}',
                  },
                ],
              },
            },
          ],
        }),
      );
    },
  });
  const input = createInput();
  input.messages.push(
    {
      content: "",
      metadata: {
        toolCalls: [
          {
            args: {
              orderId: "123",
            },
            id: "fn-1",
            name: "lookup_order",
          },
        ],
      },
      role: "assistant",
    },
    {
      content: '{"status":"shipped"}',
      name: "lookup_order",
      role: "tool",
      toolCallId: "fn-1",
    },
  );

  await model.generate(input);

  expect(requests[0].contents).toContainEqual({
    parts: [
      {
        functionCall: {
          args: {
            orderId: "123",
          },
          id: "fn-1",
          name: "lookup_order",
        },
      },
    ],
    role: "model",
  });
  expect(requests[0].contents).toContainEqual({
    parts: [
      {
        functionResponse: {
          id: "fn-1",
          name: "lookup_order",
          response: {
            result: {
              status: "shipped",
            },
          },
        },
      },
    ],
    role: "user",
  });
});
