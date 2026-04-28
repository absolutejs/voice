import { onUnmounted, ref, shallowRef } from 'vue';
import {
	createVoiceTraceTimelineStore,
	type VoiceTraceTimelineClientOptions
} from '../client/traceTimeline';
import type { VoiceTraceTimelineReport } from '../traceTimeline';

export function useVoiceTraceTimeline(
	path = '/api/voice-traces',
	options: VoiceTraceTimelineClientOptions = {}
) {
	const store = createVoiceTraceTimelineStore(path, options);
	const error = ref<string | null>(null);
	const isLoading = ref(false);
	const report = shallowRef<VoiceTraceTimelineReport | null>(null);
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
	void store.refresh().catch(() => {});

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
