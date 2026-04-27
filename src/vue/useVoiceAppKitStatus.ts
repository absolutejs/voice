import { onUnmounted, ref, shallowRef } from 'vue';
import {
	createVoiceAppKitStatusStore,
	type VoiceAppKitStatusClientOptions
} from '../client/appKitStatus';
import type { VoiceAppKitStatusReport } from '../appKit';

export const useVoiceAppKitStatus = (
	path = '/app-kit/status',
	options: VoiceAppKitStatusClientOptions = {}
) => {
	const store = createVoiceAppKitStatusStore(path, options);
	const error = ref<string | null>(null);
	const isLoading = ref(false);
	const report = shallowRef<VoiceAppKitStatusReport | undefined>(undefined);
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
};
