import { onUnmounted, ref, shallowRef } from 'vue';
import { createVoiceStream } from '../client/createVoiceStream';
import type {
	VoiceConnectionOptions,
	VoiceTurnRecord
} from '../types';

export function useVoiceStream<TResult = unknown>(
	path: string,
	options: VoiceConnectionOptions = {}
) {
	const stream = createVoiceStream<TResult>(path, options);
	const assistantAudio = shallowRef<typeof stream.assistantAudio>([]);
	const assistantTexts = shallowRef<string[]>([]);
	const call = shallowRef<typeof stream.call>(null);
	const error = ref<string | null>(null);
	const isConnected = ref(false);
	const partial = ref('');
	const reconnect = shallowRef(stream.reconnect);
	const sessionId = ref(stream.sessionId);
	const sessionMetadata = shallowRef(stream.sessionMetadata);
	const status = ref(stream.status);
	const turns = shallowRef<VoiceTurnRecord<TResult>[]>([]);

	const sync = () => {
		assistantAudio.value = [...stream.assistantAudio];
		assistantTexts.value = [...stream.assistantTexts];
		call.value = stream.call;
		error.value = stream.error;
		isConnected.value = stream.isConnected;
		partial.value = stream.partial;
		reconnect.value = stream.reconnect;
		sessionId.value = stream.sessionId;
		sessionMetadata.value = stream.sessionMetadata;
		status.value = stream.status;
		turns.value = [...stream.turns];
	};

	const unsubscribe = stream.subscribe(sync);
	sync();

	const destroy = () => {
		unsubscribe();
		stream.close();
	};

	onUnmounted(destroy);

	return {
		assistantAudio,
		assistantTexts,
		call,
		callControl: (message: Parameters<typeof stream.callControl>[0]) =>
			stream.callControl(message),
		close: () => destroy(),
		endTurn: () => stream.endTurn(),
		error,
		isConnected,
		partial,
		reconnect,
		sendAudio: (audio: Uint8Array | ArrayBuffer) => stream.sendAudio(audio),
		sessionId,
		sessionMetadata,
		status,
		turns
	};
};
