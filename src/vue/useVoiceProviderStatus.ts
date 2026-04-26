import { onUnmounted, ref, shallowRef } from 'vue';
import {
	createVoiceProviderStatusStore,
	type VoiceProviderStatusClientOptions
} from '../client/providerStatus';
import type { VoiceProviderHealthSummary } from '../providerHealth';

export const useVoiceProviderStatus = <TProvider extends string = string>(
	path = '/api/provider-status',
	options: VoiceProviderStatusClientOptions = {}
) => {
	const store = createVoiceProviderStatusStore<TProvider>(path, options);
	const error = ref<string | null>(null);
	const isLoading = ref(false);
	const providers = shallowRef<VoiceProviderHealthSummary<TProvider>[]>([]);
	const updatedAt = ref<number | undefined>(undefined);
	const sync = () => {
		const snapshot = store.getSnapshot();
		error.value = snapshot.error;
		isLoading.value = snapshot.isLoading;
		providers.value = [...snapshot.providers];
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
		providers,
		refresh: store.refresh,
		updatedAt
	};
};
