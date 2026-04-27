import type { VoiceStreamState } from '../types';

export type VoiceLiveTurnLatencyStatus = 'empty' | 'pending' | 'pass' | 'warn' | 'fail';

export type VoiceLiveTurnLatencyEvent = {
	assistantAudioAt?: number;
	assistantTextAt?: number;
	completedAt?: number;
	id: string;
	latencyMs?: number;
	sessionId?: string | null;
	startedAt: number;
	status: Exclude<VoiceLiveTurnLatencyStatus, 'empty'>;
	thresholdMs: number;
};

export type VoiceLiveTurnLatencySnapshot = {
	averageLatencyMs?: number;
	events: VoiceLiveTurnLatencyEvent[];
	failed: number;
	lastEvent?: VoiceLiveTurnLatencyEvent;
	passed: number;
	pending?: VoiceLiveTurnLatencyEvent;
	status: VoiceLiveTurnLatencyStatus;
	thresholdMs: number;
	total: number;
	warnings: number;
};

export type VoiceLiveTurnLatencyMonitorOptions = {
	clock?: () => number;
	failAfterMs?: number;
	maxEvents?: number;
	speechThreshold?: number;
	warnAfterMs?: number;
};

const getAudioLevel = (audio: Uint8Array | ArrayBuffer) => {
	const bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
	if (bytes.byteLength < 2) {
		return 0;
	}

	const samples = new Int16Array(
		bytes.buffer,
		bytes.byteOffset,
		Math.floor(bytes.byteLength / 2)
	);
	if (samples.length === 0) {
		return 0;
	}

	let sumSquares = 0;
	for (const sample of samples) {
		const normalized = sample / 0x8000;
		sumSquares += normalized * normalized;
	}
	return Math.min(1, Math.max(0, Math.sqrt(sumSquares / samples.length) * 5.5));
};

export const createVoiceLiveTurnLatencyMonitor = (
	options: VoiceLiveTurnLatencyMonitorOptions = {}
) => {
	const listeners = new Set<() => void>();
	const clock = options.clock ?? (() => Date.now());
	const failAfterMs = options.failAfterMs ?? 3200;
	const maxEvents = options.maxEvents ?? 20;
	const speechThreshold = options.speechThreshold ?? 0.04;
	const warnAfterMs = options.warnAfterMs ?? 1800;
	let events: VoiceLiveTurnLatencyEvent[] = [];
	let pending: VoiceLiveTurnLatencyEvent | undefined;
	let lastAudioCount = 0;
	let lastTextCount = 0;
	let lastSessionId: string | null | undefined;

	const emit = () => {
		for (const listener of listeners) {
			listener();
		}
	};
	const completePending = (
		input: Pick<VoiceLiveTurnLatencyEvent, 'assistantAudioAt' | 'assistantTextAt'>
	) => {
		if (!pending) {
			return;
		}
		const completedAt = input.assistantAudioAt ?? input.assistantTextAt ?? clock();
		const latencyMs = Math.max(0, completedAt - pending.startedAt);
		const status =
			latencyMs > failAfterMs ? 'fail' : latencyMs > warnAfterMs ? 'warn' : 'pass';
		pending = {
			...pending,
			...input,
			completedAt,
			latencyMs,
			status
		};
		events = [pending, ...events].slice(0, maxEvents);
		pending = undefined;
		emit();
	};
	const observe = <TResult = unknown>(
		state: Pick<
			VoiceStreamState<TResult>,
			'assistantAudio' | 'assistantTexts' | 'sessionId'
		>
	) => {
		const now = clock();
		if (pending) {
			if (state.assistantAudio.length > lastAudioCount) {
				completePending({ assistantAudioAt: now });
			} else if (state.assistantTexts.length > lastTextCount) {
				completePending({ assistantTextAt: now });
			}
		}
		lastAudioCount = state.assistantAudio.length;
		lastTextCount = state.assistantTexts.length;
		lastSessionId = state.sessionId;
	};
	const recordAudio = (audio: Uint8Array | ArrayBuffer) => {
		if (pending || getAudioLevel(audio) < speechThreshold) {
			return pending;
		}
		pending = {
			id: `live-turn-${crypto.randomUUID()}`,
			sessionId: lastSessionId ?? null,
			startedAt: clock(),
			status: 'pending',
			thresholdMs: failAfterMs
		};
		emit();
		return pending;
	};
	const getSnapshot = (): VoiceLiveTurnLatencySnapshot => {
		const completed = events.filter((event) => typeof event.latencyMs === 'number');
		const latencies = completed.map((event) => event.latencyMs as number);
		const failed = events.filter((event) => event.status === 'fail').length;
		const warnings = events.filter((event) => event.status === 'warn').length;
		const passed = events.filter((event) => event.status === 'pass').length;
		return {
			averageLatencyMs: latencies.length
				? Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length)
				: undefined,
			events,
			failed,
			lastEvent: events[0],
			passed,
			pending,
			status: pending
				? 'pending'
				: events.length === 0
					? 'empty'
					: failed > 0
						? 'fail'
						: warnings > 0
							? 'warn'
							: 'pass',
			thresholdMs: failAfterMs,
			total: events.length,
			warnings
		};
	};

	return {
		getSnapshot,
		observe,
		recordAudio,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
	};
};
