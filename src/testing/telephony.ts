import { createVoiceMemoryStore } from '../memoryStore';
import {
	createTwilioMediaStreamBridge,
	encodeTwilioMulawBase64
} from '../telephony/twilio';
import type {
	AudioChunk,
	AudioFormat,
	STTAdapter,
	STTAdapterOpenOptions,
	STTAdapterSession,
	TTSAdapter,
	TTSAdapterSession,
	Transcript
} from '../types';

const DEFAULT_PCM16_FORMAT: AudioFormat = {
	channels: 1,
	container: 'raw',
	encoding: 'pcm_s16le',
	sampleRateHz: 16_000
};

export type VoiceTelephonyBenchmarkScenario = {
	expectClear: boolean;
	expectMark: boolean;
	expectOutboundMedia: boolean;
	id: string;
	secondInboundDelayMs?: number;
	sttDelayMs?: number;
	title: string;
	ttsChunkCount?: number;
	ttsChunkDelayMs?: number;
};

export type VoiceTelephonyBenchmarkScenarioResult = {
	clearCount: number;
	clearLatencyMs?: number;
	elapsedMs: number;
	expectClear: boolean;
	expectMark: boolean;
	expectOutboundMedia: boolean;
	fixtureId: string;
	firstOutboundMediaLatencyMs?: number;
	markCount: number;
	markLatencyMs?: number;
	outboundMediaCount: number;
	passes: boolean;
	receivedAudioBytes: number;
	title: string;
};

export type VoiceTelephonyBenchmarkSummary = {
	averageClearLatencyMs?: number;
	averageElapsedMs: number;
	averageFirstOutboundMediaLatencyMs?: number;
	averageMarkLatencyMs?: number;
	passCount: number;
	passRate: number;
	scenarioCount: number;
	totalOutboundMediaCount: number;
};

export type VoiceTelephonyBenchmarkReport = {
	fixtures: VoiceTelephonyBenchmarkScenarioResult[];
	generatedAt: number;
	summary: VoiceTelephonyBenchmarkSummary;
};

type VoiceTelephonyBenchmarkOptions = {
	timeoutMs?: number;
};

const DEFAULT_SCENARIOS: VoiceTelephonyBenchmarkScenario[] = [
	{
		expectClear: false,
		expectMark: true,
		expectOutboundMedia: true,
		id: 'telephony-turn',
		title: 'Telephony bridge streams assistant audio and mark'
	},
	{
		expectClear: true,
		expectMark: true,
		expectOutboundMedia: true,
		id: 'telephony-barge-in',
		secondInboundDelayMs: 5,
		title: 'Telephony bridge clears queued outbound audio on barge-in'
	},
	{
		expectClear: true,
		expectMark: true,
		expectOutboundMedia: true,
		id: 'telephony-streaming',
		secondInboundDelayMs: 8,
		title: 'Telephony bridge keeps streaming chunks and still clears on re-entry',
		ttsChunkCount: 3,
		ttsChunkDelayMs: 4
	}
];

const waitFor = async (
	check: () => boolean,
	timeoutMs: number,
	intervalMs = 5
) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (check()) {
			return true;
		}
		await Bun.sleep(intervalMs);
	}

	return check();
};

const toUint8Array = (audio: AudioChunk) =>
	audio instanceof Uint8Array
		? audio
		: audio instanceof ArrayBuffer
			? new Uint8Array(audio)
			: new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);

const createFakeSTTAdapter = (
	inputSpy: Uint8Array[],
	sttDelayMs: number
) =>
	({
		kind: 'stt',
		open: (_options: STTAdapterOpenOptions): STTAdapterSession => {
			const listeners = {
				close: new Set<(payload: { type: 'close' }) => void>(),
				endOfTurn: new Set<
					(payload: {
						reason: 'vendor';
						receivedAt: number;
						type: 'endOfTurn';
					}) => void
				>(),
				error: new Set<
					(payload: { error: Error; recoverable: boolean; type: 'error' }) => void
				>(),
				final: new Set<
					(payload: {
						receivedAt: number;
						transcript: Transcript;
						type: 'final';
					}) => void
				>(),
				partial: new Set<
					(payload: {
						receivedAt: number;
						transcript: Transcript;
						type: 'partial';
					}) => void
				>()
			};
			let delivered = false;

			return {
				close: async () => {
					for (const handler of listeners.close) {
						handler({ type: 'close' });
					}
				},
				on: (event, handler) => {
					(listeners[event] as Set<typeof handler>).add(handler as never);
					return () => {
						(listeners[event] as Set<typeof handler>).delete(handler as never);
					};
				},
				send: async (audio: AudioChunk) => {
					inputSpy.push(toUint8Array(audio));

					if (delivered) {
						return;
					}

					delivered = true;
					if (sttDelayMs > 0) {
						await Bun.sleep(sttDelayMs);
					}

					const receivedAt = Date.now();
					for (const handler of listeners.final) {
						handler({
							receivedAt,
							transcript: {
								id: 'telephony-benchmark-final',
								isFinal: true,
								text: 'hello from twilio'
							},
							type: 'final'
						});
					}
					for (const handler of listeners.endOfTurn) {
						handler({
							receivedAt,
							reason: 'vendor',
							type: 'endOfTurn'
						});
					}
				}
			};
		}
	}) satisfies STTAdapter;

const createFakeTTSAdapter = (
	chunkCount: number,
	chunkDelayMs: number
) =>
	({
		kind: 'tts',
		open: (): TTSAdapterSession => {
			const listeners = {
				audio: new Set<
					(payload: {
						chunk: Uint8Array;
						format: AudioFormat;
						receivedAt: number;
						type: 'audio';
					}) => void
				>(),
				close: new Set<(payload: { type: 'close' }) => void>(),
				error: new Set<
					(payload: { error: Error; recoverable: boolean; type: 'error' }) => void
				>()
			};

			return {
				close: async () => {
					for (const handler of listeners.close) {
						handler({ type: 'close' });
					}
				},
				on: (event, handler) => {
					(listeners[event] as Set<typeof handler>).add(handler as never);
					return () => {
						(listeners[event] as Set<typeof handler>).delete(handler as never);
					};
				},
				send: async () => {
					for (let index = 0; index < chunkCount; index += 1) {
						if (chunkDelayMs > 0) {
							await Bun.sleep(chunkDelayMs);
						}

						const chunk = new Uint8Array(320);
						for (let byteIndex = 0; byteIndex < chunk.length; byteIndex += 2) {
							chunk[byteIndex] = 0xff;
							chunk[byteIndex + 1] = 0x1f;
						}

						for (const handler of listeners.audio) {
							handler({
								chunk,
								format: DEFAULT_PCM16_FORMAT,
								receivedAt: Date.now(),
								type: 'audio'
							});
						}
					}
				}
			};
		}
	}) satisfies TTSAdapter;

export const getDefaultVoiceTelephonyBenchmarkScenarios = () =>
	DEFAULT_SCENARIOS.map((scenario) => ({ ...scenario }));

export const runVoiceTelephonyBenchmarkScenario = async (
	scenario: VoiceTelephonyBenchmarkScenario,
	options: VoiceTelephonyBenchmarkOptions = {}
): Promise<VoiceTelephonyBenchmarkScenarioResult> => {
	const timeoutMs = options.timeoutMs ?? 1_000;
	const sentEvents: Array<{ at: number; event: Record<string, unknown> }> = [];
	const receivedAudio: Uint8Array[] = [];
	const bridge = createTwilioMediaStreamBridge(
		{
			close: () => {},
			send: (data) => {
				sentEvents.push({
					at: Date.now(),
					event: JSON.parse(data) as Record<string, unknown>
				});
			}
		},
		{
			context: {},
			onComplete: async () => {},
			onTurn: async () => ({
				assistantText: 'Copy that.'
			}),
			session: createVoiceMemoryStore(),
			stt: createFakeSTTAdapter(receivedAudio, scenario.sttDelayMs ?? 0),
			tts: createFakeTTSAdapter(
				scenario.ttsChunkCount ?? 2,
				scenario.ttsChunkDelayMs ?? 0
			),
			turnDetection: {
				transcriptStabilityMs: 0
			}
		}
	);

	const startedAt = Date.now();
	let secondInboundAt: number | undefined;

	try {
		await bridge.handleMessage({
			event: 'start',
			start: {
				callSid: 'CA-benchmark',
				customParameters: {
					scenarioId: scenario.id,
					sessionId: `phone-${scenario.id}`
				},
				streamSid: 'MZ-benchmark'
			},
			streamSid: 'MZ-benchmark'
		});

		await bridge.handleMessage({
			event: 'media',
			media: {
				payload: encodeTwilioMulawBase64(
					new Int16Array([500, -500, 1500, -1500, 2500, -2500])
				),
				track: 'inbound'
			},
			streamSid: 'MZ-benchmark'
		});

		const sawOutboundMedia = await waitFor(
			() =>
				sentEvents.some(
					(entry) => (entry.event.event as string | undefined) === 'media'
				),
			timeoutMs
		);

		if (scenario.expectClear) {
			if (scenario.secondInboundDelayMs) {
				await Bun.sleep(scenario.secondInboundDelayMs);
			}
			secondInboundAt = Date.now();
			await bridge.handleMessage({
				event: 'media',
				media: {
					payload: encodeTwilioMulawBase64(new Int16Array([200, -200, 200, -200])),
					track: 'inbound'
				},
				streamSid: 'MZ-benchmark'
			});
		}

		await waitFor(
			() =>
				(!scenario.expectOutboundMedia || sawOutboundMedia) &&
				(!scenario.expectMark ||
					sentEvents.some(
						(entry) => (entry.event.event as string | undefined) === 'mark'
					)) &&
				(!scenario.expectClear ||
					sentEvents.some(
						(entry) => (entry.event.event as string | undefined) === 'clear'
					)),
			timeoutMs
		);
	} finally {
		await bridge.close('telephony-benchmark');
	}

	const outboundMediaEvents = sentEvents.filter(
		(entry) => (entry.event.event as string | undefined) === 'media'
	);
	const markEvents = sentEvents.filter(
		(entry) => (entry.event.event as string | undefined) === 'mark'
	);
	const clearEvents = sentEvents.filter(
		(entry) => (entry.event.event as string | undefined) === 'clear'
	);
	const firstOutboundMediaAt = outboundMediaEvents[0]?.at;
	const firstMarkAt = markEvents[0]?.at;
	const firstClearAt = clearEvents[0]?.at;
	const passes =
		(!scenario.expectOutboundMedia || outboundMediaEvents.length > 0) &&
		(!scenario.expectMark || markEvents.length > 0) &&
		(!scenario.expectClear || clearEvents.length > 0);

	return {
		clearCount: clearEvents.length,
		clearLatencyMs:
			secondInboundAt !== undefined && firstClearAt !== undefined
				? firstClearAt - secondInboundAt
				: undefined,
		elapsedMs: Date.now() - startedAt,
		expectClear: scenario.expectClear,
		expectMark: scenario.expectMark,
		expectOutboundMedia: scenario.expectOutboundMedia,
		fixtureId: scenario.id,
		firstOutboundMediaLatencyMs:
			firstOutboundMediaAt !== undefined ? firstOutboundMediaAt - startedAt : undefined,
		markCount: markEvents.length,
		markLatencyMs:
			firstMarkAt !== undefined ? firstMarkAt - startedAt : undefined,
		outboundMediaCount: outboundMediaEvents.length,
		passes,
		receivedAudioBytes: receivedAudio.reduce(
			(sum, chunk) => sum + chunk.byteLength,
			0
		),
		title: scenario.title
	};
};

export const summarizeVoiceTelephonyBenchmark = (
	fixtures: VoiceTelephonyBenchmarkScenarioResult[]
): VoiceTelephonyBenchmarkSummary => {
	const scenarioCount = fixtures.length;
	const firstMediaSamples = fixtures.filter(
		(fixture) => typeof fixture.firstOutboundMediaLatencyMs === 'number'
	);
	const markSamples = fixtures.filter(
		(fixture) => typeof fixture.markLatencyMs === 'number'
	);
	const clearSamples = fixtures.filter(
		(fixture) => typeof fixture.clearLatencyMs === 'number'
	);
	const passCount = fixtures.filter((fixture) => fixture.passes).length;

	return {
		averageClearLatencyMs:
			clearSamples.length > 0
				? clearSamples.reduce(
						(sum, fixture) => sum + fixture.clearLatencyMs!,
						0
				  ) / clearSamples.length
				: undefined,
		averageElapsedMs:
			scenarioCount > 0
				? fixtures.reduce((sum, fixture) => sum + fixture.elapsedMs, 0) /
				  scenarioCount
				: 0,
		averageFirstOutboundMediaLatencyMs:
			firstMediaSamples.length > 0
				? firstMediaSamples.reduce(
						(sum, fixture) => sum + fixture.firstOutboundMediaLatencyMs!,
						0
				  ) / firstMediaSamples.length
				: undefined,
		averageMarkLatencyMs:
			markSamples.length > 0
				? markSamples.reduce((sum, fixture) => sum + fixture.markLatencyMs!, 0) /
				  markSamples.length
				: undefined,
		passCount,
		passRate: scenarioCount > 0 ? passCount / scenarioCount : 0,
		scenarioCount,
		totalOutboundMediaCount: fixtures.reduce(
			(sum, fixture) => sum + fixture.outboundMediaCount,
			0
		)
	};
};

export const runVoiceTelephonyBenchmark = async (
	scenarios = getDefaultVoiceTelephonyBenchmarkScenarios(),
	options: VoiceTelephonyBenchmarkOptions = {}
): Promise<VoiceTelephonyBenchmarkReport> => {
	const fixtures: VoiceTelephonyBenchmarkScenarioResult[] = [];

	for (const scenario of scenarios) {
		fixtures.push(await runVoiceTelephonyBenchmarkScenario(scenario, options));
	}

	return {
		fixtures,
		generatedAt: Date.now(),
		summary: summarizeVoiceTelephonyBenchmark(fixtures)
	};
};
