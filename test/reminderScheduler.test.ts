import { describe, expect, test } from "bun:test";
import {
  createVoiceReminderScheduler,
  DEFAULT_VOICE_REMINDER_TRIGGERS,
} from "../src/core/reminderScheduler";

describe("createVoiceReminderScheduler", () => {
  test("schedules jobs from default triggers", () => {
    const scheduler = createVoiceReminderScheduler({
      generateJobId: (() => {
        let i = 0;
        return () => `rem_${i++}`;
      })(),
      now: () => 0,
    });
    const jobs = scheduler.schedule({
      appointmentId: "appt_1",
      appointmentStartMs: 48 * 60 * 60 * 1000,
      triggers: DEFAULT_VOICE_REMINDER_TRIGGERS,
    });
    expect(jobs).toHaveLength(DEFAULT_VOICE_REMINDER_TRIGGERS.length);
    expect(jobs.every((j) => j.status === "pending")).toBe(true);
  });

  test("skips triggers that fall in the past", () => {
    const scheduler = createVoiceReminderScheduler({
      now: () => 0,
    });
    const jobs = scheduler.schedule({
      appointmentId: "appt_1",
      appointmentStartMs: 10 * 60_000,
      triggers: [
        { channel: "sms", id: "way-too-late", offsetMinutesBeforeStart: 1440 },
        { channel: "sms", id: "soon", offsetMinutesBeforeStart: 5 },
      ],
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.triggerId).toBe("soon");
  });

  test("due returns jobs whose time has come", () => {
    let t = 0;
    const scheduler = createVoiceReminderScheduler({ now: () => t });
    scheduler.schedule({
      appointmentId: "appt_1",
      appointmentStartMs: 60 * 60_000,
      triggers: [{ channel: "sms", id: "30m", offsetMinutesBeforeStart: 30 }],
    });
    expect(scheduler.due()).toHaveLength(0);
    t = 31 * 60_000;
    expect(scheduler.due()).toHaveLength(1);
  });

  test("markInFlight increments attempts", () => {
    const scheduler = createVoiceReminderScheduler({
      generateJobId: () => "rem_1",
      now: () => 0,
    });
    const jobs = scheduler.schedule({
      appointmentId: "appt_1",
      appointmentStartMs: 24 * 60 * 60_000,
      triggers: [{ channel: "call", id: "1h", offsetMinutesBeforeStart: 60 }],
    });
    scheduler.markInFlight(jobs[0]!.id);
    expect(scheduler.list()[0]?.attempts).toBe(1);
    expect(scheduler.list()[0]?.status).toBe("in-flight");
  });

  test("markFailed retries until maxAttempts then fails", () => {
    const scheduler = createVoiceReminderScheduler({
      generateJobId: () => "rem_1",
      maxAttempts: 2,
      now: () => 0,
    });
    const jobs = scheduler.schedule({
      appointmentId: "appt_1",
      appointmentStartMs: 24 * 60 * 60_000,
      triggers: [{ channel: "call", id: "1h", offsetMinutesBeforeStart: 60 }],
    });
    const id = jobs[0]!.id;
    scheduler.markInFlight(id);
    scheduler.markFailed(id, "timeout");
    expect(scheduler.list()[0]?.status).toBe("pending");
    scheduler.markInFlight(id);
    scheduler.markFailed(id, "timeout");
    expect(scheduler.list()[0]?.status).toBe("failed");
  });

  test("cancelForAppointment cancels pending jobs", () => {
    const scheduler = createVoiceReminderScheduler({ now: () => 0 });
    scheduler.schedule({
      appointmentId: "appt_1",
      appointmentStartMs: 24 * 60 * 60_000,
      triggers: DEFAULT_VOICE_REMINDER_TRIGGERS,
    });
    const cancelled = scheduler.cancelForAppointment("appt_1");
    expect(cancelled).toBeGreaterThan(0);
    expect(scheduler.list().every((j) => j.status === "cancelled")).toBe(true);
  });

  test("subscribe receives schedule + status updates", () => {
    const scheduler = createVoiceReminderScheduler({
      generateJobId: () => "rem_1",
      now: () => 0,
    });
    const statuses: string[] = [];
    scheduler.subscribe((j) => statuses.push(j.status));
    scheduler.schedule({
      appointmentId: "appt_1",
      appointmentStartMs: 24 * 60 * 60_000,
      triggers: [{ channel: "call", id: "1h", offsetMinutesBeforeStart: 60 }],
    });
    scheduler.markInFlight("rem_1");
    scheduler.markSent("rem_1");
    expect(statuses).toEqual(["pending", "in-flight", "sent"]);
  });
});
