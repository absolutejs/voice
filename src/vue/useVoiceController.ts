import { onUnmounted, ref, shallowRef } from 'vue';
import { createVoiceController } from '../client/controller';
import type {
	VoiceControllerOptions,
	VoiceTurnRecord
} from '../types';

export function useVoiceController<TResult = unknown>(
	path: string,
	options: VoiceControllerOptions = {}
) {
	const controller = createVoiceController<TResult>(path, options);
	const assistantAudio = shallowRef<typeof controller.assistantAudio>([]);
	const assistantTexts = shallowRef<string[]>([]);
	const error = ref<string | null>(null);
	const isConnected = ref(false);
	const isRecording = ref(false);
	const partial = ref('');
	const reconnect = shallowRef(controller.reconnect);
	const recordingError = ref<string | null>(null);
	const sessionId = ref(controller.sessionId);
	const status = ref(controller.status);
	const turns = shallowRef<VoiceTurnRecord<TResult>[]>([]);

	const sync = () => {
		assistantAudio.value = [...controller.assistantAudio];
		assistantTexts.value = [...controller.assistantTexts];
		error.value = controller.error;
		isConnected.value = controller.isConnected;
		isRecording.value = controller.isRecording;
		partial.value = controller.partial;
		reconnect.value = controller.reconnect;
		recordingError.value = controller.recordingError;
		sessionId.value = controller.sessionId;
		status.value = controller.status;
		turns.value = [...controller.turns];
	};

	const unsubscribe = controller.subscribe(sync);
	sync();

	const destroy = () => {
		unsubscribe();
		controller.close();
	};

	onUnmounted(destroy);

	return {
		assistantAudio,
		assistantTexts,
		bindHTMX: controller.bindHTMX,
		close: () => destroy(),
		endTurn: () => controller.endTurn(),
		error,
		isConnected,
		isRecording,
		partial,
		reconnect,
		recordingError,
		sendAudio: (audio: Uint8Array | ArrayBuffer) => controller.sendAudio(audio),
		sessionId,
		startRecording: () => controller.startRecording(),
		status,
		stopRecording: () => controller.stopRecording(),
		toggleRecording: () => controller.toggleRecording(),
		turns
	};
};
