import {
  createVoiceAgentSquadStatusViewModel,
  renderVoiceAgentSquadStatusHTML,
  type VoiceAgentSquadStatusWidgetOptions,
} from "../client/agentSquadStatusWidget";
import { createVoiceAgentSquadStatusStore } from "../client/agentSquadStatus";

export const createVoiceAgentSquadStatus = (
  path = "/api/voice-traces",
  options: VoiceAgentSquadStatusWidgetOptions = {},
) => {
  const store = createVoiceAgentSquadStatusStore(path, options);

  return {
    close: store.close,
    getSnapshot: store.getSnapshot,
    refresh: store.refresh,
    subscribe: store.subscribe,
    getHTML: () =>
      renderVoiceAgentSquadStatusHTML(store.getSnapshot(), options),
    getViewModel: () =>
      createVoiceAgentSquadStatusViewModel(store.getSnapshot(), options),
  };
};
