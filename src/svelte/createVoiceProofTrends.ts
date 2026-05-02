import { createVoiceProofTrendsStore } from "../client/proofTrends";
import type { VoiceProofTrendsClientOptions } from "../client/proofTrends";

export const createVoiceProofTrends = (
  path = "/api/voice/proof-trends",
  options: VoiceProofTrendsClientOptions = {},
) => {
  const store = createVoiceProofTrendsStore(path, options);

  return {
    close: store.close,
    getSnapshot: store.getSnapshot,
    refresh: store.refresh,
    subscribe: store.subscribe,
  };
};
