import type { VoiceRoutingDecisionSummary } from '../resilienceRoutes';

export type VoiceRoutingStatusClientOptions = {
	fetch?: typeof fetch;
	intervalMs?: number;
};

export type VoiceRoutingStatusSnapshot = {
	decision: VoiceRoutingDecisionSummary | null;
	error: string | null;
	isLoading: boolean;
	updatedAt?: number;
};

export const fetchVoiceRoutingStatus = async (
	path = '/api/routing/latest',
	options: Pick<VoiceRoutingStatusClientOptions, 'fetch'> = {}
) => {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	const response = await fetchImpl(path);
	if (!response.ok) {
		throw new Error(`Voice routing status failed: HTTP ${response.status}`);
	}
	return (await response.json()) as VoiceRoutingDecisionSummary | null;
};

export const createVoiceRoutingStatusStore = (
	path = '/api/routing/latest',
	options: VoiceRoutingStatusClientOptions = {}
) => {
	const listeners = new Set<() => void>();
	let closed = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let snapshot: VoiceRoutingStatusSnapshot = {
		decision: null,
		error: null,
		isLoading: false
	};
	const emit = () => {
		for (const listener of listeners) {
			listener();
		}
	};
	const refresh = async () => {
		if (closed) {
			return snapshot.decision;
		}
		snapshot = {
			...snapshot,
			error: null,
			isLoading: true
		};
		emit();
		try {
			const decision = await fetchVoiceRoutingStatus(path, options);
			snapshot = {
				decision,
				error: null,
				isLoading: false,
				updatedAt: Date.now()
			};
			emit();
			return decision;
		} catch (error) {
			snapshot = {
				...snapshot,
				error: error instanceof Error ? error.message : String(error),
				isLoading: false
			};
			emit();
			throw error;
		}
	};
	const close = () => {
		closed = true;
		if (timer) {
			clearInterval(timer);
			timer = undefined;
		}
		listeners.clear();
	};

	if (options.intervalMs && options.intervalMs > 0) {
		timer = setInterval(() => {
			void refresh().catch(() => {});
		}, options.intervalMs);
	}

	return {
		close,
		getServerSnapshot: () => snapshot,
		getSnapshot: () => snapshot,
		refresh,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
	};
};
