import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	buildVoiceObservabilityArtifactIndex,
	buildVoiceObservabilityExport,
	buildVoiceProofPack,
	buildVoiceProofPackFromObservabilityExport,
	createVoiceProofPackRoutes,
	renderVoiceProofPackMarkdown,
	writeVoiceProofPack
} from '../src';

test('buildVoiceProofPack summarizes sections and renders Markdown', () => {
	const proofPack = buildVoiceProofPack({
		generatedAt: '2026-05-01T00:00:00.000Z',
		runId: 'proof-run-1',
		sections: [
			{
				evidence: [{ label: 'Provider SLO', status: 'pass', value: 12 }],
				title: 'Provider readiness'
			},
			{
				evidence: [{ label: 'Stale screenshots', status: 'warn' }],
				title: 'Artifacts'
			}
		]
	});
	const markdown = renderVoiceProofPackMarkdown(proofPack);

	expect(proofPack.status).toBe('warn');
	expect(proofPack.summary).toEqual({
		fail: 0,
		pass: 1,
		sections: 2,
		warn: 1
	});
	expect(markdown).toContain('# AbsoluteJS Voice Proof Pack');
	expect(markdown).toContain('Provider SLO: 12');
});

test('writeVoiceProofPack writes JSON and Markdown plus export artifacts', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'voice-proof-pack-'));
	const result = await writeVoiceProofPack(
		{
			generatedAt: '2026-05-01T00:00:00.000Z',
			runId: 'proof-run-2',
			sections: [{ title: 'Routes', status: 'pass' }]
		},
		{ outputDir: dir }
	);

	expect(await Bun.file(result.jsonPath).json()).toMatchObject({
		runId: 'proof-run-2',
		status: 'pass'
	});
	expect(await Bun.file(result.markdownPath).text()).toContain('proof-run-2');
	expect(result.artifacts.map((artifact) => artifact.id)).toEqual([
		'latest-proof-pack',
		'latest-proof-pack-json'
	]);
});

test('buildVoiceProofPackFromObservabilityExport feeds artifact exports', async () => {
	const report = await buildVoiceObservabilityExport({
		artifacts: [
			{
				id: 'proof-artifact',
				kind: 'proof-pack',
				label: 'Proof artifact',
				status: 'pass'
			}
		],
		events: [
			{
				at: 1,
				id: 'trace-1',
				payload: {},
				sessionId: 'session-1',
				traceId: 'trace-1',
				type: 'call.lifecycle'
			}
		]
	});
	const proofPack = buildVoiceProofPackFromObservabilityExport(report, {
		runId: 'proof-run-3'
	});
	const artifactIndex = buildVoiceObservabilityArtifactIndex(
		await buildVoiceObservabilityExport({
			artifacts: proofPack.artifacts
		})
	);

	expect(proofPack.status).toBe('warn');
	expect(proofPack.sections.map((section) => section.title)).toEqual([
		'Observability export',
		'Export issues'
	]);
	expect(artifactIndex.summary.total).toBe(1);
});

test('createVoiceProofPackRoutes exposes JSON and Markdown', async () => {
	const app = createVoiceProofPackRoutes({
		source: {
			generatedAt: '2026-05-01T00:00:00.000Z',
			runId: 'proof-run-4',
			sections: [{ title: 'Support bundle', status: 'pass' }]
		}
	});
	const json = await app.handle(
		new Request('http://localhost/api/voice/proof-pack')
	);
	const markdown = await app.handle(
		new Request('http://localhost/voice/proof-pack.md')
	);

	expect(json.status).toBe(200);
	expect(await json.json()).toMatchObject({ runId: 'proof-run-4' });
	expect(markdown.status).toBe(200);
	expect(await markdown.text()).toContain('Support bundle');
});
