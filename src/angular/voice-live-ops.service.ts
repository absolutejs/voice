import { computed, Injectable, signal } from '@angular/core';
import {
	createVoiceLiveOpsStore,
	type VoiceLiveOpsAction,
	type VoiceLiveOpsActionResult,
	type VoiceLiveOpsClientOptions
} from '../client/liveOps';

@Injectable({ providedIn: 'root' })
export class VoiceLiveOpsService {
	connect(options: VoiceLiveOpsClientOptions = {}) {
		const store = createVoiceLiveOpsStore(options);
		const errorSignal = signal<string | null>(null);
		const isRunningSignal = signal(false);
		const lastResultSignal = signal<VoiceLiveOpsActionResult | undefined>(
			undefined
		);
		const runningActionSignal = signal<VoiceLiveOpsAction | undefined>(
			undefined
		);
		const sync = () => {
			const snapshot = store.getSnapshot();
			errorSignal.set(snapshot.error);
			isRunningSignal.set(snapshot.isRunning);
			lastResultSignal.set(snapshot.lastResult);
			runningActionSignal.set(snapshot.runningAction);
		};
		const unsubscribe = store.subscribe(sync);
		sync();

		return {
			close: () => {
				unsubscribe();
				store.close();
			},
			error: computed(() => errorSignal()),
			isRunning: computed(() => isRunningSignal()),
			lastResult: computed(() => lastResultSignal()),
			run: store.run,
			runningAction: computed(() => runningActionSignal())
		};
	}
}
