import type { VoiceTestFixture } from "./fixtures";

export type VoiceAudioCondition =
  | { id: string; type: "gain"; gain: number }
  | { id: string; type: "clip"; ceiling: number }
  | { id: string; type: "drop-chunks"; every: number; chunkDurationMs: number }
  | { id: string; type: "noise"; seed: number; snrDb: number };

const clamp = (value: number) => Math.max(-32_768, Math.min(32_767, Math.round(value)));
const samples = (audio: Uint8Array) =>
  new Int16Array(audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength));
const bytes = (audio: Int16Array) => new Uint8Array(audio.buffer);

export const applyVoiceAudioCondition = (
  fixture: VoiceTestFixture,
  condition: VoiceAudioCondition,
): VoiceTestFixture => {
  const input = samples(fixture.audio);
  const output = new Int16Array(input);
  if (condition.type === "gain") {
    for (let index = 0; index < output.length; index += 1)
      output[index] = clamp(output[index]! * condition.gain);
  } else if (condition.type === "clip") {
    const ceiling = Math.round(32_767 * condition.ceiling);
    for (let index = 0; index < output.length; index += 1)
      output[index] = Math.max(-ceiling, Math.min(ceiling, output[index]!));
  } else if (condition.type === "drop-chunks") {
    const chunkSamples = Math.max(1, Math.round(fixture.format.sampleRateHz * condition.chunkDurationMs / 1_000));
    for (let start = chunkSamples * (condition.every - 1); start < output.length; start += chunkSamples * condition.every)
      output.fill(0, start, Math.min(output.length, start + chunkSamples));
  } else {
    let state = condition.seed >>> 0;
    const random = () => ((state = (state * 1_664_525 + 1_013_904_223) >>> 0) / 0x1_0000_0000) * 2 - 1;
    const signalPower = output.reduce((sum, value) => sum + value * value, 0) / Math.max(1, output.length);
    const noiseRms = Math.sqrt(signalPower / 10 ** (condition.snrDb / 10));
    for (let index = 0; index < output.length; index += 1)
      output[index] = clamp(output[index]! + random() * Math.sqrt(3) * noiseRms);
  }
  return { ...fixture, audio: bytes(output), id: `${fixture.id}--${condition.id}`, tags: [...(fixture.tags ?? []), "conditioned", condition.id] };
};

export const buildVoiceAudioMatrix = (
  fixtures: VoiceTestFixture[],
  conditions: VoiceAudioCondition[],
) => fixtures.flatMap((fixture) => conditions.map((condition) => applyVoiceAudioCondition(fixture, condition)));
