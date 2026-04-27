import { createVoiceProviderStatusStore as createSharedVoiceProviderStatusStore } from '../client/providerStatus';
import {
	createVoiceProviderStatusViewModel,
	renderVoiceProviderStatusHTML,
	type VoiceProviderStatusWidgetOptions
} from '../client/providerStatusWidget';

export const createVoiceProviderStatus = <TProvider extends string = string>(
	path = '/api/provider-status',
	options: VoiceProviderStatusWidgetOptions = {}
) => {
	const store = createSharedVoiceProviderStatusStore<TProvider>(path, options);
	return {
		...store,
		getHTML: () => renderVoiceProviderStatusHTML(store.getSnapshot(), options),
		getViewModel: () =>
			createVoiceProviderStatusViewModel(store.getSnapshot(), options)
	};
};
