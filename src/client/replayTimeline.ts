import type { VoiceCallReviewArtifact } from "../testing/review";

export type ReplayTimelineEvent = {
  at: number;
  category: "agent" | "lifecycle" | "tool" | "user";
  detail?: string;
  durationMs?: number;
  label: string;
};

export type ReplayTimelineReport = {
  duration: number;
  events: ReplayTimelineEvent[];
  metadata: {
    artifactId: string;
    title: string;
  };
  startedAt: number;
  summary: {
    agentTurns: number;
    toolCalls: number;
    userTurns: number;
  };
};

export type ReplayTimelineInput = {
  artifact: VoiceCallReviewArtifact;
};

const categorize = (
  entry: VoiceCallReviewArtifact["timeline"][number],
): ReplayTimelineEvent["category"] => {
  const event = entry.event.toLowerCase();
  if (event.startsWith("stt.") || event.includes("user")) return "user";
  if (
    event.startsWith("tts.") ||
    event.includes("assistant") ||
    event.includes("agent")
  )
    return "agent";
  if (event.startsWith("tool.") || event.includes("tool")) return "tool";
  return "lifecycle";
};

export const buildReplayTimelineReport = (
  input: ReplayTimelineInput,
): ReplayTimelineReport => {
  const events: ReplayTimelineEvent[] = [];
  let summaryAgentTurns = 0;
  let summaryUserTurns = 0;
  let summaryToolCalls = 0;
  for (const entry of input.artifact.timeline ?? []) {
    const category = categorize(entry);
    if (category === "user") summaryUserTurns += 1;
    if (category === "agent") summaryAgentTurns += 1;
    if (category === "tool") summaryToolCalls += 1;
    events.push({
      at: entry.atMs,
      category,
      detail: entry.text ?? entry.reason,
      durationMs: entry.chunkDurationMs,
      label: entry.event,
    });
  }
  events.sort((a, b) => a.at - b.at);
  const first = events[0]?.at ?? 0;
  const last = events.at(-1)?.at ?? first;
  return {
    duration: last - first,
    events,
    metadata: {
      artifactId: input.artifact.id ?? "",
      title: input.artifact.title,
    },
    startedAt: first,
    summary: {
      agentTurns: summaryAgentTurns,
      toolCalls: summaryToolCalls,
      userTurns: summaryUserTurns,
    },
  };
};
