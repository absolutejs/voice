import type { VoiceCaptureOptions } from "../types";

type MicrophoneCaptureOptions = {
  channelCount?: VoiceCaptureOptions["channelCount"];
  onLevel?: VoiceCaptureOptions["onLevel"];
  onAudio: (audio: Uint8Array) => void;
  sampleRateHz?: VoiceCaptureOptions["sampleRateHz"];
};

type MicrophoneCapture = {
  start: () => Promise<void>;
  stop: () => void;
};

type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const clampSample = (value: number) => Math.max(-1, Math.min(1, value));

const floatTo16BitPCM = (input: Float32Array) => {
  const output = new Int16Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    const sample = clampSample(input[index] ?? 0);
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return new Uint8Array(output.buffer);
};

const getPcmLevel = (audio: Uint8Array | ArrayBuffer) => {
  const bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);

  if (bytes.byteLength < 2) {
    return 0;
  }

  const samples = new Int16Array(
    bytes.buffer,
    bytes.byteOffset,
    Math.floor(bytes.byteLength / 2),
  );

  if (samples.length === 0) {
    return 0;
  }

  let sumSquares = 0;
  for (const sample of samples) {
    const normalized = sample / 0x8000;
    sumSquares += normalized * normalized;
  }

  return Math.min(1, Math.max(0, Math.sqrt(sumSquares / samples.length) * 5.5));
};

const downsampleBuffer = (
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
) => {
  if (sourceRate === targetRate) {
    return input;
  }

  const ratio = sourceRate / targetRate;
  const length = Math.round(input.length / ratio);
  const output = new Float32Array(length);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < output.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;

    for (
      let index = offsetBuffer;
      index < nextOffsetBuffer && index < input.length;
      index += 1
    ) {
      accum += input[index] ?? 0;
      count += 1;
    }

    output[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return output;
};

export const createMicrophoneCapture = (
  options: MicrophoneCaptureOptions,
): MicrophoneCapture => {
  let audioContext: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  let mediaStream: MediaStream | null = null;

  const start = async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error(
        "Browser microphone capture requires navigator.mediaDevices.getUserMedia.",
      );
    }

    const AudioContextCtor =
      (typeof window !== "undefined"
        ? ((window as WindowWithWebkitAudioContext).AudioContext ??
          (window as WindowWithWebkitAudioContext).webkitAudioContext)
        : undefined) ?? AudioContext;

    if (!AudioContextCtor) {
      throw new Error(
        "Browser microphone capture requires AudioContext support.",
      );
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: options.channelCount ?? 1,
      },
    });
    audioContext = new AudioContextCtor();
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);

    processorNode.onaudioprocess = (event) => {
      const channel = event.inputBuffer.getChannelData(0);
      const downsampled = downsampleBuffer(
        channel,
        audioContext?.sampleRate ?? 48_000,
        options.sampleRateHz ?? 16_000,
      );
      const pcm = floatTo16BitPCM(downsampled);
      options.onLevel?.(getPcmLevel(pcm));
      options.onAudio(pcm);
    };

    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);
  };

  const stop = () => {
    processorNode?.disconnect();
    sourceNode?.disconnect();
    mediaStream?.getTracks().forEach((track) => track.stop());
    void audioContext?.close();
    options.onLevel?.(0);

    audioContext = null;
    mediaStream = null;
    processorNode = null;
    sourceNode = null;
  };

  return { start, stop };
};
