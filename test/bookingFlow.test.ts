import { describe, expect, test } from "bun:test";
import { createVoiceInMemoryCalendarAdapter } from "../src/core/calendarAdapter";
import { createVoiceBookingFlow } from "../src/core/bookingFlow";

const utc = (iso: string) => new Date(`${iso}Z`).getTime();

const adapter = () =>
  createVoiceInMemoryCalendarAdapter({
    businessHours: [{ end: "17:00", start: "09:00", weekday: 1 }],
    timezone: "UTC",
  });

describe("createVoiceBookingFlow", () => {
  test("happy path: service → date → time → confirm → booked", async () => {
    const flow = createVoiceBookingFlow({
      adapter: adapter(),
      calendarId: "cal_1",
      maxSlotsPerDay: 4,
      services: [{ durationMinutes: 30, id: "cleaning", label: "Cleaning" }],
    });
    expect(flow.getState().step).toBe("ask-service");
    flow.chooseService("cleaning");
    expect(flow.getState().step).toBe("ask-date");
    const slots = await flow.proposeSlotsForDay({
      fromMs: utc("2026-05-18T00:00:00"),
      toMs: utc("2026-05-19T00:00:00"),
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(flow.getState().step).toBe("ask-time");
    flow.chooseSlot(0);
    expect(flow.getState().step).toBe("confirm");
    const appt = await flow.confirm({ attendees: ["alex@example.com"] });
    expect(appt?.status).toBe("scheduled");
    expect(flow.getState().step).toBe("booked");
  });

  test("invalid service id moves to failed", () => {
    const flow = createVoiceBookingFlow({
      adapter: adapter(),
      calendarId: "cal_1",
      services: [{ durationMinutes: 30, id: "cleaning", label: "Cleaning" }],
    });
    flow.chooseService("not-real");
    expect(flow.getState().step).toBe("failed");
  });

  test("falls back to ask-date when proposed slots are empty", async () => {
    const flow = createVoiceBookingFlow({
      adapter: adapter(),
      calendarId: "cal_1",
      defaultDurationMinutes: 60,
    });
    await flow.proposeSlotsForDay({
      fromMs: utc("2026-05-16T00:00:00"),
      toMs: utc("2026-05-17T00:00:00"),
    });
    expect(flow.getState().step).toBe("ask-date");
  });

  test("invalid slot selection routes to failed", async () => {
    const flow = createVoiceBookingFlow({
      adapter: adapter(),
      calendarId: "cal_1",
      defaultDurationMinutes: 30,
    });
    await flow.proposeSlotsForDay({
      fromMs: utc("2026-05-18T00:00:00"),
      toMs: utc("2026-05-19T00:00:00"),
    });
    flow.chooseSlot(99);
    expect(flow.getState().step).toBe("failed");
  });

  test("reset restarts the flow", async () => {
    const flow = createVoiceBookingFlow({
      adapter: adapter(),
      calendarId: "cal_1",
      defaultDurationMinutes: 30,
    });
    await flow.proposeSlotsForDay({
      fromMs: utc("2026-05-18T00:00:00"),
      toMs: utc("2026-05-19T00:00:00"),
    });
    flow.chooseSlot(0);
    flow.reset();
    expect(flow.getState().step).toBe("ask-date");
    expect(flow.getState().selectedSlot).toBeUndefined();
  });

  test("subscribe receives initial state then updates", async () => {
    const flow = createVoiceBookingFlow({
      adapter: adapter(),
      calendarId: "cal_1",
      defaultDurationMinutes: 30,
    });
    const steps: string[] = [];
    flow.subscribe((s) => steps.push(s.step));
    await flow.proposeSlotsForDay({
      fromMs: utc("2026-05-18T00:00:00"),
      toMs: utc("2026-05-19T00:00:00"),
    });
    expect(steps[0]).toBe("ask-date");
    expect(steps.at(-1)).toBe("ask-time");
  });
});
