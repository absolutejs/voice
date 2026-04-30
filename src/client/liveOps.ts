import type {
	VoiceLiveOpsAction,
	VoiceLiveOpsActionInput,
	VoiceLiveOpsActionResult
} from '../liveOps';

export type VoiceLiveOpsClientOptions = {
	actionPath?: string;
	fetch?: typeof fetch;
	onControl?: (result: VoiceLiveOpsActionResult) => Promise<void> | void;
};

export type VoiceLiveOpsSnapshot = {
	error: string | null;
	isRunning: boolean;
	lastResult?: VoiceLiveOpsActionResult;
	runningAction?: VoiceLiveOpsAction;
	updatedAt?: number;
};

export const postVoiceLiveOpsAction = async (
	input: VoiceLiveOpsActionInput,
	options: VoiceLiveOpsClientOptions = {}
): Promise<VoiceLiveOpsActionResult> => {
	if (!input.sessionId) {
		throw new Error('Start a voice session before running live ops actions.');
	}

	const fetchImpl = options.fetch ?? globalThis.fetch;
	const response = await fetchImpl(
		options.actionPath ?? '/api/voice/live-ops/action',
		{
			body: JSON.stringify(input),
			headers: {
				'Content-Type': 'application/json'
			},
			method: 'POST'
		}
	);
	const payload = await response.json().catch(() => null);

	if (!response.ok || !payload?.ok) {
		const message =
			payload && typeof payload === 'object' && 'error' in payload
				? String((payload as { error: unknown }).error)
				: `Voice live ops action failed: HTTP ${response.status}`;
		throw new Error(message);
	}

	return payload as VoiceLiveOpsActionResult;
};

export const createVoiceLiveOpsStore = (
	options: VoiceLiveOpsClientOptions = {}
) => {
	const listeners = new Set<() => void>();
	let closed = false;
	let snapshot: VoiceLiveOpsSnapshot = {
		error: null,
		isRunning: false
	};
	const emit = () => {
		for (const listener of listeners) {
			listener();
		}
	};
	const run = async (input: VoiceLiveOpsActionInput) => {
		if (closed) {
			return snapshot.lastResult;
		}

		snapshot = {
			...snapshot,
			error: null,
			isRunning: true,
			runningAction: input.action
		};
		emit();
		try {
			const result = await postVoiceLiveOpsAction(input, options);
			await options.onControl?.(result);
			snapshot = {
				...snapshot,
				error: null,
				isRunning: false,
				lastResult: result,
				runningAction: undefined,
				updatedAt: Date.now()
			};
			emit();
			return result;
		} catch (error) {
			snapshot = {
				...snapshot,
				error: error instanceof Error ? error.message : String(error),
				isRunning: false,
				runningAction: undefined,
				updatedAt: Date.now()
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

export type {
	VoiceLiveOpsAction,
	VoiceLiveOpsActionInput,
	VoiceLiveOpsActionResult
};
