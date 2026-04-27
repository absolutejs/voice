import { createVoiceWorkflowStatusStore as createSharedVoiceWorkflowStatusStore } from '../client/workflowStatus';
import type { VoiceWorkflowStatusClientOptions } from '../client/workflowStatus';

export const createVoiceWorkflowStatus = (
	path = '/evals/scenarios/json',
	options: VoiceWorkflowStatusClientOptions = {}
) => createSharedVoiceWorkflowStatusStore(path, options);
