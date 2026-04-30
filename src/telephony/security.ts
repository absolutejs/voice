import {
	createMemoryVoiceTelephonyWebhookIdempotencyStore,
	verifyVoiceTwilioWebhookSignature,
	type VoiceTelephonyWebhookIdempotencyStore,
	type VoiceTelephonyWebhookProvider,
	type VoiceTelephonyWebhookVerificationResult
} from '../telephonyOutcome';
import { Elysia } from 'elysia';
import {
	createVoicePostgresTelephonyWebhookIdempotencyStore,
	type VoicePostgresClient
} from '../postgresStore';
import { createVoiceSQLiteTelephonyWebhookIdempotencyStore } from '../sqliteStore';
import {
	createVoiceRedisTelephonyWebhookIdempotencyStore,
	type VoiceRedisTelephonyWebhookIdempotencyClient
} from '../queue';
import {
	createMemoryVoicePlivoWebhookNonceStore,
	createVoicePlivoWebhookVerifier,
	createVoicePostgresPlivoWebhookNonceStore,
	createVoiceRedisPlivoWebhookNonceStore,
	createVoiceSQLitePlivoWebhookNonceStore,
	type VoicePlivoWebhookNonceStore,
	type VoiceRedisPlivoWebhookNonceClient
} from './plivo';
import {
	createMemoryVoiceTelnyxWebhookEventStore,
	createVoicePostgresTelnyxWebhookEventStore,
	createVoiceRedisTelnyxWebhookEventStore,
	createVoiceSQLiteTelnyxWebhookEventStore,
	createVoiceTelnyxWebhookVerifier,
	type VoiceRedisTelnyxWebhookEventClient,
	type VoiceTelnyxWebhookEventStore
} from './telnyx';

export type VoiceTelephonyWebhookSecurityStorePreset =
	| {
			kind?: 'memory';
	  }
	| {
			kind: 'sqlite';
			path: string;
			tablePrefix?: string;
	  }
	| {
			connectionString?: string;
			kind: 'postgres';
			schemaName?: string;
			sql?: VoicePostgresClient;
			tablePrefix?: string;
	  }
	| {
			idempotencyClient?: VoiceRedisTelephonyWebhookIdempotencyClient;
			keyPrefix?: string;
			kind: 'redis';
			plivoClient?: VoiceRedisPlivoWebhookNonceClient;
			telnyxClient?: VoiceRedisTelnyxWebhookEventClient;
			url?: string;
	  };

export type VoiceTelephonyWebhookSecurityOptions<TResult = unknown> = {
	plivo?: {
		authToken?: string;
		nonceStore?: VoicePlivoWebhookNonceStore;
		verificationUrl?:
			| string
			| ((input: { query: Record<string, unknown>; request: Request }) => string);
	};
	store?: VoiceTelephonyWebhookSecurityStorePreset;
	telnyx?: {
		eventStore?: VoiceTelnyxWebhookEventStore;
		publicKey?: string;
		toleranceSeconds?: number;
	};
	ttlSeconds?: number;
	twilio?: {
		authToken?: string;
		idempotencyStore?: VoiceTelephonyWebhookIdempotencyStore<TResult>;
		verificationUrl?:
			| string
			| ((input: { query: Record<string, unknown>; request: Request }) => string);
	};
};

export type VoiceTelephonyWebhookSecurityPreset<TResult = unknown> = {
	plivo: {
		authToken?: string;
		nonceStore: VoicePlivoWebhookNonceStore;
		verify: (input: {
			body: unknown;
			headers: Headers;
			query: Record<string, unknown>;
			request: Request;
		}) => Promise<VoiceTelephonyWebhookVerificationResult>;
	};
	telnyx: {
		eventStore: VoiceTelnyxWebhookEventStore;
		publicKey?: string;
		toleranceSeconds?: number;
		verify: (input: {
			headers: Headers;
			rawBody: string;
		}) => Promise<VoiceTelephonyWebhookVerificationResult>;
	};
	twilio: {
		idempotency: {
			enabled: true;
			store: VoiceTelephonyWebhookIdempotencyStore<TResult>;
		};
		requireVerification: true;
		signingSecret?: string;
		verificationUrl?:
			| string
			| ((input: { query: Record<string, unknown>; request: Request }) => string);
		verify: (input: {
			body: unknown;
			headers: Headers;
			query: Record<string, unknown>;
			request: Request;
		}) => Promise<VoiceTelephonyWebhookVerificationResult>;
	};
	verify: {
		plivo: VoiceTelephonyWebhookSecurityPreset<TResult>['plivo']['verify'];
		telnyx: VoiceTelephonyWebhookSecurityPreset<TResult>['telnyx']['verify'];
		twilio: VoiceTelephonyWebhookSecurityPreset<TResult>['twilio']['verify'];
	};
};

export type VoiceTelephonyWebhookSecurityProviderStatus = {
	checks: {
		idempotency?: boolean;
		persistentStore: boolean;
		replayProtection: boolean;
		verification: boolean;
	};
	enabled: boolean;
	issues: string[];
	provider: VoiceTelephonyWebhookProvider;
	status: 'fail' | 'pass' | 'warn';
	store: VoiceTelephonyWebhookSecurityStorePreset['kind'] | 'memory';
};

export type VoiceTelephonyWebhookSecurityReport = {
	generatedAt: number;
	ok: boolean;
	providers: VoiceTelephonyWebhookSecurityProviderStatus[];
	status: 'fail' | 'pass' | 'warn';
	summary: {
		enabled: number;
		failed: number;
		passed: number;
		warned: number;
	};
};

export type VoiceTelephonyWebhookSecurityAssertionInput = {
	maxFailedProviders?: number;
	minEnabledProviders?: number;
	requirePersistentStores?: boolean;
	requiredProviders?: VoiceTelephonyWebhookProvider[];
};

export type VoiceTelephonyWebhookSecurityAssertionReport = {
	failedProviders: VoiceTelephonyWebhookProvider[];
	issues: string[];
	ok: boolean;
	passingProviders: VoiceTelephonyWebhookProvider[];
	status: VoiceTelephonyWebhookSecurityReport['status'];
};

export type VoiceTelephonyWebhookSecurityRoutesOptions<TResult = unknown> = {
	name?: string;
	options: VoiceTelephonyWebhookSecurityOptions<TResult>;
	path?: string;
};

const resolveVerificationUrl = (
	option: NonNullable<
		VoiceTelephonyWebhookSecurityOptions['twilio']
	>['verificationUrl'],
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => (typeof option === 'function' ? option(input) : option ?? input.request.url);

const createStores = <TResult>(
	options: VoiceTelephonyWebhookSecurityOptions<TResult>
) => {
	const ttlSeconds = options.ttlSeconds;
	const store = options.store ?? { kind: 'memory' as const };

	if (store.kind === 'sqlite') {
		return {
			idempotency:
				options.twilio?.idempotencyStore ??
				createVoiceSQLiteTelephonyWebhookIdempotencyStore<TResult>({
					path: store.path,
					tableName: 'voice_twilio_webhook_idempotency',
					tablePrefix: store.tablePrefix
				}),
			plivo:
				options.plivo?.nonceStore ??
				createVoiceSQLitePlivoWebhookNonceStore({
					path: store.path,
					tableName: 'voice_plivo_webhook_nonces',
					tablePrefix: store.tablePrefix,
					ttlSeconds
				}),
			telnyx:
				options.telnyx?.eventStore ??
				createVoiceSQLiteTelnyxWebhookEventStore({
					path: store.path,
					tableName: 'voice_telnyx_webhook_events',
					tablePrefix: store.tablePrefix,
					ttlSeconds
				})
		};
	}

	if (store.kind === 'postgres') {
		return {
			idempotency:
				options.twilio?.idempotencyStore ??
				createVoicePostgresTelephonyWebhookIdempotencyStore<TResult>({
					connectionString: store.connectionString,
					schemaName: store.schemaName,
					sql: store.sql,
					tableName: 'voice_twilio_webhook_idempotency',
					tablePrefix: store.tablePrefix
				}),
			plivo:
				options.plivo?.nonceStore ??
				createVoicePostgresPlivoWebhookNonceStore({
					connectionString: store.connectionString,
					schemaName: store.schemaName,
					sql: store.sql,
					tableName: 'voice_plivo_webhook_nonces',
					tablePrefix: store.tablePrefix,
					ttlSeconds
				}),
			telnyx:
				options.telnyx?.eventStore ??
				createVoicePostgresTelnyxWebhookEventStore({
					connectionString: store.connectionString,
					schemaName: store.schemaName,
					sql: store.sql,
					tableName: 'voice_telnyx_webhook_events',
					tablePrefix: store.tablePrefix,
					ttlSeconds
				})
		};
	}

	if (store.kind === 'redis') {
		const keyPrefix = store.keyPrefix?.trim() || 'voice:webhook-security';
		return {
			idempotency:
				options.twilio?.idempotencyStore ??
				createVoiceRedisTelephonyWebhookIdempotencyStore<TResult>({
					client: store.idempotencyClient,
					keyPrefix: `${keyPrefix}:twilio:idempotency`,
					ttlSeconds,
					url: store.url
				}),
			plivo:
				options.plivo?.nonceStore ??
				createVoiceRedisPlivoWebhookNonceStore({
					client: store.plivoClient,
					keyPrefix: `${keyPrefix}:plivo:nonce`,
					ttlSeconds,
					url: store.url
				}),
			telnyx:
				options.telnyx?.eventStore ??
				createVoiceRedisTelnyxWebhookEventStore({
					client: store.telnyxClient,
					keyPrefix: `${keyPrefix}:telnyx:event`,
					ttlSeconds,
					url: store.url
				})
		};
	}

	return {
		idempotency:
			options.twilio?.idempotencyStore ??
			createMemoryVoiceTelephonyWebhookIdempotencyStore<TResult>(),
		plivo: options.plivo?.nonceStore ?? createMemoryVoicePlivoWebhookNonceStore(),
		telnyx:
			options.telnyx?.eventStore ?? createMemoryVoiceTelnyxWebhookEventStore()
	};
};

const resolveStoreKind = (
	store: VoiceTelephonyWebhookSecurityOptions['store']
): VoiceTelephonyWebhookSecurityProviderStatus['store'] =>
	store?.kind ?? 'memory';

const isPersistentStore = (
	store: VoiceTelephonyWebhookSecurityOptions['store']
) => {
	const kind = resolveStoreKind(store);
	return kind === 'postgres' || kind === 'redis' || kind === 'sqlite';
};

const providerStatus = (
	input: Omit<VoiceTelephonyWebhookSecurityProviderStatus, 'issues' | 'status'>
): VoiceTelephonyWebhookSecurityProviderStatus => {
	const issues: string[] = [];
	if (input.enabled && !input.checks.verification) {
		issues.push('Webhook verification is not configured.');
	}
	if (input.enabled && !input.checks.replayProtection) {
		issues.push('Replay protection is not configured.');
	}
	if (input.enabled && input.checks.idempotency === false) {
		issues.push('Webhook idempotency is not configured.');
	}
	if (input.enabled && !input.checks.persistentStore) {
		issues.push('Webhook security store is in-memory; use SQLite, Postgres, or Redis for production.');
	}

	return {
		...input,
		issues,
		status: !input.enabled ? 'warn' : issues.length === 0 ? 'pass' : 'fail'
	};
};

export const buildVoiceTelephonyWebhookSecurityReport = <TResult = unknown>(
	options: VoiceTelephonyWebhookSecurityOptions<TResult> = {}
): VoiceTelephonyWebhookSecurityReport => {
	const store = resolveStoreKind(options.store);
	const persistentStore = isPersistentStore(options.store);
	const providers = [
		providerStatus({
			checks: {
				idempotency: Boolean(options.twilio),
				persistentStore,
				replayProtection: Boolean(options.twilio),
				verification: Boolean(options.twilio?.authToken)
			},
			enabled: Boolean(options.twilio),
			provider: 'twilio',
			store
		}),
		providerStatus({
			checks: {
				persistentStore,
				replayProtection: Boolean(options.telnyx),
				verification: Boolean(options.telnyx?.publicKey)
			},
			enabled: Boolean(options.telnyx),
			provider: 'telnyx',
			store
		}),
		providerStatus({
			checks: {
				persistentStore,
				replayProtection: Boolean(options.plivo),
				verification: Boolean(options.plivo?.authToken)
			},
			enabled: Boolean(options.plivo),
			provider: 'plivo',
			store
		})
	];
	const enabled = providers.filter((provider) => provider.enabled);
	const failed = enabled.filter((provider) => provider.status === 'fail').length;
	const warned = enabled.filter((provider) => provider.status === 'warn').length;
	const passed = enabled.filter((provider) => provider.status === 'pass').length;
	const status = failed > 0 ? 'fail' : warned > 0 || enabled.length === 0 ? 'warn' : 'pass';

	return {
		generatedAt: Date.now(),
		ok: status === 'pass',
		providers,
		status,
		summary: {
			enabled: enabled.length,
			failed,
			passed,
			warned
		}
	};
};

export const evaluateVoiceTelephonyWebhookSecurityEvidence = (
	report: VoiceTelephonyWebhookSecurityReport,
	input: VoiceTelephonyWebhookSecurityAssertionInput = {}
): VoiceTelephonyWebhookSecurityAssertionReport => {
	const issues = [...report.providers.flatMap((provider) => provider.issues)];
	const enabledProviders = report.providers
		.filter((provider) => provider.enabled)
		.map((provider) => provider.provider);
	const passingProviders = report.providers
		.filter((provider) => provider.enabled && provider.status === 'pass')
		.map((provider) => provider.provider);
	const failedProviders = report.providers
		.filter((provider) => provider.enabled && provider.status === 'fail')
		.map((provider) => provider.provider);
	const maxFailedProviders = input.maxFailedProviders ?? 0;
	const minEnabledProviders = input.minEnabledProviders ?? 1;
	const requirePersistentStores = input.requirePersistentStores ?? true;

	if (enabledProviders.length < minEnabledProviders) {
		issues.push(
			`Expected at least ${String(minEnabledProviders)} enabled telephony webhook provider(s), found ${String(enabledProviders.length)}.`
		);
	}
	if (failedProviders.length > maxFailedProviders) {
		issues.push(
			`Expected at most ${String(maxFailedProviders)} failing telephony webhook provider(s), found ${String(failedProviders.length)}.`
		);
	}
	for (const provider of input.requiredProviders ?? []) {
		if (!enabledProviders.includes(provider)) {
			issues.push(`Missing enabled telephony webhook provider: ${provider}.`);
		}
		if (!passingProviders.includes(provider)) {
			issues.push(`Telephony webhook provider is not passing: ${provider}.`);
		}
	}
	if (requirePersistentStores) {
		for (const provider of report.providers) {
			if (provider.enabled && !provider.checks.persistentStore) {
				issues.push(`Telephony webhook provider ${provider.provider} is not using a persistent security store.`);
			}
		}
	}

	return {
		failedProviders,
		issues,
		ok: issues.length === 0,
		passingProviders,
		status: report.status
	};
};

export const assertVoiceTelephonyWebhookSecurityEvidence = (
	report: VoiceTelephonyWebhookSecurityReport,
	input: VoiceTelephonyWebhookSecurityAssertionInput = {}
): VoiceTelephonyWebhookSecurityAssertionReport => {
	const assertion = evaluateVoiceTelephonyWebhookSecurityEvidence(report, input);
	if (!assertion.ok) {
		throw new Error(
			`Voice telephony webhook security assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
};

export const createVoiceTelephonyWebhookSecurityRoutes = <TResult = unknown>(
	options: VoiceTelephonyWebhookSecurityRoutesOptions<TResult>
) => {
	const path = options.path ?? '/api/voice/telephony/webhook-security';
	return new Elysia({
		name: options.name ?? 'absolutejs-voice-telephony-webhook-security'
	}).get(path, () => buildVoiceTelephonyWebhookSecurityReport(options.options));
};

export const createVoiceTelephonyWebhookSecurityPreset = <
	TResult = unknown
>(
	options: VoiceTelephonyWebhookSecurityOptions<TResult> = {}
): VoiceTelephonyWebhookSecurityPreset<TResult> => {
	const stores = createStores(options);
	const twilioVerificationUrl = options.twilio?.verificationUrl;
	const plivoVerify = createVoicePlivoWebhookVerifier({
		authToken: options.plivo?.authToken,
		nonceStore: stores.plivo,
		verificationUrl: options.plivo?.verificationUrl
	});
	const telnyxVerify = createVoiceTelnyxWebhookVerifier({
		eventStore: stores.telnyx,
		publicKey: options.telnyx?.publicKey,
		toleranceSeconds: options.telnyx?.toleranceSeconds
	});
	const twilioVerify = async (input: {
		body: unknown;
		headers: Headers;
		query: Record<string, unknown>;
		request: Request;
	}) =>
		verifyVoiceTwilioWebhookSignature({
			authToken: options.twilio?.authToken,
			body: input.body,
			headers: input.headers,
			url: resolveVerificationUrl(twilioVerificationUrl, {
				query: input.query,
				request: input.request
			})
		});

	return {
		plivo: {
			authToken: options.plivo?.authToken,
			nonceStore: stores.plivo,
			verify: plivoVerify
		},
		telnyx: {
			eventStore: stores.telnyx,
			publicKey: options.telnyx?.publicKey,
			toleranceSeconds: options.telnyx?.toleranceSeconds,
			verify: telnyxVerify
		},
		twilio: {
			idempotency: {
				enabled: true,
				store: stores.idempotency
			},
			requireVerification: true,
			signingSecret: options.twilio?.authToken,
			verificationUrl: twilioVerificationUrl,
			verify: twilioVerify
		},
		verify: {
			plivo: plivoVerify,
			telnyx: telnyxVerify,
			twilio: twilioVerify
		}
	};
};
