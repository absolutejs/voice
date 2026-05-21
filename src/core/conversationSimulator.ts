import type { VoiceAgent, VoiceAgentRunResult } from "./agent";
import { createVoiceSessionRecord } from "./store";
import type {
  Transcript,
  VoiceSessionHandle,
  VoiceSessionRecord,
  VoiceTurnRecord,
} from "./types";

export type VoiceSimulatedSpeaker = "caller" | "agent";

export type VoiceSimulatedTurn = {
  role: VoiceSimulatedSpeaker;
  text: string;
  at: number;
};

export type VoiceSimulatorCallerReply = {
  text: string;
  /** When true the synthetic caller ends the call after this utterance. */
  done?: boolean;
};

export type VoiceSimulatorCallerModel = (input: {
  persona: string;
  transcript: ReadonlyArray<VoiceSimulatedTurn>;
  turnIndex: number;
}) => Promise<VoiceSimulatorCallerReply> | VoiceSimulatorCallerReply;

export type VoiceSimulatorCaller =
  | {
      kind: "script";
      /** Fixed caller utterances, delivered in order. */
      utterances: ReadonlyArray<string>;
    }
  | {
      kind: "model";
      /** System description of who the caller is and what they want. */
      persona: string;
      model: VoiceSimulatorCallerModel;
      /** Hard cap on caller turns (defaults to maxTurns). */
      maxCallerTurns?: number;
    };

export type VoiceConversationSimulationEndedReason =
  | "agent-complete"
  | "caller-hung-up"
  | "max-turns"
  | "script-exhausted";

export type VoiceConversationSimulationResult<TResult = unknown> = {
  transcript: VoiceSimulatedTurn[];
  turnCount: number;
  endedReason: VoiceConversationSimulationEndedReason;
  agentResults: VoiceAgentRunResult<TResult>[];
};

export type RunVoiceConversationSimulationInput<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  agent: Pick<VoiceAgent<TContext, TSession, TResult>, "run">;
  caller: VoiceSimulatorCaller;
  context?: TContext;
  session?: TSession;
  sessionId?: string;
  /** Hard cap on caller↔agent exchanges (default 12). */
  maxTurns?: number;
  /** Stop early when the agent route returns `complete: true` (default true). */
  stopOnAgentComplete?: boolean;
  now?: () => number;
  generateId?: () => string;
};

const createStubApi = <TContext, TSession extends VoiceSessionRecord, TResult>(
  sessionId: string,
): VoiceSessionHandle<TContext, TSession, TResult> =>
  ({ id: sessionId }) as VoiceSessionHandle<TContext, TSession, TResult>;

const callerTurnText = async (
  caller: VoiceSimulatorCaller,
  transcript: ReadonlyArray<VoiceSimulatedTurn>,
  turnIndex: number,
): Promise<VoiceSimulatorCallerReply | null> => {
  if (caller.kind === "script") {
    const text = caller.utterances[turnIndex];
    if (text === undefined) return null;
    return {
      done: turnIndex === caller.utterances.length - 1,
      text,
    };
  }
  const cap = caller.maxCallerTurns;
  if (cap !== undefined && turnIndex >= cap) return null;
  return Promise.resolve(
    caller.model({ persona: caller.persona, transcript, turnIndex }),
  );
};

export const runVoiceConversationSimulation = async <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  input: RunVoiceConversationSimulationInput<TContext, TSession, TResult>,
): Promise<VoiceConversationSimulationResult<TResult>> => {
  const now = input.now ?? (() => Date.now());
  const generateId =
    input.generateId ??
    (() => `sim_${Math.random().toString(36).slice(2, 10)}`);
  const maxTurns = input.maxTurns ?? 12;
  const stopOnComplete = input.stopOnAgentComplete !== false;
  const sessionId = input.sessionId ?? `sim-${generateId()}`;
  const session =
    input.session ?? createVoiceSessionRecord<TSession>(sessionId);
  const context = input.context ?? ({} as TContext);
  const api = createStubApi<TContext, TSession, TResult>(sessionId);

  const transcript: VoiceSimulatedTurn[] = [];
  const agentResults: VoiceAgentRunResult<TResult>[] = [];
  let endedReason: VoiceConversationSimulationEndedReason = "max-turns";

  for (let turnIndex = 0; turnIndex < maxTurns; turnIndex += 1) {
    const callerReply = await callerTurnText(
      input.caller,
      transcript,
      turnIndex,
    );
    if (!callerReply) {
      endedReason =
        input.caller.kind === "script" ? "script-exhausted" : "max-turns";
      break;
    }

    const callerAt = now();
    transcript.push({ at: callerAt, role: "caller", text: callerReply.text });

    const userTranscript: Transcript = {
      id: generateId(),
      isFinal: true,
      startedAtMs: callerAt,
      endedAtMs: callerAt,
      text: callerReply.text,
    };
    const turn: VoiceTurnRecord<TResult> = {
      committedAt: callerAt,
      id: generateId(),
      text: callerReply.text,
      transcripts: [userTranscript],
    };

    const result = await input.agent.run({
      api,
      context,
      session,
      turn,
    });
    agentResults.push(result);

    const assistantText = result.assistantText ?? "";
    if (assistantText.trim().length > 0) {
      transcript.push({ at: now(), role: "agent", text: assistantText });
    }

    // Append the completed exchange so the agent has history next turn.
    const committedTurn: VoiceTurnRecord<TResult> = {
      ...turn,
      assistantText: assistantText || undefined,
      ...(result.citations && result.citations.length > 0
        ? { citations: [...result.citations] }
        : {}),
    };
    session.turns = [...session.turns, committedTurn];

    if (stopOnComplete && result.complete) {
      endedReason = "agent-complete";
      break;
    }
    if (callerReply.done) {
      endedReason = "caller-hung-up";
      break;
    }
  }

  return {
    agentResults,
    endedReason,
    transcript,
    turnCount: agentResults.length,
  };
};

export const renderVoiceSimulationTranscript = (
  transcript: ReadonlyArray<VoiceSimulatedTurn>,
  labels: { caller?: string; agent?: string } = {},
): string => {
  const callerLabel = labels.caller ?? "Caller";
  const agentLabel = labels.agent ?? "Agent";
  return transcript
    .map(
      (turn) =>
        `${turn.role === "caller" ? callerLabel : agentLabel}: ${turn.text}`,
    )
    .join("\n");
};

export type VoiceScriptedCallerStep = string;

/** Convenience: build a deterministic scripted caller from a list of lines. */
export const createScriptedVoiceCaller = (
  utterances: ReadonlyArray<VoiceScriptedCallerStep>,
): VoiceSimulatorCaller => ({
  kind: "script",
  utterances,
});

export type VoicePersonaCallerCompletion = (input: {
  prompt: string;
  systemPrompt: string;
}) => Promise<string>;

/**
 * Builds an LLM-backed synthetic caller. The completion returns the caller's
 * next line; appending the sentinel `[[END]]` (case-insensitive) signals the
 * caller wants to hang up.
 */
export const createPersonaVoiceCaller = (options: {
  persona: string;
  completion: VoicePersonaCallerCompletion;
  maxCallerTurns?: number;
  endSentinel?: string;
}): VoiceSimulatorCaller => {
  const endSentinel = options.endSentinel ?? "[[END]]";
  return {
    kind: "model",
    ...(options.maxCallerTurns !== undefined
      ? { maxCallerTurns: options.maxCallerTurns }
      : {}),
    model: async ({ persona, transcript }) => {
      const history = transcript
        .map(
          (turn) => `${turn.role === "caller" ? "You" : "Agent"}: ${turn.text}`,
        )
        .join("\n");
      const raw = await options.completion({
        prompt:
          history.length > 0
            ? `Conversation so far:\n${history}\n\nYour next line:`
            : "Start the call with your opening line:",
        systemPrompt: `You are role-playing a caller in a voice conversation. ${persona}\nRespond with only your spoken line. When your goal is met or you want to hang up, end your line with ${endSentinel}.`,
      });
      const done = raw.includes(endSentinel);
      return {
        done,
        text: raw.replaceAll(endSentinel, "").trim(),
      };
    },
    persona: options.persona,
  };
};
