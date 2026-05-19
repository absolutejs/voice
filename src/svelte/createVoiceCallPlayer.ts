import {
  createVoiceCallPlayer as createCorePlayer,
  formatVoiceCallPlayerTimestamp,
  type VoiceCallPlayerOptions,
  type VoiceCallPlayerState,
} from "../client/callPlayer";

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export type CreateVoiceCallPlayerOptions = VoiceCallPlayerOptions & {
  title?: string;
};

export const renderVoiceCallPlayerHTML = (
  state: VoiceCallPlayerState,
  options: { title?: string; transcripts?: ReadonlyArray<{ id: string; text: string; startedAtMs?: number }> } = {},
): string => {
  const title = options.title ?? "Call replay";
  const transcripts = options.transcripts ?? [];
  const items = transcripts
    .map(
      (transcript) =>
        `<li data-transcript-id="${escapeHtml(transcript.id)}" style="background:${transcript.id === state.activeTranscriptId ? "rgba(59,130,246,0.18)" : "transparent"};border-radius:8px;cursor:pointer;font-size:13px;padding:8px 12px;">
          <div style="color:#cbd5e1;font-size:12px;">${formatVoiceCallPlayerTimestamp(transcript.startedAtMs ?? 0)}</div>
          <div>${escapeHtml(transcript.text)}</div>
        </li>`,
    )
    .join("");
  return `<section aria-label="voice-call-player" class="absolute-voice-call-player" style="background:#0f172a;border-radius:16px;color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif;padding:20px;">
  <header style="align-items:center;display:flex;gap:12px;margin-bottom:12px;">
    <strong style="font-size:16px;">${escapeHtml(title)}</strong>
    <span style="font-size:13px;margin-left:auto;opacity:0.7;">${formatVoiceCallPlayerTimestamp(state.currentTimeMs)} / ${formatVoiceCallPlayerTimestamp(state.durationMs)}</span>
  </header>
  <audio src="${state.audioUrl ? escapeHtml(state.audioUrl) : ""}" preload="metadata" data-call-player-audio style="display:none;"></audio>
  <div style="align-items:center;display:flex;gap:12px;margin-bottom:14px;">
    <button type="button" data-action="${state.isPlaying ? "pause" : "play"}" style="background:#3b82f6;border:none;border-radius:12px;color:#f8fafc;cursor:pointer;font-size:14px;font-weight:500;padding:8px 14px;">${state.isPlaying ? "Pause" : "Play"}</button>
    <input type="range" min="0" max="1" step="0.001" data-action="seek" value="${state.durationMs > 0 ? state.currentTimeMs / state.durationMs : 0}" style="flex:1;" />
  </div>
  <ol style="display:flex;flex-direction:column;gap:6px;list-style:none;margin:0;max-height:280px;overflow-y:auto;padding:0;">${items}</ol>
</section>`;
};

export const createVoiceCallPlayer = (
  options: CreateVoiceCallPlayerOptions = {},
) => {
  const player = createCorePlayer(options);
  return {
    ...player,
    getHTML: () =>
      renderVoiceCallPlayerHTML(player.getState(), {
        title: options.title,
        transcripts: player.transcripts().map((t) => ({
          id: t.id,
          startedAtMs: t.startedAtMs,
          text: t.text,
        })),
      }),
    title: options.title,
  };
};
