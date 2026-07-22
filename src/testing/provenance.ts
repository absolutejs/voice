import { createHash } from "node:crypto";

export type VoiceBenchmarkPromptTrack =
  | "unprompted"
  | "production-context"
  | "oracle-seeded";
export type VoiceCorpusSplit = "development" | "public-test" | "private-held-out";

export type VoiceCorpusFixtureProvenance = {
  audioSha256: string;
  consent?: string;
  fixtureId: string;
  license: string;
  licenseClass: "permissive" | "noncommercial" | "private";
  source: string;
  split: VoiceCorpusSplit;
};

export type VoiceBenchmarkRunManifest = {
  adapter: { id: string; model?: string; provider?: string; version?: string };
  corpus: { fixtures: VoiceCorpusFixtureProvenance[]; manifestSha256: string; name: string; version: string };
  createdAt: string;
  environment: Record<string, string | number | boolean>;
  git: Record<string, string>;
  preprocessing: Record<string, unknown>;
  pricing?: Record<string, number>;
  promptTrack: VoiceBenchmarkPromptTrack;
  seed: number;
};

export const sha256Bytes = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

export const stableBenchmarkJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableBenchmarkJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableBenchmarkJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const buildVoiceBenchmarkArtifact = <T>(
  manifest: VoiceBenchmarkRunManifest,
  report: T,
) => {
  const payload = { manifest, report };
  return { ...payload, artifactSha256: sha256Bytes(stableBenchmarkJson(payload)) };
};

export const verifyVoiceBenchmarkArtifact = (artifact: {
  artifactSha256: string;
  manifest: VoiceBenchmarkRunManifest;
  report: unknown;
}) =>
  artifact.artifactSha256 ===
  sha256Bytes(stableBenchmarkJson({ manifest: artifact.manifest, report: artifact.report }));
