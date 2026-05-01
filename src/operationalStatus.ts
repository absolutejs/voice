import { Elysia } from 'elysia';
import {
	buildVoiceDeliveryRuntimeReport,
	type VoiceDeliveryRuntime,
	type VoiceDeliveryRuntimeReport
} from './deliveryRuntime';
import {
	summarizeVoiceProductionReadinessGate,
	type VoiceProductionReadinessReport,
	type VoiceProductionReadinessStatus
} from './productionReadiness';
import type { VoiceProofPackRefreshStatus } from './proofPack';

export type VoiceOperationalStatus = VoiceProductionReadinessStatus;

export type VoiceOperationalStatusCheck = {
	detail?: string;
	href?: string;
	label: string;
	status: VoiceOperationalStatus;
	value?: number | string;
};

export type VoiceOperationalStatusReport = {
	checkedAt: number;
	checks: VoiceOperationalStatusCheck[];
	links: {
		deliveryRuntime?: string;
		productionReadiness?: string;
		proofPack?: string;
	};
	status: VoiceOperationalStatus;
	summary: {
		fail: number;
		pass: number;
		total: number;
		warn: number;
	};
};

export type VoiceOperationalStatusValue<TValue> =
	| TValue
	| (() => Promise<TValue> | TValue);

export type VoiceOperationalStatusOptions = {
	deliveryRuntime?:
		| VoiceDeliveryRuntime
		| VoiceOperationalStatusValue<VoiceDeliveryRuntimeReport>;
	links?: VoiceOperationalStatusReport['links'];
	productionReadiness?: VoiceOperationalStatusValue<VoiceProductionReadinessReport>;
	proofPack?: VoiceOperationalStatusValue<VoiceProofPackRefreshStatus>;
};

export type VoiceOperationalStatusRoutesOptions = VoiceOperationalStatusOptions & {
	headers?: HeadersInit;
	htmlPath?: false | string;
	name?: string;
	path?: string;
	render?: (report: VoiceOperationalStatusReport) => string | Promise<string>;
	title?: string;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const resolveValue = async <TValue>(
	value: VoiceOperationalStatusValue<TValue> | undefined
) =>
	typeof value === 'function'
		? await (value as () => Promise<TValue> | TValue)()
		: value;

const isDeliveryRuntime = (
	value:
		| VoiceDeliveryRuntime
		| VoiceOperationalStatusValue<VoiceDeliveryRuntimeReport>
		| undefined
): value is VoiceDeliveryRuntime =>
	Boolean(
		value &&
			typeof value === 'object' &&
			'isRunning' in value &&
			'summarize' in value
	);

const worstStatus = (
	statuses: readonly VoiceOperationalStatus[]
): VoiceOperationalStatus =>
	statuses.includes('fail') ? 'fail' : statuses.includes('warn') ? 'warn' : 'pass';

const proofPackStatusToCheck = (
	status: VoiceProofPackRefreshStatus,
	href?: string
): VoiceOperationalStatusCheck => {
	const checkStatus: VoiceOperationalStatus =
		status.state === 'failed' || status.state === 'missing'
			? 'fail'
			: status.state === 'fresh'
				? 'pass'
				: 'warn';
	const age =
		typeof status.ageMs === 'number'
			? `${Math.round(status.ageMs / 1000)}s old`
			: undefined;

	return {
		detail: status.error ?? `Proof pack is ${status.state}.`,
		href,
		label: 'Proof pack freshness',
		status: checkStatus,
		value: age ?? status.state
	};
};

const deliveryRuntimeStatusToCheck = (
	report: VoiceDeliveryRuntimeReport,
	href?: string
): VoiceOperationalStatusCheck => {
	const summaries = [report.summary.audit, report.summary.trace].filter(
		Boolean
	);
	const failed = summaries.reduce(
		(total, summary) => total + (summary?.failed ?? 0) + (summary?.deadLettered ?? 0),
		0
	);
	const pending = summaries.reduce(
		(total, summary) => total + (summary?.pending ?? 0),
		0
	);
	const status: VoiceOperationalStatus =
		failed > 0 ? 'fail' : pending > 0 || !report.isRunning ? 'warn' : 'pass';

	return {
		detail:
			failed > 0
				? 'Delivery runtime has failed or dead-lettered work.'
				: pending > 0
					? 'Delivery runtime has pending work.'
					: report.isRunning
						? 'Delivery runtime is running with no backlog.'
						: 'Delivery runtime is stopped.',
		href,
		label: 'Delivery runtime',
		status,
		value: `${pending} pending / ${failed} failed`
	};
};

const productionReadinessStatusToCheck = (
	report: VoiceProductionReadinessReport,
	href?: string
): VoiceOperationalStatusCheck => {
	const gate = summarizeVoiceProductionReadinessGate(report);

	return {
		detail: gate.ok
			? 'Production readiness gate is open.'
			: `${gate.failures.length} failures and ${gate.warnings.length} warnings.`,
		href,
		label: 'Production readiness',
		status: gate.ok ? report.status : 'fail',
		value: `${gate.failures.length} failures / ${gate.warnings.length} warnings`
	};
};

export const buildVoiceOperationalStatusReport = async (
	options: VoiceOperationalStatusOptions
): Promise<VoiceOperationalStatusReport> => {
	const [proofPack, deliveryRuntimeReport, productionReadiness] =
		await Promise.all([
			resolveValue(options.proofPack),
			isDeliveryRuntime(options.deliveryRuntime)
				? buildVoiceDeliveryRuntimeReport(options.deliveryRuntime)
				: resolveValue(options.deliveryRuntime),
			resolveValue(options.productionReadiness)
		]);
	const checks: VoiceOperationalStatusCheck[] = [];

	if (proofPack) {
		checks.push(proofPackStatusToCheck(proofPack, options.links?.proofPack));
	}
	if (deliveryRuntimeReport) {
		checks.push(
			deliveryRuntimeStatusToCheck(
				deliveryRuntimeReport,
				options.links?.deliveryRuntime
			)
		);
	}
	if (productionReadiness) {
		checks.push(
			productionReadinessStatusToCheck(
				productionReadiness,
				options.links?.productionReadiness
			)
		);
	}

	const summary = {
		fail: checks.filter((check) => check.status === 'fail').length,
		pass: checks.filter((check) => check.status === 'pass').length,
		total: checks.length,
		warn: checks.filter((check) => check.status === 'warn').length
	};

	return {
		checkedAt: Date.now(),
		checks,
		links: options.links ?? {},
		status: worstStatus(checks.map((check) => check.status)),
		summary
	};
};

export const renderVoiceOperationalStatusHTML = (
	report: VoiceOperationalStatusReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Operational Status';
	const checks = report.checks
		.map(
			(check) => `<article class="${escapeHtml(check.status)}">
  <span>${escapeHtml(check.status.toUpperCase())}</span>
  <h2>${escapeHtml(check.label)}</h2>
  <strong>${escapeHtml(String(check.value ?? check.status))}</strong>
  ${check.detail ? `<p>${escapeHtml(check.detail)}</p>` : ''}
  ${check.href ? `<a href="${escapeHtml(check.href)}">Open surface</a>` : ''}
</article>`
		)
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#10130f;color:#f8f3df;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1040px;padding:32px}.hero{background:linear-gradient(135deg,rgba(132,204,22,.18),rgba(14,165,233,.13));border:1px solid #2c3a28;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#bef264;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,4.8rem);line-height:.92;margin:.2rem 0 1rem}.status{border:1px solid #64748b;border-radius:999px;display:inline-flex;font-weight:900;padding:8px 12px}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}article{background:#171d15;border:1px solid #2c3a28;border-radius:22px;padding:18px}article.pass{border-color:rgba(34,197,94,.65)}article.warn{border-color:rgba(245,158,11,.75)}article.fail{border-color:rgba(239,68,68,.85)}article span{color:#bef264;font-size:.78rem;font-weight:900;letter-spacing:.08em}article.warn span{color:#fbbf24}article.fail span{color:#fca5a5}article strong{display:block;font-size:1.6rem;margin:.4rem 0}article p{color:#c5ceb9}a{color:#bef264}</style></head><body><main><section class="hero"><p class="eyebrow">Operational status</p><h1>${escapeHtml(title)}</h1><p class="status ${escapeHtml(report.status)}">Overall: ${escapeHtml(report.status.toUpperCase())}</p><p>${String(report.summary.pass)}/${String(report.summary.total)} checks passing. Checked ${escapeHtml(new Date(report.checkedAt).toLocaleString())}.</p></section><section class="grid">${checks || '<article class="pass"><span>PASS</span><h2>No operational checks configured</h2><strong>0/0</strong></article>'}</section></main></body></html>`;
};

export const createVoiceOperationalStatusRoutes = (
	options: VoiceOperationalStatusRoutesOptions
) => {
	const path = options.path ?? '/api/voice/operational-status';
	const htmlPath =
		options.htmlPath === undefined ? '/voice/operational-status' : options.htmlPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-operational-status'
	}).get(path, async () => {
		const report = await buildVoiceOperationalStatusReport(options);

		return new Response(JSON.stringify(report), {
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				...options.headers
			},
			status: report.status === 'fail' ? 503 : 200
		});
	});

	if (htmlPath !== false) {
		routes.get(htmlPath, async () => {
			const report = await buildVoiceOperationalStatusReport(options);
			const body = await (options.render ?? ((input) =>
				renderVoiceOperationalStatusHTML(input, { title: options.title })))(report);

			return new Response(body, {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		});
	}

	return routes;
};
