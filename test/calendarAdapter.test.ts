import { describe, expect, test } from "bun:test";
import { createVoiceInMemoryCalendarAdapter } from "../src/core/calendarAdapter";

const utc = (iso: string) => new Date(`${iso}Z`).getTime();

describe("createVoiceInMemoryCalendarAdapter", () => {
  test("listAvailability returns slots inside business hours", async () => {
    const adapter = createVoiceInMemoryCalendarAdapter({
      businessHours: [{ end: "17:00", start: "09:00", weekday: 1 }],
      timezone: "UTC",
    });
    const slots = await adapter.listAvailability({
      calendarId: "cal_1",
      durationMinutes: 30,
      fromMs: utc("2026-05-18T00:00:00"),
      maxSlots: 4,
      toMs: utc("2026-05-19T00:00:00"),
    });
    expect(slots).toHaveLength(4);
  });

  test("book creates an appointment and excludes it from later availability", async () => {
    const adapter = createVoiceInMemoryCalendarAdapter({
      businessHours: [{ end: "17:00", start: "09:00", weekday: 1 }],
      timezone: "UTC",
    });
    const appt = await adapter.book({
      calendarId: "cal_1",
      endMs: utc("2026-05-18T10:00:00"),
      startMs: utc("2026-05-18T09:30:00"),
      title: "Cleaning",
    });
    expect(appt.status).toBe("scheduled");
    const slots = await adapter.listAvailability({
      calendarId: "cal_1",
      durationMinutes: 30,
      fromMs: utc("2026-05-18T09:00:00"),
      maxSlots: 1,
      toMs: utc("2026-05-18T10:30:00"),
    });
    expect(slots[0]?.startMs).toBe(utc("2026-05-18T09:00:00"));
  });

  test("book rejects on conflict", async () => {
    const adapter = createVoiceInMemoryCalendarAdapter({
      businessHours: [{ end: "17:00", start: "09:00", weekday: 1 }],
      timezone: "UTC",
    });
    await adapter.book({
      calendarId: "cal_1",
      endMs: utc("2026-05-18T10:00:00"),
      startMs: utc("2026-05-18T09:30:00"),
    });
    await expect(
      adapter.book({
        calendarId: "cal_1",
        endMs: utc("2026-05-18T10:30:00"),
        startMs: utc("2026-05-18T09:45:00"),
      }),
    ).rejects.toThrow(/already booked/);
  });

  test("cancel marks appointment cancelled and reopens slot", async () => {
    const adapter = createVoiceInMemoryCalendarAdapter({
      businessHours: [{ end: "17:00", start: "09:00", weekday: 1 }],
      timezone: "UTC",
    });
    const appt = await adapter.book({
      calendarId: "cal_1",
      endMs: utc("2026-05-18T10:00:00"),
      startMs: utc("2026-05-18T09:30:00"),
    });
    const cancelled = await adapter.cancel(appt.id);
    expect(cancelled?.status).toBe("cancelled");
    const slots = await adapter.listAvailability({
      calendarId: "cal_1",
      durationMinutes: 30,
      fromMs: utc("2026-05-18T09:30:00"),
      maxSlots: 1,
      toMs: utc("2026-05-18T10:00:00"),
    });
    expect(slots[0]?.startMs).toBe(utc("2026-05-18T09:30:00"));
  });

  test("reschedule moves the appointment", async () => {
    const adapter = createVoiceInMemoryCalendarAdapter({
      businessHours: [{ end: "17:00", start: "09:00", weekday: 1 }],
      timezone: "UTC",
    });
    const appt = await adapter.book({
      calendarId: "cal_1",
      endMs: utc("2026-05-18T10:00:00"),
      startMs: utc("2026-05-18T09:30:00"),
    });
    const moved = await adapter.reschedule(
      appt.id,
      utc("2026-05-18T11:00:00"),
      utc("2026-05-18T11:30:00"),
    );
    expect(moved?.startMs).toBe(utc("2026-05-18T11:00:00"));
  });

  test("get returns null for unknown ids", async () => {
    const adapter = createVoiceInMemoryCalendarAdapter({
      businessHours: [{ end: "17:00", start: "09:00", weekday: 1 }],
      timezone: "UTC",
    });
    expect(await adapter.get("nope")).toBeNull();
  });
});
