import type {
  VoiceBargeInMonitor,
  VoiceBargeInMonitorEvent,
  VoiceBargeInMonitorSnapshot,
  VoiceBargeInTriggerReason,
} from "../types";

export type VoiceBargeInMonitorOptions = {
  fetch?: typeof fetch;
  path?: string;
  thresholdMs?: number;
};

const DEFAULT_THRESHOLD_MS = 250;

const createEventId = () =>
  `barge-in:${Date.now()}:${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

const summarize = (
  events: VoiceBargeInMonitorEvent[],
  thresholdMs: number,
): VoiceBargeInMonitorSnapshot => {
  const stopped = events.filter((event) => event.status === "stopped");
  const latencies = stopped
    .map((event) => event.latencyMs)
    .filter((value): value is number => typeof value === "number");
  const failed = stopped.filter(
    (event) =>
      typeof event.latencyMs === "number" && event.latencyMs > thresholdMs,
  ).length;
  const passed = stopped.length - failed;

  return {
    averageLatencyMs:
      latencies.length > 0
        ? Math.round(
            latencies.reduce((total, value) => total + value, 0) /
              latencies.length,
          )
        : undefined,
    events: [...events],
    failed,
    lastEvent: events.at(-1),
    passed,
    status:
      events.length === 0
        ? "empty"
        : failed > 0
          ? "fail"
          : stopped.length === 0
            ? "warn"
            : "pass",
    thresholdMs,
    total: stopped.length,
  };
};

export const createVoiceBargeInMonitor = (
  options: VoiceBargeInMonitorOptions = {},
): VoiceBargeInMonitor => {
  const listeners = new Set<() => void>();
  const thresholdMs = options.thresholdMs ?? DEFAULT_THRESHOLD_MS;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const events: VoiceBargeInMonitorEvent[] = [];
  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const postEvent = (event: VoiceBargeInMonitorEvent) => {
    if (!options.path || typeof fetchImpl !== "function") {
      return;
    }
    void fetchImpl(options.path, {
      body: JSON.stringify(event),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    }).catch(() => {});
  };
  const record = (
    status: VoiceBargeInMonitorEvent["status"],
    input: {
      latencyMs?: number;
      playbackStopLatencyMs?: number;
      reason: VoiceBargeInTriggerReason;
      sessionId?: string | null;
    },
  ) => {
    const event: VoiceBargeInMonitorEvent = {
      at: Date.now(),
      id: createEventId(),
      latencyMs: input.latencyMs,
      playbackStopLatencyMs: input.playbackStopLatencyMs,
      reason: input.reason,
      sessionId: input.sessionId,
      status,
      thresholdMs,
    };
    events.push(event);
    postEvent(event);
    emit();
    return event;
  };

  return {
    getSnapshot: () => summarize(events, thresholdMs),
    recordRequested: (input) => record("requested", input),
    recordSkipped: (input) => record("skipped", input),
    recordStopped: (input) => record("stopped", input),
    subscribe: (subscriber) => {
      listeners.add(subscriber);
      return () => {
        listeners.delete(subscriber);
      };
    },
  };
};
