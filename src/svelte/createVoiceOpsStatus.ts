import {
	createVoiceOpsStatusViewModel,
	renderVoiceOpsStatusHTML,
	type VoiceOpsStatusWidgetOptions
} from '../client/opsStatusWidget';
import { createVoiceAppKitStatusStore } from '../client/appKitStatus';

export const createVoiceOpsStatus = (
	path = '/app-kit/status',
	options: VoiceOpsStatusWidgetOptions = {}
) => {
	const store = createVoiceAppKitStatusStore(path, options);

	return {
		close: store.close,
		getHTML: () => renderVoiceOpsStatusHTML(store.getSnapshot(), options),
		getSnapshot: store.getSnapshot,
		getViewModel: () =>
			createVoiceOpsStatusViewModel(store.getSnapshot(), options),
		refresh: store.refresh,
		subscribe: store.subscribe
	};
};
