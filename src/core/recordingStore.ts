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

export type VoiceRecordingEncoderInput = {
  channel: VoiceRecordingChannel;
  format: AudioFormat;
  pcm: Uint8Array;
  sessionId: string;
};

export type VoiceRecordingEncoderResult = {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
};

export type VoiceRecordingEncoder = {
  encode: (
    input: VoiceRecordingEncoderInput,
  ) => Promise<VoiceRecordingEncoderResult> | VoiceRecordingEncoderResult;
  kind: string;
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
  const {channels} = format;
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

export type InterleavePcmInput = {
  /** Mono PCM bytes for the left channel. */
  left: Uint8Array;
  /** Mono PCM bytes for the right channel. */
  right: Uint8Array;
};

/**
 * Interleaves two mono pcm_s16le buffers into a single stereo pcm_s16le
 * buffer at the same sample rate. Output length is max(left, right) * 2.
 * The shorter buffer is right-padded with silence to align frame counts.
 */
export const interleaveStereoPcm = (input: InterleavePcmInput): Uint8Array => {
  const leftSamples = new Int16Array(
    input.left.buffer,
    input.left.byteOffset,
    Math.floor(input.left.byteLength / 2),
  );
  const rightSamples = new Int16Array(
    input.right.buffer,
    input.right.byteOffset,
    Math.floor(input.right.byteLength / 2),
  );
  const frameCount = Math.max(leftSamples.length, rightSamples.length);
  const output = new Int16Array(frameCount * 2);
  for (let frame = 0; frame < frameCount; frame += 1) {
    output[frame * 2] = leftSamples[frame] ?? 0;
    output[frame * 2 + 1] = rightSamples[frame] ?? 0;
  }

  return new Uint8Array(output.buffer);
};

export type EncodeStereoWavInput = {
  format: AudioFormat;
  left: Uint8Array;
  right: Uint8Array;
};

/**
 * Builds a stereo WAV file from two mono pcm_s16le channels. Convention:
 * left = user track, right = assistant track. Review tools can split them
 * back out with any DAW.
 */
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
export const createVoiceWavRecordingEncoder = (): VoiceRecordingEncoder => ({
  kind: "wav",
  encode: ({ format, pcm }) => ({
    bytes: encodePcmAsWav(pcm, format),
    contentType: "audio/wav",
    extension: "wav",
  }),
});
export const encodeStereoWav = ({
  format,
  left,
  right,
}: EncodeStereoWavInput): Uint8Array => {
  if (format.container !== "raw" || format.encoding !== "pcm_s16le") {
    throw new Error(
      "encodeStereoWav requires raw pcm_s16le format on each channel",
    );
  }
  if (format.channels !== 1) {
    throw new Error("encodeStereoWav expects mono input channels");
  }
  const interleaved = interleaveStereoPcm({ left, right });

  return encodePcmAsWav(interleaved, { ...format, channels: 2 });
};
