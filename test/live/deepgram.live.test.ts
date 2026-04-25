import { describe, expect, test } from 'bun:test';
import { deepgram } from '../../../voice-adapters/deepgram/src';
import { loadVoiceTestFixtures } from '../../src/testing/fixtures';
import { runSTTAdapterFixture } from '../../src/testing/stt';
import { loadVoiceTestEnv } from './env';

describe('deepgram live fixtures', async () => {
	const env = await loadVoiceTestEnv();
	const apiKey = env.DEEPGRAM_API_KEY;
	const fixtures = await loadVoiceTestFixtures();
	const selectedFixtures = fixtures.filter((fixture) =>
		['quietly-alone-clean', 'rainstorms-noisy'].includes(fixture.id)
	);

	if (!apiKey) {
		test.skip('requires DEEPGRAM_API_KEY in voice/.env', () => {});
		return;
	}

	const adapter = deepgram({
		apiKey,
		endpointing: false,
		interimResults: true,
		model: 'nova-3',
		punctuate: true,
		smartFormat: true,
		utteranceEndMs: 1500,
		vadEvents: true
	});

	for (const fixture of selectedFixtures) {
		test(
			`transcribes ${fixture.id}`,
			async () => {
				const result = await runSTTAdapterFixture(adapter, fixture, {
					idleTimeoutMs: 10_000,
					settleMs: 1_000,
					tailPaddingMs: 1_500,
					transcriptThreshold:
						fixture.id === 'rainstorms-noisy' ? 0.4 : 0.2,
					waitForRealtimeMs: 100
				});

				expect(result.errorEvents).toHaveLength(0);
				expect(result.finalText.length).toBeGreaterThan(0);
				expect(result.accuracy.passesThreshold).toBe(true);
			},
			20_000
		);
	}
});
