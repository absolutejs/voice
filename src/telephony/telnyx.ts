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
import type { VoiceServerMessage, VoiceSessionRecord } from '../types';
import {
	createTwilioMediaStreamBridge,
	type TwilioInboundMessage,
	type TwilioMediaStreamBridgeOptions,
	type TwilioMediaStreamSocket,
	type TwilioOutboundMessage
} from './twilio';

export type TelnyxMediaPayload = {
	chunk?: string;
	payload: string;
	timestamp?: string;
	track?: 'inbound' | 'outbound' | 'inbound_track' | 'outbound_track';
};

export type TelnyxInboundMessage =
	| {
			event: 'connected';
			version?: string;
	  }
	| {
			event: 'start';
			sequence_number?: string;
			start?: {
				call_control_id?: string;
				call_leg_id?: string;
				call_session_id?: string;
				custom_parameters?: Record<string, string>;
				media_format?: {
					channels?: number;
					encoding?: string;
					sample_rate?: number;
				};
				user_id?: string;
			};
			stream_id?: string;
	  }
	| {
			event: 'media';
			media: TelnyxMediaPayload;
			sequence_number?: string;
			stream_id?: string;
	  }
	| {
			event: 'mark';
			mark?: {
				name?: string;
			};
			sequence_number?: string;
			stream_id?: string;
	  }
	| {
			event: 'dtmf';
			dtmf?: {
				digit?: string;
			};
			sequence_number?: string;
			stream_id?: string;
	  }
	| {
			event: 'error';
			payload?: {
				code?: number;
				detail?: string;
				title?: string;
			};
			stream_id?: string;
	  }
	| {
			event: 'stop';
			sequence_number?: string;
			stop?: {
				call_control_id?: string;
				user_id?: string;
			};
			stream_id?: string;
	  };

export type TelnyxOutboundMediaMessage = {
	event: 'media';
	media: {
		payload: string;
	};
};

export type TelnyxOutboundClearMessage = {
	event: 'clear';
};

export type TelnyxOutboundMarkMessage = {
	event: 'mark';
	mark: {
		name: string;
	};
};

export type TelnyxOutboundMessage =
	| TelnyxOutboundMediaMessage
	| TelnyxOutboundClearMessage
	| TelnyxOutboundMarkMessage;

export type TelnyxMediaStreamSocket = {
	close: (code?: number, reason?: string) => void | Promise<void>;
	send: (data: string) => void | Promise<void>;
};

export type TelnyxMediaStreamBridgeOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = Omit<TwilioMediaStreamBridgeOptions<TContext, TSession, TResult>, 'onVoiceMessage'> & {
	onVoiceMessage?: (input: {
		callControlId?: string;
		message: VoiceServerMessage<TResult>;
		sessionId: string;
		streamId?: string;
	}) => Promise<void> | void;
};

export type TelnyxMediaStreamBridge = {
	close: (reason?: string) => Promise<void>;
	getSessionId: () => string | null;
	getStreamId: () => string | null;
	handleMessage: (raw: string | TelnyxInboundMessage) => Promise<void>;
};

export type TelnyxVoiceResponseOptions = {
	bidirectionalCodec?: 'AMR-WB' | 'G722' | 'OPUS' | 'PCMA' | 'PCMU';
	bidirectionalMode?: 'mp3' | 'rtp';
	codec?: 'AMR-WB' | 'G722' | 'OPUS' | 'PCMA' | 'PCMU' | 'default';
	streamName?: string;
	streamUrl: string;
	track?: 'both_tracks' | 'inbound_track' | 'outbound_track';
};

export type TelnyxVoiceSetupStatus = VoiceTelephonySetupStatus<'telnyx'> & {
	urls: VoiceTelephonySetupStatus<'telnyx'>['urls'] & {
		texml: string;
	};
};

export type TelnyxVoiceSetupOptions = {
	path?: false | string;
	requiredEnv?: Record<string, string | undefined>;
	title?: string;
};

export type TelnyxVoiceSmokeCheck = VoiceTelephonySmokeCheck;

export type TelnyxVoiceSmokeReport = VoiceTelephonySmokeReport<'telnyx'> & {
	contract: VoiceTelephonyContractReport<'telnyx'>;
	setup: TelnyxVoiceSetupStatus;
	texml?: {
		status: number;
		streamUrl?: string;
	};
};

export type TelnyxVoiceSmokeOptions = {
	callControlId?: string;
	callLegId?: string;
	eventType?: string;
	path?: false | string;
	sessionId?: string;
	title?: string;
};

export type TelnyxVoiceRoutesOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	bridge?: TelnyxMediaStreamBridgeOptions<TContext, TSession, TResult>;
	context?: TContext;
	name?: string;
	outcomePolicy?: VoiceTelephonyOutcomePolicy;
	setup?: TelnyxVoiceSetupOptions;
	smoke?: TelnyxVoiceSmokeOptions;
	streamPath?: string;
	texml?: {
		path?: string;
		response?: Omit<TelnyxVoiceResponseOptions, 'streamUrl'>;
		streamUrl?:
			| string
			| ((input: {
					query: Record<string, unknown>;
					request: Request;
					streamPath: string;
			  }) => Promise<string> | string);
	};
	webhook?: Omit<
		VoiceTelephonyWebhookRoutesOptions<TContext, TSession, TResult>,
		'context' | 'path' | 'policy' | 'provider'
	> & {
		path?: string;
		policy?: VoiceTelephonyOutcomePolicy;
		publicKey?: string;
		toleranceSeconds?: number;
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

const extractTelnyxStreamUrl = (texml: string) =>
	texml.match(/<Stream\b[^>]*\surl="([^"]+)"/i)?.[1]?.replaceAll('&amp;', '&');

const createSmokeCheck = (
	name: string,
	status: TelnyxVoiceSmokeCheck['status'],
	message?: string,
	details?: Record<string, unknown>
): TelnyxVoiceSmokeCheck => ({
	details,
	message,
	name,
	status
});

const resolveTelnyxStreamUrl = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	options: TelnyxVoiceRoutesOptions<TContext, TSession, TResult>,
	input: {
		query: Record<string, unknown>;
		request: Request;
		streamPath: string;
	}
) => {
	if (typeof options.texml?.streamUrl === 'function') {
		return options.texml.streamUrl(input);
	}

	if (typeof options.texml?.streamUrl === 'string') {
		return options.texml.streamUrl;
	}

	const origin = resolveRequestOrigin(input.request);
	const wsOrigin = origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
	return `${wsOrigin}${input.streamPath}`;
};

export const createTelnyxVoiceResponse = (
	options: TelnyxVoiceResponseOptions
) => {
	const attributes = [
		`url="${escapeXml(options.streamUrl)}"`,
		options.streamName ? `name="${escapeXml(options.streamName)}"` : undefined,
		options.track ? `track="${escapeXml(options.track)}"` : undefined,
		options.codec ? `codec="${escapeXml(options.codec)}"` : undefined,
		options.bidirectionalMode
			? `bidirectionalMode="${escapeXml(options.bidirectionalMode)}"`
			: undefined,
		options.bidirectionalCodec
			? `bidirectionalCodec="${escapeXml(options.bidirectionalCodec)}"`
			: undefined
	]
		.filter((value): value is string => Boolean(value))
		.join(' ');

	return `<?xml version="1.0" encoding="UTF-8"?><Response><Start><Stream ${attributes} /></Start></Response>`;
};

const parseTelnyxMessage = (raw: string | TelnyxInboundMessage) => {
	if (typeof raw !== 'string') {
		return raw;
	}

	return JSON.parse(raw) as TelnyxInboundMessage;
};

const normalizeTelnyxTrack = (track: TelnyxMediaPayload['track']) =>
	track === 'outbound' || track === 'outbound_track' ? 'outbound' : 'inbound';

const telnyxToTwilioMessage = (
	message: TelnyxInboundMessage
): TwilioInboundMessage | null => {
	switch (message.event) {
		case 'connected':
			return {
				event: 'connected',
				version: message.version
			};
		case 'start': {
			const streamSid = message.stream_id ?? 'telnyx-stream';
			return {
				event: 'start',
				start: {
					callSid:
						message.start?.call_control_id ??
						message.start?.call_session_id ??
						message.start?.call_leg_id,
					customParameters: {
						...(message.start?.custom_parameters ?? {}),
						...(message.start?.call_session_id
							? { sessionId: message.start.call_session_id }
							: {})
					},
					mediaFormat: {
						channels: message.start?.media_format?.channels,
						encoding: message.start?.media_format?.encoding,
						sampleRate: message.start?.media_format?.sample_rate
					},
					streamSid
				},
				streamSid
			};
		}
		case 'media': {
			const streamSid = message.stream_id ?? 'telnyx-stream';
			return {
				event: 'media',
				media: {
					chunk: message.media.chunk,
					payload: message.media.payload,
					timestamp: message.media.timestamp,
					track: normalizeTelnyxTrack(message.media.track)
				},
				streamSid
			};
		}
		case 'mark':
			return {
				event: 'mark',
				mark: message.mark,
				streamSid: message.stream_id ?? 'telnyx-stream'
			};
		case 'stop':
			return {
				event: 'stop',
				stop: {
					callSid: message.stop?.call_control_id
				},
				streamSid: message.stream_id ?? 'telnyx-stream'
			};
		case 'dtmf':
		case 'error':
			return null;
	}
};

const createTelnyxTwilioSocketAdapter = (
	socket: TelnyxMediaStreamSocket
): TwilioMediaStreamSocket => ({
	close: (code, reason) => socket.close(code, reason),
	send: async (data) => {
		const message = JSON.parse(data) as TwilioOutboundMessage;
		const telnyxMessage: TelnyxOutboundMessage | null =
			message.event === 'media'
				? {
						event: 'media',
						media: {
							payload: message.media.payload
						}
				  }
				: message.event === 'clear'
					? {
							event: 'clear'
					  }
					: message.event === 'mark'
						? {
								event: 'mark',
								mark: message.mark
						  }
						: null;

		if (telnyxMessage) {
			await Promise.resolve(socket.send(JSON.stringify(telnyxMessage)));
		}
	}
});

export const createTelnyxMediaStreamBridge = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	socket: TelnyxMediaStreamSocket,
	options: TelnyxMediaStreamBridgeOptions<TContext, TSession, TResult>
): TelnyxMediaStreamBridge => {
	const bridge = createTwilioMediaStreamBridge(
		createTelnyxTwilioSocketAdapter(socket),
		{
			...(options as TwilioMediaStreamBridgeOptions<TContext, TSession, TResult>),
			onVoiceMessage: options.onVoiceMessage
				? (input) =>
						options.onVoiceMessage?.({
							callControlId: input.callSid,
							message: input.message,
							sessionId: input.sessionId,
							streamId: input.streamSid
						})
				: undefined
		}
	);

	return {
		close: bridge.close,
		getSessionId: bridge.getSessionId,
		getStreamId: bridge.getStreamSid,
		handleMessage: async (raw) => {
			const message = telnyxToTwilioMessage(parseTelnyxMessage(raw));
			if (message) {
				await bridge.handleMessage(message);
			}
		}
	};
};

const decodeBase64 = (value: string) =>
	Uint8Array.from(Buffer.from(value, 'base64'));

export const verifyVoiceTelnyxWebhookSignature = async (input: {
	body: string;
	headers: Headers;
	publicKey?: string;
	toleranceSeconds?: number;
}): Promise<VoiceTelephonyWebhookVerificationResult> => {
	if (!input.publicKey) {
		return { ok: false, reason: 'missing-secret' };
	}

	const signature = input.headers.get('telnyx-signature-ed25519');
	const timestamp = input.headers.get('telnyx-timestamp');
	if (!signature || !timestamp) {
		return { ok: false, reason: 'missing-signature' };
	}

	const toleranceSeconds = input.toleranceSeconds ?? 300;
	const timestampNumber = Number(timestamp);
	if (
		Number.isFinite(timestampNumber) &&
		Math.abs(Date.now() / 1_000 - timestampNumber) > toleranceSeconds
	) {
		return { ok: false, reason: 'invalid-signature' };
	}

	try {
		const key = await crypto.subtle.importKey(
			'raw',
			decodeBase64(input.publicKey),
			'Ed25519',
			false,
			['verify']
		);
		const ok = await crypto.subtle.verify(
			'Ed25519',
			key,
			decodeBase64(signature),
			new TextEncoder().encode(`${timestamp}|${input.body}`)
		);
		return ok ? { ok: true } : { ok: false, reason: 'invalid-signature' };
	} catch {
		return { ok: false, reason: 'invalid-signature' };
	}
};

const buildTelnyxVoiceSetupStatus = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	options: TelnyxVoiceRoutesOptions<TContext, TSession, TResult>,
	input: {
		query: Record<string, unknown>;
		request: Request;
		streamPath: string;
		texmlPath: string;
		webhookPath: string;
	}
): Promise<TelnyxVoiceSetupStatus> => {
	const origin = resolveRequestOrigin(input.request);
	const stream = await resolveTelnyxStreamUrl(options, input);
	const texml = joinUrlPath(origin, input.texmlPath);
	const webhook = joinUrlPath(origin, input.webhookPath);
	const missing = Object.entries(options.setup?.requiredEnv ?? {})
		.filter((entry) => !entry[1])
		.map(([name]) => name);
	const signingConfigured = Boolean(
		options.webhook?.publicKey || options.webhook?.verify
	);
	const warnings = [
		...(stream.startsWith('wss://')
			? []
			: ['Telnyx media streams should use wss:// in production.']),
		...(signingConfigured
			? []
			: ['Webhook signature verification is not configured.'])
	];

	return {
		generatedAt: Date.now(),
		missing,
		provider: 'telnyx',
		ready: missing.length === 0 && signingConfigured && warnings.length === 0,
		signing: {
			configured: signingConfigured,
			mode: options.webhook?.verify
				? 'custom'
				: options.webhook?.publicKey
					? 'provider-signature'
					: 'none',
			verificationUrl: webhook
		},
		urls: {
			stream,
			texml,
			webhook
		},
		warnings
	};
};

const renderTelnyxSetupHTML = (
	status: TelnyxVoiceSetupStatus,
	title: string
) => `<main style="font-family: ui-sans-serif, system-ui; max-width: 860px; margin: 40px auto; padding: 0 20px;">
<p style="letter-spacing: .12em; text-transform: uppercase; color: #52606d;">Telnyx setup</p>
<h1>${escapeHtml(title)}</h1>
<p><strong>Status:</strong> ${status.ready ? 'Ready' : 'Needs attention'}</p>
<ul>
<li><strong>TeXML:</strong> <code>${escapeHtml(status.urls.texml)}</code></li>
<li><strong>Media stream:</strong> <code>${escapeHtml(status.urls.stream)}</code></li>
<li><strong>Status webhook:</strong> <code>${escapeHtml(status.urls.webhook)}</code></li>
</ul>
${status.missing.length ? `<h2>Missing env</h2><ul>${status.missing.map((name) => `<li><code>${escapeHtml(name)}</code></li>`).join('')}</ul>` : ''}
${status.warnings.length ? `<h2>Warnings</h2><ul>${status.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</main>`;

const renderTelnyxSmokeHTML = (
	report: TelnyxVoiceSmokeReport,
	title: string
) => `<main style="font-family: ui-sans-serif, system-ui; max-width: 860px; margin: 40px auto; padding: 0 20px;">
<p style="letter-spacing: .12em; text-transform: uppercase; color: #52606d;">Telnyx smoke test</p>
<h1>${escapeHtml(title)}</h1>
<p><strong>Status:</strong> ${report.pass ? 'Pass' : 'Fail'}</p>
<ul>${report.checks.map((check) => `<li><strong>${escapeHtml(check.name)}</strong>: ${escapeHtml(check.status)}${check.message ? ` - ${escapeHtml(check.message)}` : ''}</li>`).join('')}</ul>
</main>`;

const runTelnyxSmokeTest = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(input: {
	app: {
		handle: (request: Request) => Response | Promise<Response>;
	};
	options: TelnyxVoiceRoutesOptions<TContext, TSession, TResult>;
	query: Record<string, unknown>;
	request: Request;
	streamPath: string;
	texmlPath: string;
	webhookPath: string;
}): Promise<TelnyxVoiceSmokeReport> => {
	const setup = await buildTelnyxVoiceSetupStatus(input.options, input);
	const checks: TelnyxVoiceSmokeCheck[] = [];
	const texmlResponse = await input.app.handle(new Request(setup.urls.texml));
	const texml = await texmlResponse.text();
	const streamUrl = extractTelnyxStreamUrl(texml);
	checks.push(
		createSmokeCheck(
			'texml',
			texmlResponse.ok && Boolean(streamUrl) ? 'pass' : 'fail',
			streamUrl ? 'TeXML includes a media stream URL.' : 'TeXML is missing <Stream url="...">.',
			{
				status: texmlResponse.status,
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
				: 'Media stream URL should use wss:// for Telnyx.',
			{
				streamUrl
			}
		)
	);

	const webhookBody = {
		data: {
			event_type: input.options.smoke?.eventType ?? 'call.hangup',
			id: 'telnyx-smoke-event',
			payload: {
				call_control_id:
					input.options.smoke?.callControlId ?? 'telnyx-smoke-call',
				call_leg_id: input.options.smoke?.callLegId ?? 'telnyx-smoke-leg',
				call_session_id:
					input.options.smoke?.sessionId ?? 'telnyx-smoke-session',
				hangup_cause: 'busy',
				sip_hangup_cause: 486
			},
			record_type: 'event'
		}
	};
	const webhookResponse = await input.app.handle(
		new Request(setup.urls.webhook, {
			body: JSON.stringify(webhookBody),
			headers: {
				'content-type': 'application/json'
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
				? 'Synthetic Telnyx event was accepted.'
				: 'Synthetic Telnyx event failed.',
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
		checks,
		generatedAt: Date.now(),
		pass: checks.every((check) => check.status !== 'fail'),
		provider: 'telnyx' as const,
		setup,
		texml: {
			status: texmlResponse.status,
			streamUrl
		},
		twiml: {
			status: texmlResponse.status,
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

export const createTelnyxVoiceRoutes = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: TelnyxVoiceRoutesOptions<TContext, TSession, TResult> = {}
) => {
	const streamPath = options.streamPath ?? '/api/voice/telnyx/stream';
	const texmlPath = options.texml?.path ?? '/api/voice/telnyx';
	const webhookPath = options.webhook?.path ?? '/api/voice/telnyx/webhook';
	const setupPath =
		options.setup?.path === false
			? false
			: options.setup?.path ?? '/api/voice/telnyx/setup';
	const smokePath =
		options.smoke?.path === false
			? false
			: options.smoke?.path ?? '/api/voice/telnyx/smoke';
	const bridges = new WeakMap<object, TelnyxMediaStreamBridge>();
	const webhookPolicy =
		options.webhook?.policy ??
		options.outcomePolicy ??
		createVoiceTelephonyOutcomePolicy();
	const verify =
		options.webhook?.verify ??
		(options.webhook?.publicKey
			? ((input: {
					rawBody: string;
					headers: Headers;
			  }) =>
					verifyVoiceTelnyxWebhookSignature({
						body: input.rawBody,
						headers: input.headers,
						publicKey: options.webhook?.publicKey,
						toleranceSeconds: options.webhook?.toleranceSeconds
					}))
			: undefined);
	const app = new Elysia({
		name: options.name ?? 'absolutejs-voice-telnyx'
	})
		.get(texmlPath, async ({ query, request }) => {
			const streamUrl = await resolveTelnyxStreamUrl(options, {
				query,
				request,
				streamPath
			});
			return new Response(
				createTelnyxVoiceResponse({
					...options.texml?.response,
					streamUrl
				}),
				{
					headers: {
						'content-type': 'text/xml; charset=utf-8'
					}
				}
			);
		})
		.post(texmlPath, async ({ query, request }) => {
			const streamUrl = await resolveTelnyxStreamUrl(options, {
				query,
				request,
				streamPath
			});
			return new Response(
				createTelnyxVoiceResponse({
					...options.texml?.response,
					streamUrl
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
				if (!options.bridge) {
					ws.close(1011, 'Telnyx media bridge is not configured.');
					return;
				}

				let bridge = bridges.get(ws as object);
				if (!bridge) {
					bridge = createTelnyxMediaStreamBridge(
						{
							close: (code, reason) => {
								ws.close(code, reason);
							},
							send: (data) => {
								ws.send(data);
							}
						},
						options.bridge
					);
					bridges.set(ws as object, bridge);
				}

				await bridge.handleMessage(raw as string);
			}
		})
		.use(
			createVoiceTelephonyWebhookRoutes({
				...(options.webhook ?? {}),
				context: options.context as TContext,
				path: webhookPath,
				policy: webhookPolicy,
				provider: 'telnyx',
				requireVerification: Boolean(options.webhook?.publicKey),
				resolveSessionId:
					options.webhook?.resolveSessionId ??
					(({ event }) => {
						const metadata = event.metadata;
						return typeof metadata?.call_session_id === 'string'
							? metadata.call_session_id
							: typeof metadata?.callSessionId === 'string'
								? metadata.callSessionId
								: typeof metadata?.call_control_id === 'string'
									? metadata.call_control_id
									: undefined;
					}),
				verify
			})
		);

	const withSetup = setupPath
		? app.get(setupPath, async ({ query, request }) => {
				const status = await buildTelnyxVoiceSetupStatus(options, {
					query,
					request,
					streamPath,
					texmlPath,
					webhookPath
				});
				if (query.format === 'html') {
					return new Response(
						renderTelnyxSetupHTML(
							status,
							options.setup?.title ?? 'AbsoluteJS Telnyx Voice Setup'
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
		const report = await runTelnyxSmokeTest({
			app,
			options,
			query,
			request,
			streamPath,
			texmlPath,
			webhookPath
		});
		if (query.format === 'html') {
			return new Response(
				renderTelnyxSmokeHTML(
					report,
					options.smoke?.title ?? 'AbsoluteJS Telnyx Voice Smoke Test'
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
