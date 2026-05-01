import {
	createVoiceSessionSnapshotStore,
	type VoiceSessionSnapshotClientOptions
} from '../client/sessionSnapshot';

export const createVoiceSessionSnapshot = (
	path: string,
	options: VoiceSessionSnapshotClientOptions = {}
) => createVoiceSessionSnapshotStore(path, options);
