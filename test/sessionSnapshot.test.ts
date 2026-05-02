import { createMediaFrame, createMediaProcessorGraph } from "@absolutejs/media";
import { expect, test } from "bun:test";
import {
  buildVoiceProviderRouterTraceEvent,
  buildVoiceSessionSnapshot,
  createVoiceSessionSnapshotRoutes,
  createVoiceProofAssertion,
  parseVoiceSessionSnapshot,
} from "../src";

test("buildVoiceSessionSnapshot captures media, routing, proof, quality, and telephony evidence", async () => {
  const mediaGraph = createMediaProcessorGraph({
    maxInFlightFrames: 4,
    maxNodeProcessingMs: 0,
    maxQueuedFrames: 8,
    name: "call-media",
    nodes: [
      {
        name: "passthrough",
        process: (frame) => frame,
      },
    ],
  });
  await mediaGraph.process(
    createMediaFrame({
      id: "frame-1",
      kind: "input-audio",
      source: "telephony",
    }),
  );

  const routingEvent = buildVoiceProviderRouterTraceEvent({
    event: {
      at: 10,
      attempt: 1,
      elapsedMs: 42,
      provider: "openai",
      selectedProvider: "openai",
      status: "success",
    },
    sessionId: "session-1",
    turnId: "turn-1",
  });
  const snapshot = buildVoiceSessionSnapshot({
    artifacts: [
      {
        href: "/voice-operations/session-1",
        kind: "operations-record",
        label: "Operations record",
        status: "pass",
      },
    ],
    media: [mediaGraph.snapshot()],
    name: "support-bundle",
    proofAssertions: [
      createVoiceProofAssertion({
        name: "providerRouting",
        ok: true,
      }),
    ],
    providerRoutingEvents: [routingEvent],
    quality: [
      {
        name: "turn-quality",
        report: { warnings: 1 },
        status: "warn",
      },
    ],
    scenarioId: "demo",
    sessionId: "session-1",
    telephonyOutcomes: [
      {
        action: "complete",
        at: 20,
        campaignOutcome: {
          applied: true,
          campaignId: "campaign-1",
          status: "succeeded",
        },
        provider: "twilio",
        sessionId: "session-1",
        source: "status",
      },
    ],
    turnId: "turn-1",
  });

  expect(snapshot.schema).toBe("absolute.voice.session.snapshot.v1");
  expect(snapshot.status).toBe("warn");
  expect(snapshot.proofSummary).toEqual({
    failed: 0,
    failures: [],
    ok: true,
    passed: 1,
    total: 1,
  });
  expect(snapshot.media[0]?.report.timing.overBudgetFrames).toBe(1);
  expect(snapshot.artifacts).toEqual([
    {
      href: "/voice-operations/session-1",
      kind: "operations-record",
      label: "Operations record",
      status: "pass",
    },
  ]);
  expect(snapshot.providerRoutingEvents).toEqual([routingEvent]);
  expect(snapshot.telephonyOutcomes).toHaveLength(1);
  expect(parseVoiceSessionSnapshot(snapshot)).toEqual(snapshot);
  expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
});

test("buildVoiceSessionSnapshot fails when proof assertions fail", () => {
  const snapshot = buildVoiceSessionSnapshot({
    proofAssertions: [
      createVoiceProofAssertion({
        missingIssue: "Missing provider routing proof.",
        name: "providerRouting",
        ok: false,
      }),
    ],
    sessionId: "session-1",
  });

  expect(snapshot.status).toBe("fail");
  expect(snapshot.proofSummary.failed).toBe(1);
});

test("buildVoiceSessionSnapshot warns when linked artifacts warn", () => {
  const snapshot = buildVoiceSessionSnapshot({
    artifacts: [
      {
        kind: "provider-fallback",
        label: "Provider fallback replay",
        status: "warn",
      },
    ],
    sessionId: "session-1",
  });

  expect(snapshot.status).toBe("warn");
});

test("createVoiceSessionSnapshotRoutes exposes JSON and downloadable snapshot artifacts", async () => {
  const app = createVoiceSessionSnapshotRoutes({
    source: ({ sessionId, turnId }) =>
      buildVoiceSessionSnapshot({
        name: "route-snapshot",
        proofAssertions: [
          createVoiceProofAssertion({
            name: "route-proof",
            ok: true,
          }),
        ],
        sessionId,
        turnId,
      }),
  });

  const json = await app.handle(
    new Request(
      "http://localhost/api/voice/session-snapshot/session-1?turnId=turn-1",
    ),
  );
  expect(json.status).toBe(200);
  const snapshot = await json.json();
  expect(snapshot).toMatchObject({
    name: "route-snapshot",
    schema: "absolute.voice.session.snapshot.v1",
    sessionId: "session-1",
    status: "pass",
    turnId: "turn-1",
  });

  const download = await app.handle(
    new Request(
      "http://localhost/api/voice/session-snapshot/session-1/download?turnId=turn-1",
    ),
  );
  expect(download.headers.get("content-disposition")).toBe(
    'attachment; filename="voice-session-session-1.snapshot.json"',
  );
  expect((await download.json()).sessionId).toBe("session-1");
});
