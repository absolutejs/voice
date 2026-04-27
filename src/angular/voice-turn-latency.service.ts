import { computed, Injectable, signal } from '@angular/core';
import {
	createVoiceTurnLatencyStore,
	type VoiceTurnLatencyClientOptions
} from '../client/turnLatency';
import type { VoiceTurnLatencyReport } from '../turnLatency';

@Injectable({ providedIn: 'root' })
export class VoiceTurnLatencyService {
	connect(
		path = '/api/turn-latency',
		options: VoiceTurnLatencyClientOptions = {}
	) {
		const store = createVoiceTurnLatencyStore(path, options);
		const errorSignal = signal<string | null>(null);
		const isLoadingSignal = signal(false);
		const reportSignal = signal<VoiceTurnLatencyReport | undefined>(undefined);
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
			runProof: store.runProof,
			updatedAt: computed(() => updatedAtSignal())
		};
	}
}
