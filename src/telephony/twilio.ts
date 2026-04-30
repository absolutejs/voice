import { Buffer } from 'node:buffer';
import { Elysia } from 'elysia';
import { resolveAudioConditioningConfig } from '../audioConditioning';
import { resolveLogger } from '../logger';
import { resolveVoiceRuntimePreset } from '../presets';
import { createVoiceSession } from '../session';
import type {
	VoiceTelephonySetupStatus,
	VoiceTelephonySmokeCheck,
	VoiceTelephonySmokeReport
} from './contract';
import {
	createVoiceTelephonyOutcomePolicy,
	createVoiceTelephonyWebhookRoutes,
	signVoiceTwilioWebhook,
	type VoiceTelephonyOutcomePolicy,
	type VoiceTelephonyWebhookRoutesOptions
} from '../telephonyOutcome';
import {
	createVoiceCallReviewRecorder,
	type VoiceCallReviewArtifact,
	type VoiceCallReviewConfig,
	type VoiceCallReviewRecorder
} from '../testing/review';
import { resolveTurnDetectionConfig } from '../turnProfiles';
import type { VoiceTraceEventStore } from '../trace';
import type {
	AudioChunk,
	AudioFormat,
	CreateVoiceSessionOptions,
	STTAdapter,
	TTSAdapter,
	VoiceAudioConditioningConfig,
	VoiceCostTelemetryConfig,
	VoiceLanguageStrategy,
	VoiceLexiconEntry,
	VoiceLexiconResolver,
	VoiceLogger,
	VoiceNormalizedRouteConfig,
	VoiceOnTurnObjectHandler,
	VoicePhraseHint,
	VoicePhraseHintResolver,
	VoicePluginConfig,
	VoiceReconnectConfig,
	VoiceResolvedSTTFallbackConfig,
	VoiceRouteResult,
	VoiceRuntimePreset,
	VoiceSessionHandle,
	VoiceSessionRecord,
	VoiceSessionStore,
	VoiceSocket,
	VoiceSTTFallbackConfig,
	VoiceSTTLifecycle,
	VoiceTurnDetectionConfig,
	VoiceTurnRecord,
	VoiceServerMessage
} from '../types';

const TWILIO_MULAW_SAMPLE_RATE = 8_000;
const VOICE_PCM_SAMPLE_RATE = 16_000;

type TwilioMediaPayload = {
	chunk?: string;
	payload: string;
	timestamp?: string;
	track?: 'inbound' | 'outbound';
};

type TwilioConnectedMessage = {
	event: 'connected';
	protocol?: string;
	version?: string;
};

type TwilioStartMessage = {
	event: 'start';
	sequenceNumber?: string;
	start: {
		accountSid?: string;
		callSid?: string;
		customParameters?: Record<string, string>;
		mediaFormat?: {
			channels?: number;
			encoding?: string;
			sampleRate?: number;
		};
		streamSid: string;
		track?: string;
	};
	streamSid?: string;
};

type TwilioMediaMessage = {
	event: 'media';
	media: TwilioMediaPayload;
	sequenceNumber?: string;
	streamSid: string;
};

type TwilioMarkMessage = {
	event: 'mark';
	mark?: {
		name?: string;
	};
	sequenceNumber?: string;
	streamSid: string;
};

type TwilioStopMessage = {
	event: 'stop';
	sequenceNumber?: string;
	stop?: {
		accountSid?: string;
		callSid?: string;
	};
	streamSid: string;
};

export type TwilioInboundMessage =
	| TwilioConnectedMessage
	| TwilioStartMessage
	| TwilioMediaMessage
	| TwilioMarkMessage
	| TwilioStopMessage;

export type TwilioOutboundMediaMessage = {
	event: 'media';
	media: {
		payload: string;
	};
	streamSid: string;
};

export type TwilioOutboundClearMessage = {
	event: 'clear';
	streamSid: string;
};

export type TwilioOutboundMarkMessage = {
	event: 'mark';
	mark: {
		name: string;
	};
	streamSid: string;
};

export type TwilioOutboundMessage =
	| TwilioOutboundMediaMessage
	| TwilioOutboundClearMessage
	| TwilioOutboundMarkMessage;

export type TwilioMediaStreamSocket = {
	close: (code?: number, reason?: string) => void | Promise<void>;
	send: (data: string) => void | Promise<void>;
};

export type TwilioMediaStreamBridgeOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = Omit<VoicePluginConfig<TContext, TSession, TResult>, 'htmx' | 'path' | 'stt'> & {
	clearOnInboundMedia?: boolean;
	context: TContext;
	logger?: VoiceLogger;
	onVoiceMessage?: (input: {
		callSid?: string;
		message: VoiceServerMessage<TResult>;
		sessionId: string;
		streamSid?: string;
	}) => Promise<void> | void;
	review?: {
		config?: VoiceCallReviewConfig;
		fixtureId?: string;
		onArtifact?: (artifact: VoiceCallReviewArtifact) => Promise<void> | void;
		path?: string;
		title?: string;
	};
	scenarioId?: string;
	sessionId?: string;
	stt: STTAdapter;
	telephonyMediaCarrier?: 'plivo' | 'telnyx' | 'twilio';
};

export type TwilioMediaStreamBridge = {
	close: (reason?: string) => Promise<void>;
	getSessionId: () => string | null;
	getStreamSid: () => string | null;
	handleMessage: (raw: string | TwilioInboundMessage) => Promise<void>;
};

export type TwilioVoiceResponseOptions = {
	parameters?: Record<string, string | number | boolean | undefined>;
	streamName?: string;
	streamUrl: string;
	track?: 'both_tracks' | 'inbound_track' | 'outbound_track';
};

export type TwilioVoiceRouteParameters =
	| Record<string, string | number | boolean | undefined>
	| ((input: { query: Record<string, unknown>; request: Request }) =>
			| Promise<Record<string, string | number | boolean | undefined>>
			| Record<string, string | number | boolean | undefined>);

export type TwilioVoiceSetupStatus = VoiceTelephonySetupStatus<'twilio'> & {
	urls: VoiceTelephonySetupStatus<'twilio'>['urls'] & {
		twiml: string;
	};
};

export type TwilioVoiceSetupOptions = {
	path?: false | string;
	requiredEnv?: Record<string, string | undefined>;
	title?: string;
};

export type TwilioVoiceSmokeCheck = VoiceTelephonySmokeCheck;

export type TwilioVoiceSmokeReport = VoiceTelephonySmokeReport<'twilio'> & {
	setup: TwilioVoiceSetupStatus;
};

export type TwilioVoiceSmokeOptions = {
	callSid?: string;
	path?: false | string;
	scenarioId?: string;
	sessionId?: string;
	sipCode?: number;
	status?: string;
	title?: string;
};

export type TwilioVoiceRoutesOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = TwilioMediaStreamBridgeOptions<TContext, TSession, TResult> & {
	name?: string;
	outcomePolicy?: VoiceTelephonyOutcomePolicy;
	smoke?: TwilioVoiceSmokeOptions;
	setup?: TwilioVoiceSetupOptions;
	streamPath?: string;
	twiml?: {
		parameters?: TwilioVoiceRouteParameters;
		path?: string;
		streamName?: string;
		streamUrl?:
			| string
			| ((input: {
					query: Record<string, unknown>;
					request: Request;
					streamPath: string;
			  }) => Promise<string> | string);
		track?: TwilioVoiceResponseOptions['track'];
	};
	webhook?: Omit<
		VoiceTelephonyWebhookRoutesOptions<TContext, TSession, TResult>,
		'context' | 'path' | 'policy' | 'provider'
	> & {
		path?: string;
		policy?: VoiceTelephonyOutcomePolicy;
	};
};

const escapeXml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');

const resolveRequestOrigin = (request: Request) => {
	const url = new URL(request.url);
	const forwardedHost = request.headers.get('x-forwarded-host');
	const forwardedProto = request.headers.get('x-forwarded-proto');
	const host = forwardedHost ?? request.headers.get('host') ?? url.host;
	const protocol = forwardedProto ?? url.protocol.replace(':', '');

	return `${protocol}://${host}`;
};

const resolveTwilioStreamUrl = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	options: TwilioVoiceRoutesOptions<TContext, TSession, TResult>,
	input: {
		query: Record<string, unknown>;
		request: Request;
		streamPath: string;
	}
) => {
	if (typeof options.twiml?.streamUrl === 'function') {
		return options.twiml.streamUrl(input);
	}

	if (typeof options.twiml?.streamUrl === 'string') {
		return options.twiml.streamUrl;
	}

	const origin = resolveRequestOrigin(input.request);
	const wsOrigin = origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
	return `${wsOrigin}${input.streamPath}`;
};

const resolveTwilioStreamParameters = async (
	parameters: TwilioVoiceRouteParameters | undefined,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (typeof parameters === 'function') {
		return parameters(input);
	}

	return parameters;
};

const joinUrlPath = (origin: string, path: string) =>
	`${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');

const getWebhookVerificationUrl = <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	webhook: TwilioVoiceRoutesOptions<TContext, TSession, TResult>['webhook'],
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
) => {
	if (!webhook?.verificationUrl) {
		return undefined;
	}

	if (typeof webhook.verificationUrl === 'function') {
		return webhook.verificationUrl(input);
	}

	return webhook.verificationUrl;
};

const buildTwilioVoiceSetupStatus = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	options: TwilioVoiceRoutesOptions<TContext, TSession, TResult>,
	input: {
		query: Record<string, unknown>;
		request: Request;
		streamPath: string;
		twimlPath: string;
		webhookPath: string;
	}
): Promise<TwilioVoiceSetupStatus> => {
	const origin = resolveRequestOrigin(input.request);
	const stream = await resolveTwilioStreamUrl(options, input);
	const twiml = joinUrlPath(origin, input.twimlPath);
	const webhook = joinUrlPath(origin, input.webhookPath);
	const verificationUrl = getWebhookVerificationUrl(options.webhook, input);
	const missing = Object.entries(options.setup?.requiredEnv ?? {})
		.filter((entry) => !entry[1])
		.map(([name]) => name);
	const signingConfigured = Boolean(
		options.webhook?.signingSecret || options.webhook?.verify
	);
	const warnings = [
		...(stream.startsWith('wss://')
			? []
			: ['Twilio media streams should use wss:// in production.']),
		...(signingConfigured
			? []
			: ['Webhook signature verification is not configured.']),
		...(verificationUrl || !signingConfigured
			? []
			: ['Webhook signing is configured without an explicit verification URL.'])
	];

	return {
		generatedAt: Date.now(),
		missing,
		provider: 'twilio',
		ready: missing.length === 0 && signingConfigured && warnings.length === 0,
		signing: {
			configured: signingConfigured,
			mode: options.webhook?.verify
				? 'custom'
				: options.webhook?.signingSecret
					? 'twilio-signature'
					: 'none',
			verificationUrl
		},
		urls: {
			stream,
			twiml,
			webhook
		},
		warnings
	};
};

const renderTwilioVoiceSetupHTML = (
	status: TwilioVoiceSetupStatus,
	title: string
) => `<main style="font-family: ui-sans-serif, system-ui; max-width: 860px; margin: 40px auto; padding: 0 20px;">
<p style="letter-spacing: .12em; text-transform: uppercase; color: #52606d;">Twilio setup</p>
<h1>${escapeHtml(title)}</h1>
<p><strong>Status:</strong> ${status.ready ? 'Ready' : 'Needs attention'}</p>
<section>
<h2>URLs</h2>
<ul>
<li><strong>TwiML:</strong> <code>${escapeHtml(status.urls.twiml)}</code></li>
<li><strong>Media stream:</strong> <code>${escapeHtml(status.urls.stream)}</code></li>
<li><strong>Status webhook:</strong> <code>${escapeHtml(status.urls.webhook)}</code></li>
</ul>
</section>
<section>
<h2>Signing</h2>
<p>Mode: <code>${status.signing.mode}</code></p>
${status.signing.verificationUrl ? `<p>Verification URL: <code>${escapeHtml(status.signing.verificationUrl)}</code></p>` : ''}
</section>
${status.missing.length ? `<section><h2>Missing env</h2><ul>${status.missing.map((name) => `<li><code>${escapeHtml(name)}</code></li>`).join('')}</ul></section>` : ''}
${status.warnings.length ? `<section><h2>Warnings</h2><ul>${status.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></section>` : ''}
</main>`;

const extractTwilioStreamUrl = (twiml: string) =>
	twiml.match(/<Stream\b[^>]*\surl="([^"]+)"/i)?.[1]?.replaceAll('&amp;', '&');

const createSmokeCheck = (
	name: string,
	status: TwilioVoiceSmokeCheck['status'],
	message?: string,
	details?: Record<string, unknown>
): TwilioVoiceSmokeCheck => ({
	details,
	message,
	name,
	status
});

const renderTwilioVoiceSmokeHTML = (
	report: TwilioVoiceSmokeReport,
	title: string
) => `<main style="font-family: ui-sans-serif, system-ui; max-width: 860px; margin: 40px auto; padding: 0 20px;">
<p style="letter-spacing: .12em; text-transform: uppercase; color: #52606d;">Twilio smoke test</p>
<h1>${escapeHtml(title)}</h1>
<p><strong>Status:</strong> ${report.pass ? 'Pass' : 'Fail'}</p>
<section>
<h2>Checks</h2>
<ul>
${report.checks.map((check) => `<li><strong>${escapeHtml(check.name)}</strong>: ${escapeHtml(check.status)}${check.message ? ` - ${escapeHtml(check.message)}` : ''}</li>`).join('')}
</ul>
</section>
<section>
<h2>Observed URLs</h2>
<ul>
<li><strong>TwiML:</strong> <code>${escapeHtml(report.setup.urls.twiml)}</code></li>
<li><strong>Stream:</strong> <code>${escapeHtml(report.twiml?.streamUrl ?? report.setup.urls.stream)}</code></li>
<li><strong>Webhook:</strong> <code>${escapeHtml(report.setup.urls.webhook)}</code></li>
</ul>
</section>
</main>`;

const runTwilioVoiceSmokeTest = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(input: {
	app: {
		handle: (request: Request) => Response | Promise<Response>;
	};
	options: TwilioVoiceRoutesOptions<TContext, TSession, TResult>;
	query: Record<string, unknown>;
	request: Request;
	streamPath: string;
	twimlPath: string;
	webhookPath: string;
}): Promise<TwilioVoiceSmokeReport> => {
	const setup = await buildTwilioVoiceSetupStatus(input.options, input);
	const checks: TwilioVoiceSmokeCheck[] = [];
	const twimlUrl = new URL(setup.urls.twiml);
	twimlUrl.searchParams.set(
		'scenarioId',
		input.options.smoke?.scenarioId ?? 'smoke'
	);
	twimlUrl.searchParams.set(
		'sessionId',
		input.options.smoke?.sessionId ?? 'smoke-session'
	);

	const twimlResponse = await input.app.handle(
		new Request(twimlUrl, {
			headers: input.request.headers
		})
	);
	const twiml = await twimlResponse.text();
	const streamUrl = extractTwilioStreamUrl(twiml);
	checks.push(
		createSmokeCheck(
			'twiml',
			twimlResponse.ok && Boolean(streamUrl) ? 'pass' : 'fail',
			streamUrl ? 'TwiML includes a media stream URL.' : 'TwiML is missing <Stream url="...">.',
			{
				status: twimlResponse.status,
				streamUrl
			}
		)
	);
	checks.push(
		createSmokeCheck(
			'stream-url',
			streamUrl?.startsWith('wss://') ? 'pass' : 'fail',
			streamUrl?.startsWith('wss://')
				? 'Media stream URL uses wss://.'
				: 'Media stream URL should use wss:// for Twilio.',
			{
				streamUrl
			}
		)
	);

	const webhookBody = {
		CallSid: input.options.smoke?.callSid ?? 'CA_SMOKE_TEST',
		CallStatus: input.options.smoke?.status ?? 'busy',
		SipResponseCode: String(input.options.smoke?.sipCode ?? 486)
	};
	const webhookHeaders = new Headers({
		'content-type': 'application/x-www-form-urlencoded'
	});
	const verificationUrl =
		setup.signing.verificationUrl ?? setup.urls.webhook;
	if (input.options.webhook?.signingSecret) {
		webhookHeaders.set(
			'x-twilio-signature',
			await signVoiceTwilioWebhook({
				authToken: input.options.webhook.signingSecret,
				body: webhookBody,
				url: verificationUrl
			})
		);
	}

	const webhookResponse = await input.app.handle(
		new Request(setup.urls.webhook, {
			body: new URLSearchParams(webhookBody),
			headers: webhookHeaders,
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
				? 'Synthetic Twilio status callback was accepted.'
				: 'Synthetic Twilio status callback failed.',
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

	return {
		checks,
		generatedAt: Date.now(),
		pass: checks.every((check) => check.status !== 'fail'),
		provider: 'twilio',
		setup,
		twiml: {
			status: twimlResponse.status,
			streamUrl
		},
		webhook: {
			body: webhookPayload,
			status: webhookResponse.status
		}
	};
};

const normalizeOnTurn = <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	handler: VoicePluginConfig<TContext, TSession, TResult>['onTurn']
): VoiceOnTurnObjectHandler<TContext, TSession, TResult> => {
	if (handler.length > 1) {
		const directHandler = handler as (
			session: TSession,
			turn: VoiceTurnRecord,
			api: VoiceSessionHandle<TContext, TSession, TResult>,
			context: TContext
		) =>
			| Promise<VoiceRouteResult<TResult> | void>
			| VoiceRouteResult<TResult>
			| void;

		return async ({ context, session, turn, api }) =>
			directHandler(session, turn, api, context);
	}

	return handler as VoiceOnTurnObjectHandler<TContext, TSession, TResult>;
};

const resolveSTTFallbackConfig = (
	config?: VoiceSTTFallbackConfig
): VoiceResolvedSTTFallbackConfig | undefined => {
	if (!config) {
		return undefined;
	}

	return {
		adapter: config.adapter,
		completionTimeoutMs: config.completionTimeoutMs ?? 2_500,
		confidenceThreshold: config.confidenceThreshold ?? 0.6,
		maxAttemptsPerTurn: config.maxAttemptsPerTurn ?? 1,
		minTextLength: config.minTextLength ?? 2,
		replayWindowMs: config.replayWindowMs ?? 8_000,
		settleMs: config.settleMs ?? 220,
		trigger: config.trigger ?? 'empty-or-low-confidence'
	};
};

const normalizePhraseHints = (hints: VoicePhraseHint[] | void | undefined) =>
	(hints ?? [])
		.map((hint) => ({
			...hint,
			aliases: hint.aliases?.filter(
				(value): value is string =>
					typeof value === 'string' && value.trim().length > 0
			),
			text: hint.text.trim()
		}))
		.filter((hint) => hint.text.length > 0);

const normalizeLexicon = (entries: VoiceLexiconEntry[] | void | undefined) =>
	(entries ?? [])
		.map((entry) => ({
			...entry,
			aliases: entry.aliases?.filter(
				(value): value is string =>
					typeof value === 'string' && value.trim().length > 0
			),
			language:
				typeof entry.language === 'string' && entry.language.trim().length > 0
					? entry.language.trim()
					: undefined,
			pronunciation:
				typeof entry.pronunciation === 'string' &&
				entry.pronunciation.trim().length > 0
					? entry.pronunciation.trim()
					: undefined,
			text: entry.text.trim()
		}))
		.filter((entry) => entry.text.length > 0);

const toUint8Array = (value: AudioChunk) => {
	if (value instanceof Uint8Array) {
		return value;
	}

	if (value instanceof ArrayBuffer) {
		return new Uint8Array(value);
	}

	return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
};

const clamp16 = (value: number) =>
	Math.max(-32_768, Math.min(32_767, Math.round(value)));

const linearResample = (
	input: Int16Array,
	inputRate: number,
	outputRate: number
) => {
	if (input.length === 0) {
		return new Int16Array(0);
	}

	if (inputRate === outputRate) {
		return new Int16Array(input);
	}

	const outputLength = Math.max(
		1,
		Math.round((input.length * outputRate) / inputRate)
	);
	const output = new Int16Array(outputLength);
	const ratio = inputRate / outputRate;

	for (let index = 0; index < outputLength; index += 1) {
		const sourcePosition = index * ratio;
		const leftIndex = Math.floor(sourcePosition);
		const rightIndex = Math.min(input.length - 1, leftIndex + 1);
		const blend = sourcePosition - leftIndex;
		const left = input[Math.min(leftIndex, input.length - 1)] ?? 0;
		const right = input[rightIndex] ?? left;
		output[index] = clamp16(left + (right - left) * blend);
	}

	return output;
};

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32_635;

const encodeMulawSample = (sample: number) => {
	let value = clamp16(sample);
	let sign = 0;
	if (value < 0) {
		sign = 0x80;
		value = -value;
	}

	value = Math.min(MULAW_CLIP, value);
	value += MULAW_BIAS;

	let exponent = 7;
	for (let bit = 0x4000; (value & bit) === 0 && exponent > 0; bit >>= 1) {
		exponent -= 1;
	}

	const mantissa = (value >> (exponent + 3)) & 0x0f;
	return ~(sign | (exponent << 4) | mantissa) & 0xff;
};

const decodeMulawSample = (value: number) => {
	const normalized = (~value) & 0xff;
	const sign = normalized & 0x80;
	const exponent = (normalized >> 4) & 0x07;
	const mantissa = normalized & 0x0f;
	let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
	sample -= MULAW_BIAS;
	return sign ? -sample : sample;
};

const int16ArrayToBytes = (samples: Int16Array) => {
	const output = new Uint8Array(samples.length * 2);
	const view = new DataView(output.buffer);
	for (let index = 0; index < samples.length; index += 1) {
		view.setInt16(index * 2, samples[index] ?? 0, true);
	}
	return output;
};

const bytesToInt16Array = (bytes: Uint8Array) => {
	const sampleCount = Math.floor(bytes.byteLength / 2);
	const output = new Int16Array(sampleCount);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	for (let index = 0; index < sampleCount; index += 1) {
		output[index] = view.getInt16(index * 2, true);
	}
	return output;
};

export const decodeTwilioMulawBase64 = (payload: string) => {
	const bytes = Uint8Array.from(Buffer.from(payload, 'base64'));
	const samples = new Int16Array(bytes.length);
	for (let index = 0; index < bytes.length; index += 1) {
		samples[index] = decodeMulawSample(bytes[index] ?? 0);
	}
	return samples;
};

export const encodeTwilioMulawBase64 = (samples: Int16Array) => {
	const bytes = new Uint8Array(samples.length);
	for (let index = 0; index < samples.length; index += 1) {
		bytes[index] = encodeMulawSample(samples[index] ?? 0);
	}
	return Buffer.from(bytes).toString('base64');
};

export const transcodeTwilioInboundPayloadToPCM16 = (payload: string) => {
	const narrowband = decodeTwilioMulawBase64(payload);
	const wideband = linearResample(
		narrowband,
		TWILIO_MULAW_SAMPLE_RATE,
		VOICE_PCM_SAMPLE_RATE
	);
	return int16ArrayToBytes(wideband);
};

export const transcodePCMToTwilioOutboundPayload = (
	chunk: Uint8Array,
	format: AudioFormat
) => {
	if (
		format.container === 'raw' &&
		format.encoding === 'mulaw' &&
		format.channels === 1 &&
		format.sampleRateHz === TWILIO_MULAW_SAMPLE_RATE
	) {
		return Buffer.from(chunk).toString('base64');
	}

	if (format.encoding !== 'pcm_s16le') {
		throw new Error(
			`Unsupported outbound telephony audio format: ${format.container}/${format.encoding}`
		);
	}

	const pcm = bytesToInt16Array(chunk);
	const mono =
		format.channels === 1
			? pcm
			: new Int16Array(
					Array.from({ length: Math.floor(pcm.length / 2) }, (_, frameIndex) => {
						const left = pcm[frameIndex * 2] ?? 0;
						const right = pcm[frameIndex * 2 + 1] ?? 0;
						return clamp16((left + right) / 2);
					})
			  );
	const telephony = linearResample(
		mono,
		format.sampleRateHz,
		TWILIO_MULAW_SAMPLE_RATE
	);
	return encodeTwilioMulawBase64(telephony);
};

const parseTwilioMessage = (raw: string | TwilioInboundMessage) => {
	if (typeof raw !== 'string') {
		return raw;
	}

	return JSON.parse(raw) as TwilioInboundMessage;
};

const createTwilioSocketAdapter = <TResult>(
	socket: TwilioMediaStreamSocket,
	getState: () => {
		callSid: string | null;
		carrier: 'plivo' | 'telnyx' | 'twilio';
		hasOutboundAudioSinceLastInbound: boolean;
		onVoiceMessage?: (input: {
			callSid?: string;
			message: VoiceServerMessage<TResult>;
			sessionId: string;
			streamSid?: string;
		}) => Promise<void> | void;
		reviewRecorder?: VoiceCallReviewRecorder;
		scenarioId: string | null;
		sessionId: string | null;
		streamSid: string | null;
		trace?: VoiceTraceEventStore;
	}
) => ({
	close: async (code?: number, reason?: string) => {
		await Promise.resolve(socket.close(code, reason));
	},
	send: async (data: string | Uint8Array | ArrayBuffer) => {
		if (typeof data !== 'string') {
			return;
		}

		const state = getState();
		const message = JSON.parse(data) as VoiceServerMessage<TResult>;
		state.reviewRecorder?.recordVoiceMessage(message);
		await Promise.resolve(
			state.onVoiceMessage?.({
				callSid: state.callSid ?? undefined,
				message,
				sessionId: state.sessionId ?? '',
				streamSid: state.streamSid ?? undefined
			})
		);

		if (!state.streamSid) {
			return;
		}

		if (message.type === 'audio') {
			const payload = transcodePCMToTwilioOutboundPayload(
				Uint8Array.from(Buffer.from(message.chunkBase64, 'base64')),
				message.format
			);
			const outboundMessage = {
				event: 'media',
				media: {
					payload,
					track: 'outbound'
				},
				streamSid: state.streamSid
			};
			state.hasOutboundAudioSinceLastInbound = true;
			state.reviewRecorder?.recordTwilioOutbound({
				bytes: payload.length,
				event: 'media',
				track: 'outbound'
			});
			await state.trace?.append({
				at: Date.now(),
				payload: {
					audioBytes: Buffer.from(payload, 'base64').byteLength,
					callSid: state.callSid ?? undefined,
					carrier: state.carrier,
					direction: 'outbound',
					envelope: outboundMessage,
					event: 'media',
					streamId: state.streamSid
				},
				scenarioId: state.scenarioId ?? undefined,
				sessionId: state.sessionId ?? state.streamSid,
				type: 'client.telephony_media'
			});
			await Promise.resolve(
				socket.send(
					JSON.stringify({
						event: 'media',
						media: {
							payload
						},
						streamSid: state.streamSid
					} satisfies TwilioOutboundMediaMessage)
				)
			);
			return;
		}

		if (message.type === 'assistant' && message.turnId) {
			const outboundMessage = {
				event: 'mark',
				mark: {
					name: `assistant:${message.turnId}`
				},
				streamSid: state.streamSid
			} satisfies TwilioOutboundMarkMessage;
			state.reviewRecorder?.recordTwilioOutbound({
				event: 'mark',
				name: `assistant:${message.turnId}`
			});
			await state.trace?.append({
				at: Date.now(),
				payload: {
					callSid: state.callSid ?? undefined,
					carrier: state.carrier,
					direction: 'outbound',
					envelope: outboundMessage,
					event: 'mark',
					streamId: state.streamSid
				},
				scenarioId: state.scenarioId ?? undefined,
				sessionId: state.sessionId ?? state.streamSid,
				type: 'client.telephony_media'
			});
			await Promise.resolve(
				socket.send(JSON.stringify(outboundMessage))
			);
		}
	}
});

export const createTwilioVoiceResponse = (
	options: TwilioVoiceResponseOptions
) => {
	const parameters = Object.entries(options.parameters ?? {})
		.filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
		.map(
			([name, value]) =>
				`<Parameter name="${escapeXml(name)}" value="${escapeXml(String(value))}" />`
		)
		.join('');

	return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${escapeXml(
		options.streamUrl
	)}"${
		options.track ? ` track="${escapeXml(options.track)}"` : ''
	}${
		options.streamName ? ` name="${escapeXml(options.streamName)}"` : ''
	}>${parameters}</Stream></Connect></Response>`;
};

export const createTwilioMediaStreamBridge = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	socket: TwilioMediaStreamSocket,
	options: TwilioMediaStreamBridgeOptions<TContext, TSession, TResult>
): TwilioMediaStreamBridge => {
	const runtimePreset = resolveVoiceRuntimePreset(options.preset);
	const turnDetection = resolveTurnDetectionConfig({
		...runtimePreset.turnDetection,
		...options.turnDetection
	});
	const audioConditioning =
		options.audioConditioning !== undefined
			? resolveAudioConditioningConfig(options.audioConditioning)
			: runtimePreset.audioConditioning;
	const logger = resolveLogger(options.logger);
	const reconnect: Required<VoiceReconnectConfig> = {
		maxAttempts: options.reconnect?.maxAttempts ?? 10,
		strategy: options.reconnect?.strategy ?? 'resume-last-turn',
		timeout: options.reconnect?.timeout ?? 30_000
	};

	const bridgeState: {
		callSid: string | null;
		carrier: 'plivo' | 'telnyx' | 'twilio';
		hasOutboundAudioSinceLastInbound: boolean;
		onVoiceMessage?: (input: {
			callSid?: string;
			message: VoiceServerMessage<TResult>;
			sessionId: string;
			streamSid?: string;
		}) => Promise<void> | void;
		reviewRecorder?: VoiceCallReviewRecorder;
		scenarioId: string | null;
		sessionId: string | null;
		streamSid: string | null;
		trace?: VoiceTraceEventStore;
	} = {
		callSid: null,
		carrier: options.telephonyMediaCarrier ?? 'twilio',
		hasOutboundAudioSinceLastInbound: false,
		onVoiceMessage: options.onVoiceMessage,
		reviewRecorder:
			options.review
				? createVoiceCallReviewRecorder({
						config: options.review.config ?? {
							preset: options.preset,
							stt: {
								kind: options.stt.kind
							},
							tts: options.tts
								? {
										kind: options.tts.kind
								  }
								: undefined,
							turnDetection
						},
						fixtureId: options.review.fixtureId,
						path: options.review.path,
						title: options.review.title
				  })
				: undefined,
		scenarioId: options.scenarioId ?? null,
		sessionId: options.sessionId ?? null,
		streamSid: null,
		trace: options.trace as VoiceTraceEventStore | undefined
	};
	let sessionHandle:
		| VoiceSessionHandle<TContext, TSession, TResult>
		| null = null;
	let reviewArtifactDelivered = false;
	const telephonyMediaCarrier = bridgeState.carrier;

	const appendTelephonyMediaTrace = async (
		message: TwilioInboundMessage,
		override?: {
			sessionId?: string;
			streamSid?: string;
		}
	) => {
		const trace = options.trace as VoiceTraceEventStore | undefined;
		const sessionId =
			override?.sessionId ??
			bridgeState.sessionId ??
			(message.event === 'start'
				? message.start.customParameters?.sessionId
				: undefined) ??
			(message.event === 'start'
				? message.start.streamSid
				: 'telephony-media');
		const streamSid =
			override?.streamSid ??
			(message.event === 'start'
				? message.start.streamSid
				: 'streamSid' in message
					? message.streamSid
					: undefined);

		await trace?.append({
			at: Date.now(),
			payload: {
				callSid:
					message.event === 'start'
						? message.start.callSid
						: message.event === 'stop'
							? message.stop?.callSid
							: bridgeState.callSid ?? undefined,
				carrier: telephonyMediaCarrier,
				envelope: message,
				event: message.event,
				streamId: streamSid
			},
			scenarioId: bridgeState.scenarioId ?? undefined,
			sessionId,
			type: 'client.telephony_media'
		});
	};

	const resolveLexicon = async () => {
		if (typeof options.lexicon === 'function') {
			return normalizeLexicon(
				(await (options.lexicon as VoiceLexiconResolver<TContext>)({
					context: options.context,
					scenarioId: bridgeState.scenarioId ?? undefined,
					sessionId: bridgeState.sessionId ?? ''
				})) ?? []
			);
		}

		return normalizeLexicon(options.lexicon);
	};

	const resolvePhraseHints = async () => {
		if (typeof options.phraseHints === 'function') {
			return normalizePhraseHints(
				(await (options.phraseHints as VoicePhraseHintResolver<TContext>)({
					context: options.context,
					scenarioId: bridgeState.scenarioId ?? undefined,
					sessionId: bridgeState.sessionId ?? ''
				})) ?? []
			);
		}

		return normalizePhraseHints(options.phraseHints);
	};

	const ensureSession = async () => {
		if (sessionHandle) {
			return sessionHandle;
		}

		bridgeState.sessionId ??= `phone-${Date.now().toString(36)}`;
		const lexicon = await resolveLexicon();
		const phraseHints = await resolvePhraseHints();
		const normalizedOnTurn = normalizeOnTurn(options.onTurn);
		const route: VoiceNormalizedRouteConfig<TContext, TSession, TResult> = {
			correctTurn: options.correctTurn,
			onComplete: options.onComplete,
			onError: options.onError,
			onSession: options.onSession,
			onTurn: async (input) => {
				bridgeState.reviewRecorder?.recordVoiceMessage({
					type: 'turn',
					turn: input.turn
				});
				const result = await normalizedOnTurn(input);
				if (result?.assistantText) {
					bridgeState.reviewRecorder?.recordVoiceMessage({
						type: 'assistant',
						text: result.assistantText,
						turnId: input.turn.id
					});
				}
				return result;
			}
		};
		const voiceSocket = createTwilioSocketAdapter<TResult>(socket, () => bridgeState);

		sessionHandle = createVoiceSession({
			audioConditioning,
			context: options.context,
			costTelemetry: options.costTelemetry as
				| VoiceCostTelemetryConfig<TContext, TSession, TResult>
				| undefined,
			id: bridgeState.sessionId,
			languageStrategy: options.languageStrategy,
			lexicon,
			logger,
			phraseHints,
			reconnect,
			route,
			scenarioId: bridgeState.scenarioId ?? undefined,
			socket: voiceSocket,
			store: options.session as VoiceSessionStore<TSession>,
			stt: options.stt as STTAdapter,
			sttFallback: resolveSTTFallbackConfig(options.sttFallback),
			sttLifecycle: options.sttLifecycle ?? runtimePreset.sttLifecycle,
			tts: options.tts as TTSAdapter | undefined,
			turnDetection
		} satisfies CreateVoiceSessionOptions<TContext, TSession, TResult>);

		return sessionHandle;
	};

	return {
		close: async (reason?: string) => {
			await sessionHandle?.close(reason);
			if (
				bridgeState.reviewRecorder &&
				options.review?.onArtifact &&
				!reviewArtifactDelivered
			) {
				reviewArtifactDelivered = true;
				await Promise.resolve(
					options.review.onArtifact(bridgeState.reviewRecorder.finalize())
				);
			}
		},
		getSessionId: () => bridgeState.sessionId,
		getStreamSid: () => bridgeState.streamSid,
		handleMessage: async (raw) => {
			const message = parseTwilioMessage(raw);

			switch (message.event) {
				case 'connected':
					bridgeState.reviewRecorder?.recordTwilioInbound({
						event: 'connected'
					});
					return;
				case 'start': {
					bridgeState.streamSid = message.start.streamSid;
					bridgeState.callSid = message.start.callSid ?? null;
					bridgeState.sessionId =
						message.start.customParameters?.sessionId?.trim() ||
						bridgeState.sessionId;
					bridgeState.scenarioId =
						message.start.customParameters?.scenarioId?.trim() ||
						bridgeState.scenarioId;
					bridgeState.reviewRecorder?.recordTwilioInbound({
						event: 'start',
						reason: message.start.callSid,
						text: bridgeState.sessionId ?? undefined
					});
					await appendTelephonyMediaTrace(message, {
						sessionId: bridgeState.sessionId ?? undefined,
						streamSid: bridgeState.streamSid ?? undefined
					});
					await ensureSession();
					return;
				}
				case 'media': {
					const activeSession = await ensureSession();
					bridgeState.reviewRecorder?.recordTwilioInbound({
						bytes: message.media.payload.length,
						event: 'media',
						track: message.media.track
					});
					if (
						options.clearOnInboundMedia !== false &&
						bridgeState.hasOutboundAudioSinceLastInbound &&
						bridgeState.streamSid
					) {
						const outboundMessage = {
							event: 'clear',
							streamSid: bridgeState.streamSid
						} satisfies TwilioOutboundClearMessage;
						bridgeState.reviewRecorder?.recordTwilioOutbound({
							event: 'clear'
						});
						await (options.trace as VoiceTraceEventStore | undefined)?.append({
							at: Date.now(),
							payload: {
								callSid: bridgeState.callSid ?? undefined,
								carrier: telephonyMediaCarrier,
								direction: 'outbound',
								envelope: outboundMessage,
								event: 'clear',
								streamId: bridgeState.streamSid
							},
							scenarioId: bridgeState.scenarioId ?? undefined,
							sessionId: bridgeState.sessionId ?? bridgeState.streamSid,
							type: 'client.telephony_media'
						});
						await Promise.resolve(
							socket.send(JSON.stringify(outboundMessage))
						);
					}
					bridgeState.hasOutboundAudioSinceLastInbound = false;
					await appendTelephonyMediaTrace(message, {
						sessionId: bridgeState.sessionId ?? undefined,
						streamSid: bridgeState.streamSid ?? undefined
					});
					await activeSession.receiveAudio(
						transcodeTwilioInboundPayloadToPCM16(message.media.payload)
					);
					return;
				}
				case 'mark':
					bridgeState.reviewRecorder?.recordTwilioInbound({
						event: 'mark',
						name: message.mark?.name
					});
					return;
				case 'stop':
					bridgeState.reviewRecorder?.recordTwilioInbound({
						event: 'stop',
						reason: message.stop?.callSid
					});
					await appendTelephonyMediaTrace(message, {
						sessionId: bridgeState.sessionId ?? undefined,
						streamSid: bridgeState.streamSid ?? undefined
					});
					await sessionHandle?.close('twilio-stop');
					return;
			}
		}
	};
};

export const createTwilioVoiceRoutes = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: TwilioVoiceRoutesOptions<TContext, TSession, TResult>
) => {
	const streamPath = options.streamPath ?? '/api/voice/twilio/stream';
	const twimlPath = options.twiml?.path ?? '/api/voice/twilio';
	const webhookPath = options.webhook?.path ?? '/api/voice/twilio/webhook';
	const setupPath =
		options.setup?.path === false
			? false
			: options.setup?.path ?? '/api/voice/twilio/setup';
	const smokePath =
		options.smoke?.path === false
			? false
			: options.smoke?.path ?? '/api/voice/twilio/smoke';
	const bridges = new WeakMap<object, TwilioMediaStreamBridge>();
	const webhookPolicy =
		options.webhook?.policy ??
		options.outcomePolicy ??
		createVoiceTelephonyOutcomePolicy();
	const app = new Elysia({
		name: options.name ?? 'absolutejs-voice-twilio'
	})
		.get(twimlPath, async ({ query, request }) => {
			const streamUrl = await resolveTwilioStreamUrl(options, {
				query,
				request,
				streamPath
			});
			const parameters = await resolveTwilioStreamParameters(
				options.twiml?.parameters,
				{
					query,
					request
				}
			);

			return new Response(
				createTwilioVoiceResponse({
					parameters,
					streamName: options.twiml?.streamName,
					streamUrl,
					track: options.twiml?.track
				}),
				{
					headers: {
						'content-type': 'text/xml; charset=utf-8'
					}
				}
			);
		})
		.post(twimlPath, async ({ query, request }) => {
			const streamUrl = await resolveTwilioStreamUrl(options, {
				query,
				request,
				streamPath
			});
			const parameters = await resolveTwilioStreamParameters(
				options.twiml?.parameters,
				{
					query,
					request
				}
			);

			return new Response(
				createTwilioVoiceResponse({
					parameters,
					streamName: options.twiml?.streamName,
					streamUrl,
					track: options.twiml?.track
				}),
				{
					headers: {
						'content-type': 'text/xml; charset=utf-8'
					}
				}
			);
		})
		.ws(streamPath, {
			close: async (ws, _code, reason) => {
				const bridge = bridges.get(ws as object);
				bridges.delete(ws as object);
				await bridge?.close(reason);
			},
			message: async (ws, raw) => {
				let bridge = bridges.get(ws as object);
				if (!bridge) {
					bridge = createTwilioMediaStreamBridge(
						{
							close: (code, reason) => {
								ws.close(code, reason);
							},
							send: (data) => {
								ws.send(data);
							}
						},
						options
					);
					bridges.set(ws as object, bridge);
				}

				await bridge.handleMessage(raw as string);
			}
		})
		.use(
			createVoiceTelephonyWebhookRoutes({
				...(options.webhook ?? {}),
				context: options.context,
				path: webhookPath,
				policy: webhookPolicy,
				provider: 'twilio'
			})
		);

	if (!setupPath) {
		if (!smokePath) {
			return app;
		}

		return app.get(smokePath, async ({ query, request }) => {
			const report = await runTwilioVoiceSmokeTest({
				app,
				options,
				query,
				request,
				streamPath,
				twimlPath,
				webhookPath
			});

			if (query.format === 'html') {
				return new Response(
					renderTwilioVoiceSmokeHTML(
						report,
						options.smoke?.title ?? 'AbsoluteJS Twilio Voice Smoke Test'
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
	}

	const withSetup = app.get(setupPath, async ({ query, request }) => {
		const status = await buildTwilioVoiceSetupStatus(options, {
			query,
			request,
			streamPath,
			twimlPath,
			webhookPath
		});

		if (query.format === 'html') {
			return new Response(
				renderTwilioVoiceSetupHTML(
					status,
					options.setup?.title ?? 'AbsoluteJS Twilio Voice Setup'
				),
				{
					headers: {
						'content-type': 'text/html; charset=utf-8'
					}
				}
			);
		}

		return status;
	});

	if (!smokePath) {
		return withSetup;
	}

	return withSetup.get(smokePath, async ({ query, request }) => {
		const report = await runTwilioVoiceSmokeTest({
			app,
			options,
			query,
			request,
			streamPath,
			twimlPath,
			webhookPath
		});

		if (query.format === 'html') {
			return new Response(
				renderTwilioVoiceSmokeHTML(
					report,
					options.smoke?.title ?? 'AbsoluteJS Twilio Voice Smoke Test'
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
