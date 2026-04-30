import { Elysia } from 'elysia';
import {
	buildMediaTelephonyStreamLifecycleReport,
	createTelephonyMediaSerializer,
	parseTelephonyMediaFrame,
	serializeTelephonyMediaFrame
} from '@absolutejs/media';
import type {
	MediaFrame,
	MediaTelephonyCarrier,
	MediaTelephonyEnvelope,
	MediaTelephonyStreamLifecycleReport
} from '@absolutejs/media';
import type { VoiceTraceEventStore } from './trace';

export type VoiceTelephonyMediaStatus = 'fail' | 'pass';

export type VoiceTelephonyMediaCarrierInput = {
	carrier: MediaTelephonyCarrier;
	envelope?: MediaTelephonyEnvelope;
	lifecycleEnvelopes?: readonly MediaTelephonyEnvelope[];
};

export type VoiceTelephonyMediaCarrierReport = {
	audioBytes: number;
	carrier: MediaTelephonyCarrier;
	frame?: MediaFrame;
	issues: string[];
	lifecycle: MediaTelephonyStreamLifecycleReport;
	serialized?: MediaTelephonyEnvelope;
	status: VoiceTelephonyMediaStatus;
};

export type VoiceTelephonyMediaReport = {
	carriers: readonly VoiceTelephonyMediaCarrierReport[];
	checkedAt: number;
	issues: string[];
	status: VoiceTelephonyMediaStatus;
};

export type VoiceTelephonyMediaRoutesOptions = {
	carriers?: readonly VoiceTelephonyMediaCarrierInput[];
	headers?: HeadersInit;
	htmlPath?: false | string;
	name?: string;
	path?: string;
	store?: VoiceTraceEventStore;
	title?: string;
};

export type VoiceTelephonyMediaTraceReportOptions = {
	carriers?: readonly MediaTelephonyCarrier[];
	store: VoiceTraceEventStore;
};

const demoPayload = Buffer.from(new Uint8Array([1, 2, 3, 4])).toString('base64');

const demoEnvelope = (carrier: MediaTelephonyCarrier): MediaTelephonyEnvelope => {
	if (carrier === 'twilio') {
		return {
			event: 'media',
			media: {
				chunk: '1',
				payload: demoPayload,
				timestamp: '1000',
				track: 'inbound'
			},
			sequenceNumber: '1',
			streamSid: 'proof-twilio-media'
		};
	}
	if (carrier === 'telnyx') {
		return {
			event: 'media',
			media: {
				payload: demoPayload,
				timestamp: 1000,
				track: 'inbound'
			},
			sequence_number: 1,
			stream_id: 'proof-telnyx-media'
		};
	}

	return {
		event: 'media',
		media: {
			payload: demoPayload,
			timestamp: 1000,
			track: 'inbound'
		},
		sequenceNumber: 1,
		streamId: 'proof-plivo-media'
	};
};

const demoLifecycleEnvelopes = (
	carrier: MediaTelephonyCarrier
): readonly MediaTelephonyEnvelope[] => {
	if (carrier === 'twilio') {
		return [
			{
				event: 'start',
				start: {
					streamSid: 'proof-twilio-media'
				}
			},
			demoEnvelope(carrier),
			{
				event: 'stop',
				stop: {
					streamSid: 'proof-twilio-media'
				}
			}
		];
	}
	if (carrier === 'telnyx') {
		return [
			{
				event: 'start',
				stream_id: 'proof-telnyx-media'
			},
			demoEnvelope(carrier),
			{
				event: 'stop',
				stream_id: 'proof-telnyx-media'
			}
		];
	}

	return [
		{
			event: 'start',
			streamId: 'proof-plivo-media'
		},
		demoEnvelope(carrier),
		{
			event: 'stop',
			streamId: 'proof-plivo-media'
		}
	];
};

const byteLength = (audio: MediaFrame['audio']): number => {
	if (!audio) {
		return 0;
	}
	return audio instanceof ArrayBuffer ? audio.byteLength : audio.byteLength;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

export const buildVoiceTelephonyMediaReport = (input: {
	carriers?: readonly VoiceTelephonyMediaCarrierInput[];
} = {}): VoiceTelephonyMediaReport => {
	const carriers = input.carriers ?? [
		{ carrier: 'twilio' },
		{ carrier: 'telnyx' },
		{ carrier: 'plivo' }
	];
	const reports = carriers.map((entry) => {
		const serializer = createTelephonyMediaSerializer({
			carrier: entry.carrier
		});
		const frame =
			serializer.parse(entry.envelope ?? demoEnvelope(entry.carrier)) ??
			parseTelephonyMediaFrame({
				carrier: entry.carrier,
				envelope: entry.envelope ?? demoEnvelope(entry.carrier)
			});
		const serialized = frame
			? serializer.serialize(frame) ??
				serializeTelephonyMediaFrame({
					carrier: entry.carrier,
					frame
				})
			: undefined;
		const lifecycle = buildMediaTelephonyStreamLifecycleReport({
			carrier: entry.carrier,
			envelopes: entry.lifecycleEnvelopes ?? demoLifecycleEnvelopes(entry.carrier)
		});
		const audioBytes = byteLength(frame?.audio);
		const issues: string[] = [];

		if (!frame) {
			issues.push('Carrier media envelope did not produce a MediaFrame.');
		}
		if (frame && frame.source !== 'telephony') {
			issues.push('Parsed MediaFrame source is not telephony.');
		}
		if (frame && frame.kind !== 'input-audio' && frame.kind !== 'assistant-audio') {
			issues.push('Parsed MediaFrame is not an audio frame.');
		}
		if (audioBytes === 0) {
			issues.push('Parsed MediaFrame has no audio bytes.');
		}
		if (!serialized || typeof serialized !== 'object') {
			issues.push('MediaFrame did not serialize back into a carrier envelope.');
		}
		for (const issue of lifecycle.issues) {
			issues.push(issue.message);
		}

		return {
			audioBytes,
			carrier: entry.carrier,
			frame,
			issues,
			lifecycle,
			serialized,
			status: issues.length === 0 ? 'pass' : 'fail'
		} satisfies VoiceTelephonyMediaCarrierReport;
	});
	const issues = reports.flatMap((report) =>
		report.issues.map((issue) => `${report.carrier}: ${issue}`)
	);

	return {
		carriers: reports,
		checkedAt: Date.now(),
		issues,
		status: issues.length === 0 ? 'pass' : 'fail'
	};
};

export const getLatestVoiceTelephonyMediaReport = async (
	options: VoiceTelephonyMediaTraceReportOptions
): Promise<VoiceTelephonyMediaReport | undefined> => {
	const events = (await options.store.list({ type: 'client.telephony_media' }))
		.filter((event) => {
			const carrier = event.payload.carrier;
			return (
				typeof carrier === 'string' &&
				(!options.carriers ||
					options.carriers.includes(carrier as MediaTelephonyCarrier)) &&
				event.payload.envelope &&
				typeof event.payload.envelope === 'object'
			);
		})
		.sort((left, right) => left.at - right.at);

	if (events.length === 0) {
		return undefined;
	}

	const byCarrier = new Map<MediaTelephonyCarrier, MediaTelephonyEnvelope[]>();
	for (const event of events) {
		const carrier = event.payload.carrier as MediaTelephonyCarrier;
		const envelopes = byCarrier.get(carrier) ?? [];
		envelopes.push(event.payload.envelope as MediaTelephonyEnvelope);
		byCarrier.set(carrier, envelopes);
	}

	return buildVoiceTelephonyMediaReport({
		carriers: [...byCarrier.entries()].map(([carrier, lifecycleEnvelopes]) => ({
			carrier,
			envelope: lifecycleEnvelopes.find((envelope) => {
				const event = envelope.event;
				return typeof event === 'string' && event.toLowerCase() === 'media';
			}),
			lifecycleEnvelopes
		}))
	});
};

export const renderVoiceTelephonyMediaHTML = (
	report: VoiceTelephonyMediaReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'Voice Telephony Media Proof';
	const rows = report.carriers
		.map(
			(carrier) =>
				`<tr><td>${escapeHtml(carrier.carrier)}</td><td>${escapeHtml(carrier.status)}</td><td>${String(carrier.audioBytes)}</td><td>${String(carrier.lifecycle.mediaEvents)}</td><td>${escapeHtml(carrier.lifecycle.started ? 'yes' : 'no')}</td><td>${escapeHtml(carrier.lifecycle.stopped ? 'yes' : 'no')}</td><td>${escapeHtml(carrier.frame?.kind ?? 'missing')}</td><td>${escapeHtml(carrier.frame?.format?.encoding ?? 'missing')}</td><td>${escapeHtml(carrier.issues.join(' ') || 'none')}</td></tr>`
		)
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#111827;color:#e5e7eb;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:980px;padding:32px}.hero,table{background:#0f172a;border:1px solid #334155;border-radius:20px;margin-bottom:16px}.hero{padding:22px}.eyebrow{color:#67e8f9;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.2rem,6vw,4.5rem);line-height:.92;margin:.2rem 0 1rem}.status{border:1px solid #64748b;border-radius:999px;display:inline-flex;font-weight:900;padding:8px 12px}.pass{color:#86efac}.fail{color:#fecaca}code{color:#bfdbfe}table{border-collapse:collapse;overflow:hidden;width:100%}td,th{border-bottom:1px solid #334155;padding:10px;text-align:left}</style></head><body><main><section class="hero"><p class="eyebrow">Carrier media serializer proof</p><h1>${escapeHtml(title)}</h1><p class="status ${escapeHtml(report.status)}">Status: ${escapeHtml(report.status)}</p><p>Twilio, Telnyx, and Plivo media payload envelopes are parsed into generic <code>MediaFrame</code> objects, serialized back into carrier envelopes, and checked for start/media/stop lifecycle sequencing by <code>@absolutejs/media</code>.</p></section><table><thead><tr><th>Carrier</th><th>Status</th><th>Audio bytes</th><th>Media events</th><th>Started</th><th>Stopped</th><th>Frame kind</th><th>Encoding</th><th>Issues</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
};

export const createVoiceTelephonyMediaRoutes = (
	options: VoiceTelephonyMediaRoutesOptions = {}
) => {
	const path = options.path ?? '/api/voice/telephony/media';
	const htmlPath =
		options.htmlPath === undefined ? '/voice/telephony-media' : options.htmlPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-telephony-media'
	});

	routes.get(path, async () =>
		options.store
			? ((await getLatestVoiceTelephonyMediaReport({
					store: options.store
				})) ?? buildVoiceTelephonyMediaReport({ carriers: options.carriers }))
			: buildVoiceTelephonyMediaReport({ carriers: options.carriers })
	);

	if (htmlPath) {
		routes.get(htmlPath, async () => {
			const report = options.store
				? ((await getLatestVoiceTelephonyMediaReport({
						store: options.store
					})) ?? buildVoiceTelephonyMediaReport({ carriers: options.carriers }))
				: buildVoiceTelephonyMediaReport({
						carriers: options.carriers
					});

			return new Response(renderVoiceTelephonyMediaHTML(report, options), {
				headers: {
					'content-type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		});
	}

	return routes;
};
