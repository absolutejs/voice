export type VoiceSupervisorRole = "viewer" | "coach" | "whisperer" | "owner";

export type VoiceSupervisorWatcher = {
  supervisorId: string;
  sessionId: string;
  joinedAt: number;
  lastSeenAt: number;
  role: VoiceSupervisorRole;
  displayName?: string;
};

export type VoiceSupervisorPresenceEvent =
  | { type: "join"; watcher: VoiceSupervisorWatcher }
  | { type: "leave"; supervisorId: string; sessionId: string; at: number }
  | {
      type: "role-change";
      supervisorId: string;
      sessionId: string;
      from: VoiceSupervisorRole;
      to: VoiceSupervisorRole;
      at: number;
    }
  | { type: "heartbeat"; supervisorId: string; sessionId: string; at: number };

export type CreateVoiceSupervisorPresenceOptions = {
  staleAfterMs?: number;
  now?: () => number;
};

export const createVoiceSupervisorPresence = (
  options: CreateVoiceSupervisorPresenceOptions = {},
) => {
  const now = options.now ?? (() => Date.now());
  const staleAfter = options.staleAfterMs ?? 30_000;
  const bySession = new Map<string, Map<string, VoiceSupervisorWatcher>>();
  const listeners = new Set<(event: VoiceSupervisorPresenceEvent) => void>();
  const emit = (event: VoiceSupervisorPresenceEvent) => {
    for (const listener of listeners) listener(event);
  };

  const ensureSession = (sessionId: string) => {
    let map = bySession.get(sessionId);
    if (!map) {
      map = new Map();
      bySession.set(sessionId, map);
    }

    return map;
  };

  const pruneStaleFromSession = (
    sessionId: string,
    sessionWatchers: Map<string, VoiceSupervisorWatcher>,
  ) => {
    const at = now();
    for (const [id, w] of sessionWatchers) {
      if (at - w.lastSeenAt > staleAfter) {
        sessionWatchers.delete(id);
        emit({ at, sessionId, supervisorId: id, type: "leave" });
      }
    }
  };

  const join = (input: {
    supervisorId: string;
    sessionId: string;
    role?: VoiceSupervisorRole;
    displayName?: string;
  }): VoiceSupervisorWatcher => {
    const sessionWatchers = ensureSession(input.sessionId);
    pruneStaleFromSession(input.sessionId, sessionWatchers);
    const at = now();
    const watcher: VoiceSupervisorWatcher = {
      joinedAt: at,
      lastSeenAt: at,
      role: input.role ?? "viewer",
      sessionId: input.sessionId,
      supervisorId: input.supervisorId,
      ...(input.displayName !== undefined
        ? { displayName: input.displayName }
        : {}),
    };
    sessionWatchers.set(input.supervisorId, watcher);
    emit({ type: "join", watcher });

    return watcher;
  };

  const leave = (sessionId: string, supervisorId: string): boolean => {
    const sessionWatchers = bySession.get(sessionId);
    if (!sessionWatchers?.delete(supervisorId)) return false;
    if (sessionWatchers.size === 0) bySession.delete(sessionId);
    emit({ at: now(), sessionId, supervisorId, type: "leave" });

    return true;
  };

  const heartbeat = (sessionId: string, supervisorId: string): boolean => {
    const watcher = bySession.get(sessionId)?.get(supervisorId);
    if (!watcher) return false;
    const at = now();
    watcher.lastSeenAt = at;
    emit({ at, sessionId, supervisorId, type: "heartbeat" });

    return true;
  };

  const setRole = (
    sessionId: string,
    supervisorId: string,
    role: VoiceSupervisorRole,
  ): boolean => {
    const watcher = bySession.get(sessionId)?.get(supervisorId);
    if (!watcher) return false;
    if (watcher.role === role) return true;
    const from = watcher.role;
    watcher.role = role;
    emit({
      at: now(),
      from,
      sessionId,
      supervisorId,
      to: role,
      type: "role-change",
    });

    return true;
  };

  const list = (sessionId: string): VoiceSupervisorWatcher[] => {
    const sessionWatchers = bySession.get(sessionId);
    if (!sessionWatchers) return [];
    pruneStaleFromSession(sessionId, sessionWatchers);

    return Array.from(sessionWatchers.values());
  };

  return {
    heartbeat,
    join,
    leave,
    list,
    setRole,
    sessionsWatchedBy(supervisorId: string): string[] {
      const out: string[] = [];
      for (const [sessionId, map] of bySession) {
        if (map.has(supervisorId)) out.push(sessionId);
      }

      return out;
    },
    subscribe(listener: (event: VoiceSupervisorPresenceEvent) => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type VoiceSupervisorPresence = ReturnType<
  typeof createVoiceSupervisorPresence
>;
