import { describe, expect, test } from "bun:test";
import { createVoiceCallingWindow } from "../src/core/callingWindow";

const utc = (iso: string) => new Date(`${iso}Z`);

describe("createVoiceCallingWindow", () => {
  test("allows weekday calls inside the configured hours (UTC)", () => {
    const window = createVoiceCallingWindow({
      allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      allowedHours: { end: "17:00", start: "09:00" },
      timezone: "UTC",
    });
    expect(window.canCallNow(utc("2026-05-18T14:30:00")).allowed).toBe(true);
  });

  test("blocks outside hours and returns next opening", () => {
    const window = createVoiceCallingWindow({
      allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      allowedHours: { end: "17:00", start: "09:00" },
      timezone: "UTC",
    });
    const verdict = window.canCallNow(utc("2026-05-18T20:00:00"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("outside-hours");
    expect(typeof verdict.nextWindowAt).toBe("number");
    const next = new Date(verdict.nextWindowAt as number);
    expect(next.toISOString()).toContain("2026-05-19T09:00");
  });

  test("blocks weekends when not included", () => {
    const window = createVoiceCallingWindow({
      allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      timezone: "UTC",
    });
    const verdict = window.canCallNow(utc("2026-05-16T12:00:00"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("outside-day");
  });

  test("honors blocked dates (holidays)", () => {
    const window = createVoiceCallingWindow({
      allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      blockedDates: ["2026-05-25"],
      timezone: "UTC",
    });
    const verdict = window.canCallNow(utc("2026-05-25T12:00:00"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("blocked-date");
  });

  test("supports per-day hours", () => {
    const window = createVoiceCallingWindow({
      allowedDays: ["friday", "saturday"],
      allowedHours: { end: "17:00", start: "09:00" },
      perDayHours: {
        saturday: [{ end: "22:00", start: "10:00" }],
      },
      timezone: "UTC",
    });
    expect(window.canCallNow(utc("2026-05-16T20:00:00")).allowed).toBe(true);
    expect(window.canCallNow(utc("2026-05-15T20:00:00")).allowed).toBe(false);
  });

  test("respects timezone vs UTC clock", () => {
    const window = createVoiceCallingWindow({
      allowedDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      allowedHours: { end: "17:00", start: "09:00" },
      timezone: "America/New_York",
    });
    expect(window.canCallNow(utc("2026-05-18T20:00:00")).allowed).toBe(true);
    expect(window.canCallNow(utc("2026-05-18T22:00:00")).allowed).toBe(false);
  });
});
