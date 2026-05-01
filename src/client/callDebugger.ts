import type { VoiceCallDebuggerReport } from '../callDebugger';

export type VoiceCallDebuggerClientOptions = {
	fetch?: typeof fetch;
	intervalMs?: number;
};

export type VoiceCallDebuggerClientState = {
	error: string | null;
	isLoading: boolean;
	report?: VoiceCallDebuggerReport;
	updatedAt?: number;
};

export const fetchVoiceCallDebugger = async (
	path: string,
	options: Pick<VoiceCallDebuggerClientOptions, 'fetch'> = {}
) => {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	const response = await fetchImpl(path);
	if (!response.ok) {
		throw new Error(`Voice call debugger failed: HTTP ${response.status}`);
	}
	return (await response.json()) as VoiceCallDebuggerReport;
};

export const createVoiceCallDebuggerStore = (
	path: string,
	options: VoiceCallDebuggerClientOptions = {}
) => {
	const listeners = new Set<() => void>();
	let closed = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let snapshot: VoiceCallDebuggerClientState = {
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
			return snapshot.report;
		}
		snapshot = { ...snapshot, error: null, isLoading: true };
		emit();
		try {
			const report = await fetchVoiceCallDebugger(path, options);
			snapshot = {
				error: null,
				isLoading: false,
				report,
				updatedAt: Date.now()
			};
			emit();
			return report;
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
