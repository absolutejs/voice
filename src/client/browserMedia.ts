import {
	buildMediaWebRTCStatsReport,
	buildMediaWebRTCStreamContinuityReport,
	collectMediaWebRTCStats
} from '@absolutejs/media';
import type { MediaWebRTCStatsSample } from '@absolutejs/media';
import type {
	VoiceBrowserMediaReporterOptions,
	VoiceBrowserMediaReportPayload
} from '../types';

const DEFAULT_BROWSER_MEDIA_PATH = '/api/voice/browser-media';
const DEFAULT_BROWSER_MEDIA_INTERVAL_MS = 5_000;

export type VoiceBrowserMediaReporter = {
	close: () => void;
	reportOnce: () => Promise<VoiceBrowserMediaReportPayload | undefined>;
	start: () => void;
	stop: () => void;
};

const resolvePeerConnection = async (
	options: VoiceBrowserMediaReporterOptions
) =>
	options.peerConnection ??
	(await options.getPeerConnection?.()) ??
	null;

const postBrowserMediaReport = async (
	payload: VoiceBrowserMediaReportPayload,
	options: VoiceBrowserMediaReporterOptions
) => {
	const requestFetch = options.fetch ?? globalThis.fetch;

	if (!requestFetch) {
		return;
	}

	await requestFetch(options.path ?? DEFAULT_BROWSER_MEDIA_PATH, {
		body: JSON.stringify(payload),
		headers: {
			'Content-Type': 'application/json'
		},
		keepalive: true,
		method: 'POST'
	});
};

export const createVoiceBrowserMediaReporter = (
	options: VoiceBrowserMediaReporterOptions
): VoiceBrowserMediaReporter => {
	let interval: ReturnType<typeof setInterval> | null = null;
	let previousStats: readonly MediaWebRTCStatsSample[] = [];

	const reportOnce = async () => {
		const peerConnection = await resolvePeerConnection(options);

		if (!peerConnection) {
			return undefined;
		}

		const stats = await collectMediaWebRTCStats({ peerConnection });
		const report = buildMediaWebRTCStatsReport({
			...options,
			stats
		});
		const continuity =
			options.continuity === false
				? undefined
				: buildMediaWebRTCStreamContinuityReport({
						...options.continuity,
						previousStats,
						stats
					});
		const payload: VoiceBrowserMediaReportPayload = {
			at: Date.now(),
			continuity,
			report,
			scenarioId: options.getScenarioId?.() ?? null,
			sessionId: options.getSessionId?.() ?? null
		};
		previousStats = stats;

		options.onReport?.(payload);
		await postBrowserMediaReport(payload, options);

		return payload;
	};

	const run = () => {
		void reportOnce().catch((error) => {
			options.onError?.(error);
		});
	};

	const stop = () => {
		if (interval) {
			clearInterval(interval);
			interval = null;
		}
	};

	return {
		close: stop,
		reportOnce,
		start: () => {
			if (interval) {
				return;
			}

			run();
			interval = setInterval(
				run,
				options.intervalMs ?? DEFAULT_BROWSER_MEDIA_INTERVAL_MS
			);
		},
		stop
	};
};
