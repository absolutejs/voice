import { Elysia } from 'elysia';
import {
	createPlivoVoiceRoutes,
	type PlivoVoiceRoutesOptions
} from './telephony/plivo';
import {
	createTelnyxVoiceRoutes,
	type TelnyxVoiceRoutesOptions
} from './telephony/telnyx';
import {
	createTwilioVoiceRoutes,
	type TwilioVoiceRoutesOptions
} from './telephony/twilio';
import {
	createVoiceTelephonyCarrierMatrixRoutes,
	type VoiceTelephonyCarrierMatrixInput,
	type VoiceTelephonyCarrierMatrixRoutesOptions
} from './telephony/matrix';
import type { VoiceSessionRecord } from './types';

type VoicePhoneAgentCarrierBase = {
	name?: string;
	smokePath?: false | string;
	setupPath?: false | string;
};

export type VoicePhoneAgentTwilioCarrier<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = VoicePhoneAgentCarrierBase & {
	options: TwilioVoiceRoutesOptions<TContext, TSession, TResult>;
	provider: 'twilio';
};

export type VoicePhoneAgentTelnyxCarrier<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = VoicePhoneAgentCarrierBase & {
	options?: TelnyxVoiceRoutesOptions<TContext, TSession, TResult>;
	provider: 'telnyx';
};

export type VoicePhoneAgentPlivoCarrier<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = VoicePhoneAgentCarrierBase & {
	options?: PlivoVoiceRoutesOptions<TContext, TSession, TResult>;
	provider: 'plivo';
};

export type VoicePhoneAgentCarrier<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> =
	| VoicePhoneAgentTwilioCarrier<TContext, TSession, TResult>
	| VoicePhoneAgentTelnyxCarrier<TContext, TSession, TResult>
	| VoicePhoneAgentPlivoCarrier<TContext, TSession, TResult>;

export type VoicePhoneAgentRoutesOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	carriers: readonly VoicePhoneAgentCarrier<TContext, TSession, TResult>[];
	matrix?: false | Omit<VoiceTelephonyCarrierMatrixRoutesOptions, 'load'>;
	name?: string;
};

export type VoicePhoneAgentRoutes = {
	carriers: {
		name?: string;
		provider: 'plivo' | 'telnyx' | 'twilio';
		setupPath?: false | string;
		smokePath?: false | string;
	}[];
	matrixPath?: string;
	routes: Elysia;
};

const defaultSetupPath = (provider: VoicePhoneAgentCarrier['provider']) =>
	`/api/voice/${provider}/setup`;

const defaultSmokePath = (provider: VoicePhoneAgentCarrier['provider']) =>
	`/api/voice/${provider}/smoke`;

const resolveSetupPath = <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	carrier: VoicePhoneAgentCarrier<TContext, TSession, TResult>
) => {
	if (carrier.setupPath !== undefined) {
		return carrier.setupPath;
	}

	if (carrier.provider === 'twilio') {
		return carrier.options.setup?.path === false
			? false
			: carrier.options.setup?.path ?? defaultSetupPath(carrier.provider);
	}

	return carrier.options?.setup?.path === false
		? false
		: carrier.options?.setup?.path ?? defaultSetupPath(carrier.provider);
};

const resolveSmokePath = <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	carrier: VoicePhoneAgentCarrier<TContext, TSession, TResult>
) => {
	if (carrier.smokePath !== undefined) {
		return carrier.smokePath;
	}

	if (carrier.provider === 'twilio') {
		return carrier.options.smoke?.path === false
			? false
			: carrier.options.smoke?.path ?? defaultSmokePath(carrier.provider);
	}

	return carrier.options?.smoke?.path === false
		? false
		: carrier.options?.smoke?.path ?? defaultSmokePath(carrier.provider);
};

const fetchJson = async <TValue>(origin: string, path: string) => {
	const response = await fetch(new URL(path, origin).toString(), {
		headers: {
			accept: 'application/json'
		}
	});

	if (!response.ok) {
		return undefined;
	}

	return (await response.json()) as TValue;
};

const loadCarrierMatrixInputs = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(input: {
	carriers: readonly VoicePhoneAgentCarrier<TContext, TSession, TResult>[];
	request: Request;
}) => {
	const origin = new URL(input.request.url).origin;
	const entries: VoiceTelephonyCarrierMatrixInput[] = [];

	for (const carrier of input.carriers) {
		const setupPath = resolveSetupPath(carrier);

		if (!setupPath) {
			continue;
		}

		const setup = await fetchJson<VoiceTelephonyCarrierMatrixInput['setup']>(
			origin,
			setupPath
		);

		if (!setup) {
			continue;
		}

		const smokePath = resolveSmokePath(carrier);
		const smoke = smokePath
			? await fetchJson<VoiceTelephonyCarrierMatrixInput['smoke']>(
					origin,
					smokePath
				)
			: undefined;

		entries.push({
			name: carrier.name,
			setup,
			smoke
		});
	}

	return entries;
};

export const createVoicePhoneAgent = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: VoicePhoneAgentRoutesOptions<TContext, TSession, TResult>
): VoicePhoneAgentRoutes => {
	const carrierSummaries = options.carriers.map((carrier) => ({
		name: carrier.name,
		provider: carrier.provider,
		setupPath: resolveSetupPath(carrier),
		smokePath: resolveSmokePath(carrier)
	}));
	const app = new Elysia({
		name: options.name ?? 'absolutejs-voice-phone-agent'
	});

	for (const carrier of options.carriers) {
		switch (carrier.provider) {
			case 'twilio':
				app.use(createTwilioVoiceRoutes(carrier.options));
				break;
			case 'telnyx':
				app.use(createTelnyxVoiceRoutes(carrier.options));
				break;
			case 'plivo':
				app.use(createPlivoVoiceRoutes(carrier.options));
				break;
		}
	}

	const matrixPath =
		options.matrix === false
			? undefined
			: options.matrix?.path ?? '/api/voice/phone/carriers';

	if (options.matrix !== false) {
		app.use(
			createVoiceTelephonyCarrierMatrixRoutes({
				...(options.matrix ?? {}),
				path: matrixPath,
				load: ({ request }) =>
					loadCarrierMatrixInputs({
						carriers: options.carriers,
						request
					})
			})
		);
	}

	return {
		carriers: carrierSummaries,
		matrixPath,
		routes: app
	};
};
