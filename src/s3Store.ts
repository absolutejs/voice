import type { S3Client, S3Options } from "bun";
import { withVoiceCallReviewId } from "./testing/review";
import type {
  StoredVoiceCallReviewArtifact,
  VoiceCallReviewArtifact,
  VoiceCallReviewStore,
} from "./testing/review";
import { encodePcmAsWav } from "./recordingStore";
import type {
  StoredVoiceRecordingArtifact,
  VoiceRecordingArtifact,
  VoiceRecordingChannel,
  VoiceRecordingStore,
} from "./recordingStore";

export type VoiceS3ReviewStoreFile = {
  delete: () => Promise<void>;
  exists: () => Promise<boolean>;
  text: () => Promise<string>;
  write: (data: string) => Promise<number>;
};

export type VoiceS3ReviewStoreClient = Pick<S3Client, "file" | "list">;

export type VoiceS3ReviewStoreOptions = S3Options & {
  client?: VoiceS3ReviewStoreClient;
  keyPrefix?: string;
};

const encodeStoreId = (id: string) => `${encodeURIComponent(id)}.json`;

const normalizeKeyPrefix = (prefix?: string) =>
  prefix?.trim().replace(/^\/+|\/+$/g, "") ?? "voice/reviews";

const toReviewObjectKey = (prefix: string, id: string) =>
  `${prefix}/${encodeStoreId(id)}`;

const decodeReviewIdFromKey = (prefix: string, key: string) => {
  const relative = key.startsWith(`${prefix}/`)
    ? key.slice(prefix.length + 1)
    : key;
  return decodeURIComponent(relative.replace(/\.json$/i, ""));
};

export const createVoiceS3ReviewStore = <
  TArtifact extends StoredVoiceCallReviewArtifact =
    StoredVoiceCallReviewArtifact,
>(
  options: VoiceS3ReviewStoreOptions,
): VoiceCallReviewStore<TArtifact> => {
  const client = options.client ?? new Bun.S3Client(options);
  const keyPrefix = normalizeKeyPrefix(options.keyPrefix);

  const getFile = (id: string) =>
    client.file(
      toReviewObjectKey(keyPrefix, id),
      options,
    ) as VoiceS3ReviewStoreFile;

  const get = async (id: string) => {
    const file = getFile(id);
    if (!(await file.exists())) {
      return undefined;
    }

    return JSON.parse(await file.text()) as TArtifact;
  };

  const list = async () => {
    const reviews: TArtifact[] = [];
    let startAfter: string | undefined;

    while (true) {
      const response = await client.list(
        {
          prefix: `${keyPrefix}/`,
          startAfter,
        },
        options,
      );

      const contents = response.contents ?? [];
      for (const entry of contents) {
        if (!entry.key.endsWith(".json")) {
          continue;
        }

        const review = await get(decodeReviewIdFromKey(keyPrefix, entry.key));
        if (review) {
          reviews.push(review);
        }
      }

      if (!response.isTruncated || contents.length === 0) {
        break;
      }

      startAfter = contents.at(-1)?.key;
    }

    return reviews.sort(
      (left, right) => (right.generatedAt ?? 0) - (left.generatedAt ?? 0),
    );
  };

  const set = async (id: string, artifact: TArtifact) => {
    const review = withVoiceCallReviewId(
      id,
      artifact as TArtifact & VoiceCallReviewArtifact,
    );
    await getFile(id).write(JSON.stringify(review));
  };

  const remove = async (id: string) => {
    await getFile(id).delete();
  };

  return {
    get,
    list,
    remove,
    set,
  };
};

export type VoiceS3RecordingStoreFile = {
  delete: () => Promise<void>;
  exists: () => Promise<boolean>;
  text: () => Promise<string>;
  bytes: () => Promise<Uint8Array>;
  write: (data: string | Uint8Array) => Promise<number>;
};

export type VoiceS3RecordingStoreClient = Pick<S3Client, "file" | "list">;

export type VoiceS3RecordingStoreOptions = S3Options & {
  client?: VoiceS3RecordingStoreClient;
  keyPrefix?: string;
  publicUrlBase?: string;
};

const normalizeRecordingKeyPrefix = (prefix?: string) =>
  prefix?.trim().replace(/^\/+|\/+$/g, "") ?? "voice/recordings";

const recordingWavKey = (
  prefix: string,
  sessionId: string,
  channel: VoiceRecordingChannel,
) => `${prefix}/${encodeURIComponent(sessionId)}_${channel}.wav`;

const recordingMetadataKey = (
  prefix: string,
  sessionId: string,
  channel: VoiceRecordingChannel,
) => `${prefix}/${encodeURIComponent(sessionId)}_${channel}.json`;

type StoredRecordingMetadata = {
  capturedAt: number;
  channel: VoiceRecordingChannel;
  durationMs: number;
  format: VoiceRecordingArtifact["format"];
  recordingUrl: string;
  sessionId: string;
};

export const createVoiceS3RecordingStore = (
  options: VoiceS3RecordingStoreOptions,
): VoiceRecordingStore => {
  const client = options.client ?? new Bun.S3Client(options);
  const keyPrefix = normalizeRecordingKeyPrefix(options.keyPrefix);
  const publicUrlBase = options.publicUrlBase?.replace(/\/+$/, "");

  const getFile = (key: string) =>
    client.file(key, options) as VoiceS3RecordingStoreFile;

  const resolveUrl = (key: string) =>
    publicUrlBase ? `${publicUrlBase}/${key}` : `s3://${key}`;

  const put: VoiceRecordingStore["put"] = async (artifact) => {
    const wavKey = recordingWavKey(
      keyPrefix,
      artifact.sessionId,
      artifact.channel,
    );
    const metadataKey = recordingMetadataKey(
      keyPrefix,
      artifact.sessionId,
      artifact.channel,
    );
    const wav = encodePcmAsWav(artifact.audioBytes, artifact.format);
    await getFile(wavKey).write(wav);
    const recordingUrl = resolveUrl(wavKey);
    const metadata: StoredRecordingMetadata = {
      capturedAt: artifact.capturedAt,
      channel: artifact.channel,
      durationMs: artifact.durationMs,
      format: artifact.format,
      recordingUrl,
      sessionId: artifact.sessionId,
    };
    await getFile(metadataKey).write(JSON.stringify(metadata));
    return {
      ...artifact,
      recordingUrl,
    };
  };

  const readMetadata = async (
    sessionId: string,
    channel: VoiceRecordingChannel,
  ): Promise<StoredVoiceRecordingArtifact | undefined> => {
    const metadataKey = recordingMetadataKey(keyPrefix, sessionId, channel);
    const wavKey = recordingWavKey(keyPrefix, sessionId, channel);
    const metadataFile = getFile(metadataKey);
    if (!(await metadataFile.exists())) {
      return undefined;
    }
    const meta = JSON.parse(await metadataFile.text()) as StoredRecordingMetadata;
    const wavBytes = await getFile(wavKey).bytes();
    return {
      audioBytes: wavBytes,
      capturedAt: meta.capturedAt,
      channel: meta.channel,
      durationMs: meta.durationMs,
      format: meta.format,
      recordingUrl: meta.recordingUrl,
      sessionId: meta.sessionId,
    };
  };

  const get: VoiceRecordingStore["get"] = (sessionId, channel) =>
    readMetadata(sessionId, channel);

  const list: VoiceRecordingStore["list"] = async (sessionId) => {
    const channels: VoiceRecordingChannel[] = ["assistant", "user"];
    const records = await Promise.all(
      channels.map((channel) => readMetadata(sessionId, channel)),
    );
    return records.filter(
      (record): record is StoredVoiceRecordingArtifact => record !== undefined,
    );
  };

  return { get, list, put };
};
