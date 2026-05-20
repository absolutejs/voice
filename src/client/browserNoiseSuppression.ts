export type BrowserNoiseSuppressorOptions = {
  /** Existing AudioContext to reuse. If omitted, a fresh one is created at 48kHz. */
  audioContext?: AudioContext;
  /** Optional message sent to the worklet via port.postMessage on init. */
  initialPort?: Record<string, unknown>;
  /** AudioWorkletNode options forwarded to the constructor. */
  nodeOptions?: AudioWorkletNodeOptions;
  /** Registered AudioWorkletProcessor name to instantiate. */
  processorName: string;
  /** Caller-supplied input stream from getUserMedia or similar. */
  stream: MediaStream;
  /** URL of the AudioWorklet script that registers `processorName`. */
  workletUrl: string;
};

export type BrowserNoiseSuppressorHandle = {
  /** The worklet node — operators can postMessage to tune at runtime. */
  node: AudioWorkletNode;
  /** A MediaStream containing the denoised audio track. */
  stream: MediaStream;
  /** Tears down the worklet + closes the AudioContext when this helper created it. */
  stop: () => Promise<void>;
};

const isBrowser = () =>
  typeof window !== "undefined" && typeof window.AudioContext !== "undefined";

export const applyBrowserNoiseSuppression = async (
  options: BrowserNoiseSuppressorOptions,
): Promise<BrowserNoiseSuppressorHandle> => {
  if (!isBrowser()) {
    throw new Error(
      "applyBrowserNoiseSuppression requires a browser environment with AudioContext",
    );
  }
  const ownsContext = !options.audioContext;
  const audioContext =
    options.audioContext ?? new AudioContext({ sampleRate: 48_000 });
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      // resume() can reject when called outside a user gesture; surface failure later
    }
  }
  await audioContext.audioWorklet.addModule(options.workletUrl);
  const source = audioContext.createMediaStreamSource(options.stream);
  const node = new AudioWorkletNode(
    audioContext,
    options.processorName,
    options.nodeOptions,
  );
  if (options.initialPort) {
    node.port.postMessage(options.initialPort);
  }
  const destination = audioContext.createMediaStreamDestination();
  source.connect(node);
  node.connect(destination);
  return {
    node,
    stop: async () => {
      try {
        node.disconnect();
      } catch {}
      try {
        source.disconnect();
      } catch {}
      try {
        destination.disconnect();
      } catch {}
      if (ownsContext) {
        await audioContext.close();
      }
    },
    stream: destination.stream,
  };
};

export type BrowserNoiseSuppressorPreset = {
  initialPort?: Record<string, unknown>;
  /** Display label for UI affordances. */
  label: string;
  nodeOptions?: AudioWorkletNodeOptions;
  processorName: string;
  workletUrl: string;
};

/**
 * Convenience presets pointing at well-known open-source worklets. Operators
 * still install the underlying npm package and copy the worklet file to a
 * URL their site can serve.
 */
export const BROWSER_NOISE_SUPPRESSOR_PRESETS = {
  /** DeepFilterNet 2023 model — best quality open-source pick. */
  deepfilternet: (workletUrl: string): BrowserNoiseSuppressorPreset => ({
    label: "DeepFilterNet",
    processorName: "deepfilter-suppressor",
    workletUrl,
  }),
  /** Jitsi @jitsi/rnnoise-wasm — ships a `rnnoise-processor` worklet. */
  rnnoise: (workletUrl: string): BrowserNoiseSuppressorPreset => ({
    label: "RNNoise",
    processorName: "rnnoise-processor",
    workletUrl,
  }),
} as const;
