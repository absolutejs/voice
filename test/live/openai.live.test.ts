import { describe, expect, test } from 'bun:test';
import { openai } from '../../../voice-adapters/openai/src';
import { loadVoiceTestEnv } from './env';

describe('openai live realtime', async () => {
	const env = await loadVoiceTestEnv();
	const apiKey = env.OPENAI_API_KEY;

	if (!apiKey) {
		test.skip('requires OPENAI_API_KEY in voice/.env', () => {});
		return;
	}

	test(
		'streams audio for a short realtime text turn',
		async () => {
			const adapter = openai({
				apiKey,
				model: 'gpt-realtime-mini',
				voice: 'marin'
			});
			const session = await adapter.open({
				format: {
					channels: 1,
					container: 'raw',
					encoding: 'pcm_s16le',
					sampleRateHz: 24000
				},
				sessionId: 'openai-live-test'
			});
			const audioChunks: Uint8Array[] = [];
			const errors: string[] = [];
			const unsubscribers = [
				session.on('audio', (event) => {
					audioChunks.push(
						event.chunk instanceof Uint8Array
							? event.chunk
							: new Uint8Array(
									event.chunk.buffer,
									event.chunk.byteOffset,
									event.chunk.byteLength
							  )
					);
					expect(event.format.sampleRateHz).toBe(24000);
					expect(event.format.encoding).toBe('pcm_s16le');
				}),
				session.on('error', (event) => {
					errors.push(event.error.message);
				})
			];

			try {
				await session.send(
					'Say exactly: OpenAI realtime adapter test.'
				);
				await Bun.sleep(6_000);
			} finally {
				await session.close();
				for (const unsubscribe of unsubscribers) {
					unsubscribe();
				}
			}

			const totalBytes = audioChunks.reduce(
				(sum, chunk) => sum + chunk.byteLength,
				0
			);

			expect(errors).toHaveLength(0);
			expect(audioChunks.length).toBeGreaterThan(0);
			expect(totalBytes).toBeGreaterThan(2048);
		},
		20_000
	);
});
