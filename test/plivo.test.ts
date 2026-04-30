import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	createMemoryVoicePlivoWebhookNonceStore,
	createPlivoVoiceResponse,
	createPlivoVoiceRoutes,
	createVoicePostgresPlivoWebhookNonceStore,
	createVoicePlivoWebhookVerifier,
	createVoiceRedisPlivoWebhookNonceStore,
	createVoiceSQLitePlivoWebhookNonceStore,
	signVoicePlivoWebhook,
	verifyVoicePlivoWebhookSignature,
	type VoiceRedisPlivoWebhookNonceClient
} from '../src/telephony/plivo';
import type { VoicePostgresClient } from '../src';

const createTempSQLitePath = () =>
	join(tmpdir(), `absolutejs-voice-plivo-nonces-${crypto.randomUUID()}.sqlite`);

const createFakeRedisClient = (): VoiceRedisPlivoWebhookNonceClient => {
	const values = new Map<string, { expiresAt: number; value: string }>();
	const getRecord = (key: string) => {
		const record = values.get(key);
		if (!record) {
			return undefined;
		}
		if (record.expiresAt <= Date.now()) {
			values.delete(key);
			return undefined;
		}
		return record;
	};

	return {
		exists: async (key) => (getRecord(String(key)) ? 1 : 0),
		set: async (key, value, ...options) => {
			const normalizedKey = String(key);
			if (options.includes('NX') && getRecord(normalizedKey)) {
				return null;
			}
			const exIndex = options.findIndex((option) => option === 'EX');
			const expiresAt =
				exIndex >= 0 ? Date.now() + Number(options[exIndex + 1]) * 1000 : Infinity;
			values.set(normalizedKey, {
				expiresAt,
				value: String(value)
			});
			return 'OK';
		}
	};
};

const createFakePostgresClient = (): VoicePostgresClient => {
	const tables = new Map<
		string,
		Map<string, { createdAt: number; expiresAt: number | null; nonce: string }>
	>();
	const parseTableName = (query: string, keyword: 'FROM' | 'INTO' | 'TABLE') => {
		const keywordPattern =
			keyword === 'TABLE' ? 'TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?' : keyword;
		const match = query.match(
			new RegExp(`${keywordPattern}\\s+("[^"]+"\\."[^"]+"|"[^"]+")`, 'i')
		);
		if (!match?.[1]) {
			throw new Error(`Could not parse table name from query: ${query}`);
		}
		return match[1];
	};
	const getTable = (query: string, keyword: 'FROM' | 'INTO' | 'TABLE') => {
		const tableName = parseTableName(query, keyword);
		let table = tables.get(tableName);
		if (!table) {
			table = new Map();
			tables.set(tableName, table);
		}
		return table;
	};

	return {
		unsafe: async (query, parameters = []) => {
			const normalized = query.replace(/\s+/g, ' ').trim().toUpperCase();
			if (
				normalized.startsWith('CREATE SCHEMA IF NOT EXISTS') ||
				normalized.startsWith('CREATE TABLE IF NOT EXISTS')
			) {
				if (normalized.startsWith('CREATE TABLE IF NOT EXISTS')) {
					getTable(query, 'TABLE');
				}
				return [];
			}
			if (normalized.startsWith('DELETE FROM')) {
				const table = getTable(query, 'FROM');
				const now = Number(parameters[0]);
				for (const [nonce, row] of table) {
					if (row.expiresAt !== null && row.expiresAt <= now) {
						table.delete(nonce);
					}
				}
				return [];
			}
			if (normalized.startsWith('SELECT NONCE FROM')) {
				const table = getTable(query, 'FROM');
				const nonce = String(parameters[0]);
				const now = Number(parameters[1]);
				const row = table.get(nonce);
				return row && (row.expiresAt === null || row.expiresAt > now)
					? [{ nonce }]
					: [];
			}
			if (normalized.startsWith('INSERT INTO')) {
				const table = getTable(query, 'INTO');
				const nonce = String(parameters[0]);
				const row = {
					createdAt: Number(parameters[1]),
					expiresAt:
						typeof parameters[2] === 'number' ? Number(parameters[2]) : null,
					nonce
				};
				if (normalized.includes('DO NOTHING')) {
					if (table.has(nonce)) {
						return [];
					}
					table.set(nonce, row);
					return [{ nonce }];
				}
				table.set(nonce, row);
				return [];
			}
			throw new Error(`Unsupported fake postgres query: ${query}`);
		}
	};
};

test('createPlivoVoiceResponse emits Plivo Stream XML', () => {
	const xml = createPlivoVoiceResponse({
		audioTrack: 'inbound',
		bidirectional: true,
		contentType: 'audio/x-mulaw;rate=8000',
		keepCallAlive: true,
		streamUrl: 'wss://voice.example.test/plivo/stream'
	});

	expect(xml).toContain('<Response>');
	expect(xml).toContain('<Stream');
	expect(xml).toContain('bidirectional="true"');
	expect(xml).toContain('keepCallAlive="true"');
	expect(xml).toContain('audio/x-mulaw;rate=8000');
	expect(xml).toContain('wss://voice.example.test/plivo/stream');
});

test('Plivo webhook signature helpers support V3 signatures', async () => {
	const body = {
		CallUUID: 'call-1',
		From: '+15555550100',
		To: '+15555550101'
	};
	const nonce = 'nonce-1';
	const signature = await signVoicePlivoWebhook({
		authToken: 'secret',
		body,
		nonce,
		url: 'https://voice.example.test/voice/plivo/webhook'
	});
	const headers = new Headers({
		'x-plivo-signature-v3': signature,
		'x-plivo-signature-v3-nonce': nonce
	});

	await expect(
		verifyVoicePlivoWebhookSignature({
			authToken: 'secret',
			body,
			headers,
			url: 'https://voice.example.test/voice/plivo/webhook'
		})
	).resolves.toEqual({ ok: true });
	await expect(
		verifyVoicePlivoWebhookSignature({
			authToken: 'wrong',
			body,
			headers,
			url: 'https://voice.example.test/voice/plivo/webhook'
		})
	).resolves.toEqual({
		ok: false,
		reason: 'invalid-signature'
	});
});

test('Plivo webhook verifier rejects replayed nonces before side effects', async () => {
	const body = {
		CallUUID: 'call-replay',
		From: '+15555550100',
		To: '+15555550101'
	};
	const nonce = 'nonce-replay';
	const url = 'https://voice.example.test/voice/plivo/webhook';
	const signature = await signVoicePlivoWebhook({
		authToken: 'secret',
		body,
		nonce,
		url
	});
	const createRequest = () =>
		new Request(url, {
			body: new URLSearchParams(body),
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'x-plivo-signature-v3': signature,
				'x-plivo-signature-v3-nonce': nonce
			},
			method: 'POST'
		});
	const verifier = createVoicePlivoWebhookVerifier({
		authToken: 'secret',
		nonceStore: createMemoryVoicePlivoWebhookNonceStore(),
		verificationUrl: url
	});

	await expect(
		verifier({
			body,
			headers: createRequest().headers,
			query: {},
			request: createRequest()
		})
	).resolves.toEqual({ ok: true });
	await expect(
		verifier({
			body,
			headers: createRequest().headers,
			query: {},
			request: createRequest()
		})
	).resolves.toEqual({
		ok: false,
		reason: 'invalid-signature'
	});
});

test('SQLite Plivo webhook nonce store persists replay claims across instances', async () => {
	const path = createTempSQLitePath();
	const firstStore = createVoiceSQLitePlivoWebhookNonceStore({
		path,
		ttlSeconds: 60
	});
	const secondStore = createVoiceSQLitePlivoWebhookNonceStore({
		path,
		ttlSeconds: 60
	});

	expect(await firstStore.claim?.('sqlite-nonce')).toBe(true);
	expect(await secondStore.has('sqlite-nonce')).toBe(true);
	expect(await secondStore.claim?.('sqlite-nonce')).toBe(false);
});

test('Postgres Plivo webhook nonce store atomically claims nonces', async () => {
	const sql = createFakePostgresClient();
	const firstStore = createVoicePostgresPlivoWebhookNonceStore({
		sql,
		ttlSeconds: 60
	});
	const secondStore = createVoicePostgresPlivoWebhookNonceStore({
		sql,
		ttlSeconds: 60
	});

	expect(await firstStore.claim?.('postgres-nonce')).toBe(true);
	await expect(secondStore.has('postgres-nonce')).resolves.toBe(true);
	expect(await secondStore.claim?.('postgres-nonce')).toBe(false);
});

test('Redis Plivo webhook nonce store uses SET NX for replay claims', async () => {
	const client = createFakeRedisClient();
	const firstStore = createVoiceRedisPlivoWebhookNonceStore({
		client,
		keyPrefix: 'test:plivo',
		ttlSeconds: 60
	});
	const secondStore = createVoiceRedisPlivoWebhookNonceStore({
		client,
		keyPrefix: 'test:plivo',
		ttlSeconds: 60
	});

	expect(await firstStore.claim?.('redis-nonce')).toBe(true);
	await expect(secondStore.has('redis-nonce')).resolves.toBe(true);
	expect(await secondStore.claim?.('redis-nonce')).toBe(false);
});

test('createPlivoVoiceRoutes exposes answer XML and webhook outcome routes', async () => {
	const decisions: Array<{ action: string; provider?: string }> = [];
	const routes = createPlivoVoiceRoutes({
		answer: {
			path: '/voice/plivo',
			response: {
				bidirectional: true,
				contentType: 'audio/x-mulaw;rate=8000',
				keepCallAlive: true
			},
			streamUrl: 'wss://voice.example.test/voice/plivo/stream'
		},
		webhook: {
			onDecision: ({ decision, event }) => {
				decisions.push({
					action: decision.action,
					provider: event.provider
				});
			},
			path: '/voice/plivo/webhook',
			policy: {
				statusMap: {
					hangup: {
						action: 'no-answer',
						disposition: 'no-answer',
						source: 'status'
					}
				}
			}
		}
	});

	const answer = await routes.handle(
		new Request('https://voice.example.test/voice/plivo')
	);
	const xml = await answer.text();
	expect(answer.headers.get('content-type')).toContain('text/xml');
	expect(xml).toContain('wss://voice.example.test/voice/plivo/stream');

	const webhook = await routes.handle(
		new Request('https://voice.example.test/voice/plivo/webhook', {
			body: new URLSearchParams({
				CallUUID: 'call-1',
				Event: 'Hangup',
				HangupCause: 'busy',
				SessionId: 'session-1',
				SipResponseCode: '486'
			}),
			headers: {
				'content-type': 'application/x-www-form-urlencoded'
			},
			method: 'POST'
		})
	);
	const body = await webhook.json();

	expect(body).toMatchObject({
		decision: {
			action: 'no-answer',
			disposition: 'no-answer'
		},
		event: {
			provider: 'plivo'
		},
		sessionId: 'session-1'
	});
	expect(decisions).toEqual([
		{
			action: 'no-answer',
			provider: 'plivo'
		}
	]);
});

test('createPlivoVoiceRoutes exposes setup and smoke reports that satisfy the shared contract', async () => {
	const routes = createPlivoVoiceRoutes({
		answer: {
			path: '/voice/plivo',
			streamUrl: 'wss://voice.example.test/voice/plivo/stream'
		},
		setup: {
			path: '/voice/plivo/setup',
			requiredEnv: {
				PLIVO_AUTH_TOKEN: 'present'
			}
		},
		smoke: {
			path: '/voice/plivo/smoke',
			title: 'Demo Plivo smoke'
		},
		webhook: {
			path: '/voice/plivo/webhook',
			verify: () => ({ ok: true })
		}
	});

	const setupResponse = await routes.handle(
		new Request('https://voice.example.test/voice/plivo/setup')
	);
	const setup = await setupResponse.json();
	expect(setup).toMatchObject({
		provider: 'plivo',
		ready: true,
		signing: {
			configured: true,
			mode: 'custom'
		},
		urls: {
			answer: 'https://voice.example.test/voice/plivo',
			stream: 'wss://voice.example.test/voice/plivo/stream',
			webhook: 'https://voice.example.test/voice/plivo/webhook'
		}
	});

	const smokeResponse = await routes.handle(
		new Request('https://voice.example.test/voice/plivo/smoke')
	);
	const smoke = await smokeResponse.json();
	expect(smoke).toMatchObject({
		answer: {
			status: 200,
			streamUrl: 'wss://voice.example.test/voice/plivo/stream'
		},
		contract: {
			pass: true,
			provider: 'plivo'
		},
		pass: true,
		provider: 'plivo',
		webhook: {
			status: 200
		}
	});

	const html = await routes.handle(
		new Request('https://voice.example.test/voice/plivo/smoke?format=html')
	);
	const text = await html.text();
	expect(html.headers.get('content-type')).toContain('text/html');
	expect(text).toContain('Demo Plivo smoke');
	expect(text).toContain('Pass');
});
