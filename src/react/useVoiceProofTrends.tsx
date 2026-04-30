import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
	createVoiceProofTrendsStore,
	type VoiceProofTrendsClientOptions
} from '../client/proofTrends';

export const useVoiceProofTrends = (
	path = '/api/voice/proof-trends',
	options: VoiceProofTrendsClientOptions = {}
) => {
	const storeRef = useRef<ReturnType<
		typeof createVoiceProofTrendsStore
	> | null>(null);

	if (!storeRef.current) {
		storeRef.current = createVoiceProofTrendsStore(path, options);
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
		refresh: store.refresh
	};
};
