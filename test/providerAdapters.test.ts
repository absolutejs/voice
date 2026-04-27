import { expect, test } from 'bun:test';
import {
	createVoiceSTTProviderRouter,
	createVoiceTTSProviderRouter,
	resolveVoiceProviderRoutingPolicyPreset
} from '../src';
import type {
	STTAdapter,
	STTSessionEventMap,
	TTSAdapter,
	TTSSessionEventMap
} from '../src/types';

type STTListenerMap = {
	[K in keyof STTSessionEventMap]: Array<
		(payload: STTSessionEventMap[K]) => void | Promise<void>
	>;
};

type TTSListenerMap = {
	[K in keyof TTSSessionEventMap]: Array<
		(payload: TTSSessionEventMap[K]) => void | Promise<void>
	>;
};

const createSTTSession = () => {
	const listeners: STTListenerMap = {
		close: [],
		endOfTurn: [],
		error: [],
		final: [],
		partial: []
	};
	return {
		close: async () => {},
		on: (event, handler) => {
			listeners[event].push(handler as never);
			return () => {};
		},
		send: async () => {}
	} satisfies ReturnType<STTAdapter['open']>;
};

const createTTSAdapter = (input: {
	onOpen?: () => Promise<void> | void;
	onSend?: (text: string) => Promise<void> | void;
}): TTSAdapter => ({
	kind: 'tts',
	open: async () => {
		await input.onOpen?.();
		const listeners: TTSListenerMap = {
			audio: [],
			close: [],
			error: []
		};
		return {
			close: async () => {},
			on: (event, handler) => {
				listeners[event].push(handler as never);
				return () => {};
			},
			send: async (text) => {
				await input.onSend?.(text);
				for (const listener of listeners.audio) {
					await listener({
						chunk: new Uint8Array([1, 2, 3]),
						format: {
							channels: 1,
							container: 'raw',
							encoding: 'pcm_s16le',
							sampleRateHz: 16000
						},
						receivedAt: Date.now(),
						type: 'audio'
					});
				}
			}
		};
	}
});

test('createVoiceSTTProviderRouter falls back when provider open fails', async () => {
	const calls: string[] = [];
	const events: Array<Record<string, unknown>> = [];
	const router = createVoiceSTTProviderRouter({
		adapters: {
			backup: {
				kind: 'stt',
				open: () => {
					calls.push('backup');
					return createSTTSession();
				}
			},
			primary: {
				kind: 'stt',
				open: () => {
					calls.push('primary');
					throw new Error('primary unavailable');
				}
			}
		},
		fallback: ['primary', 'backup'],
		onProviderEvent: (event) => {
			events.push(event);
		},
		selectProvider: () => 'primary'
	});

	await router.open({
		format: {
			channels: 1,
			container: 'raw',
			encoding: 'pcm_s16le',
			sampleRateHz: 16000
		},
		sessionId: 'stt-router'
	});

	expect(calls).toEqual(['primary', 'backup']);
	expect(events).toMatchObject([
		{
			attempt: 1,
			fallbackProvider: 'backup',
			kind: 'stt',
			operation: 'open',
			provider: 'primary',
			status: 'error'
		},
		{
			attempt: 2,
			fallbackProvider: 'backup',
			kind: 'stt',
			operation: 'open',
			provider: 'backup',
			status: 'fallback'
		}
	]);
});

test('createVoiceSTTProviderRouter suppresses unhealthy providers until cooldown expires', async () => {
	let currentTime = 1_000;
	const calls: string[] = [];
	const events: Array<Record<string, unknown>> = [];
	const router = createVoiceSTTProviderRouter({
		adapters: {
			backup: {
				kind: 'stt',
				open: () => {
					calls.push('backup');
					return createSTTSession();
				}
			},
			primary: {
				kind: 'stt',
				open: () => {
					calls.push('primary');
					if (calls.filter((call) => call === 'primary').length === 1) {
						throw new Error('primary unavailable');
					}
					return createSTTSession();
				}
			}
		},
		fallback: ['primary', 'backup'],
		onProviderEvent: (event) => {
			events.push(event);
		},
		providerHealth: {
			cooldownMs: 500,
			now: () => currentTime
		},
		selectProvider: () => 'primary'
	});

	const openInput = {
		format: {
			channels: 1 as const,
			container: 'raw' as const,
			encoding: 'pcm_s16le' as const,
			sampleRateHz: 16000
		},
		sessionId: 'stt-router-health'
	};

	await router.open(openInput);
	await router.open(openInput);
	currentTime = 1_501;
	await router.open(openInput);

	expect(calls).toEqual(['primary', 'backup', 'backup', 'primary']);
	expect(events[0]).toMatchObject({
		provider: 'primary',
		providerHealth: {
			consecutiveFailures: 1,
			status: 'suppressed',
			suppressedUntil: 1_500
		},
		suppressionRemainingMs: 500
	});
	expect(events.at(-1)).toMatchObject({
		provider: 'primary',
		providerHealth: {
			consecutiveFailures: 0,
			status: 'healthy'
		},
		status: 'success'
	});
});

test('createVoiceSTTProviderRouter ranks providers with quality policy', async () => {
	const calls: string[] = [];
	const router = createVoiceSTTProviderRouter({
		adapters: {
			accurate: {
				kind: 'stt',
				open: () => {
					calls.push('accurate');
					return createSTTSession();
				}
			},
			cheap: {
				kind: 'stt',
				open: () => {
					calls.push('cheap');
					return createSTTSession();
				}
			}
		},
		policy: 'quality-first',
		providerProfiles: {
			accurate: {
				cost: 6,
				latencyMs: 450,
				quality: 0.94
			},
			cheap: {
				cost: 1,
				latencyMs: 200,
				quality: 0.82
			}
		}
	});

	await router.open({
		format: {
			channels: 1,
			container: 'raw',
			encoding: 'pcm_s16le',
			sampleRateHz: 16000
		},
		sessionId: 'stt-router-quality'
	});

	expect(calls).toEqual(['accurate']);
});

test('createVoiceSTTProviderRouter applies policy budget filters before ranking', async () => {
	const calls: string[] = [];
	const router = createVoiceSTTProviderRouter({
		adapters: {
			cheap: {
				kind: 'stt',
				open: () => {
					calls.push('cheap');
					return createSTTSession();
				}
			},
			premium: {
				kind: 'stt',
				open: () => {
					calls.push('premium');
					return createSTTSession();
				}
			},
			standard: {
				kind: 'stt',
				open: () => {
					calls.push('standard');
					return createSTTSession();
				}
			}
		},
		policy: {
			maxCost: 5,
			minQuality: 0.8,
			strategy: 'quality-first'
		},
		providerProfiles: {
			cheap: {
				cost: 1,
				quality: 0.65
			},
			premium: {
				cost: 10,
				quality: 0.98
			},
			standard: {
				cost: 4,
				quality: 0.86
			}
		}
	});

	await router.open({
		format: {
			channels: 1,
			container: 'raw',
			encoding: 'pcm_s16le',
			sampleRateHz: 16000
		},
		sessionId: 'stt-router-budget'
	});

	expect(calls).toEqual(['standard']);
});

test('createVoiceTTSProviderRouter retries send on fallback provider', async () => {
	const sent: string[] = [];
	const events: Array<Record<string, unknown>> = [];
	const router = createVoiceTTSProviderRouter({
		adapters: {
			backup: createTTSAdapter({
				onSend: (text) => {
					sent.push(`backup:${text}`);
				}
			}),
			primary: createTTSAdapter({
				onSend: () => {
					sent.push('primary');
					throw new Error('tts send failed');
				}
			})
		},
		fallback: ['primary', 'backup'],
		onProviderEvent: (event) => {
			events.push(event);
		},
		selectProvider: () => 'primary'
	});

	const session = await router.open({
		sessionId: 'tts-router'
	});
	await session.send('hello');

	expect(sent).toEqual(['primary', 'backup:hello']);
	expect(events).toMatchObject([
		{
			kind: 'tts',
			operation: 'open',
			provider: 'primary',
			status: 'success'
		},
		{
			fallbackProvider: 'backup',
			kind: 'tts',
			operation: 'send',
			provider: 'primary',
			status: 'error'
		},
		{
			fallbackProvider: 'backup',
			kind: 'tts',
			operation: 'open',
			provider: 'backup',
			status: 'fallback'
		}
	]);
});

test('createVoiceTTSProviderRouter skips suppressed provider on later sessions', async () => {
	const calls: string[] = [];
	const router = createVoiceTTSProviderRouter({
		adapters: {
			backup: createTTSAdapter({
				onOpen: () => {
					calls.push('backup');
				}
			}),
			primary: createTTSAdapter({
				onOpen: () => {
					calls.push('primary');
					throw new Error('tts open failed');
				}
			})
		},
		fallback: ['primary', 'backup'],
		providerHealth: {
			cooldownMs: 1_000,
			now: () => 1_000
		},
		selectProvider: () => 'primary'
	});

	await router.open({
		sessionId: 'tts-router-health-1'
	});
	await router.open({
		sessionId: 'tts-router-health-2'
	});

	expect(calls).toEqual(['primary', 'backup', 'backup']);
});

test('createVoiceTTSProviderRouter ranks providers with latency policy', async () => {
	const calls: string[] = [];
	const router = createVoiceTTSProviderRouter({
		adapters: {
			fast: createTTSAdapter({
				onOpen: () => {
					calls.push('fast');
				}
			}),
			slow: createTTSAdapter({
				onOpen: () => {
					calls.push('slow');
				}
			})
		},
		policy: resolveVoiceProviderRoutingPolicyPreset('latency-first'),
		providerProfiles: {
			fast: {
				latencyMs: 80
			},
			slow: {
				latencyMs: 1_000
			}
		}
	});

	await router.open({
		sessionId: 'tts-router-latency'
	});

	expect(calls).toEqual(['fast']);
});

test('createVoiceTTSProviderRouter applies cost-cap policy', async () => {
	const calls: string[] = [];
	const router = createVoiceTTSProviderRouter({
		adapters: {
			cheap: createTTSAdapter({
				onOpen: () => {
					calls.push('cheap');
				}
			}),
			premium: createTTSAdapter({
				onOpen: () => {
					calls.push('premium');
				}
			})
		},
		policy: resolveVoiceProviderRoutingPolicyPreset('cost-cap', {
			maxCost: 3
		}),
		providerProfiles: {
			cheap: {
				cost: 2
			},
			premium: {
				cost: 8
			}
		}
	});

	await router.open({
		sessionId: 'tts-router-cost-cap'
	});

	expect(calls).toEqual(['cheap']);
});

test('createVoiceTTSProviderRouter falls back on open timeout', async () => {
	const events: Array<Record<string, unknown>> = [];
	const router = createVoiceTTSProviderRouter({
		adapters: {
			backup: createTTSAdapter({}),
			primary: createTTSAdapter({
				onOpen: () => new Promise((resolve) => setTimeout(resolve, 30))
			})
		},
		fallback: ['primary', 'backup'],
		onProviderEvent: (event) => {
			events.push(event);
		},
		providerProfiles: {
			primary: {
				timeoutMs: 5
			}
		},
		selectProvider: () => 'primary'
	});

	await router.open({
		sessionId: 'tts-router-timeout'
	});

	expect(events).toMatchObject([
		{
			kind: 'tts',
			latencyBudgetMs: 5,
			operation: 'open',
			provider: 'primary',
			status: 'error',
			timedOut: true
		},
		{
			kind: 'tts',
			operation: 'open',
			provider: 'backup',
			status: 'fallback'
		}
	]);
});
