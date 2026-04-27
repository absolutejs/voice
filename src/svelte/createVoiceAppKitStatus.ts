import { createVoiceAppKitStatusStore as createSharedVoiceAppKitStatusStore } from '../client/appKitStatus';
import type { VoiceAppKitStatusClientOptions } from '../client/appKitStatus';

export const createVoiceAppKitStatus = (
	path = '/app-kit/status',
	options: VoiceAppKitStatusClientOptions = {}
) => createSharedVoiceAppKitStatusStore(path, options);
