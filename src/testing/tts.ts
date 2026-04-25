import type {
	AudioFormat,
	RealtimeAdapter,
	RealtimeAdapterOpenOptions,
	TTSAdapter,
	TTSAdapterOpenOptions
} from '../types';

export type VoiceTTSBenchmarkFixture = {
	id: string;
	tags?: string[];
	text: string;
	title: string;
};

export type VoiceTTSBenchmarkFixtureResult = {
	audioChunkCount: number;
	audioDurationMs: number;
	audioFormat?: AudioFormat;
	closeCount: number;
	elapsedMs: number;
	errorCount: number;
	fixtureId: string;
	firstAudioLatencyMs?: number;
	interruptionLatencyMs?: number;
	interruptionRequestedAtMs?: number;
	passes: boolean;
	postInterruptAudioBytes?: number;
	preInterruptAudioBytes?: number;
	tags: string[];
	textLength: number;
	title: string;
	totalAudioBytes: number;
};

export type VoiceTTSBenchmarkSummary = {
	adapterId: string;
	averageAudioChunkCount: number;
	averageAudioDurationMs: number;
	averageElapsedMs: number;
	averageFirstAudioLatencyMs?: number;
	averageInterruptionLatencyMs?: number;
	averageTextLength: number;
	fixtureCount: number;
	passCount: number;
	passRate: number;
	totalAudioBytes: number;
	totalErrorCount: number;
};

export type VoiceTTSBenchmarkReport = {
	adapterId: string;
	fixtures: VoiceTTSBenchmarkFixtureResult[];
	generatedAt: number;
	profileId?: string;
	summary: VoiceTTSBenchmarkSummary;
};

export type VoiceTTSBenchmarkOptions = {
	idleTimeoutMs?: number;
	interruptAfterFirstAudioMs?: number;
	minAudioBytes?: number;
	openOptions?:
		| Partial<TTSAdapterOpenOptions & RealtimeAdapterOpenOptions>
		| ((
				fixture: VoiceTTSBenchmarkFixture
		  ) => Partial<TTSAdapterOpenOptions & RealtimeAdapterOpenOptions> | undefined);
	realtimeFormat?: AudioFormat;
	settleMs?: number;
	waitForFirstAudioMs?: number;
	waitForCloseAfterInterruptMs?: number;
};

type VoiceOutputAdapter = TTSAdapter | RealtimeAdapter;

const DEFAULT_REALTIME_FORMAT: AudioFormat = {
	channels: 1,
	container: 'raw',
	encoding: 'pcm_s16le',
	sampleRateHz: 24000
};

const DEFAULT_TTS_BENCHMARK_FIXTURES: VoiceTTSBenchmarkFixture[] = [
	{
		id: 'tts-short',
		tags: ['short'],
		text: 'AbsoluteJS voice benchmark short response.',
		title: 'Short response'
	},
	{
		id: 'tts-conversational',
		tags: ['conversational'],
		text: 'Thanks for calling. I found your appointment and sent the updated details by text.',
		title: 'Conversational response'
	},
	{
		id: 'tts-domain',
		tags: ['domain'],
		text: 'Joe Johnston will review the AbsoluteJS migration after the deployment completes.',
		title: 'Domain response'
	}
];

const getAudioDurationMs = (chunk: Uint8Array, format: AudioFormat) => {
	if (format.container !== 'raw' || format.encoding !== 'pcm_s16le') {
		return 0;
	}

	return (
		(chunk.byteLength / (format.sampleRateHz * format.channels * 2)) * 1_000
	);
};

export const getDefaultTTSBenchmarkFixtures = () =>
	DEFAULT_TTS_BENCHMARK_FIXTURES.map((fixture) => ({ ...fixture }));

export const runTTSAdapterFixture = async (
	adapter: VoiceOutputAdapter,
	fixture: VoiceTTSBenchmarkFixture,
	options: VoiceTTSBenchmarkOptions = {}
): Promise<VoiceTTSBenchmarkFixtureResult> => {
	const openOptions =
		typeof options.openOptions === 'function'
			? options.openOptions(fixture)
			: options.openOptions;
	const settleMs = options.settleMs ?? 300;
	const idleTimeoutMs = options.idleTimeoutMs ?? 12_000;
	const waitForFirstAudioMs = options.waitForFirstAudioMs ?? 4_000;
	const minAudioBytes = options.minAudioBytes ?? 1_024;
	const startedAt = Date.now();
	let closed = false;
	let closeCount = 0;
	let closePromiseResolve: (() => void) | undefined;
	const closePromise = new Promise<void>((resolve) => {
		closePromiseResolve = resolve;
	});
	let closedAt: number | undefined;
	let errorCount = 0;
	let firstAudioAt: number | undefined;
	let interruptTimer: ReturnType<typeof setTimeout> | undefined;
	let interruptionRequestedAt: number | undefined;
	let lastAudioAt: number | undefined;
	let audioFormat: AudioFormat | undefined;
	let postInterruptAudioBytes = 0;
	let preInterruptAudioBytes: number | undefined;
	let totalAudioBytes = 0;
	let audioDurationMs = 0;
	let audioChunkCount = 0;

	const session =
		adapter.kind === 'realtime'
			? await adapter.open({
					format: options.realtimeFormat ?? DEFAULT_REALTIME_FORMAT,
					sessionId: `tts-benchmark:${fixture.id}`,
					...(openOptions ?? {})
			  })
			: await adapter.open({
					sessionId: `tts-benchmark:${fixture.id}`,
					...(openOptions ?? {})
			  });

	const unsubscribers = [
		session.on('audio', ({ chunk, format, receivedAt }) => {
			const normalizedChunk =
				chunk instanceof Uint8Array
					? chunk
					: chunk instanceof ArrayBuffer
						? new Uint8Array(chunk)
						: new Uint8Array(
								chunk.buffer,
								chunk.byteOffset,
								chunk.byteLength
						  );

			audioChunkCount += 1;
			totalAudioBytes += normalizedChunk.byteLength;
			if (interruptionRequestedAt !== undefined) {
				postInterruptAudioBytes += normalizedChunk.byteLength;
			}
			audioDurationMs += getAudioDurationMs(normalizedChunk, format);
			audioFormat = format;
			firstAudioAt ??= receivedAt;
			lastAudioAt = receivedAt;

			if (
				firstAudioAt !== undefined &&
				options.interruptAfterFirstAudioMs !== undefined &&
				interruptTimer === undefined &&
				interruptionRequestedAt === undefined
			) {
				interruptTimer = setTimeout(() => {
					interruptTimer = undefined;
					preInterruptAudioBytes = totalAudioBytes;
					interruptionRequestedAt = Date.now();
					void session.close('tts benchmark interrupt');
				}, options.interruptAfterFirstAudioMs);
			}
		}),
		session.on('error', () => {
			errorCount += 1;
		}),
		session.on('close', () => {
			closeCount += 1;
			closed = true;
			closedAt = Date.now();
			closePromiseResolve?.();
		})
	];

	try {
		await session.send(fixture.text);

		const firstAudioDeadline = Date.now() + waitForFirstAudioMs;
		while (!firstAudioAt && Date.now() < firstAudioDeadline && !closed) {
			await Bun.sleep(25);
		}

		if (
			interruptionRequestedAt === undefined &&
			options.interruptAfterFirstAudioMs !== undefined &&
			firstAudioAt !== undefined
		) {
			const closeDeadline =
				Date.now() + (options.waitForCloseAfterInterruptMs ?? 3_000);
			while (!closed && Date.now() < closeDeadline) {
				await Bun.sleep(25);
			}
			await closePromise;
		}

		const idleDeadline = Date.now() + idleTimeoutMs;
		while (
			options.interruptAfterFirstAudioMs === undefined &&
			Date.now() < idleDeadline
		) {
			if (closed) {
				break;
			}

			if (lastAudioAt && Date.now() - lastAudioAt >= settleMs) {
				break;
			}

			if (!firstAudioAt && Date.now() >= firstAudioDeadline) {
				break;
			}

			await Bun.sleep(25);
		}
	} finally {
		if (interruptTimer) {
			clearTimeout(interruptTimer);
			interruptTimer = undefined;
		}

		if (!closed) {
			await session.close('tts benchmark complete');
		}
		for (const unsubscribe of unsubscribers) {
			unsubscribe();
		}
	}

	return {
		audioChunkCount,
		audioDurationMs,
		audioFormat,
		closeCount,
		elapsedMs: Date.now() - startedAt,
		errorCount,
		fixtureId: fixture.id,
		firstAudioLatencyMs:
			firstAudioAt !== undefined ? firstAudioAt - startedAt : undefined,
		interruptionLatencyMs:
			interruptionRequestedAt !== undefined && closedAt !== undefined
				? closedAt - interruptionRequestedAt
				: undefined,
		interruptionRequestedAtMs:
			interruptionRequestedAt !== undefined
				? interruptionRequestedAt - startedAt
				: undefined,
		passes: totalAudioBytes >= minAudioBytes && audioChunkCount > 0 && errorCount === 0,
		postInterruptAudioBytes:
			interruptionRequestedAt !== undefined ? postInterruptAudioBytes : undefined,
		preInterruptAudioBytes,
		tags: [...(fixture.tags ?? [])],
		textLength: fixture.text.length,
		title: fixture.title,
		totalAudioBytes
	};
};

export const runTTSAdapterBenchmark = async (
	adapterId: string,
	adapter: VoiceOutputAdapter,
	fixtures = getDefaultTTSBenchmarkFixtures(),
	options: VoiceTTSBenchmarkOptions = {}
): Promise<VoiceTTSBenchmarkReport> => {
	const results: VoiceTTSBenchmarkFixtureResult[] = [];

	for (const fixture of fixtures) {
		results.push(await runTTSAdapterFixture(adapter, fixture, options));
	}

	return {
		adapterId,
		fixtures: results,
		generatedAt: Date.now(),
		profileId:
			options.interruptAfterFirstAudioMs !== undefined ? 'interrupt' : 'default',
		summary: summarizeTTSBenchmark(adapterId, results)
	};
};

export const summarizeTTSBenchmark = (
	adapterId: string,
	fixtures: VoiceTTSBenchmarkFixtureResult[]
): VoiceTTSBenchmarkSummary => {
	const fixtureCount = fixtures.length;
	const totalAudioBytes = fixtures.reduce(
		(sum, fixture) => sum + fixture.totalAudioBytes,
		0
	);
	const totalErrorCount = fixtures.reduce(
		(sum, fixture) => sum + fixture.errorCount,
		0
	);
	const firstAudioSamples = fixtures.filter(
		(fixture) => typeof fixture.firstAudioLatencyMs === 'number'
	);
	const interruptionSamples = fixtures.filter(
		(fixture) => typeof fixture.interruptionLatencyMs === 'number'
	);

	return {
		adapterId,
		averageAudioChunkCount:
			fixtureCount > 0
				? fixtures.reduce((sum, fixture) => sum + fixture.audioChunkCount, 0) /
				  fixtureCount
				: 0,
		averageAudioDurationMs:
			fixtureCount > 0
				? fixtures.reduce((sum, fixture) => sum + fixture.audioDurationMs, 0) /
				  fixtureCount
				: 0,
		averageElapsedMs:
			fixtureCount > 0
				? fixtures.reduce((sum, fixture) => sum + fixture.elapsedMs, 0) /
				  fixtureCount
				: 0,
		averageFirstAudioLatencyMs:
			firstAudioSamples.length > 0
				? firstAudioSamples.reduce(
						(sum, fixture) => sum + fixture.firstAudioLatencyMs!,
						0
				  ) / firstAudioSamples.length
				: undefined,
		averageInterruptionLatencyMs:
			interruptionSamples.length > 0
				? interruptionSamples.reduce(
						(sum, fixture) => sum + fixture.interruptionLatencyMs!,
						0
				  ) / interruptionSamples.length
				: undefined,
		averageTextLength:
			fixtureCount > 0
				? fixtures.reduce((sum, fixture) => sum + fixture.textLength, 0) /
				  fixtureCount
				: 0,
		fixtureCount,
		passCount: fixtures.filter((fixture) => fixture.passes).length,
		passRate:
			fixtureCount > 0
				? fixtures.filter((fixture) => fixture.passes).length / fixtureCount
				: 0,
		totalAudioBytes,
		totalErrorCount
	};
};
