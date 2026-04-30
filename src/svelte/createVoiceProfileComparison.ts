import { createVoiceProfileComparisonStore } from '../client/profileComparison';
import type { VoiceProfileComparisonClientOptions } from '../client/profileComparison';

export const createVoiceProfileComparison = (
	path = '/api/voice/real-call-profile-history',
	options: VoiceProfileComparisonClientOptions = {}
) => {
	const store = createVoiceProfileComparisonStore(path, options);

	return {
		close: store.close,
		getSnapshot: store.getSnapshot,
		refresh: store.refresh,
		subscribe: store.subscribe
	};
};
