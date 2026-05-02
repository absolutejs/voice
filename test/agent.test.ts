import { expect, test } from "bun:test";
import {
  createVoiceAgent,
  createVoiceAgentSquad,
  createVoiceAgentTool,
  createVoiceMemoryAuditEventStore,
  createVoiceMemoryTraceEventStore,
  createVoiceSessionRecord,
  createVoiceToolRuntime,
  evaluateVoiceAgentSquadContractEvidence,
  runVoiceAgentSquadContract,
  type VoiceAgentMessage,
  type VoiceAgentModel,
  type VoiceAgentTool,
  type VoiceSessionHandle,
  type VoiceSessionRecord,
  type VoiceTurnRecord,
} from "../src";

const createTurn = (text: string): VoiceTurnRecord => ({
  committedAt: 100,
  id: "turn-1",
  text,
  transcripts: [],
});

const createApi = () =>
  ({
    id: "session-agent",
  }) as VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>;

test("createVoiceAgent executes tools and feeds results into the next model pass", async () => {
  const calls: string[] = [];
  const lookupOrder = createVoiceAgentTool({
    execute: ({ args }) => {
      calls.push(`lookup:${String(args.orderId)}`);
      return {
        status: "shipped",
      };
    },
    name: "lookup_order",
    parameters: {
      properties: {
        orderId: {
          type: "string",
        },
      },
      type: "object",
    },
  });
  const model: VoiceAgentModel = {
    generate: ({ messages, tools }) => {
      expect(tools.map((tool) => tool.name)).toEqual(["lookup_order"]);
      const toolMessage = messages.find((message) => message.role === "tool");
      if (!toolMessage) {
        return {
          toolCalls: [
            {
              args: {
                orderId: "order-123",
              },
              id: "call-1",
              name: "lookup_order",
            },
          ],
        };
      }

      return {
        assistantText: `Your order is ${JSON.parse(toolMessage.content).status}.`,
      };
    },
  };
  const agent = createVoiceAgent({
    id: "support",
    model,
    tools: [lookupOrder],
  });

  const result = await agent.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent"),
    turn: createTurn("Where is order 123?"),
  });

  expect(calls).toEqual(["lookup:order-123"]);
  expect(result.assistantText).toBe("Your order is shipped.");
  expect(result.toolResults).toMatchObject([
    {
      status: "ok",
      toolCallId: "call-1",
      toolName: "lookup_order",
    },
  ]);
  expect(result.messages.map((message) => message.role)).toEqual([
    "user",
    "assistant",
    "tool",
    "assistant",
  ]);
});

test("createVoiceAgent can run tools through reliability runtime retries", async () => {
  let attempts = 0;
  const agent = createVoiceAgent({
    id: "support",
    model: {
      generate: ({ messages }) =>
        messages.some((message) => message.role === "tool")
          ? {
              assistantText: "Lookup recovered.",
            }
          : {
              toolCalls: [
                {
                  args: {
                    accountId: "acct-1",
                  },
                  id: "tool-1",
                  name: "lookup_account",
                },
              ],
            },
    },
    toolRuntime: createVoiceToolRuntime({
      maxRetries: 1,
    }),
    tools: [
      createVoiceAgentTool({
        execute: () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("temporary provider error");
          }
          return {
            status: "active",
          };
        },
        name: "lookup_account",
      }),
    ],
  });

  const result = await agent.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent"),
    turn: createTurn("Check account"),
  });

  expect(attempts).toBe(2);
  expect(result.assistantText).toBe("Lookup recovered.");
  expect(result.toolResults).toMatchObject([
    {
      metadata: {
        attempts: 2,
        timedOut: false,
      },
      status: "ok",
      toolName: "lookup_account",
    },
  ]);
});

test("createVoiceToolRuntime dedupes in-flight idempotent tool executions", async () => {
  let calls = 0;
  const runtime = createVoiceToolRuntime({
    idempotencyKey: ({ session, toolName, turn }) =>
      `${session.id}:${turn.id}:${toolName}`,
  });
  const tool = createVoiceAgentTool({
    execute: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 1));
      return {
        ok: true,
      };
    },
    name: "write_ticket",
  });
  const session = createVoiceSessionRecord("session-agent");
  const turn = createTurn("Create a ticket");
  const [first, second] = await Promise.all([
    runtime.execute({
      api: createApi(),
      args: {},
      context: {},
      session,
      tool,
      toolCallId: "tool-1",
      turn,
    }),
    runtime.execute({
      api: createApi(),
      args: {},
      context: {},
      session,
      tool,
      toolCallId: "tool-1",
      turn,
    }),
  ]);

  expect(calls).toBe(1);
  expect(first.result).toEqual({ ok: true });
  expect(second.result).toEqual({ ok: true });
  expect(first.idempotencyKey).toBe("session-agent:turn-1:write_ticket");
});

test("createVoiceToolRuntime can cache completed idempotent tool executions", async () => {
  let calls = 0;
  const runtime = createVoiceToolRuntime({
    idempotencyKey: ({ session, toolName, turn }) =>
      `${session.id}:${turn.id}:${toolName}`,
    idempotencyTtlMs: 60_000,
  });
  const tool = createVoiceAgentTool({
    execute: () => {
      calls += 1;
      return {
        call: calls,
      };
    },
    name: "create_ticket",
  });
  const session = createVoiceSessionRecord("session-agent");
  const turn = createTurn("Create a ticket");
  const first = await runtime.execute({
    api: createApi(),
    args: {},
    context: {},
    session,
    tool,
    toolCallId: "tool-1",
    turn,
  });
  const second = await runtime.execute({
    api: createApi(),
    args: {},
    context: {},
    session,
    tool,
    toolCallId: "tool-1",
    turn,
  });

  expect(calls).toBe(1);
  expect(first.result).toEqual({ call: 1 });
  expect(second.result).toEqual({ call: 1 });
});

test("createVoiceAgent records model, tool, and result trace events", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  const agent = createVoiceAgent({
    id: "support",
    model: {
      generate: ({ messages }) =>
        messages.some((message) => message.role === "tool")
          ? {
              assistantText: "The account is active.",
            }
          : {
              toolCalls: [
                {
                  args: {
                    accountId: "acct-1",
                  },
                  id: "tool-1",
                  name: "lookup_account",
                },
              ],
            },
    },
    trace,
    tools: [
      createVoiceAgentTool({
        execute: () => ({
          status: "active",
        }),
        name: "lookup_account",
      }),
    ],
  });

  await agent.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent", "scenario-agent"),
    turn: createTurn("Check account"),
  });

  expect((await trace.list()).map((event) => event.type).sort()).toEqual(
    ["agent.model", "agent.model", "agent.result", "agent.tool"].sort(),
  );
  expect(await trace.list({ scenarioId: "scenario-agent" })).toHaveLength(4);
  expect((await trace.list({ type: "agent.tool" }))[0]).toMatchObject({
    payload: {
      agentId: "support",
      status: "ok",
      toolCallId: "tool-1",
      toolName: "lookup_account",
    },
    sessionId: "session-agent",
    turnId: "turn-1",
  });
});

test("createVoiceAgent records model and tool audit events", async () => {
  const audit = createVoiceMemoryAuditEventStore();
  const agent = createVoiceAgent({
    audit,
    auditModel: "gpt-test",
    auditProvider: "openai",
    id: "support",
    model: {
      generate: ({ messages }) =>
        messages.some((message) => message.role === "tool")
          ? {
              assistantText: "The account is active.",
            }
          : {
              toolCalls: [
                {
                  args: {
                    accountId: "acct-1",
                  },
                  id: "tool-1",
                  name: "lookup_account",
                },
              ],
            },
    },
    tools: [
      createVoiceAgentTool({
        execute: () => ({
          status: "active",
        }),
        name: "lookup_account",
      }),
    ],
  });

  await agent.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent"),
    turn: createTurn("Check account"),
  });

  expect(await audit.list({ type: "provider.call" })).toMatchObject([
    {
      actor: {
        id: "support",
        kind: "agent",
      },
      outcome: "success",
      payload: {
        kind: "llm",
        model: "gpt-test",
        provider: "openai",
      },
      resource: {
        id: "openai",
        type: "provider",
      },
      sessionId: "session-agent",
    },
    {
      outcome: "success",
      payload: {
        kind: "llm",
        model: "gpt-test",
        provider: "openai",
      },
    },
  ]);
  expect(await audit.list({ type: "tool.call" })).toMatchObject([
    {
      actor: {
        id: "support",
        kind: "agent",
      },
      outcome: "success",
      payload: {
        toolCallId: "tool-1",
        toolName: "lookup_account",
      },
      resource: {
        id: "lookup_account",
        type: "tool",
      },
      sessionId: "session-agent",
    },
  ]);
});

test("createVoiceAgent records failed model audit events before throwing", async () => {
  const audit = createVoiceMemoryAuditEventStore();
  const agent = createVoiceAgent({
    audit,
    auditProvider: "anthropic",
    id: "support",
    model: {
      generate: () => {
        throw new Error("provider unavailable");
      },
    },
  });

  await expect(
    agent.run({
      api: createApi(),
      context: {},
      session: createVoiceSessionRecord("session-agent"),
      turn: createTurn("Check account"),
    }),
  ).rejects.toThrow("provider unavailable");

  expect(await audit.list({ type: "provider.call" })).toMatchObject([
    {
      outcome: "error",
      payload: {
        error: "provider unavailable",
        provider: "anthropic",
      },
    },
  ]);
});

test("createVoiceAgentSquad records handoff trace events", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  const intake = createVoiceAgent({
    id: "intake",
    model: {
      generate: () => ({
        handoff: {
          reason: "billing question",
          targetAgentId: "billing",
        },
      }),
    },
  });
  const billing = createVoiceAgent({
    id: "billing",
    model: {
      generate: () => ({
        assistantText: "Billing can help.",
      }),
    },
  });
  const squad = createVoiceAgentSquad({
    agents: [intake, billing],
    defaultAgentId: "intake",
    id: "front-desk",
    trace,
  });

  await squad.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent"),
    turn: createTurn("Billing please"),
  });

  expect(await trace.list({ type: "agent.handoff" })).toMatchObject([
    {
      payload: {
        agentId: "front-desk",
        fromAgentId: "intake",
        reason: "billing question",
        targetAgentId: "billing",
      },
    },
  ]);
});

test("createVoiceAgentSquad records handoff audit events", async () => {
  const audit = createVoiceMemoryAuditEventStore();
  const intake = createVoiceAgent({
    id: "intake",
    model: {
      generate: () => ({
        handoff: {
          reason: "billing question",
          targetAgentId: "billing",
        },
      }),
    },
  });
  const billing = createVoiceAgent({
    id: "billing",
    model: {
      generate: () => ({
        assistantText: "Billing can help.",
      }),
    },
  });
  const squad = createVoiceAgentSquad({
    agents: [intake, billing],
    audit,
    defaultAgentId: "intake",
    id: "front-desk",
  });

  await squad.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent"),
    turn: createTurn("Billing please"),
  });

  expect(await audit.list({ type: "handoff" })).toMatchObject([
    {
      actor: {
        id: "front-desk",
        kind: "agent",
      },
      outcome: "success",
      payload: {
        fromAgentId: "intake",
        reason: "billing question",
        toAgentId: "billing",
      },
      sessionId: "session-agent",
    },
  ]);
});

test("createVoiceAgent reports unknown tools as tool errors", async () => {
  const agent = createVoiceAgent({
    id: "support",
    model: {
      generate: ({ messages }) =>
        messages.some((message) => message.role === "tool")
          ? {
              assistantText: "I could not use that tool.",
            }
          : {
              toolCalls: [
                {
                  args: {},
                  name: "missing_tool",
                },
              ],
            },
    },
  });

  const result = await agent.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent"),
    turn: createTurn("Use a missing tool"),
  });

  expect(result.assistantText).toBe("I could not use that tool.");
  expect(result.toolResults).toMatchObject([
    {
      error: "Unknown voice agent tool: missing_tool",
      status: "error",
      toolName: "missing_tool",
    },
  ]);
});

test("createVoiceAgentSquad hands a turn to a specialist agent", async () => {
  const handoffs: string[] = [];
  const intake = createVoiceAgent({
    id: "intake",
    model: {
      generate: () => ({
        handoff: {
          reason: "billing question",
          targetAgentId: "billing",
        },
      }),
    },
  });
  const billingTool: VoiceAgentTool = createVoiceAgentTool({
    execute: () => ({
      balance: "$42.00",
    }),
    name: "get_balance",
  });
  const billing = createVoiceAgent({
    id: "billing",
    model: {
      generate: ({ messages }) =>
        messages.some((message) => message.role === "tool")
          ? {
              assistantText: "Your current balance is $42.00.",
            }
          : {
              toolCalls: [
                {
                  args: {},
                  name: "get_balance",
                },
              ],
            },
    },
    tools: [billingTool],
  });
  const squad = createVoiceAgentSquad({
    agents: [intake, billing],
    defaultAgentId: "intake",
    id: "front-desk",
    onHandoff: ({ fromAgentId, targetAgentId }) => {
      handoffs.push(`${fromAgentId}->${targetAgentId}`);
    },
  });

  const result = await squad.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent"),
    turn: createTurn("Can you help with billing?"),
  });

  expect(handoffs).toEqual(["intake->billing"]);
  expect(result.agentId).toBe("billing");
  expect(result.assistantText).toBe("Your current balance is $42.00.");
  expect(result.toolResults).toMatchObject([
    {
      status: "ok",
      toolName: "get_balance",
    },
  ]);
});

test("createVoiceAgentSquad can reroute handoffs through policy", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  let retentionMessages: VoiceAgentMessage[] = [];
  const intake = createVoiceAgent({
    id: "intake",
    model: {
      generate: () => ({
        handoff: {
          metadata: {
            queue: "billing",
          },
          reason: "billing cancellation risk",
          targetAgentId: "billing",
        },
      }),
    },
  });
  const billing = createVoiceAgent({
    id: "billing",
    model: {
      generate: () => ({
        assistantText: "Billing can help.",
      }),
    },
  });
  const retention = createVoiceAgent({
    id: "retention",
    model: {
      generate: ({ messages }) => {
        retentionMessages = messages;
        return {
          assistantText: "Retention can help.",
        };
      },
    },
  });
  const squad = createVoiceAgentSquad({
    agents: [intake, billing, retention],
    defaultAgentId: "intake",
    handoffPolicy: () => ({
      metadata: {
        risk: "cancel",
      },
      summary: "Route cancellation risk to retention.",
      targetAgentId: "retention",
    }),
    id: "front-desk",
    trace,
  });

  const result = await squad.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent"),
    turn: createTurn("I want to cancel after a billing issue"),
  });

  expect(result.agentId).toBe("retention");
  expect(result.assistantText).toBe("Retention can help.");
  expect(retentionMessages).toContainEqual({
    content: "Route cancellation risk to retention.",
    metadata: {
      queue: "billing",
      risk: "cancel",
    },
    name: "retention",
    role: "system",
  });
  expect(await trace.list({ type: "agent.handoff" })).toMatchObject([
    {
      payload: {
        agentId: "front-desk",
        fromAgentId: "intake",
        metadata: {
          queue: "billing",
          risk: "cancel",
        },
        originalTargetAgentId: "billing",
        reason: "Route cancellation risk to retention.",
        status: "allowed",
        summary: "Route cancellation risk to retention.",
        targetAgentId: "retention",
      },
    },
  ]);
});

test("createVoiceAgentSquad returns durable squad handoff state", async () => {
  const intake = createVoiceAgent({
    id: "intake",
    model: {
      generate: () => ({
        handoff: {
          metadata: {
            intent: "billing",
          },
          reason: "billing question",
          targetAgentId: "billing",
        },
      }),
    },
  });
  const billing = createVoiceAgent({
    id: "billing",
    model: {
      generate: () => ({
        assistantText: "Billing can help.",
      }),
    },
  });
  const squad = createVoiceAgentSquad({
    agents: [intake, billing],
    defaultAgentId: "intake",
    handoffPolicy: () => ({
      metadata: {
        priority: "high",
      },
      summary: "Move this turn to billing with account context.",
    }),
    id: "front-desk",
  });

  const result = await squad.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent"),
    turn: createTurn("Billing please"),
  });

  expect(result.squad).toMatchObject({
    agentId: "billing",
    handoffCount: 1,
    lastHandoff: {
      fromAgentId: "intake",
      metadata: {
        intent: "billing",
        priority: "high",
      },
      reason: "Move this turn to billing with account context.",
      status: "allowed",
      summary: "Move this turn to billing with account context.",
      targetAgentId: "billing",
      turnId: "turn-1",
    },
    previousAgentId: "intake",
  });
  expect(result.squad?.handoffs).toHaveLength(1);
});

test("createVoiceAgentSquad can apply handoff context policy for the next specialist", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  let billingMessages: VoiceAgentMessage[] = [];
  let billingSystem: string | undefined;
  const intake = createVoiceAgent({
    id: "intake",
    model: {
      generate: () => ({
        handoff: {
          metadata: {
            intent: "billing",
          },
          reason: "billing question",
          targetAgentId: "billing",
        },
      }),
    },
  });
  const billing = createVoiceAgent({
    id: "billing",
    model: {
      generate: ({ messages, system }) => {
        billingMessages = messages;
        billingSystem = system;
        return {
          assistantText: "Billing has the compact context.",
        };
      },
    },
  });
  const squad = createVoiceAgentSquad({
    agents: [intake, billing],
    contextPolicy: ({ summaryMessage, turn }) => ({
      messages: [
        summaryMessage,
        {
          content: turn.text,
          role: "user",
        },
      ],
      metadata: {
        contextPolicy: "summary-plus-current-turn",
      },
      system: "Use only the provided handoff summary and current turn.",
    }),
    defaultAgentId: "intake",
    handoffPolicy: () => ({
      summary: "Billing specialist should see only compact account context.",
    }),
    id: "front-desk",
    trace,
  });
  const session = createVoiceSessionRecord("session-agent");
  session.turns.push({
    committedAt: 90,
    id: "previous-turn",
    text: "This earlier detail should not reach billing.",
    transcripts: [],
  });

  const result = await squad.run({
    api: createApi(),
    context: {},
    session,
    turn: createTurn("Billing please"),
  });

  expect(result.assistantText).toBe("Billing has the compact context.");
  expect(billingSystem).toBe(
    "Use only the provided handoff summary and current turn.",
  );
  expect(billingMessages.slice(0, 2)).toEqual([
    expect.objectContaining({
      content: "Billing specialist should see only compact account context.",
      role: "system",
    }),
    {
      content: "Billing please",
      role: "user",
    },
  ]);
  expect(JSON.stringify(billingMessages)).not.toContain("earlier detail");
  expect(result.squad?.lastHandoff?.metadata).toMatchObject({
    contextPolicy: "summary-plus-current-turn",
    intent: "billing",
  });
  expect(await trace.list({ type: "agent.context" })).toMatchObject([
    {
      payload: {
        fromAgentId: "intake",
        nextMessageCount: 2,
        status: "applied",
        targetAgentId: "billing",
      },
    },
  ]);
});

test("createVoiceAgentSquad can block handoffs through policy", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  let billingCalls = 0;
  const intake = createVoiceAgent({
    id: "intake",
    model: {
      generate: () => ({
        handoff: {
          reason: "billing question",
          targetAgentId: "billing",
        },
      }),
    },
  });
  const billing = createVoiceAgent({
    id: "billing",
    model: {
      generate: () => {
        billingCalls += 1;
        return {
          assistantText: "Billing can help.",
        };
      },
    },
  });
  const squad = createVoiceAgentSquad({
    agents: [intake, billing],
    defaultAgentId: "intake",
    handoffPolicy: () => ({
      allow: false,
      escalate: {
        reason: "after-hours",
      },
      reason: "Billing is closed.",
    }),
    id: "front-desk",
    trace,
  });

  const result = await squad.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent"),
    turn: createTurn("Billing please"),
  });

  expect(billingCalls).toBe(0);
  expect(result.escalate).toEqual({
    reason: "after-hours",
  });
  expect(result.handoff).toBeUndefined();
  expect(await trace.list({ type: "agent.handoff" })).toMatchObject([
    {
      payload: {
        fromAgentId: "intake",
        reason: "Billing is closed.",
        status: "blocked",
        targetAgentId: "billing",
      },
    },
  ]);
});

test("createVoiceAgentSquad escalates and traces unknown handoff targets", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  const intake = createVoiceAgent({
    id: "intake",
    model: {
      generate: () => ({
        handoff: {
          reason: "legal question",
          targetAgentId: "legal",
        },
      }),
    },
  });
  const squad = createVoiceAgentSquad({
    agents: [intake],
    defaultAgentId: "intake",
    id: "front-desk",
    trace,
  });

  const result = await squad.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent"),
    turn: createTurn("I need legal help"),
  });

  expect(result.escalate).toEqual({
    metadata: undefined,
    reason: "Unknown handoff target: legal",
  });
  expect(result.handoff).toBeUndefined();
  expect(await trace.list({ type: "agent.handoff" })).toMatchObject([
    {
      payload: {
        fromAgentId: "intake",
        reason: "legal question",
        status: "unknown-target",
        targetAgentId: "legal",
      },
    },
  ]);
});

test("createVoiceAgentSquad escalates when handoff budget is exceeded", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  const intake = createVoiceAgent({
    id: "intake",
    model: {
      generate: () => ({
        handoff: {
          reason: "billing question",
          targetAgentId: "billing",
        },
      }),
    },
  });
  const billing = createVoiceAgent({
    id: "billing",
    model: {
      generate: () => ({
        assistantText: "Billing can help.",
      }),
    },
  });
  const squad = createVoiceAgentSquad({
    agents: [intake, billing],
    defaultAgentId: "intake",
    id: "front-desk",
    maxHandoffsPerTurn: 0,
    trace,
  });

  const result = await squad.run({
    api: createApi(),
    context: {},
    session: createVoiceSessionRecord("session-agent"),
    turn: createTurn("Billing please"),
  });

  expect(result.escalate).toEqual({
    metadata: undefined,
    reason: "Max handoffs exceeded: 0",
  });
  expect(result.handoff).toBeUndefined();
  expect(await trace.list({ type: "agent.handoff" })).toMatchObject([
    {
      payload: {
        fromAgentId: "intake",
        reason: "billing question",
        status: "max-exceeded",
        targetAgentId: "billing",
      },
    },
  ]);
});

test("runVoiceAgentSquadContract certifies specialist routing paths", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  const intake = createVoiceAgent({
    id: "intake",
    model: {
      generate: () => ({
        handoff: {
          reason: "billing question",
          targetAgentId: "billing",
        },
      }),
    },
  });
  const billing = createVoiceAgent({
    id: "billing",
    model: {
      generate: () => ({
        assistantText: "Billing can help with your invoice.",
        complete: true,
        result: {
          queue: "billing",
        },
      }),
    },
  });
  const squad = createVoiceAgentSquad({
    agents: [intake, billing],
    defaultAgentId: "intake",
    id: "front-desk",
    trace,
  });

  const report = await runVoiceAgentSquadContract({
    context: {},
    contract: {
      id: "billing-route",
      scenarioId: "billing-route",
      turns: [
        {
          expect: {
            assistantIncludes: ["invoice"],
            finalAgentId: "billing",
            handoffs: [
              {
                fromAgentId: "intake",
                reasonIncludes: ["billing question"],
                status: "allowed",
                targetAgentId: "billing",
              },
            ],
            outcome: "complete",
            result: ({ result }) =>
              (result as { queue?: string } | undefined)?.queue === "billing"
                ? []
                : [
                    {
                      code: "billing_route.queue_missing",
                      message: "Expected billing queue result.",
                    },
                  ],
          },
          text: "I have a billing question.",
        },
      ],
    },
    squad,
    trace,
  });

  expect(report).toMatchObject({
    contractId: "billing-route",
    pass: true,
    turns: [
      {
        agentId: "billing",
        handoffs: [
          {
            fromAgentId: "intake",
            status: "allowed",
            targetAgentId: "billing",
          },
        ],
        outcome: "complete",
        pass: true,
      },
    ],
  });
});

test("runVoiceAgentSquadContract certifies handoff metadata and summaries", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  const intake = createVoiceAgent({
    id: "intake",
    model: {
      generate: () => ({
        handoff: {
          metadata: {
            intent: "billing",
          },
          reason: "customer has invoice confusion",
          targetAgentId: "billing",
        },
      }),
    },
  });
  const billing = createVoiceAgent({
    id: "billing",
    model: {
      generate: () => ({
        assistantText: "Billing can help with invoices.",
      }),
    },
  });
  const squad = createVoiceAgentSquad({
    agents: [intake, billing],
    defaultAgentId: "intake",
    handoffPolicy: () => ({
      metadata: {
        priority: "high",
      },
      summary: "Send invoice confusion to billing specialist.",
    }),
    id: "front-desk",
    trace,
  });

  const report = await runVoiceAgentSquadContract({
    context: {},
    contract: {
      id: "billing-handoff-detail",
      turns: [
        {
          expect: {
            handoffs: [
              {
                metadata: {
                  intent: "billing",
                  priority: "high",
                },
                reasonIncludes: ["invoice confusion"],
                status: "allowed",
                summaryIncludes: ["billing specialist"],
                targetAgentId: "billing",
              },
            ],
            outcome: "assistant",
          },
          text: "My invoice looks wrong.",
        },
      ],
    },
    squad,
    trace,
  });

  expect(report.pass).toBe(true);
});

test("runVoiceAgentSquadContract reports routing regressions", async () => {
  const trace = createVoiceMemoryTraceEventStore();
  const intake = createVoiceAgent({
    id: "intake",
    model: {
      generate: () => ({
        handoff: {
          reason: "billing question",
          targetAgentId: "sales",
        },
      }),
    },
  });
  const sales = createVoiceAgent({
    id: "sales",
    model: {
      generate: () => ({
        assistantText: "Sales can help.",
      }),
    },
  });
  const squad = createVoiceAgentSquad({
    agents: [intake, sales],
    defaultAgentId: "intake",
    id: "front-desk",
    trace,
  });

  const report = await runVoiceAgentSquadContract({
    context: {},
    contract: {
      id: "billing-route",
      turns: [
        {
          expect: {
            assistantIncludes: ["invoice"],
            finalAgentId: "billing",
            handoffs: [
              {
                status: "allowed",
                targetAgentId: "billing",
              },
            ],
            outcome: "assistant",
          },
          text: "I have a billing question.",
        },
      ],
    },
    squad,
    trace,
  });

  expect(report.pass).toBe(false);
  expect(report.issues.map((issue) => issue.code)).toEqual([
    "agent_squad.final_agent_mismatch",
    "agent_squad.assistant_text_missing",
    "agent_squad.handoff_mismatch",
  ]);
  expect(report.issues.map((issue) => issue.message).join(" ")).toContain(
    "Expected final agent billing, saw sales.",
  );
});

test("evaluateVoiceAgentSquadContractEvidence accepts complete squad proof", () => {
  const report = evaluateVoiceAgentSquadContractEvidence(
    [
      {
        contractId: "billing-route",
        issues: [],
        pass: true,
        scenarioId: "billing-route",
        sessionId: "contract-session",
        turns: [
          {
            agentId: "billing",
            handoffs: [
              {
                fromAgentId: "front-desk",
                status: "allowed",
                targetAgentId: "billing",
              },
            ],
            issues: [],
            outcome: "complete",
            pass: true,
            result: { agentId: "billing" } as never,
            turnId: "turn-1",
          },
        ],
      },
    ],
    {
      maxBlockedHandoffs: 0,
      maxFailed: 0,
      maxIssues: 0,
      minContracts: 1,
      minHandoffs: 1,
      requiredContractIds: ["billing-route"],
      requiredFinalAgentIds: ["billing"],
      requiredHandoffStatuses: ["allowed"],
      requiredHandoffTargets: ["billing"],
      requiredScenarioIds: ["billing-route"],
    },
  );

  expect(report.ok).toBe(true);
  expect(report.handoffs).toBe(1);
  expect(report.finalAgentIds).toEqual(["billing"]);
});

test("evaluateVoiceAgentSquadContractEvidence reports missing squad proof", () => {
  const report = evaluateVoiceAgentSquadContractEvidence(
    [
      {
        contractId: "sales-route",
        issues: [
          { code: "agent_squad.final_agent_mismatch", message: "wrong agent" },
        ],
        pass: false,
        sessionId: "contract-session",
        turns: [
          {
            agentId: "sales",
            handoffs: [],
            issues: [],
            pass: true,
            result: { agentId: "sales" } as never,
            turnId: "turn-1",
          },
        ],
      },
    ],
    {
      maxFailed: 0,
      maxIssues: 0,
      minHandoffs: 1,
      requiredContractIds: ["billing-route"],
      requiredFinalAgentIds: ["billing"],
      requiredHandoffStatuses: ["allowed"],
      requiredHandoffTargets: ["billing"],
    },
  );

  expect(report.ok).toBe(false);
  expect(report.issues).toEqual(
    expect.arrayContaining([
      "Expected at most 0 failing agent squad contract(s), found 1.",
      "Expected at most 0 agent squad contract issue(s), found 1.",
      "Expected at least 1 agent squad handoff(s), found 0.",
      "Missing agent squad contract: billing-route.",
      "Missing final agent: billing.",
      "Missing agent squad handoff target: billing.",
      "Missing agent squad handoff status: allowed.",
    ]),
  );
});
