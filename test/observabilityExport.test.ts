import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	assertVoiceObservabilityExportDeliveryEvidence,
	assertVoiceObservabilityExportRecord,
	assertVoiceObservabilityExportReplayEvidence,
	assertVoiceObservabilityExportSchema,
	buildVoiceObservabilityExport,
	buildVoiceObservabilityArtifactIndex,
	buildVoiceObservabilityExportDeliveryHistory,
	buildVoiceObservabilityExportReplayReport,
	createVoiceAuditEvent,
	createVoiceAuditSinkDeliveryRecord,
	createVoiceFileObservabilityExportDeliveryReceiptStore,
	createVoiceMemoryAuditEventStore,
	createVoiceMemoryObservabilityExportDeliveryReceiptStore,
	createVoiceMemoryTraceEventStore,
	createVoiceObservabilityExportRoutes,
	createVoiceObservabilityExportReplayRoutes,
	createVoiceTraceEvent,
	createVoiceTraceSinkDeliveryRecord,
	deliverVoiceObservabilityExport,
	evaluateVoiceObservabilityExportDeliveryEvidence,
	evaluateVoiceObservabilityExportReplayEvidence,
	replayVoiceObservabilityExport,
	renderVoiceObservabilityExportReplayHTML,
	renderVoiceObservabilityExportMarkdown,
	validateVoiceObservabilityExportRecord,
	voiceObservabilityExportSchemaId,
	voiceObservabilityExportSchemaVersion
} from '../src';
import type {
	VoiceCallDebuggerReport,
	VoicePostgresClient,
	VoiceSessionSnapshot
} from '../src';

const createFakeObservabilityS3Client = () => {
	const objects = new Map<string, { data: string | Uint8Array; type?: string }>();

	return {
		file: (key: string) => ({
			text: async () => {
				const object = objects.get(key);
				if (object === undefined) {
					throw new Error(`Missing fake S3 object: ${key}`);
				}
				return typeof object.data === 'string'
					? object.data
					: new TextDecoder().decode(object.data);
			},
			write: async (data: string | Uint8Array, options?: BlobPropertyBag) => {
				objects.set(key, { data, type: options?.type });
				return typeof data === 'string' ? data.length : data.byteLength;
			}
		}),
		objects
	};
};

const createFakeObservabilityPostgresClient = (): VoicePostgresClient & {
	rows: Map<string, Record<string, unknown>>;
} => {
	const rows = new Map<string, Record<string, unknown>>();

	return {
		rows,
		unsafe: async (query, parameters = []) => {
			const normalized = query.replace(/\s+/g, ' ').trim().toUpperCase();
			if (
				normalized.startsWith('CREATE SCHEMA IF NOT EXISTS') ||
				normalized.startsWith('CREATE TABLE IF NOT EXISTS')
			) {
				return [];
			}
			if (normalized.startsWith('INSERT INTO')) {
				const payload = JSON.parse(String(parameters[7]));
				rows.set(String(parameters[0]), {
					artifactCount: Number(parameters[4]),
					artifactIndex: JSON.parse(String(parameters[6])),
					checkedAt: Number(parameters[1]),
					exportStatus: String(parameters[3]),
					manifest: JSON.parse(String(parameters[5])),
					payload,
					runId: String(parameters[0]),
					schema: payload.schema,
					status: String(parameters[2])
				});
				return [];
			}
			throw new Error(`Unsupported fake postgres query: ${query}`);
		}
	};
};

const readObservabilityExportFixture = async (file: string) =>
	JSON.parse(
		await Bun.file(
			join('test', 'fixtures', 'observability-export', 'v1.0.0', file)
		).text()
	) as Record<string, unknown>;

test('observability export v1.0.0 fixture stays stable for customer ingestion', async () => {
	const originalNow = Date.now;
	Date.now = () => 1_710_000_000_000;
	try {
		const report = await buildVoiceObservabilityExport({
			artifacts: [
				{
					bytes: 325_396,
					contentType: 'image/png',
					href: '/voice/provider-slos',
					id: 'provider-slo-screenshot',
					kind: 'screenshot',
					label: 'Provider SLO screenshot',
					status: 'pass'
				}
			],
			events: [
				{
					at: 1_709_999_999_000,
					id: 'trace-session-1-start',
					payload: { type: 'start' },
					sessionId: 'session-1',
					traceId: 'trace-1',
					type: 'call.lifecycle'
				},
				{
					at: 1_709_999_999_500,
					id: 'trace-session-1-model',
					payload: {
						elapsedMs: 320,
						kind: 'llm',
						provider: 'openai',
						providerStatus: 'success'
					},
					sessionId: 'session-1',
					traceId: 'trace-1',
					type: 'agent.model'
				}
			]
		});
		const artifactIndex = buildVoiceObservabilityArtifactIndex(report);

		expect(report).toEqual(
			await readObservabilityExportFixture('manifest.json')
		);
		expect(artifactIndex).toEqual(
			await readObservabilityExportFixture('artifact-index.json')
		);
		expect(report.schema).toEqual({
			id: voiceObservabilityExportSchemaId,
			version: voiceObservabilityExportSchemaVersion
		});
	} finally {
		Date.now = originalNow;
	}
});

test('observability export includes session snapshot and call debugger artifacts', async () => {
	const sessionSnapshot: VoiceSessionSnapshot = {
		artifacts: [],
		capturedAt: 1_710_000_000_000,
		media: [],
		proofAssertions: [],
		proofSummary: {
			failed: 0,
			failures: [],
			ok: true,
			passed: 0,
			total: 0
		},
		providerRoutingEvents: [],
		quality: [],
		schema: 'absolute.voice.session.snapshot.v1',
		sessionId: 'session-debug-export',
		status: 'warn',
		telephonyOutcomes: []
	};
	const callDebuggerReport = {
		checkedAt: 1_710_000_000_100,
		sessionId: 'session-debug-export',
		status: 'warning'
	} as VoiceCallDebuggerReport;
	const report = await buildVoiceObservabilityExport({
		callDebuggerReports: [callDebuggerReport],
		links: {
			callDebugger: (sessionId) => `/voice-call-debugger/${sessionId}`,
			sessionSnapshot: (sessionId) => `/api/voice/session-snapshot/${sessionId}`
		},
		sessionSnapshots: [sessionSnapshot]
	});
	const artifactIndex = buildVoiceObservabilityArtifactIndex(report);

	expect(report.status).toBe('pass');
	expect(report.sessionIds).toEqual(['session-debug-export']);
	expect(report.artifacts).toEqual([
		expect.objectContaining({
			href: '/api/voice/session-snapshot/session-debug-export',
			id: 'session-snapshot:session-debug-export',
			kind: 'session-snapshot',
			status: 'warn'
		}),
		expect.objectContaining({
			href: '/voice-call-debugger/session-debug-export',
			id: 'call-debugger:session-debug-export',
			kind: 'call-debugger',
			status: 'warn'
		})
	]);
	expect(artifactIndex.artifacts.map((artifact) => artifact.kind)).toEqual([
		'session-snapshot',
		'call-debugger'
	]);
	expect(artifactIndex.summary).toMatchObject({
		total: 2,
		warn: 2
	});
});

test('validateVoiceObservabilityExportRecord validates customer-ingested export records', async () => {
	const manifest = await readObservabilityExportFixture('manifest.json');
	const artifactIndex = await readObservabilityExportFixture('artifact-index.json');
	const databaseRecord = {
		artifactCount: 1,
		artifactIndex,
		checkedAt: 1_710_000_000_000,
		exportStatus: 'pass',
		manifest,
		runId: 'run-1',
		schema: manifest.schema,
		status: 'pass'
	};
	const deliveryReceipt = {
		checkedAt: 1_710_000_000_000,
		destinations: [
			{
				artifactCount: 1,
				deliveredAt: 1_710_000_000_000,
				destinationId: 'warehouse',
				destinationKind: 'postgres',
				label: 'Warehouse',
				manifestBytes: 1024,
				schema: manifest.schema,
				status: 'delivered',
				target: 'postgres://public/voice_observability_exports'
			}
		],
		exportStatus: 'pass',
		id: 'observability-export:run-1',
		runId: 'run-1',
		status: 'pass',
		summary: {
			delivered: 1,
			failed: 0,
			total: 1
		}
	};

	expect(validateVoiceObservabilityExportRecord(manifest)).toMatchObject({
		kind: 'manifest',
		ok: true,
		schema: {
			id: voiceObservabilityExportSchemaId,
			version: voiceObservabilityExportSchemaVersion
		}
	});
	expect(validateVoiceObservabilityExportRecord(artifactIndex)).toMatchObject({
		kind: 'artifact-index',
		ok: true
	});
	expect(
		validateVoiceObservabilityExportRecord(databaseRecord, {
			kind: 'database-record'
		})
	).toMatchObject({
		kind: 'database-record',
		ok: true
	});
	expect(validateVoiceObservabilityExportRecord(deliveryReceipt)).toMatchObject({
		kind: 'delivery-receipt',
		ok: true
	});
	expect(
		validateVoiceObservabilityExportRecord({
			...manifest,
			schema: { id: voiceObservabilityExportSchemaId, version: '0.9.0' }
		})
	).toMatchObject({
		issues: [
			expect.objectContaining({
				code: 'voice.observability.export.unsupported_schema',
				path: '$.schema'
			})
		],
		ok: false
	});
	expect(() =>
		assertVoiceObservabilityExportRecord({
			...artifactIndex,
			artifacts: undefined
		})
	).toThrow('Invalid voice observability export record');
});

test('buildVoiceObservabilityExportReplayReport reports replay health from ingested records', async () => {
	const manifest = await readObservabilityExportFixture('manifest.json');
	const artifactIndex = await readObservabilityExportFixture('artifact-index.json');

	expect(
		buildVoiceObservabilityExportReplayReport({
			artifactIndex,
			manifest
		})
	).toMatchObject({
		status: 'pass',
		summary: {
			artifacts: 1,
			failedArtifacts: 0,
			validationIssues: 0
		}
	});

	expect(
		buildVoiceObservabilityExportReplayReport({
			artifactIndex: {
				...artifactIndex,
				artifacts: [
					{
						id: 'provider-slo-screenshot',
						kind: 'screenshot',
						label: 'Provider SLO screenshot',
						status: 'fail'
					}
				]
			},
			manifest: {
				...manifest,
				schema: { id: voiceObservabilityExportSchemaId, version: '0.9.0' },
				status: 'fail'
			}
		})
	).toMatchObject({
		issues: expect.arrayContaining([
			expect.objectContaining({
				code: 'voice.observability.export_replay.validation_failed'
			}),
			expect.objectContaining({
				code: 'voice.observability.export_replay.export_failed'
			}),
			expect.objectContaining({
				code: 'voice.observability.export_replay.artifact_failed'
			})
		]),
		status: 'fail'
	});
});

test('evaluateVoiceObservabilityExportDeliveryEvidence verifies fresh successful delivery history', () => {
	const checkedAt = 1_000_000;
	const history = buildVoiceObservabilityExportDeliveryHistory({
		list: () => [
			{
				checkedAt,
				destinations: [
					{
						artifactCount: 2,
						deliveredAt: checkedAt,
						destinationId: 'file-archive',
						destinationKind: 'file',
						label: 'File archive',
						manifestBytes: 1024,
						schema: {
							id: voiceObservabilityExportSchemaId,
							version: voiceObservabilityExportSchemaVersion
						},
						status: 'delivered',
						target: '.voice-runtime/export'
					}
				],
				exportStatus: 'pass',
				id: 'observability-export:run-1',
				runId: 'run-1',
				status: 'pass',
				summary: {
					delivered: 1,
					failed: 0,
					total: 1
				}
			},
			{
				checkedAt: checkedAt - 120_000,
				destinations: [
					{
						artifactCount: 2,
						deliveredAt: checkedAt - 120_000,
						destinationId: 'file-archive',
						destinationKind: 'file',
						label: 'File archive',
						manifestBytes: 1024,
						schema: {
							id: voiceObservabilityExportSchemaId,
							version: voiceObservabilityExportSchemaVersion
						},
						status: 'delivered',
						target: '.voice-runtime/export'
					}
				],
				exportStatus: 'fail',
				id: 'observability-export:stale-failed',
				runId: 'stale-failed',
				status: 'fail',
				summary: {
					delivered: 1,
					failed: 0,
					total: 1
				}
			}
		],
		get: () => undefined,
		remove: () => undefined,
		set: () => undefined
	});

	return expect(history).resolves.toMatchObject({
		status: 'fail'
	});
});

test('observability export delivery assertion catches failed stale receipts and freshness gaps', async () => {
	const now = 1_000_000;
	const history = await buildVoiceObservabilityExportDeliveryHistory({
		list: () => [
			{
				checkedAt: now - 2_000,
				destinations: [
					{
						artifactCount: 1,
						deliveredAt: now - 2_000,
						destinationId: 'file-archive',
						destinationKind: 'file',
						label: 'File archive',
						manifestBytes: 256,
						schema: {
							id: voiceObservabilityExportSchemaId,
							version: voiceObservabilityExportSchemaVersion
						},
						status: 'delivered',
						target: '.voice-runtime/export'
					}
				],
				exportStatus: 'pass',
				id: 'observability-export:run-1',
				runId: 'run-1',
				status: 'pass',
				summary: {
					delivered: 1,
					failed: 0,
					total: 1
				}
			}
		],
		get: () => undefined,
		remove: () => undefined,
		set: () => undefined
	});

	expect(
		evaluateVoiceObservabilityExportDeliveryEvidence(history, {
			maxLatestSuccessAgeMs: 5_000,
			now,
			requiredDestinationKinds: ['file']
		})
	).toMatchObject({
		failedExportReceipts: 0,
		failedReceipts: 0,
		latestSuccessAgeMs: 2_000,
		ok: true
	});
	expect(
		assertVoiceObservabilityExportDeliveryEvidence(history, {
			maxLatestSuccessAgeMs: 5_000,
			now
		}).ok
	).toBe(true);

	const failed = await buildVoiceObservabilityExportDeliveryHistory({
		list: () => [
			...history.receipts,
			{
				checkedAt: now,
				destinations: [
					{
						artifactCount: 1,
						deliveredAt: now,
						destinationId: 'file-archive',
						destinationKind: 'file',
						label: 'File archive',
						manifestBytes: 256,
						schema: {
							id: voiceObservabilityExportSchemaId,
							version: voiceObservabilityExportSchemaVersion
						},
						status: 'delivered',
						target: '.voice-runtime/export'
					}
				],
				exportStatus: 'fail',
				id: 'observability-export:failed',
				runId: 'failed',
				status: 'fail',
				summary: {
					delivered: 1,
					failed: 0,
					total: 1
				}
			}
		],
		get: () => undefined,
		remove: () => undefined,
		set: () => undefined
	});
	const report = evaluateVoiceObservabilityExportDeliveryEvidence(failed, {
		maxLatestSuccessAgeMs: 1_000,
		now,
		requiredDestinationKinds: ['sqlite']
	});

	expect(report).toMatchObject({
		failedExportReceipts: 1,
		failedReceipts: 1,
		ok: false
	});
	expect(report.issues).toEqual(
		expect.arrayContaining([
			expect.stringContaining('failed observability export delivery receipt'),
			expect.stringContaining('failed observability export receipt manifest'),
			expect.stringContaining('latest successful observability export delivery age'),
			expect.stringContaining('destination kind: sqlite')
		])
	);
	expect(() =>
		assertVoiceObservabilityExportDeliveryEvidence(failed, { now })
	).toThrow('Voice observability export delivery assertion failed');
});

test('observability export replay assertion catches failed artifacts and missing records', async () => {
	const manifest = await readObservabilityExportFixture('manifest.json');
	const artifactIndex = await readObservabilityExportFixture('artifact-index.json');
	const replay = buildVoiceObservabilityExportReplayReport({
		artifactIndex,
		manifest
	});

	expect(
		evaluateVoiceObservabilityExportReplayEvidence(replay, {
			minArtifacts: 1,
			requiredRecordKinds: ['artifact-index', 'manifest']
		})
	).toMatchObject({
		ok: true,
		recordKinds: ['artifact-index', 'manifest'],
		status: 'pass'
	});
	expect(assertVoiceObservabilityExportReplayEvidence(replay).ok).toBe(true);

	const failed = buildVoiceObservabilityExportReplayReport({
		artifactIndex: {
			...artifactIndex,
			artifacts: [
				{
					id: 'latest-proof-trends',
					kind: 'proof-pack',
					label: 'Latest proof trends',
					status: 'fail'
				}
			]
		},
		manifest: {
			...manifest,
			artifacts: [
				{
					id: 'latest-proof-trends',
					kind: 'proof-pack',
					label: 'Latest proof trends',
					status: 'fail'
				}
			],
			status: 'fail'
		}
	});
	const report = evaluateVoiceObservabilityExportReplayEvidence(failed, {
		requiredRecordKinds: ['delivery-receipt']
	});

	expect(report).toMatchObject({
		failedArtifacts: 2,
		ok: false,
		replayIssues: 3,
		status: 'fail'
	});
	expect(report.issues).toEqual(
		expect.arrayContaining([
			expect.stringContaining('replay status pass'),
			expect.stringContaining('replay issue'),
			expect.stringContaining('failed observability export artifact'),
			expect.stringContaining('record kind: delivery-receipt')
		])
	);
	expect(() => assertVoiceObservabilityExportReplayEvidence(failed)).toThrow(
		'Voice observability export replay assertion failed'
	);
});

test('replayVoiceObservabilityExport reads delivered file export and receipt health', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'voice-observability-replay-'));
	const receipts = createVoiceMemoryObservabilityExportDeliveryReceiptStore();
	const report = await buildVoiceObservabilityExport({
		artifacts: [
			{
				bytes: 128,
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack',
				status: 'pass'
			}
		]
	});

	await deliverVoiceObservabilityExport({
		destinations: [
			{
				directory: dir,
				kind: 'file',
				label: 'Replay archive'
			}
		],
		receipts,
		report,
		runId: 'run-1'
	});
	const receipt = await receipts.get('observability-export:run-1');

	const replay = await replayVoiceObservabilityExport({
		artifactIndex: JSON.parse(
			await Bun.file(join(dir, 'run-1', 'artifact-index.json')).text()
		),
		deliveryReceipt: receipt,
		kind: 'records',
		manifest: JSON.parse(await Bun.file(join(dir, 'run-1', 'manifest.json')).text())
	});

	expect(replay).toMatchObject({
		status: 'pass',
		summary: {
			artifacts: 1,
			deliveryDestinations: 1,
			failedDeliveryDestinations: 0
		}
	});
});

test('replayVoiceObservabilityExport reads SQLite delivery payloads', async () => {
	const database = new Database(':memory:');
	const report = await buildVoiceObservabilityExport({
		artifacts: [
			{
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack'
			}
		]
	});

	await deliverVoiceObservabilityExport({
		destinations: [
			{
				database,
				kind: 'sqlite',
				tableName: 'voice_observability_exports'
			}
		],
		report,
		runId: 'run-1'
	});

	const replay = await replayVoiceObservabilityExport({
		database,
		kind: 'sqlite',
		runId: 'run-1',
		tableName: 'voice_observability_exports'
	});

	expect(replay).toMatchObject({
		records: {
			databaseRecord: {
				ok: true
			}
		},
		status: 'pass',
		summary: {
			artifacts: 1,
			validationIssues: 0
		}
	});
});

test('renderVoiceObservabilityExportReplayHTML makes replay proof readable', async () => {
	const manifest = await readObservabilityExportFixture('manifest.json');
	const artifactIndex = await readObservabilityExportFixture('artifact-index.json');
	const replay = buildVoiceObservabilityExportReplayReport({
		artifactIndex,
		manifest
	});
	const html = renderVoiceObservabilityExportReplayHTML(replay);

	expect(html).toContain('Voice Observability Export Replay');
	expect(html).toContain('Customer-owned observability proof');
	expect(html).toContain('Artifacts');
	expect(html).toContain('Status: pass');
	expect(html).toContain('not present');
});

test('createVoiceObservabilityExportReplayRoutes exposes JSON and HTML replay proof', async () => {
	const manifest = await readObservabilityExportFixture('manifest.json');
	const artifactIndex = await readObservabilityExportFixture('artifact-index.json');
	const app = createVoiceObservabilityExportReplayRoutes({
		source: {
			artifactIndex,
			kind: 'records',
			manifest
		}
	});

	const json = await app.handle(
		new Request('http://localhost/api/voice/observability-export/replay')
	);
	const html = await app.handle(
		new Request('http://localhost/voice/observability-export/replay')
	);

	expect(json.status).toBe(200);
	expect(await json.json()).toMatchObject({
		status: 'pass',
		summary: {
			artifacts: 1,
			validationIssues: 0
		}
	});
	expect(html.status).toBe(200);
	expect(html.headers.get('content-type')).toContain('text/html');
	expect(await html.text()).toContain('createVoiceObservabilityExportReplayRoutes');
});

test('buildVoiceObservabilityExport creates customer-owned evidence manifest', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	const audit = createVoiceMemoryAuditEventStore();
	const started = await trace.append(
		createVoiceTraceEvent({
			at: 1_000,
			payload: { type: 'start' },
			sessionId: 'session-1',
			traceId: 'trace-1',
			type: 'call.lifecycle'
		})
	);
	const model = await trace.append(
		createVoiceTraceEvent({
			at: 1_100,
			payload: {
				elapsedMs: 320,
				kind: 'llm',
				provider: 'openai',
				providerStatus: 'success'
			},
			sessionId: 'session-1',
			traceId: 'trace-1',
			type: 'agent.model'
		})
	);
	await trace.append(
		createVoiceTraceEvent({
			at: 1_200,
			payload: { text: 'Need help with billing.' },
			sessionId: 'session-1',
			traceId: 'trace-1',
			type: 'turn.transcript'
		})
	);
	await trace.append(
		createVoiceTraceEvent({
			at: 1_300,
			payload: { text: 'Need help with billing.' },
			sessionId: 'session-1',
			traceId: 'trace-1',
			turnId: 'turn-1',
			type: 'turn.committed'
		})
	);
	await trace.append(
		createVoiceTraceEvent({
			at: 1_400,
			payload: { text: 'I can help route that.' },
			sessionId: 'session-1',
			traceId: 'trace-1',
			turnId: 'turn-1',
			type: 'turn.assistant'
		})
	);
	await trace.append(
		createVoiceTraceEvent({
			at: 1_500,
			payload: { type: 'end' },
			sessionId: 'session-1',
			traceId: 'trace-1',
			type: 'call.lifecycle'
		})
	);
	const auditEvent = await audit.append(
		createVoiceAuditEvent({
			action: 'provider.call',
			at: 1_125,
			outcome: 'success',
			payload: {
				kind: 'llm',
				provider: 'openai'
			},
			sessionId: 'session-1',
			traceId: 'trace-1',
			type: 'provider.call'
		})
	);

	const report = await buildVoiceObservabilityExport({
		artifacts: [
			{
				bytes: 325_396,
				href: '/voice/provider-slos',
				id: 'provider-slo-screenshot',
				kind: 'screenshot',
				label: 'Provider SLO screenshot',
				status: 'pass'
			}
		],
		audit,
		auditDeliveries: [
			createVoiceAuditSinkDeliveryRecord({
				deliveredAt: 1_300,
				deliveryStatus: 'delivered',
				events: [auditEvent],
				id: 'audit-delivery-1'
			})
		],
		links: {
			operationsRecord: (sessionId) => `/voice-operations/${sessionId}`
		},
		includeOperationsRecords: true,
		store: trace,
		traceDeliveries: [
			createVoiceTraceSinkDeliveryRecord({
				deliveredAt: 1_600,
				deliveryStatus: 'delivered',
				events: [started, model],
				id: 'trace-delivery-1'
			})
		]
	});

	expect(report.status).toBe('pass');
	expect(report.schema).toEqual({
		id: voiceObservabilityExportSchemaId,
		version: voiceObservabilityExportSchemaVersion
	});
	expect(() => assertVoiceObservabilityExportSchema(report)).not.toThrow();
	expect(() =>
		assertVoiceObservabilityExportSchema({
			schema: { id: voiceObservabilityExportSchemaId, version: '0.0.0' }
		})
	).toThrow('Unsupported voice observability export schema');
	expect(report.sessionIds).toEqual(['session-1']);
	expect(report.operationsRecords).toHaveLength(1);
	expect(report.artifacts).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				href: '/voice-operations/session-1',
				kind: 'operations-record',
				sessionId: 'session-1'
			}),
			expect.objectContaining({
				id: 'provider-slo-screenshot',
				kind: 'screenshot'
			})
		])
	);
	expect(report.envelopes).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				eventId: model.id,
				operationsRecordHref: '/voice-operations/session-1',
				provider: 'openai',
				providerKind: 'llm'
			}),
			expect.objectContaining({
				eventId: auditEvent.id,
				kind: 'audit',
				provider: 'openai'
			})
		])
	);
	expect(renderVoiceObservabilityExportMarkdown(report)).toContain(
		'Provider SLO screenshot'
	);
});

test('buildVoiceObservabilityExport fails stale customer-owned delivery proof', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	const event = await trace.append(
		createVoiceTraceEvent({
			at: 1_000,
			payload: { type: 'start' },
			sessionId: 'session-1',
			type: 'call.lifecycle'
		})
	);

	const report = await buildVoiceObservabilityExport({
		store: trace,
		traceDeliveries: [
			createVoiceTraceSinkDeliveryRecord({
				deliveryAttempts: 2,
				deliveryError: 'warehouse unavailable',
				deliveryStatus: 'failed',
				events: [event],
				id: 'trace-delivery-failed'
			})
		]
	});

	expect(report.status).toBe('fail');
	expect(report.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'voice.observability.trace_delivery_failed',
				severity: 'fail',
				value: 1
			})
		])
	);
});

test('buildVoiceObservabilityExport adds artifact checksum and freshness proof', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'voice-observability-export-'));
	const path = join(dir, 'proof-pack.md');
	await writeFile(path, '# Proof Pack\n\nfresh evidence\n');

	const report = await buildVoiceObservabilityExport({
		artifactIntegrity: {
			maxAgeMs: 60_000,
			now: 2_000
		},
		artifacts: [
			{
				generatedAt: 1_000,
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack',
				path,
				required: true
			}
		]
	});

	expect(report.status).toBe('pass');
	expect(report.artifacts[0]).toMatchObject({
		checksum: {
			algorithm: 'sha256'
		},
		freshness: {
			ageMs: 1_000,
			maxAgeMs: 60_000,
			status: 'pass'
		}
	});
	expect(report.artifacts[0]?.bytes).toBeGreaterThan(0);
	expect(report.artifacts[0]?.checksum?.value).toHaveLength(64);
	expect(buildVoiceObservabilityArtifactIndex(report)).toMatchObject({
		schema: {
			id: voiceObservabilityExportSchemaId,
			version: voiceObservabilityExportSchemaVersion
		},
		summary: {
			downloadable: 0,
			required: 1,
			total: 1
		}
	});
	expect(renderVoiceObservabilityExportMarkdown(report)).toContain('sha256');
});

test('buildVoiceObservabilityExport fails stale required artifact proof', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'voice-observability-export-'));
	const path = join(dir, 'proof-pack.md');
	await writeFile(path, '# Proof Pack\n\nstale evidence\n');

	const report = await buildVoiceObservabilityExport({
		artifactIntegrity: {
			maxAgeMs: 500,
			now: 2_000
		},
		artifacts: [
			{
				generatedAt: 1_000,
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack',
				path,
				required: true
			}
		]
	});

	expect(report.status).toBe('fail');
	expect(report.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'voice.observability.artifact_stale',
				severity: 'fail',
				value: 'proof-pack'
			})
		])
	);
});

test('buildVoiceObservabilityExport fails missing required artifact proof', async () => {
	const report = await buildVoiceObservabilityExport({
		artifactIntegrity: {
			now: 2_000
		},
		artifacts: [
			{
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack',
				path: '/tmp/absolutejs-voice-missing-proof-pack.md',
				required: true
			}
		]
	});

	expect(report.status).toBe('fail');
	expect(report.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'voice.observability.artifact_missing',
				severity: 'fail',
				value: 'proof-pack'
			})
		])
	);
});

test('createVoiceObservabilityExportRoutes exposes JSON and Markdown reports', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	await trace.append(
		createVoiceTraceEvent({
			at: 1_000,
			payload: { type: 'start' },
			sessionId: 'session-1',
			type: 'call.lifecycle'
		})
	);
	const app = createVoiceObservabilityExportRoutes({
		artifactIntegrity: {
			maxAgeMs: 60_000,
			now: Date.now()
		},
		artifacts: [
			{
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack',
				path: '.voice-runtime/proof-pack/latest.md'
			}
		],
		store: trace
	});

	const json = await app.handle(
		new Request('http://localhost/api/voice/observability-export')
	);
	const markdown = await app.handle(
		new Request('http://localhost/voice/observability-export.md')
	);

	expect(json.status).toBe(200);
	expect(await json.json()).toMatchObject({
		artifacts: expect.arrayContaining([
			expect.objectContaining({ id: 'proof-pack' })
		]),
		status: 'pass'
	});
	expect(await markdown.text()).toContain('# Voice Observability Export');
});

test('createVoiceObservabilityExportRoutes exposes artifact index and downloads', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'voice-observability-export-'));
	const path = join(dir, 'proof-pack.md');
	await writeFile(path, '# Proof Pack\n\nartifact download\n');

	const app = createVoiceObservabilityExportRoutes({
		artifactIntegrity: {
			maxAgeMs: 60_000,
			now: 2_000
		},
		artifacts: [
			{
				generatedAt: 1_000,
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack',
				path,
				required: true
			}
		]
	});

	const index = await app.handle(
		new Request('http://localhost/api/voice/observability-export/artifacts')
	);
	const artifact = await app.handle(
		new Request(
			'http://localhost/api/voice/observability-export/artifacts/proof-pack'
		)
	);

	expect(index.status).toBe(200);
	expect(await index.json()).toMatchObject({
		artifacts: [
			expect.objectContaining({
				downloadHref:
					'/api/voice/observability-export/artifacts/proof-pack',
				id: 'proof-pack',
				required: true
			})
		],
		summary: {
			downloadable: 1,
			required: 1,
			total: 1
		}
	});
	expect(artifact.status).toBe(200);
	expect(artifact.headers.get('content-type')).toContain('text/markdown');
	expect(artifact.headers.get('x-absolute-voice-artifact-sha256')).toHaveLength(
		64
	);
	expect(await artifact.text()).toContain('artifact download');
});

test('deliverVoiceObservabilityExport writes manifest, index, and artifacts to file destination', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'voice-observability-delivery-'));
	const artifactPath = join(dir, 'proof-pack.md');
	const deliveryDir = join(dir, 'delivery');
	await writeFile(artifactPath, '# Proof Pack\n\nfile delivery\n');
	const report = await buildVoiceObservabilityExport({
		artifactIntegrity: {
			maxAgeMs: 60_000,
			now: 2_000
		},
		artifacts: [
			{
				generatedAt: 1_000,
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack',
				path: artifactPath,
				required: true
			}
		]
	});

	const delivery = await deliverVoiceObservabilityExport({
		destinations: [
			{
				directory: deliveryDir,
				kind: 'file',
				label: 'Local proof archive'
			}
		],
		report,
		runId: 'run-1'
	});

	expect(delivery).toMatchObject({
		status: 'pass',
		summary: {
			delivered: 1,
			failed: 0,
			total: 1
		}
	});
	expect(await readdir(join(deliveryDir, 'run-1'))).toEqual(
		expect.arrayContaining(['artifact-index.json', 'artifacts', 'manifest.json'])
	);
	expect(await readdir(join(deliveryDir, 'run-1', 'artifacts'))).toEqual([
		'proof-pack.md'
	]);
});

test('deliverVoiceObservabilityExport persists memory delivery receipts', async () => {
	const report = await buildVoiceObservabilityExport({
		artifacts: [
			{
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack'
			}
		]
	});
	const receipts = createVoiceMemoryObservabilityExportDeliveryReceiptStore();

	await deliverVoiceObservabilityExport({
		destinations: [
			{
				directory: await mkdtemp(
					join(tmpdir(), 'voice-observability-receipts-')
				),
				kind: 'file'
			}
		],
		receipts,
		report,
		runId: 'run-1'
	});

	const history = await buildVoiceObservabilityExportDeliveryHistory(receipts);
	expect(history).toMatchObject({
		status: 'pass',
		summary: {
			delivered: 1,
			failed: 0,
			receipts: 1,
			totalDestinations: 1
		}
	});
	expect(history.receipts[0]).toMatchObject({
		id: 'observability-export:run-1',
		runId: 'run-1',
		status: 'pass'
	});
});

test('file observability export delivery receipt store persists receipt history', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'voice-observability-receipts-'));
	const receipts = createVoiceFileObservabilityExportDeliveryReceiptStore({
		directory: dir
	});
	await receipts.set('receipt-1', {
		checkedAt: 2_000,
		destinations: [],
		exportStatus: 'pass',
		id: 'receipt-1',
		runId: 'run-1',
		status: 'pass',
		summary: {
			delivered: 1,
			failed: 0,
			total: 1
		}
	});

	const loaded = await receipts.get('receipt-1');
	const history = await buildVoiceObservabilityExportDeliveryHistory(receipts);

	expect(loaded?.runId).toBe('run-1');
	expect(history.summary.receipts).toBe(1);
	expect(history.summary.delivered).toBe(1);
});

test('deliverVoiceObservabilityExport posts manifest and index to webhook destination', async () => {
	const report = await buildVoiceObservabilityExport({
		artifacts: [
			{
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack'
			}
		]
	});
	let postedBody: Record<string, unknown> | undefined;

	const delivery = await deliverVoiceObservabilityExport({
		destinations: [
			{
				fetch: async (_url, init) => {
					postedBody = JSON.parse(String(init?.body));
					return new Response('ok');
				},
				kind: 'webhook',
				url: 'https://warehouse.example.test/voice'
			}
		],
		report,
		runId: 'run-1'
	});

	expect(delivery.status).toBe('pass');
	expect(postedBody).toMatchObject({
		artifactIndex: {
			schema: {
				id: voiceObservabilityExportSchemaId,
				version: voiceObservabilityExportSchemaVersion
			},
			summary: {
				total: 1
			}
		},
		manifest: {
			schema: {
				id: voiceObservabilityExportSchemaId,
				version: voiceObservabilityExportSchemaVersion
			},
			status: 'pass'
		},
		runId: 'run-1',
		source: 'absolutejs-voice'
	});
});

test('deliverVoiceObservabilityExport writes manifest, index, and artifacts to S3 destination', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'voice-observability-s3-'));
	const artifactPath = join(dir, 'proof-pack.md');
	await writeFile(artifactPath, '# Proof Pack\n\ns3 delivery\n');
	const report = await buildVoiceObservabilityExport({
		artifacts: [
			{
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack',
				path: artifactPath
			}
		]
	});
	const s3 = createFakeObservabilityS3Client();

	const delivery = await deliverVoiceObservabilityExport({
		destinations: [
			{
				bucket: 'voice-evidence',
				client: s3,
				keyPrefix: 'absolutejs/demo',
				kind: 's3',
				label: 'S3 evidence archive'
			}
		],
		report,
		runId: 'run-1'
	});

	expect(delivery).toMatchObject({
		destinations: [
			expect.objectContaining({
				artifactCount: 1,
				destinationKind: 's3',
				status: 'delivered',
				target: 's3://voice-evidence/absolutejs/demo/run-1'
			})
		],
		status: 'pass'
	});
	expect([...s3.objects.keys()].sort()).toEqual([
		'absolutejs/demo/run-1/artifact-index.json',
		'absolutejs/demo/run-1/artifacts/proof-pack.md',
		'absolutejs/demo/run-1/manifest.json'
	]);
	expect(s3.objects.get('absolutejs/demo/run-1/artifacts/proof-pack.md')?.type).toBe(
		'text/markdown; charset=utf-8'
	);
});

test('deliverVoiceObservabilityExport writes manifest and artifact index to SQLite destination', async () => {
	const database = new Database(':memory:');
	const report = await buildVoiceObservabilityExport({
		artifacts: [
			{
				checksum: {
					algorithm: 'sha256',
					value: 'abc123'
				},
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack',
				status: 'pass'
			}
		]
	});

	const delivery = await deliverVoiceObservabilityExport({
		destinations: [
			{
				database,
				kind: 'sqlite',
				label: 'SQLite evidence warehouse',
				tableName: 'voice_export_runs'
			}
		],
		report,
		runId: 'run-sqlite'
	});
	const row = database
		.query(
			'SELECT run_id, status, artifact_count, manifest_json, artifact_index_json FROM voice_export_runs WHERE run_id = $runId'
		)
		.get({ $runId: 'run-sqlite' }) as
		| {
				artifact_count: number;
				artifact_index_json: string;
				manifest_json: string;
				run_id: string;
				status: string;
		  }
		| undefined;

	expect(delivery).toMatchObject({
		destinations: [
			expect.objectContaining({
				artifactCount: 1,
				destinationKind: 'sqlite',
				schema: {
					id: voiceObservabilityExportSchemaId,
					version: voiceObservabilityExportSchemaVersion
				},
				status: 'delivered',
				target: 'sqlite://memory/voice_export_runs'
			})
		],
		status: 'pass'
	});
	expect(row?.run_id).toBe('run-sqlite');
	expect(row?.status).toBe('pass');
	expect(row?.artifact_count).toBe(1);
	expect(JSON.parse(row?.manifest_json ?? '{}')).toMatchObject({
		schema: {
			id: voiceObservabilityExportSchemaId,
			version: voiceObservabilityExportSchemaVersion
		},
		status: 'pass'
	});
	expect(JSON.parse(row?.artifact_index_json ?? '{}')).toMatchObject({
		schema: {
			id: voiceObservabilityExportSchemaId,
			version: voiceObservabilityExportSchemaVersion
		},
		summary: {
			total: 1
		}
	});
});

test('deliverVoiceObservabilityExport writes manifest and artifact index to Postgres destination', async () => {
	const sql = createFakeObservabilityPostgresClient();
	const report = await buildVoiceObservabilityExport({
		artifacts: [
			{
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack'
			}
		]
	});

	const delivery = await deliverVoiceObservabilityExport({
		destinations: [
			{
				kind: 'postgres',
				label: 'Postgres evidence warehouse',
				schemaName: 'voice',
				sql,
				tableName: 'observability_exports'
			}
		],
		report,
		runId: 'run-postgres'
	});
	const row = sql.rows.get('run-postgres');

	expect(delivery).toMatchObject({
		destinations: [
			expect.objectContaining({
				artifactCount: 1,
				destinationKind: 'postgres',
				status: 'delivered',
				target: 'postgres://voice/observability_exports'
			})
		],
		status: 'pass'
	});
	expect(row).toMatchObject({
		artifactCount: 1,
		exportStatus: 'pass',
		runId: 'run-postgres',
		schema: {
			id: voiceObservabilityExportSchemaId,
			version: voiceObservabilityExportSchemaVersion
		},
		status: 'pass'
	});
	expect(row?.manifest).toMatchObject({
		schema: {
			id: voiceObservabilityExportSchemaId,
			version: voiceObservabilityExportSchemaVersion
		},
		status: 'pass'
	});
	expect(row?.artifactIndex).toMatchObject({
		schema: {
			id: voiceObservabilityExportSchemaId,
			version: voiceObservabilityExportSchemaVersion
		},
		summary: {
			total: 1
		}
	});
});

test('createVoiceObservabilityExportRoutes can deliver export to configured destinations', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'voice-observability-routes-'));
	const receipts = createVoiceMemoryObservabilityExportDeliveryReceiptStore();
	const app = createVoiceObservabilityExportRoutes({
		artifacts: [
			{
				id: 'proof-pack',
				kind: 'proof-pack',
				label: 'Proof pack'
			}
		],
		deliveryDestinations: [
			{
				directory: dir,
				kind: 'file'
			}
		],
		deliveryReceipts: receipts
	});

	const post = await app.handle(
		new Request('http://localhost/api/voice/observability-export/deliveries', {
			method: 'POST'
		})
	);
	const get = await app.handle(
		new Request('http://localhost/api/voice/observability-export/deliveries')
	);

	expect(post.status).toBe(200);
	expect(await post.json()).toMatchObject({
		status: 'pass',
		summary: {
			delivered: 1,
			failed: 0,
			total: 1
		}
	});
	expect(get.status).toBe(200);
	expect(await get.json()).toMatchObject({
		status: 'pass',
		summary: {
			receipts: 1,
			totalDestinations: 1
		}
	});
});
