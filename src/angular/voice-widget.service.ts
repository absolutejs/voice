import { computed, Injectable, signal } from "@angular/core";
import { createVoiceController } from "../client/controller";
import type { VoiceControllerOptions } from "../types";
import {
  createVoiceWidgetViewModel,
  renderVoiceWidgetHTML,
  type VoiceWidgetLabels,
  type VoiceWidgetTheme,
  type VoiceWidgetViewModel,
} from "../client/voiceWidgetView";

export type CreateVoiceWidgetServiceOptions = VoiceControllerOptions & {
  labels?: VoiceWidgetLabels;
  theme?: VoiceWidgetTheme;
  title?: string;
};

@Injectable({ providedIn: "root" })
export class VoiceWidgetService {
  connect<TResult = unknown>(
    path: string,
    options: CreateVoiceWidgetServiceOptions = {},
  ) {
    const controller = createVoiceController<TResult>(path, options);
    const viewModelSignal = signal<VoiceWidgetViewModel>(
      createVoiceWidgetViewModel({
        labels: options.labels,
        state: controller.getSnapshot(),
        theme: options.theme,
        title: options.title,
      }),
    );

    const sync = () => {
      viewModelSignal.set(
        createVoiceWidgetViewModel({
          labels: options.labels,
          state: controller.getSnapshot(),
          theme: options.theme,
          title: options.title,
        }),
      );
    };

    const unsubscribe = controller.subscribe(sync);
    sync();

    return {
      close: () => {
        unsubscribe();
        controller.close();
      },
      endCall: () => controller.close(),
      getHTML: () => renderVoiceWidgetHTML(viewModelSignal()),
      mute: () => controller.stopRecording(),
      startCall: () => controller.startRecording(),
      unmute: () => controller.startRecording(),
      viewModel: computed(() => viewModelSignal()),
    };
  }
}
