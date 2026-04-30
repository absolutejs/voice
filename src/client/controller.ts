import { bindVoiceHTMX } from './htmx';
import { createMicrophoneCapture } from './microphone';
import { createVoiceStream } from './createVoiceStream';
import { resolveVoiceRuntimePreset } from '../presets';
import type {
	VoiceController,
	VoiceControllerOptions,
	VoiceControllerState,
	VoiceHTMXBindingOptions
} from '../types';

const createInitialState = <TResult,>(
	stream: ReturnType<typeof createVoiceStream<TResult>>
): VoiceControllerState<TResult> => ({
	assistantAudio: [...stream.assistantAudio],
	assistantTexts: [...stream.assistantTexts],
	call: stream.call,
	error: stream.error,
	isConnected: stream.isConnected,
	isRecording: false,
	partial: stream.partial,
	reconnect: stream.reconnect,
	recordingError: null,
	sessionId: stream.sessionId,
	scenarioId: stream.scenarioId,
	status: stream.status,
	turns: [...stream.turns]
});

export const createVoiceController = <TResult = unknown>(
	path: string,
	options: VoiceControllerOptions = {}
): VoiceController<TResult> => {
	const preset = resolveVoiceRuntimePreset(options.preset);
	const stream = createVoiceStream<TResult>(path, {
		...preset.connection,
		...options.connection
	});
	let capture: ReturnType<typeof createMicrophoneCapture> | null = null;
	let state = createInitialState(stream);
	const subscribers = new Set<() => void>();

	const notify = () => {
		for (const subscriber of subscribers) {
			subscriber();
		}
	};

	const sync = () => {
		state = {
			...state,
			assistantAudio: [...stream.assistantAudio],
			assistantTexts: [...stream.assistantTexts],
			call: stream.call,
			error: stream.error,
			isConnected: stream.isConnected,
			partial: stream.partial,
			reconnect: stream.reconnect,
			sessionId: stream.sessionId,
			scenarioId: stream.scenarioId,
			status: stream.status,
			turns: [...stream.turns]
		};

		if (
			options.autoStopOnComplete !== false &&
			state.status === 'completed' &&
			state.isRecording
		) {
			capture?.stop();
			capture = null;
			state = {
				...state,
				isRecording: false
			};
		}

		notify();
	};

	const unsubscribeStream = stream.subscribe(sync);
	sync();

	const ensureCapture = () => {
		if (capture) {
			return capture;
		}

		capture = createMicrophoneCapture({
			channelCount:
				options.capture?.channelCount ?? preset.capture.channelCount,
			onLevel: options.capture?.onLevel,
			onAudio: (audio) => {
				if (options.capture?.onAudio) {
					options.capture.onAudio(audio, stream.sendAudio);
					return;
				}

				stream.sendAudio(audio);
			},
			sampleRateHz:
				options.capture?.sampleRateHz ?? preset.capture.sampleRateHz
		});

		return capture;
	};

	const stopRecording = () => {
		capture?.stop();
		capture = null;
		state = {
			...state,
			isRecording: false
		};
		notify();
	};

	const startRecording = async () => {
		if (state.isRecording) {
			return;
		}

		try {
			state = {
				...state,
				recordingError: null
			};
			notify();
			await ensureCapture().start();
			state = {
				...state,
				isRecording: true
			};
			notify();
		} catch (error) {
			capture = null;
			state = {
				...state,
				isRecording: false,
				recordingError:
					error instanceof Error ? error.message : String(error)
			};
			notify();
			throw error;
		}
	};

	const close = () => {
		unsubscribeStream();
		stopRecording();
		stream.close();
	};

	return {
		bindHTMX(bindingOptions: VoiceHTMXBindingOptions) {
			return bindVoiceHTMX(stream, bindingOptions);
		},
		callControl: (message) => stream.callControl(message),
		close,
		endTurn: () => stream.endTurn(),
		get error() {
			return state.error;
		},
		getServerSnapshot: () => state,
		getSnapshot: () => state,
		get isConnected() {
			return state.isConnected;
		},
		get isRecording() {
			return state.isRecording;
		},
		get partial() {
			return state.partial;
		},
		get recordingError() {
			return state.recordingError;
		},
		get reconnect() {
			return state.reconnect;
		},
		sendAudio: (audio) => stream.sendAudio(audio),
		get sessionId() {
			return state.sessionId;
		},
		get scenarioId() {
			return state.scenarioId;
		},
		startRecording,
		get status() {
			return state.status;
		},
		stopRecording,
		subscribe: (subscriber) => {
			subscribers.add(subscriber);

			return () => {
				subscribers.delete(subscriber);
			};
		},
		toggleRecording: async () => {
			if (state.isRecording) {
				stopRecording();
				return;
			}

			await startRecording();
		},
		get turns() {
			return state.turns;
		},
		get assistantTexts() {
			return state.assistantTexts;
		},
		get assistantAudio() {
			return state.assistantAudio;
		},
		get call() {
			return state.call;
		}
	} as VoiceController<TResult> & {
		bindHTMX: (bindingOptions: VoiceHTMXBindingOptions) => () => void;
	};
};
