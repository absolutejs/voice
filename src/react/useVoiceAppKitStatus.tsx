import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
	createVoiceAppKitStatusStore,
	type VoiceAppKitStatusClientOptions
} from '../client/appKitStatus';

export const useVoiceAppKitStatus = (
	path = '/app-kit/status',
	options: VoiceAppKitStatusClientOptions = {}
) => {
	const storeRef = useRef<ReturnType<
		typeof createVoiceAppKitStatusStore
	> | null>(null);

	if (!storeRef.current) {
		storeRef.current = createVoiceAppKitStatusStore(path, options);
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
