import { createVoiceTurnQualityStore } from "../client/turnQuality";
import {
  createVoiceTurnQualityViewModel,
  renderVoiceTurnQualityHTML,
  type VoiceTurnQualityWidgetOptions,
} from "../client/turnQualityWidget";

export const createVoiceTurnQuality = (
  path = "/api/turn-quality",
  options: VoiceTurnQualityWidgetOptions = {},
) => {
  const store = createVoiceTurnQualityStore(path, options);
  return {
    ...store,
    getHTML: () => renderVoiceTurnQualityHTML(store.getSnapshot(), options),
    getViewModel: () =>
      createVoiceTurnQualityViewModel(store.getSnapshot(), options),
  };
};
