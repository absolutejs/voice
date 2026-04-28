import { onUnmounted, shallowRef } from 'vue';
import {
	createVoiceCampaignDialerProofStore,
	type VoiceCampaignDialerProofClientOptions
} from '../client/campaignDialerProof';
import type {
	VoiceCampaignDialerProofReport,
	VoiceCampaignDialerProofStatus
} from '../campaignDialers';

export function useVoiceCampaignDialerProof(
	path = '/api/voice/campaigns/dialer-proof',
	options: VoiceCampaignDialerProofClientOptions = {}
) {
	const store = createVoiceCampaignDialerProofStore(path, options);
	const error = shallowRef<string | null>(null);
	const isLoading = shallowRef(false);
	const report = shallowRef<VoiceCampaignDialerProofReport>();
	const status = shallowRef<VoiceCampaignDialerProofStatus>();
	const updatedAt = shallowRef<number | undefined>(undefined);
	const sync = () => {
		const snapshot = store.getSnapshot();
		error.value = snapshot.error;
		isLoading.value = snapshot.isLoading;
		report.value = snapshot.report;
		status.value = snapshot.status;
		updatedAt.value = snapshot.updatedAt;
	};
	const unsubscribe = store.subscribe(sync);
	sync();
	if (typeof window !== 'undefined') {
		void store.refresh().catch(() => {});
	}
	onUnmounted(() => {
		unsubscribe();
		store.close();
	});

	return {
		error,
		isLoading,
		refresh: store.refresh,
		report,
		runProof: store.runProof,
		status,
		updatedAt
	};
};
