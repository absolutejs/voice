import type { S3Client, S3Options } from "bun";
import { withVoiceCallReviewId } from "./testing/review";
import type {
  StoredVoiceCallReviewArtifact,
  VoiceCallReviewArtifact,
  VoiceCallReviewStore,
} from "./testing/review";

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
