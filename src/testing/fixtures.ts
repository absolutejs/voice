import { resolve } from "node:path";
import type { AudioFormat, VoiceExpectedSpeakerTurn } from "../types";

export type VoiceTestFixtureManifestEntry = {
  id: string;
  title: string;
  audioPath: string;
  expectedText: string;
  expectedTerms?: string[];
  expectedSpeakerTurns?: VoiceExpectedSpeakerTurn[];
  expectedTurnTexts?: string[];
  chunkDurationMs?: number;
  language?: string;
  difficulty?: "clean" | "noisy" | "challenging";
  tags?: string[];
  tailPaddingMs?: number;
  format?: Partial<AudioFormat>;
};

export type VoiceTestFixture = Omit<
  VoiceTestFixtureManifestEntry,
  "audioPath"
> & {
  audio: Uint8Array;
  audioPath: string;
  format: AudioFormat;
};

export type VoiceTelephonyFixtureOptions = {
  includeAccents?: boolean;
  targetSampleRateHz?: number;
};

export type VoiceMultiSpeakerFixtureOptions = {
  silenceMs?: number;
};

const JARGON_FIXTURE_IDS = [
  "traveled-back-route-clean",
  "dialogue-two-clean",
  "dialogue-three-clean",
  "dialogue-two-noisy",
  "dialogue-three-mixed",
] as const;

export type VoiceFixtureLoadOptions = {
  directories?: string[];
  includeBundled?: boolean;
};

const DEFAULT_AUDIO_FORMAT: AudioFormat = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 16_000,
};

const DEFAULT_TELEPHONY_SAMPLE_RATE_HZ = 8_000;
const DEFAULT_MULTI_SPEAKER_SILENCE_MS = 350;

const FIXTURE_DIR_CANDIDATES = [
  resolve(import.meta.dir, "..", "..", "fixtures"),
  resolve(import.meta.dir, "..", "..", "..", "fixtures"),
  resolve(import.meta.dir, "..", "..", "..", "..", "fixtures"),
];

const EXTERNAL_FIXTURE_ENV_KEYS = [
  "VOICE_FIXTURE_DIR",
  "VOICE_FIXTURE_DIRS",
] as const;

const resolveFixtureDirectory = async () => {
  for (const candidate of FIXTURE_DIR_CANDIDATES) {
    if (await Bun.file(resolve(candidate, "manifest.json")).exists()) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to locate the bundled voice test fixtures. Expected fixtures/manifest.json next to the package root.",
  );
};

export const getVoiceFixtureDirectory = async () => resolveFixtureDirectory();

const toUniqueDirectories = (directories: string[]) =>
  directories.filter(
    (directory, index, list) =>
      directory.trim().length > 0 && list.indexOf(directory) === index,
  );

const splitFixtureDirectoryValue = (value: string | undefined) =>
  (value ?? "")
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry): entry is string => entry.length > 0);

const resolveFixtureInputDirectories = (
  input?: string | string[] | VoiceFixtureLoadOptions,
) => {
  if (typeof input === "string") {
    return [input];
  }

  if (Array.isArray(input)) {
    return input;
  }

  return input?.directories ?? [];
};

const shouldIncludeBundledFixtures = (
  input?: string | string[] | VoiceFixtureLoadOptions,
) => {
  if (
    input &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    input.includeBundled === false
  ) {
    return false;
  }

  return true;
};

const resolveConfiguredFixtureDirectories = async (
  input?: string | string[] | VoiceFixtureLoadOptions,
) => {
  const directories = [
    ...resolveFixtureInputDirectories(input),
    ...EXTERNAL_FIXTURE_ENV_KEYS.flatMap((key) =>
      splitFixtureDirectoryValue(process.env[key]),
    ),
  ];
  const uniqueDirectories = toUniqueDirectories(
    directories.map((directory) => resolve(directory)),
  );

  for (const directory of uniqueDirectories) {
    const manifestExists = await Bun.file(
      resolve(directory, "manifest.json"),
    ).exists();
    if (!manifestExists) {
      throw new Error(
        `Voice fixture directory "${directory}" is missing manifest.json.`,
      );
    }
  }

  return uniqueDirectories;
};

export const resolveVoiceFixtureDirectories = async (
  input?: string | string[] | VoiceFixtureLoadOptions,
) => {
  const directories = await resolveConfiguredFixtureDirectories(input);

  if (!shouldIncludeBundledFixtures(input)) {
    if (directories.length === 0) {
      throw new Error(
        "No voice fixture directories were configured. Provide directories or set VOICE_FIXTURE_DIR/VOICE_FIXTURE_DIRS.",
      );
    }

    return directories;
  }

  return [await resolveFixtureDirectory(), ...directories];
};

const clampSample = (value: number) =>
  Math.max(-32_768, Math.min(32_767, Math.round(value)));

const toPcm16Samples = (audio: Uint8Array) =>
  new Int16Array(
    audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength),
  );

const toPcm16Bytes = (samples: Int16Array) =>
  new Uint8Array(
    samples.buffer.slice(
      samples.byteOffset,
      samples.byteOffset + samples.byteLength,
    ),
  );

const createSilenceBytes = (sampleRateHz: number, durationMs: number) =>
  new Uint8Array(
    Math.max(2, Math.round((sampleRateHz * 2 * durationMs) / 1_000)),
  );

const concatAudioChunks = (chunks: Uint8Array[]) => {
  const totalByteLength = chunks.reduce(
    (sum, chunk) => sum + chunk.byteLength,
    0,
  );
  const output = new Uint8Array(totalByteLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
};

const resamplePcm16Mono = (
  samples: Int16Array,
  sourceRate: number,
  targetRate: number,
) => {
  if (sourceRate === targetRate || samples.length === 0) {
    return samples;
  }

  const ratio = targetRate / sourceRate;
  const targetLength = Math.max(1, Math.round(samples.length * ratio));
  const output = new Int16Array(targetLength);

  for (let index = 0; index < targetLength; index += 1) {
    const sourceIndex = index / ratio;
    const previousIndex = Math.floor(sourceIndex);
    const nextIndex = Math.min(previousIndex + 1, samples.length - 1);
    const fraction = sourceIndex - previousIndex;
    const previous = samples[previousIndex] ?? 0;
    const next = samples[nextIndex] ?? previous;
    output[index] = clampSample(previous + (next - previous) * fraction);
  }

  return output;
};

const toMuLaw = (sample: number) => {
  const MU_LAW_MAX = 0x1fff;
  const MU_LAW_BIAS = 0x84;
  const sign = sample < 0 ? 0x80 : 0;
  const magnitude = Math.min(MU_LAW_MAX, Math.abs(sample) + MU_LAW_BIAS);
  let exponent = 7;

  for (
    let mask = 0x4000;
    (magnitude & mask) === 0 && exponent > 0;
    mask >>= 1
  ) {
    exponent -= 1;
  }

  const mantissa = (magnitude >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
};

const fromMuLaw = (encoded: number) => {
  const normalized = ~encoded & 0xff;
  const sign = normalized & 0x80;
  const exponent = (normalized >> 4) & 0x07;
  const mantissa = normalized & 0x0f;
  const magnitude = ((mantissa | 0x10) << (exponent + 3)) - 0x84;
  return sign ? -magnitude : magnitude;
};

const applyTelephonyDegradation = (
  audio: Uint8Array,
  format: AudioFormat,
  targetSampleRateHz: number,
) => {
  const sourceSamples = toPcm16Samples(audio);
  const narrowbandSamples = resamplePcm16Mono(
    sourceSamples,
    format.sampleRateHz,
    targetSampleRateHz,
  );
  const degradedSamples = new Int16Array(narrowbandSamples.length);

  for (let index = 0; index < narrowbandSamples.length; index += 1) {
    const compressed = toMuLaw(narrowbandSamples[index] ?? 0);
    degradedSamples[index] = clampSample(fromMuLaw(compressed) * 0.92);
  }

  return toPcm16Bytes(degradedSamples);
};

const shouldIncludeTelephonyFixture = (
  fixture: VoiceTestFixture,
  options: VoiceTelephonyFixtureOptions,
) => {
  const tags = new Set(fixture.tags ?? []);

  if (
    !options.includeAccents &&
    (tags.has("accent") || tags.has("speech-accent-archive"))
  ) {
    return false;
  }

  return true;
};

export const createTelephonyVoiceTestFixtures = (
  fixtures: VoiceTestFixture[],
  options: VoiceTelephonyFixtureOptions = {},
): VoiceTestFixture[] => {
  const targetSampleRateHz =
    options.targetSampleRateHz ?? DEFAULT_TELEPHONY_SAMPLE_RATE_HZ;

  return fixtures
    .filter((fixture) => shouldIncludeTelephonyFixture(fixture, options))
    .map((fixture) => ({
      ...fixture,
      audio: applyTelephonyDegradation(
        fixture.audio,
        fixture.format,
        targetSampleRateHz,
      ),
      format: {
        ...fixture.format,
        sampleRateHz: targetSampleRateHz,
      },
      id: `${fixture.id}-telephony`,
      tags: Array.from(
        new Set([...(fixture.tags ?? []), "narrowband", "telephony"]),
      ),
      title: `${fixture.title} (telephony narrowband)`,
    }));
};

const requireFixture = (fixtures: VoiceTestFixture[], id: string) => {
  const fixture = fixtures.find((entry) => entry.id === id);
  if (!fixture) {
    throw new Error(
      `Missing bundled voice fixture "${id}" required for multi-speaker benchmarks.`,
    );
  }

  return fixture;
};

export const createMultiSpeakerVoiceTestFixtures = (
  fixtures: VoiceTestFixture[],
  options: VoiceMultiSpeakerFixtureOptions = {},
): VoiceTestFixture[] => {
  const silenceMs = options.silenceMs ?? DEFAULT_MULTI_SPEAKER_SILENCE_MS;
  const speakerA = requireFixture(fixtures, "quietly-alone-clean");
  const speakerB = requireFixture(fixtures, "traveled-back-route-clean");
  const speakerC = requireFixture(fixtures, "rainstorms-noisy");

  const silence = createSilenceBytes(speakerA.format.sampleRateHz, silenceMs);
  const handoff = concatAudioChunks([speakerA.audio, silence, speakerB.audio]);
  const threeTurn = concatAudioChunks([
    speakerA.audio,
    silence,
    speakerB.audio,
    silence,
    speakerC.audio,
  ]);

  const buildTags = (...tags: string[]) => [
    "multi-speaker",
    "handoff",
    "synthetic",
    ...tags,
  ];

  return [
    {
      ...speakerA,
      audio: handoff,
      audioPath: `${speakerA.audioPath}+${speakerB.audioPath}`,
      expectedSpeakerTurns: [
        { speaker: "speaker-a", text: speakerA.expectedText },
        { speaker: "speaker-b", text: speakerB.expectedText },
      ],
      expectedTerms: Array.from(
        new Set([
          ...(speakerA.expectedTerms ?? []),
          ...(speakerB.expectedTerms ?? []),
        ]),
      ),
      expectedText: `${speakerA.expectedText} ${speakerB.expectedText}`.trim(),
      expectedTurnTexts: [speakerA.expectedText, speakerB.expectedText],
      id: "multi-speaker-handoff-clean",
      tags: buildTags("clean"),
      title: "Synthetic two-speaker handoff",
    },
    {
      ...speakerA,
      audio: threeTurn,
      audioPath: `${speakerA.audioPath}+${speakerB.audioPath}+${speakerC.audioPath}`,
      expectedSpeakerTurns: [
        { speaker: "speaker-a", text: speakerA.expectedText },
        { speaker: "speaker-b", text: speakerB.expectedText },
        { speaker: "speaker-c", text: speakerC.expectedText },
      ],
      expectedTerms: Array.from(
        new Set([
          ...(speakerA.expectedTerms ?? []),
          ...(speakerB.expectedTerms ?? []),
          ...(speakerC.expectedTerms ?? []),
        ]),
      ),
      expectedText:
        `${speakerA.expectedText} ${speakerB.expectedText} ${speakerC.expectedText}`.trim(),
      expectedTurnTexts: [
        speakerA.expectedText,
        speakerB.expectedText,
        speakerC.expectedText,
      ],
      id: "multi-speaker-handoff-three",
      tags: buildTags("challenging", "noisy"),
      title: "Synthetic three-speaker handoff (A-B-C)",
    },
  ];
};

export const createJargonVoiceTestFixtures = (
  fixtures: VoiceTestFixture[],
): VoiceTestFixture[] =>
  JARGON_FIXTURE_IDS.map((id) => requireFixture(fixtures, id))
    .filter((fixture) => (fixture.expectedTerms?.length ?? 0) > 0)
    .map((fixture) => ({
      ...fixture,
      id: `${fixture.id}-jargon`,
      tags: Array.from(
        new Set([...(fixture.tags ?? []), "domain-heavy", "jargon"]),
      ),
      title: `${fixture.title} (jargon)`,
    }));

export const loadVoiceTestFixtures = async (
  fixtureDirectory?: string | string[] | VoiceFixtureLoadOptions,
): Promise<VoiceTestFixture[]> => {
  const fixtureDirectories =
    await resolveVoiceFixtureDirectories(fixtureDirectory);
  const fixtures: VoiceTestFixture[] = [];
  const seenFixtureIds = new Set<string>();

  for (const directory of fixtureDirectories) {
    const manifestFile = Bun.file(resolve(directory, "manifest.json"));
    const manifest =
      (await manifestFile.json()) as VoiceTestFixtureManifestEntry[];

    for (const entry of manifest) {
      if (seenFixtureIds.has(entry.id)) {
        throw new Error(
          `Duplicate voice fixture id "${entry.id}" found while loading "${directory}".`,
        );
      }

      const audioPath = resolve(directory, "pcm", entry.audioPath);
      const audio = new Uint8Array(await Bun.file(audioPath).arrayBuffer());

      fixtures.push({
        ...entry,
        audio,
        audioPath,
        format: {
          ...DEFAULT_AUDIO_FORMAT,
          ...entry.format,
        },
      });
      seenFixtureIds.add(entry.id);
    }
  }

  return fixtures;
};
