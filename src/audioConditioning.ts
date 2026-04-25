import type {
	AudioChunk,
	VoiceAudioConditioningConfig,
	VoiceResolvedAudioConditioningConfig
} from './types';

const DEFAULT_TARGET_LEVEL = 0.08;
const DEFAULT_MAX_GAIN = 3;
const DEFAULT_NOISE_GATE_THRESHOLD = 0.006;
const DEFAULT_NOISE_GATE_ATTENUATION = 0.15;

const toInt16Array = (audio: AudioChunk) => {
	if (audio instanceof ArrayBuffer) {
		return new Int16Array(audio, 0, Math.floor(audio.byteLength / 2));
	}

	return new Int16Array(
		audio.buffer,
		audio.byteOffset,
		Math.floor(audio.byteLength / 2)
	);
};

const computeRms = (samples: Int16Array) => {
	if (samples.length === 0) {
		return 0;
	}

	let sumSquares = 0;
	for (const sample of samples) {
		const normalized = sample / 0x8000;
		sumSquares += normalized * normalized;
	}

	return Math.sqrt(sumSquares / samples.length);
};

export const resolveAudioConditioningConfig = (
	config?: VoiceAudioConditioningConfig
): VoiceResolvedAudioConditioningConfig | undefined => {
	if (!config || config.enabled === false) {
		return undefined;
	}

	return {
		enabled: true,
		maxGain: config.maxGain ?? DEFAULT_MAX_GAIN,
		noiseGateAttenuation:
			config.noiseGateAttenuation ?? DEFAULT_NOISE_GATE_ATTENUATION,
		noiseGateThreshold:
			config.noiseGateThreshold ?? DEFAULT_NOISE_GATE_THRESHOLD,
		targetLevel: config.targetLevel ?? DEFAULT_TARGET_LEVEL
	};
};

export const conditionAudioChunk = (
	audio: AudioChunk,
	config?: VoiceResolvedAudioConditioningConfig
): AudioChunk => {
	if (!config) {
		return audio;
	}

	const source = toInt16Array(audio);
	if (source.length === 0) {
		return audio;
	}

	const rms = computeRms(source);
	const output = new Int16Array(source.length);
	const gateFactor =
		rms < config.noiseGateThreshold ? config.noiseGateAttenuation : 1;
	const baseLevel = Math.max(rms * gateFactor, 1e-6);
	const gain = Math.min(config.maxGain, config.targetLevel / baseLevel);
	const appliedGain = Math.max(0.25, gain) * gateFactor;

	for (let index = 0; index < source.length; index += 1) {
		const next = Math.round(source[index]! * appliedGain);
		output[index] = Math.max(-0x8000, Math.min(0x7fff, next));
	}

	return new Uint8Array(output.buffer);
};
