import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createVoiceController } from '../client/controller';
import type { VoiceControllerOptions } from '../types';

const EMPTY_SNAPSHOT = {
	assistantAudio: [],
	assistantTexts: [],
	call: null,
	error: null,
	isConnected: false,
	isRecording: false,
	partial: '',
	reconnect: {
		attempts: 0,
		maxAttempts: 0,
		status: 'idle' as const
	},
	recordingError: null,
	sessionId: '',
	status: 'idle' as const,
	turns: []
};

export const useVoiceController = <TResult = unknown>(
	path: string,
	options: VoiceControllerOptions = {}
) => {
	const controllerRef = useRef<ReturnType<typeof createVoiceController<TResult>> | null>(
		null
	);

	if (!controllerRef.current) {
		controllerRef.current = createVoiceController<TResult>(path, options);
	}

	const controller = controllerRef.current;

	useEffect(() => () => controller.close(), [controller]);

	const snapshot =
		useSyncExternalStore(
			controller.subscribe,
			controller.getSnapshot,
			controller.getServerSnapshot
		) ?? EMPTY_SNAPSHOT;

	return {
		...snapshot,
		bindHTMX: controller.bindHTMX,
		callControl: (message: Parameters<typeof controller.callControl>[0]) =>
			controller.callControl(message),
		close: () => controller.close(),
		endTurn: () => controller.endTurn(),
		sendAudio: (audio: Uint8Array | ArrayBuffer) => controller.sendAudio(audio),
		startRecording: () => controller.startRecording(),
		stopRecording: () => controller.stopRecording(),
		toggleRecording: () => controller.toggleRecording()
	};
};
