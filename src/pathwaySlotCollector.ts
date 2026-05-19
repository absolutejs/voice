import type {
  VoicePathwaySlot,
  VoicePathwaySlotType,
} from "./pathway";
import type { VoicePathwaySlotValue } from "./pathwayRuntime";

export type VoicePathwaySlotParseResult =
  | {
      ok: true;
      value: VoicePathwaySlotValue;
      normalized: string;
    }
  | {
      ok: false;
      reason: "empty" | "type-mismatch" | "out-of-range" | "no-match";
      hint?: string;
    };

export type VoicePathwaySlotParser = (
  raw: string,
  slot: VoicePathwaySlot,
) => VoicePathwaySlotParseResult;

const numberWords: Record<string, number> = {
  eight: 8,
  five: 5,
  four: 4,
  nine: 9,
  one: 1,
  seven: 7,
  six: 6,
  ten: 10,
  three: 3,
  two: 2,
  zero: 0,
};

const parseString: VoicePathwaySlotParser = (raw, slot) => {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const min = slot.validation?.minLength ?? 1;
  const max = slot.validation?.maxLength ?? Number.MAX_SAFE_INTEGER;
  if (trimmed.length < min || trimmed.length > max) {
    return {
      hint: `Expected ${min}–${max} characters`,
      ok: false,
      reason: "out-of-range",
    };
  }
  if (slot.validation?.pattern) {
    try {
      if (!new RegExp(slot.validation.pattern, "u").test(trimmed)) {
        return { ok: false, reason: "no-match" };
      }
    } catch {
      return { ok: false, reason: "no-match" };
    }
  }
  return { normalized: trimmed, ok: true, value: trimmed };
};

const parseNumber: VoicePathwaySlotParser = (raw, slot) => {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return { ok: false, reason: "empty" };
  let value: number;
  if (numberWords[trimmed] !== undefined) {
    value = numberWords[trimmed] as number;
  } else {
    const cleaned = trimmed.replace(/[$,]/gu, "");
    value = Number(cleaned);
    if (Number.isNaN(value)) return { ok: false, reason: "type-mismatch" };
  }
  const min = slot.validation?.min ?? Number.NEGATIVE_INFINITY;
  const max = slot.validation?.max ?? Number.POSITIVE_INFINITY;
  if (value < min || value > max) {
    return { hint: `Expected ${min}–${max}`, ok: false, reason: "out-of-range" };
  }
  return { normalized: String(value), ok: true, value };
};

const parseBoolean: VoicePathwaySlotParser = (raw) => {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (["yes", "yeah", "yep", "correct", "true", "sure", "ok"].includes(trimmed)) {
    return { normalized: "true", ok: true, value: true };
  }
  if (["no", "nope", "nah", "false", "incorrect"].includes(trimmed)) {
    return { normalized: "false", ok: true, value: false };
  }
  return { ok: false, reason: "type-mismatch" };
};

const parseDate: VoicePathwaySlotParser = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return { ok: false, reason: "type-mismatch" };
  const iso = date.toISOString().slice(0, 10);
  return { normalized: iso, ok: true, value: iso };
};

const parseTime: VoicePathwaySlotParser = (raw) => {
  const trimmed = raw.trim();
  const match = /^([0-9]{1,2}):?([0-9]{2})?\s*(am|pm)?$/iu.exec(trimmed);
  if (!match) return { ok: false, reason: "type-mismatch" };
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return { ok: false, reason: "out-of-range" };
  const formatted = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { normalized: formatted, ok: true, value: formatted };
};

const parsePhone: VoicePathwaySlotParser = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const digits = trimmed.replace(/\D/gu, "");
  if (digits.length < 10 || digits.length > 15) {
    return { ok: false, reason: "type-mismatch" };
  }
  const normalized = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return { normalized, ok: true, value: normalized };
};

const parseEmail: VoicePathwaySlotParser = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const collapsed = trimmed.replace(/\s+at\s+/gu, "@").replace(/\s+dot\s+/gu, ".");
  const ok = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/iu.test(collapsed);
  if (!ok) return { ok: false, reason: "type-mismatch" };
  return { normalized: collapsed.toLowerCase(), ok: true, value: collapsed.toLowerCase() };
};

const parseCurrency: VoicePathwaySlotParser = (raw, slot) => {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return { ok: false, reason: "empty" };
  const cleaned = trimmed.replace(/[$,]/gu, "").replace(/\s*(dollars?|usd)$/u, "");
  const value = Number(cleaned);
  if (Number.isNaN(value)) return { ok: false, reason: "type-mismatch" };
  const min = slot.validation?.min ?? 0;
  const max = slot.validation?.max ?? Number.POSITIVE_INFINITY;
  if (value < min || value > max) {
    return { hint: `Expected ${min}–${max}`, ok: false, reason: "out-of-range" };
  }
  return { normalized: value.toFixed(2), ok: true, value };
};

const parseChoice: VoicePathwaySlotParser = (raw, slot) => {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return { ok: false, reason: "empty" };
  const match = (slot.choices ?? []).find(
    (choice) => choice.toLowerCase() === trimmed,
  );
  if (!match) return { ok: false, reason: "no-match" };
  return { normalized: match, ok: true, value: match };
};

export const DEFAULT_VOICE_PATHWAY_SLOT_PARSERS: Record<
  VoicePathwaySlotType,
  VoicePathwaySlotParser
> = {
  boolean: parseBoolean,
  choice: parseChoice,
  currency: parseCurrency,
  date: parseDate,
  email: parseEmail,
  number: parseNumber,
  phone: parsePhone,
  string: parseString,
  time: parseTime,
};

export type CreateVoicePathwaySlotCollectorOptions = {
  parsers?: Partial<
    Record<VoicePathwaySlotType, VoicePathwaySlotParser>
  >;
  maxAttemptsPerSlot?: number;
};

export type VoicePathwaySlotCollectorAttempt = {
  slotId: string;
  raw: string;
  result: VoicePathwaySlotParseResult;
  attempt: number;
};

export const createVoicePathwaySlotCollector = (
  options: CreateVoicePathwaySlotCollectorOptions = {},
) => {
  const parsers = {
    ...DEFAULT_VOICE_PATHWAY_SLOT_PARSERS,
    ...(options.parsers ?? {}),
  };
  const maxAttempts = options.maxAttemptsPerSlot ?? 3;
  const attemptCounts = new Map<string, number>();

  const interpret = (
    slot: VoicePathwaySlot,
    raw: string,
  ): VoicePathwaySlotCollectorAttempt => {
    const parser = parsers[slot.type];
    if (!parser) {
      return {
        attempt: (attemptCounts.get(slot.id) ?? 0) + 1,
        raw,
        result: {
          hint: `No parser for ${slot.type}`,
          ok: false,
          reason: "no-match",
        },
        slotId: slot.id,
      };
    }
    const next = (attemptCounts.get(slot.id) ?? 0) + 1;
    attemptCounts.set(slot.id, next);
    return {
      attempt: next,
      raw,
      result: parser(raw, slot),
      slotId: slot.id,
    };
  };

  const attemptsExceeded = (slotId: string) =>
    (attemptCounts.get(slotId) ?? 0) >= maxAttempts;

  return {
    attemptsExceeded,
    interpret,
    reset: (slotId?: string) => {
      if (slotId) attemptCounts.delete(slotId);
      else attemptCounts.clear();
    },
  };
};

export type VoicePathwaySlotCollector = ReturnType<
  typeof createVoicePathwaySlotCollector
>;
