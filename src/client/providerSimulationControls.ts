import type {
	VoiceIOProviderFailureSimulationMode,
	VoiceIOProviderFailureSimulationResult
} from '../testing/ioProviderSimulator';

export type VoiceProviderSimulationProvider<TProvider extends string = string> = {
	configured?: boolean;
	provider: TProvider;
};

export type VoiceProviderSimulationControlsOptions<
	TProvider extends string = string
> = {
	fallbackRequiredMessage?: string;
	fallbackRequiredProvider?: TProvider;
	failureMessage?: string;
	failureProviders?: readonly TProvider[];
	fetch?: typeof fetch;
	intervalMs?: number;
	kind?: 'stt' | 'tts' | string;
	pathPrefix?: string;
	providers: readonly VoiceProviderSimulationProvider<TProvider>[];
	recoveryMessage?: string;
	title?: string;
};

export type VoiceProviderSimulationControlsSnapshot<
	TProvider extends string = string
> = {
	error: string | null;
	isRunning: boolean;
	lastResult: VoiceIOProviderFailureSimulationResult<TProvider> | null;
	mode: VoiceIOProviderFailureSimulationMode | null;
	provider: TProvider | null;
	updatedAt?: number;
};

const postSimulation = async <TProvider extends string>(
	pathPrefix: string,
	mode: VoiceIOProviderFailureSimulationMode,
	provider: TProvider,
	fetchImpl: typeof fetch
) => {
	const response = await fetchImpl(
		`${pathPrefix}/${mode}?provider=${encodeURIComponent(provider)}`,
		{ method: 'POST' }
	);
	const body = await response.json().catch(() => null);
	if (!response.ok) {
		const message =
			body && typeof body === 'object' && 'error' in body
				? String(body.error)
				: `Voice provider simulation failed: HTTP ${response.status}`;
		throw new Error(message);
	}
	return body as VoiceIOProviderFailureSimulationResult<TProvider>;
};

export const createVoiceProviderSimulationControlsStore = <
	TProvider extends string = string
>(options: VoiceProviderSimulationControlsOptions<TProvider>) => {
	const listeners = new Set<() => void>();
	const fetchImpl = options.fetch ?? globalThis.fetch;
	const pathPrefix = options.pathPrefix ?? `/api/${options.kind ?? 'stt'}-simulate`;
	let closed = false;
	let snapshot: VoiceProviderSimulationControlsSnapshot<TProvider> = {
		error: null,
		isRunning: false,
		lastResult: null,
		mode: null,
		provider: null
	};
	const emit = () => {
		for (const listener of listeners) {
			listener();
		}
	};
	const run = async (
		provider: TProvider,
		mode: VoiceIOProviderFailureSimulationMode
	) => {
		if (closed) {
			return snapshot.lastResult;
		}
		snapshot = {
			...snapshot,
			error: null,
			isRunning: true,
			mode,
			provider
		};
		emit();
		try {
			const result = await postSimulation(pathPrefix, mode, provider, fetchImpl);
			snapshot = {
				error: null,
				isRunning: false,
				lastResult: result,
				mode,
				provider,
				updatedAt: Date.now()
			};
			emit();
			return result;
		} catch (error) {
			snapshot = {
				...snapshot,
				error: error instanceof Error ? error.message : String(error),
				isRunning: false
			};
			emit();
			throw error;
		}
	};
	const close = () => {
		closed = true;
		listeners.clear();
	};

	return {
		close,
		getServerSnapshot: () => snapshot,
		getSnapshot: () => snapshot,
		run,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
	};
};
