import { onUnmounted, ref, shallowRef } from 'vue';
import {
	createVoiceOpsActionCenterStore,
	type VoiceOpsActionCenterClientOptions,
	type VoiceOpsActionDescriptor,
	type VoiceOpsActionRunResult
} from '../client/opsActionCenter';

export function useVoiceOpsActionCenter(
	options: VoiceOpsActionCenterClientOptions = {}
) {
	const store = createVoiceOpsActionCenterStore(options);
	const actions = shallowRef<VoiceOpsActionDescriptor[]>([]);
	const error = ref<string | null>(null);
	const isRunning = ref(false);
	const lastResult = shallowRef<VoiceOpsActionRunResult | undefined>(undefined);
	const runningActionId = ref<string | undefined>(undefined);
	const updatedAt = ref<number | undefined>(undefined);
	const sync = () => {
		const snapshot = store.getSnapshot();
		actions.value = snapshot.actions;
		error.value = snapshot.error;
		isRunning.value = snapshot.isRunning;
		lastResult.value = snapshot.lastResult;
		runningActionId.value = snapshot.runningActionId;
		updatedAt.value = snapshot.updatedAt;
	};
	const unsubscribe = store.subscribe(sync);
	sync();

	onUnmounted(() => {
		unsubscribe();
		store.close();
	});

	return {
		actions,
		error,
		isRunning,
		lastResult,
		run: store.run,
		runningActionId,
		setActions: store.setActions,
		updatedAt
	};
}
