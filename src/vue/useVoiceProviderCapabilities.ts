import { onUnmounted, shallowRef } from 'vue';
import {
	createVoiceProviderCapabilitiesStore,
	type VoiceProviderCapabilitiesClientOptions
} from '../client/providerCapabilities';
import type { VoiceProviderCapabilityReport } from '../providerCapabilities';

export const useVoiceProviderCapabilities = <
	TProvider extends string = string
>(
	path = '/api/provider-capabilities',
	options: VoiceProviderCapabilitiesClientOptions = {}
) => {
	const store = createVoiceProviderCapabilitiesStore<TProvider>(path, options);
	const error = shallowRef<string | null>(null);
	const isLoading = shallowRef(false);
	const report = shallowRef<VoiceProviderCapabilityReport<TProvider>>();
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
		updatedAt
	};
};
