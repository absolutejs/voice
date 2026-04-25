import { resolveAudioConditioningConfig } from './audioConditioning';
import { resolveTurnDetectionConfig } from './turnProfiles';
import type {
	VoiceAudioConditioningConfig,
	VoiceCaptureOptions,
	VoiceConnectionOptions,
	VoiceResolvedAudioConditioningConfig,
	VoiceResolvedTurnDetectionConfig,
	VoiceRuntimePreset,
	VoiceSTTLifecycle,
	VoiceTurnDetectionConfig
} from './types';

type VoiceRuntimePresetInput = {
	audioConditioning?: VoiceAudioConditioningConfig;
	capture?: VoiceCaptureOptions;
	connection?: VoiceConnectionOptions;
	sttLifecycle?: VoiceSTTLifecycle;
	turnDetection: VoiceTurnDetectionConfig;
};

export type VoiceResolvedRuntimePreset = {
	audioConditioning?: VoiceResolvedAudioConditioningConfig;
	capture: {
		channelCount: NonNullable<VoiceCaptureOptions['channelCount']>;
		sampleRateHz: NonNullable<VoiceCaptureOptions['sampleRateHz']>;
	};
	connection: VoiceConnectionOptions;
	name: VoiceRuntimePreset;
	sttLifecycle: VoiceSTTLifecycle;
	turnDetection: VoiceResolvedTurnDetectionConfig;
};

const PRESET_INPUTS: Record<VoiceRuntimePreset, VoiceRuntimePresetInput> = {
	chat: {
		audioConditioning: {
			enabled: true,
			maxGain: 2.5,
			noiseGateAttenuation: 0,
			noiseGateThreshold: 0.004,
			targetLevel: 0.08
		},
		capture: {
			channelCount: 1,
			sampleRateHz: 16_000
		},
		connection: {
			maxReconnectAttempts: 10,
			pingInterval: 30_000,
			reconnect: true
		},
		sttLifecycle: 'continuous',
		turnDetection: {
			qualityProfile: 'short-command',
			profile: 'balanced'
		}
	},
	default: {
		capture: {
			channelCount: 1,
			sampleRateHz: 16_000
		},
		connection: {
			maxReconnectAttempts: 10,
			pingInterval: 30_000,
			reconnect: true
		},
		sttLifecycle: 'continuous',
		turnDetection: {
			qualityProfile: 'general',
			profile: 'fast'
		}
	},
	dictation: {
		audioConditioning: {
			enabled: true,
			maxGain: 2.25,
			noiseGateAttenuation: 0.05,
			noiseGateThreshold: 0.003,
			targetLevel: 0.08
		},
		capture: {
			channelCount: 1,
			sampleRateHz: 16_000
		},
		connection: {
			maxReconnectAttempts: 12,
			pingInterval: 30_000,
			reconnect: true
		},
		sttLifecycle: 'continuous',
		turnDetection: {
			qualityProfile: 'accent-heavy',
			profile: 'long-form'
		}
	},
	'guided-intake': {
		audioConditioning: {
			enabled: true,
			maxGain: 2.5,
			noiseGateAttenuation: 0,
			noiseGateThreshold: 0.004,
			targetLevel: 0.08
		},
		capture: {
			channelCount: 1,
			sampleRateHz: 16_000
		},
		connection: {
			maxReconnectAttempts: 12,
			pingInterval: 30_000,
			reconnect: true
		},
		sttLifecycle: 'turn-scoped',
		turnDetection: {
			qualityProfile: 'accent-heavy',
			profile: 'long-form'
		}
	},
	'noisy-room': {
		audioConditioning: {
			enabled: true,
			maxGain: 3,
			noiseGateAttenuation: 0.12,
			noiseGateThreshold: 0.006,
			targetLevel: 0.085
		},
		capture: {
			channelCount: 1,
			sampleRateHz: 16_000
		},
		connection: {
			maxReconnectAttempts: 14,
			pingInterval: 45_000,
			reconnect: true
		},
		sttLifecycle: 'continuous',
		turnDetection: {
			qualityProfile: 'noisy-room',
			profile: 'long-form',
			silenceMs: 2_100,
			speechThreshold: 0.02,
			transcriptStabilityMs: 1_650
		}
	},
	'pstn-balanced': {
		audioConditioning: {
			enabled: true,
			maxGain: 2.8,
			noiseGateAttenuation: 0.07,
			noiseGateThreshold: 0.005,
			targetLevel: 0.08
		},
		capture: {
			channelCount: 1,
			sampleRateHz: 16_000
		},
		connection: {
			maxReconnectAttempts: 14,
			pingInterval: 45_000,
			reconnect: true
		},
		sttLifecycle: 'continuous',
		turnDetection: {
			qualityProfile: 'noisy-room',
			profile: 'long-form',
			silenceMs: 660,
			speechThreshold: 0.012,
			transcriptStabilityMs: 300
		}
	},
	'pstn-fast': {
		audioConditioning: {
			enabled: true,
			maxGain: 2.75,
			noiseGateAttenuation: 0.06,
			noiseGateThreshold: 0.005,
			targetLevel: 0.08
		},
		capture: {
			channelCount: 1,
			sampleRateHz: 16_000
		},
		connection: {
			maxReconnectAttempts: 14,
			pingInterval: 45_000,
			reconnect: true
		},
		sttLifecycle: 'continuous',
		turnDetection: {
			qualityProfile: 'noisy-room',
			profile: 'long-form',
			silenceMs: 620,
			speechThreshold: 0.012,
			transcriptStabilityMs: 280
		}
	},
	reliability: {
		audioConditioning: {
			enabled: true,
			maxGain: 2.9,
			noiseGateAttenuation: 0.08,
			noiseGateThreshold: 0.005,
			targetLevel: 0.08
		},
		capture: {
			channelCount: 1,
			sampleRateHz: 16_000
		},
		connection: {
			maxReconnectAttempts: 14,
			pingInterval: 45_000,
			reconnect: true
		},
		sttLifecycle: 'continuous',
		turnDetection: {
			qualityProfile: 'noisy-room',
			profile: 'long-form'
		}
	}
};

export const resolveVoiceRuntimePreset = (
	name: VoiceRuntimePreset = 'default'
): VoiceResolvedRuntimePreset => {
	const preset = PRESET_INPUTS[name];

	return {
		audioConditioning: resolveAudioConditioningConfig(preset.audioConditioning),
		capture: {
			channelCount: preset.capture?.channelCount ?? 1,
			sampleRateHz: preset.capture?.sampleRateHz ?? 16_000
		},
		connection: {
			...preset.connection
		},
		name,
		sttLifecycle: preset.sttLifecycle ?? 'continuous',
		turnDetection: resolveTurnDetectionConfig(preset.turnDetection)
	};
};
