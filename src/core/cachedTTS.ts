import type {
	TTSAdapter,
	TTSAdapterOpenOptions,
	TTSAdapterSession,
	TTSAudioEvent
} from './types';

export type CachedTTSOptions = {
	/**
	 * Return a stable cache key for an utterance whose synthesized audio should
	 * be rendered once and replayed verbatim on later calls (typically a
	 * greeting / fixed prompt), or `null`/`undefined` to synthesize it live every
	 * time (dynamic turn replies).
	 *
	 * The key must encode everything that affects the audio — the text, the
	 * voice, the model, and the output format. Because the cache is
	 * content-addressed, editing any of those naturally produces a new key, so a
	 * stale rendering is never replayed: the first call after a change re-renders
	 * (and re-caches) while the old entry is simply orphaned.
	 */
	keyFor: (
		text: string,
		openOptions: TTSAdapterOpenOptions
	) => string | null | undefined;
	/** Max distinct utterances to retain (LRU by insertion). Default 32. */
	maxEntries?: number;
};

const DEFAULT_MAX_ENTRIES = 32;

/**
 * Wrap a TTS adapter so selected utterances are synthesized once and replayed
 * from memory on subsequent `send()`s — eliminating provider latency for fixed
 * prompts like a call greeting. Utterances are selected (and keyed) by
 * `options.keyFor`; everything else passes straight through to the inner
 * adapter, so dynamic replies are unaffected.
 *
 * The cache lives for the lifetime of the wrapper (one per adapter), so it is
 * shared across every session/call the adapter serves. Warm it ahead of the
 * first call by opening a session and `send()`ing the cacheable text once.
 */
export const createCachedTTS = (
	inner: TTSAdapter,
	options: CachedTTSOptions
): TTSAdapter<TTSAdapterOpenOptions> => {
	const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
	const cache = new Map<string, TTSAudioEvent[]>();

	const remember = (key: string, events: TTSAudioEvent[]) => {
		cache.delete(key);
		cache.set(key, events);
		while (cache.size > maxEntries) {
			const oldest = cache.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			cache.delete(oldest);
		}
	};

	return {
		kind: 'tts',
		open: async (openOptions): Promise<TTSAdapterSession> => {
			const session = await inner.open(openOptions);
			const audioHandlers = new Set<
				(payload: TTSAudioEvent) => void | Promise<void>
			>();
			let capture: TTSAudioEvent[] | null = null;

			// Tap the inner stream once: record while a cacheable utterance is
			// rendering. Consumer audio handlers stay wired to the inner session
			// directly (below), so live playback is unchanged.
			session.on('audio', (event) => {
				if (capture) {
					capture.push(event);
				}
			});

			return {
				cancel: async (reason) => {
					if (session.cancel) {
						await session.cancel(reason);
					}
				},
				close: (reason) => session.close(reason),
				on: (event, handler) => {
					if (event === 'audio') {
						// Tracked so a cache-hit can replay to the same handlers
						// the inner session would have driven.
						audioHandlers.add(handler as never);
					}

					return session.on(event, handler);
				},
				send: async (text) => {
					const key = options.keyFor(text, openOptions);
					if (key === null || key === undefined) {
						await session.send(text);

						return;
					}

					const cached = cache.get(key);
					if (cached) {
						for (const event of cached) {
							const replay: TTSAudioEvent = {
								...event,
								receivedAt: Date.now()
							};
							for (const handler of audioHandlers) {
								// eslint-disable-next-line no-await-in-loop -- ordered playback
								await Promise.resolve(handler(replay));
							}
						}

						return;
					}

					capture = [];
					await session.send(text);
					remember(key, capture);
					capture = null;
				}
			};
		}
	};
};
