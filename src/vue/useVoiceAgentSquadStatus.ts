import { onUnmounted, ref, shallowRef } from 'vue';
import {
	createVoiceAgentSquadStatusStore,
	type VoiceAgentSquadSpecialist,
	type VoiceAgentSquadStatusClientOptions,
	type VoiceAgentSquadStatusReport
} from '../client/agentSquadStatus';

export function useVoiceAgentSquadStatus(
	path = '/api/voice-traces',
	options: VoiceAgentSquadStatusClientOptions = {}
) {
	const store = createVoiceAgentSquadStatusStore(path, options);
	const current = shallowRef<VoiceAgentSquadSpecialist | undefined>(undefined);
	const error = ref<string | null>(null);
	const isLoading = ref(false);
	const report = shallowRef<VoiceAgentSquadStatusReport | undefined>(undefined);
	const updatedAt = ref<number | undefined>(undefined);
	const sync = () => {
		const snapshot = store.getSnapshot();
		current.value = snapshot.report.current;
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
		current,
		error,
		isLoading,
		refresh: store.refresh,
		report,
		updatedAt
	};
}
