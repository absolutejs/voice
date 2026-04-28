import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
	createVoiceCampaignDialerProofStore,
	type VoiceCampaignDialerProofClientOptions
} from '../client/campaignDialerProof';

export const useVoiceCampaignDialerProof = (
	path = '/api/voice/campaigns/dialer-proof',
	options: VoiceCampaignDialerProofClientOptions = {}
) => {
	const storeRef = useRef<ReturnType<typeof createVoiceCampaignDialerProofStore> | null>(
		null
	);

	if (!storeRef.current) {
		storeRef.current = createVoiceCampaignDialerProofStore(path, options);
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
