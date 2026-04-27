import { Injectable, signal } from '@angular/core';
import {
	createVoiceRoutingStatusStore,
	type VoiceRoutingStatusClientOptions
} from '../client/routingStatus';
import type { VoiceRoutingDecisionSummary } from '../resilienceRoutes';

@Injectable({ providedIn: 'root' })
export class VoiceRoutingStatusService {
	connect(path = '/api/routing/latest', options: VoiceRoutingStatusClientOptions = {}) {
		const store = createVoiceRoutingStatusStore(path, options);
		const decisionSignal = signal<VoiceRoutingDecisionSummary | null>(null);
		const errorSignal = signal<string | null>(null);
		const isLoadingSignal = signal(false);
		const updatedAtSignal = signal<number | undefined>(undefined);
		const sync = () => {
			const snapshot = store.getSnapshot();
			decisionSignal.set(snapshot.decision);
			errorSignal.set(snapshot.error);
			isLoadingSignal.set(snapshot.isLoading);
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
			decision: decisionSignal.asReadonly(),
			error: errorSignal.asReadonly(),
			isLoading: isLoadingSignal.asReadonly(),
			refresh: store.refresh,
			updatedAt: updatedAtSignal.asReadonly()
		};
	}
}
