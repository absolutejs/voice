export type VoiceBackchannelCue = {
  audioUrl?: string;
  metadata?: Record<string, unknown>;
  text?: string;
};

export type VoiceBackchannelDriverOptions = {
  cues?: ReadonlyArray<VoiceBackchannelCue>;
  cueIntervalMs?: number;
  cueIndex?: (index: number) => number;
  minSpeechMs?: number;
  onCue: (cue: VoiceBackchannelCue) => Promise<void> | void;
};

// Route-facing (serializable) backchannel config. The runtime turns this into a
// VoiceBackchannelDriver wired to the session's speech detection, playing short
// "mm-hm"/"right" cues on the output channel during a long caller turn so the
// caller feels heard. Plays via the same non-turn TTS path as fillers, so it
// never registers as the assistant's turn or trips barge-in. Off unless enabled.
export type VoiceBackchannelConfig = {
  enabled?: boolean;
  // Short phrases spoken as cues. Defaults to a natural set if omitted.
  cues?: ReadonlyArray<string>;
  // Min continuous caller-speech (ms) before the first cue fires. Default 2500.
  minSpeechMs?: number;
  // Min gap (ms) between cues so they don't pile up. Default 2500.
  cueIntervalMs?: number;
};

export type VoiceBackchannelDriver = {
  noteSpeech: (timestampMs?: number) => void;
  noteSilence: (timestampMs?: number) => void;
  reset: () => void;
};

const DEFAULT_CUES: VoiceBackchannelCue[] = [
  { text: "mm-hmm" },
  { text: "I see" },
  { text: "right" },
  { text: "go on" },
];

export const createVoiceBackchannelDriver = (
  options: VoiceBackchannelDriverOptions,
): VoiceBackchannelDriver => {
  const cues = options.cues ?? DEFAULT_CUES;
  const minSpeechMs = options.minSpeechMs ?? 2_500;
  const cueIntervalMs = options.cueIntervalMs ?? 2_500;
  const cueIndexFn =
    options.cueIndex ?? ((index: number) => index % Math.max(cues.length, 1));

  let speechStartedAt: number | undefined;
  let lastCueAt: number | undefined;
  let cueCount = 0;
  let firing = false;

  const tryFire = async (now: number) => {
    if (firing || cues.length === 0) {
      return;
    }
    if (speechStartedAt === undefined) {
      return;
    }
    const elapsed = now - speechStartedAt;
    if (elapsed < minSpeechMs) {
      return;
    }
    if (lastCueAt !== undefined && now - lastCueAt < cueIntervalMs) {
      return;
    }
    const cue = cues[cueIndexFn(cueCount)];
    if (!cue) {
      return;
    }
    firing = true;
    try {
      await options.onCue(cue);
    } finally {
      firing = false;
      lastCueAt = now;
      cueCount += 1;
    }
  };

  return {
    noteSilence: (timestampMs?: number) => {
      const now = timestampMs ?? Date.now();
      // If silence has held longer than cueIntervalMs, reset speech window
      if (lastCueAt !== undefined && now - lastCueAt > cueIntervalMs * 2) {
        speechStartedAt = undefined;
      }
    },
    noteSpeech: (timestampMs?: number) => {
      const now = timestampMs ?? Date.now();
      if (speechStartedAt === undefined) {
        speechStartedAt = now;
      }
      void tryFire(now);
    },
    reset: () => {
      speechStartedAt = undefined;
      lastCueAt = undefined;
      cueCount = 0;
    },
  };
};
