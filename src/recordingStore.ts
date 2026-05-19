import type { AudioFormat } from "./types";

export type VoiceRecordingChannel = "assistant" | "user";

export type VoiceRecordingArtifact = {
  audioBytes: Uint8Array;
  capturedAt: number;
  channel: VoiceRecordingChannel;
  durationMs: number;
  format: AudioFormat;
  sessionId: string;
};

export type StoredVoiceRecordingArtifact = VoiceRecordingArtifact & {
  recordingUrl?: string;
};

export type VoiceRecordingStore = {
  get: (
    sessionId: string,
    channel: VoiceRecordingChannel,
  ) => Promise<StoredVoiceRecordingArtifact | undefined>;
  list: (sessionId: string) => Promise<StoredVoiceRecordingArtifact[]>;
  put: (
    artifact: VoiceRecordingArtifact,
  ) => Promise<StoredVoiceRecordingArtifact>;
};

const writeUint32LE = (view: DataView, offset: number, value: number) => {
  view.setUint32(offset, value, true);
};

const writeUint16LE = (view: DataView, offset: number, value: number) => {
  view.setUint16(offset, value, true);
};

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

export const encodePcmAsWav = (
  pcm: Uint8Array,
  format: AudioFormat,
): Uint8Array => {
  if (format.container !== "raw" || format.encoding !== "pcm_s16le") {
    throw new Error(
      `encodePcmAsWav only supports raw pcm_s16le input (got container=${format.container}, encoding=${format.encoding})`,
    );
  }
  const channels = format.channels;
  const sampleRate = format.sampleRateHz;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  writeUint32LE(view, 4, 36 + dataSize);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  writeUint32LE(view, 16, 16);
  writeUint16LE(view, 20, 1);
  writeUint16LE(view, 22, channels);
  writeUint32LE(view, 24, sampleRate);
  writeUint32LE(view, 28, byteRate);
  writeUint16LE(view, 32, blockAlign);
  writeUint16LE(view, 34, bitsPerSample);
  writeAscii(view, 36, "data");
  writeUint32LE(view, 40, dataSize);

  const output = new Uint8Array(buffer);
  output.set(pcm, 44);
  return output;
};

export const computePcmDurationMs = (
  pcmByteLength: number,
  format: AudioFormat,
): number => {
  if (format.container !== "raw" || format.encoding !== "pcm_s16le") {
    return 0;
  }
  const bytesPerSecond = format.sampleRateHz * format.channels * 2;
  if (bytesPerSecond === 0) {
    return 0;
  }
  return Math.round((pcmByteLength / bytesPerSecond) * 1000);
};

export const createVoiceMemoryRecordingStore = (): VoiceRecordingStore => {
  const records = new Map<string, StoredVoiceRecordingArtifact>();
  const key = (sessionId: string, channel: VoiceRecordingChannel) =>
    `${sessionId}::${channel}`;
  return {
    get: async (sessionId, channel) => records.get(key(sessionId, channel)),
    list: async (sessionId) =>
      Array.from(records.values()).filter(
        (record) => record.sessionId === sessionId,
      ),
    put: async (artifact) => {
      const stored: StoredVoiceRecordingArtifact = {
        ...artifact,
        recordingUrl: `memory://recording/${artifact.sessionId}/${artifact.channel}.wav`,
      };
      records.set(key(artifact.sessionId, artifact.channel), stored);
      return stored;
    },
  };
};
