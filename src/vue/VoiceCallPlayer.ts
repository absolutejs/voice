import {
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
  type PropType,
} from "vue";
import {
  createVoiceCallPlayer,
  formatVoiceCallPlayerTimestamp,
  type VoiceCallPlayer as VoiceCallPlayerHandle,
  type VoiceCallPlayerState,
} from "../client/callPlayer";
import type { Transcript } from "../core/types";

export const VoiceCallPlayer = defineComponent({
  name: "VoiceCallPlayer",
  props: {
    audioUrl: String,
    player: {
      default: undefined,
      type: Object as PropType<VoiceCallPlayerHandle | undefined>,
    },
    recordingStartedAtEpochMs: Number,
    title: { default: "Call replay", type: String },
    transcripts: {
      default: () => [],
      type: Array as PropType<ReadonlyArray<Transcript>>,
    },
  },
  setup(props) {
    const player =
      props.player ??
      createVoiceCallPlayer({
        audioUrl: props.audioUrl,
        recordingStartedAtEpochMs: props.recordingStartedAtEpochMs,
        transcripts: props.transcripts,
      });
    const state = shallowRef<VoiceCallPlayerState>(player.getState());
    const audioRef = ref<HTMLAudioElement | null>(null);

    const unsubscribe = player.subscribe(() => {
      state.value = player.getState();
    });
    onUnmounted(() => {
      unsubscribe();
    });

    watch(
      () => props.audioUrl,
      (next) => {
        player.setAudioUrl(next);
      },
    );
    watch(
      () => props.transcripts,
      (next) => {
        if (next) player.setTranscripts(next);
      },
      { deep: false },
    );

    const syncAudio = () => {
      const el = audioRef.value;
      if (!el) return;
      if (state.value.isPlaying && el.paused) {
        void el.play().catch((err: unknown) => {
          player.setError(err instanceof Error ? err.message : String(err));
          player.setPlaying(false);
        });
      } else if (!state.value.isPlaying && !el.paused) {
        el.pause();
      }
      if (Math.abs(el.currentTime * 1_000 - state.value.currentTimeMs) > 250) {
        el.currentTime = state.value.currentTimeMs / 1_000;
      }
      el.playbackRate = state.value.playbackRate;
    };

    onMounted(syncAudio);
    watch(state, syncAudio, { deep: false });

    return () => {
      const s = state.value;
      return h(
        "section",
        {
          "aria-label": "voice-call-player",
          class: "absolute-voice-call-player",
          style: {
            background: "#0f172a",
            borderRadius: "16px",
            color: "#f8fafc",
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            padding: "20px",
          },
        },
        [
          h(
            "header",
            {
              style: {
                alignItems: "center",
                display: "flex",
                gap: "12px",
                marginBottom: "12px",
              },
            },
            [
              h("strong", { style: { fontSize: "16px" } }, props.title),
              h(
                "span",
                {
                  style: {
                    fontSize: "13px",
                    marginLeft: "auto",
                    opacity: "0.7",
                  },
                },
                `${formatVoiceCallPlayerTimestamp(s.currentTimeMs)} / ${formatVoiceCallPlayerTimestamp(s.durationMs)}`,
              ),
            ],
          ),
          h("audio", {
            onEnded: () => player.setPlaying(false),
            onError: () => player.setError("Audio playback error"),
            onLoadedmetadata: () => {
              const el = audioRef.value;
              if (!el) return;
              player.setDuration(el.duration * 1_000);
              player.setReady(true);
            },
            onPause: () => player.setPlaying(false),
            onPlay: () => player.setPlaying(true),
            onTimeupdate: () => {
              const el = audioRef.value;
              if (!el) return;
              player.setTime(el.currentTime * 1_000);
            },
            preload: "metadata",
            ref: audioRef,
            src: s.audioUrl,
            style: { display: "none" },
          }),
          h(
            "div",
            {
              style: {
                alignItems: "center",
                display: "flex",
                gap: "12px",
                marginBottom: "14px",
              },
            },
            [
              h(
                "button",
                {
                  "aria-label": s.isPlaying ? "Pause" : "Play",
                  onClick: () => {
                    if (s.isPlaying) {
                      player.pause();
                    } else {
                      void player.play();
                    }
                  },
                  style: {
                    background: "#3b82f6",
                    border: "none",
                    borderRadius: "12px",
                    color: "#f8fafc",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                    padding: "8px 14px",
                  },
                  type: "button",
                },
                s.isPlaying ? "Pause" : "Play",
              ),
              h("input", {
                "aria-label": "seek",
                max: 1,
                min: 0,
                onInput: (event: Event) => {
                  const target = event.target as HTMLInputElement;
                  player.seekMs(s.durationMs * Number(target.value));
                },
                step: 0.001,
                style: { flex: "1" },
                type: "range",
                value: s.durationMs > 0 ? s.currentTimeMs / s.durationMs : 0,
              }),
            ],
          ),
          h(
            "ol",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                listStyle: "none",
                margin: "0",
                maxHeight: "280px",
                overflowY: "auto",
                padding: "0",
              },
            },
            player.transcripts().map((transcript) =>
              h(
                "li",
                {
                  key: transcript.id,
                  onClick: () => player.seekToTranscript(transcript.id),
                  style: {
                    background:
                      transcript.id === s.activeTranscriptId
                        ? "rgba(59,130,246,0.18)"
                        : "transparent",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "13px",
                    padding: "8px 12px",
                  },
                },
                [
                  h(
                    "div",
                    { style: { color: "#cbd5e1", fontSize: "12px" } },
                    formatVoiceCallPlayerTimestamp(transcript.startedAtMs ?? 0),
                  ),
                  h("div", transcript.text),
                ],
              ),
            ),
          ),
        ],
      );
    };
  },
});
