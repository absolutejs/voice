import { computed, Injectable, signal } from '@angular/core';
import {
	createVoiceCallDebuggerStore,
	type VoiceCallDebuggerClientOptions
} from '../client/callDebugger';
import type { VoiceCallDebuggerReport } from '../callDebugger';

@Injectable({ providedIn: 'root' })
export class VoiceCallDebuggerService {
	connect(path: string, options: VoiceCallDebuggerClientOptions = {}) {
		const store = createVoiceCallDebuggerStore(path, options);
		const errorSignal = signal<string | null>(null);
		const isLoadingSignal = signal(false);
		const reportSignal = signal<VoiceCallDebuggerReport | undefined>(undefined);
		const updatedAtSignal = signal<number | undefined>(undefined);
		const sync = () => {
			const state = store.getSnapshot();
			errorSignal.set(state.error);
			isLoadingSignal.set(state.isLoading);
			reportSignal.set(state.report);
			updatedAtSignal.set(state.updatedAt);
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
