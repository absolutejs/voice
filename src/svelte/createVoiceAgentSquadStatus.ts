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
    getHTML: () =>
      renderVoiceAgentSquadStatusHTML(store.getSnapshot(), options),
    getSnapshot: store.getSnapshot,
    getViewModel: () =>
      createVoiceAgentSquadStatusViewModel(store.getSnapshot(), options),
    refresh: store.refresh,
    subscribe: store.subscribe,
  };
};
