import type { Transcript } from "../types";

export type VoiceCallPlayerState = {
  activeTranscriptId?: string;
  activeTranscriptIndex?: number;
  audioUrl?: string;
  buffered: number;
  currentTimeMs: number;
  durationMs: number;
  error?: string;
  isPlaying: boolean;
  isReady: boolean;
  playbackRate: number;
};

export type VoiceCallPlayerOptions = {
  audioUrl?: string;
  initialPlaybackRate?: number;
  /** Recording start in epoch ms; used to convert transcript epoch timestamps to playback offsets. */
  recordingStartedAtEpochMs?: number;
  transcripts?: ReadonlyArray<Transcript>;
};

export type VoiceCallPlayer = {
  getState: () => VoiceCallPlayerState;
  pause: () => void;
  play: () => Promise<void>;
  reset: () => void;
  seekMs: (positionMs: number) => void;
  seekToTranscript: (transcriptId: string) => void;
  setAudioUrl: (url: string | undefined) => void;
  setBuffered: (seconds: number) => void;
  setDuration: (durationMs: number) => void;
  setError: (error: string | undefined) => void;
  setPlaybackRate: (rate: number) => void;
  setPlaying: (playing: boolean) => void;
  setReady: (ready: boolean) => void;
  setTime: (positionMs: number) => void;
  setTranscripts: (transcripts: ReadonlyArray<Transcript>) => void;
  subscribe: (listener: () => void) => () => void;
  transcripts: () => ReadonlyArray<Transcript>;
};

const cloneState = (state: VoiceCallPlayerState): VoiceCallPlayerState => ({
  ...state,
});

const normalizeTranscriptTimes = (
  transcripts: ReadonlyArray<Transcript>,
  baseEpoch: number | undefined,
) => {
  if (typeof baseEpoch !== "number") {
    return transcripts;
  }
  return transcripts.map((transcript) => {
    const adjusted: Transcript = { ...transcript };
    if (
      typeof adjusted.startedAtMs === "number" &&
      adjusted.startedAtMs >= baseEpoch
    ) {
      adjusted.startedAtMs = adjusted.startedAtMs - baseEpoch;
    }
    if (
      typeof adjusted.endedAtMs === "number" &&
      adjusted.endedAtMs >= baseEpoch
    ) {
      adjusted.endedAtMs = adjusted.endedAtMs - baseEpoch;
    }
    return adjusted;
  });
};

const findActiveTranscript = (
  transcripts: ReadonlyArray<Transcript>,
  positionMs: number,
): { id?: string; index?: number } => {
  let candidate: { id: string; index: number } | undefined;
  for (let index = 0; index < transcripts.length; index += 1) {
    const transcript = transcripts[index]!;
    if (typeof transcript.startedAtMs !== "number") continue;
    if (transcript.startedAtMs > positionMs) break;
    if (
      typeof transcript.endedAtMs === "number" &&
      transcript.endedAtMs < positionMs
    ) {
      continue;
    }
    candidate = { id: transcript.id, index };
  }
  return candidate ?? {};
};

export const createVoiceCallPlayer = (
  options: VoiceCallPlayerOptions = {},
): VoiceCallPlayer => {
  let transcripts = normalizeTranscriptTimes(
    options.transcripts ?? [],
    options.recordingStartedAtEpochMs,
  );
  let state: VoiceCallPlayerState = {
    audioUrl: options.audioUrl,
    buffered: 0,
    currentTimeMs: 0,
    durationMs: 0,
    isPlaying: false,
    isReady: false,
    playbackRate: options.initialPlaybackRate ?? 1,
  };
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const update = (next: Partial<VoiceCallPlayerState>) => {
    state = { ...state, ...next };
    notify();
  };

  const refreshActive = () => {
    const { id, index } = findActiveTranscript(transcripts, state.currentTimeMs);
    if (
      id !== state.activeTranscriptId ||
      index !== state.activeTranscriptIndex
    ) {
      state = {
        ...state,
        activeTranscriptId: id,
        activeTranscriptIndex: index,
      };
      notify();
    }
  };

  return {
    getState: () => cloneState(state),
    pause: () => {
      if (!state.isPlaying) return;
      update({ isPlaying: false });
    },
    play: async () => {
      update({ isPlaying: true });
    },
    reset: () => {
      state = {
        audioUrl: state.audioUrl,
        buffered: 0,
        currentTimeMs: 0,
        durationMs: 0,
        isPlaying: false,
        isReady: false,
        playbackRate: 1,
      };
      notify();
    },
    seekMs: (positionMs) => {
      const clamped = Math.max(
        0,
        Math.min(state.durationMs || Number.POSITIVE_INFINITY, positionMs),
      );
      update({ currentTimeMs: clamped });
      refreshActive();
    },
    seekToTranscript: (transcriptId) => {
      const found = transcripts.find((t) => t.id === transcriptId);
      if (
        !found ||
        typeof found.startedAtMs !== "number"
      ) {
        return;
      }
      update({ currentTimeMs: Math.max(0, found.startedAtMs) });
      refreshActive();
    },
    setAudioUrl: (url) => {
      update({ audioUrl: url, isReady: false });
    },
    setBuffered: (seconds) => {
      update({ buffered: Math.max(0, seconds) });
    },
    setDuration: (durationMs) => {
      update({ durationMs: Math.max(0, durationMs) });
    },
    setError: (error) => {
      update({ error });
    },
    setPlaybackRate: (rate) => {
      update({ playbackRate: Math.max(0.25, Math.min(4, rate)) });
    },
    setPlaying: (playing) => {
      if (playing === state.isPlaying) return;
      update({ isPlaying: playing });
    },
    setReady: (ready) => {
      update({ isReady: ready });
    },
    setTime: (positionMs) => {
      const next = Math.max(0, positionMs);
      if (next === state.currentTimeMs) return;
      update({ currentTimeMs: next });
      refreshActive();
    },
    setTranscripts: (next) => {
      transcripts = normalizeTranscriptTimes(
        next,
        options.recordingStartedAtEpochMs,
      );
      refreshActive();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    transcripts: () => transcripts,
  };
};

export const formatVoiceCallPlayerTimestamp = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
};
