import { createVoiceAudioPlayer } from './audioPlayer';
import { createVoiceController } from './controller';
import type {
	VoiceAudioPlayer,
	VoiceBargeInBinding,
	VoiceBargeInOptions,
	VoiceController,
	VoiceDuplexController,
	VoiceDuplexControllerOptions
} from '../types';

const DEFAULT_INTERRUPT_THRESHOLD = 0.08;

const shouldInterruptForLevel = (
	level: number,
	options: VoiceBargeInOptions = {}
) =>
	(options.enabled ?? true) &&
	level >= (options.interruptThreshold ?? DEFAULT_INTERRUPT_THRESHOLD);

export const bindVoiceBargeIn = <TResult = unknown>(
	controller: Pick<
		VoiceController<TResult>,
		'partial' | 'sendAudio' | 'subscribe'
	>,
	player: Pick<VoiceAudioPlayer, 'interrupt' | 'isPlaying'>,
	options: VoiceBargeInOptions = {}
): VoiceBargeInBinding => {
	let lastPartial = controller.partial;

	const interruptIfPlaying = () => {
		if (!player.isPlaying || options.enabled === false) {
			return;
		}

		void player.interrupt();
	};

	const unsubscribe = controller.subscribe(() => {
		if (options.interruptOnPartial === false) {
			lastPartial = controller.partial;
			return;
		}

		if (!lastPartial && controller.partial) {
			interruptIfPlaying();
		}

		lastPartial = controller.partial;
	});

	return {
		close: () => {
			unsubscribe();
		},
		handleLevel: (level) => {
			if (shouldInterruptForLevel(level, options)) {
				interruptIfPlaying();
			}
		},
		sendAudio: (audio) => {
			interruptIfPlaying();
			controller.sendAudio(audio);
		}
	};
};

export const createVoiceDuplexController = <TResult = unknown>(
	path: string,
	options: VoiceDuplexControllerOptions = {}
): VoiceDuplexController<TResult> => {
	let bargeInBinding: VoiceBargeInBinding | null = null;

	const controller = createVoiceController<TResult>(path, {
		...options,
		capture: {
			...options.capture,
			onLevel: (level) => {
				bargeInBinding?.handleLevel(level);
				options.capture?.onLevel?.(level);
			}
		}
	});
	const audioPlayer = createVoiceAudioPlayer(controller, options.audioPlayer);
	bargeInBinding = bindVoiceBargeIn(
		controller,
		audioPlayer,
		options.bargeIn
	);

	const close = () => {
		bargeInBinding?.close();
		bargeInBinding = null;
		void audioPlayer.close();
		controller.close();
	};

	return {
		...controller,
		audioPlayer,
		close,
		interruptAssistant: async () => {
			await audioPlayer.interrupt();
		},
		sendAudio: (audio) => {
			bargeInBinding?.sendAudio(audio);
		}
	};
};
