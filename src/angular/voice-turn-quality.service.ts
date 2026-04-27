import { computed, Injectable, signal } from '@angular/core';
import {
	createVoiceTurnQualityStore,
	type VoiceTurnQualityClientOptions
} from '../client/turnQuality';
import type { VoiceTurnQualityReport } from '../turnQuality';

@Injectable({ providedIn: 'root' })
export class VoiceTurnQualityService {
	connect(
		path = '/api/turn-quality',
		options: VoiceTurnQualityClientOptions = {}
	) {
		const store = createVoiceTurnQualityStore(path, options);
		const errorSignal = signal<string | null>(null);
		const isLoadingSignal = signal(false);
		const reportSignal = signal<VoiceTurnQualityReport | undefined>(undefined);
		const updatedAtSignal = signal<number | undefined>(undefined);
		const sync = () => {
			const snapshot = store.getSnapshot();
			errorSignal.set(snapshot.error);
			isLoadingSignal.set(snapshot.isLoading);
			reportSignal.set(snapshot.report);
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
			refresh: store.refresh,
			report: computed(() => reportSignal()),
			updatedAt: computed(() => updatedAtSignal())
		};
	}
}
