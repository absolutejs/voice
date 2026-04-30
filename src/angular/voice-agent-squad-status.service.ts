import { computed, Injectable, signal } from '@angular/core';
import {
	createVoiceAgentSquadStatusStore,
	type VoiceAgentSquadStatusClientOptions,
	type VoiceAgentSquadStatusReport
} from '../client/agentSquadStatus';

@Injectable({ providedIn: 'root' })
export class VoiceAgentSquadStatusService {
	connect(
		path = '/api/voice-traces',
		options: VoiceAgentSquadStatusClientOptions = {}
	) {
		const store = createVoiceAgentSquadStatusStore(path, options);
		const errorSignal = signal<string | null>(null);
		const isLoadingSignal = signal(false);
		const reportSignal = signal<VoiceAgentSquadStatusReport | undefined>(
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
		void store.refresh().catch(() => {});

		return {
			close: () => {
				unsubscribe();
				store.close();
			},
			current: computed(() => reportSignal()?.current),
			error: computed(() => errorSignal()),
			isLoading: computed(() => isLoadingSignal()),
			refresh: store.refresh,
			report: computed(() => reportSignal()),
			updatedAt: computed(() => updatedAtSignal())
		};
	}
}
