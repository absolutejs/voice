// Opt-in turn-pipeline timing. Set `ABSOLUTEJS_VOICE_TIMING=1` to emit
// `[voice][timing]` lines that trace where each turn spends its wall-clock —
// every stage from turn-commit through history build, system-prompt resolution,
// each model round (fetch headers vs first token vs stream end), and tool calls.
// It's how you pin a slow turn (e.g. a cold first turn) to the EXACT stage
// instead of guessing. Zero overhead when the flag is unset (one env read).
//
// Read dynamically (not cached at module load) so the flag can be flipped via a
// restart without a rebuild, and so tests can toggle it per-case.

const timingEnabled = () =>
  process.env.ABSOLUTEJS_VOICE_TIMING === "1" ||
  process.env.ABSOLUTEJS_VOICE_TIMING === "true";

const emitTiming = (
  sessionId: string,
  stage: string,
  elapsedMs: number,
  detail?: Record<string, unknown>,
) => {
  if (!timingEnabled()) return;
  const extra = detail ? ` ${JSON.stringify(detail)}` : "";
  console.info(
    `[voice][timing] session=${sessionId} ${stage} +${Math.round(elapsedMs)}ms${extra}`,
  );
};

export const logVoiceTiming = (
  sessionId: string,
  stage: string,
  elapsedMs: number,
  detail?: Record<string, unknown>,
) => emitTiming(sessionId, stage, elapsedMs, detail);

/**
 * A per-turn stopwatch. `stamp(stage, detail?)` logs the elapsed since the timer
 * was created, so one timer per turn lays every stage out on a single timeline:
 *
 *   const stamp = startVoiceTimer(session.id);
 *   stamp("agent.system-resolved", { chars });
 *   stamp("agent.round0.generate-done", { ms });
 */
export const startVoiceTimer = (sessionId: string) => {
  const startedAt = Date.now();

  return (stage: string, detail?: Record<string, unknown>) =>
    emitTiming(sessionId, stage, Date.now() - startedAt, detail);
};

export const voiceTimingEnabled = () => timingEnabled();
