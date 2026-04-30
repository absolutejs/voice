import { computed, Injectable, signal } from '@angular/core';
import {
	createVoicePlatformCoverageStore,
	type VoicePlatformCoverageClientOptions
} from '../client/platformCoverage';
import type { VoicePlatformCoverageSummary } from '../platformCoverage';

@Injectable({ providedIn: 'root' })
export class VoicePlatformCoverageService {
	connect(
		path = '/api/voice/platform-coverage',
		options: VoicePlatformCoverageClientOptions = {}
	) {
		const store = createVoicePlatformCoverageStore(path, options);
		const errorSignal = signal<string | null>(null);
		const isLoadingSignal = signal(false);
		const reportSignal = signal<VoicePlatformCoverageSummary | undefined>(
			undefined
		);
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
