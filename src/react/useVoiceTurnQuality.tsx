import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
	createVoiceTurnQualityStore,
	type VoiceTurnQualityClientOptions
} from '../client/turnQuality';

export const useVoiceTurnQuality = (
	path = '/api/turn-quality',
	options: VoiceTurnQualityClientOptions = {}
) => {
	const storeRef = useRef<ReturnType<typeof createVoiceTurnQualityStore> | null>(
		null
	);

	if (!storeRef.current) {
		storeRef.current = createVoiceTurnQualityStore(path, options);
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
