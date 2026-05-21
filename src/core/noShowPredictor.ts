export type VoiceNoShowHistoricalRecord = {
  appointmentId: string;
  scheduledStartMs: number;
  outcome: "kept" | "no-show" | "cancelled" | "rescheduled";
};

export type VoiceNoShowSignal =
  | { kind: "lead-time-hours"; value: number }
  | { kind: "weekday"; value: number }
  | { kind: "hour-of-day"; value: number }
  | { kind: "prior-no-show-count"; value: number }
  | { kind: "prior-kept-count"; value: number }
  | { kind: "reminder-confirmed"; value: boolean }
  | { kind: "callback-distance-hours"; value: number }
  | { kind: "weather-disruption"; value: boolean };

export type VoiceNoShowScoreInput = {
  appointmentStartMs: number;
  bookedAtMs: number;
  history?: VoiceNoShowHistoricalRecord[];
  reminderConfirmed?: boolean;
  weatherDisruption?: boolean;
  callbackDistanceHours?: number;
  now?: () => number;
};

export type VoiceNoShowVerdict = {
  score: number;
  band: "low" | "moderate" | "high";
  drivers: VoiceNoShowSignal[];
};

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

export const scoreVoiceNoShowRisk = (
  input: VoiceNoShowScoreInput,
): VoiceNoShowVerdict => {
  const now = input.now ?? (() => Date.now());
  const leadHours = (input.appointmentStartMs - input.bookedAtMs) / 3_600_000;
  const startDate = new Date(input.appointmentStartMs);
  const weekday = startDate.getUTCDay();
  const hour = startDate.getUTCHours();
  const history = input.history ?? [];
  const past = history.filter(
    (r) => r.scheduledStartMs < input.appointmentStartMs,
  );
  const priorNoShows = past.filter((r) => r.outcome === "no-show").length;
  const priorKept = past.filter((r) => r.outcome === "kept").length;

  let score = 0.15;
  const drivers: VoiceNoShowSignal[] = [];

  if (leadHours > 72) {
    score += 0.1;
    drivers.push({ kind: "lead-time-hours", value: leadHours });
  } else if (leadHours < 12) {
    score -= 0.05;
    drivers.push({ kind: "lead-time-hours", value: leadHours });
  }

  if (weekday === 1) {
    score += 0.04;
    drivers.push({ kind: "weekday", value: weekday });
  }
  if (weekday === 5) {
    score += 0.03;
    drivers.push({ kind: "weekday", value: weekday });
  }

  if (hour < 9 || hour >= 17) {
    score += 0.04;
    drivers.push({ kind: "hour-of-day", value: hour });
  }

  if (priorNoShows > 0) {
    const delta = Math.min(0.5, priorNoShows * 0.2);
    score += delta;
    drivers.push({ kind: "prior-no-show-count", value: priorNoShows });
  }
  if (priorKept > 2 && priorNoShows === 0) {
    score -= 0.08;
    drivers.push({ kind: "prior-kept-count", value: priorKept });
  }

  if (input.reminderConfirmed === true) {
    score -= 0.15;
    drivers.push({ kind: "reminder-confirmed", value: true });
  } else if (input.reminderConfirmed === false) {
    score += 0.1;
    drivers.push({ kind: "reminder-confirmed", value: false });
  }

  if (
    input.callbackDistanceHours !== undefined &&
    input.callbackDistanceHours > 24
  ) {
    score += 0.06;
    drivers.push({
      kind: "callback-distance-hours",
      value: input.callbackDistanceHours,
    });
  }

  if (input.weatherDisruption) {
    score += 0.18;
    drivers.push({ kind: "weather-disruption", value: true });
  }

  const finalScore = clamp(score);
  const band: VoiceNoShowVerdict["band"] =
    finalScore >= 0.55 ? "high" : finalScore >= 0.3 ? "moderate" : "low";

  return { band, drivers, score: finalScore };
};

export const summarizeVoiceNoShowVerdict = (
  verdict: VoiceNoShowVerdict,
): string => {
  const pct = Math.round(verdict.score * 100);
  const top = verdict.drivers
    .slice(0, 2)
    .map((d) => d.kind)
    .join(", ");

  return `${verdict.band} risk (${pct}%)${top ? ` — driven by ${top}` : ""}`;
};
