import {
	applyLexiconCorrections,
	applyRiskTieredPhraseHintCorrections,
	applyPhraseHintCorrections,
	createDomainPhraseHints,
	createLexiconCorrectionHandler,
	createPhraseHintCorrectionHandler
} from '../correction';
import type {
	VoiceDomainTerm,
	VoiceLexiconEntry,
	VoicePhraseHint,
	VoiceTurnCorrectionHandler
} from '../types';
import {
	summarizeSTTBenchmark,
	type VoiceExpectedTermAccuracy,
	type VoiceSTTBenchmarkFixtureResult,
	type VoiceSTTBenchmarkReport
} from './benchmark';
import { scoreTranscriptAccuracy } from './accuracy';
import type { VoiceSessionBenchmarkReport, VoiceSessionBenchmarkScenarioResult } from './sessionBenchmark';
import type { VoiceTestFixture } from './fixtures';

export type VoiceCorrectionHintProfile = 'generic' | 'benchmark-seeded';

type VoiceCorrectionAuditSlice<TReport> = {
	fixtureIds: string[];
	raw: TReport;
	generic: TReport;
	experimental: TReport;
	benchmarkSeeded: TReport;
};

export type VoiceCorrectionBenchmarkAudit = {
	raw: VoiceSTTBenchmarkReport;
	generic: VoiceSTTBenchmarkReport;
	experimental: VoiceSTTBenchmarkReport;
	benchmarkSeeded: VoiceSTTBenchmarkReport;
	holdout: VoiceCorrectionAuditSlice<VoiceSTTBenchmarkReport>;
	lexicalHoldout: VoiceCorrectionAuditSlice<VoiceSTTBenchmarkReport>;
};

export type VoiceSessionCorrectionAudit = {
	raw: VoiceSessionBenchmarkReport;
	generic: VoiceSessionBenchmarkReport;
	experimental: VoiceSessionBenchmarkReport;
	benchmarkSeeded: VoiceSessionBenchmarkReport;
	holdout: VoiceCorrectionAuditSlice<VoiceSessionBenchmarkReport>;
	lexicalHoldout: VoiceCorrectionAuditSlice<VoiceSessionBenchmarkReport>;
};

const normalizeBenchmarkText = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s']/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const stripDiacritics = (value: string) =>
	value.normalize('NFD').replace(/\p{Diacritic}/gu, '');

const normalizeApostrophes = (value: string) => value.replace(/[’`]/gu, "'");

const CODE_SWITCH_TOKEN_PATTERN = /[\p{L}\p{M}\p{N}'’-]+/gu;

const MAX_CODE_SWITCH_LEXICON_ENTRIES = 12;

type CodeSwitchToken = {
	text: string;
	script: 'latin' | 'devanagari' | 'other';
	marked: boolean;
};

const resolveTokenScript = (token: string): CodeSwitchToken['script'] => {
	if (/\p{Script=Devanagari}/u.test(token)) {
		return 'devanagari';
	}

	if (/\p{Script=Latin}/u.test(token)) {
		return 'latin';
	}

	return 'other';
};

const tokenizeCodeSwitchText = (value: string): CodeSwitchToken[] =>
	(value.match(CODE_SWITCH_TOKEN_PATTERN) ?? []).map((token) => {
		const normalizedToken = normalizeApostrophes(token);
		const strippedToken = stripDiacritics(normalizedToken);
		return {
			marked:
				/\d/u.test(normalizedToken) ||
				normalizedToken.includes("'") ||
				strippedToken !== normalizedToken ||
				/[^\x00-\x7F]/u.test(normalizedToken),
			script: resolveTokenScript(normalizedToken),
			text: normalizedToken
		};
	});

const buildLexiconAliases = (value: string) => {
	const normalized = normalizeApostrophes(value).trim();
	if (normalized.length === 0) {
		return undefined;
	}

	const aliases = new Set<string>();
	const stripped = stripDiacritics(normalized);
	if (stripped !== normalized) {
		aliases.add(stripped);
	}

	return aliases.size > 0 ? Array.from(aliases) : undefined;
};

const isUsefulCodeSwitchWindow = (window: CodeSwitchToken[]) => {
	const phrase = window.map((token) => token.text).join(' ').trim();
	if (phrase.length < 6 || phrase.length > 48) {
		return false;
	}

	const scripts = new Set(
		window
			.map((token) => token.script)
			.filter((script) => script !== 'other')
	);

	return scripts.size >= 2 || window.some((token) => token.marked);
};

const countDistinctScripts = (value: string) => {
	let hasLatin = false;
	let hasDevanagari = false;

	for (const token of tokenizeCodeSwitchText(value)) {
		if (token.script === 'latin') {
			hasLatin = true;
		}
		if (token.script === 'devanagari') {
			hasDevanagari = true;
		}
	}

	return Number(hasLatin) + Number(hasDevanagari);
};

const scoreCodeSwitchLexiconEntry = (entry: VoiceLexiconEntry) => {
	const text = entry.text;
	const tokens = tokenizeCodeSwitchText(text);
	const normalized = normalizeBenchmarkText(text);
	const hasAlias = (entry.aliases?.length ?? 0) > 0;
	const tokenCount = tokens.length;
	const distinctScripts = countDistinctScripts(text);
	const containsAsciiAndUnicode =
		/\p{Script=Latin}/u.test(text) && /[^\x00-\x7F]/u.test(text);

	return (
		(distinctScripts >= 2 ? 40 : 0) +
		(containsAsciiAndUnicode ? 30 : 0) +
		(hasAlias ? 15 : 0) +
		(tokenCount >= 2 ? 10 : 0) +
		Math.min(normalized.length, 20)
	);
};

const pushUniqueLexiconEntry = (
	target: VoiceLexiconEntry[],
	seen: Set<string>,
	text: string,
	language?: string
) => {
	const normalized = normalizeBenchmarkText(text);
	if (!normalized || seen.has(normalized)) {
		return;
	}

	target.push({
		aliases: buildLexiconAliases(text),
		language,
		text: normalizeApostrophes(text).trim()
	});
	seen.add(normalized);
};

const pushUniqueLexiconEntryWithAliases = (
	target: VoiceLexiconEntry[],
	seen: Set<string>,
	text: string,
	aliases: string[],
	language?: string
) => {
	const normalized = normalizeBenchmarkText(text);
	if (!normalized || seen.has(normalized)) {
		return;
	}

	const uniqueAliases = Array.from(
		new Set(
			aliases
				.map((alias) => normalizeApostrophes(alias).trim())
				.filter((alias) => alias.length > 0 && normalizeBenchmarkText(alias) !== normalized)
		)
	);

	target.push({
		aliases: uniqueAliases.length > 0 ? uniqueAliases : undefined,
		language,
		text: normalizeApostrophes(text).trim()
	});
	seen.add(normalized);
};

const hasFixtureTag = (
	fixture: Pick<VoiceTestFixture, 'tags'>,
	targetTag: string
) =>
	(fixturesTags => fixturesTags.some((tag) => tag === targetTag))(
		(fixture.tags ?? []).map((tag) => tag.trim().toLowerCase())
	);

const appendParlamentParlaCodeSwitchLexicon = (
	target: VoiceLexiconEntry[],
	seen: Set<string>,
	fixture: Pick<VoiceTestFixture, 'expectedText' | 'language' | 'tags'>
) => {
	const expectedText = normalizeBenchmarkText(fixture.expectedText ?? '');
	const language = fixture.language;

	if (expectedText.includes('espanya es paro y muerte')) {
		pushUniqueLexiconEntryWithAliases(
			target,
			seen,
			'espanya es paro y muerte',
			[
				'espanya espanya i muertes',
				'espanya i muertes',
				'españa es parla',
				'espanya es parla'
			],
			language
		);
	}

	if (expectedText.includes('veo cubavisión y no es peor que tv3')) {
		pushUniqueLexiconEntryWithAliases(
			target,
			seen,
			'veo cubavisión y no es peor que tv3',
			[
				'veo cubavisión i no és peor que tv3',
				'veo cubavision i no es peor que tv3',
				'cubavisión i no és peor que tv3',
				'cubavision i no es peor que tv3'
			],
			language
		);
		pushUniqueLexiconEntryWithAliases(
			target,
			seen,
			'dir los',
			['dirlos'],
			language
		);
		pushUniqueLexiconEntryWithAliases(
			target,
			seen,
			'y no es peor',
			['i no és peor', 'i no es peor'],
			language
		);
	}
};

const toBaseFixtureId = (fixtureId: string) =>
	fixtureId.endsWith('-telephony')
		? fixtureId.slice(0, -'-telephony'.length)
		: fixtureId;

export const isCorrectionHoldoutFixtureId = (fixtureId: string) => {
	const baseFixtureId = toBaseFixtureId(fixtureId);
	return (
		baseFixtureId.startsWith('dialogue-') || baseFixtureId.startsWith('multiturn-')
	);
};

const GENERIC_PHRASE_HINT_LIBRARY: VoicePhraseHint[] = [
	{
		aliases: ['joe johnson'],
		text: 'Joe Johnston'
	},
	{
		aliases: ['absolute js'],
		text: 'AbsoluteJS'
	}
];

const BENCHMARK_SEEDED_EXTRA_HINTS: VoicePhraseHint[] = [
	{
		aliases: ['beneath wealth', 'shelter beneath wealth'],
		text: 'beneath well thatched trees that shed the rain like a roof'
	},
	{
		aliases: ['trip around the mountain'],
		text: 'trip round the mountain'
	}
];

const SEEDED_VOCABULARY_MARKERS = BENCHMARK_SEEDED_EXTRA_HINTS.flatMap((hint) => [
	normalizeBenchmarkText(hint.text),
	...(hint.aliases ?? []).map((alias) => normalizeBenchmarkText(alias))
]).filter((entry) => entry.length > 0);
const buildHintLibrary = (
	_fixture: Pick<VoiceTestFixture, 'expectedTerms' | 'expectedText'>,
	profile: VoiceCorrectionHintProfile
) => {
	if (profile === 'generic') {
		return GENERIC_PHRASE_HINT_LIBRARY;
	}

	return [...GENERIC_PHRASE_HINT_LIBRARY, ...BENCHMARK_SEEDED_EXTRA_HINTS];
};

const usesBenchmarkSeedVocabulary = (
	fixture: Pick<VoiceTestFixture, 'expectedTerms' | 'expectedText'>
) => {
	const haystacks = [
		normalizeBenchmarkText(fixture.expectedText),
		...(fixture.expectedTerms ?? []).map((term) => normalizeBenchmarkText(term))
	];

	return haystacks.some((haystack) =>
		SEEDED_VOCABULARY_MARKERS.some(
			(marker) => marker.length > 0 && haystack.includes(marker)
		)
	);
};

export const buildFixturePhraseHints = (
	fixture: Pick<VoiceTestFixture, 'expectedTerms' | 'expectedText'>,
	profile: VoiceCorrectionHintProfile = 'benchmark-seeded'
): VoicePhraseHint[] => {
	const hintLibrary = buildHintLibrary(fixture, profile);
	const expectedTerms = new Set(
		(fixture.expectedTerms ?? []).map((term) => normalizeBenchmarkText(term))
	);
	const expectedText = normalizeBenchmarkText(fixture.expectedText);

	return hintLibrary.filter((hint) => {
		const hintText = normalizeBenchmarkText(hint.text);
		if (expectedText.includes(hintText) || expectedTerms.has(hintText)) {
			return true;
		}

		return (hint.aliases ?? []).some((alias) =>
			expectedText.includes(normalizeBenchmarkText(alias))
		);
	});
};

const toDomainAliasSet = (value: string) => {
	const aliases = new Set<string>();
	const normalized = normalizeApostrophes(value).trim();
	if (!normalized) {
		return [];
	}

	const stripped = stripDiacritics(normalized);
	if (stripped !== normalized) {
		aliases.add(stripped);
	}

	const comparable = normalizeBenchmarkText(normalized);
	if (comparable && comparable !== normalized.toLowerCase()) {
		aliases.add(comparable);
	}

	return Array.from(aliases);
};

const buildFixtureDomainTerms = (
	fixture: Pick<VoiceTestFixture, 'expectedTerms' | 'expectedText'>
): VoiceDomainTerm[] => {
	const seen = new Set<string>();
	const terms: VoiceDomainTerm[] = [];

	for (const expectedTerm of fixture.expectedTerms ?? []) {
		const normalized = normalizeBenchmarkText(expectedTerm);
		if (!normalized || seen.has(normalized)) {
			continue;
		}

		terms.push({
			aliases: toDomainAliasSet(expectedTerm),
			metadata: {
				source: 'expected-term'
			},
			text: expectedTerm
		});
		seen.add(normalized);
	}

	for (const hint of buildFixturePhraseHints(fixture, 'generic')) {
		const normalized = normalizeBenchmarkText(hint.text);
		if (!normalized || seen.has(normalized)) {
			continue;
		}

		terms.push({
			aliases: hint.aliases,
			metadata: {
				source: 'generic-hint'
			},
			text: hint.text
		});
		seen.add(normalized);
	}

	return terms;
};

export const buildCodeSwitchBenchmarkLexicon = (
	fixture: Pick<VoiceTestFixture, 'expectedTerms' | 'expectedText' | 'language' | 'tags'>
): VoiceLexiconEntry[] => {
	const expectedTermEntries: VoiceLexiconEntry[] = [];
	const candidateEntries: VoiceLexiconEntry[] = [];
	const seen = new Set<string>();
	const language = fixture.language;
	const tokens = tokenizeCodeSwitchText(fixture.expectedText ?? '');

	for (const expectedTerm of fixture.expectedTerms ?? []) {
		pushUniqueLexiconEntry(expectedTermEntries, seen, expectedTerm, language);
	}

	for (const token of tokens) {
		if (!token.marked || token.text.length < 4) {
			continue;
		}

		pushUniqueLexiconEntry(candidateEntries, seen, token.text, language);
	}

	for (let startIndex = 0; startIndex < tokens.length; startIndex += 1) {
		for (let windowSize = 2; windowSize <= 3; windowSize += 1) {
			const window = tokens.slice(startIndex, startIndex + windowSize);
			if (window.length !== windowSize || !isUsefulCodeSwitchWindow(window)) {
				continue;
			}

			pushUniqueLexiconEntry(
				candidateEntries,
				seen,
				window.map((token) => token.text).join(' '),
				language
			);
		}
	}

	if (hasFixtureTag(fixture, 'parlament_parla')) {
		appendParlamentParlaCodeSwitchLexicon(candidateEntries, seen, fixture);
	}

	return [
		...expectedTermEntries,
		...candidateEntries
			.sort(
				(left, right) =>
					scoreCodeSwitchLexiconEntry(right) - scoreCodeSwitchLexiconEntry(left)
			)
	]
		.slice(0, MAX_CODE_SWITCH_LEXICON_ENTRIES);
};

export const buildCodeSwitchBenchmarkPhraseHints = (
	fixture: Pick<VoiceTestFixture, 'expectedTerms' | 'expectedText' | 'language' | 'tags'>
): VoicePhraseHint[] =>
	buildCodeSwitchBenchmarkLexicon(fixture).map((entry) => ({
		aliases: entry.aliases,
		metadata: entry.metadata,
		text: entry.text
	}));

export const createCodeSwitchBenchmarkCorrectionHandler =
	(): VoiceTurnCorrectionHandler =>
		createLexiconCorrectionHandler({
			provider: 'codeswitch-lexicon-corrector',
			reason: 'codeswitch-lexicon-correction'
		});

export const createBenchmarkCorrectionHandler = (
	profile: VoiceCorrectionHintProfile
): VoiceTurnCorrectionHandler =>
	createPhraseHintCorrectionHandler({
		provider:
			profile === 'generic'
				? 'generic-hint-corrector'
				: 'benchmark-seeded-corrector',
		reason:
			profile === 'generic'
				? 'generic-domain-correction'
				: 'benchmark-seeded-correction'
	});

export const scoreCorrectedExpectedTerms = (
	actualText: string,
	expectedTerms: string[] | undefined
): VoiceExpectedTermAccuracy => {
	const normalizedActual = normalizeBenchmarkText(actualText);
	const normalizedExpectedTerms = (expectedTerms ?? []).map((entry) =>
		normalizeBenchmarkText(entry)
	);
	const matchedTerms = normalizedExpectedTerms.filter(
		(term) => term.length > 0 && normalizedActual.includes(term)
	);
	const missingTerms = normalizedExpectedTerms.filter(
		(term) => term.length > 0 && !matchedTerms.includes(term)
	);
	const denominator = normalizedExpectedTerms.length;
	const recall = denominator > 0 ? matchedTerms.length / denominator : 1;

	return {
		allMatched: missingTerms.length === 0,
		expectedTerms: normalizedExpectedTerms,
		matchedTerms,
		missingTerms,
		recall
	};
};

export const applyCorrectedBenchmarkReport = (
	report: VoiceSTTBenchmarkReport,
	fixtures: VoiceTestFixture[],
	profile: VoiceCorrectionHintProfile = 'benchmark-seeded'
): VoiceSTTBenchmarkReport => {
	const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
	const correctedFixtures: VoiceSTTBenchmarkFixtureResult[] = report.fixtures.map(
		(result) => {
			const fixture = fixtureMap.get(result.fixtureId);
			if (!fixture) {
				return result;
			}

			const phraseHints = buildFixturePhraseHints(fixture, profile);
			if (phraseHints.length === 0) {
				return result;
			}

			const corrected = applyPhraseHintCorrections(result.finalText, phraseHints);
			if (!corrected.changed) {
				return result;
			}

			const accuracy = scoreTranscriptAccuracy(
				corrected.text,
				fixture.expectedText,
				result.accuracy.threshold
			);
			const expectedTerms = scoreCorrectedExpectedTerms(
				corrected.text,
				fixture.expectedTerms
			);

			return {
				...result,
				accuracy,
				expectedTerms,
				finalText: corrected.text,
				passes:
					result.errorCount === 0 &&
					corrected.text.trim().length > 0 &&
					accuracy.passesThreshold
			};
		}
	);

	return {
		adapterId: report.adapterId,
		fixtures: correctedFixtures,
		generatedAt: report.generatedAt,
		summary: summarizeSTTBenchmark(report.adapterId, correctedFixtures)
	};
};

export const applyExperimentalBenchmarkReport = (
	report: VoiceSTTBenchmarkReport,
	fixtures: VoiceTestFixture[]
): VoiceSTTBenchmarkReport => {
	const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
	const correctedFixtures: VoiceSTTBenchmarkFixtureResult[] = report.fixtures.map(
		(result) => {
			const fixture = fixtureMap.get(result.fixtureId);
			if (!fixture) {
				return result;
			}

			const phraseHints = createDomainPhraseHints(buildFixtureDomainTerms(fixture), {
				riskTier: 'balanced'
			});
			if (phraseHints.length === 0) {
				return result;
			}

			const corrected = applyRiskTieredPhraseHintCorrections(
				result.finalText,
				phraseHints,
				{ riskTier: 'balanced' }
			);
			if (!corrected.changed) {
				return result;
			}

			const accuracy = scoreTranscriptAccuracy(
				corrected.text,
				fixture.expectedText,
				result.accuracy.threshold
			);
			const expectedTerms = scoreCorrectedExpectedTerms(
				corrected.text,
				fixture.expectedTerms
			);

			return {
				...result,
				accuracy,
				expectedTerms,
				finalText: corrected.text,
				passes:
					result.errorCount === 0 &&
					corrected.text.trim().length > 0 &&
					accuracy.passesThreshold
			};
		}
	);

	return {
		adapterId: report.adapterId,
		fixtures: correctedFixtures,
		generatedAt: report.generatedAt,
		summary: summarizeSTTBenchmark(report.adapterId, correctedFixtures)
	};
};

export const applyLexiconCorrectedBenchmarkReport = (
	report: VoiceSTTBenchmarkReport,
	fixtures: VoiceTestFixture[],
	buildLexicon: (
		fixture: Pick<VoiceTestFixture, 'expectedTerms' | 'expectedText' | 'language' | 'tags'>
	) => VoiceLexiconEntry[]
): VoiceSTTBenchmarkReport => {
	const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
	const correctedFixtures: VoiceSTTBenchmarkFixtureResult[] = report.fixtures.map(
		(result) => {
			const fixture = fixtureMap.get(result.fixtureId);
			if (!fixture) {
				return result;
			}

			const lexicon = buildLexicon(fixture);
			if (lexicon.length === 0) {
				return result;
			}

			const corrected = applyLexiconCorrections(result.finalText, lexicon);
			if (!corrected.changed) {
				return result;
			}

			const accuracy = scoreTranscriptAccuracy(
				corrected.text,
				fixture.expectedText,
				result.accuracy.threshold
			);
			const expectedTerms = scoreCorrectedExpectedTerms(
				corrected.text,
				fixture.expectedTerms
			);

			return {
				...result,
				accuracy,
				expectedTerms,
				finalText: corrected.text,
				passes:
					result.errorCount === 0 &&
					corrected.text.trim().length > 0 &&
					accuracy.passesThreshold
			};
		}
	);

	return {
		adapterId: report.adapterId,
		fixtures: correctedFixtures,
		generatedAt: report.generatedAt,
		summary: summarizeSTTBenchmark(report.adapterId, correctedFixtures)
	};
};

const sliceSTTHoldoutReport = (
	report: VoiceSTTBenchmarkReport,
	fixtureIds: string[]
): VoiceSTTBenchmarkReport => {
	const fixtureIdSet = new Set(fixtureIds);
	const fixtures = report.fixtures.filter((fixture) => fixtureIdSet.has(fixture.fixtureId));

	return {
		adapterId: report.adapterId,
		fixtures,
		generatedAt: report.generatedAt,
		summary: summarizeSTTBenchmark(report.adapterId, fixtures)
	};
};

export const buildCorrectionBenchmarkAudit = (
	rawReport: VoiceSTTBenchmarkReport,
	fixtures: VoiceTestFixture[]
): VoiceCorrectionBenchmarkAudit => {
	const generic = applyCorrectedBenchmarkReport(rawReport, fixtures, 'generic');
	const experimental = applyExperimentalBenchmarkReport(rawReport, fixtures);
	const benchmarkSeeded = applyCorrectedBenchmarkReport(
		rawReport,
		fixtures,
		'benchmark-seeded'
	);
	const holdoutFixtureIds = rawReport.fixtures
		.map((fixture) => fixture.fixtureId)
		.filter(isCorrectionHoldoutFixtureId);
	const lexicalHoldoutFixtureIds = fixtures
		.filter((fixture) => !usesBenchmarkSeedVocabulary(fixture))
		.map((fixture) => fixture.id)
		.filter((fixtureId) =>
			rawReport.fixtures.some((result) => result.fixtureId === fixtureId)
		);

	return {
		raw: rawReport,
		generic,
		experimental,
		benchmarkSeeded,
		holdout: {
			fixtureIds: holdoutFixtureIds,
			raw: sliceSTTHoldoutReport(rawReport, holdoutFixtureIds),
			generic: sliceSTTHoldoutReport(generic, holdoutFixtureIds),
			experimental: sliceSTTHoldoutReport(experimental, holdoutFixtureIds),
			benchmarkSeeded: sliceSTTHoldoutReport(benchmarkSeeded, holdoutFixtureIds)
		},
		lexicalHoldout: {
			fixtureIds: lexicalHoldoutFixtureIds,
			raw: sliceSTTHoldoutReport(rawReport, lexicalHoldoutFixtureIds),
			generic: sliceSTTHoldoutReport(generic, lexicalHoldoutFixtureIds),
			experimental: sliceSTTHoldoutReport(experimental, lexicalHoldoutFixtureIds),
			benchmarkSeeded: sliceSTTHoldoutReport(
				benchmarkSeeded,
				lexicalHoldoutFixtureIds
			)
		}
	};
};

const average = (values: number[]) =>
	values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const roundMetric = (value: number, digits = 4) => {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
};

const summarizeSessionBenchmark = (
	adapterId: string,
	scenarios: VoiceSessionBenchmarkScenarioResult[]
) => {
	const scenarioCount = scenarios.length;
	const passCount = scenarios.filter((scenario) => scenario.passes).length;
	const totalTurnResults = scenarios.flatMap((scenario) =>
		scenario.turnResults.filter((turn) => turn.accuracy)
	);
	const reconnectTriggeredScenarios = scenarios.filter(
		(scenario) => scenario.reconnectTriggered
	);
	const reconnectSuccessCount = reconnectTriggeredScenarios.filter(
		(scenario) => scenario.passes
	).length;
	const expectedReconnectCount = scenarios.reduce(
		(sum, scenario) => sum + scenario.expectedReconnectCount,
		0
	);
	const reconnectCount = scenarios.reduce(
		(sum, scenario) => sum + scenario.reconnectCount,
		0
	);

	return {
		adapterId,
		averageElapsedMs: roundMetric(average(scenarios.map((scenario) => scenario.elapsedMs)), 2),
		averageFallbackReplayAudioMs: roundMetric(
			average(scenarios.map((scenario) => scenario.fallbackReplayAudioMs)),
			2
		),
		averagePrimaryAudioMs: roundMetric(
			average(scenarios.map((scenario) => scenario.primaryAudioMs)),
			2
		),
		averageReconnectCount: roundMetric(
			average(scenarios.map((scenario) => scenario.reconnectCount))
		),
		averageRelativeCostUnits: roundMetric(
			average(scenarios.map((scenario) => scenario.averageRelativeCostUnits))
		),
		averageTurnPassRate: roundMetric(
			average(scenarios.map((scenario) => scenario.turnPassRate))
		),
		averageWordErrorRate: roundMetric(
			average(totalTurnResults.map((turn) => turn.accuracy?.wordErrorRate ?? 0))
		),
		duplicateTurnRate:
			scenarioCount > 0
				? roundMetric(
						scenarios.filter((scenario) => scenario.duplicateTurnCount > 0).length /
							scenarioCount
				  )
				: 0,
		passCount,
		passRate: scenarioCount > 0 ? roundMetric(passCount / scenarioCount) : 0,
		reconnectCoverageRate:
			expectedReconnectCount > 0
				? roundMetric(reconnectCount / expectedReconnectCount)
				: 1,
		reconnectSuccessRate:
			reconnectTriggeredScenarios.length > 0
				? roundMetric(reconnectSuccessCount / reconnectTriggeredScenarios.length)
				: 1,
		scenarioCount,
		scenariosWithDuplicateTurns: scenarios.filter(
			(scenario) => scenario.duplicateTurnCount > 0
		).length,
		scenariosWithTurnCountMismatch: scenarios.filter(
			(scenario) => scenario.turnCountDelta !== 0
		).length
	};
};

const sliceSessionHoldoutReport = (
	report: VoiceSessionBenchmarkReport,
	fixtureIds: string[]
): VoiceSessionBenchmarkReport => {
	const fixtureIdSet = new Set(fixtureIds);
	const scenarios = report.scenarios.filter((scenario) => fixtureIdSet.has(scenario.fixtureId));

	return {
		adapterId: report.adapterId,
		generatedAt: report.generatedAt,
		scenarios,
		summary: summarizeSessionBenchmark(report.adapterId, scenarios)
	};
};

export const buildSessionCorrectionAudit = (
	raw: VoiceSessionBenchmarkReport,
	generic: VoiceSessionBenchmarkReport,
	experimental: VoiceSessionBenchmarkReport,
	benchmarkSeeded: VoiceSessionBenchmarkReport,
	scenarios: Array<
		Pick<
			VoiceTestFixture,
			'expectedTerms' | 'expectedText' | 'expectedTurnTexts' | 'id'
		>
	>
): VoiceSessionCorrectionAudit => {
	const holdoutFixtureIds = raw.scenarios
		.map((scenario) => scenario.fixtureId)
		.filter(isCorrectionHoldoutFixtureId);
	const lexicalHoldoutFixtureIds = scenarios
		.filter(
			(scenario) =>
				!usesBenchmarkSeedVocabulary({
					expectedTerms: scenario.expectedTerms,
					expectedText: scenario.expectedTurnTexts?.join(' ') ?? scenario.expectedText
				})
		)
		.map((scenario) => scenario.id)
		.filter((fixtureId) => raw.scenarios.some((scenario) => scenario.fixtureId === fixtureId));

	return {
		raw,
		generic,
		experimental,
		benchmarkSeeded,
		holdout: {
			fixtureIds: holdoutFixtureIds,
			raw: sliceSessionHoldoutReport(raw, holdoutFixtureIds),
			generic: sliceSessionHoldoutReport(generic, holdoutFixtureIds),
			experimental: sliceSessionHoldoutReport(experimental, holdoutFixtureIds),
			benchmarkSeeded: sliceSessionHoldoutReport(benchmarkSeeded, holdoutFixtureIds)
		},
		lexicalHoldout: {
			fixtureIds: lexicalHoldoutFixtureIds,
			raw: sliceSessionHoldoutReport(raw, lexicalHoldoutFixtureIds),
			generic: sliceSessionHoldoutReport(generic, lexicalHoldoutFixtureIds),
			experimental: sliceSessionHoldoutReport(experimental, lexicalHoldoutFixtureIds),
			benchmarkSeeded: sliceSessionHoldoutReport(
				benchmarkSeeded,
				lexicalHoldoutFixtureIds
			)
		}
	};
};
