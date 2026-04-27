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
		'partial' | 'sendAudio' | 'sessionId' | 'subscribe'
	>,
	player: Pick<
		VoiceAudioPlayer,
		| 'interrupt'
		| 'isPlaying'
		| 'lastInterruptLatencyMs'
		| 'lastPlaybackStopLatencyMs'
	>,
	options: VoiceBargeInOptions = {}
): VoiceBargeInBinding => {
	let lastPartial = controller.partial;

	const interruptIfPlaying = (reason: Parameters<NonNullable<VoiceBargeInOptions['monitor']>['recordRequested']>[0]['reason']) => {
		if (!player.isPlaying || options.enabled === false) {
			options.monitor?.recordSkipped({
				reason,
				sessionId: controller.sessionId
			});
			return;
		}

		options.monitor?.recordRequested({
			reason,
			sessionId: controller.sessionId
		});
		void player.interrupt().then(() => {
			options.monitor?.recordStopped({
				latencyMs: player.lastInterruptLatencyMs,
				playbackStopLatencyMs: player.lastPlaybackStopLatencyMs,
				reason,
				sessionId: controller.sessionId
			});
		});
	};

	const unsubscribe = controller.subscribe(() => {
		if (options.interruptOnPartial === false) {
			lastPartial = controller.partial;
			return;
		}

		if (!lastPartial && controller.partial) {
			interruptIfPlaying('partial-transcript');
		}

		lastPartial = controller.partial;
	});

	return {
		close: () => {
			unsubscribe();
		},
		handleLevel: (level) => {
			if (shouldInterruptForLevel(level, options)) {
				interruptIfPlaying('input-level');
			}
		},
		sendAudio: (audio) => {
			interruptIfPlaying('manual-audio');
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
			options.bargeIn?.monitor?.recordRequested({
				reason: 'manual-interrupt',
				sessionId: controller.sessionId
			});
			await audioPlayer.interrupt();
			options.bargeIn?.monitor?.recordStopped({
				latencyMs: audioPlayer.lastInterruptLatencyMs,
				playbackStopLatencyMs: audioPlayer.lastPlaybackStopLatencyMs,
				reason: 'manual-interrupt',
				sessionId: controller.sessionId
			});
		},
		sendAudio: (audio) => {
			bargeInBinding?.sendAudio(audio);
		}
	};
};
