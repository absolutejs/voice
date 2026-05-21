import { describe, expect, test } from "bun:test";
import {
  scoreVoiceNoShowRisk,
  summarizeVoiceNoShowVerdict,
} from "../src/core/noShowPredictor";

const utc = (iso: string) => new Date(`${iso}Z`).getTime();

describe("scoreVoiceNoShowRisk", () => {
  test("baseline returns low risk", () => {
    const verdict = scoreVoiceNoShowRisk({
      appointmentStartMs: utc("2026-05-19T14:00:00"),
      bookedAtMs: utc("2026-05-19T08:00:00"),
    });
    expect(verdict.band).toBe("low");
  });

  test("prior no-shows push score up significantly", () => {
    const baseline = scoreVoiceNoShowRisk({
      appointmentStartMs: utc("2026-05-19T14:00:00"),
      bookedAtMs: utc("2026-05-19T08:00:00"),
    });
    const withHistory = scoreVoiceNoShowRisk({
      appointmentStartMs: utc("2026-05-19T14:00:00"),
      bookedAtMs: utc("2026-05-19T08:00:00"),
      history: [
        {
          appointmentId: "a",
          outcome: "no-show",
          scheduledStartMs: utc("2026-04-01T14:00:00"),
        },
        {
          appointmentId: "b",
          outcome: "no-show",
          scheduledStartMs: utc("2026-04-15T14:00:00"),
        },
        {
          appointmentId: "c",
          outcome: "no-show",
          scheduledStartMs: utc("2026-04-22T14:00:00"),
        },
      ],
    });
    expect(withHistory.score).toBeGreaterThan(baseline.score);
    expect(withHistory.band).toBe("high");
  });

  test("confirmed reminder reduces risk", () => {
    const withoutReminder = scoreVoiceNoShowRisk({
      appointmentStartMs: utc("2026-05-19T14:00:00"),
      bookedAtMs: utc("2026-05-15T14:00:00"),
    });
    const withReminder = scoreVoiceNoShowRisk({
      appointmentStartMs: utc("2026-05-19T14:00:00"),
      bookedAtMs: utc("2026-05-15T14:00:00"),
      reminderConfirmed: true,
    });
    expect(withReminder.score).toBeLessThan(withoutReminder.score);
  });

  test("weather disruption pushes score up", () => {
    const verdict = scoreVoiceNoShowRisk({
      appointmentStartMs: utc("2026-05-19T14:00:00"),
      bookedAtMs: utc("2026-05-19T08:00:00"),
      weatherDisruption: true,
    });
    expect(verdict.drivers.some((d) => d.kind === "weather-disruption")).toBe(
      true,
    );
  });

  test("score clamps to [0,1]", () => {
    const verdict = scoreVoiceNoShowRisk({
      appointmentStartMs: utc("2026-05-19T07:00:00"),
      bookedAtMs: utc("2026-05-15T08:00:00"),
      history: Array.from({ length: 10 }, (_, i) => ({
        appointmentId: `a${i}`,
        outcome: "no-show" as const,
        scheduledStartMs: utc("2026-04-01T14:00:00"),
      })),
      reminderConfirmed: false,
      weatherDisruption: true,
    });
    expect(verdict.score).toBeLessThanOrEqual(1);
    expect(verdict.score).toBeGreaterThanOrEqual(0);
  });

  test("history of kept appointments reduces baseline", () => {
    const verdict = scoreVoiceNoShowRisk({
      appointmentStartMs: utc("2026-05-19T14:00:00"),
      bookedAtMs: utc("2026-05-19T08:00:00"),
      history: [
        {
          appointmentId: "a",
          outcome: "kept",
          scheduledStartMs: utc("2026-04-01T14:00:00"),
        },
        {
          appointmentId: "b",
          outcome: "kept",
          scheduledStartMs: utc("2026-04-15T14:00:00"),
        },
        {
          appointmentId: "c",
          outcome: "kept",
          scheduledStartMs: utc("2026-05-01T14:00:00"),
        },
      ],
    });
    expect(verdict.score).toBeLessThan(0.15);
  });
});

describe("summarizeVoiceNoShowVerdict", () => {
  test("renders band + percent + top drivers", () => {
    const text = summarizeVoiceNoShowVerdict({
      band: "high",
      drivers: [
        { kind: "prior-no-show-count", value: 2 },
        { kind: "weather-disruption", value: true },
      ],
      score: 0.72,
    });
    expect(text).toContain("high risk");
    expect(text).toContain("72%");
    expect(text).toContain("prior-no-show-count");
  });
});
