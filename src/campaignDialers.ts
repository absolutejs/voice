import { Buffer } from 'node:buffer';
import type {
	VoiceCampaignDialer,
	VoiceCampaignDialerInput,
	VoiceCampaignDialerResult
} from './campaign';

type VoiceCampaignDialerFetch = (
	input: string | URL | Request,
	init?: RequestInit
) => Promise<Response>;

type VoiceCampaignDialerMetadataInput = VoiceCampaignDialerInput & {
	provider: 'plivo' | 'telnyx' | 'twilio';
};

type VoiceCampaignDialerMetadata =
	| Record<string, string | number | boolean | undefined>
	| ((input: VoiceCampaignDialerMetadataInput) =>
			| Record<string, string | number | boolean | undefined>
			| Promise<Record<string, string | number | boolean | undefined>>);

type VoiceCampaignURLInput = {
	attempt: VoiceCampaignDialerInput['attempt'];
	campaign: VoiceCampaignDialerInput['campaign'];
	recipient: VoiceCampaignDialerInput['recipient'];
};

type VoiceCampaignURLResolver =
	| string
	| ((input: VoiceCampaignURLInput) => string | Promise<string>);

export type VoiceTwilioCampaignDialerOptions = {
	accountSid: string;
	answerMethod?: 'GET' | 'POST';
	answerUrl: VoiceCampaignURLResolver;
	apiBaseUrl?: string;
	authToken: string;
	fetch?: VoiceCampaignDialerFetch;
	from: string;
	machineDetection?: string;
	metadata?: VoiceCampaignDialerMetadata;
	statusCallbackEvents?: string[];
	statusCallbackMethod?: 'GET' | 'POST';
	statusCallbackUrl?: VoiceCampaignURLResolver;
};

export type VoiceTelnyxCampaignDialerOptions = {
	apiBaseUrl?: string;
	apiKey: string;
	clientState?: VoiceCampaignDialerMetadata;
	connectionId: string;
	fetch?: VoiceCampaignDialerFetch;
	from: string;
	webhookUrl?: VoiceCampaignURLResolver;
	webhookUrlMethod?: 'GET' | 'POST';
};

export type VoicePlivoCampaignDialerOptions = {
	answerMethod?: 'GET' | 'POST';
	answerUrl: VoiceCampaignURLResolver;
	apiBaseUrl?: string;
	authId: string;
	authToken: string;
	callbackMethod?: 'GET' | 'POST';
	callbackUrl?: VoiceCampaignURLResolver;
	fetch?: VoiceCampaignDialerFetch;
	from: string;
	metadata?: VoiceCampaignDialerMetadata;
};

const resolveFetch = (fetcher?: VoiceCampaignDialerFetch) => {
	const activeFetch = fetcher ?? globalThis.fetch;
	if (!activeFetch) {
		throw new Error('Campaign dialer requires fetch or globalThis.fetch.');
	}
	return activeFetch;
};

const resolveURL = async (
	resolver: VoiceCampaignURLResolver | undefined,
	input: VoiceCampaignURLInput
) => {
	if (!resolver) {
		return undefined;
	}
	return typeof resolver === 'function' ? await resolver(input) : resolver;
};

const baseCampaignMetadata = (input: VoiceCampaignDialerInput) => ({
	attemptId: input.attempt.id,
	campaignId: input.campaign.id,
	recipientId: input.recipient.id,
	voiceCampaignAttemptId: input.attempt.id,
	voiceCampaignId: input.campaign.id,
	voiceCampaignRecipientId: input.recipient.id
});

const resolveMetadata = async (
	metadata: VoiceCampaignDialerMetadata | undefined,
	input: VoiceCampaignDialerMetadataInput
) => ({
	...baseCampaignMetadata(input),
	...(typeof metadata === 'function' ? await metadata(input) : metadata)
});

const appendQuery = (
	url: string | undefined,
	params: Record<string, string | number | boolean | undefined>
) => {
	if (!url) {
		return undefined;
	}
	const parsed = new URL(url);
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) {
			parsed.searchParams.set(key, String(value));
		}
	}
	return parsed.toString();
};

const readJson = async (response: Response) => {
	const text = await response.text();
	if (!text.trim()) {
		return {};
	}
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return {
			text
		};
	}
};

const assertOk = async (response: Response, provider: string) => {
	const body = await readJson(response);
	if (!response.ok) {
		throw new Error(
			`${provider} campaign dialer failed with ${response.status}: ${JSON.stringify(body)}`
		);
	}
	return body;
};

const firstString = (values: unknown[]) => {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
};

const formBody = (values: Record<string, unknown>) => {
	const body = new URLSearchParams();
	for (const [key, value] of Object.entries(values)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item !== undefined) {
					body.append(key, String(item));
				}
			}
			continue;
		}
		if (value !== undefined) {
			body.set(key, String(value));
		}
	}
	return body;
};

export const createVoiceTwilioCampaignDialer = (
	options: VoiceTwilioCampaignDialerOptions
): VoiceCampaignDialer => async (input) => {
	const fetcher = resolveFetch(options.fetch);
	const metadata = await resolveMetadata(options.metadata, {
		...input,
		provider: 'twilio'
	});
	const answerUrl = appendQuery(await resolveURL(options.answerUrl, input), metadata);
	const statusCallbackUrl = appendQuery(
		await resolveURL(options.statusCallbackUrl, input),
		metadata
	);
	const response = await fetcher(
		`${options.apiBaseUrl ?? 'https://api.twilio.com'}/2010-04-01/Accounts/${encodeURIComponent(options.accountSid)}/Calls.json`,
		{
			body: formBody({
				From: options.from,
				MachineDetection: options.machineDetection,
				Method: options.answerMethod,
				StatusCallback: statusCallbackUrl,
				StatusCallbackEvent: options.statusCallbackEvents,
				StatusCallbackMethod: options.statusCallbackMethod,
				To: input.recipient.phone,
				Url: answerUrl
			}),
			headers: {
				authorization: `Basic ${Buffer.from(`${options.accountSid}:${options.authToken}`).toString('base64')}`,
				'content-type': 'application/x-www-form-urlencoded'
			},
			method: 'POST'
		}
	);
	const body = await assertOk(response, 'Twilio');
	return {
		externalCallId: firstString([body.sid, body.callSid, body.call_sid]),
		metadata: {
			provider: 'twilio',
			response: body
		},
		status: 'running'
	} satisfies VoiceCampaignDialerResult;
};

export const createVoiceTelnyxCampaignDialer = (
	options: VoiceTelnyxCampaignDialerOptions
): VoiceCampaignDialer => async (input) => {
	const fetcher = resolveFetch(options.fetch);
	const metadata = await resolveMetadata(options.clientState, {
		...input,
		provider: 'telnyx'
	});
	const webhookUrl = appendQuery(await resolveURL(options.webhookUrl, input), metadata);
	const response = await fetcher(`${options.apiBaseUrl ?? 'https://api.telnyx.com'}/v2/calls`, {
		body: JSON.stringify({
			client_state: Buffer.from(JSON.stringify(metadata)).toString('base64'),
			connection_id: options.connectionId,
			from: options.from,
			to: input.recipient.phone,
			webhook_url: webhookUrl,
			webhook_url_method: options.webhookUrlMethod
		}),
		headers: {
			authorization: `Bearer ${options.apiKey}`,
			'content-type': 'application/json'
		},
		method: 'POST'
	});
	const body = await assertOk(response, 'Telnyx');
	const data = (typeof body.data === 'object' && body.data !== null
		? body.data
		: body) as Record<string, unknown>;
	return {
		externalCallId: firstString([
			data.call_control_id,
			data.call_session_id,
			data.call_leg_id,
			body.call_control_id,
			body.call_session_id
		]),
		metadata: {
			provider: 'telnyx',
			response: body
		},
		status: 'running'
	} satisfies VoiceCampaignDialerResult;
};

export const createVoicePlivoCampaignDialer = (
	options: VoicePlivoCampaignDialerOptions
): VoiceCampaignDialer => async (input) => {
	const fetcher = resolveFetch(options.fetch);
	const metadata = await resolveMetadata(options.metadata, {
		...input,
		provider: 'plivo'
	});
	const answerUrl = appendQuery(await resolveURL(options.answerUrl, input), metadata);
	const callbackUrl = appendQuery(await resolveURL(options.callbackUrl, input), metadata);
	const response = await fetcher(
		`${options.apiBaseUrl ?? 'https://api.plivo.com'}/v1/Account/${encodeURIComponent(options.authId)}/Call/`,
		{
			body: formBody({
				answer_method: options.answerMethod,
				answer_url: answerUrl,
				callback_method: options.callbackMethod,
				callback_url: callbackUrl,
				from: options.from,
				to: input.recipient.phone
			}),
			headers: {
				authorization: `Basic ${Buffer.from(`${options.authId}:${options.authToken}`).toString('base64')}`,
				'content-type': 'application/x-www-form-urlencoded'
			},
			method: 'POST'
		}
	);
	const body = await assertOk(response, 'Plivo');
	return {
		externalCallId: firstString([
			body.request_uuid,
			body.requestUuid,
			body.call_uuid,
			body.callUuid
		]),
		metadata: {
			provider: 'plivo',
			response: body
		},
		status: 'running'
	} satisfies VoiceCampaignDialerResult;
};
