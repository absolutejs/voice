import { computed, Injectable, signal } from '@angular/core';
import { createVoiceStream } from '../client/createVoiceStream';
import type {
	VoiceConnectionOptions,
	VoiceTurnRecord
} from '../types';

@Injectable({ providedIn: 'root' })
export class VoiceStreamService {
	connect<TResult = unknown>(
		path: string,
		options: VoiceConnectionOptions = {}
	) {
		const stream = createVoiceStream<TResult>(path, options);
		const assistantAudioSignal = signal<typeof stream.assistantAudio>([]);
		const assistantTextsSignal = signal<string[]>([]);
		const callSignal = signal<typeof stream.call>(null);
		const errorSignal = signal<string | null>(null);
		const isConnectedSignal = signal(false);
		const partialSignal = signal('');
		const reconnectSignal = signal(stream.reconnect);
		const sessionIdSignal = signal(stream.sessionId);
		const statusSignal = signal(stream.status);
		const turnsSignal = signal<VoiceTurnRecord<TResult>[]>([]);

		const sync = () => {
			assistantAudioSignal.set([...stream.assistantAudio]);
			assistantTextsSignal.set([...stream.assistantTexts]);
			callSignal.set(stream.call);
			errorSignal.set(stream.error);
			isConnectedSignal.set(stream.isConnected);
			partialSignal.set(stream.partial);
			reconnectSignal.set(stream.reconnect);
			sessionIdSignal.set(stream.sessionId);
			statusSignal.set(stream.status);
			turnsSignal.set([...stream.turns]);
		};

		const unsubscribe = stream.subscribe(sync);
		sync();

		return {
			assistantAudio: computed(() => assistantAudioSignal()),
			assistantTexts: computed(() => assistantTextsSignal()),
			call: computed(() => callSignal()),
			callControl: (message: Parameters<typeof stream.callControl>[0]) =>
				stream.callControl(message),
			close: () => {
				unsubscribe();
				stream.close();
			},
			endTurn: () => stream.endTurn(),
			error: computed(() => errorSignal()),
			isConnected: computed(() => isConnectedSignal()),
			partial: computed(() => partialSignal()),
			reconnect: computed(() => reconnectSignal()),
			sendAudio: (audio: Uint8Array | ArrayBuffer) =>
				stream.sendAudio(audio),
			sessionId: computed(() => sessionIdSignal()),
			status: computed(() => statusSignal()),
			turns: computed(() => turnsSignal())
		};
	}
}
