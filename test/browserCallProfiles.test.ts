import { describe, expect, test } from 'bun:test';
import {
	assertVoiceBrowserCallProfileEvidence,
	buildVoiceBrowserCallProfileReport,
	createVoiceBrowserCallProfileRoutes,
	evaluateVoiceBrowserCallProfileEvidence,
	renderVoiceBrowserCallProfileMarkdown
} from '../src';

const generatedAt = new Date('2026-04-30T12:00:00.000Z').toISOString();

const passingResults = ['react', 'vue', 'svelte', 'angular', 'html', 'htmx'].map(
	(framework) => ({
		framework,
		ok: true,
		summary: {
			messageCount: 4,
			openSockets: 2,
			receivedBytes: 2048,
			sentBytes: 4096
		},
		url: `http://absolute.test/${framework}`
	})
);

describe('browser call profiles', () => {
	test('normalizes browser call framework evidence', () => {
		const report = buildVoiceBrowserCallProfileReport({
			generatedAt,
			now: generatedAt,
			results: passingResults,
			runId: 'browser-proof-1'
		});

		expect(report.status).toBe('pass');
		expect(report.ok).toBe(true);
		expect(report.frameworks).toEqual([
			'react',
			'vue',
			'svelte',
			'angular',
			'html',
			'htmx'
		]);
		expect(report.summary.passedFrameworks).toEqual(report.frameworks);
		expect(report.summary.openSockets).toBe(12);
		expect(report.summary.sentBytes).toBe(24_576);
	});

	test('evaluates required frameworks and per-framework socket evidence', () => {
		const report = buildVoiceBrowserCallProfileReport({
			generatedAt,
			now: generatedAt,
			results: [
				passingResults[0],
				{
					framework: 'vue',
					ok: true,
					summary: {
						messageCount: 1,
						openSockets: 0,
						sentBytes: 0
					}
				}
			]
		});
		const assertion = evaluateVoiceBrowserCallProfileEvidence(report, {
			minOpenSocketsPerFramework: 1,
			minSentBytesPerFramework: 100,
			requiredFrameworks: ['react', 'vue', 'angular']
		});

		expect(assertion.ok).toBe(false);
		expect(assertion.issues).toContain(
			'vue opened 0 WebSocket(s); expected at least 1.'
		);
		expect(assertion.issues).toContain(
			'vue sent 0 byte(s); expected at least 100.'
		);
		expect(assertion.issues).toContain(
			'Missing browser call evidence for angular.'
		);
	});

	test('throws assertion errors for stale reports', () => {
		const report = buildVoiceBrowserCallProfileReport({
			generatedAt,
			maxAgeMs: 1000,
			now: new Date('2026-04-30T12:00:02.000Z').toISOString(),
			results: passingResults
		});

		expect(() =>
			assertVoiceBrowserCallProfileEvidence(report, { maxAgeMs: 1000 })
		).toThrow('Browser call profile is stale');
	});

	test('renders markdown and exposes JSON HTML and Markdown routes', async () => {
		const report = buildVoiceBrowserCallProfileReport({
			generatedAt,
			now: generatedAt,
			results: passingResults
		});
		const markdown = renderVoiceBrowserCallProfileMarkdown(report);

		expect(markdown).toContain('| react | pass | 2 | 4096 | 2048 | 4 |');

		const app = createVoiceBrowserCallProfileRoutes({
			source: report,
			title: 'Browser Calls'
		});
		const json = await app
			.handle(new Request('http://absolute.test/api/voice/browser-call-profiles'))
			.then((response) => response.json());
		const html = await app
			.handle(new Request('http://absolute.test/voice/browser-call-profiles'))
			.then((response) => response.text());
		const markdownResponse = await app
			.handle(new Request('http://absolute.test/voice/browser-call-profiles.md'))
			.then((response) => response.text());

		expect(json.status).toBe('pass');
		expect(html).toContain('Browser Calls');
		expect(markdownResponse).toContain('# Browser Calls');
	});
});
