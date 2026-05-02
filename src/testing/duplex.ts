import { bindVoiceBargeIn } from "../client/duplex";
import type { VoiceBargeInOptions } from "../types";

export type VoiceDuplexBenchmarkScenario = {
  expectedInterruptCount: number;
  id: string;
  initialPartial?: string;
  interruptDelayMs?: number;
  level?: number;
  mode: "audio-send" | "input-level" | "partial";
  partial?: string;
  title: string;
};

export type VoiceDuplexBenchmarkScenarioResult = {
  actualInterruptCount: number;
  elapsedMs: number;
  expectedInterruptCount: number;
  fixtureId: string;
  interruptLatencyMs?: number;
  mode: VoiceDuplexBenchmarkScenario["mode"];
  passes: boolean;
  title: string;
};

export type VoiceDuplexBenchmarkSummary = {
  averageElapsedMs: number;
  averageInterruptLatencyMs?: number;
  passCount: number;
  passRate: number;
  scenarioCount: number;
};

export type VoiceDuplexBenchmarkReport = {
  fixtures: VoiceDuplexBenchmarkScenarioResult[];
  generatedAt: number;
  summary: VoiceDuplexBenchmarkSummary;
};

export type VoiceDuplexBenchmarkOptions = {
  bargeIn?: VoiceBargeInOptions;
  defaultInterruptDelayMs?: number;
};

const DEFAULT_SCENARIOS: VoiceDuplexBenchmarkScenario[] = [
  {
    expectedInterruptCount: 1,
    id: "duplex-audio-send",
    mode: "audio-send",
    title: "Manual audio send interrupts playback",
  },
  {
    expectedInterruptCount: 1,
    id: "duplex-partial",
    mode: "partial",
    partial: "hello there",
    title: "Partial transcript interrupts playback",
  },
  {
    expectedInterruptCount: 1,
    id: "duplex-level",
    level: 0.2,
    mode: "input-level",
    title: "Input level interrupts playback",
  },
];

const createFakeController = (scenario: VoiceDuplexBenchmarkScenario) => {
  let partial = scenario.initialPartial ?? "";
  const subscribers = new Set<() => void>();
  const sentAudio: Array<Uint8Array | ArrayBuffer> = [];

  return {
    get partial() {
      return partial;
    },
    emitPartial(next: string) {
      partial = next;
      for (const subscriber of subscribers) {
        subscriber();
      }
    },
    getSentAudio() {
      return sentAudio;
    },
    sendAudio(audio: Uint8Array | ArrayBuffer) {
      sentAudio.push(audio);
    },
    subscribe(subscriber: () => void) {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
  };
};

const createFakePlayer = (delayMs: number) => {
  let interruptCount = 0;
  let isPlaying = true;
  let lastInterruptLatencyMs: number | undefined;

  return {
    get interruptCount() {
      return interruptCount;
    },
    get isPlaying() {
      return isPlaying;
    },
    get lastInterruptLatencyMs() {
      return lastInterruptLatencyMs;
    },
    async interrupt() {
      const startedAt = Date.now();
      await Bun.sleep(delayMs);
      interruptCount += 1;
      isPlaying = false;
      lastInterruptLatencyMs = Date.now() - startedAt;
    },
  };
};

export const getDefaultVoiceDuplexBenchmarkScenarios = () =>
  DEFAULT_SCENARIOS.map((scenario) => ({ ...scenario }));

export const runVoiceDuplexBenchmarkScenario = async (
  scenario: VoiceDuplexBenchmarkScenario,
  options: VoiceDuplexBenchmarkOptions = {},
): Promise<VoiceDuplexBenchmarkScenarioResult> => {
  const controller = createFakeController(scenario);
  const player = createFakePlayer(
    scenario.interruptDelayMs ?? options.defaultInterruptDelayMs ?? 1,
  );
  const binding = bindVoiceBargeIn(
    controller as never,
    player as never,
    options.bargeIn,
  );
  const startedAt = Date.now();

  try {
    switch (scenario.mode) {
      case "audio-send":
        binding.sendAudio(new Uint8Array([1, 2, 3]));
        break;
      case "input-level":
        binding.handleLevel(scenario.level ?? 0.2);
        break;
      case "partial":
        controller.emitPartial(scenario.partial ?? "hello");
        break;
    }

    await Bun.sleep(
      (scenario.interruptDelayMs ?? options.defaultInterruptDelayMs ?? 1) + 5,
    );
  } finally {
    binding.close();
  }

  return {
    actualInterruptCount: player.interruptCount,
    elapsedMs: Date.now() - startedAt,
    expectedInterruptCount: scenario.expectedInterruptCount,
    fixtureId: scenario.id,
    interruptLatencyMs: player.lastInterruptLatencyMs,
    mode: scenario.mode,
    passes: player.interruptCount === scenario.expectedInterruptCount,
    title: scenario.title,
  };
};

export const summarizeVoiceDuplexBenchmark = (
  fixtures: VoiceDuplexBenchmarkScenarioResult[],
): VoiceDuplexBenchmarkSummary => {
  const scenarioCount = fixtures.length;
  const interruptSamples = fixtures.filter(
    (fixture) => typeof fixture.interruptLatencyMs === "number",
  );
  const passCount = fixtures.filter((fixture) => fixture.passes).length;

  return {
    averageElapsedMs:
      scenarioCount > 0
        ? fixtures.reduce((sum, fixture) => sum + fixture.elapsedMs, 0) /
          scenarioCount
        : 0,
    averageInterruptLatencyMs:
      interruptSamples.length > 0
        ? interruptSamples.reduce(
            (sum, fixture) => sum + fixture.interruptLatencyMs!,
            0,
          ) / interruptSamples.length
        : undefined,
    passCount,
    passRate: scenarioCount > 0 ? passCount / scenarioCount : 0,
    scenarioCount,
  };
};

export const runVoiceDuplexBenchmark = async (
  scenarios = getDefaultVoiceDuplexBenchmarkScenarios(),
  options: VoiceDuplexBenchmarkOptions = {},
): Promise<VoiceDuplexBenchmarkReport> => {
  const fixtures: VoiceDuplexBenchmarkScenarioResult[] = [];

  for (const scenario of scenarios) {
    fixtures.push(await runVoiceDuplexBenchmarkScenario(scenario, options));
  }

  return {
    fixtures,
    generatedAt: Date.now(),
    summary: summarizeVoiceDuplexBenchmark(fixtures),
  };
};
