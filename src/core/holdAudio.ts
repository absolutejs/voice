export type VoiceHoldAudioCue = {
  audioUrl?: string;
  metadata?: Record<string, unknown>;
  text?: string;
};

export type VoiceHoldAudioDriverOptions = {
  /** Cooldown between hold cues so we don't spam the caller. Default 4_000ms. */
  cooldownMs?: number;
  /** Cues to play. Picked in order; cycles back to start. */
  cues?: ReadonlyArray<VoiceHoldAudioCue>;
  /** Operator callback invoked when a cue is selected. Wire to TTS or a pre-rendered clip. */
  onCue: (cue: VoiceHoldAudioCue) => Promise<void> | void;
  /** Minimum agent-thinking duration before the first cue fires. Default 1_500ms. */
  thinkingThresholdMs?: number;
};

export type VoiceHoldAudioDriver = {
  /** Note that the agent has started thinking (e.g. tool call dispatched). */
  noteThinking: (timestampMs?: number) => void;
  /** Note that the agent has produced output (e.g. assistant text / audio). */
  noteResponse: (timestampMs?: number) => void;
  reset: () => void;
};

const DEFAULT_CUES: VoiceHoldAudioCue[] = [
  { text: "Let me look that up for you." },
  { text: "One moment while I check on that." },
  { text: "Still looking into this." },
];

export const createVoiceHoldAudioDriver = (
  options: VoiceHoldAudioDriverOptions,
): VoiceHoldAudioDriver => {
  const cues = options.cues ?? DEFAULT_CUES;
  const cooldownMs = Math.max(0, options.cooldownMs ?? 4_000);
  const thinkingThresholdMs = Math.max(0, options.thinkingThresholdMs ?? 1_500);
  let thinkingSince: number | undefined;
  let lastCueAt: number | undefined;
  let cueIndex = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firing = false;

  const tryFire = async (now: number) => {
    if (firing || cues.length === 0) return;
    if (thinkingSince === undefined) return;
    if (now - thinkingSince < thinkingThresholdMs) return;
    if (lastCueAt !== undefined && now - lastCueAt < cooldownMs) return;
    const cue = cues[cueIndex % cues.length];
    if (!cue) return;
    firing = true;
    try {
      await options.onCue(cue);
    } finally {
      firing = false;
      lastCueAt = now;
      cueIndex += 1;
    }
  };

  const scheduleNext = (now: number) => {
    if (thinkingSince === undefined) return;
    if (timer) clearTimeout(timer);
    const elapsed = now - thinkingSince;
    const delay = Math.max(
      0,
      lastCueAt === undefined
        ? thinkingThresholdMs - elapsed
        : cooldownMs - (now - lastCueAt),
    );
    timer = setTimeout(() => {
      timer = undefined;
      const nextNow = Date.now();
      void tryFire(nextNow).then(() => {
        if (thinkingSince !== undefined) scheduleNext(Date.now());
      });
    }, delay);
  };

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  return {
    noteResponse: () => {
      clearTimer();
      thinkingSince = undefined;
    },
    noteThinking: (timestampMs) => {
      const now = timestampMs ?? Date.now();
      if (thinkingSince === undefined) {
        thinkingSince = now;
      }
      scheduleNext(now);
    },
    reset: () => {
      clearTimer();
      thinkingSince = undefined;
      lastCueAt = undefined;
      cueIndex = 0;
    },
  };
};
