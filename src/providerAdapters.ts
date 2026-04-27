import type {
	STTAdapter,
	STTAdapterOpenOptions,
	TTSAdapter,
	TTSAdapterOpenOptions,
	TTSAdapterSession,
	TTSSessionEventMap,
	VoiceCloseEvent
} from './types';
import type { VoiceProviderRouterProviderProfile } from './modelAdapters';

type MaybePromise<T> = T | Promise<T>;
type VoiceIOProviderKind = 'stt' | 'tts';
type VoiceIOProviderStatus = 'error' | 'fallback' | 'success';

export type VoiceIOProviderRouterEvent<TProvider extends string = string> = {
	at: number;
	attempt: number;
	elapsedMs: number;
	error?: string;
	fallbackProvider?: TProvider;
	kind: VoiceIOProviderKind;
	latencyBudgetMs?: number;
	operation: 'open' | 'send';
	provider: TProvider;
	selectedProvider: TProvider;
	status: VoiceIOProviderStatus;
	timedOut?: boolean;
};

export type VoiceIOProviderRouterOptions<
	TProvider extends string,
	TAdapter,
	TOpenOptions
> = {
	adapters: Partial<Record<TProvider, TAdapter>>;
	fallback?: readonly TProvider[] | ((input: TOpenOptions) => MaybePromise<readonly TProvider[]>);
	isProviderError?: (error: unknown, provider: TProvider) => boolean;
	onProviderEvent?: (
		event: VoiceIOProviderRouterEvent<TProvider>,
		input: TOpenOptions
	) => Promise<void> | void;
	providerProfiles?: Partial<Record<TProvider, VoiceProviderRouterProviderProfile>>;
	selectProvider?: (input: TOpenOptions) => MaybePromise<TProvider | undefined>;
	timeoutMs?: number;
};

export type VoiceSTTProviderRouterOptions<
	TProvider extends string = string,
	TOptions extends STTAdapterOpenOptions = STTAdapterOpenOptions
> = VoiceIOProviderRouterOptions<TProvider, STTAdapter<TOptions>, TOptions>;

export type VoiceTTSProviderRouterOptions<
	TProvider extends string = string,
	TOptions extends TTSAdapterOpenOptions = TTSAdapterOpenOptions
> = VoiceIOProviderRouterOptions<TProvider, TTSAdapter<TOptions>, TOptions>;

class VoiceIOProviderTimeoutError extends Error {
	provider: string;
	timeoutMs: number;

	constructor(kind: VoiceIOProviderKind, provider: string, timeoutMs: number) {
		super(`Voice ${kind} provider ${provider} exceeded ${timeoutMs}ms latency budget.`);
		this.name = 'VoiceIOProviderTimeoutError';
		this.provider = provider;
		this.timeoutMs = timeoutMs;
	}
}

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const createEmitter = <TEvents extends Record<string, unknown>>() => {
	const listeners = new Map<keyof TEvents, Set<(payload: never) => void | Promise<void>>>();

	return {
		emit: async <K extends keyof TEvents>(event: K, payload: TEvents[K]) => {
			await Promise.all(
				[...(listeners.get(event) ?? [])].map((handler) =>
					Promise.resolve(handler(payload as never))
				)
			);
		},
		on: <K extends keyof TEvents>(
			event: K,
			handler: (payload: TEvents[K]) => void | Promise<void>
		) => {
			const set = listeners.get(event) ?? new Set();
			set.add(handler as never);
			listeners.set(event, set);
			return () => {
				set.delete(handler as never);
			};
		}
	};
};

const getTimeoutMs = <TProvider extends string, TAdapter, TOpenOptions>(
	options: VoiceIOProviderRouterOptions<TProvider, TAdapter, TOpenOptions>,
	provider: TProvider
) => {
	const timeoutMs = options.providerProfiles?.[provider]?.timeoutMs ?? options.timeoutMs;
	return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
		? timeoutMs
		: undefined;
};

const withTimeout = async <T>(input: {
	kind: VoiceIOProviderKind;
	operation: 'open' | 'send';
	provider: string;
	run: () => MaybePromise<T>;
	timeoutMs?: number;
}) => {
	if (!input.timeoutMs) {
		return input.run();
	}

	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			Promise.resolve(input.run()),
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() =>
						reject(
							new VoiceIOProviderTimeoutError(
								input.kind,
								input.provider,
								input.timeoutMs!
							)
						),
					input.timeoutMs
				);
			})
		]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
};

const createResolver = <TProvider extends string, TAdapter, TOpenOptions>(
	options: VoiceIOProviderRouterOptions<TProvider, TAdapter, TOpenOptions>
) => {
	const providerIds = Object.keys(options.adapters) as TProvider[];
	const firstProvider = providerIds[0];
	const resolveOrder = async (input: TOpenOptions) => {
		const selectedProvider = (await options.selectProvider?.(input)) ?? firstProvider;
		const fallbackOrder =
			typeof options.fallback === 'function'
				? await options.fallback(input)
				: options.fallback;
		const candidates = [selectedProvider, ...(fallbackOrder ?? providerIds)];
		const seen = new Set<TProvider>();
		const order = candidates.filter((provider): provider is TProvider => {
			if (!provider || seen.has(provider) || !options.adapters[provider]) {
				return false;
			}
			seen.add(provider);
			return true;
		});

		return {
			order,
			selectedProvider
		};
	};

	const emit = async (
		event: VoiceIOProviderRouterEvent<TProvider>,
		input: TOpenOptions
	) => {
		await options.onProviderEvent?.(event, input);
	};

	return {
		emit,
		providerIds,
		resolveOrder
	};
};

export const createVoiceSTTProviderRouter = <
	TProvider extends string = string,
	TOptions extends STTAdapterOpenOptions = STTAdapterOpenOptions
>(
	options: VoiceSTTProviderRouterOptions<TProvider, TOptions>
): STTAdapter<TOptions> => {
	const resolver = createResolver(options);

	return {
		kind: 'stt',
		open: async (input) => {
			const { order, selectedProvider } = await resolver.resolveOrder(input);
			if (!selectedProvider || order.length === 0) {
				throw new Error('Voice STT provider router has no available providers.');
			}

			let lastError: unknown;
			for (const [index, provider] of order.entries()) {
				const adapter = options.adapters[provider];
				if (!adapter) {
					continue;
				}
				const startedAt = Date.now();
				try {
					const session = await withTimeout({
						kind: 'stt',
						operation: 'open',
						provider,
						run: () => adapter.open(input),
						timeoutMs: getTimeoutMs(options, provider)
					});
					await resolver.emit(
						{
							at: Date.now(),
							attempt: index + 1,
							elapsedMs: Date.now() - startedAt,
							fallbackProvider:
								provider === selectedProvider ? undefined : provider,
							kind: 'stt',
							latencyBudgetMs: getTimeoutMs(options, provider),
							operation: 'open',
							provider,
							selectedProvider,
							status: provider === selectedProvider ? 'success' : 'fallback'
						},
						input
					);
					return session;
				} catch (error) {
					lastError = error;
					const hasNextProvider = index < order.length - 1;
					const shouldFallback =
						options.isProviderError?.(error, provider) ?? true;
					await resolver.emit(
						{
							at: Date.now(),
							attempt: index + 1,
							elapsedMs: Date.now() - startedAt,
							error: errorMessage(error),
							fallbackProvider: shouldFallback ? order[index + 1] : undefined,
							kind: 'stt',
							latencyBudgetMs: getTimeoutMs(options, provider),
							operation: 'open',
							provider,
							selectedProvider,
							status: 'error',
							timedOut: error instanceof VoiceIOProviderTimeoutError
						},
						input
					);
					if (!hasNextProvider || !shouldFallback) {
						throw error;
					}
				}
			}

			throw lastError ?? new Error('Voice STT provider router did not open a provider.');
		}
	};
};

export const createVoiceTTSProviderRouter = <
	TProvider extends string = string,
	TOptions extends TTSAdapterOpenOptions = TTSAdapterOpenOptions
>(
	options: VoiceTTSProviderRouterOptions<TProvider, TOptions>
): TTSAdapter<TOptions> => {
	const resolver = createResolver(options);

	return {
		kind: 'tts',
		open: async (input) => {
			const { order, selectedProvider } = await resolver.resolveOrder(input);
			if (!selectedProvider || order.length === 0) {
				throw new Error('Voice TTS provider router has no available providers.');
			}
			const emitter = createEmitter<TTSSessionEventMap>();
			let activeSession: TTSAdapterSession | undefined;
			let activeProvider: TProvider | undefined;
			let nextProviderIndex = 0;

			const attach = (session: TTSAdapterSession) => {
				session.on('audio', (event) => emitter.emit('audio', event));
				session.on('error', (event) => emitter.emit('error', event));
				session.on('close', (event) => emitter.emit('close', event));
			};

			const openProvider = async (provider: TProvider, attempt: number) => {
				const adapter = options.adapters[provider];
				if (!adapter) {
					throw new Error(`Voice TTS provider ${provider} is not configured.`);
				}
				const startedAt = Date.now();
				const session = await withTimeout({
					kind: 'tts',
					operation: 'open',
					provider,
					run: () => adapter.open(input),
					timeoutMs: getTimeoutMs(options, provider)
				});
				attach(session);
				activeSession = session;
				activeProvider = provider;
				await resolver.emit(
					{
						at: Date.now(),
						attempt,
						elapsedMs: Date.now() - startedAt,
						fallbackProvider:
							provider === selectedProvider ? undefined : provider,
						kind: 'tts',
						latencyBudgetMs: getTimeoutMs(options, provider),
						operation: 'open',
						provider,
						selectedProvider,
						status: provider === selectedProvider ? 'success' : 'fallback'
					},
					input
				);
				return session;
			};

			const failProvider = async (inputEvent: {
				attempt: number;
				error: unknown;
				operation: 'open' | 'send';
				provider: TProvider;
				startedAt: number;
			}) => {
				const shouldFallback =
					options.isProviderError?.(inputEvent.error, inputEvent.provider) ??
					true;
				await resolver.emit(
					{
						at: Date.now(),
						attempt: inputEvent.attempt,
						elapsedMs: Date.now() - inputEvent.startedAt,
						error: errorMessage(inputEvent.error),
						fallbackProvider: shouldFallback ? order[nextProviderIndex] : undefined,
						kind: 'tts',
						latencyBudgetMs: getTimeoutMs(options, inputEvent.provider),
						operation: inputEvent.operation,
						provider: inputEvent.provider,
						selectedProvider,
						status: 'error',
						timedOut: inputEvent.error instanceof VoiceIOProviderTimeoutError
					},
					input
				);
				return shouldFallback;
			};

			for (const [index, provider] of order.entries()) {
				nextProviderIndex = index + 1;
				const startedAt = Date.now();
				try {
					await openProvider(provider, index + 1);
					break;
				} catch (error) {
					const shouldFallback = await failProvider({
						attempt: index + 1,
						error,
						operation: 'open',
						provider,
						startedAt
					});
					if (!shouldFallback || index >= order.length - 1) {
						throw error;
					}
				}
			}

			if (!activeSession || !activeProvider) {
				throw new Error('Voice TTS provider router did not open a provider.');
			}

			const sendWithFallback = async (text: string) => {
				for (;;) {
					const session = activeSession;
					const provider = activeProvider;
					if (!session || !provider) {
						throw new Error('Voice TTS provider router has no active provider.');
					}

					const startedAt = Date.now();
					try {
						await withTimeout({
							kind: 'tts',
							operation: 'send',
							provider,
							run: () => session.send(text),
							timeoutMs: getTimeoutMs(options, provider)
						});
						return;
					} catch (error) {
						const shouldFallback = await failProvider({
							attempt: nextProviderIndex,
							error,
							operation: 'send',
							provider,
							startedAt
						});
						const nextProvider = order[nextProviderIndex];
						if (!shouldFallback || !nextProvider) {
							throw error;
						}
						nextProviderIndex += 1;
						await session.close('tts-provider-fallback').catch(() => {});
						await openProvider(nextProvider, nextProviderIndex);
					}
				}
			};

			return {
				close: async (reason?: string) => {
					await activeSession?.close(reason);
					activeSession = undefined;
					activeProvider = undefined;
					await emitter.emit('close', {
						reason,
						type: 'close'
					} satisfies VoiceCloseEvent);
				},
				on: emitter.on,
				send: sendWithFallback
			};
		}
	};
};
