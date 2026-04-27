import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
	createVoiceRoutingStatusStore,
	type VoiceRoutingStatusClientOptions
} from '../client/routingStatus';

export const useVoiceRoutingStatus = (
	path = '/api/routing/latest',
	options: VoiceRoutingStatusClientOptions = {}
) => {
	const storeRef = useRef<ReturnType<
		typeof createVoiceRoutingStatusStore
	> | null>(null);

	if (!storeRef.current) {
		storeRef.current = createVoiceRoutingStatusStore(path, options);
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
