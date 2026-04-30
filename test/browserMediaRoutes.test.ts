import { describe, expect, test } from 'bun:test';
import {
	createVoiceBrowserMediaRoutes,
	createVoiceMemoryTraceEventStore,
	getLatestVoiceBrowserMediaReport,
	summarizeVoiceBrowserMedia
} from '../src';
import { createVoiceBrowserMediaReporter } from '../src/client';

const healthyReport = {
	activeCandidatePairs: 1,
	bytesReceived: 240_000,
	bytesSent: 210_000,
	checkedAt: Date.now(),
	endedAudioTracks: 0,
	inboundPackets: 999,
	issues: [],
	jitterMs: 8,
	liveAudioTracks: 1,
	outboundPackets: 1000,
	packetLossRatio: 0.001,
	packetsLost: 1,
	roundTripTimeMs: 80,
	status: 'pass' as const,
	totalStats: 4
};

const healthyContinuity = {
	checkedAt: Date.now(),
	inboundAudioStreams: 1,
	issues: [],
	outboundAudioStreams: 1,
	stalledInboundStreams: 0,
	stalledOutboundStreams: 0,
	status: 'pass' as const,
	streams: [
		{
			currentPackets: 999,
			direction: 'inbound' as const,
			id: 'inbound-audio'
		},
		{
			currentPackets: 1000,
			direction: 'outbound' as const,
			id: 'outbound-audio'
		}
	],
	totalStats: 4
};

describe('browser media routes', () => {
	test('stores browser WebRTC media reports in traces', async () => {
		const store = createVoiceMemoryTraceEventStore();
		const app = createVoiceBrowserMediaRoutes({ store });
		const response = await app.handle(
			new Request('http://absolute.test/api/voice/browser-media', {
				body: JSON.stringify({
					at: Date.now(),
					continuity: healthyContinuity,
					report: healthyReport,
					scenarioId: 'browser-media-proof',
					sessionId: 'session-1'
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST'
			})
		);

		expect(response.status).toBe(200);

		const summary = await summarizeVoiceBrowserMedia({ store });
		expect(summary.status).toBe('pass');
		expect(summary.latest?.sessionId).toBe('session-1');
		expect(summary.latest?.report.roundTripTimeMs).toBe(80);
		expect(summary.latest?.continuity?.inboundAudioStreams).toBe(1);

		const latest = await getLatestVoiceBrowserMediaReport({ store });
		expect(latest?.status).toBe('pass');
	});

	test('merges browser WebRTC continuity failures into readiness report', async () => {
		const store = createVoiceMemoryTraceEventStore();
		const app = createVoiceBrowserMediaRoutes({ store });
		const response = await app.handle(
			new Request('http://absolute.test/api/voice/browser-media', {
				body: JSON.stringify({
					at: Date.now(),
					continuity: {
						...healthyContinuity,
						issues: [
							{
								code: 'media.webrtc_inbound_stalled',
								message:
									'1 inbound WebRTC audio stream(s) stopped receiving packets.',
								severity: 'error'
							}
						],
						stalledInboundStreams: 1,
						status: 'fail'
					},
					report: healthyReport,
					sessionId: 'session-1'
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST'
			})
		);

		expect(response.status).toBe(200);

		const summary = await summarizeVoiceBrowserMedia({ store });
		const latest = await getLatestVoiceBrowserMediaReport({ store });

		expect(summary.status).toBe('fail');
		expect(latest?.status).toBe('fail');
		expect(latest?.issues.map((issue) => issue.code)).toContain(
			'media.webrtc_inbound_stalled'
		);
	});

	test('posts reports from the browser media reporter', async () => {
		const requests: unknown[] = [];
		const peerConnection = {
			getStats: () =>
				new Map<string, RTCStats>([
					[
						'inbound-audio',
						{
							bytesReceived: 120_000,
							id: 'inbound-audio',
							jitter: 0.01,
							kind: 'audio',
							packetsLost: 0,
							packetsReceived: 500,
							timestamp: 1,
							type: 'inbound-rtp'
						} as unknown as RTCStats
					],
					[
						'outbound-audio',
						{
							bytesSent: 110_000,
							id: 'outbound-audio',
							kind: 'audio',
							packetsSent: 500,
							timestamp: 1,
							type: 'outbound-rtp'
						} as unknown as RTCStats
					],
					[
						'candidate-pair',
						{
							currentRoundTripTime: 0.05,
							id: 'candidate-pair',
							selected: true,
							timestamp: 1,
							type: 'candidate-pair'
						} as unknown as RTCStats
					],
					[
						'local-audio',
						{
							audioLevel: 0.2,
							id: 'local-audio',
							kind: 'audio',
							readyState: 'live',
							timestamp: 1,
							type: 'media-source'
						} as unknown as RTCStats
					]
				]) as unknown as RTCStatsReport
		};
		const reporter = createVoiceBrowserMediaReporter({
			fetch: (async (_path, init) => {
				requests.push(JSON.parse(String(init?.body)));
				return new Response(JSON.stringify({ ok: true }));
			}) as typeof fetch,
			getScenarioId: () => 'scenario-1',
			getSessionId: () => 'session-1',
			peerConnection,
			continuity: {
				requireInboundAudio: true,
				requireOutboundAudio: true
			},
			requireConnectedCandidatePair: true,
			requireLiveAudioTrack: true
		});

		const payload = await reporter.reportOnce();

		expect(payload?.report.status).toBe('pass');
		expect(payload?.continuity?.status).toBe('pass');
		expect(payload?.continuity?.inboundAudioStreams).toBe(1);
		expect(payload?.continuity?.outboundAudioStreams).toBe(1);
		expect(payload?.sessionId).toBe('session-1');
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			continuity: { status: 'pass' },
			report: { status: 'pass' },
			scenarioId: 'scenario-1',
			sessionId: 'session-1'
		});
	});
});
