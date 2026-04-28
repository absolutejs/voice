import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
	createVoiceOpsStatusStore,
	type VoiceOpsStatusClientOptions
} from '../client/opsStatus';

export const useVoiceOpsStatus = (
	path = '/api/voice/ops-status',
	options: VoiceOpsStatusClientOptions = {}
) => {
	const storeRef = useRef<ReturnType<typeof createVoiceOpsStatusStore> | null>(
		null
	);

	if (!storeRef.current) {
		storeRef.current = createVoiceOpsStatusStore(path, options);
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
