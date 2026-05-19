export type VoiceCallingDayKey =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

const DAY_INDEX: Record<VoiceCallingDayKey, number> = {
  friday: 5,
  monday: 1,
  saturday: 6,
  sunday: 0,
  thursday: 4,
  tuesday: 2,
  wednesday: 3,
};

const DAY_KEYS: VoiceCallingDayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export type VoiceCallingTimeRange = {
  start: string;
  end: string;
};

export type VoiceCallingWindowOptions = {
  timezone?: string;
  allowedDays?: VoiceCallingDayKey[];
  allowedHours?: VoiceCallingTimeRange | VoiceCallingTimeRange[];
  blockedDates?: string[];
  perDayHours?: Partial<Record<VoiceCallingDayKey, VoiceCallingTimeRange[]>>;
  now?: () => Date;
};

const parseTime = (value: string): { hour: number; minute: number } => {
  const match = /^([0-9]{1,2}):([0-9]{2})$/u.exec(value);
  if (!match) throw new Error(`Invalid time string (expected HH:MM): ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23) {
    throw new RangeError(`Hour out of range: ${value}`);
  }
  if (minute < 0 || minute > 59) {
    throw new RangeError(`Minute out of range: ${value}`);
  }
  return { hour, minute };
};

const minutesOf = (range: VoiceCallingTimeRange) => {
  const start = parseTime(range.start);
  const end = parseTime(range.end);
  return {
    end: end.hour * 60 + end.minute,
    start: start.hour * 60 + start.minute,
  };
};

const parts = (
  date: Date,
  timezone: string | undefined,
): { year: string; month: string; day: string; weekday: number; minutes: number } => {
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
  for (const part of formatter.formatToParts(date)) {
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
  const hourValue = map.hour === "24" ? "00" : map.hour ?? "0";
  return {
    day: map.day ?? "00",
    minutes: Number(hourValue) * 60 + Number(map.minute ?? "0"),
    month: map.month ?? "00",
    weekday: weekdayMap[map.weekday ?? ""] ?? 0,
    year: map.year ?? "0000",
  };
};

export type VoiceCallingWindowVerdict = {
  allowed: boolean;
  reason?: "outside-hours" | "blocked-date" | "outside-day";
  nextWindowAt?: number;
};

export const createVoiceCallingWindow = (
  options: VoiceCallingWindowOptions = {},
) => {
  const now = options.now ?? (() => new Date());
  const allowedDayIndexes = new Set(
    (options.allowedDays ?? [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ]).map((d) => DAY_INDEX[d]),
  );
  const blockedDates = new Set(options.blockedDates ?? []);

  const baseRanges: VoiceCallingTimeRange[] = !options.allowedHours
    ? [{ end: "21:00", start: "08:00" }]
    : Array.isArray(options.allowedHours)
      ? options.allowedHours
      : [options.allowedHours];
  const baseMinutes = baseRanges.map(minutesOf);
  const perDayMinutes = new Map<number, ReturnType<typeof minutesOf>[]>();
  for (const [key, ranges] of Object.entries(options.perDayHours ?? {})) {
    if (!ranges) continue;
    perDayMinutes.set(
      DAY_INDEX[key as VoiceCallingDayKey],
      ranges.map(minutesOf),
    );
  }

  const rangesFor = (weekday: number) =>
    perDayMinutes.get(weekday) ?? baseMinutes;

  const isAllowedAt = (date: Date): VoiceCallingWindowVerdict => {
    const p = parts(date, options.timezone);
    const isoDate = `${p.year}-${p.month}-${p.day}`;
    if (blockedDates.has(isoDate)) {
      return { allowed: false, reason: "blocked-date" };
    }
    if (!allowedDayIndexes.has(p.weekday)) {
      return { allowed: false, reason: "outside-day" };
    }
    const ranges = rangesFor(p.weekday);
    for (const range of ranges) {
      if (p.minutes >= range.start && p.minutes < range.end) {
        return { allowed: true };
      }
    }
    return { allowed: false, reason: "outside-hours" };
  };

  const findNextOpening = (from: Date): number => {
    const cursor = new Date(from.getTime());
    for (let step = 0; step < 14 * 24 * 60; step++) {
      const verdict = isAllowedAt(cursor);
      if (verdict.allowed) return cursor.getTime();
      cursor.setTime(cursor.getTime() + 60_000);
    }
    return cursor.getTime();
  };

  return {
    allowedDays: [...allowedDayIndexes].map(
      (idx) => DAY_KEYS[idx] as VoiceCallingDayKey,
    ),
    canCallNow(at?: Date): VoiceCallingWindowVerdict {
      const date = at ?? now();
      const verdict = isAllowedAt(date);
      if (verdict.allowed) return verdict;
      return { ...verdict, nextWindowAt: findNextOpening(date) };
    },
    nextWindowOpensAt(at?: Date): number {
      const date = at ?? now();
      const verdict = isAllowedAt(date);
      if (verdict.allowed) return date.getTime();
      return findNextOpening(date);
    },
    timezone: options.timezone,
  };
};

export type VoiceCallingWindow = ReturnType<typeof createVoiceCallingWindow>;

export const VOICE_TCPA_DEFAULT_WINDOW: VoiceCallingWindowOptions = {
  allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  allowedHours: { end: "21:00", start: "08:00" },
};
