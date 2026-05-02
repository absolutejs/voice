import { expect, test } from 'bun:test';
import {
	buildVoiceIncidentBundle,
	buildVoiceDataRetentionPlan,
	createVoiceAuditEvent,
	createVoiceIncidentBundleRoutes,
	createVoiceMemoryIncidentBundleStore,
	createVoiceMemoryAuditEventStore,
	createVoiceMemoryTraceEventStore,
	createVoiceTraceEvent,
	pruneVoiceIncidentBundleArtifacts,
	saveVoiceIncidentBundleArtifact
} from '../src';

const createIncidentTraceEvents = () => [
	createVoiceTraceEvent({
		at: 100,
		payload: {
			type: 'start'
		},
		sessionId: 'incident-1',
		type: 'call.lifecycle'
	}),
	createVoiceTraceEvent({
		at: 120,
		payload: {
			isFinal: true,
			text: 'My email is alex@example.com and I need billing help.'
		},
		sessionId: 'incident-1',
		turnId: 'turn-1',
		type: 'turn.transcript'
	}),
	createVoiceTraceEvent({
		at: 130,
		payload: {
			text: 'My email is alex@example.com and I need billing help.'
		},
		sessionId: 'incident-1',
		turnId: 'turn-1',
		type: 'turn.committed'
	}),
	createVoiceTraceEvent({
		at: 150,
		payload: {
			fromAgentId: 'intake',
			status: 'allowed',
			summary: 'Billing handoff',
			targetAgentId: 'billing'
		},
		sessionId: 'incident-1',
		turnId: 'turn-1',
		type: 'agent.handoff'
	}),
	createVoiceTraceEvent({
		at: 180,
		payload: {
			elapsedMs: 30,
			status: 'error',
			toolName: 'lookup_invoice',
			error: 'invoice API failed'
		},
		sessionId: 'incident-1',
		turnId: 'turn-1',
		type: 'agent.tool'
	}),
	createVoiceTraceEvent({
		at: 200,
		payload: {
			error: 'OpenAI realtime failed for alex@example.com',
			provider: 'openai',
			providerStatus: 'error'
		},
		sessionId: 'incident-1',
		turnId: 'turn-1',
		type: 'session.error'
	}),
	createVoiceTraceEvent({
		at: 220,
		metadata: {
			proof: 'incident-guardrail-proof'
		},
		payload: {
			allowed: false,
			findings: [
				{
					action: 'block',
					label: 'Unsafe assistant output',
					ruleId: 'support.no-medical-advice'
				}
			],
			stage: 'assistant-output',
			status: 'fail'
		},
		sessionId: 'incident-1',
		turnId: 'turn-1',
		type: 'assistant.guardrail'
	})
];

test('buildVoiceIncidentBundle exports redacted operations, trace, audit, and markdown evidence', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	const audit = createVoiceMemoryAuditEventStore();
	for (const event of createIncidentTraceEvents()) {
		await trace.append(event);
	}
	await audit.append(
		createVoiceAuditEvent({
			action: 'llm.provider.call',
			outcome: 'error',
			payload: {
				error: 'provider failed for alex@example.com',
				provider: 'openai'
			},
			sessionId: 'incident-1',
			type: 'provider.call'
		})
	);

	const bundle = await buildVoiceIncidentBundle({
		audit,
		redact: true,
		recoveryOutcomes: {
			checkedAt: 300,
			entries: [
				{
					actionId: 'proof.rerun',
					afterStatus: 'pass',
					at: 275,
					beforeStatus: 'fail',
					detail: 'Recovered alex@example.com proof path.',
					eventId: 'audit-recovery-1',
					outcome: 'improved'
				}
			],
			failed: 0,
			improved: 1,
			regressed: 0,
			total: 1,
			unchanged: 0
		},
		sessionId: 'incident-1',
		store: trace
	});

	expect(bundle.redacted).toBe(true);
	expect(bundle.formatVersion).toBe(1);
	expect(bundle.summary).toMatchObject({
		auditEvents: 1,
		errors: 1,
		handoffs: 1,
		sessionId: 'incident-1',
		status: 'failed',
		tools: 1,
		traceEvents: 7
	});
	expect(bundle.record.guardrails).toMatchObject({
		blocked: 1,
		stages: ['assistant-output'],
		total: 1
	});
	expect(JSON.stringify(bundle.record)).not.toContain('alex@example.com');
	expect(bundle.markdown).toContain('Voice Incident incident-1');
	expect(bundle.markdown).toContain('## Guardrail evidence');
	expect(bundle.markdown).toContain('## Recovery Outcomes');
	expect(bundle.markdown).toContain('Improved: 1');
	expect(bundle.markdown).not.toContain('Recovered alex@example.com');
	expect(bundle.markdown).toContain('assistant.guardrail assistant-output');
	expect(bundle.markdown).toContain('incident-guardrail-proof');
	expect(bundle.markdown).toContain('## Trace Evidence');
	expect(bundle.markdown).toContain('## Audit Evidence');
	expect(bundle.markdown).not.toContain('alex@example.com');
	expect(bundle.traceMarkdown).not.toContain('alex@example.com');
	expect(bundle.auditMarkdown).not.toContain('alex@example.com');
});

test('createVoiceIncidentBundleRoutes exposes JSON and Markdown exports', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	for (const event of createIncidentTraceEvents()) {
		await trace.append(event);
	}
	const app = createVoiceIncidentBundleRoutes({
		redact: true,
		store: trace
	});

	const json = await app.handle(
		new Request('http://localhost/api/voice-incidents/incident-1')
	);
	expect(json.status).toBe(200);
	await expect(json.json()).resolves.toMatchObject({
		sessionId: 'incident-1',
		summary: {
			errors: 1
		}
	});

	const markdown = await app.handle(
		new Request('http://localhost/voice-incidents/incident-1/markdown')
	);
	expect(markdown.status).toBe(200);
	expect(markdown.headers.get('Content-Type')).toContain('text/markdown');
	const text = await markdown.text();
	expect(text).toContain('Voice Incident incident-1');
	expect(text).toContain('assistant.guardrail assistant-output');
	expect(text).not.toContain('alex@example.com');
});

test('incident bundle artifacts can expire and be pruned', async () => {
	const store = createVoiceMemoryIncidentBundleStore();
	const bundle = await buildVoiceIncidentBundle({
		events: createIncidentTraceEvents(),
		redact: true,
		sessionId: 'incident-1'
	});
	await saveVoiceIncidentBundleArtifact({
		bundle,
		options: {
			createdAt: 100,
			id: 'incident-old',
			ttlMs: 50
		},
		store
	});
	await saveVoiceIncidentBundleArtifact({
		bundle,
		options: {
			createdAt: 200,
			id: 'incident-new',
			ttlMs: 500
		},
		store
	});

	const plan = await pruneVoiceIncidentBundleArtifacts({
		dryRun: true,
		expiredAt: 160,
		store
	});
	expect(plan).toMatchObject({
		deletedCount: 1,
		deletedIds: ['incident-old'],
		dryRun: true,
		scannedCount: 2
	});
	expect(await store.get('incident-old')).toBeDefined();

	const pruned = await pruneVoiceIncidentBundleArtifacts({
		expiredAt: 160,
		store
	});
	expect(pruned.deletedIds).toEqual(['incident-old']);
	expect(await store.get('incident-old')).toBeUndefined();
	expect((await store.list()).map((artifact) => artifact.id)).toEqual([
		'incident-new'
	]);
});

test('data retention plans include incident bundle artifacts', async () => {
	const store = createVoiceMemoryIncidentBundleStore();
	const bundle = await buildVoiceIncidentBundle({
		events: createIncidentTraceEvents(),
		redact: true,
		sessionId: 'incident-1'
	});
	await saveVoiceIncidentBundleArtifact({
		bundle,
		options: {
			createdAt: 100,
			expiresAt: 150,
			id: 'incident-expired'
		},
		store
	});

	const plan = await buildVoiceDataRetentionPlan({
		beforeOrAt: 150,
		incidentBundles: store,
		scopes: ['incidentBundles']
	});

	expect(plan).toMatchObject({
		deletedCount: 1,
		dryRun: true,
		scopes: [
			{
				deletedIds: ['incident-expired'],
				scope: 'incidentBundles'
			}
		]
	});
	expect(await store.get('incident-expired')).toBeDefined();
});
