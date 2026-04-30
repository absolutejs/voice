import { onBeforeUnmount, readonly, ref } from 'vue';
import {
	createVoiceReadinessFailuresStore,
	type VoiceReadinessFailuresClientOptions
} from '../client/readinessFailures';
import type { VoiceProductionReadinessReport } from '../productionReadiness';

export const useVoiceReadinessFailures = (
	path = '/api/production-readiness',
	options: VoiceReadinessFailuresClientOptions = {}
) => {
	const store = createVoiceReadinessFailuresStore(path, options);
	const error = ref<string | null>(null);
	const isLoading = ref(false);
	const report = ref<VoiceProductionReadinessReport | undefined>(undefined);
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
	onBeforeUnmount(() => {
		unsubscribe();
		store.close();
	});

	return {
		error: readonly(error),
		isLoading: readonly(isLoading),
		refresh: store.refresh,
		report: readonly(report),
		updatedAt: readonly(updatedAt)
	};
};
