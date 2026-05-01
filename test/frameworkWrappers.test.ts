import { expect, test } from 'bun:test';
import {
	VoiceCallDebuggerLaunch as ReactVoiceCallDebuggerLaunch,
	useVoiceCallDebugger as useReactVoiceCallDebugger
} from '../src/react';
import {
	VoiceCallDebuggerLaunch as VueVoiceCallDebuggerLaunch,
	useVoiceCallDebugger as useVueVoiceCallDebugger
} from '../src/vue';
import { createVoiceCallDebugger } from '../src/svelte';
import { VoiceCallDebuggerService } from '../src/angular';

test('call debugger framework wrappers are exported', () => {
	expect(typeof ReactVoiceCallDebuggerLaunch).toBe('function');
	expect(typeof useReactVoiceCallDebugger).toBe('function');
	expect(typeof VueVoiceCallDebuggerLaunch).toBe('object');
	expect(typeof useVueVoiceCallDebugger).toBe('function');
	expect(typeof createVoiceCallDebugger).toBe('function');
	expect(typeof VoiceCallDebuggerService).toBe('function');
});

test('svelte call debugger wrapper exposes html and view model helpers', () => {
	const callDebugger = createVoiceCallDebugger('/api/voice-call-debugger/latest', {
		fetch: async () =>
			Response.json({
				operationsRecord: {
					providerDecisionSummary: {
						fallbacks: 0,
						recoveryStatus: 'none'
					},
					summary: {
						errorCount: 0,
						eventCount: 0,
						turnCount: 0
					}
				},
				sessionId: 'session-wrapper',
				snapshot: {
					status: 'pass'
				},
				status: 'healthy'
			})
	});

	expect(callDebugger.getHTML()).toContain('Open debugger');
	expect(callDebugger.getViewModel()).toMatchObject({
		label: 'No call loaded',
		status: 'empty'
	});
	callDebugger.close();
});
