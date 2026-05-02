import { createVoiceReconnectProfileEvidenceStore } from "../client/reconnectProfileEvidence";
import type { VoiceReconnectProfileEvidenceClientOptions } from "../client/reconnectProfileEvidence";

export const createVoiceReconnectProfileEvidence = (
  path = "/api/voice/reconnect-profile-evidence",
  options: VoiceReconnectProfileEvidenceClientOptions = {},
) => {
  const store = createVoiceReconnectProfileEvidenceStore(path, options);

  return {
    close: store.close,
    getSnapshot: store.getSnapshot,
    refresh: store.refresh,
    subscribe: store.subscribe,
  };
};
