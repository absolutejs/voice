import { describe, expect, test } from 'bun:test';
import {
	assertVoiceSloCalibration,
	buildVoiceSloCalibrationReport,
	buildVoiceSloReadinessThresholdReport,
	createVoiceSloCalibrationRoutes,
	createVoiceSloReadinessThresholdOptions,
	createVoiceSloReadinessThresholdRoutes,
	createVoiceSloThresholdProfile,
	renderVoiceSloCalibrationMarkdown,
	renderVoiceSloReadinessThresholdHTML,
	renderVoiceSloReadinessThresholdMarkdown
} from '../src/sloCalibration';
import { buildVoiceProofTrendReport } from '../src/proofTrends';

describe('SLO calibration', () => {
	test('buildVoiceSloCalibrationReport recommends thresholds from proof trends', () => {
		const reports = [0, 1, 2].map((index) =>
			buildVoiceProofTrendReport({
				generatedAt: `2026-04-29T12:0${index}:00.000Z`,
				ok: true,
				outputDir: `.voice-runtime/long-proof-window/run-${index}`,
				runId: `run-${index}`,
				summary: {
					cycles: 18,
					maxLiveP95Ms: 420 + index * 10,
					maxProviderP95Ms: 700 + index * 20,
					runtimeChannel: {
						maxInterruptionP95Ms: 180 + index * 10,
						samples: 8,
						status: 'pass'
					},
					maxTurnP95Ms: 140 + index * 5
				}
			})
		);

		const report = buildVoiceSloCalibrationReport(reports, {
			headroomMultiplier: 1.5,
			liveLatencyMinimumMs: 600,
			minPassingRuns: 3,
			providerMinimumMs: 1_000,
			turnLatencyMinimumMs: 250
		});

		expect(report.ok).toBe(true);
		expect(report.status).toBe('warn');
		expect(report.passingRuns).toBe(3);
		expect(report.thresholds.liveLatency.recommendedMs).toBe(660);
		expect(report.thresholds.provider.recommendedMs).toBe(1_110);
		expect(report.thresholds.interruption.recommendedMs).toBe(300);
		expect(report.thresholds.turnLatency.recommendedMs).toBe(250);
		expect(report.thresholds.monitorRun.status).toBe('warn');
		expect(report.thresholds.reconnect.status).toBe('warn');
		expect(report.recommendedProviderSloThresholds.llm?.maxP95ElapsedMs).toBe(
			1_110
		);
		expect(report.sources).toContain('.voice-runtime/long-proof-window/run-0');
		expect(assertVoiceSloCalibration(reports, { minPassingRuns: 3 }).ok).toBe(
			true
		);
	});

	test('buildVoiceSloCalibrationReport fails when required run count or core metrics are missing', () => {
		const report = buildVoiceSloCalibrationReport(
			[
				{
					liveP95Ms: 420,
					ok: true,
					runId: 'single-run',
					turnP95Ms: 140
				}
			],
			{ minPassingRuns: 2 }
		);

		expect(report.ok).toBe(false);
		expect(report.status).toBe('fail');
		expect(report.issues).toEqual(
			expect.arrayContaining([
				expect.stringContaining('at least 2 passing'),
				expect.stringContaining('provider samples')
			])
		);
		expect(() =>
			assertVoiceSloCalibration([{ ok: false }], { minPassingRuns: 1 })
		).toThrow('Voice SLO calibration failed');
	});

	test('buildVoiceSloCalibrationReport calibrates optional runtime channels when supplied', () => {
		const report = buildVoiceSloCalibrationReport(
			[
				{
					interruptionP95Ms: 180,
					liveP95Ms: 420,
					monitorRunP95Ms: 800,
					notifierDeliveryP95Ms: 1_100,
					ok: true,
					providerP95Ms: 700,
					reconnectP95Ms: 900,
					turnP95Ms: 140
				},
				{
					interruptionP95Ms: 200,
					liveP95Ms: 430,
					monitorRunP95Ms: 850,
					notifierDeliveryP95Ms: 1_200,
					ok: true,
					providerP95Ms: 720,
					reconnectP95Ms: 1_000,
					turnP95Ms: 150
				}
			],
			{ minPassingRuns: 2 }
		);

		expect(report.status).toBe('pass');
		expect(report.thresholds.interruption.recommendedMs).toBe(300);
		expect(report.thresholds.monitorRun.recommendedMs).toBe(1_275);
		expect(report.thresholds.notifierDelivery.recommendedMs).toBe(2_000);
		expect(report.thresholds.reconnect.recommendedMs).toBe(1_500);
	});

	test('createVoiceSloThresholdProfile converts calibration into spreadable readiness thresholds', () => {
		const profile = createVoiceSloThresholdProfile(
			[
				{
					interruptionP95Ms: 88,
					liveP95Ms: 420,
					monitorRunP95Ms: 8_311,
					notifierDeliveryP95Ms: 2_187,
					ok: true,
					providerP95Ms: 700,
					reconnectP95Ms: 523,
					turnP95Ms: 140
				}
			],
			{ minPassingRuns: 1 }
		);

		expect(profile.status).toBe('pass');
		expect(profile.providerSlo.llm?.maxP95ElapsedMs).toBe(1_050);
		expect(profile.liveLatency).toEqual({
			failAfterMs: 630,
			warnAfterMs: 600
		});
		expect(profile.bargeIn.thresholdMs).toBe(250);
		expect(profile.reconnect.failAfterMs).toBe(1_500);
		expect(profile.monitoring.monitorRunFailAfterMs).toBe(12_467);
		expect(profile.monitoring.notifierDeliveryFailAfterMs).toBe(3_281);
	});

	test('createVoiceSloReadinessThresholdOptions maps calibration into production readiness options', () => {
		const options = createVoiceSloReadinessThresholdOptions(
			[
				{
					interruptionP95Ms: 88,
					liveP95Ms: 420,
					monitorRunP95Ms: 8_311,
					notifierDeliveryP95Ms: 2_187,
					ok: true,
					providerP95Ms: 700,
					reconnectP95Ms: 523,
					turnP95Ms: 140
				}
			],
			{ minPassingRuns: 1 }
		);

		expect(options).toEqual({
			liveLatencyFailAfterMs: 630,
			liveLatencyWarnAfterMs: 600,
			monitoringNotifierDeliveryFailAfterMs: 3_281,
			monitoringRunFailAfterMs: 12_467,
			reconnectResumeFailAfterMs: 1_500
		});
	});

	test('buildVoiceSloReadinessThresholdReport exposes the active readiness gate', () => {
		const report = buildVoiceSloReadinessThresholdReport(
			[
				{
					interruptionP95Ms: 88,
					liveP95Ms: 420,
					monitorRunP95Ms: 8_311,
					notifierDeliveryP95Ms: 2_187,
					ok: true,
					providerP95Ms: 700,
					reconnectP95Ms: 523,
					runId: 'long-proof-window',
					source: '.voice-runtime/long-proof-window/latest',
					turnP95Ms: 140
				}
			],
			{ liveLatencyMaxAgeMs: 1_800_000, minPassingRuns: 1 }
		);

		expect(report.ok).toBe(true);
		expect(report.status).toBe('pass');
		expect(report.providerSlo.llm?.maxP95ElapsedMs).toBe(1_050);
		expect(report.bargeIn.thresholdMs).toBe(250);
		expect(report.liveLatencyMaxAgeMs).toBe(1_800_000);
		expect(report.readinessOptions).toEqual({
			liveLatencyFailAfterMs: 630,
			liveLatencyWarnAfterMs: 600,
			monitoringNotifierDeliveryFailAfterMs: 3_281,
			monitoringRunFailAfterMs: 12_467,
			reconnectResumeFailAfterMs: 1_500
		});
		expect(report.sources).toContain('.voice-runtime/long-proof-window/latest');
	});

	test('renderVoiceSloCalibrationMarkdown and routes expose calibration proof', async () => {
		const app = createVoiceSloCalibrationRoutes({
			minPassingRuns: 1,
			source: [
				{
					liveP95Ms: 420,
					ok: true,
					providerP95Ms: 700,
					runId: 'fresh-proof',
					turnP95Ms: 140
				}
			]
		});

		const jsonResponse = await app.handle(
			new Request('http://localhost/api/voice/slo-calibration')
		);
		const json = await jsonResponse.json();
		const markdownResponse = await app.handle(
			new Request('http://localhost/voice/slo-calibration.md')
		);
		const markdown = await markdownResponse.text();

		expect(jsonResponse.status).toBe(200);
		expect(json.thresholds.provider.recommendedMs).toBe(1_050);
		expect(markdownResponse.headers.get('content-type')).toContain(
			'text/markdown'
		);
		expect(markdown).toContain('Voice SLO Calibration');
		expect(renderVoiceSloCalibrationMarkdown(json)).toContain(
			'Passing runs: 1/1'
		);
	});

	test('renderVoiceSloReadinessThreshold routes expose readable active gate proof', async () => {
		const app = createVoiceSloReadinessThresholdRoutes({
			liveLatencyMaxAgeMs: 1_800_000,
			minPassingRuns: 1,
			source: [
				{
					interruptionP95Ms: 88,
					liveP95Ms: 420,
					monitorRunP95Ms: 8_311,
					notifierDeliveryP95Ms: 2_187,
					ok: true,
					providerP95Ms: 700,
					reconnectP95Ms: 523,
					runId: 'fresh-proof',
					turnP95Ms: 140
				}
			],
			title: 'Calibration -> Active Readiness Gate'
		});

		const jsonResponse = await app.handle(
			new Request('http://localhost/api/voice/slo-readiness-thresholds')
		);
		const json = await jsonResponse.json();
		const htmlResponse = await app.handle(
			new Request('http://localhost/voice/slo-readiness-thresholds')
		);
		const html = await htmlResponse.text();
		const markdownResponse = await app.handle(
			new Request('http://localhost/voice/slo-readiness-thresholds.md')
		);
		const markdown = await markdownResponse.text();

		expect(jsonResponse.status).toBe(200);
		expect(json.readinessOptions.monitoringRunFailAfterMs).toBe(12_467);
		expect(htmlResponse.headers.get('content-type')).toContain('text/html');
		expect(html).toContain('Calibration -&gt; Active Readiness Gate');
		expect(markdownResponse.headers.get('content-type')).toContain(
			'text/markdown'
		);
		expect(markdown).toContain('Provider SLO p95');
		expect(renderVoiceSloReadinessThresholdMarkdown(json)).toContain(
			'Active value'
		);
		expect(renderVoiceSloReadinessThresholdHTML(json)).toContain(
			'production readiness gates'
		);
	});
});
