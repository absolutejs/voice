import { expect, test } from "bun:test";
import {
  createStoredVoiceCallReviewArtifact,
  createVoiceS3ReviewStore,
} from "../src";
import type {
  StoredVoiceCallReviewArtifact,
  VoiceS3ReviewStoreClient,
  VoiceS3ReviewStoreFile,
} from "../src";

const createFakeS3Client = (): VoiceS3ReviewStoreClient => {
  const objects = new Map<string, string>();

  const createFile = (path: string): VoiceS3ReviewStoreFile => ({
    delete: async () => {
      objects.delete(path);
    },
    exists: async () => objects.has(path),
    text: async () => {
      const value = objects.get(path);
      if (value === undefined) {
        throw new Error(`Missing fake S3 object: ${path}`);
      }
      return value;
    },
    write: async (data: string) => {
      objects.set(path, data);
      return data.length;
    },
  });

  return {
    file: (path: string) => createFile(path),
    list: async (input) => {
      const prefix = input?.prefix ?? "";
      const startAfter = input?.startAfter;
      const keys = [...objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .sort()
        .filter((key) => (startAfter ? key > startAfter : true));

      return {
        contents: keys.map((key) => ({
          key,
        })),
        isTruncated: false,
      } as Awaited<ReturnType<VoiceS3ReviewStoreClient["list"]>>;
    },
  };
};

test("createVoiceS3ReviewStore persists, lists, and removes review artifacts", async () => {
  const store = createVoiceS3ReviewStore({
    client: createFakeS3Client(),
    keyPrefix: "voice/reviews",
  });

  const older = createStoredVoiceCallReviewArtifact("review-1", {
    errors: [],
    generatedAt: 100,
    latencyBreakdown: [],
    notes: [],
    summary: {
      pass: true,
    },
    title: "Older review",
    timeline: [],
    transcript: {
      actual: "older",
    },
  });
  const newer = createStoredVoiceCallReviewArtifact("review-2", {
    errors: [],
    generatedAt: 200,
    latencyBreakdown: [],
    notes: [],
    summary: {
      pass: true,
    },
    title: "Newer review",
    timeline: [],
    transcript: {
      actual: "newer",
    },
  });

  await store.set(older.id, older as StoredVoiceCallReviewArtifact);
  await store.set(newer.id, newer as StoredVoiceCallReviewArtifact);

  expect((await store.get("review-1"))?.title).toBe("Older review");
  expect((await store.list()).map((review) => review.id)).toEqual([
    "review-2",
    "review-1",
  ]);

  await store.remove("review-1");
  expect(await store.get("review-1")).toBeUndefined();
});
