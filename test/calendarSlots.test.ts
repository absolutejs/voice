import { describe, expect, test } from "bun:test";
import {
  generateVoiceCalendarSlots,
  summarizeVoiceCalendarSlot,
} from "../src/calendarSlots";

const utc = (iso: string) => new Date(`${iso}Z`).getTime();

describe("generateVoiceCalendarSlots", () => {
  test("generates slots inside business hours only", () => {
    const slots = generateVoiceCalendarSlots({
      businessHours: [
        { end: "12:00", start: "09:00", weekday: 1 },
      ],
      durationMinutes: 30,
      fromMs: utc("2026-05-18T00:00:00"),
      timezone: "UTC",
      toMs: utc("2026-05-19T00:00:00"),
    });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const date = new Date(slot.startMs);
      expect(date.getUTCHours()).toBeGreaterThanOrEqual(9);
      expect(date.getUTCHours()).toBeLessThan(12);
    }
  });

  test("skips blackout dates", () => {
    const slots = generateVoiceCalendarSlots({
      blackoutDates: [{ date: "2026-05-18" }],
      businessHours: [{ end: "17:00", start: "09:00", weekday: 1 }],
      durationMinutes: 30,
      fromMs: utc("2026-05-18T00:00:00"),
      timezone: "UTC",
      toMs: utc("2026-05-19T00:00:00"),
    });
    expect(slots).toHaveLength(0);
  });

  test("avoids booked ranges with buffer", () => {
    const slots = generateVoiceCalendarSlots({
      bookedRanges: [
        {
          endMs: utc("2026-05-18T11:00:00"),
          startMs: utc("2026-05-18T10:00:00"),
        },
      ],
      bufferMinutes: 15,
      businessHours: [{ end: "17:00", start: "09:00", weekday: 1 }],
      durationMinutes: 30,
      fromMs: utc("2026-05-18T00:00:00"),
      timezone: "UTC",
      toMs: utc("2026-05-19T00:00:00"),
    });
    for (const slot of slots) {
      expect(
        slot.startMs >= utc("2026-05-18T11:15:00") ||
          slot.endMs <= utc("2026-05-18T09:45:00"),
      ).toBe(true);
    }
  });

  test("respects maxSlots cap", () => {
    const slots = generateVoiceCalendarSlots({
      businessHours: [{ end: "17:00", start: "09:00", weekday: 1 }],
      durationMinutes: 30,
      fromMs: utc("2026-05-18T00:00:00"),
      maxSlots: 3,
      timezone: "UTC",
      toMs: utc("2026-05-19T00:00:00"),
    });
    expect(slots).toHaveLength(3);
  });

  test("granularity controls step size", () => {
    const slots = generateVoiceCalendarSlots({
      businessHours: [{ end: "11:00", start: "09:00", weekday: 1 }],
      durationMinutes: 60,
      fromMs: utc("2026-05-18T00:00:00"),
      granularityMinutes: 60,
      maxSlots: 5,
      timezone: "UTC",
      toMs: utc("2026-05-19T00:00:00"),
    });
    expect(slots).toHaveLength(2);
    expect(slots[0]?.startMs).toBe(utc("2026-05-18T09:00:00"));
    expect(slots[1]?.startMs).toBe(utc("2026-05-18T10:00:00"));
  });

  test("returns empty when window is invalid", () => {
    const slots = generateVoiceCalendarSlots({
      businessHours: [{ end: "17:00", start: "09:00", weekday: 1 }],
      durationMinutes: 30,
      fromMs: utc("2026-05-19T00:00:00"),
      toMs: utc("2026-05-18T00:00:00"),
    });
    expect(slots).toEqual([]);
  });
});

describe("summarizeVoiceCalendarSlot", () => {
  test("formats slot as natural language", () => {
    const text = summarizeVoiceCalendarSlot(
      {
        durationMinutes: 30,
        endMs: utc("2026-05-18T15:30:00"),
        startMs: utc("2026-05-18T15:00:00"),
      },
      { timezone: "UTC" },
    );
    expect(text).toContain("Monday");
    expect(text).toContain("May");
  });
});
