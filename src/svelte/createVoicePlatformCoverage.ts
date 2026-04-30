import { createVoicePlatformCoverageStore } from '../client/platformCoverage';
import type { VoicePlatformCoverageClientOptions } from '../client/platformCoverage';

export const createVoicePlatformCoverage = (
	path = '/api/voice/platform-coverage',
	options: VoicePlatformCoverageClientOptions = {}
) => {
	const store = createVoicePlatformCoverageStore(path, options);

	return {
		close: store.close,
		getSnapshot: store.getSnapshot,
		refresh: store.refresh,
		subscribe: store.subscribe
	};
};
