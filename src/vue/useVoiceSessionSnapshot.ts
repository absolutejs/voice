import { onUnmounted, shallowRef } from 'vue';
import {
	createVoiceSessionSnapshotStore,
	type VoiceSessionSnapshotClientOptions
} from '../client/sessionSnapshot';
import type { VoiceSessionSnapshot } from '../sessionSnapshot';

export function useVoiceSessionSnapshot(
	path: string,
	options: VoiceSessionSnapshotClientOptions = {}
) {
	const store = createVoiceSessionSnapshotStore(path, options);
	const error = shallowRef<string | null>(null);
	const isLoading = shallowRef(false);
	const snapshot = shallowRef<VoiceSessionSnapshot>();
	const updatedAt = shallowRef<number | undefined>(undefined);
	const sync = () => {
		const state = store.getSnapshot();
		error.value = state.error;
		isLoading.value = state.isLoading;
		snapshot.value = state.snapshot;
		updatedAt.value = state.updatedAt;
	};
	const unsubscribe = store.subscribe(sync);
	sync();
	void store.refresh().catch(() => {});
	onUnmounted(() => {
		unsubscribe();
		store.close();
	});

	return {
		download: store.download,
		error,
		isLoading,
		refresh: store.refresh,
		snapshot,
		updatedAt
	};
}
