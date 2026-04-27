import { onUnmounted, ref, shallowRef } from 'vue';
import {
	createVoiceWorkflowStatusStore,
	type VoiceWorkflowStatusClientOptions
} from '../client/workflowStatus';
import type { VoiceScenarioEvalReport } from '../evalRoutes';

export const useVoiceWorkflowStatus = (
	path = '/evals/scenarios/json',
	options: VoiceWorkflowStatusClientOptions = {}
) => {
	const store = createVoiceWorkflowStatusStore(path, options);
	const error = ref<string | null>(null);
	const isLoading = ref(false);
	const report = shallowRef<VoiceScenarioEvalReport | undefined>(undefined);
	const updatedAt = ref<number | undefined>(undefined);
	const sync = () => {
		const snapshot = store.getSnapshot();
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
		error,
		isLoading,
		refresh: store.refresh,
		report,
		updatedAt
	};
};
