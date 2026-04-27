import { createVoiceTraceTimelineStore as createSharedVoiceTraceTimelineStore } from '../client/traceTimeline';
import {
	createVoiceTraceTimelineViewModel,
	renderVoiceTraceTimelineWidgetHTML,
	type VoiceTraceTimelineWidgetOptions
} from '../client/traceTimelineWidget';

export const createVoiceTraceTimeline = (
	path = '/api/voice-traces',
	options: VoiceTraceTimelineWidgetOptions = {}
) => {
	const store = createSharedVoiceTraceTimelineStore(path, options);
	return {
		...store,
		getHTML: () =>
			renderVoiceTraceTimelineWidgetHTML(store.getSnapshot(), options),
		getViewModel: () =>
			createVoiceTraceTimelineViewModel(store.getSnapshot(), options)
	};
};
