import type { VoiceSessionSnapshot } from '../sessionSnapshot';

export type VoiceSessionSnapshotClientOptions = {
	fetch?: typeof fetch;
	intervalMs?: number;
	turnId?: string;
};

export type VoiceSessionSnapshotClientState = {
	error: string | null;
	isLoading: boolean;
	snapshot?: VoiceSessionSnapshot;
	updatedAt?: number;
};

const withTurnId = (path: string, turnId?: string) => {
	if (!turnId) {
		return path;
	}
	const url = new URL(path, 'http://absolutejs.local');
	url.searchParams.set('turnId', turnId);
	return `${url.pathname}${url.search}`;
};

export const fetchVoiceSessionSnapshot = async (
	path: string,
	options: Pick<VoiceSessionSnapshotClientOptions, 'fetch' | 'turnId'> = {}
) => {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	const response = await fetchImpl(withTurnId(path, options.turnId));
	if (!response.ok) {
		throw new Error(`Voice session snapshot failed: HTTP ${response.status}`);
	}
	return (await response.json()) as VoiceSessionSnapshot;
};

export const createVoiceSessionSnapshotStore = (
	path: string,
	options: VoiceSessionSnapshotClientOptions = {}
) => {
	const listeners = new Set<() => void>();
	let closed = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let snapshot: VoiceSessionSnapshotClientState = {
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
			return snapshot.snapshot;
		}
		snapshot = { ...snapshot, error: null, isLoading: true };
		emit();
		try {
			const next = await fetchVoiceSessionSnapshot(path, options);
			snapshot = {
				error: null,
				isLoading: false,
				snapshot: next,
				updatedAt: Date.now()
			};
			emit();
			return next;
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
	const download = () => {
		const current = snapshot.snapshot;
		if (current === undefined) {
			throw new Error('Voice session snapshot has not been loaded.');
		}
		return new Blob([JSON.stringify(current, null, 2)], {
			type: 'application/json'
		});
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
		download,
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
