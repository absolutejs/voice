export type VoiceReminderChannel = "call" | "sms" | "email";

export type VoiceReminderTrigger = {
  id: string;
  channel: VoiceReminderChannel;
  offsetMinutesBeforeStart: number;
  templateId?: string;
  retryOnFailure?: boolean;
};

export type VoiceReminderJob = {
  id: string;
  appointmentId: string;
  triggerId: string;
  channel: VoiceReminderChannel;
  scheduledAtMs: number;
  status: "pending" | "in-flight" | "sent" | "skipped" | "failed" | "cancelled";
  attempts: number;
  lastError?: string;
  metadata?: Record<string, string>;
};

export type ScheduleVoiceRemindersInput = {
  appointmentId: string;
  appointmentStartMs: number;
  triggers: VoiceReminderTrigger[];
  metadata?: Record<string, string>;
};

export type CreateVoiceReminderSchedulerOptions = {
  generateJobId?: () => string;
  now?: () => number;
  defaultTriggers?: VoiceReminderTrigger[];
  maxAttempts?: number;
};

export const DEFAULT_VOICE_REMINDER_TRIGGERS: VoiceReminderTrigger[] = [
  {
    channel: "sms",
    id: "remind-24h",
    offsetMinutesBeforeStart: 24 * 60,
  },
  {
    channel: "sms",
    id: "remind-2h",
    offsetMinutesBeforeStart: 120,
  },
  {
    channel: "call",
    id: "remind-call-30m",
    offsetMinutesBeforeStart: 30,
    retryOnFailure: true,
  },
];

export const createVoiceReminderScheduler = (
  options: CreateVoiceReminderSchedulerOptions = {},
) => {
  const now = options.now ?? (() => Date.now());
  const generateId =
    options.generateJobId ??
    (() => `rem_${Math.random().toString(36).slice(2, 10)}`);
  const defaultTriggers =
    options.defaultTriggers ?? DEFAULT_VOICE_REMINDER_TRIGGERS;
  const maxAttempts = options.maxAttempts ?? 2;
  const jobs = new Map<string, VoiceReminderJob>();
  const listeners = new Set<(job: VoiceReminderJob) => void>();

  const broadcast = (job: VoiceReminderJob) => {
    for (const listener of listeners) listener(job);
  };

  const schedule = (input: ScheduleVoiceRemindersInput): VoiceReminderJob[] => {
    const triggers =
      input.triggers.length > 0 ? input.triggers : defaultTriggers;
    const at = now();
    const created: VoiceReminderJob[] = [];
    for (const trigger of triggers) {
      const fireAt =
        input.appointmentStartMs - trigger.offsetMinutesBeforeStart * 60_000;
      if (fireAt <= at) continue;
      const job: VoiceReminderJob = {
        appointmentId: input.appointmentId,
        attempts: 0,
        channel: trigger.channel,
        id: generateId(),
        scheduledAtMs: fireAt,
        status: "pending",
        triggerId: trigger.id,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      };
      jobs.set(job.id, job);
      created.push(job);
      broadcast(job);
    }
    return created;
  };

  const due = (at: number = now()): VoiceReminderJob[] =>
    Array.from(jobs.values()).filter(
      (j) => j.status === "pending" && j.scheduledAtMs <= at,
    );

  const markInFlight = (jobId: string): boolean => {
    const job = jobs.get(jobId);
    if (!job || job.status !== "pending") return false;
    job.status = "in-flight";
    job.attempts += 1;
    broadcast(job);
    return true;
  };

  const markSent = (jobId: string): boolean => {
    const job = jobs.get(jobId);
    if (!job) return false;
    job.status = "sent";
    broadcast(job);
    return true;
  };

  const markFailed = (jobId: string, error: string): boolean => {
    const job = jobs.get(jobId);
    if (!job) return false;
    job.lastError = error;
    if (job.attempts < maxAttempts) {
      job.status = "pending";
      job.scheduledAtMs = now() + 5 * 60_000;
    } else {
      job.status = "failed";
    }
    broadcast(job);
    return true;
  };

  const cancelForAppointment = (appointmentId: string): number => {
    let count = 0;
    for (const job of jobs.values()) {
      if (
        job.appointmentId === appointmentId &&
        (job.status === "pending" || job.status === "in-flight")
      ) {
        job.status = "cancelled";
        broadcast(job);
        count += 1;
      }
    }
    return count;
  };

  return {
    cancelForAppointment,
    due,
    list: (appointmentId?: string) =>
      Array.from(jobs.values()).filter(
        (j) => !appointmentId || j.appointmentId === appointmentId,
      ),
    markFailed,
    markInFlight,
    markSent,
    schedule,
    subscribe(listener: (job: VoiceReminderJob) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type VoiceReminderScheduler = ReturnType<
  typeof createVoiceReminderScheduler
>;
