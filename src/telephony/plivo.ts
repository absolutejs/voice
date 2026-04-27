import { Buffer } from 'node:buffer';
import { Elysia } from 'elysia';
import {
	evaluateVoiceTelephonyContract,
	type VoiceTelephonyContractReport,
	type VoiceTelephonySetupStatus,
	type VoiceTelephonySmokeCheck,
	type VoiceTelephonySmokeReport
} from './contract';
import {
	createVoiceTelephonyOutcomePolicy,
	createVoiceTelephonyWebhookRoutes,
	type VoiceTelephonyOutcomePolicy,
	type VoiceTelephonyWebhookRoutesOptions,
	type VoiceTelephonyWebhookVerificationResult
} from '../telephonyOutcome';
import type { VoiceSessionRecord } from '../types';

export type PlivoVoiceResponseOptions = {
	audioTrack?: 'both' | 'inbound' | 'outbound';
	bidirectional?: boolean;
	contentType?:
		| 'audio/x-l16;rate=8000'
		| 'audio/x-l16;rate=16000'
		| 'audio/x-mulaw;rate=8000';
	extraHeaders?: Record<string, string | number | boolean | undefined> | string;
	keepCallAlive?: boolean;
	noiseCancellation?: boolean;
	noiseCancellationLevel?: number;
	statusCallbackMethod?: 'GET' | 'POST';
	statusCallbackUrl?: string;
	streamTimeout?: number;
	streamUrl: string;
};

export type PlivoVoiceSetupStatus = VoiceTelephonySetupStatus<'plivo'> & {
	urls: VoiceTelephonySetupStatus<'plivo'>['urls'] & {
		answer: string;
	};
};

export type PlivoVoiceSetupOptions = {
	path?: false | string;
	requiredEnv?: Record<string, string | undefined>;
	title?: string;
};

export type PlivoVoiceSmokeCheck = VoiceTelephonySmokeCheck;

export type PlivoVoiceSmokeReport = VoiceTelephonySmokeReport<'plivo'> & {
	answer?: {
		status: number;
		streamUrl?: string;
	};
	contract: VoiceTelephonyContractReport<'plivo'>;
	setup: PlivoVoiceSetupStatus;
};

export type PlivoVoiceSmokeOptions = {
	callUuid?: string;
	eventType?: string;
	path?: false | string;
	sessionId?: string;
	sipCode?: number;
	status?: string;
	title?: string;
};

export type PlivoVoiceRoutesOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	answer?: {
		path?: string;
		response?: Omit<PlivoVoiceResponseOptions, 'streamUrl'>;
		streamUrl?:
			| string
			| ((input: {
					query: Record<string, unknown>;
					request: Request;
					streamPath: string;
			  }) => Promise<string> | string);
	};
	context?: TContext;
	name?: string;
	outcomePolicy?: VoiceTelephonyOutcomePolicy;
	setup?: PlivoVoiceSetupOptions;
	smoke?: PlivoVoiceSmokeOptions;
	streamPath?: string;
	webhook?: Omit<
		VoiceTelephonyWebhookRoutesOptions<TContext, TSession, TResult>,
		'context' | 'path' | 'policy' | 'provider'
	> & {
		authToken?: string;
		path?: string;
		policy?: VoiceTelephonyOutcomePolicy;
		verificationUrl?:
			| string
			| ((input: { query: Record<string, unknown>; request: Request }) => string);
	};
};

const escapeXml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');

const joinUrlPath = (origin: string, path: string) =>
	`${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

const resolveRequestOrigin = (request: Request) => {
	const url = new URL(request.url);
	const forwardedHost = request.headers.get('x-forwarded-host');
	const forwardedProto = request.headers.get('x-forwarded-proto');
	const host = forwardedHost ?? request.headers.get('host') ?? url.host;
	const protocol = forwardedProto ?? url.protocol.replace(':', '');

	return `${protocol}://${host}`;
};

const boolAttr = (value: boolean | undefined) =>
	typeof value === 'boolean' ? String(value) : undefined;

const extraHeadersAttr = (
	headers: PlivoVoiceResponseOptions['extraHeaders']
) => {
	if (!headers || typeof headers === 'string') {
		return headers;
	}

	return Object.entries(headers)
		.filter((entry): entry is [string, string | number | boolean] =>
			entry[1] !== undefined
		)
		.map(([key, value]) => `${key}=${String(value)}`)
		.join(',');
};

const extractPlivoStreamUrl = (xml: string) =>
	xml.match(/<Stream\b[^>]*>([^<]+)<\/Stream>/i)?.[1]?.trim();

const createSmokeCheck = (
	name: string,
	status: PlivoVoiceSmokeCheck['status'],
	message?: string,
	details?: Record<string, unknown>
): PlivoVoiceSmokeCheck => ({
	details,
	message,
	name,
	status
});

const resolvePlivoStreamUrl = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	options: PlivoVoiceRoutesOptions<TContext, TSession, TResult>,
	input: {
		query: Record<string, unknown>;
		request: Request;
		streamPath: string;
	}
) => {
	if (typeof options.answer?.streamUrl === 'function') {
		return options.answer.streamUrl(input);
	}

	if (typeof options.answer?.streamUrl === 'string') {
		return options.answer.streamUrl;
	}

	const origin = resolveRequestOrigin(input.request);
	const wsOrigin = origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
	return `${wsOrigin}${input.streamPath}`;
};

export const createPlivoVoiceResponse = (
	options: PlivoVoiceResponseOptions
) => {
	const attributes = [
		options.bidirectional !== undefined
			? `bidirectional="${escapeXml(String(options.bidirectional))}"`
			: undefined,
		options.audioTrack ? `audioTrack="${escapeXml(options.audioTrack)}"` : undefined,
		options.streamTimeout
			? `streamTimeout="${escapeXml(String(options.streamTimeout))}"`
			: undefined,
		options.contentType
			? `contentType="${escapeXml(options.contentType)}"`
			: undefined,
		options.keepCallAlive !== undefined
			? `keepCallAlive="${escapeXml(String(options.keepCallAlive))}"`
			: undefined,
		extraHeadersAttr(options.extraHeaders)
			? `extraHeaders="${escapeXml(extraHeadersAttr(options.extraHeaders)!)}"`
			: undefined,
		options.statusCallbackUrl
			? `statusCallbackUrl="${escapeXml(options.statusCallbackUrl)}"`
			: undefined,
		options.statusCallbackMethod
			? `statusCallbackMethod="${escapeXml(options.statusCallbackMethod)}"`
			: undefined,
		boolAttr(options.noiseCancellation)
			? `noiseCancellation="${escapeXml(boolAttr(options.noiseCancellation)!)}"`
			: undefined,
		options.noiseCancellationLevel
			? `noiseCancellationLevel="${escapeXml(String(options.noiseCancellationLevel))}"`
			: undefined
	]
		.filter((value): value is string => Boolean(value))
		.join(' ');

	const openTag = attributes ? `<Stream ${attributes}>` : '<Stream>';
	return `<?xml version="1.0" encoding="UTF-8"?><Response>${openTag}${escapeXml(options.streamUrl)}</Stream></Response>`;
};

const toBase64 = (bytes: ArrayBuffer) =>
	Buffer.from(new Uint8Array(bytes)).toString('base64');

const timingSafeEqual = (left: string, right: string) => {
	const encoder = new TextEncoder();
	const leftBytes = encoder.encode(left);
	const rightBytes = encoder.encode(right);
	if (leftBytes.length !== rightBytes.length) {
		return false;
	}

	let diff = 0;
	for (let index = 0; index < leftBytes.length; index += 1) {
		diff |= leftBytes[index]! ^ rightBytes[index]!;
	}

	return diff === 0;
};

const signHmacSHA256Base64 = async (secret: string, payload: string) => {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{
			hash: 'SHA-256',
			name: 'HMAC'
		},
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

	return toBase64(signature);
};

const sortedParamsForSignature = (body: unknown) => {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return '';
	}

	return Object.entries(body as Record<string, unknown>)
		.filter(([, value]) => value !== undefined && value !== null)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => `${key}${String(value)}`)
		.join('');
};

export const signVoicePlivoWebhook = async (input: {
	authToken: string;
	body?: unknown;
	nonce: string;
	url: string;
}) =>
	signHmacSHA256Base64(
		input.authToken,
		`${input.url}${sortedParamsForSignature(input.body)}.${input.nonce}`
	);

const headerList = (value: string | null) =>
	value
		?.split(',')
		.map((signature) => signature.trim())
		.filter(Boolean) ?? [];

export const verifyVoicePlivoWebhookSignature = async (input: {
	authToken?: string;
	body?: unknown;
	headers: Headers;
	url: string;
}): Promise<VoiceTelephonyWebhookVerificationResult> => {
	if (!input.authToken) {
		return { ok: false, reason: 'missing-secret' };
	}

	const nonce = input.headers.get('x-plivo-signature-v3-nonce');
	const signatures = [
		...headerList(input.headers.get('x-plivo-signature-v3')),
		...headerList(input.headers.get('x-plivo-signature-ma-v3'))
	];
	if (!nonce || signatures.length === 0) {
		return { ok: false, reason: 'missing-signature' };
	}

	const expected = await signVoicePlivoWebhook({
		authToken: input.authToken,
		body: input.body,
		nonce,
		url: input.url
	});

	return signatures.some((signature) => timingSafeEqual(signature, expected))
		? { ok: true }
		: { ok: false, reason: 'invalid-signature' };
};

const buildPlivoVoiceSetupStatus = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	options: PlivoVoiceRoutesOptions<TContext, TSession, TResult>,
	input: {
		answerPath: string;
		query: Record<string, unknown>;
		request: Request;
		streamPath: string;
		webhookPath: string;
	}
): Promise<PlivoVoiceSetupStatus> => {
	const origin = resolveRequestOrigin(input.request);
	const stream = await resolvePlivoStreamUrl(options, input);
	const answer = joinUrlPath(origin, input.answerPath);
	const webhook = joinUrlPath(origin, input.webhookPath);
	const missing = Object.entries(options.setup?.requiredEnv ?? {})
		.filter((entry) => !entry[1])
		.map(([name]) => name);
	const signingConfigured = Boolean(
		options.webhook?.authToken || options.webhook?.verify
	);
	const warnings = [
		...(stream.startsWith('wss://')
			? []
			: ['Plivo audio streams should use wss:// in production.']),
		...(signingConfigured
			? []
			: ['Webhook signature verification is not configured.'])
	];

	return {
		generatedAt: Date.now(),
		missing,
		provider: 'plivo',
		ready: missing.length === 0 && signingConfigured && warnings.length === 0,
		signing: {
			configured: signingConfigured,
			mode: options.webhook?.verify
				? 'custom'
				: options.webhook?.authToken
					? 'provider-signature'
					: 'none',
			verificationUrl: webhook
		},
		urls: {
			answer,
			stream,
			twiml: answer,
			webhook
		},
		warnings
	};
};

const renderPlivoSetupHTML = (
	status: PlivoVoiceSetupStatus,
	title: string
) => `<main style="font-family: ui-sans-serif, system-ui; max-width: 860px; margin: 40px auto; padding: 0 20px;">
<p style="letter-spacing: .12em; text-transform: uppercase; color: #52606d;">Plivo setup</p>
<h1>${escapeHtml(title)}</h1>
<p><strong>Status:</strong> ${status.ready ? 'Ready' : 'Needs attention'}</p>
<ul>
<li><strong>Answer XML:</strong> <code>${escapeHtml(status.urls.answer)}</code></li>
<li><strong>Audio stream:</strong> <code>${escapeHtml(status.urls.stream)}</code></li>
<li><strong>Status webhook:</strong> <code>${escapeHtml(status.urls.webhook)}</code></li>
</ul>
${status.missing.length ? `<h2>Missing env</h2><ul>${status.missing.map((name) => `<li><code>${escapeHtml(name)}</code></li>`).join('')}</ul>` : ''}
${status.warnings.length ? `<h2>Warnings</h2><ul>${status.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</main>`;

const renderPlivoSmokeHTML = (
	report: PlivoVoiceSmokeReport,
	title: string
) => `<main style="font-family: ui-sans-serif, system-ui; max-width: 860px; margin: 40px auto; padding: 0 20px;">
<p style="letter-spacing: .12em; text-transform: uppercase; color: #52606d;">Plivo smoke test</p>
<h1>${escapeHtml(title)}</h1>
<p><strong>Status:</strong> ${report.pass ? 'Pass' : 'Fail'}</p>
<ul>${report.checks.map((check) => `<li><strong>${escapeHtml(check.name)}</strong>: ${escapeHtml(check.status)}${check.message ? ` - ${escapeHtml(check.message)}` : ''}</li>`).join('')}</ul>
</main>`;

const runPlivoSmokeTest = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(input: {
	answerPath: string;
	app: {
		handle: (request: Request) => Response | Promise<Response>;
	};
	options: PlivoVoiceRoutesOptions<TContext, TSession, TResult>;
	query: Record<string, unknown>;
	request: Request;
	streamPath: string;
	webhookPath: string;
}): Promise<PlivoVoiceSmokeReport> => {
	const setup = await buildPlivoVoiceSetupStatus(input.options, input);
	const checks: PlivoVoiceSmokeCheck[] = [];
	const answerResponse = await input.app.handle(new Request(setup.urls.answer));
	const answerXml = await answerResponse.text();
	const streamUrl = extractPlivoStreamUrl(answerXml);
	checks.push(
		createSmokeCheck(
			'answer-xml',
			answerResponse.ok && Boolean(streamUrl) ? 'pass' : 'fail',
			streamUrl
				? 'Answer XML includes a Stream URL.'
				: 'Answer XML is missing <Stream>...</Stream>.',
			{
				status: answerResponse.status,
				streamUrl
			}
		)
	);
	checks.push(
		createSmokeCheck(
			'stream-url',
			streamUrl?.startsWith('wss://') ? 'pass' : 'fail',
			streamUrl?.startsWith('wss://')
				? 'Audio stream URL uses wss://.'
				: 'Audio stream URL should use wss:// for Plivo.',
			{
				streamUrl
			}
		)
	);

	const webhookBody = new URLSearchParams({
		CallUUID: input.options.smoke?.callUuid ?? 'plivo-smoke-call',
		Duration: '0',
		Event: input.options.smoke?.eventType ?? 'Hangup',
		From: '+15555550100',
		HangupCause: 'busy',
		SessionId: input.options.smoke?.sessionId ?? 'plivo-smoke-session',
		SipResponseCode: String(input.options.smoke?.sipCode ?? 486),
		To: '+15555550101',
		status: input.options.smoke?.status ?? 'busy'
	});
	const webhookResponse = await input.app.handle(
		new Request(setup.urls.webhook, {
			body: webhookBody,
			headers: {
				'content-type': 'application/x-www-form-urlencoded'
			},
			method: 'POST'
		})
	);
	const webhookText = await webhookResponse.text();
	const webhookPayload = (() => {
		try {
			return JSON.parse(webhookText) as unknown;
		} catch {
			return webhookText;
		}
	})();
	checks.push(
		createSmokeCheck(
			'webhook',
			webhookResponse.ok ? 'pass' : 'fail',
			webhookResponse.ok
				? 'Synthetic Plivo event was accepted.'
				: 'Synthetic Plivo event failed.',
			{
				status: webhookResponse.status
			}
		)
	);
	for (const warning of setup.warnings) {
		checks.push(createSmokeCheck('setup-warning', 'warn', warning));
	}
	for (const name of setup.missing) {
		checks.push(createSmokeCheck('missing-env', 'fail', `${name} is missing.`));
	}

	const baseReport = {
		answer: {
			status: answerResponse.status,
			streamUrl
		},
		checks,
		generatedAt: Date.now(),
		pass: checks.every((check) => check.status !== 'fail'),
		provider: 'plivo' as const,
		setup,
		twiml: {
			status: answerResponse.status,
			streamUrl
		},
		webhook: {
			body: webhookPayload,
			status: webhookResponse.status
		}
	};

	return {
		...baseReport,
		contract: evaluateVoiceTelephonyContract({
			setup,
			smoke: baseReport
		})
	};
};

export const createPlivoVoiceRoutes = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: PlivoVoiceRoutesOptions<TContext, TSession, TResult> = {}
) => {
	const streamPath = options.streamPath ?? '/api/voice/plivo/stream';
	const answerPath = options.answer?.path ?? '/api/voice/plivo';
	const webhookPath = options.webhook?.path ?? '/api/voice/plivo/webhook';
	const setupPath =
		options.setup?.path === false
			? false
			: options.setup?.path ?? '/api/voice/plivo/setup';
	const smokePath =
		options.smoke?.path === false
			? false
			: options.smoke?.path ?? '/api/voice/plivo/smoke';
	const webhookPolicy =
		options.webhook?.policy ??
		options.outcomePolicy ??
		createVoiceTelephonyOutcomePolicy();
	const verificationUrl = options.webhook?.verificationUrl;
	const verify =
		options.webhook?.verify ??
		(options.webhook?.authToken
			? ((input: {
					body: unknown;
					query: Record<string, unknown>;
					rawBody: string;
					request: Request;
			  }) =>
					verifyVoicePlivoWebhookSignature({
						authToken: options.webhook?.authToken,
						body: input.body,
						headers: input.request.headers,
						url:
							typeof verificationUrl === 'function'
								? verificationUrl({
										query: input.query,
										request: input.request
									})
								: verificationUrl ?? input.request.url
					}))
			: undefined);
	const app = new Elysia({
		name: options.name ?? 'absolutejs-voice-plivo'
	})
		.get(answerPath, async ({ query, request }) => {
			const streamUrl = await resolvePlivoStreamUrl(options, {
				query,
				request,
				streamPath
			});
			return new Response(
				createPlivoVoiceResponse({
					...options.answer?.response,
					streamUrl
				}),
				{
					headers: {
						'content-type': 'text/xml; charset=utf-8'
					}
				}
			);
		})
		.post(answerPath, async ({ query, request }) => {
			const streamUrl = await resolvePlivoStreamUrl(options, {
				query,
				request,
				streamPath
			});
			return new Response(
				createPlivoVoiceResponse({
					...options.answer?.response,
					streamUrl
				}),
				{
					headers: {
						'content-type': 'text/xml; charset=utf-8'
					}
				}
			);
		})
		.use(
			createVoiceTelephonyWebhookRoutes({
				...(options.webhook ?? {}),
				context: options.context as TContext,
				path: webhookPath,
				policy: webhookPolicy,
				provider: 'plivo',
				requireVerification: Boolean(options.webhook?.authToken),
				resolveSessionId:
					options.webhook?.resolveSessionId ??
					(({ event }) => {
						const metadata = event.metadata;
						return typeof metadata?.SessionId === 'string'
							? metadata.SessionId
							: typeof metadata?.sessionId === 'string'
								? metadata.sessionId
								: typeof metadata?.CallUUID === 'string'
									? metadata.CallUUID
									: typeof metadata?.call_uuid === 'string'
										? metadata.call_uuid
										: undefined;
					}),
				verify
			})
		);

	const withSetup = setupPath
		? app.get(setupPath, async ({ query, request }) => {
				const status = await buildPlivoVoiceSetupStatus(options, {
					answerPath,
					query,
					request,
					streamPath,
					webhookPath
				});
				if (query.format === 'html') {
					return new Response(
						renderPlivoSetupHTML(
							status,
							options.setup?.title ?? 'AbsoluteJS Plivo Voice Setup'
						),
						{
							headers: {
								'content-type': 'text/html; charset=utf-8'
							}
						}
					);
				}
				return status;
		  })
		: app;

	if (!smokePath) {
		return withSetup;
	}

	return withSetup.get(smokePath, async ({ query, request }) => {
		const report = await runPlivoSmokeTest({
			answerPath,
			app,
			options,
			query,
			request,
			streamPath,
			webhookPath
		});
		if (query.format === 'html') {
			return new Response(
				renderPlivoSmokeHTML(
					report,
					options.smoke?.title ?? 'AbsoluteJS Plivo Voice Smoke Test'
				),
				{
					headers: {
						'content-type': 'text/html; charset=utf-8'
					}
				}
			);
		}
		return report;
	});
};
