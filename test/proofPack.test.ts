import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	buildVoiceObservabilityArtifactIndex,
	buildVoiceObservabilityExport,
	buildVoiceProofPack,
	buildVoiceProofPackFromObservabilityExport,
	createVoiceProofPackBuildContext,
	createVoiceProofPackOperationsRecordSection,
	createVoiceProofPackProviderSloSection,
	createVoiceProofPackSupportBundleSection,
	createVoiceProofPackStaleWhileRefreshSource,
	createVoiceProofRefreshSnapshot,
	createVoiceProofPackRoutes,
	renderVoiceProofPackMarkdown,
	writeVoiceProofPack
} from '../src';
import type {
	VoiceCallDebuggerReport,
	VoiceOperationsRecord,
	VoiceProviderSloReport,
	VoiceSessionSnapshot
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

test('createVoiceProofPackBuildContext shares subreports and records timings', async () => {
	let now = 1_000;
	let loads = 0;
	const observed: string[] = [];
	const context = createVoiceProofPackBuildContext({
		now: () => now,
		onTiming: (timing) => observed.push(`${timing.label}:${timing.durationMs}`)
	});

	const first = await context.time('provider-slo', async () => {
		now += 25;
		return context.cache('provider-slo', () => {
			loads += 1;
			return { status: 'pass' };
		});
	});
	const second = await context.cache('provider-slo', () => {
		loads += 1;
		return { status: 'fail' };
	});

	expect(first).toBe(second);
	expect(loads).toBe(1);
	expect(context.getTimings()).toEqual([
		{
			durationMs: 25,
			endedAt: 1_025,
			label: 'provider-slo',
			startedAt: 1_000
		}
	]);
	expect(observed).toEqual(['provider-slo:25']);

	context.clear('provider-slo');
	await context.cache('provider-slo', () => {
		loads += 1;
		return { status: 'pass' };
	});
	expect(loads).toBe(2);

	context.clear();
	await context.cache('provider-slo', () => {
		loads += 1;
		return { status: 'pass' };
	});
	expect(loads).toBe(3);
});

test('createVoiceProofRefreshSnapshot captures read-only proof inputs once', async () => {
	let traceLists = 0;
	let auditLists = 0;
	const snapshot = await createVoiceProofRefreshSnapshot({
		audit: {
			append: (event) => ({
				...event,
				at: 1,
				id: event.id ?? 'audit-1'
			}),
			get: () => undefined,
			list: () => {
				auditLists += 1;
				return [
					{
						action: 'provider.call',
						at: 1,
						id: 'audit-1',
						outcome: 'success',
						type: 'provider.call'
					}
				];
			}
		},
		traceStore: {
			append: async (event) => ({
				...event,
				id: event.id ?? 'trace-new'
			}),
			get: async () => undefined,
			list: async () => {
				traceLists += 1;
				return [
					{
						at: 1,
						id: 'trace-1',
						payload: {},
						sessionId: 'session-1',
						traceId: 'trace-1',
						type: 'call.lifecycle'
					},
					{
						at: 2,
						id: 'trace-2',
						payload: {},
						sessionId: 'session-2',
						traceId: 'trace-2',
						type: 'call.lifecycle'
					}
				];
			},
			remove: async () => {}
		}
	});

	expect(traceLists).toBe(1);
	expect(auditLists).toBe(1);
	expect(await snapshot.traceStore.list({ sessionId: 'session-2' })).toEqual([
		expect.objectContaining({ id: 'trace-2' })
	]);
	expect(await snapshot.auditStore.list({ type: 'provider.call' })).toEqual([
		expect.objectContaining({ id: 'audit-1' })
	]);
	await expect(
		snapshot.traceStore.append({
			at: 3,
			payload: {},
			sessionId: 'session-3',
			type: 'call.lifecycle'
		})
	).rejects.toThrow('read-only');
});

test('proof pack builds rich sections from provider, operation, and support reports', () => {
	const providerSlo = {
		checkedAt: 1,
		events: 18,
		eventsWithLatency: 18,
		issues: [],
		status: 'pass'
	} as VoiceProviderSloReport;
	const operation = {
		checkedAt: 1,
		providerDecisionSummary: {
			fallbacks: 1
		},
		sessionId: 'session-rich-proof',
		status: 'warning',
		summary: {
			errorCount: 0
		}
	} as VoiceOperationsRecord;
	const snapshot = {
		capturedAt: 1,
		sessionId: 'session-rich-proof',
		status: 'pass'
	} as VoiceSessionSnapshot;
	const debuggerReport = {
		checkedAt: 1,
		sessionId: 'session-rich-proof',
		status: 'healthy'
	} as VoiceCallDebuggerReport;
	const proofPack = buildVoiceProofPack({
		callDebuggerReports: [debuggerReport],
		operationsRecords: [operation],
		providerSlo,
		sessionSnapshots: [snapshot]
	});

	expect(createVoiceProofPackProviderSloSection(providerSlo).status).toBe('pass');
	expect(createVoiceProofPackOperationsRecordSection([operation]).status).toBe(
		'warn'
	);
	expect(
		createVoiceProofPackSupportBundleSection({
			callDebuggerReports: [debuggerReport],
			sessionSnapshots: [snapshot]
		}).status
	).toBe('pass');
	expect(proofPack.sections.map((section) => section.title)).toEqual([
		'Provider SLO',
		'Operations records',
		'Support bundle'
	]);
	expect(proofPack.status).toBe('warn');
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

test('createVoiceProofPackStaleWhileRefreshSource returns stale proof while refreshing once', async () => {
	let now = Date.parse('2026-05-01T00:10:00.000Z');
	let refreshes = 0;
	let current = buildVoiceProofPack({
		generatedAt: '2026-05-01T00:00:00.000Z',
		runId: 'stale-run',
		sections: [{ title: 'Stale proof', status: 'pass' }]
	});
	let releaseRefresh: (() => void) | undefined;
	const refreshBlocked = new Promise<void>((resolve) => {
		releaseRefresh = resolve;
	});
	const source = createVoiceProofPackStaleWhileRefreshSource({
		maxAgeMs: 60_000,
		now: () => now,
		read: () => current,
		refresh: async () => {
			refreshes += 1;
			await refreshBlocked;
			current = buildVoiceProofPack({
				generatedAt: new Date(now).toISOString(),
				runId: 'fresh-run',
				sections: [{ title: 'Fresh proof', status: 'pass' }]
			});
		}
	});

	await expect(source()).resolves.toMatchObject({ runId: 'stale-run' });
	expect(source.getStatus()).toMatchObject({
		refreshing: true,
		runId: 'stale-run',
		state: 'refreshing'
	});
	await expect(source()).resolves.toMatchObject({ runId: 'stale-run' });
	expect(refreshes).toBe(1);

	releaseRefresh?.();
	await Bun.sleep(1);
	await expect(source()).resolves.toMatchObject({ runId: 'fresh-run' });
	expect(source.getStatus()).toMatchObject({
		refreshing: false,
		runId: 'fresh-run',
		state: 'fresh'
	});
});

test('createVoiceProofPackStaleWhileRefreshSource waits for refresh when no proof exists', async () => {
	let current: ReturnType<typeof buildVoiceProofPack> | undefined;
	const source = createVoiceProofPackStaleWhileRefreshSource({
		read: () => {
			if (!current) {
				throw new Error('missing proof pack');
			}
			return current;
		},
		refresh: () => {
			current = buildVoiceProofPack({
				generatedAt: '2026-05-01T00:00:00.000Z',
				runId: 'created-run',
				sections: [{ title: 'Created proof', status: 'pass' }]
			});
		}
	});

	await expect(source()).resolves.toMatchObject({ runId: 'created-run' });
	expect(source.getStatus()).toMatchObject({
		refreshing: false,
		runId: 'created-run',
		state: 'fresh'
	});
});
