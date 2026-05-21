export type VoiceWhisperFrame = {
  sessionId: string;
  supervisorId: string;
  pcm: ArrayBuffer | Uint8Array;
  sampleRate: number;
  timestamp: number;
};

export type VoiceWhisperRoute = "agent-only" | "agent-and-caller" | "drop";

export type VoiceWhisperEvent =
  | { type: "started"; supervisorId: string; at: number }
  | { type: "stopped"; supervisorId: string; at: number }
  | { type: "frame"; frame: VoiceWhisperFrame }
  | { type: "ducked"; supervisorId: string; level: number; at: number };

export type CreateVoiceWhisperChannelOptions = {
  sessionId: string;
  defaultRoute?: VoiceWhisperRoute;
  duckCallerToLevel?: number;
  maxConcurrentWhispers?: number;
  now?: () => number;
};

type ActiveWhisper = {
  supervisorId: string;
  route: VoiceWhisperRoute;
  startedAt: number;
};

export const createVoiceWhisperChannel = (
  options: CreateVoiceWhisperChannelOptions,
) => {
  const now = options.now ?? (() => Date.now());
  const defaultRoute = options.defaultRoute ?? "agent-only";
  const duckLevel = options.duckCallerToLevel ?? 0.25;
  const maxConcurrent = options.maxConcurrentWhispers ?? 1;
  const active = new Map<string, ActiveWhisper>();
  const listeners = new Set<(event: VoiceWhisperEvent) => void>();
  const broadcast = (event: VoiceWhisperEvent) => {
    for (const listener of listeners) listener(event);
  };

  const start = (
    supervisorId: string,
    route: VoiceWhisperRoute = defaultRoute,
  ) => {
    if (active.has(supervisorId)) return active.get(supervisorId);
    if (active.size >= maxConcurrent) {
      throw new Error(
        `Whisper channel already at max concurrent (${maxConcurrent})`,
      );
    }
    const entry: ActiveWhisper = {
      route,
      startedAt: now(),
      supervisorId,
    };
    active.set(supervisorId, entry);
    broadcast({ at: entry.startedAt, supervisorId, type: "started" });
    if (route === "agent-only") {
      broadcast({
        at: entry.startedAt,
        level: duckLevel,
        supervisorId,
        type: "ducked",
      });
    }

    return entry;
  };

  const stop = (supervisorId: string): boolean => {
    if (!active.has(supervisorId)) return false;
    active.delete(supervisorId);
    broadcast({ at: now(), supervisorId, type: "stopped" });

    return true;
  };

  const pushFrame = (frame: VoiceWhisperFrame): VoiceWhisperRoute => {
    const entry = active.get(frame.supervisorId);
    if (!entry) return "drop";
    if (entry.route === "drop") return "drop";
    broadcast({ frame, type: "frame" });

    return entry.route;
  };

  return {
    pushFrame,
    sessionId: options.sessionId,
    start,
    stop,
    activeSupervisors: () => Array.from(active.keys()),
    isWhispering: (supervisorId: string) => active.has(supervisorId),
    routeFor: (supervisorId: string): VoiceWhisperRoute | null =>
      active.get(supervisorId)?.route ?? null,
    setRoute(supervisorId: string, route: VoiceWhisperRoute) {
      const entry = active.get(supervisorId);
      if (!entry) return false;
      entry.route = route;

      return true;
    },
    subscribe(listener: (event: VoiceWhisperEvent) => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type VoiceWhisperChannel = ReturnType<typeof createVoiceWhisperChannel>;
