import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
	createVoiceProviderStatusStore,
	type VoiceProviderStatusClientOptions
} from '../client/providerStatus';

export const useVoiceProviderStatus = <TProvider extends string = string>(
	path = '/api/provider-status',
	options: VoiceProviderStatusClientOptions = {}
) => {
	const storeRef = useRef<ReturnType<
		typeof createVoiceProviderStatusStore<TProvider>
	> | null>(null);

	if (!storeRef.current) {
		storeRef.current = createVoiceProviderStatusStore<TProvider>(path, options);
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
