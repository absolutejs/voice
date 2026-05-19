export type VoiceCoachNudgeKind =
  | "hint"
  | "correction"
  | "warning"
  | "script-line"
  | "knowledge";

export type VoiceCoachNudge = {
  id: string;
  sessionId: string;
  supervisorId: string;
  kind: VoiceCoachNudgeKind;
  text: string;
  createdAt: number;
  injected: boolean;
  injectedAt?: number;
  acknowledged: boolean;
  acknowledgedAt?: number;
  expiresAt?: number;
};

export type VoiceCoachNudgeInjection = {
  role: "system" | "developer";
  content: string;
  metadata: {
    nudgeId: string;
    supervisorId: string;
    kind: VoiceCoachNudgeKind;
  };
};

export type CreateVoiceLiveCoachOptions = {
  sessionId: string;
  injectionRole?: "system" | "developer";
  templateForKind?: Partial<Record<VoiceCoachNudgeKind, string>>;
  defaultExpiryMs?: number;
  generateId?: () => string;
  now?: () => number;
};

const DEFAULT_TEMPLATES: Record<VoiceCoachNudgeKind, string> = {
  correction:
    "Supervisor correction (do not repeat this verbatim; weave it into your next response): {{text}}",
  hint: "Supervisor hint: {{text}}",
  knowledge: "Reference information from supervisor: {{text}}",
  "script-line":
    "Supervisor-approved phrasing to use next: {{text}}",
  warning: "Supervisor warning: {{text}}. Adjust your approach.",
};

export const createVoiceLiveCoach = (
  options: CreateVoiceLiveCoachOptions,
) => {
  const now = options.now ?? (() => Date.now());
  const generateId =
    options.generateId ?? (() => `nudge_${Math.random().toString(36).slice(2, 10)}`);
  const role = options.injectionRole ?? "system";
  const templates = { ...DEFAULT_TEMPLATES, ...(options.templateForKind ?? {}) };
  const nudges: VoiceCoachNudge[] = [];
  const listeners = new Set<(nudge: VoiceCoachNudge) => void>();

  const push = (
    input: Omit<
      VoiceCoachNudge,
      "id" | "createdAt" | "injected" | "acknowledged" | "sessionId"
    > & { id?: string },
  ): VoiceCoachNudge => {
    const nudge: VoiceCoachNudge = {
      acknowledged: false,
      createdAt: now(),
      id: input.id ?? generateId(),
      injected: false,
      kind: input.kind,
      sessionId: options.sessionId,
      supervisorId: input.supervisorId,
      text: input.text,
      ...(input.expiresAt !== undefined
        ? { expiresAt: input.expiresAt }
        : options.defaultExpiryMs !== undefined
          ? { expiresAt: now() + options.defaultExpiryMs }
          : {}),
    };
    nudges.push(nudge);
    for (const listener of listeners) listener(nudge);
    return nudge;
  };

  const pending = (): VoiceCoachNudge[] => {
    const at = now();
    return nudges.filter(
      (n) =>
        !n.injected &&
        !n.acknowledged &&
        (n.expiresAt === undefined || n.expiresAt > at),
    );
  };

  const consumeForInjection = (): VoiceCoachNudgeInjection[] => {
    const at = now();
    const ready = pending();
    const result: VoiceCoachNudgeInjection[] = [];
    for (const nudge of ready) {
      const template = templates[nudge.kind] ?? DEFAULT_TEMPLATES[nudge.kind];
      const content = template.replace(/\{\{text\}\}/gu, nudge.text);
      nudge.injected = true;
      nudge.injectedAt = at;
      result.push({
        content,
        metadata: {
          kind: nudge.kind,
          nudgeId: nudge.id,
          supervisorId: nudge.supervisorId,
        },
        role,
      });
    }
    return result;
  };

  const acknowledge = (id: string): boolean => {
    const nudge = nudges.find((n) => n.id === id);
    if (!nudge) return false;
    nudge.acknowledged = true;
    nudge.acknowledgedAt = now();
    return true;
  };

  return {
    acknowledge,
    consumeForInjection,
    history: () => nudges.slice(),
    pending,
    push,
    sessionId: options.sessionId,
    subscribe(listener: (nudge: VoiceCoachNudge) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type VoiceLiveCoach = ReturnType<typeof createVoiceLiveCoach>;
