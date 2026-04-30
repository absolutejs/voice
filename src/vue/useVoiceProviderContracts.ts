import { onUnmounted, shallowRef } from 'vue';
import {
	createVoiceProviderContractsStore,
	type VoiceProviderContractsClientOptions
} from '../client/providerContracts';
import type { VoiceProviderContractMatrixReport } from '../providerStackRecommendations';

export function useVoiceProviderContracts<TProvider extends string = string>(
	path = '/api/provider-contracts',
	options: VoiceProviderContractsClientOptions = {}
) {
	const store = createVoiceProviderContractsStore<TProvider>(path, options);
	const error = shallowRef<string | null>(null);
	const isLoading = shallowRef(false);
	const report = shallowRef<VoiceProviderContractMatrixReport<TProvider>>();
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
}
