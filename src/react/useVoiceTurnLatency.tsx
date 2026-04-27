import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
	createVoiceTurnLatencyStore,
	type VoiceTurnLatencyClientOptions
} from '../client/turnLatency';

export const useVoiceTurnLatency = (
	path = '/api/turn-latency',
	options: VoiceTurnLatencyClientOptions = {}
) => {
	const storeRef = useRef<ReturnType<typeof createVoiceTurnLatencyStore> | null>(
		null
	);

	if (!storeRef.current) {
		storeRef.current = createVoiceTurnLatencyStore(path, options);
	}

	const store = storeRef.current;

	useEffect(() => {
		void store.refresh().catch(() => {});
		return () => store.close();
	}, [store]);

	return {
		...useSyncExternalStore(
			store.subscribe,
			store.getSnapshot,
			store.getServerSnapshot
		),
		refresh: store.refresh,
		runProof: store.runProof
	};
};
