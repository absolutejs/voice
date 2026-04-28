import { expect, test } from 'bun:test';
import {
	buildVoiceAuditExport,
	createVoiceMemoryAuditEventStore,
	exportVoiceAuditTrail,
	redactVoiceAuditEvents,
	renderVoiceAuditHTML,
	renderVoiceAuditMarkdown
} from '../src';

const createAuditEvents = () => [
	{
		action: 'llm.provider.call',
		actor: {
			id: 'support',
			kind: 'agent' as const
		},
		at: 100,
		id: 'audit-1',
		outcome: 'success' as const,
		payload: {
			apiKey: 'sk-secret',
			email: 'alex@example.com',
			message: 'Call Alex at 415-555-1212',
			provider: 'openai'
		},
		resource: {
			id: 'openai',
			type: 'provider'
		},
		sessionId: 'session-1',
		type: 'provider.call' as const
	},
	{
		action: 'tool.call',
		actor: {
			id: 'support',
			kind: 'agent' as const
		},
		at: 200,
		id: 'audit-2',
		outcome: 'error' as const,
		payload: {
			error: 'Webhook token token-123 failed for bob@example.com',
			toolName: 'book_meeting'
		},
		resource: {
			id: 'book_meeting',
			type: 'tool'
		},
		sessionId: 'session-1',
		type: 'tool.call' as const
	}
];

test('redactVoiceAuditEvents scrubs sensitive audit payloads', () => {
	const redacted = redactVoiceAuditEvents(createAuditEvents(), true);

	expect(redacted[0]?.payload).toMatchObject({
		apiKey: '[redacted]',
		email: '[redacted]',
		message: 'Call Alex at [redacted]',
		provider: 'openai'
	});
	expect(redacted[1]?.payload?.error).toContain('[redacted]');
	expect(JSON.stringify(redacted)).not.toContain('alex@example.com');
	expect(JSON.stringify(redacted)).not.toContain('sk-secret');
});

test('exportVoiceAuditTrail exports filtered redacted audit evidence from a store', async () => {
	const store = createVoiceMemoryAuditEventStore();
	await Promise.all(createAuditEvents().map((event) => store.append(event)));

	const exported = await exportVoiceAuditTrail({
		filter: {
			outcome: 'error'
		},
		redact: true,
		store
	});

	expect(exported.redacted).toBe(true);
	expect(exported.events).toHaveLength(1);
	expect(exported.summary.errors).toBe(1);
	expect(JSON.stringify(exported.events)).not.toContain('bob@example.com');
});

test('audit renderers produce portable redacted markdown and html', () => {
	const events = createAuditEvents();
	const markdown = renderVoiceAuditMarkdown(events, {
		redact: true,
		title: 'Support audit'
	});
	const html = renderVoiceAuditHTML(events, {
		redact: true,
		title: 'Support audit'
	});
	const bundle = buildVoiceAuditExport(events, {
		redact: true,
		title: 'Support audit'
	});

	expect(markdown).toContain('# Support audit');
	expect(markdown).toContain('provider.call');
	expect(markdown).not.toContain('alex@example.com');
	expect(html).toContain('Support audit');
	expect(html).toContain('Markdown Export');
	expect(html).not.toContain('sk-secret');
	expect(bundle.summary.total).toBe(2);
	expect(bundle.markdown).not.toContain('415-555-1212');
});
