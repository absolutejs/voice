import { computed, Injectable, signal } from '@angular/core';
import { createVoiceController } from '../client/controller';
import type {
	VoiceControllerOptions,
	VoiceTurnRecord
} from '../types';

@Injectable({ providedIn: 'root' })
export class VoiceControllerService {
	connect<TResult = unknown>(
		path: string,
		options: VoiceControllerOptions = {}
	) {
		const controller = createVoiceController<TResult>(path, options);
		const assistantAudioSignal = signal<typeof controller.assistantAudio>([]);
		const assistantTextsSignal = signal<string[]>([]);
		const errorSignal = signal<string | null>(null);
		const isConnectedSignal = signal(false);
		const isRecordingSignal = signal(false);
		const partialSignal = signal('');
		const reconnectSignal = signal(controller.reconnect);
		const recordingErrorSignal = signal<string | null>(null);
		const sessionIdSignal = signal(controller.sessionId);
		const statusSignal = signal(controller.status);
		const turnsSignal = signal<VoiceTurnRecord<TResult>[]>([]);

		const sync = () => {
			assistantAudioSignal.set([...controller.assistantAudio]);
			assistantTextsSignal.set([...controller.assistantTexts]);
			errorSignal.set(controller.error);
			isConnectedSignal.set(controller.isConnected);
			isRecordingSignal.set(controller.isRecording);
			partialSignal.set(controller.partial);
			reconnectSignal.set(controller.reconnect);
			recordingErrorSignal.set(controller.recordingError);
			sessionIdSignal.set(controller.sessionId);
			statusSignal.set(controller.status);
			turnsSignal.set([...controller.turns]);
		};

		const unsubscribe = controller.subscribe(sync);
		sync();

		return {
			assistantAudio: computed(() => assistantAudioSignal()),
			assistantTexts: computed(() => assistantTextsSignal()),
			bindHTMX: controller.bindHTMX,
			close: () => {
				unsubscribe();
				controller.close();
			},
			endTurn: () => controller.endTurn(),
			error: computed(() => errorSignal()),
			isConnected: computed(() => isConnectedSignal()),
			isRecording: computed(() => isRecordingSignal()),
			partial: computed(() => partialSignal()),
			reconnect: computed(() => reconnectSignal()),
			recordingError: computed(() => recordingErrorSignal()),
			sendAudio: (audio: Uint8Array | ArrayBuffer) =>
				controller.sendAudio(audio),
			sessionId: computed(() => sessionIdSignal()),
			startRecording: () => controller.startRecording(),
			status: computed(() => statusSignal()),
			stopRecording: () => controller.stopRecording(),
			toggleRecording: () => controller.toggleRecording(),
			turns: computed(() => turnsSignal())
		};
	}
}
