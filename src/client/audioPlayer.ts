import type {
	AudioFormat,
	VoiceAudioPlayer,
	VoiceAudioPlayerOptions,
	VoiceAudioPlayerSource,
	VoiceAudioPlayerState,
	VoiceStreamState
} from '../types';

const DEFAULT_LOOKAHEAD_MS = 15;

type VoiceAudioChunk = VoiceStreamState['assistantAudio'][number];

type MinimalAudioBuffer = {
	duration: number;
	getChannelData: (channel: number) => Float32Array;
};

type MinimalAudioBufferSourceNode = {
	buffer: MinimalAudioBuffer | null;
	connect: (destination: unknown) => void;
	disconnect?: () => void;
	onended: (() => void) | null;
	start: (when?: number) => void;
	stop?: () => void;
};

type MinimalGainNode = {
	connect?: (destination: unknown) => void;
	disconnect?: () => void;
	gain: {
		setValueAtTime?: (value: number, time: number) => void;
		value: number;
	};
};

type MinimalAudioContext = {
	baseLatency?: number;
	close: () => Promise<void>;
	createBuffer: (
		numberOfChannels: number,
		length: number,
		sampleRate: number
	) => MinimalAudioBuffer;
	createBufferSource: () => MinimalAudioBufferSourceNode;
	createGain?: () => MinimalGainNode;
	currentTime: number;
	destination: unknown;
	outputLatency?: number;
	resume: () => Promise<void>;
	state: 'closed' | 'running' | 'suspended';
	suspend: () => Promise<void>;
};

type WindowWithWebkitAudioContext = Window &
	typeof globalThis & {
		webkitAudioContext?: typeof AudioContext;
	};

const createInitialState = (): VoiceAudioPlayerState => ({
	activeSourceCount: 0,
	error: null,
	isActive: false,
	isPlaying: false,
	lastInterruptLatencyMs: undefined,
	lastPlaybackStopLatencyMs: undefined,
	processedChunkCount: 0,
	queuedChunkCount: 0
});

const getAudioContextCtor = () => {
	if (typeof window === 'undefined') {
		return typeof AudioContext === 'undefined' ? undefined : AudioContext;
	}

	return (
		(window as WindowWithWebkitAudioContext).AudioContext ??
		(window as WindowWithWebkitAudioContext).webkitAudioContext
	);
};

const decodePCM16LEChunk = (
	audioContext: MinimalAudioContext,
	chunk: VoiceAudioChunk
) => {
	const format = chunk.format;
	if (format.container !== 'raw' || format.encoding !== 'pcm_s16le') {
		throw new Error(
			`Unsupported assistant audio format: ${format.container}/${format.encoding}`
		);
	}

	const bytes = chunk.chunk;
	const channels = Math.max(1, format.channels);
	const sampleCount = Math.floor(bytes.byteLength / 2);
	const frameCount = Math.max(1, Math.floor(sampleCount / channels));
	const audioBuffer = audioContext.createBuffer(
		channels,
		frameCount,
		format.sampleRateHz
	);
	const view = new DataView(
		bytes.buffer,
		bytes.byteOffset,
		bytes.byteLength
	);

	for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
		const channelData = audioBuffer.getChannelData(channelIndex);
		for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
			const sampleIndex = frameIndex * channels + channelIndex;
			const sampleOffset = sampleIndex * 2;
			if (sampleOffset + 1 >= bytes.byteLength) {
				channelData[frameIndex] = 0;
				continue;
			}

			channelData[frameIndex] = view.getInt16(sampleOffset, true) / 32_768;
		}
	}

	return audioBuffer;
};

export const createVoiceAudioPlayer = (
	source: VoiceAudioPlayerSource,
	options: VoiceAudioPlayerOptions = {}
): VoiceAudioPlayer => {
	const subscribers = new Set<() => void>();
	const sourceNodes = new Set<MinimalAudioBufferSourceNode>();
	const lookaheadSeconds = (options.lookaheadMs ?? DEFAULT_LOOKAHEAD_MS) / 1_000;

	let state = createInitialState();
	let audioContext: MinimalAudioContext | null = null;
	let outputNode: MinimalGainNode | null = null;
	let queueEndTime = 0;
	let syncPromise = Promise.resolve();
	let interruptStartedAt: number | null = null;
	let interruptPromise: Promise<void> | null = null;
	let resolveInterruptPromise: (() => void) | null = null;
	let interruptFallbackTimer: ReturnType<typeof setTimeout> | null = null;

	const notify = () => {
		for (const subscriber of subscribers) {
			subscriber();
		}
	};

	const setState = (next: Partial<VoiceAudioPlayerState>) => {
		state = {
			...state,
			...next
		};
		notify();
	};

	const clearError = () => {
		if (state.error !== null) {
			setState({ error: null });
		}
	};

	const clearInterruptTimer = () => {
		if (interruptFallbackTimer !== null) {
			clearTimeout(interruptFallbackTimer);
			interruptFallbackTimer = null;
		}
	};

	const resolveInterrupt = (latencyMs: number) => {
		clearInterruptTimer();
		interruptStartedAt = null;
		setState({
			activeSourceCount: sourceNodes.size,
			isPlaying: false,
			lastInterruptLatencyMs: latencyMs,
			lastPlaybackStopLatencyMs:
				state.lastPlaybackStopLatencyMs ?? latencyMs
		});
		resolveInterruptPromise?.();
		resolveInterruptPromise = null;
		interruptPromise = null;
	};

	const estimateOutputStopLatencyMs = (context: MinimalAudioContext | null) => {
		if (!context) {
			return 0;
		}

		return Math.max(
			0,
			((context.baseLatency ?? 0) + (context.outputLatency ?? 0)) * 1_000
		);
	};

	const restoreOutputGain = (context: MinimalAudioContext | null) => {
		if (!outputNode) {
			return;
		}

		const gainValue = 1;
		if (outputNode.gain.setValueAtTime) {
			outputNode.gain.setValueAtTime(gainValue, context?.currentTime ?? 0);
			return;
		}

		outputNode.gain.value = gainValue;
	};

	const muteOutputGain = (context: MinimalAudioContext | null) => {
		if (!outputNode) {
			return;
		}

		const gainValue = 0;
		if (outputNode.gain.setValueAtTime) {
			outputNode.gain.setValueAtTime(gainValue, context?.currentTime ?? 0);
			return;
		}

		outputNode.gain.value = gainValue;
	};

	const maybeResolveInterrupt = () => {
		if (interruptStartedAt === null || sourceNodes.size > 0) {
			return;
		}

		resolveInterrupt(Date.now() - interruptStartedAt);
	};

	const ensureAudioContext = async () => {
		if (audioContext) {
			return audioContext;
		}

		if (options.createAudioContext) {
			audioContext = options.createAudioContext() as unknown as MinimalAudioContext;
		} else {
			const AudioContextCtor = getAudioContextCtor();
			if (!AudioContextCtor) {
				throw new Error(
					'Assistant audio playback requires AudioContext support.'
				);
			}

			audioContext = new AudioContextCtor() as unknown as MinimalAudioContext;
		}

		if (audioContext.createGain) {
			outputNode = audioContext.createGain();
			outputNode.connect?.(audioContext.destination);
		}

		queueEndTime = audioContext.currentTime;
		return audioContext;
	};

	const scheduleChunk = async (chunk: VoiceAudioChunk) => {
		const context = await ensureAudioContext();
		const buffer = decodePCM16LEChunk(context, chunk);
		const node = context.createBufferSource();
		node.buffer = buffer;
		node.connect(outputNode ?? context.destination);
		node.onended = () => {
			sourceNodes.delete(node);
			node.disconnect?.();
			setState({
				activeSourceCount: sourceNodes.size,
				isPlaying: sourceNodes.size > 0 && state.isActive
			});
			maybeResolveInterrupt();
		};

		const startAt = Math.max(context.currentTime + lookaheadSeconds, queueEndTime);
		queueEndTime = startAt + buffer.duration;
		sourceNodes.add(node);
		setState({
			activeSourceCount: sourceNodes.size,
			isPlaying: true
		});
		node.start(startAt);
	};

	const stopQueuedPlayback = (options?: { forceClear?: boolean }) => {
		for (const node of [...sourceNodes]) {
			node.stop?.();
		}
		queueEndTime = audioContext ? audioContext.currentTime : 0;

		if (options?.forceClear) {
			for (const node of sourceNodes) {
				node.disconnect?.();
			}
			sourceNodes.clear();
			maybeResolveInterrupt();
		}
	};

	const sync = async () => {
		if (!state.isActive) {
			return;
		}

		const nextChunks = source.assistantAudio.slice(state.processedChunkCount);
		if (nextChunks.length === 0) {
			return;
		}

		try {
			clearError();
			for (const chunk of nextChunks) {
				await scheduleChunk(chunk);
			}

			setState({
				processedChunkCount: source.assistantAudio.length,
				queuedChunkCount: state.queuedChunkCount + nextChunks.length
			});
		} catch (error) {
			setState({
				error: error instanceof Error ? error.message : String(error)
			});
		}
	};

	const queueSync = () => {
		syncPromise = syncPromise.then(() => sync(), () => sync());
		return syncPromise;
	};

	const unsubscribeSource = source.subscribe(() => {
		if (options.autoStart && !state.isActive && source.assistantAudio.length > 0) {
			void player.start();
			return;
		}

		if (state.isActive) {
			void queueSync();
		}
	});

	const player: VoiceAudioPlayer = {
		close: async () => {
			unsubscribeSource();
			stopQueuedPlayback({ forceClear: true });
			clearInterruptTimer();
			resolveInterruptPromise?.();
			resolveInterruptPromise = null;
			interruptPromise = null;
			interruptStartedAt = null;

			if (audioContext && audioContext.state !== 'closed') {
				await audioContext.close();
			}

			audioContext = null;
			outputNode?.disconnect?.();
			outputNode = null;
			queueEndTime = 0;
			setState({
				activeSourceCount: 0,
				isActive: false,
				isPlaying: false
			});
		},
		get activeSourceCount() {
			return state.activeSourceCount;
		},
		get error() {
			return state.error;
		},
		getSnapshot: () => state,
		get isActive() {
			return state.isActive;
		},
		get isPlaying() {
			return state.isPlaying;
		},
		interrupt: async () => {
			const startedAt = Date.now();
			const context = await ensureAudioContext();
			interruptStartedAt = startedAt;
			muteOutputGain(context);
			const playbackStopLatencyMs =
				Date.now() -
				startedAt +
				estimateOutputStopLatencyMs(context);
			setState({
				isActive: false,
				isPlaying: sourceNodes.size > 0,
				lastPlaybackStopLatencyMs: playbackStopLatencyMs
			});

			if (sourceNodes.size === 0) {
				resolveInterrupt(playbackStopLatencyMs);
				return;
			}

			if (!interruptPromise) {
				interruptPromise = new Promise<void>((resolve) => {
					resolveInterruptPromise = resolve;
				});
			}

			clearInterruptTimer();
			interruptFallbackTimer = setTimeout(() => {
				for (const node of sourceNodes) {
					node.disconnect?.();
				}
				sourceNodes.clear();
				resolveInterrupt(Date.now() - startedAt);
			}, 250);

			stopQueuedPlayback();
			await interruptPromise;
		},
		get lastInterruptLatencyMs() {
			return state.lastInterruptLatencyMs;
		},
		get lastPlaybackStopLatencyMs() {
			return state.lastPlaybackStopLatencyMs;
		},
		pause: async () => {
			if (!audioContext) {
				setState({
					activeSourceCount: 0,
					isActive: false,
					isPlaying: false
				});
				return;
			}

			await audioContext.suspend();
			setState({
				activeSourceCount: sourceNodes.size,
				isActive: false,
				isPlaying: false
			});
		},
		get processedChunkCount() {
			return state.processedChunkCount;
		},
		get queuedChunkCount() {
			return state.queuedChunkCount;
		},
		start: async () => {
			try {
				clearError();
				const context = await ensureAudioContext();
				restoreOutputGain(context);
				if (context.state === 'suspended') {
					await context.resume();
				}

				setState({
					activeSourceCount: sourceNodes.size,
					isActive: true,
					isPlaying: context.state === 'running'
				});
				await queueSync();
			} catch (error) {
				setState({
					error: error instanceof Error ? error.message : String(error),
					isActive: false,
					isPlaying: false
				});
				throw error;
			}
		},
		subscribe: (subscriber) => {
			subscribers.add(subscriber);

			return () => {
				subscribers.delete(subscriber);
			};
		}
	};

	return player;
};

export const decodeVoiceAudioChunk = (
	audioContext: Pick<
		MinimalAudioContext,
		'createBuffer'
	>,
	chunk: {
		chunk: Uint8Array;
		format: AudioFormat;
	}
) => decodePCM16LEChunk(audioContext as MinimalAudioContext, chunk as VoiceAudioChunk);
