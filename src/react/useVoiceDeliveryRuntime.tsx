import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
	createVoiceDeliveryRuntimeStore,
	type VoiceDeliveryRuntimeClientOptions
} from '../client/deliveryRuntime';

export const useVoiceDeliveryRuntime = (
	path = '/api/voice-delivery-runtime',
	options: VoiceDeliveryRuntimeClientOptions = {}
) => {
	const storeRef = useRef<ReturnType<
		typeof createVoiceDeliveryRuntimeStore
	> | null>(null);

	if (!storeRef.current) {
		storeRef.current = createVoiceDeliveryRuntimeStore(path, options);
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
		requeueDeadLetters: store.requeueDeadLetters,
		refresh: store.refresh,
		tick: store.tick
	};
};
