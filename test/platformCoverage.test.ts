import { describe, expect, test } from "bun:test";
import {
  assertVoicePlatformCoverage,
  buildVoicePlatformCoverageSummary,
  createVoicePlatformCoverageRoutes,
  evaluateVoicePlatformCoverage,
} from "../src";

const coverage = [
  {
    evidence: [
      {
        method: "GET",
        name: "assistantProof",
        ok: true,
        path: "/api/assistant-proof",
        status: 200,
      },
    ],
    replacement: "Self-hosted assistant primitive.",
    status: "pass",
    surface: "Voice assistant",
  },
  {
    evidence: [
      {
        method: "GET",
        name: "observabilityProof",
        ok: true,
        path: "/api/observability-proof",
        status: 200,
      },
    ],
    replacement: "Customer-owned observability export.",
    status: "pass",
    surface: "Logs export",
  },
];

describe("platform coverage", () => {
  test("buildVoicePlatformCoverageSummary summarizes passing coverage", () => {
    const summary = buildVoicePlatformCoverageSummary({
      coverage,
      generatedAt: "2026-04-29T18:00:00.000Z",
      runId: "run-1",
      source: ".voice-runtime/proof-pack/latest.json",
    });

    expect(summary.ok).toBe(true);
    expect(summary.status).toBe("pass");
    expect(summary.total).toBe(2);
    expect(summary.coverage[0]?.surface).toBe("Voice assistant");
  });

  test("buildVoicePlatformCoverageSummary reports missing coverage", () => {
    const summary = buildVoicePlatformCoverageSummary({
      coverage: [],
      source: ".voice-runtime/proof-pack/latest.json",
    });

    expect(summary.ok).toBe(false);
    expect(summary.status).toBe("missing");
    expect(summary.total).toBe(0);
  });

  test("evaluateVoicePlatformCoverage verifies required surfaces and evidence", () => {
    const summary = buildVoicePlatformCoverageSummary({
      coverage,
      runId: "run-1",
    });
    const report = evaluateVoicePlatformCoverage(summary, {
      minSurfaces: 2,
      requiredEvidence: ["assistantProof", "observabilityProof"],
      requiredSurfaces: ["Logs export", "Voice assistant"],
    });

    expect(report).toMatchObject({
      failed: 0,
      ok: true,
      status: "pass",
      total: 2,
    });
    expect(
      assertVoicePlatformCoverage(summary, {
        requiredSurfaces: ["Voice assistant"],
      }).ok,
    ).toBe(true);

    const failed = evaluateVoicePlatformCoverage(summary, {
      minSurfaces: 3,
      requiredEvidence: ["missingProof"],
      requiredSurfaces: ["Missing surface"],
    });
    expect(failed.ok).toBe(false);
    expect(failed.issues).toContain(
      "Expected at least 3 platform coverage surfaces, found 2.",
    );
    expect(failed.issues).toContain(
      "Missing platform coverage surface: Missing surface.",
    );
    expect(failed.issues).toContain(
      "Missing platform coverage evidence: missingProof.",
    );
    expect(() =>
      assertVoicePlatformCoverage(summary, { minSurfaces: 3 }),
    ).toThrow("Voice platform coverage assertion failed");
  });

  test("createVoicePlatformCoverageRoutes exposes current coverage JSON", async () => {
    const app = createVoicePlatformCoverageRoutes({
      path: "/api/voice/vapi-coverage",
      source: () =>
        buildVoicePlatformCoverageSummary({
          coverage,
          outputDir: ".voice-runtime/proof-pack/run-1",
          runId: "run-1",
          source: ".voice-runtime/proof-pack/latest.json",
        }),
    });

    const response = await app.handle(
      new Request("http://localhost/api/voice/vapi-coverage"),
    );
    const body = (await response.json()) as ReturnType<
      typeof buildVoicePlatformCoverageSummary
    >;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("pass");
    expect(body.total).toBe(2);
    expect(body.coverage[1]?.surface).toBe("Logs export");
  });
});
