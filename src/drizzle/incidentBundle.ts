import {
  type StoredVoiceIncidentBundleArtifact,
  type VoiceIncidentBundleStore,
  type VoiceIncidentBundleStoreFilter,
} from "../core/incidentBundle";
import {
  createVoiceDrizzleRecordStore,
  voiceDocumentTable,
  type VoiceDrizzleStoreOptions,
} from "./shared";

export const voiceIncidentBundlesTable = voiceDocumentTable(
  "voice_incident_bundles",
);

const matchesIncidentBundleFilter = (
  artifact: StoredVoiceIncidentBundleArtifact,
  filter: VoiceIncidentBundleStoreFilter,
) => {
  if (filter.sessionId && artifact.sessionId !== filter.sessionId) {
    return false;
  }
  if (
    typeof filter.expiredAt === "number" &&
    (artifact.expiresAt === undefined || artifact.expiresAt > filter.expiredAt)
  ) {
    return false;
  }

  return true;
};

export const createVoiceDrizzleIncidentBundleStore = <
  TArtifact extends StoredVoiceIncidentBundleArtifact =
    StoredVoiceIncidentBundleArtifact,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceIncidentBundleStore<TArtifact> => {
  const store = createVoiceDrizzleRecordStore<TArtifact>({
    db: options.db,
    decorate: (id, value) => ({
      ...value,
      id,
    }),
    getSortAt: (value) => value.createdAt,
    table: voiceIncidentBundlesTable,
  });

  return {
    get: store.get,
    remove: store.remove,
    set: store.set,
    list: async (filter = {}) =>
      (await store.list()).filter((artifact) =>
        matchesIncidentBundleFilter(artifact, filter),
      ),
  };
};
