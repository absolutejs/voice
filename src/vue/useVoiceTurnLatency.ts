import { onUnmounted, shallowRef } from 'vue';
import {
	createVoiceTurnLatencyStore,
	type VoiceTurnLatencyClientOptions
} from '../client/turnLatency';
import type { VoiceTurnLatencyReport } from '../turnLatency';

export const useVoiceTurnLatency = (
	path = '/api/turn-latency',
	options: VoiceTurnLatencyClientOptions = {}
) => {
	const store = createVoiceTurnLatencyStore(path, options);
	const error = shallowRef<string | null>(null);
	const isLoading = shallowRef(false);
	const report = shallowRef<VoiceTurnLatencyReport>();
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

	return {
		error,
		isLoading,
		refresh: store.refresh,
		report,
		runProof: store.runProof,
		updatedAt
	};
};
