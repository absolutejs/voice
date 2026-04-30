import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
	createVoiceLiveOpsStore,
	type VoiceLiveOpsClientOptions
} from '../client/liveOps';

export const useVoiceLiveOps = (options: VoiceLiveOpsClientOptions = {}) => {
	const storeRef = useRef<ReturnType<typeof createVoiceLiveOpsStore> | null>(
		null
	);

	if (!storeRef.current) {
		storeRef.current = createVoiceLiveOpsStore(options);
	}

	const store = storeRef.current;

	useEffect(() => () => store.close(), [store]);

	return {
		...useSyncExternalStore(
			store.subscribe,
			store.getSnapshot,
			store.getServerSnapshot
		),
		run: store.run
	};
};
