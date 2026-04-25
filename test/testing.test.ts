import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serverMessageToAction } from '../src/client/actions';
import {
	buildCorrectionBenchmarkAudit,
	buildCodeSwitchBenchmarkLexicon,
	buildFixturePhraseHints,
	buildSessionCorrectionAudit,
	createJargonVoiceTestFixtures,
	createMultiSpeakerVoiceTestFixtures,
	createTelephonyVoiceTestFixtures,
	loadVoiceTestFixtures,
	runSTTAdapterBenchmark,
	runSTTAdapterFixture,
	resolveVoiceFixtureDirectories,
	scoreTranscriptAccuracy,
	summarizeSTTBenchmark
} from '../src/testing';

test('serverMessageToAction decodes assistant audio chunks', () => {
	const action = serverMessageToAction({
		chunkBase64: 'AQIDBA==',
		format: {
			channels: 1,
			container: 'raw',
			encoding: 'pcm_s16le',
			sampleRateHz: 16_000
		},
		receivedAt: 123,
		turnId: 'turn-audio',
		type: 'audio'
	});

	expect(action).toMatchObject({
		format: {
			channels: 1,
			container: 'raw',
			encoding: 'pcm_s16le',
			sampleRateHz: 16_000
		},
		receivedAt: 123,
		turnId: 'turn-audio',
		type: 'audio'
	});
	expect(Array.from(action?.chunk ?? [])).toEqual([1, 2, 3, 4]);
});

test('loadVoiceTestFixtures loads bundled pcm fixtures', async () => {
	const fixtures = await loadVoiceTestFixtures();

	expect(fixtures).toHaveLength(17);
	expect(fixtures.every((fixture) => fixture.audio.byteLength > 0)).toBe(true);
	expect(fixtures.map((fixture) => fixture.id)).toEqual([
		'quietly-alone-clean',
		'traveled-back-route-clean',
		'rainstorms-noisy',
		'stella-india-english37',
		'stella-ghana-english507',
		'stella-singapore-english655',
		'stella-pakistan-english519',
		'stella-jamaica-jamaican-creole-english1',
		'stella-liberia-liberian-pidgin-english2',
		'stella-sierra-leone-krio5',
		'stella-bulgaria-bulgarian20',
		'multiturn-two-clean',
		'multiturn-three-mixed',
		'dialogue-two-clean',
		'dialogue-two-noisy',
		'dialogue-three-clean',
		'dialogue-three-mixed'
	]);
});

test('loadVoiceTestFixtures merges bundled and external fixture directories', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'voice-fixtures-'));

	try {
		await mkdir(join(directory, 'pcm'), { recursive: true });
		await Bun.write(
			join(directory, 'manifest.json'),
			JSON.stringify([
				{
					audioPath: 'sample.pcm',
					expectedText: 'Hola desde el benchmark',
					id: 'external-spanish-fixture',
					language: 'es',
					tags: ['multilingual'],
					title: 'External Spanish fixture'
				}
			])
		);
		await Bun.write(join(directory, 'pcm', 'sample.pcm'), new Uint8Array([0, 0, 1, 0]));

		const fixtures = await loadVoiceTestFixtures([directory]);

		expect(
			fixtures.some((fixture) => fixture.id === 'external-spanish-fixture')
		).toBe(true);
		expect(
			fixtures.find((fixture) => fixture.id === 'external-spanish-fixture')
				?.language
		).toBe('es');
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
});

test('resolveVoiceFixtureDirectories rejects missing manifests', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'voice-fixtures-missing-'));

	try {
		await expect(resolveVoiceFixtureDirectories([directory])).rejects.toThrow(
			'missing manifest.json'
		);
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
});

test('runSTTAdapterFixture forwards benchmark open options into adapter.open', async () => {
	const fixtures = await loadVoiceTestFixtures();
	const fixture = fixtures.find((entry) => entry.id === 'quietly-alone-clean');
	const openCalls: Array<Record<string, unknown>> = [];

	expect(fixture).toBeDefined();

	await runSTTAdapterFixture(
		{
			kind: 'stt',
			open: async (options) => {
				openCalls.push(options as unknown as Record<string, unknown>);
				return {
					close: async () => {},
					on: () => () => {},
					send: async () => {}
				};
			}
		},
		fixture!,
		{
			chunkDurationMs: 60_000,
			idleTimeoutMs: 50,
			openOptions: (currentFixture) => ({
				languageStrategy: {
					mode: 'fixed',
					primaryLanguage: currentFixture.language ?? 'en'
				}
			}),
			settleMs: 0,
			tailPaddingMs: 0,
			waitForRealtimeMs: 1
		}
	);

	expect(openCalls).toHaveLength(1);
	expect(openCalls[0]?.languageStrategy).toEqual({
		mode: 'fixed',
		primaryLanguage: 'en'
	});
});

test('runSTTAdapterFixture preserves a trailing partial that extends the last final', async () => {
	const fixtures = await loadVoiceTestFixtures();
	const fixture = fixtures.find((entry) => entry.id === 'quietly-alone-clean');

	expect(fixture).toBeDefined();

	const handlers = new Map<string, (payload: any) => void | Promise<void>>();
	let sendCount = 0;
	const result = await runSTTAdapterFixture(
		{
			kind: 'stt',
			open: async () => ({
				close: async () => {},
				on: (event, handler) => {
					handlers.set(event, handler as any);
					return () => handlers.delete(event);
				},
				send: async () => {
					sendCount += 1;
					if (sendCount !== 1) {
						return;
					}

					await handlers.get('final')?.({
						type: 'final',
						receivedAt: Date.now(),
						transcript: {
							endedAtMs: 1_000,
							id: 'final-1',
							isFinal: true,
							startedAtMs: 100,
							text: 'veo'
						}
					});
					await handlers.get('partial')?.({
						type: 'partial',
						receivedAt: Date.now() + 500,
						transcript: {
							id: 'partial-1',
							isFinal: false,
							startedAtMs: 1_500,
							text: 'cubavisión y no es peor que tv3'
						}
					});
				}
			})
		},
		fixture!,
		{
			chunkDurationMs: 60_000,
			idleTimeoutMs: 50,
			settleMs: 0,
			tailPaddingMs: 0,
			waitForRealtimeMs: 1
		}
	);

	expect(result.finalText).toBe('veo cubavisión y no es peor que tv3');
});

test('scoreTranscriptAccuracy reports low error for close matches', () => {
	const accuracy = scoreTranscriptAccuracy(
		'go quietly alone no harm will befall you',
		'GO QUIETLY ALONE NO HARM WILL BEFALL YOU'
	);

	expect(accuracy.wordErrorRate).toBe(0);
	expect(accuracy.passesThreshold).toBe(true);
});

test('createTelephonyVoiceTestFixtures derives narrowband phone-style fixtures', async () => {
	const fixtures = await loadVoiceTestFixtures();
	const telephonyFixtures = createTelephonyVoiceTestFixtures(fixtures);

	expect(telephonyFixtures.length).toBe(9);
	expect(telephonyFixtures.every((fixture) => fixture.id.endsWith('-telephony'))).toBe(
		true
	);
	expect(
		telephonyFixtures.every((fixture) => fixture.format.sampleRateHz === 8_000)
	).toBe(true);
	expect(
		telephonyFixtures.every((fixture) => fixture.tags?.includes('telephony'))
	).toBe(true);
	expect(
		telephonyFixtures.every((fixture) => fixture.tags?.includes('narrowband'))
	).toBe(true);
	expect(
		telephonyFixtures.every((fixture) => !fixture.tags?.includes('accent'))
	).toBe(true);
	expect(telephonyFixtures[0]?.audio.byteLength).toBeLessThan(
		fixtures[0]?.audio.byteLength ?? Number.MAX_SAFE_INTEGER
	);
});

test('createMultiSpeakerVoiceTestFixtures derives synthetic handoff fixtures', async () => {
	const fixtures = await loadVoiceTestFixtures();
	const multiSpeakerFixtures = createMultiSpeakerVoiceTestFixtures(fixtures);

	expect(multiSpeakerFixtures).toHaveLength(2);
	expect(
		multiSpeakerFixtures.every((fixture) => fixture.tags?.includes('multi-speaker'))
	).toBe(true);
	expect(
		multiSpeakerFixtures.every((fixture) => fixture.expectedSpeakerTurns?.length)
	).toBe(true);
	expect(multiSpeakerFixtures[0]?.expectedSpeakerTurns).toEqual([
		{ speaker: 'speaker-a', text: fixtures[0]?.expectedText ?? '' },
		{ speaker: 'speaker-b', text: fixtures[1]?.expectedText ?? '' }
	]);
	expect(multiSpeakerFixtures[1]?.expectedSpeakerTurns).toHaveLength(3);
});

test('createJargonVoiceTestFixtures derives domain-heavy fixtures from bundled audio', async () => {
	const fixtures = await loadVoiceTestFixtures();
	const jargonFixtures = createJargonVoiceTestFixtures(fixtures);

	expect(jargonFixtures).toHaveLength(5);
	expect(jargonFixtures.every((fixture) => fixture.id.endsWith('-jargon'))).toBe(true);
	expect(jargonFixtures.every((fixture) => fixture.tags?.includes('jargon'))).toBe(true);
	expect(
		jargonFixtures.every((fixture) => fixture.tags?.includes('domain-heavy'))
	).toBe(true);
	expect(
		jargonFixtures.every((fixture) => (fixture.expectedTerms?.length ?? 0) > 0)
	).toBe(true);
});

test('runSTTAdapterBenchmark collapses adjacent same-speaker finals for multi-speaker scoring', async () => {
	const fixture = {
		audio: new Uint8Array([0, 0]),
		audioPath: '/tmp/multi-speaker-test.pcm',
		expectedSpeakerTurns: [
			{ speaker: 'speaker-a', text: 'alpha bravo' },
			{ speaker: 'speaker-b', text: 'charlie delta' },
			{ speaker: 'speaker-c', text: 'echo foxtrot' }
		],
		expectedText: 'alpha bravo charlie delta echo foxtrot',
		format: {
			channels: 1 as const,
			container: 'raw' as const,
			encoding: 'pcm_s16le' as const,
			sampleRateHz: 16_000
		},
		id: 'multi-speaker-collapse-regression',
		tags: ['multi-speaker', 'synthetic'],
		title: 'Multi-speaker collapse regression'
	};

	let sendCount = 0;
	const handlers = new Map<string, (payload: any) => void | Promise<void>>();
	const report = await runSTTAdapterBenchmark({
		adapter: {
			kind: 'stt',
			open: async () => ({
				close: async () => {},
				on: (event, handler) => {
					handlers.set(event, handler as any);
					return () => handlers.delete(event);
				},
				send: async () => {
					sendCount += 1;
					if (sendCount !== 1) {
						return;
					}

					const finals = [
						{ speaker: 0, text: 'alpha' },
						{ speaker: 0, text: 'bravo' },
						{ speaker: 1, text: 'charlie' },
						{ speaker: 1, text: 'delta' },
						{ speaker: 2, text: 'echo' },
						{ speaker: 2, text: 'foxtrot' }
					];

					for (const [index, final] of finals.entries()) {
						await handlers.get('final')?.({
							type: 'final',
							receivedAt: Date.now() + index,
							transcript: {
								id: `final-${index}`,
								isFinal: true,
								speaker: final.speaker,
								text: final.text
							}
						});
					}
				}
			})
		},
		adapterId: 'test-diarized',
		fixtures: [fixture],
		options: {
			chunkDurationMs: 60_000,
			idleTimeoutMs: 50,
			settleMs: 0,
			tailPaddingMs: 0,
			waitForRealtimeMs: 1
		}
	});

	expect(report.summary.passCount).toBe(1);
	expect(report.summary.averageSpeakerTurnMatchRate).toBe(1);
	expect(report.fixtures[0]?.speakerTurns).toEqual({
		available: true,
		actualTurnCount: 3,
		expectedTurnCount: 3,
		passes: true,
		patternMatchRate: 1,
		postClustered: false
	});
});

test('runSTTAdapterBenchmark post-clusters synthetic handoff speaker reentry when overlap is low', async () => {
	const fixture = {
		audio: new Uint8Array([0, 0]),
		audioPath: '/tmp/multi-speaker-postcluster-test.pcm',
		expectedSpeakerTurns: [
			{ speaker: 'speaker-a', text: 'alpha bravo' },
			{ speaker: 'speaker-b', text: 'charlie delta echo' },
			{ speaker: 'speaker-c', text: 'rainstorms around the mountain' }
		],
		expectedText: 'alpha bravo charlie delta echo rainstorms around the mountain',
		format: {
			channels: 1 as const,
			container: 'raw' as const,
			encoding: 'pcm_s16le' as const,
			sampleRateHz: 16_000
		},
		id: 'multi-speaker-postcluster-regression',
		tags: ['multi-speaker', 'handoff', 'synthetic'],
		title: 'Multi-speaker post-cluster regression'
	};

	let sendCount = 0;
	const handlers = new Map<string, (payload: any) => void | Promise<void>>();
	const report = await runSTTAdapterBenchmark({
		adapter: {
			kind: 'stt',
			open: async () => ({
				close: async () => {},
				on: (event, handler) => {
					handlers.set(event, handler as any);
					return () => handlers.delete(event);
				},
				send: async () => {
					sendCount += 1;
					if (sendCount !== 1) {
						return;
					}

					const finals = [
						{ speaker: 0, text: 'alpha bravo' },
						{ speaker: 1, text: 'charlie delta echo' },
						{ speaker: 0, text: 'rainstorms around the mountain' }
					];

					for (const [index, final] of finals.entries()) {
						await handlers.get('final')?.({
							type: 'final',
							receivedAt: Date.now() + index,
							transcript: {
								id: `postcluster-final-${index}`,
								isFinal: true,
								speaker: final.speaker,
								text: final.text
							}
						});
					}
				}
			})
		},
		adapterId: 'test-diarized-postcluster',
		fixtures: [fixture],
		options: {
			chunkDurationMs: 60_000,
			idleTimeoutMs: 50,
			settleMs: 0,
			tailPaddingMs: 0,
			waitForRealtimeMs: 1
		}
	});

	expect(report.summary.passCount).toBe(1);
	expect(report.summary.averageSpeakerTurnMatchRate).toBe(1);
	expect(report.fixtures[0]?.speakerTurns).toEqual({
		available: true,
		actualTurnCount: 3,
		expectedTurnCount: 3,
		passes: true,
		patternMatchRate: 1,
		postClustered: true
	});
});

test('generic phrase hints derive name corrections without seeded noisy phrases', async () => {
	const fixtures = await loadVoiceTestFixtures();
	const routeFixture = fixtures.find((fixture) => fixture.id === 'traveled-back-route-clean');

	expect(routeFixture).toBeDefined();

	const phraseHints = buildFixturePhraseHints(routeFixture!, 'generic');
	const joeHint = phraseHints.find((hint) => hint.text === 'Joe Johnston');

	expect(joeHint).toBeDefined();
	expect(joeHint?.aliases).toContain('joe johnson');
	expect(
		phraseHints.some((hint) =>
			(hint.aliases ?? []).includes('beneath wealth')
		)
	).toBe(false);
});

test('code-switch benchmark lexicon includes mixed-script phrases and accent aliases', () => {
	const lexicon = buildCodeSwitchBenchmarkLexicon({
		expectedText: "m'agrada fer un update rápido para el team y complain कर लो",
		language: 'ca-es',
		expectedTerms: ['update rápido', 'complain कर लो']
	});

	expect(lexicon.some((entry) => entry.text === 'update rápido')).toBe(true);
	expect(
		lexicon.find((entry) => entry.text === 'update rápido')?.aliases
	).toContain('update rapido');
	expect(lexicon.some((entry) => entry.text === 'complain कर लो')).toBe(true);
});

test('code-switch benchmark lexicon caps low-signal entries while keeping mixed-script phrases', () => {
	const lexicon = buildCodeSwitchBenchmarkLexicon({
		expectedText:
			"उसको गाली दे दो उसके बारे में complain कर लो technology evolve हुई है email आई cable गई youtube ott आए लेकिन future opportunities के लिए update rápido और m'agrada team sync जरूरी है",
		language: 'hi-en',
		expectedTerms: ['complain कर लो', 'future opportunities', "m'agrada team"]
	});

	expect(lexicon.length).toBeLessThanOrEqual(12);
	expect(lexicon.some((entry) => entry.text === 'complain कर लो')).toBe(true);
	expect(lexicon.some((entry) => entry.text === 'future opportunities')).toBe(true);
	expect(lexicon.some((entry) => entry.text === "m'agrada team")).toBe(true);
});

test('code-switch benchmark lexicon adds parlament-specific recovery aliases', () => {
	const lexicon = buildCodeSwitchBenchmarkLexicon({
		expectedText:
			"però ja que em donen aquesta oportunitat ho farem eh n'hi ha una que diu això eh espanya es paro y muerte",
		language: 'ca-es',
		tags: ['code-switch', 'ca-es', 'parlament_parla']
	});

	const sloganEntry = lexicon.find((entry) => entry.text === 'espanya es paro y muerte');

	expect(sloganEntry).toBeDefined();
	expect(sloganEntry?.aliases).toContain('espanya espanya i muertes');
	expect(sloganEntry?.aliases).toContain('españa es parla');
});

test('correction benchmark audit exposes a lexical holdout that excludes seeded noisy phrase families', async () => {
	const fixtures = await loadVoiceTestFixtures();
	const selectedFixtures = fixtures.filter((fixture) =>
		[
			'traveled-back-route-clean',
			'rainstorms-noisy',
			'dialogue-two-clean',
			'dialogue-two-noisy'
		].includes(fixture.id)
	);

	const rawResults = selectedFixtures.map((fixture) => ({
		accuracy: scoreTranscriptAccuracy(fixture.expectedText, fixture.expectedText, 0.18),
		closeCount: 1,
		difficulty: fixture.difficulty,
		elapsedMs: 1_000,
		endOfTurnCount: 1,
		errorCount: 0,
		expectedTerms: {
			allMatched: true,
			expectedTerms: fixture.expectedTerms ?? [],
			matchedTerms: fixture.expectedTerms ?? [],
			missingTerms: [],
			recall: 1
		},
		finalCount: 1,
		finalText: fixture.expectedText,
		fixtureId: fixture.id,
		fragmentationCount: 0,
		group: 'test',
		passes: true,
		partialCount: 0,
		timeToFirstPartialMs: 0,
		title: fixture.title
	}));
	const rawReport = {
		adapterId: 'deepgram-flux',
		fixtures: rawResults,
		generatedAt: Date.now(),
		summary: summarizeSTTBenchmark('deepgram-flux', rawResults)
	};

	const audit = buildCorrectionBenchmarkAudit(rawReport, selectedFixtures);

	expect(audit.holdout.fixtureIds).toEqual(['dialogue-two-clean', 'dialogue-two-noisy']);
	expect(audit.lexicalHoldout.fixtureIds).toEqual([
		'traveled-back-route-clean',
		'dialogue-two-clean'
	]);
	expect(audit.experimental.summary.wordAccuracyRate).toBeGreaterThanOrEqual(
		audit.raw.summary.wordAccuracyRate
	);
});

test('session correction audit exposes lexical holdout independently from scenario holdout', () => {
	const createScenario = (fixtureId: string, passes: boolean) => ({
		actualTurns: ['ok'],
		averageRelativeCostUnits: 0,
		duplicateTurnCount: 0,
		elapsedMs: 1_000,
		fallbackReplayAudioMs: 0,
		expectedTurns: ['OK'],
		fixtureId,
		primaryAudioMs: 0,
		passes,
		reconnectTriggered: false,
		tags: [],
		title: fixtureId,
		turnCountDelta: 0,
		turnResults: [
			{
				actualText: 'ok',
				accuracy: scoreTranscriptAccuracy('ok', 'ok', 0.35),
				expectedText: 'OK',
				index: 0,
				passes: true,
				quality: {
					averageConfidence: 1,
					confidenceSampleCount: 1,
					fallbackUsed: false,
					finalTranscriptCount: 1,
					partialTranscriptCount: 0,
					selectedTranscriptCount: 1,
					source: 'primary' as const
				}
			}
		]
	});

	const raw = {
		adapterId: 'deepgram-flux',
		generatedAt: Date.now(),
		scenarios: [createScenario('dialogue-two-clean', true), createScenario('dialogue-two-noisy', false)],
		summary: {
			adapterId: 'deepgram-flux',
			averageElapsedMs: 1_000,
			averageFallbackReplayAudioMs: 0,
			averagePrimaryAudioMs: 0,
			averageReconnectCount: 0,
			averageRelativeCostUnits: 0,
			averageTurnPassRate: 0.5,
			averageWordErrorRate: 0.5,
			duplicateTurnRate: 0,
			passCount: 1,
			passRate: 0.5,
			reconnectCoverageRate: 1,
			reconnectSuccessRate: 1,
			scenarioCount: 2,
			scenariosWithDuplicateTurns: 0,
			scenariosWithTurnCountMismatch: 0
		}
	};

	const audit = buildSessionCorrectionAudit(raw, raw, raw, raw, [
		{
			expectedTerms: ['joe johnston'],
			expectedText: 'go quietly alone no harm will befall you',
			expectedTurnTexts: [
				'GO QUIETLY ALONE NO HARM WILL BEFALL YOU',
				'WE PASSED AROUND ATLANTA CROSSED THE CHATTAHOOCHEE AND TRAVELED BACK OVER THE SAME ROUTE ON WHICH WE HAD MADE THE ARDUOUS CAMPAIGN UNDER JOE JOHNSTON'
			],
			id: 'dialogue-two-clean'
		},
		{
			expectedTerms: ['thatched trees'],
			expectedText: 'go quietly alone no harm will befall you',
			expectedTurnTexts: [
				'GO QUIETLY ALONE NO HARM WILL BEFALL YOU',
				'SLIGHT RAINSTORMS ARE LIKELY TO BE ENCOUNTERED IN A TRIP ROUND THE MOUNTAIN BUT ONE MAY EASILY FIND SHELTER BENEATH WELL THATCHED TREES THAT SHED THE RAIN LIKE A ROOF'
			],
			id: 'dialogue-two-noisy'
		}
	]);

	expect(audit.holdout.fixtureIds).toEqual(['dialogue-two-clean', 'dialogue-two-noisy']);
	expect(audit.lexicalHoldout.fixtureIds).toEqual(['dialogue-two-clean']);
});
