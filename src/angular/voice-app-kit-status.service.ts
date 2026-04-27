import { computed, Injectable, signal } from '@angular/core';
import {
	createVoiceAppKitStatusStore,
	type VoiceAppKitStatusClientOptions
} from '../client/appKitStatus';
import type { VoiceAppKitStatusReport } from '../appKit';

@Injectable({ providedIn: 'root' })
export class VoiceAppKitStatusService {
	connect(
		path = '/app-kit/status',
		options: VoiceAppKitStatusClientOptions = {}
	) {
		const store = createVoiceAppKitStatusStore(path, options);
		const errorSignal = signal<string | null>(null);
		const isLoadingSignal = signal(false);
		const reportSignal = signal<VoiceAppKitStatusReport | undefined>(undefined);
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
		if (typeof window !== 'undefined') {
			void store.refresh().catch(() => {});
		}

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
