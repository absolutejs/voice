import { computed, Injectable, signal } from '@angular/core';
import {
	createVoiceWorkflowStatusStore,
	type VoiceWorkflowStatusClientOptions
} from '../client/workflowStatus';
import type { VoiceScenarioEvalReport } from '../evalRoutes';

@Injectable({ providedIn: 'root' })
export class VoiceWorkflowStatusService {
	connect(
		path = '/evals/scenarios/json',
		options: VoiceWorkflowStatusClientOptions = {}
	) {
		const store = createVoiceWorkflowStatusStore(path, options);
		const errorSignal = signal<string | null>(null);
		const isLoadingSignal = signal(false);
		const reportSignal = signal<VoiceScenarioEvalReport | undefined>(undefined);
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
