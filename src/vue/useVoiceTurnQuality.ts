import { onUnmounted, shallowRef } from 'vue';
import {
	createVoiceTurnQualityStore,
	type VoiceTurnQualityClientOptions
} from '../client/turnQuality';
import type { VoiceTurnQualityReport } from '../turnQuality';

export const useVoiceTurnQuality = (
	path = '/api/turn-quality',
	options: VoiceTurnQualityClientOptions = {}
) => {
	const store = createVoiceTurnQualityStore(path, options);
	const error = shallowRef<string | null>(null);
	const isLoading = shallowRef(false);
	const report = shallowRef<VoiceTurnQualityReport>();
	const updatedAt = shallowRef<number | undefined>(undefined);
	const sync = () => {
		const snapshot = store.getSnapshot();
		error.value = snapshot.error;
		isLoading.value = snapshot.isLoading;
		report.value = snapshot.report;
		updatedAt.value = snapshot.updatedAt;
	};
	const unsubscribe = store.subscribe(sync);
	sync();
	void store.refresh().catch(() => {});
	onUnmounted(() => {
		unsubscribe();
		store.close();
	});

	return { error, isLoading, refresh: store.refresh, report, updatedAt };
};
