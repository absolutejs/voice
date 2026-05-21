import { describe, expect, test } from "bun:test";
import {
  buildVoiceMultilingualProofReadinessCheck,
  renderVoiceMultilingualProofMarkdown,
  runVoiceMultilingualProof,
} from "../src";
import type { STTAdapter, STTAdapterSession, VoiceTestFixture } from "../src";

const baseFormat = {
  channels: 1 as const,
  container: "raw" as const,
  encoding: "pcm_s16le" as const,
  sampleRateHz: 16_000,
};

const buildFixture = (
  id: string,
  language: string,
  expected: string,
): VoiceTestFixture => ({
  audio: new Uint8Array([0, 0, 0, 0]),
  audioPath: `${id}.pcm`,
  difficulty: "clean",
  expectedText: expected,
  format: baseFormat,
  id,
  language,
  tags: ["benchmark", "multilingual", language],
  title: `${language} sentence ${id}`,
});

// A scripted STT adapter that returns a caller-specified transcript per
// fixture id. The benchmark harness calls open() per fixture, then drives
// audio chunks through send(), then waits for a final + endOfTurn before
// closing. Our scripted adapter emits both events the moment it sees any
// audio (or, for empty-script fixtures, just on close).
const buildScriptedAdapter = (
  transcripts: Record<string, string>,
): STTAdapter => {
  let sessionSeq = 0;
  return {
    kind: "stt",
    open: () => {
      sessionSeq += 1;
      const seq = sessionSeq;
      const listeners = {
        close: new Set<(event: never) => void>(),
        endOfTurn: new Set<(event: never) => void>(),
        error: new Set<(event: never) => void>(),
        final: new Set<(event: never) => void>(),
        partial: new Set<(event: never) => void>(),
      };
      const emit = (event: keyof typeof listeners, payload: unknown) => {
        for (const handler of listeners[event]) {
          (handler as (event: unknown) => void)(payload);
        }
      };
      let closed = false;
      let emittedFinal = false;
      const fixtureId = (() => {
        // Sessions open before any send(); we have to guess the fixture id by
        // matching to a transcript map key in insertion order.
        const keys = Object.keys(transcripts);
        return keys[(seq - 1) % keys.length] ?? "unknown";
      })();
      const emitFinal = () => {
        if (emittedFinal) return;
        emittedFinal = true;
        const text = transcripts[fixtureId] ?? "";
        emit("final", {
          receivedAt: Date.now(),
          transcript: {
            id: `scripted:${String(seq)}`,
            isFinal: true,
            text,
            vendor: "scripted",
          },
          type: "final",
        });
        emit("endOfTurn", {
          reason: "vendor",
          receivedAt: Date.now(),
          type: "endOfTurn",
        });
      };
      const session: STTAdapterSession = {
        close: async () => {
          if (closed) return;
          closed = true;
          emitFinal();
          emit("close", { recoverable: false, type: "close" });
        },
        on: (event, handler) => {
          listeners[event].add(handler as never);
          return () => {
            listeners[event].delete(handler as never);
          };
        },
        send: async () => {
          emitFinal();
        },
      };
      return session;
    },
  };
};

describe("runVoiceMultilingualProof", () => {
  test("aggregates per-language WER and passes when every threshold is met", async () => {
    const fixtures = [
      buildFixture("es-1", "es", "hola mundo"),
      buildFixture("es-2", "es", "buen dia"),
      buildFixture("fr-1", "fr", "bonjour le monde"),
      buildFixture("hi-en-1", "hi-en", "namaste world"),
    ];
    const transcripts: Record<string, string> = {
      "es-1": "hola mundo",
      "es-2": "buen dia",
      "fr-1": "bonjour le monde",
      "hi-en-1": "namaste world",
    };
    const adapter = buildScriptedAdapter(transcripts);
    const report = await runVoiceMultilingualProof({
      adapters: [
        {
          adapter,
          adapterId: "scripted-perfect",
          benchmarkOptions: {
            idleTimeoutMs: 200,
            settleMs: 50,
            tailPaddingMs: 0,
          },
        },
      ],
      defaultThresholds: { maxAverageWordErrorRate: 0.1, minPassRate: 0.5 },
      fixtures,
      perLanguage: [
        {
          language: "hi-en",
          label: "Hindi-English",
          maxAverageWordErrorRate: 0.2,
        },
      ],
    });
    expect(report.passes).toBe(true);
    expect(report.summary.fixtureCount).toBe(4);
    expect(report.summary.languageCount).toBe(3);
    expect(report.adapters[0]?.passes).toBe(true);
    expect(
      report.adapters[0]?.languageReports.map((entry) => entry.language).sort(),
    ).toEqual(["es", "fr", "hi-en"]);
    for (const language of report.adapters[0]?.languageReports ?? []) {
      expect(language.metrics.averageWordErrorRate).toBeLessThanOrEqual(0.01);
    }
  });

  test("fails a single language when its WER threshold is exceeded and lifts the failure into the readiness check", async () => {
    const fixtures = [
      buildFixture("es-1", "es", "hola mundo"),
      buildFixture("fr-1", "fr", "bonjour le monde"),
    ];
    const transcripts: Record<string, string> = {
      "es-1": "hola mundo", // perfect
      "fr-1": "totally wrong", // huge WER
    };
    const adapter = buildScriptedAdapter(transcripts);
    const report = await runVoiceMultilingualProof({
      adapters: [
        {
          adapter,
          adapterId: "scripted-fr-broken",
          benchmarkOptions: {
            idleTimeoutMs: 200,
            settleMs: 50,
            tailPaddingMs: 0,
          },
        },
      ],
      defaultThresholds: { maxAverageWordErrorRate: 0.2 },
      fixtures,
    });
    expect(report.passes).toBe(false);
    expect(report.summary.failedAdapters).toEqual(["scripted-fr-broken"]);
    const frReport = report.adapters[0]?.languageReports.find(
      (entry) => entry.language === "fr",
    );
    expect(frReport?.passes).toBe(false);
    expect(frReport?.failures[0]).toContain("fr:");
    const readiness = buildVoiceMultilingualProofReadinessCheck(report, {
      baseHref: "/voice/multilingual-proof",
      label: "Multilingual STT",
    });
    expect(readiness.status).toBe("fail");
    expect(readiness.detail).toContain("scripted-fr-broken");
    expect(readiness.href).toBe("/voice/multilingual-proof");
  });

  test("buildVoiceMultilingualProofReadinessCheck returns warn when no adapters were exercised", () => {
    const readiness = buildVoiceMultilingualProofReadinessCheck({
      adapters: [],
      generatedAt: 0,
      passes: true,
      summary: {
        adapterCount: 0,
        failedAdapters: [],
        fixtureCount: 0,
        languageCount: 0,
      },
    });
    expect(readiness.status).toBe("warn");
  });

  test("renderVoiceMultilingualProofMarkdown emits a status header + per-language table per adapter", async () => {
    const fixtures = [buildFixture("es-1", "es", "hola mundo")];
    const adapter = buildScriptedAdapter({ "es-1": "hola mundo" });
    const report = await runVoiceMultilingualProof({
      adapters: [
        {
          adapter,
          adapterId: "scripted",
          benchmarkOptions: {
            idleTimeoutMs: 200,
            settleMs: 50,
            tailPaddingMs: 0,
          },
        },
      ],
      defaultThresholds: { maxAverageWordErrorRate: 0.1 },
      fixtures,
    });
    const md = renderVoiceMultilingualProofMarkdown(report);
    expect(md).toContain("# Voice Multilingual STT Proof");
    expect(md).toContain("## scripted — pass");
    expect(md).toContain("| Language |");
    expect(md).toContain("| es ");
  });

  test("supports running multiple adapters in one proof report", async () => {
    const fixtures = [buildFixture("es-1", "es", "hola mundo")];
    const good = buildScriptedAdapter({ "es-1": "hola mundo" });
    const bad = buildScriptedAdapter({ "es-1": "completely wrong utterance" });
    const report = await runVoiceMultilingualProof({
      adapters: [
        {
          adapter: good,
          adapterId: "good",
          benchmarkOptions: {
            idleTimeoutMs: 200,
            settleMs: 50,
            tailPaddingMs: 0,
          },
        },
        {
          adapter: bad,
          adapterId: "bad",
          benchmarkOptions: {
            idleTimeoutMs: 200,
            settleMs: 50,
            tailPaddingMs: 0,
          },
        },
      ],
      defaultThresholds: { maxAverageWordErrorRate: 0.2 },
      fixtures,
    });
    expect(report.summary.adapterCount).toBe(2);
    expect(report.summary.failedAdapters).toEqual(["bad"]);
    expect(report.passes).toBe(false);
  });

  test("throws when neither fixtures nor fixtureDirectories yield any fixtures", async () => {
    const adapter = buildScriptedAdapter({});
    await expect(
      runVoiceMultilingualProof({
        adapters: [{ adapter, adapterId: "scripted" }],
        fixtures: [],
      }),
    ).rejects.toThrow(/zero fixtures/);
  });

  test("throws when adapters array is empty", async () => {
    await expect(
      runVoiceMultilingualProof({
        adapters: [],
        fixtures: [buildFixture("es-1", "es", "x")],
      }),
    ).rejects.toThrow(/at least one adapter/);
  });
});
