import { createVoiceController } from "../client/controller";
import type { VoiceControllerOptions } from "../core/types";
import {
  createVoiceWidgetViewModel,
  renderVoiceWidgetHTML,
  type VoiceWidgetLabels,
  type VoiceWidgetTheme,
  type VoiceWidgetViewModel,
} from "../client/voiceWidgetView";

export type CreateVoiceWidgetOptions = VoiceControllerOptions & {
  labels?: VoiceWidgetLabels;
  theme?: VoiceWidgetTheme;
  title?: string;
};

export const createVoiceWidget = <TResult = unknown>(
  path: string,
  options: CreateVoiceWidgetOptions = {},
) => {
  const controller = createVoiceController<TResult>(path, options);
  const buildModel = (): VoiceWidgetViewModel =>
    createVoiceWidgetViewModel({
      labels: options.labels,
      state: controller.getSnapshot(),
      theme: options.theme,
      title: options.title,
    });

  return {
    getViewModel: buildModel,
    subscribe: controller.subscribe,
    close: () => controller.close(),
    endCall: () => controller.close(),
    getHTML: () => renderVoiceWidgetHTML(buildModel()),
    getSnapshot: () => controller.getSnapshot(),
    mute: () => controller.stopRecording(),
    startCall: () => controller.startRecording(),
    unmute: () => controller.startRecording(),
  };
};

export type {
  VoiceWidgetLabels,
  VoiceWidgetTheme,
  VoiceWidgetViewModel,
} from "../client/voiceWidgetView";
