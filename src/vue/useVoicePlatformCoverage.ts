import { onUnmounted, ref, shallowRef } from 'vue';
import {
	createVoicePlatformCoverageStore,
	type VoicePlatformCoverageClientOptions
} from '../client/platformCoverage';
import type { VoicePlatformCoverageSummary } from '../platformCoverage';

export function useVoicePlatformCoverage(
	path = '/api/voice/platform-coverage',
	options: VoicePlatformCoverageClientOptions = {}
) {
	const store = createVoicePlatformCoverageStore(path, options);
	const error = ref<string | null>(null);
	const isLoading = ref(false);
	const report = shallowRef<VoicePlatformCoverageSummary | undefined>(
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
