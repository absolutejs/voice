export type VoiceCallDispositionTaxonomy =
  | "sales"
  | "support"
  | "collections"
  | "survey"
  | "custom";

export type VoiceCallDispositionDefinition = {
  code: string;
  label: string;
  outcome: "positive" | "neutral" | "negative" | "no-contact";
  retryable: boolean;
  taxonomy?: VoiceCallDispositionTaxonomy;
};

export const DEFAULT_VOICE_CALL_DISPOSITIONS: VoiceCallDispositionDefinition[] =
  [
    {
      code: "sale",
      label: "Sale closed",
      outcome: "positive",
      retryable: false,
      taxonomy: "sales",
    },
    {
      code: "qualified-lead",
      label: "Qualified lead",
      outcome: "positive",
      retryable: false,
      taxonomy: "sales",
    },
    {
      code: "callback-requested",
      label: "Callback requested",
      outcome: "neutral",
      retryable: true,
      taxonomy: "sales",
    },
    {
      code: "not-interested",
      label: "Not interested",
      outcome: "negative",
      retryable: false,
      taxonomy: "sales",
    },
    {
      code: "do-not-call",
      label: "Do not call",
      outcome: "negative",
      retryable: false,
      taxonomy: "sales",
    },
    {
      code: "voicemail-left",
      label: "Voicemail left",
      outcome: "no-contact",
      retryable: true,
      taxonomy: "sales",
    },
    {
      code: "no-answer",
      label: "No answer",
      outcome: "no-contact",
      retryable: true,
      taxonomy: "sales",
    },
    {
      code: "busy",
      label: "Line busy",
      outcome: "no-contact",
      retryable: true,
      taxonomy: "sales",
    },
    {
      code: "wrong-number",
      label: "Wrong number",
      outcome: "negative",
      retryable: false,
      taxonomy: "sales",
    },
    {
      code: "resolved",
      label: "Issue resolved",
      outcome: "positive",
      retryable: false,
      taxonomy: "support",
    },
    {
      code: "escalated",
      label: "Escalated to human",
      outcome: "neutral",
      retryable: false,
      taxonomy: "support",
    },
    {
      code: "payment-promised",
      label: "Payment promised",
      outcome: "positive",
      retryable: false,
      taxonomy: "collections",
    },
    {
      code: "dispute-raised",
      label: "Dispute raised",
      outcome: "negative",
      retryable: false,
      taxonomy: "collections",
    },
  ];

export type VoiceCallDispositionTag = {
  sessionId: string;
  code: string;
  taggedAt: number;
  note?: string;
};

export type CreateVoiceCallDispositionTaggerOptions = {
  taxonomy?: VoiceCallDispositionDefinition[];
  allowMultiple?: boolean;
  now?: () => number;
};

export const createVoiceCallDispositionTagger = (
  options: CreateVoiceCallDispositionTaggerOptions = {},
) => {
  const now = options.now ?? (() => Date.now());
  const definitions = options.taxonomy ?? DEFAULT_VOICE_CALL_DISPOSITIONS;
  const byCode = new Map(definitions.map((d) => [d.code, d]));
  const allowMultiple = options.allowMultiple ?? false;
  const tags = new Map<string, VoiceCallDispositionTag[]>();

  const tag = (
    sessionId: string,
    code: string,
    note?: string,
  ): VoiceCallDispositionTag => {
    if (!byCode.has(code)) {
      throw new Error(`Unknown disposition code: ${code}`);
    }
    const entry: VoiceCallDispositionTag = {
      code,
      sessionId,
      taggedAt: now(),
      ...(note !== undefined ? { note } : {}),
    };
    const existing = tags.get(sessionId) ?? [];
    if (!allowMultiple) {
      tags.set(sessionId, [entry]);
    } else {
      tags.set(sessionId, [...existing, entry]);
    }

    return entry;
  };

  const untag = (sessionId: string, code?: string): number => {
    const existing = tags.get(sessionId);
    if (!existing) return 0;
    if (code === undefined) {
      tags.delete(sessionId);

      return existing.length;
    }
    const filtered = existing.filter((t) => t.code !== code);
    const removed = existing.length - filtered.length;
    if (filtered.length === 0) tags.delete(sessionId);
    else tags.set(sessionId, filtered);

    return removed;
  };

  const listForSession = (sessionId: string): VoiceCallDispositionTag[] =>
    tags.get(sessionId)?.slice() ?? [];

  const listAll = (): VoiceCallDispositionTag[] => {
    const flat: VoiceCallDispositionTag[] = [];
    for (const list of tags.values()) flat.push(...list);

    return flat;
  };

  const summarize = () => {
    const byCodeCount = new Map<string, number>();
    const byOutcomeCount: Record<
      VoiceCallDispositionDefinition["outcome"],
      number
    > = { negative: 0, neutral: 0, "no-contact": 0, positive: 0 };
    let retryableTagged = 0;
    let totalTagged = 0;
    for (const list of tags.values()) {
      for (const entry of list) {
        totalTagged += 1;
        byCodeCount.set(entry.code, (byCodeCount.get(entry.code) ?? 0) + 1);
        const def = byCode.get(entry.code);
        if (!def) continue;
        byOutcomeCount[def.outcome] += 1;
        if (def.retryable) retryableTagged += 1;
      }
    }

    return {
      byCode: Object.fromEntries(byCodeCount),
      byOutcome: byOutcomeCount,
      retryablePct: totalTagged === 0 ? 0 : retryableTagged / totalTagged,
      totalSessions: tags.size,
      totalTagged,
    };
  };

  return {
    definitions,
    listAll,
    listForSession,
    summarize,
    tag,
    untag,
    definitionFor: (code: string) => byCode.get(code) ?? null,
  };
};

export type VoiceCallDispositionTagger = ReturnType<
  typeof createVoiceCallDispositionTagger
>;
