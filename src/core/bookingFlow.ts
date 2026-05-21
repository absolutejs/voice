import type {
  VoiceCalendarAdapter,
  VoiceCalendarAppointment,
} from "./calendarAdapter";
import type { VoiceCalendarSlot } from "./calendarSlots";

export type VoiceBookingFlowStep =
  | "ask-service"
  | "ask-date"
  | "ask-time"
  | "confirm"
  | "booking"
  | "booked"
  | "failed";

export type VoiceBookingFlowState = {
  step: VoiceBookingFlowStep;
  serviceId?: string;
  serviceDurationMinutes?: number;
  attendees?: string[];
  proposedSlots: VoiceCalendarSlot[];
  selectedSlot?: VoiceCalendarSlot;
  appointment?: VoiceCalendarAppointment;
  error?: string;
};

export type VoiceBookingFlowServiceCatalog = {
  id: string;
  label: string;
  durationMinutes: number;
}[];

export type CreateVoiceBookingFlowOptions = {
  adapter: VoiceCalendarAdapter;
  calendarId: string;
  services?: VoiceBookingFlowServiceCatalog;
  defaultDurationMinutes?: number;
  initialStep?: VoiceBookingFlowStep;
  maxSlotsPerDay?: number;
};

export const createVoiceBookingFlow = (
  options: CreateVoiceBookingFlowOptions,
) => {
  const initial: VoiceBookingFlowState = {
    proposedSlots: [],
    step:
      options.initialStep ?? (options.services ? "ask-service" : "ask-date"),
  };
  let state = initial;
  const listeners = new Set<(state: VoiceBookingFlowState) => void>();
  const setState = (next: Partial<VoiceBookingFlowState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener(state);
  };

  const chooseService = (serviceId: string) => {
    const services = options.services ?? [];
    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      setState({ error: `Unknown service: ${serviceId}`, step: "failed" });

      return;
    }
    setState({
      serviceDurationMinutes: service.durationMinutes,
      serviceId: service.id,
      step: "ask-date",
    });
  };

  const proposeSlotsForDay = async (input: {
    fromMs: number;
    toMs: number;
  }) => {
    const duration =
      state.serviceDurationMinutes ?? options.defaultDurationMinutes ?? 30;
    const slots = await options.adapter.listAvailability({
      calendarId: options.calendarId,
      durationMinutes: duration,
      fromMs: input.fromMs,
      ...(options.maxSlotsPerDay !== undefined
        ? { maxSlots: options.maxSlotsPerDay }
        : {}),
      toMs: input.toMs,
    });
    setState({
      proposedSlots: slots,
      step: slots.length > 0 ? "ask-time" : "ask-date",
    });

    return slots;
  };

  const chooseSlot = (slotIndex: number) => {
    const slot = state.proposedSlots[slotIndex];
    if (!slot) {
      setState({ error: "Invalid slot selection", step: "failed" });

      return;
    }
    setState({ selectedSlot: slot, step: "confirm" });
  };

  const confirm = async (
    input: { attendees?: string[]; title?: string; notes?: string } = {},
  ): Promise<VoiceCalendarAppointment | null> => {
    if (state.step !== "confirm" || !state.selectedSlot) {
      setState({ error: "Nothing to confirm", step: "failed" });

      return null;
    }
    setState({ step: "booking" });
    try {
      const appt = await options.adapter.book({
        calendarId: options.calendarId,
        endMs: state.selectedSlot.endMs,
        startMs: state.selectedSlot.startMs,
        ...(input.attendees !== undefined
          ? { attendees: input.attendees }
          : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      });
      setState({ appointment: appt, step: "booked" });

      return appt;
    } catch (error) {
      setState({
        error: error instanceof Error ? error.message : String(error),
        step: "failed",
      });

      return null;
    }
  };

  const reset = () => {
    state = {
      proposedSlots: [],
      step:
        options.initialStep ?? (options.services ? "ask-service" : "ask-date"),
    };
    for (const listener of listeners) listener(state);
  };

  return {
    chooseService,
    chooseSlot,
    confirm,
    proposeSlotsForDay,
    reset,
    getState: () => state,
    subscribe(listener: (state: VoiceBookingFlowState) => void) {
      listeners.add(listener);
      listener(state);

      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type VoiceBookingFlow = ReturnType<typeof createVoiceBookingFlow>;
