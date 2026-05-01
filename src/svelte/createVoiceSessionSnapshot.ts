import {
	createVoiceSessionSnapshotStore,
	type VoiceSessionSnapshotClientOptions
} from '../client/sessionSnapshot';
import {
	createVoiceSessionSnapshotViewModel,
	renderVoiceSessionSnapshotHTML,
	type VoiceSessionSnapshotWidgetOptions
} from '../client/sessionSnapshotWidget';

export const createVoiceSessionSnapshot = (
	path: string,
	options: VoiceSessionSnapshotWidgetOptions = {}
) => {
	const store = createVoiceSessionSnapshotStore(path, options);
	return {
		...store,
		getHTML: () =>
			renderVoiceSessionSnapshotHTML(store.getSnapshot(), options),
		getViewModel: () =>
			createVoiceSessionSnapshotViewModel(store.getSnapshot(), options)
	};
};

export type { VoiceSessionSnapshotClientOptions };
