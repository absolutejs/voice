import { createVoiceController } from "../client/controller";
import {
  createVoiceWidgetViewModel,
  renderVoiceWidgetHTML,
  type VoiceWidgetLabels,
  type VoiceWidgetTheme,
} from "../client/voiceWidgetView";
import type { VoiceControllerOptions } from "../core/types";

export type VoiceEmbedMountOptions = {
  /** WebSocket route the voice runtime is mounted at. Defaults to "/voice". */
  path?: string;
  title?: string;
  theme?: VoiceWidgetTheme;
  labels?: VoiceWidgetLabels;
  controllerOptions?: VoiceControllerOptions;
  /** Auto-start the call as soon as the widget mounts. Defaults to false. */
  autoStart?: boolean;
  onError?: (error: string) => void;
  onStatusChange?: (status: string) => void;
};

export type VoiceEmbedHandle = {
  /** Begin recording / open the call. */
  start: () => Promise<void>;
  /** Stop recording (mute). */
  mute: () => void;
  /** End the call and tear down. */
  end: () => Promise<void>;
  /** Remove the widget from the DOM and release all resources. */
  unmount: () => void;
  /** The underlying framework-agnostic controller, for advanced use. */
  controller: ReturnType<typeof createVoiceController>;
};

const resolveTarget = (target: string | HTMLElement): HTMLElement => {
  if (typeof target !== "string") return target;
  const el = document.querySelector(target);
  if (!el) {
    throw new Error(`AbsoluteVoice.mount: no element matches "${target}"`);
  }

  return el as HTMLElement;
};

export const mount = (
  target: string | HTMLElement,
  options: VoiceEmbedMountOptions = {},
): VoiceEmbedHandle => {
  const host = resolveTarget(target);
  const controller = createVoiceController(
    options.path ?? "/voice",
    options.controllerOptions,
  );

  let lastError: string | null = null;
  let lastStatus: string | null = null;

  const render = () => {
    const model = createVoiceWidgetViewModel({
      ...(options.labels !== undefined ? { labels: options.labels } : {}),
      state: {
        assistantAudio: controller.assistantAudio,
        error: controller.error,
        isConnected: controller.isConnected,
        isRecording: controller.isRecording,
        partial: controller.partial,
        status: controller.status,
        turns: controller.turns,
      },
      ...(options.theme !== undefined ? { theme: options.theme } : {}),
      ...(options.title !== undefined ? { title: options.title } : {}),
    });
    host.innerHTML = renderVoiceWidgetHTML(model);
    for (const button of host.querySelectorAll<HTMLButtonElement>(
      "button[data-action]",
    )) {
      const {action} = button.dataset;
      button.addEventListener("click", () => {
        if (action === "start") void controller.startRecording();
        else if (action === "mute") controller.stopRecording();
        else if (action === "end") void controller.close();
      });
    }
    if (controller.error && controller.error !== lastError) {
      lastError = controller.error;
      options.onError?.(controller.error);
    }
    if (controller.status !== lastStatus) {
      lastStatus = controller.status;
      options.onStatusChange?.(controller.status);
    }
  };

  const unsubscribe = controller.subscribe(render);
  render();

  if (options.autoStart) {
    void controller.startRecording();
  }

  return {
    controller,
    async end() {
      await controller.close();
    },
    mute() {
      controller.stopRecording();
    },
    async start() {
      await controller.startRecording();
    },
    unmount() {
      unsubscribe();
      void controller.close();
      host.innerHTML = "";
    },
  };
};

export type VoiceEmbedGlobal = {
  mount: typeof mount;
  version: string;
};

export const VOICE_EMBED_VERSION = "0.0.22-beta.516";

const globalApi: VoiceEmbedGlobal = {
  mount,
  version: VOICE_EMBED_VERSION,
};

declare global {
   
  var AbsoluteVoice: VoiceEmbedGlobal | undefined;
}

if (typeof globalThis !== "undefined") {
  (globalThis as { AbsoluteVoice?: VoiceEmbedGlobal }).AbsoluteVoice =
    globalApi;
}

export default globalApi;
