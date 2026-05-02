import { expect, test } from "bun:test";
import {
  createVoiceAudioPlayer,
  decodeVoiceAudioChunk,
} from "../src/client/audioPlayer";
import type { VoiceAudioPlayerSource, VoiceStreamState } from "../src/types";

const createSource = () => {
  let assistantAudio: VoiceStreamState["assistantAudio"] = [];
  const subscribers = new Set<() => void>();

  const source: VoiceAudioPlayerSource = {
    get assistantAudio() {
      return assistantAudio;
    },
    subscribe: (subscriber) => {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
  };

  return {
    push: (chunk: VoiceStreamState["assistantAudio"][number]) => {
      assistantAudio = [...assistantAudio, chunk];
      for (const subscriber of subscribers) {
        subscriber();
      }
    },
    source,
  };
};

class FakeAudioBuffer {
  readonly duration: number;
  private readonly channels: Float32Array[];

  constructor(
    public readonly numberOfChannels: number,
    public readonly length: number,
    public readonly sampleRate: number,
  ) {
    this.channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    );
    this.duration = length / sampleRate;
  }

  getChannelData(channel: number) {
    return this.channels[channel]!;
  }
}

class FakeAudioBufferSourceNode {
  buffer: FakeAudioBuffer | null = null;
  onended: (() => void) | null = null;
  startTimes: number[] = [];
  stopDelayMs = 0;

  connect() {}
  disconnect() {}
  start(when = 0) {
    this.startTimes.push(when);
  }
  stop() {
    if (this.stopDelayMs > 0) {
      setTimeout(() => this.onended?.(), this.stopDelayMs);
      return;
    }

    this.onended?.();
  }
}

class FakeGainNode {
  gain = {
    value: 1,
    setValueAtTime: (value: number) => {
      this.gain.value = value;
    },
  };

  connect() {}
  disconnect() {}
}

class FakeAudioContext {
  baseLatency = 0.01;
  currentTime = 1;
  destination = {};
  outputLatency = 0.02;
  state: "closed" | "running" | "suspended" = "suspended";
  readonly buffers: FakeAudioBuffer[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly sources: FakeAudioBufferSourceNode[] = [];
  stopDelayMs = 0;

  createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
    const buffer = new FakeAudioBuffer(numberOfChannels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }

  createBufferSource() {
    const source = new FakeAudioBufferSourceNode();
    source.stopDelayMs = this.stopDelayMs;
    this.sources.push(source);
    return source;
  }

  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }

  async resume() {
    this.state = "running";
  }

  async suspend() {
    this.state = "suspended";
  }

  async close() {
    this.state = "closed";
  }
}

test("decodeVoiceAudioChunk converts pcm_s16le bytes into normalized channel data", () => {
  const context = new FakeAudioContext();
  const buffer = decodeVoiceAudioChunk(context as never, {
    chunk: new Uint8Array([0xff, 0x7f, 0x00, 0x80]),
    format: {
      channels: 1,
      container: "raw",
      encoding: "pcm_s16le",
      sampleRateHz: 16_000,
    },
  });

  expect(buffer.length).toBe(2);
  expect(Array.from(buffer.getChannelData(0))).toEqual([32_767 / 32_768, -1]);
});

test("createVoiceAudioPlayer queues existing and incoming assistant audio once started", async () => {
  const fixture = createSource();
  const context = new FakeAudioContext();
  const player = createVoiceAudioPlayer(fixture.source, {
    createAudioContext: () => context as never,
  });

  fixture.push({
    chunk: new Uint8Array([1, 0, 255, 255]),
    format: {
      channels: 1,
      container: "raw",
      encoding: "pcm_s16le",
      sampleRateHz: 16_000,
    },
    receivedAt: 1,
    turnId: "turn-1",
  });

  await player.start();

  expect(player.isActive).toBe(true);
  expect(player.isPlaying).toBe(true);
  expect(player.activeSourceCount).toBe(1);
  expect(player.processedChunkCount).toBe(1);
  expect(player.queuedChunkCount).toBe(1);
  expect(context.sources).toHaveLength(1);

  fixture.push({
    chunk: new Uint8Array([2, 0, 254, 255]),
    format: {
      channels: 1,
      container: "raw",
      encoding: "pcm_s16le",
      sampleRateHz: 16_000,
    },
    receivedAt: 2,
    turnId: "turn-1",
  });
  await Bun.sleep(0);

  expect(player.processedChunkCount).toBe(2);
  expect(player.queuedChunkCount).toBe(2);
  expect(context.sources).toHaveLength(2);

  fixture.push({
    chunk: new Uint8Array([2, 0, 254, 255]),
    format: {
      channels: 1,
      container: "raw",
      encoding: "pcm_s16le",
      sampleRateHz: 16_000,
    },
    receivedAt: 3,
    turnId: "turn-2",
  });
  await Bun.sleep(0);

  expect(context.sources[0]?.startTimes[0]).toBeGreaterThanOrEqual(1);
  expect(context.sources[1]?.startTimes[0]).toBeGreaterThanOrEqual(
    context.sources[0]?.startTimes[0] ?? 0,
  );
  expect(player.queuedChunkCount).toBe(3);
  expect(player.activeSourceCount).toBe(3);

  await player.pause();
  expect(player.isActive).toBe(false);
  expect(player.isPlaying).toBe(false);
  expect(player.activeSourceCount).toBe(3);

  await player.start();
  expect(player.isActive).toBe(true);

  await player.interrupt();
  expect(player.isActive).toBe(false);
  expect(player.isPlaying).toBe(false);
  expect(player.activeSourceCount).toBe(0);
  expect(player.lastInterruptLatencyMs).toBeDefined();
  expect(player.lastPlaybackStopLatencyMs).toBeDefined();
  expect(context.gains[0]?.gain.value).toBe(0);

  await player.close();
  expect(context.state).toBe("closed");
});

test("createVoiceAudioPlayer interrupt waits for source shutdown before reporting playback stop latency", async () => {
  const fixture = createSource();
  const context = new FakeAudioContext();
  context.stopDelayMs = 15;
  const player = createVoiceAudioPlayer(fixture.source, {
    createAudioContext: () => context as never,
  });

  fixture.push({
    chunk: new Uint8Array([1, 0, 255, 255]),
    format: {
      channels: 1,
      container: "raw",
      encoding: "pcm_s16le",
      sampleRateHz: 16_000,
    },
    receivedAt: 1,
    turnId: "turn-1",
  });

  await player.start();
  const interruptPromise = player.interrupt();
  await Bun.sleep(0);

  expect(player.isActive).toBe(false);
  expect(player.activeSourceCount).toBe(1);

  await interruptPromise;

  expect(player.activeSourceCount).toBe(0);
  expect(player.lastPlaybackStopLatencyMs).toBeGreaterThanOrEqual(10);
  expect(player.lastInterruptLatencyMs).toBeDefined();
  expect(player.lastInterruptLatencyMs).toBeGreaterThanOrEqual(10);
  expect(context.gains[0]?.gain.value).toBe(0);

  await player.close();
});
