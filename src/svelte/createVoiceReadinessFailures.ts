import { createVoiceReadinessFailuresStore } from "../client/readinessFailures";
import type { VoiceReadinessFailuresClientOptions } from "../client/readinessFailures";

export const createVoiceReadinessFailures = (
  path = "/api/production-readiness",
  options: VoiceReadinessFailuresClientOptions = {},
) => {
  const store = createVoiceReadinessFailuresStore(path, options);

  return {
    close: store.close,
    getSnapshot: store.getSnapshot,
    refresh: store.refresh,
    subscribe: store.subscribe,
  };
};
