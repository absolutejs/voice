import { onUnmounted, ref, shallowRef } from 'vue';
import {
	createVoiceDeliveryRuntimeStore,
	type VoiceDeliveryRuntimeClientOptions
} from '../client/deliveryRuntime';
import type { VoiceDeliveryRuntimeReport } from '../deliveryRuntime';

export function useVoiceDeliveryRuntime(
	path = '/api/voice-delivery-runtime',
	options: VoiceDeliveryRuntimeClientOptions = {}
) {
	const store = createVoiceDeliveryRuntimeStore(path, options);
	const actionError = ref<string | null>(null);
	const actionStatus = ref<'idle' | 'running' | 'completed' | 'failed'>('idle');
	const error = ref<string | null>(null);
	const isLoading = ref(false);
	const report = shallowRef<VoiceDeliveryRuntimeReport | undefined>(undefined);
	const updatedAt = ref<number | undefined>(undefined);
	const sync = () => {
		const snapshot = store.getSnapshot();
		actionError.value = snapshot.actionError;
		actionStatus.value = snapshot.actionStatus;
		error.value = snapshot.error;
		isLoading.value = snapshot.isLoading;
		report.value = snapshot.report;
		updatedAt.value = snapshot.updatedAt;
	};
	const unsubscribe = store.subscribe(sync);
	sync();
	if (typeof window !== 'undefined') {
		void store.refresh().catch(() => {});
	}

	onUnmounted(() => {
		unsubscribe();
		store.close();
	});

	return {
		actionError,
		actionStatus,
		error,
		isLoading,
		requeueDeadLetters: store.requeueDeadLetters,
		refresh: store.refresh,
		report,
		tick: store.tick,
		updatedAt
	};
}
