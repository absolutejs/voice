import { Elysia } from "elysia";

export type VoicePlatformCoverageStatus = "fail" | "missing" | "pass" | "stale";

export type VoicePlatformCoverageEvidence = {
  method?: string;
  name: string;
  ok?: boolean;
  path?: string;
  status?: number;
  url?: string;
};

export type VoicePlatformCoverageSurface = {
  evidence: VoicePlatformCoverageEvidence[];
  failed?: number;
  gap?: string;
  missing?: number;
  missingEvidence?: string[];
  replacement: string;
  status: "fail" | "pass" | string;
  surface: string;
};

export type VoicePlatformCoverageSummary = {
  generatedAt?: string;
  ok: boolean;
  outputDir?: string;
  runId?: string;
  source?: string;
  status: VoicePlatformCoverageStatus;
  total: number;
  coverage: VoicePlatformCoverageSurface[];
};

export type VoicePlatformCoverageSummaryInput = {
  coverage?: VoicePlatformCoverageSurface[];
  generatedAt?: string;
  ok?: boolean;
  outputDir?: string;
  runId?: string;
  source?: string;
};

export type VoicePlatformCoverageRoutesOptions = {
  headers?: HeadersInit;
  name?: string;
  path?: string;
  source:
    | (() =>
        | Promise<
            VoicePlatformCoverageSummary | VoicePlatformCoverageSummaryInput
          >
        | VoicePlatformCoverageSummary
        | VoicePlatformCoverageSummaryInput)
    | VoicePlatformCoverageSummary
    | VoicePlatformCoverageSummaryInput;
};

export type VoicePlatformCoverageAssertionInput = {
  maxFailedSurfaces?: number;
  minSurfaces?: number;
  requiredEvidence?: string[];
  requiredSurfaces?: string[];
  requirePass?: boolean;
};

export type VoicePlatformCoverageAssertionReport = {
  failed: number;
  issues: string[];
  missing: number;
  ok: boolean;
  status: VoicePlatformCoverageStatus;
  surfaces: string[];
  total: number;
};

export const buildVoicePlatformCoverageSummary = (
  input: VoicePlatformCoverageSummaryInput,
): VoicePlatformCoverageSummary => {
  const coverage = input.coverage ?? [];
  const ok =
    input.ok ??
    (coverage.length > 0 &&
      coverage.every((surface) => surface.status === "pass"));
  const status: VoicePlatformCoverageStatus =
    coverage.length === 0 ? "missing" : ok ? "pass" : "stale";

  return {
    coverage,
    generatedAt: input.generatedAt,
    ok,
    outputDir: input.outputDir,
    runId: input.runId,
    source: input.source,
    status,
    total: coverage.length,
  };
};

export const evaluateVoicePlatformCoverage = (
  summary: VoicePlatformCoverageSummary,
  input: VoicePlatformCoverageAssertionInput = {},
): VoicePlatformCoverageAssertionReport => {
  const issues: string[] = [];
  const surfaces = summary.coverage.map((surface) => surface.surface).sort();
  const failed = summary.coverage.filter(
    (surface) => surface.status !== "pass",
  ).length;
  const missing = summary.coverage.reduce(
    (total, surface) => total + (surface.missing ?? 0),
    0,
  );
  const evidenceNames = new Set(
    summary.coverage.flatMap((surface) =>
      surface.evidence.map((evidence) => evidence.name),
    ),
  );

  if ((input.requirePass ?? true) && !summary.ok) {
    issues.push(`Expected platform coverage to pass, found ${summary.status}.`);
  }
  if (input.minSurfaces !== undefined && summary.total < input.minSurfaces) {
    issues.push(
      `Expected at least ${String(input.minSurfaces)} platform coverage surfaces, found ${String(summary.total)}.`,
    );
  }
  if (
    input.maxFailedSurfaces !== undefined &&
    failed > input.maxFailedSurfaces
  ) {
    issues.push(
      `Expected at most ${String(input.maxFailedSurfaces)} failing platform coverage surfaces, found ${String(failed)}.`,
    );
  }
  for (const surface of input.requiredSurfaces ?? []) {
    if (!surfaces.includes(surface)) {
      issues.push(`Missing platform coverage surface: ${surface}.`);
    }
  }
  for (const evidence of input.requiredEvidence ?? []) {
    if (!evidenceNames.has(evidence)) {
      issues.push(`Missing platform coverage evidence: ${evidence}.`);
    }
  }

  return {
    failed,
    issues,
    missing,
    ok: issues.length === 0,
    status: summary.status,
    surfaces,
    total: summary.total,
  };
};

export const assertVoicePlatformCoverage = (
  summary: VoicePlatformCoverageSummary,
  input: VoicePlatformCoverageAssertionInput = {},
): VoicePlatformCoverageAssertionReport => {
  const report = evaluateVoicePlatformCoverage(summary, input);
  if (!report.ok) {
    throw new Error(
      `Voice platform coverage assertion failed: ${report.issues.join(" ")}`,
    );
  }
  return report;
};

const normalizeCoverageSummary = (
  value: VoicePlatformCoverageSummary | VoicePlatformCoverageSummaryInput,
) =>
  "status" in value && "total" in value && "coverage" in value
    ? value
    : buildVoicePlatformCoverageSummary(value);

export const createVoicePlatformCoverageRoutes = (
  options: VoicePlatformCoverageRoutesOptions,
) => {
  const path = options.path ?? "/api/voice/platform-coverage";
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-platform-coverage",
  });

  routes.get(path, async () => {
    const value =
      typeof options.source === "function"
        ? await options.source()
        : options.source;

    return Response.json(normalizeCoverageSummary(value), {
      headers: options.headers,
    });
  });

  return routes;
};
