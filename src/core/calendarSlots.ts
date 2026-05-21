export type VoiceCalendarBusinessHours = {
  weekday: number;
  start: string;
  end: string;
};

export type VoiceCalendarBlackout = {
  date: string;
  reason?: string;
};

export type VoiceCalendarBookedRange = {
  startMs: number;
  endMs: number;
};

export type VoiceCalendarSlot = {
  startMs: number;
  endMs: number;
  durationMinutes: number;
};

export type GenerateVoiceCalendarSlotsInput = {
  fromMs: number;
  toMs: number;
  durationMinutes: number;
  bufferMinutes?: number;
  granularityMinutes?: number;
  timezone?: string;
  businessHours: VoiceCalendarBusinessHours[];
  blackoutDates?: VoiceCalendarBlackout[];
  bookedRanges?: VoiceCalendarBookedRange[];
  maxSlots?: number;
};

const parseHHMM = (value: string): number => {
  const match = /^([0-9]{1,2}):([0-9]{2})$/u.exec(value);
  if (!match) throw new Error(`Invalid time string (expected HH:MM): ${value}`);

  return Number(match[1]) * 60 + Number(match[2]);
};

const partsAt = (
  ms: number,
  timezone?: string,
): { date: string; weekday: number; minutes: number } => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(ms))) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const weekdayMap: Record<string, number> = {
    Fri: 5,
    Mon: 1,
    Sat: 6,
    Sun: 0,
    Thu: 4,
    Tue: 2,
    Wed: 3,
  };
  const hourValue = map.hour === "24" ? "00" : (map.hour ?? "0");

  return {
    date: `${map.year}-${map.month}-${map.day}`,
    minutes: Number(hourValue) * 60 + Number(map.minute ?? "0"),
    weekday: weekdayMap[map.weekday ?? ""] ?? 0,
  };
};

const overlaps = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean => aStart < bEnd && bStart < aEnd;

export const generateVoiceCalendarSlots = (
  input: GenerateVoiceCalendarSlotsInput,
): VoiceCalendarSlot[] => {
  if (input.durationMinutes <= 0) {
    throw new Error("durationMinutes must be positive");
  }
  if (input.toMs <= input.fromMs) return [];
  const granularity = input.granularityMinutes ?? 15;
  const buffer = input.bufferMinutes ?? 0;
  const max = input.maxSlots ?? Infinity;
  const hoursByDay = new Map<number, VoiceCalendarBusinessHours[]>();
  for (const block of input.businessHours) {
    const list = hoursByDay.get(block.weekday) ?? [];
    list.push(block);
    hoursByDay.set(block.weekday, list);
  }
  const blackoutDates = new Set((input.blackoutDates ?? []).map((b) => b.date));
  const slots: VoiceCalendarSlot[] = [];
  const stepMs = granularity * 60_000;
  const durationMs = input.durationMinutes * 60_000;
  const bufferMs = buffer * 60_000;
  let cursor = input.fromMs;
  while (cursor + durationMs <= input.toMs && slots.length < max) {
    const slotEnd = cursor + durationMs;
    const startParts = partsAt(cursor, input.timezone);
    if (blackoutDates.has(startParts.date)) {
      cursor += stepMs;
      continue;
    }
    const dayHours = hoursByDay.get(startParts.weekday);
    if (!dayHours || dayHours.length === 0) {
      cursor += stepMs;
      continue;
    }
    const endParts = partsAt(slotEnd - 1, input.timezone);
    const fitsHours = dayHours.some((block) => {
      const startMin = parseHHMM(block.start);
      const endMin = parseHHMM(block.end);

      return (
        startParts.minutes >= startMin &&
        endParts.minutes < endMin &&
        startParts.date === endParts.date
      );
    });
    if (!fitsHours) {
      cursor += stepMs;
      continue;
    }
    const collides = (input.bookedRanges ?? []).some((booked) =>
      overlaps(
        cursor - bufferMs,
        slotEnd + bufferMs,
        booked.startMs,
        booked.endMs,
      ),
    );
    if (!collides) {
      slots.push({
        durationMinutes: input.durationMinutes,
        endMs: slotEnd,
        startMs: cursor,
      });
    }
    cursor += stepMs;
  }

  return slots;
};

export const summarizeVoiceCalendarSlot = (
  slot: VoiceCalendarSlot,
  options: { timezone?: string; locale?: string } = {},
): string => {
  const formatter = new Intl.DateTimeFormat(options.locale ?? "en-US", {
    day: "numeric",
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    month: "long",
    timeZone: options.timezone,
    weekday: "long",
  });

  return formatter.format(new Date(slot.startMs));
};
