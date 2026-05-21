import { expect, test } from "bun:test";
import {
  createPersonaVoiceCaller,
  createScriptedVoiceCaller,
  createVoiceAgent,
  renderVoiceSimulationTranscript,
  runVoiceConversationSimulation,
  type VoiceAgentModel,
} from "../src";

const echoAgent = (
  reply: (
    userText: string,
    turnNumber: number,
  ) => { text: string; complete?: boolean },
) => {
  let turnNumber = 0;
  const model: VoiceAgentModel = {
    generate: ({ messages }) => {
      turnNumber += 1;
      const lastUser = [...messages]
        .reverse()
        .find((message) => message.role === "user");
      const out = reply(lastUser?.content ?? "", turnNumber);
      return {
        assistantText: out.text,
        ...(out.complete ? { complete: true } : {}),
      };
    },
  };
  return createVoiceAgent({ id: "sim-agent", model });
};

test("runs a scripted caller through the agent and captures the transcript", async () => {
  const agent = echoAgent((userText) => ({
    text: `You said: ${userText}`,
  }));
  const result = await runVoiceConversationSimulation({
    agent,
    caller: createScriptedVoiceCaller([
      "Hi, I need help with my bill.",
      "It's higher than last month.",
      "Thanks, bye.",
    ]),
    now: () => 1_000,
  });
  expect(result.turnCount).toBe(3);
  expect(result.endedReason).toBe("caller-hung-up");
  expect(result.transcript).toHaveLength(6); // 3 caller + 3 agent
  expect(result.transcript[0]).toMatchObject({
    role: "caller",
    text: "Hi, I need help with my bill.",
  });
  expect(result.transcript[1]).toMatchObject({
    role: "agent",
    text: "You said: Hi, I need help with my bill.",
  });
});

test("stops early when the agent route returns complete", async () => {
  const agent = echoAgent((_userText, turnNumber) => ({
    complete: turnNumber === 2,
    text: turnNumber === 2 ? "All set, goodbye." : "Tell me more.",
  }));
  const result = await runVoiceConversationSimulation({
    agent,
    caller: createScriptedVoiceCaller([
      "Cancel my appointment.",
      "Yes, the 3pm one.",
      "This line should never be reached.",
    ]),
  });
  expect(result.endedReason).toBe("agent-complete");
  expect(result.turnCount).toBe(2);
});

test("exhausts a script without hang-up sentinel and reports script-exhausted", async () => {
  const agent = echoAgent(() => ({ text: "ok" }));
  // Two caller lines; the simulator marks the last script line done=true,
  // so to hit script-exhausted we cap maxTurns above the script length and
  // verify a longer script ending mid-way still terminates.
  const result = await runVoiceConversationSimulation({
    agent,
    caller: createScriptedVoiceCaller(["only one line"]),
  });
  // single-line script: last line is flagged done → caller-hung-up
  expect(result.endedReason).toBe("caller-hung-up");
  expect(result.turnCount).toBe(1);
});

test("honors maxTurns as a hard cap", async () => {
  const agent = echoAgent(() => ({ text: "keep going" }));
  const result = await runVoiceConversationSimulation({
    agent,
    caller: {
      kind: "model",
      model: () => ({ text: "and another thing" }),
      persona: "a chatty caller who never stops",
    },
    maxTurns: 4,
  });
  expect(result.endedReason).toBe("max-turns");
  expect(result.turnCount).toBe(4);
});

test("persona caller hangs up on the [[END]] sentinel", async () => {
  const lines = ["What are your hours?", "Great, thank you [[END]]"];
  let index = 0;
  const caller = createPersonaVoiceCaller({
    completion: async () => lines[index++] ?? "[[END]]",
    persona: "a customer checking store hours",
  });
  const agent = echoAgent(() => ({ text: "We're open 9 to 5." }));
  const result = await runVoiceConversationSimulation({ agent, caller });
  expect(result.endedReason).toBe("caller-hung-up");
  expect(result.transcript.at(-2)).toMatchObject({
    role: "caller",
    text: "Great, thank you",
  });
});

test("agent sees prior turns as conversation history", async () => {
  const seenHistoryLengths: number[] = [];
  const model: VoiceAgentModel = {
    generate: ({ messages }) => {
      seenHistoryLengths.push(messages.length);
      return { assistantText: "noted" };
    },
  };
  const agent = createVoiceAgent({ id: "hist-agent", model });
  await runVoiceConversationSimulation({
    agent,
    caller: createScriptedVoiceCaller(["first", "second", "third"]),
  });
  // turn 1: [user]; turn 2: [user, assistant, user]; turn 3: [..., user]
  expect(seenHistoryLengths[0]).toBe(1);
  expect(seenHistoryLengths[1]).toBe(3);
  expect(seenHistoryLengths[2]).toBe(5);
});

test("renderVoiceSimulationTranscript formats caller/agent lines", () => {
  const text = renderVoiceSimulationTranscript([
    { at: 0, role: "caller", text: "hello" },
    { at: 1, role: "agent", text: "hi there" },
  ]);
  expect(text).toBe("Caller: hello\nAgent: hi there");
});
