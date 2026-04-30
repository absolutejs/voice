import { onUnmounted, ref, shallowRef } from 'vue';
import {
	createVoiceProfileComparisonStore,
	type VoiceProfileComparisonClientOptions
} from '../client/profileComparison';
import type { VoiceRealCallProfileHistoryReport } from '../proofTrends';

export function useVoiceProfileComparison(
	path = '/api/voice/real-call-profile-history',
	options: VoiceProfileComparisonClientOptions = {}
) {
	const store = createVoiceProfileComparisonStore(path, options);
	const error = ref<string | null>(null);
	const isLoading = ref(false);
	const report = shallowRef<VoiceRealCallProfileHistoryReport | undefined>(
		undefined
	);
	const updatedAt = ref<number | undefined>(undefined);
	const sync = () => {
		const snapshot = store.getSnapshot();
		error.value = snapshot.error;
		isLoading.value = snapshot.isLoading;
		report.value = snapshot.report;
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
		updatedAt
	};
}
