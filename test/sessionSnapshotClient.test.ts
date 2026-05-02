import { expect, test } from "bun:test";
import {
  createVoiceSessionSnapshotViewModel,
  createVoiceSessionSnapshotStore,
  fetchVoiceSessionSnapshot,
  renderVoiceSessionSnapshotHTML,
} from "../src/client";
import type { VoiceSessionSnapshot } from "../src";

const snapshot: VoiceSessionSnapshot = {
  capturedAt: 123,
  media: [],
  proofAssertions: [],
  proofSummary: {
    failed: 0,
    failures: [],
    ok: true,
    passed: 0,
    total: 0,
  },
  providerRoutingEvents: [],
  quality: [],
  schema: "absolute.voice.session.snapshot.v1",
  sessionId: "session-1",
  status: "pass",
  telephonyOutcomes: [],
};

test("fetchVoiceSessionSnapshot fetches snapshots with optional turn id", async () => {
  const calls: string[] = [];
  const fetched = await fetchVoiceSessionSnapshot("/snapshot/session-1", {
    fetch: async (url) => {
      calls.push(String(url));
      return Response.json(snapshot);
    },
    turnId: "turn-1",
  });

  expect(fetched).toEqual(snapshot);
  expect(calls).toEqual(["/snapshot/session-1?turnId=turn-1"]);
});

test("createVoiceSessionSnapshotStore refreshes and exports snapshot blobs", async () => {
  const store = createVoiceSessionSnapshotStore("/snapshot/session-1", {
    fetch: async () => Response.json(snapshot),
  });

  expect(await store.refresh()).toEqual(snapshot);
  expect(store.getSnapshot()).toMatchObject({
    error: null,
    isLoading: false,
    snapshot,
  });
  expect(JSON.parse(await store.download().text())).toEqual(snapshot);
  store.close();
});

test("session snapshot widget summarizes support/debug signals", () => {
  const model = createVoiceSessionSnapshotViewModel({
    error: null,
    isLoading: false,
    snapshot,
    updatedAt: 456,
  });

  expect(model).toMatchObject({
    label: "pass · session-1",
    showDownload: true,
    status: "ready",
  });
  expect(model.rows.map((row) => row.label)).toEqual([
    "Media graphs",
    "Media warnings",
    "Timing warnings",
    "Backpressure drops",
    "Proof failures",
    "Quality warnings",
    "Provider routing",
    "Telephony outcomes",
  ]);
  expect(
    renderVoiceSessionSnapshotHTML({ error: null, isLoading: false, snapshot }),
  ).toContain("Download snapshot");
});
