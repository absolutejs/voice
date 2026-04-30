import { Elysia } from 'elysia';
import type { VoiceRealtimeChannelReport } from './realtimeChannel';

export type VoiceRealtimeProviderContractStatus = 'fail' | 'pass' | 'warn';

export type VoiceRealtimeProviderContractCapability =
	| 'barge-in'
	| 'browser-format-negotiation'
	| 'duplex-audio'
	| 'first-audio-latency'
	| 'raw-pcm'
	| 'reconnect'
	| 'trace-evidence'
	| 'turn-commit';

export type VoiceRealtimeProviderContractDefinition<
	TProvider extends string = string
> = {
	capabilities?: readonly VoiceRealtimeProviderContractCapability[];
	configured?: boolean;
	env?: Record<string, string | undefined>;
	fallbackProviders?: readonly TProvider[];
	implementationStatus?: 'available' | 'planned';
	latencyBudgetMs?: number;
	provider: TProvider;
	readinessHref?: string;
	realtimeChannel?: VoiceRealtimeChannelReport;
	requiredCapabilities?: readonly VoiceRealtimeProviderContractCapability[];
	requiredEnv?: readonly string[];
	selected?: boolean;
	traceHref?: string;
};

export type VoiceRealtimeProviderContractCheck = {
	detail?: string;
	key: string;
	label: string;
	status: VoiceRealtimeProviderContractStatus;
};

export type VoiceRealtimeProviderContractRow<TProvider extends string = string> = {
	checks: VoiceRealtimeProviderContractCheck[];
	configured: boolean;
	provider: TProvider;
	selected: boolean;
	status: VoiceRealtimeProviderContractStatus;
};

export type VoiceRealtimeProviderContractMatrixInput<
	TProvider extends string = string
> = {
	contracts: readonly VoiceRealtimeProviderContractDefinition<TProvider>[];
};

export type VoiceRealtimeProviderContractMatrixReport<
	TProvider extends string = string
> = {
	failed: number;
	passed: number;
	rows: VoiceRealtimeProviderContractRow<TProvider>[];
	status: VoiceRealtimeProviderContractStatus;
	total: number;
	warned: number;
};

export type VoiceRealtimeProviderContractAssertionInput<
	TProvider extends string = string
> = {
	maxFailed?: number;
	maxStatus?: VoiceRealtimeProviderContractStatus;
	maxWarned?: number;
	minRows?: number;
	requireSelected?: boolean;
	requiredCapabilities?: readonly VoiceRealtimeProviderContractCapability[];
	requiredCheckKeys?: readonly string[];
	requiredProviders?: readonly TProvider[];
};

export type VoiceRealtimeProviderContractAssertionReport<
	TProvider extends string = string
> = {
	failed: number;
	issues: string[];
	ok: boolean;
	providers: TProvider[];
	selectedProviders: TProvider[];
	status: VoiceRealtimeProviderContractStatus;
	total: number;
	warned: number;
};

export type VoiceRealtimeProviderContractRoutesOptions<
	TProvider extends string = string
> = {
	headers?: HeadersInit;
	htmlPath?: false | string;
	matrix:
		| (() =>
				| Promise<VoiceRealtimeProviderContractMatrixInput<TProvider>>
				| VoiceRealtimeProviderContractMatrixInput<TProvider>)
		| VoiceRealtimeProviderContractMatrixInput<TProvider>;
	name?: string;
	path?: string;
	render?: (
		report: VoiceRealtimeProviderContractMatrixReport<TProvider>
	) => Promise<string> | string;
	title?: string;
};

const defaultRequiredCapabilities: VoiceRealtimeProviderContractCapability[] = [
	'browser-format-negotiation',
	'raw-pcm',
	'duplex-audio',
	'turn-commit',
	'first-audio-latency',
	'trace-evidence',
	'reconnect',
	'barge-in'
];

const defaultProviderEnv: Record<string, string[]> = {
	'gemini-live': ['GEMINI_API_KEY'],
	'openai-realtime': ['OPENAI_API_KEY'],
	'pipecat-bridge': []
};

const statusRank: Record<VoiceRealtimeProviderContractStatus, number> = {
	pass: 0,
	warn: 1,
	fail: 2
};

const statusExceeds = (
	actual: VoiceRealtimeProviderContractStatus,
	max: VoiceRealtimeProviderContractStatus
) => statusRank[actual] > statusRank[max];

const rollupStatus = (
	checks: readonly VoiceRealtimeProviderContractCheck[]
): VoiceRealtimeProviderContractStatus =>
	checks.some((check) => check.status === 'fail')
		? 'fail'
		: checks.some((check) => check.status === 'warn')
			? 'warn'
			: 'pass';

const escapeHtml = (value: unknown) =>
	String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

export const buildVoiceRealtimeProviderContractMatrix = <
	TProvider extends string = string
>(
	input: VoiceRealtimeProviderContractMatrixInput<TProvider>
): VoiceRealtimeProviderContractMatrixReport<TProvider> => {
	const rows = input.contracts.map((contract) => {
		const configured = contract.configured !== false;
		const planned = contract.implementationStatus === 'planned';
		const requiredEnv =
			contract.requiredEnv ?? defaultProviderEnv[contract.provider] ?? [];
		const missingEnv = requiredEnv.filter((name) => !contract.env?.[name]);
		const requiredCapabilities =
			contract.requiredCapabilities ?? defaultRequiredCapabilities;
		const presentCapabilities = new Set(contract.capabilities ?? []);
		const missingCapabilities = requiredCapabilities.filter(
			(capability) => !presentCapabilities.has(capability)
		);
		const realtimeChannel = contract.realtimeChannel;
		const checks: VoiceRealtimeProviderContractCheck[] = [
			{
				detail: planned
					? 'Provider contract is declared for roadmap coverage but is not enabled for this deployment.'
					: configured
					? 'Provider is configured for this deployment.'
					: 'Provider is declared but not configured.',
				key: 'configured',
				label: 'Configured',
				status: configured ? 'pass' : planned ? 'warn' : 'fail'
			},
			{
				detail:
					missingEnv.length === 0
						? 'Required environment is present.'
						: `Missing env: ${missingEnv.join(', ')}.`,
				key: 'env',
				label: 'Required env',
				status: missingEnv.length === 0 ? 'pass' : planned ? 'warn' : 'fail'
			},
			{
				detail:
					missingCapabilities.length === 0
						? 'Required realtime capabilities are declared.'
						: `Missing capabilities: ${missingCapabilities.join(', ')}.`,
				key: 'capabilities',
				label: 'Realtime capabilities',
				status: missingCapabilities.length === 0 ? 'pass' : 'warn'
			},
			{
				detail: realtimeChannel
					? `Realtime channel proof is ${realtimeChannel.status}.`
					: 'No realtime channel proof linked.',
				key: 'realtimeChannel',
				label: 'Realtime channel proof',
				status:
					realtimeChannel?.status === 'pass'
						? 'pass'
						: realtimeChannel
							? 'warn'
							: planned
								? 'warn'
							: 'fail'
			},
			{
				detail:
					contract.latencyBudgetMs !== undefined
						? `First audio latency budget is ${String(contract.latencyBudgetMs)}ms.`
						: 'No first-audio latency budget declared.',
				key: 'latencyBudget',
				label: 'Latency budget',
				status: contract.latencyBudgetMs !== undefined ? 'pass' : 'warn'
			},
			{
				detail:
					(contract.fallbackProviders ?? []).length > 0
						? `Fallback providers: ${contract.fallbackProviders?.join(', ')}.`
						: 'No realtime fallback provider declared.',
				key: 'fallback',
				label: 'Fallback',
				status: (contract.fallbackProviders ?? []).length > 0 ? 'pass' : 'warn'
			},
			{
				detail: contract.traceHref
					? `Trace evidence: ${contract.traceHref}.`
					: 'Trace evidence link is missing.',
				key: 'traceEvidence',
				label: 'Trace evidence',
				status: contract.traceHref ? 'pass' : 'warn'
			},
			{
				detail: contract.readinessHref
					? `Readiness gate: ${contract.readinessHref}.`
					: 'Readiness gate link is missing.',
				key: 'readiness',
				label: 'Readiness gate',
				status: contract.readinessHref ? 'pass' : 'warn'
			}
		];

		return {
			checks,
			configured,
			provider: contract.provider,
			selected: contract.selected === true,
			status: rollupStatus(checks)
		} satisfies VoiceRealtimeProviderContractRow<TProvider>;
	});
	const failed = rows.filter((row) => row.status === 'fail').length;
	const warned = rows.filter((row) => row.status === 'warn').length;

	return {
		failed,
		passed: rows.filter((row) => row.status === 'pass').length,
		rows,
		status: failed > 0 ? 'fail' : warned > 0 ? 'warn' : 'pass',
		total: rows.length,
		warned
	};
};

export const evaluateVoiceRealtimeProviderContractEvidence = <
	TProvider extends string = string
>(
	report: VoiceRealtimeProviderContractMatrixReport<TProvider>,
	input: VoiceRealtimeProviderContractAssertionInput<TProvider> = {}
): VoiceRealtimeProviderContractAssertionReport<TProvider> => {
	const issues: string[] = [];
	const maxStatus = input.maxStatus ?? 'pass';
	const maxFailed = input.maxFailed ?? 0;
	const maxWarned = input.maxWarned ?? 0;
	const minRows = input.minRows ?? 1;
	const providers = [...new Set(report.rows.map((row) => row.provider))].sort();
	const selectedProviders = [
		...new Set(report.rows.filter((row) => row.selected).map((row) => row.provider))
	].sort();

	if (statusExceeds(report.status, maxStatus)) {
		issues.push(
			`Expected realtime provider contract status at most ${maxStatus}, found ${report.status}.`
		);
	}
	if (report.failed > maxFailed) {
		issues.push(
			`Expected at most ${String(maxFailed)} failing realtime provider row(s), found ${String(report.failed)}.`
		);
	}
	if (report.warned > maxWarned) {
		issues.push(
			`Expected at most ${String(maxWarned)} warning realtime provider row(s), found ${String(report.warned)}.`
		);
	}
	if (report.total < minRows) {
		issues.push(
			`Expected at least ${String(minRows)} realtime provider row(s), found ${String(report.total)}.`
		);
	}
	for (const provider of input.requiredProviders ?? []) {
		if (!providers.includes(provider)) {
			issues.push(`Missing realtime provider contract provider: ${provider}.`);
		}
	}
	for (const key of input.requiredCheckKeys ?? []) {
		const missingRows = report.rows.filter(
			(row) => !row.checks.some((check) => check.key === key)
		).length;
		if (missingRows > 0) {
			issues.push(
				`Realtime provider contract check ${key} is missing from ${String(missingRows)} row(s).`
			);
		}
	}
	for (const capability of input.requiredCapabilities ?? []) {
		const missingRows = report.rows.filter((row) => {
			const capabilityCheck = row.checks.find(
				(check) => check.key === 'capabilities'
			);
			return capabilityCheck?.detail?.includes(capability) === true;
		}).length;
		if (missingRows > 0) {
			issues.push(
				`Realtime provider capability ${capability} is missing from ${String(missingRows)} row(s).`
			);
		}
	}
	if ((input.requireSelected ?? true) && selectedProviders.length === 0) {
		issues.push('Missing selected realtime provider contract row.');
	}

	return {
		failed: report.failed,
		issues,
		ok: issues.length === 0,
		providers,
		selectedProviders,
		status: report.status,
		total: report.total,
		warned: report.warned
	};
};

export const assertVoiceRealtimeProviderContractEvidence = <
	TProvider extends string = string
>(
	report: VoiceRealtimeProviderContractMatrixReport<TProvider>,
	input: VoiceRealtimeProviderContractAssertionInput<TProvider> = {}
): VoiceRealtimeProviderContractAssertionReport<TProvider> => {
	const assertion = evaluateVoiceRealtimeProviderContractEvidence(report, input);
	if (!assertion.ok) {
		throw new Error(
			`Voice realtime provider contract assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
};

const resolveMatrix = async <TProvider extends string = string>(
	matrix: VoiceRealtimeProviderContractRoutesOptions<TProvider>['matrix']
) => (typeof matrix === 'function' ? await matrix() : matrix);

export const renderVoiceRealtimeProviderContractHTML = <
	TProvider extends string = string
>(
	report: VoiceRealtimeProviderContractMatrixReport<TProvider>,
	title = 'Voice Realtime Provider Contracts'
) => {
	const rows = report.rows
		.map((row) => {
			const checks = row.checks
				.map(
					(check) =>
						`<li class="${escapeHtml(check.status)}"><strong>${escapeHtml(check.label)}</strong><span>${escapeHtml(check.detail ?? check.status)}</span></li>`
				)
				.join('');
			return `<article class="row ${escapeHtml(row.status)}"><div><p class="eyebrow">${row.selected ? 'selected' : 'available'}</p><h2>${escapeHtml(row.provider)}</h2><p class="status ${escapeHtml(row.status)}">${escapeHtml(row.status)}</p></div><ul>${checks}</ul></article>`;
		})
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101418;color:#f7f3e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1120px;padding:32px}.hero,.row{background:#17201d;border:1px solid #2e3d36;border-radius:24px;margin-bottom:16px;padding:22px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.18),rgba(245,158,11,.1))}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,4.8rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}.summary{display:flex;flex-wrap:wrap;gap:10px}.pill,.status{border:1px solid #3f4f45;border-radius:999px;display:inline-flex;padding:8px 12px}.row{display:grid;gap:18px;grid-template-columns:minmax(190px,.4fr) 1fr}.row ul{display:grid;gap:10px;list-style:none;margin:0;padding:0}.row li{background:#101814;border:1px solid #2e3d36;border-radius:16px;display:grid;gap:4px;padding:12px}.row li span{color:#b8c2ba}.pass{color:#86efac}.warn{color:#fde68a}.fail{color:#fecaca}@media(max-width:760px){main{padding:18px}.row{grid-template-columns:1fr}}</style></head><body><main><section class="hero"><p class="eyebrow">Realtime provider contracts</p><h1>${escapeHtml(title)}</h1><p>Provider-level proof for duplex audio, browser format negotiation, turn commit, latency, reconnect, barge-in, trace evidence, fallback, and readiness gates.</p><div class="summary"><span class="pill">${String(report.passed)} passing</span><span class="pill">${String(report.warned)} warning</span><span class="pill">${String(report.failed)} failing</span><span class="pill">${String(report.total)} total</span></div></section>${rows || '<article class="row"><p>No realtime provider contracts configured.</p></article>'}</main></body></html>`;
};

export const createVoiceRealtimeProviderContractRoutes = <
	TProvider extends string = string
>(
	options: VoiceRealtimeProviderContractRoutesOptions<TProvider>
) => {
	const path = options.path ?? '/api/voice/realtime-provider-contracts';
	const htmlPath = options.htmlPath ?? '/voice/realtime-provider-contracts';
	const title = options.title ?? 'Voice Realtime Provider Contracts';
	const report = async () =>
		buildVoiceRealtimeProviderContractMatrix(await resolveMatrix(options.matrix));
	const routes = new Elysia({
		name: options.name ?? 'voice-realtime-provider-contracts'
	}).get(path, async () => {
		return new Response(JSON.stringify(await report(), null, 2), {
			headers: {
				'content-type': 'application/json; charset=utf-8',
				...options.headers
			}
		});
	});

	if (htmlPath !== false) {
		routes.get(htmlPath, async () => {
			const current = await report();
			const body = options.render
				? await options.render(current)
				: renderVoiceRealtimeProviderContractHTML(current, title);
			return new Response(body, {
				headers: {
					'content-type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		});
	}

	return routes;
};
