import { useEffect, useMemo, useRef, useState } from "react";
import {
  createVoiceCallPlayer,
  formatVoiceCallPlayerTimestamp,
  type VoiceCallPlayer as VoiceCallPlayerHandle,
  type VoiceCallPlayerOptions,
  type VoiceCallPlayerState,
} from "../client/callPlayer";
import type { Transcript } from "../core/types";

export type VoiceCallPlayerProps = VoiceCallPlayerOptions & {
  audioUrl?: string;
  className?: string;
  onError?: (error: string) => void;
  player?: VoiceCallPlayerHandle;
  title?: string;
  transcripts?: ReadonlyArray<Transcript>;
};

export const VoiceCallPlayer = ({
  audioUrl,
  className,
  onError,
  player: playerProp,
  recordingStartedAtEpochMs,
  title = "Call replay",
  transcripts,
}: VoiceCallPlayerProps) => {
  const player = useMemo(
    () =>
      playerProp ??
      createVoiceCallPlayer({
        audioUrl,
        recordingStartedAtEpochMs,
        transcripts,
      }),
    [playerProp, audioUrl, recordingStartedAtEpochMs, transcripts],
  );
  const [state, setState] = useState<VoiceCallPlayerState>(() =>
    player.getState(),
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const errorRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = player.subscribe(() => {
      setState(player.getState());
    });

    return () => {
      unsubscribe();
    };
  }, [player]);

  useEffect(() => {
    player.setAudioUrl(audioUrl);
  }, [audioUrl, player]);

  useEffect(() => {
    if (transcripts) {
      player.setTranscripts(transcripts);
    }
  }, [transcripts, player]);

  useEffect(() => {
    if (state.error && state.error !== errorRef.current) {
      errorRef.current = state.error;
      onError?.(state.error);
    }
  }, [state.error, onError]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (state.isPlaying && el.paused) {
      void el.play().catch((err: unknown) => {
        player.setError(err instanceof Error ? err.message : String(err));
        player.setPlaying(false);
      });
    } else if (!state.isPlaying && !el.paused) {
      el.pause();
    }
    if (Math.abs(el.currentTime * 1_000 - state.currentTimeMs) > 250) {
      el.currentTime = state.currentTimeMs / 1_000;
    }
    el.playbackRate = state.playbackRate;
  }, [state.isPlaying, state.currentTimeMs, state.playbackRate, player]);

  const onTimeUpdate = () => {
    const el = audioRef.current;
    if (!el) return;
    player.setTime(el.currentTime * 1_000);
  };
  const onLoadedMetadata = () => {
    const el = audioRef.current;
    if (!el) return;
    player.setDuration(el.duration * 1_000);
    player.setReady(true);
  };

  const handleSeek = (ratio: number) => {
    player.seekMs(state.durationMs * ratio);
  };

  return (
    <section
      aria-label="voice-call-player"
      className={className ?? "absolute-voice-call-player"}
      style={{
        background: "#0f172a",
        borderRadius: 16,
        color: "#f8fafc",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        padding: 20,
      }}
    >
      <header
        style={{
          alignItems: "center",
          display: "flex",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <strong style={{ fontSize: 16 }}>{title}</strong>
        <span style={{ fontSize: 13, marginLeft: "auto", opacity: 0.7 }}>
          {formatVoiceCallPlayerTimestamp(state.currentTimeMs)} /{" "}
          {formatVoiceCallPlayerTimestamp(state.durationMs)}
        </span>
      </header>
      <audio
        onEnded={() => player.setPlaying(false)}
        onError={() => player.setError("Audio playback error")}
        onLoadedMetadata={onLoadedMetadata}
        onPause={() => player.setPlaying(false)}
        onPlay={() => player.setPlaying(true)}
        onTimeUpdate={onTimeUpdate}
        preload="metadata"
        ref={audioRef}
        src={state.audioUrl}
        style={{ display: "none" }}
      />
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <button
          aria-label={state.isPlaying ? "Pause" : "Play"}
          onClick={() => {
            if (state.isPlaying) {
              player.pause();
            } else {
              void player.play();
            }
          }}
          style={{
            background: "#3b82f6",
            border: "none",
            borderRadius: 12,
            color: "#f8fafc",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            padding: "8px 14px",
          }}
          type="button"
        >
          {state.isPlaying ? "Pause" : "Play"}
        </button>
        <input
          aria-label="seek"
          max={1}
          min={0}
          onChange={(event) => handleSeek(Number(event.target.value))}
          step={0.001}
          style={{ flex: 1 }}
          type="range"
          value={
            state.durationMs > 0 ? state.currentTimeMs / state.durationMs : 0
          }
        />
        <select
          aria-label="playback rate"
          onChange={(event) =>
            player.setPlaybackRate(Number(event.target.value))
          }
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            color: "#f8fafc",
            fontSize: 13,
            padding: "4px 8px",
          }}
          value={state.playbackRate}
        >
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
            <option key={rate} value={rate}>
              {rate}×
            </option>
          ))}
        </select>
      </div>
      <ol
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          listStyle: "none",
          margin: 0,
          maxHeight: 280,
          overflowY: "auto",
          padding: 0,
        }}
      >
        {player.transcripts().map((transcript) => {
          const active = transcript.id === state.activeTranscriptId;
          const startedAt = transcript.startedAtMs ?? 0;

          return (
            <li
              key={transcript.id} onClick={() => player.seekToTranscript(transcript.id)} style={{
                background: active ? "rgba(59,130,246,0.18)" : "transparent",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                padding: "8px 12px",
              }}
            >
              <div style={{ color: "#cbd5e1", fontSize: 12 }}>
                {formatVoiceCallPlayerTimestamp(startedAt)}
              </div>
              <div>{transcript.text}</div>
            </li>
          );
        })}
      </ol>
      {state.error ? (
        <p style={{ color: "#ef4444", fontSize: 12, marginTop: 12 }}>
          {state.error}
        </p>
      ) : null}
    </section>
  );
};
