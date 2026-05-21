import type {
  VoiceCalendarBookedRange,
  VoiceCalendarBusinessHours,
  VoiceCalendarSlot,
} from "./calendarSlots";

export type VoiceCalendarAppointment = {
  id: string;
  calendarId: string;
  startMs: number;
  endMs: number;
  title?: string;
  attendees?: string[];
  notes?: string;
  metadata?: Record<string, string>;
  createdAt: number;
  status: "scheduled" | "cancelled" | "completed" | "no-show";
};

export type VoiceCalendarAvailabilityQuery = {
  calendarId: string;
  fromMs: number;
  toMs: number;
  durationMinutes: number;
  bufferMinutes?: number;
  granularityMinutes?: number;
  maxSlots?: number;
};

export type VoiceCalendarBookInput = {
  calendarId: string;
  startMs: number;
  endMs: number;
  title?: string;
  attendees?: string[];
  notes?: string;
  metadata?: Record<string, string>;
};

export type VoiceCalendarAdapter = {
  readonly providerName: string;
  listAvailability(
    query: VoiceCalendarAvailabilityQuery,
  ): Promise<VoiceCalendarSlot[]>;
  book(input: VoiceCalendarBookInput): Promise<VoiceCalendarAppointment>;
  cancel(appointmentId: string): Promise<VoiceCalendarAppointment | null>;
  get(appointmentId: string): Promise<VoiceCalendarAppointment | null>;
  reschedule(
    appointmentId: string,
    nextStartMs: number,
    nextEndMs: number,
  ): Promise<VoiceCalendarAppointment | null>;
};

export type CreateVoiceInMemoryCalendarAdapterOptions = {
  businessHours: VoiceCalendarBusinessHours[];
  timezone?: string;
  bookedRanges?: VoiceCalendarBookedRange[];
  generateId?: () => string;
  now?: () => number;
};

export const createVoiceInMemoryCalendarAdapter = (
  options: CreateVoiceInMemoryCalendarAdapterOptions,
): VoiceCalendarAdapter => {
  const now = options.now ?? (() => Date.now());
  const generateId =
    options.generateId ??
    (() => `appt_${Math.random().toString(36).slice(2, 10)}`);
  const appointments = new Map<string, VoiceCalendarAppointment>();
  for (const range of options.bookedRanges ?? []) {
    const id = generateId();
    appointments.set(id, {
      calendarId: "default",
      createdAt: now(),
      endMs: range.endMs,
      id,
      startMs: range.startMs,
      status: "scheduled",
    });
  }
  const liveRanges = (): VoiceCalendarBookedRange[] =>
    Array.from(appointments.values())
      .filter((a) => a.status === "scheduled")
      .map((a) => ({ endMs: a.endMs, startMs: a.startMs }));

  return {
    providerName: "in-memory",
    async book(input) {
      const clash = liveRanges().some(
        (r) => input.startMs < r.endMs && r.startMs < input.endMs,
      );
      if (clash) throw new Error("Slot is already booked");
      const id = generateId();
      const appointment: VoiceCalendarAppointment = {
        calendarId: input.calendarId,
        createdAt: now(),
        endMs: input.endMs,
        id,
        startMs: input.startMs,
        status: "scheduled",
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.attendees !== undefined
          ? { attendees: input.attendees }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      };
      appointments.set(id, appointment);

      return appointment;
    },
    async cancel(id) {
      const existing = appointments.get(id);
      if (!existing) return null;
      const cancelled: VoiceCalendarAppointment = {
        ...existing,
        status: "cancelled",
      };
      appointments.set(id, cancelled);

      return cancelled;
    },
    async get(id) {
      return appointments.get(id) ?? null;
    },
    async listAvailability(query) {
      const { generateVoiceCalendarSlots } = await import("./calendarSlots");

      return generateVoiceCalendarSlots({
        bookedRanges: liveRanges(),
        ...(query.bufferMinutes !== undefined
          ? { bufferMinutes: query.bufferMinutes }
          : {}),
        businessHours: options.businessHours,
        durationMinutes: query.durationMinutes,
        fromMs: query.fromMs,
        ...(query.granularityMinutes !== undefined
          ? { granularityMinutes: query.granularityMinutes }
          : {}),
        ...(query.maxSlots !== undefined ? { maxSlots: query.maxSlots } : {}),
        ...(options.timezone !== undefined
          ? { timezone: options.timezone }
          : {}),
        toMs: query.toMs,
      });
    },
    async reschedule(id, nextStartMs, nextEndMs) {
      const existing = appointments.get(id);
      if (!existing) return null;
      const others = liveRanges().filter(
        (r) => r.startMs !== existing.startMs || r.endMs !== existing.endMs,
      );
      const clash = others.some(
        (r) => nextStartMs < r.endMs && r.startMs < nextEndMs,
      );
      if (clash) throw new Error("Cannot reschedule onto a booked slot");
      const updated: VoiceCalendarAppointment = {
        ...existing,
        endMs: nextEndMs,
        startMs: nextStartMs,
      };
      appointments.set(id, updated);

      return updated;
    },
  };
};
