import { createVoiceProviderStatusStore as createSharedVoiceProviderStatusStore } from '../client/providerStatus';
import type { VoiceProviderStatusClientOptions } from '../client/providerStatus';

export const createVoiceProviderStatus = <TProvider extends string = string>(
	path = '/api/provider-status',
	options: VoiceProviderStatusClientOptions = {}
) => createSharedVoiceProviderStatusStore<TProvider>(path, options);
