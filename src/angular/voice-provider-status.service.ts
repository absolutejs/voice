import { computed, Injectable, signal } from '@angular/core';
import {
	createVoiceProviderStatusStore,
	type VoiceProviderStatusClientOptions
} from '../client/providerStatus';
import type { VoiceProviderHealthSummary } from '../providerHealth';

@Injectable({ providedIn: 'root' })
export class VoiceProviderStatusService {
	connect<TProvider extends string = string>(
		path = '/api/provider-status',
		options: VoiceProviderStatusClientOptions = {}
	) {
		const store = createVoiceProviderStatusStore<TProvider>(path, options);
		const errorSignal = signal<string | null>(null);
		const isLoadingSignal = signal(false);
		const providersSignal = signal<VoiceProviderHealthSummary<TProvider>[]>([]);
		const updatedAtSignal = signal<number | undefined>(undefined);
		const sync = () => {
			const snapshot = store.getSnapshot();
			errorSignal.set(snapshot.error);
			isLoadingSignal.set(snapshot.isLoading);
			providersSignal.set([...snapshot.providers]);
			updatedAtSignal.set(snapshot.updatedAt);
		};
		const unsubscribe = store.subscribe(sync);
		sync();
		void store.refresh().catch(() => {});

		return {
			close: () => {
				unsubscribe();
				store.close();
			},
			error: computed(() => errorSignal()),
			isLoading: computed(() => isLoadingSignal()),
			providers: computed(() => providersSignal()),
			refresh: store.refresh,
			updatedAt: computed(() => updatedAtSignal())
		};
	}
}
