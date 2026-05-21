export type VoiceTranscriptAnnotationKind =
  | "great-recovery"
  | "missed-objection"
  | "compliance-concern"
  | "tone-issue"
  | "knowledge-gap"
  | "follow-up-needed"
  | "custom";

export type VoiceTranscriptAnnotation = {
  id: string;
  sessionId: string;
  supervisorId: string;
  kind: VoiceTranscriptAnnotationKind;
  customLabel?: string;
  text?: string;
  turnId?: string;
  rangeStartMs: number;
  rangeEndMs?: number;
  createdAt: number;
  severity: "info" | "minor" | "major";
};

export type CreateVoiceTranscriptAnnotatorOptions = {
  sessionId: string;
  generateId?: () => string;
  now?: () => number;
};

export const DEFAULT_VOICE_ANNOTATION_KIND_SEVERITY: Record<
  VoiceTranscriptAnnotationKind,
  VoiceTranscriptAnnotation["severity"]
> = {
  "compliance-concern": "major",
  custom: "info",
  "follow-up-needed": "minor",
  "great-recovery": "info",
  "knowledge-gap": "minor",
  "missed-objection": "minor",
  "tone-issue": "minor",
};

export const createVoiceTranscriptAnnotator = (
  options: CreateVoiceTranscriptAnnotatorOptions,
) => {
  const now = options.now ?? (() => Date.now());
  const generateId =
    options.generateId ??
    (() => `ann_${Math.random().toString(36).slice(2, 10)}`);
  const annotations: VoiceTranscriptAnnotation[] = [];

  const add = (
    input: Omit<
      VoiceTranscriptAnnotation,
      "id" | "createdAt" | "sessionId" | "severity"
    > & { severity?: VoiceTranscriptAnnotation["severity"]; id?: string },
  ): VoiceTranscriptAnnotation => {
    if (input.kind === "custom" && !input.customLabel) {
      throw new Error("customLabel is required for kind=custom");
    }
    const annotation: VoiceTranscriptAnnotation = {
      createdAt: now(),
      id: input.id ?? generateId(),
      kind: input.kind,
      rangeStartMs: input.rangeStartMs,
      sessionId: options.sessionId,
      severity:
        input.severity ?? DEFAULT_VOICE_ANNOTATION_KIND_SEVERITY[input.kind],
      supervisorId: input.supervisorId,
      ...(input.customLabel !== undefined
        ? { customLabel: input.customLabel }
        : {}),
      ...(input.rangeEndMs !== undefined
        ? { rangeEndMs: input.rangeEndMs }
        : {}),
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
    };
    annotations.push(annotation);

    return annotation;
  };

  const remove = (id: string): boolean => {
    const idx = annotations.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    annotations.splice(idx, 1);

    return true;
  };

  const list = (filter?: {
    kind?: VoiceTranscriptAnnotationKind;
    supervisorId?: string;
    severity?: VoiceTranscriptAnnotation["severity"];
    fromMs?: number;
    toMs?: number;
  }): VoiceTranscriptAnnotation[] =>
    annotations.filter((a) => {
      if (filter?.kind && a.kind !== filter.kind) return false;
      if (filter?.supervisorId && a.supervisorId !== filter.supervisorId) {
        return false;
      }
      if (filter?.severity && a.severity !== filter.severity) return false;
      if (filter?.fromMs !== undefined && a.rangeStartMs < filter.fromMs) {
        return false;
      }
      if (filter?.toMs !== undefined && a.rangeStartMs > filter.toMs) {
        return false;
      }

      return true;
    });

  const summarize = () => {
    const byKind: Partial<Record<VoiceTranscriptAnnotationKind, number>> = {};
    const bySeverity: Record<VoiceTranscriptAnnotation["severity"], number> = {
      info: 0,
      major: 0,
      minor: 0,
    };
    for (const a of annotations) {
      byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
      bySeverity[a.severity] += 1;
    }

    return { byKind, bySeverity, total: annotations.length };
  };

  return {
    add,
    list,
    remove,
    sessionId: options.sessionId,
    summarize,
  };
};

export type VoiceTranscriptAnnotator = ReturnType<
  typeof createVoiceTranscriptAnnotator
>;
