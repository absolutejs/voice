import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
	createVoiceAgentSquadStatusStore,
	type VoiceAgentSquadStatusClientOptions
} from '../client/agentSquadStatus';

export const useVoiceAgentSquadStatus = (
	path = '/api/voice-traces',
	options: VoiceAgentSquadStatusClientOptions = {}
) => {
	const storeRef = useRef<ReturnType<
		typeof createVoiceAgentSquadStatusStore
	> | null>(null);

	if (!storeRef.current) {
		storeRef.current = createVoiceAgentSquadStatusStore(path, options);
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
