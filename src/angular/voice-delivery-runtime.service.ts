import { computed, Injectable, signal } from '@angular/core';
import {
	createVoiceDeliveryRuntimeStore,
	type VoiceDeliveryRuntimeClientOptions
} from '../client/deliveryRuntime';
import type { VoiceDeliveryRuntimeReport } from '../deliveryRuntime';

@Injectable({ providedIn: 'root' })
export class VoiceDeliveryRuntimeService {
	connect(
		path = '/api/voice-delivery-runtime',
		options: VoiceDeliveryRuntimeClientOptions = {}
	) {
		const store = createVoiceDeliveryRuntimeStore(path, options);
		const actionErrorSignal = signal<string | null>(null);
		const actionStatusSignal = signal<'idle' | 'running' | 'completed' | 'failed'>(
			'idle'
		);
		const errorSignal = signal<string | null>(null);
		const isLoadingSignal = signal(false);
		const reportSignal = signal<VoiceDeliveryRuntimeReport | undefined>(
			undefined
		);
		const updatedAtSignal = signal<number | undefined>(undefined);
		const sync = () => {
			const snapshot = store.getSnapshot();
			actionErrorSignal.set(snapshot.actionError);
			actionStatusSignal.set(snapshot.actionStatus);
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
			actionError: computed(() => actionErrorSignal()),
			actionStatus: computed(() => actionStatusSignal()),
			isLoading: computed(() => isLoadingSignal()),
			requeueDeadLetters: store.requeueDeadLetters,
			refresh: store.refresh,
			report: computed(() => reportSignal()),
			tick: store.tick,
			updatedAt: computed(() => updatedAtSignal())
		};
	}
}
