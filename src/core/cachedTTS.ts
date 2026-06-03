import type {
  TTSAdapter,
  TTSAdapterOpenOptions,
  TTSAdapterSession,
  TTSAudioEvent,
} from "./types";

/**
 * Optional persistent backing store for the cache — an L2 behind the in-memory
 * LRU. Lets rendered audio survive process restarts/deploys so a fixed prompt
 * (e.g. a greeting) is synthesized once *ever* per content key, not once per
 * process. The store is content-addressed by the same `keyFor` key, so a
 * changed prompt/voice/model naturally lands on a new key and re-renders.
 *
 * The store is told `TTSAudioEvent[]` and must return the same on read; how it
 * serializes the binary `chunk`s (base64 in JSON, bytea, a file, etc.) is up to
 * the implementation. `get` returns `null`/`undefined` on a miss. Both may be
 * sync or async; errors should be swallowed by the implementation (a store
 * failure must never break playback — the wrapper falls back to live render).
 */
export type CachedTTSStore = {
  get: (
    key: string,
  ) =>
    | Promise<TTSAudioEvent[] | null | undefined>
    | TTSAudioEvent[]
    | null
    | undefined;
  set: (key: string, events: TTSAudioEvent[]) => Promise<void> | void;
};

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
    openOptions: TTSAdapterOpenOptions,
  ) => string | null | undefined;
  /** Max distinct utterances to retain in memory (LRU by insertion). Default 32. */
  maxEntries?: number;
  /**
   * Optional persistent L2 store (see {@link CachedTTSStore}). When set, an
   * in-memory miss consults the store before rendering; a store hit is replayed
   * and promoted into memory, and a fresh render is written through to it. Omit
   * for memory-only behaviour (unchanged).
   */
  store?: CachedTTSStore;
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
  options: CachedTTSOptions,
): TTSAdapter<TTSAdapterOpenOptions> => {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const { store } = options;
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

  // L2 read: consult the persistent store on an in-memory miss. A store hit is
  // promoted into memory so later sends in this process skip the store too. Any
  // store error degrades to a live render (returns null) — never throws.
  const loadFromStore = async (key: string) => {
    if (!store) return null;
    try {
      const events = await store.get(key);
      if (events && events.length > 0) {
        remember(key, events);

        return events;
      }
    } catch {
      // store unavailable — fall through to live render
    }

    return null;
  };

  return {
    kind: "tts",
    open: async (openOptions): Promise<TTSAdapterSession> => {
      const session = await inner.open(openOptions);
      const audioHandlers = new Set<
        (payload: TTSAudioEvent) => void | Promise<void>
      >();
      let capture: TTSAudioEvent[] | null = null;

      // Tap the inner stream once: record while a cacheable utterance is
      // rendering. Consumer audio handlers stay wired to the inner session
      // directly (below), so live playback is unchanged.
      session.on("audio", (event) => {
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
          if (event === "audio") {
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

          const replayEvents = async (events: TTSAudioEvent[]) => {
            for (const event of events) {
              const replay: TTSAudioEvent = {
                ...event,
                receivedAt: Date.now(),
              };
              for (const handler of audioHandlers) {
                // eslint-disable-next-line no-await-in-loop -- ordered playback
                await Promise.resolve(handler(replay));
              }
            }
          };

          const cached = cache.get(key) ?? (await loadFromStore(key));
          // Only replay a non-empty hit. A defensively-guarded length check so a
          // stray empty entry can never short-circuit into silent playback.
          if (cached && cached.length > 0) {
            await replayEvents(cached);

            return;
          }

          capture = [];
          await session.send(text);
          const rendered = capture;
          capture = null;
          // Never cache an empty render. A provider fault (quota, rate limit,
          // dropped socket) that resolves `send` with zero audio events would
          // otherwise be remembered as `[]` and replayed as permanent silence —
          // `cache.get` returns that empty array as a "hit". Leaving it uncached
          // lets the next send re-render once the provider recovers.
          if (rendered.length === 0) {
            return;
          }
          remember(key, rendered);
          // Write through to the persistent store so the next process/deploy
          // replays this render instead of paying the provider again.
          if (store) {
            try {
              await store.set(key, rendered);
            } catch {
              // store write failed — memory cache still serves this process
            }
          }
        },
      };
    },
  };
};
