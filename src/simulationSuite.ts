import { Elysia } from 'elysia';
import {
	runVoiceScenarioEvals,
	runVoiceScenarioFixtureEvals,
	runVoiceSessionEvals,
	type VoiceEvalReport,
	type VoiceEvalRoutesOptions,
	type VoiceScenarioEvalDefinition,
	type VoiceScenarioEvalReport,
	type VoiceScenarioFixture,
	type VoiceScenarioFixtureEvalReport,
	type VoiceScenarioFixtureStore
} from './evalRoutes';
import {
	runVoiceOutcomeContractSuite,
	type VoiceOutcomeContractDefinition,
	type VoiceOutcomeContractOptions,
	type VoiceOutcomeContractSuiteReport
} from './outcomeContract';
import {
	runVoiceToolContractSuite,
	type VoiceToolContractDefinition,
	type VoiceToolContractSuiteReport
} from './toolContract';
import type { VoiceQualityThresholds } from './qualityRoutes';
import type { VoiceTraceEventStore } from './trace';
import type { VoiceSessionRecord } from './types';

export type VoiceSimulationSuiteStatus = 'pass' | 'fail';

export type VoiceSimulationSuiteReport = {
	checkedAt: number;
	failed: number;
	fixtures?: VoiceScenarioFixtureEvalReport;
	outcomes?: VoiceOutcomeContractSuiteReport;
	passed: number;
	scenarios?: VoiceScenarioEvalReport;
	sessions?: VoiceEvalReport;
	status: VoiceSimulationSuiteStatus;
	summary: {
		fixtures?: VoiceSimulationSuiteSectionSummary;
		outcomes?: VoiceSimulationSuiteSectionSummary;
		scenarios?: VoiceSimulationSuiteSectionSummary;
		sessions?: VoiceSimulationSuiteSectionSummary;
		tools?: VoiceSimulationSuiteSectionSummary;
	};
	tools?: VoiceToolContractSuiteReport;
	total: number;
};

export type VoiceSimulationSuiteSectionSummary = {
	failed: number;
	passed: number;
	status: VoiceSimulationSuiteStatus;
	total: number;
};

export type VoiceSimulationSuiteOptions<
	TSession extends VoiceSessionRecord = VoiceSessionRecord
> = {
	fixtures?: VoiceScenarioFixture[];
	fixtureStore?: VoiceScenarioFixtureStore;
	include?: {
		fixtures?: boolean;
		outcomes?: boolean;
		scenarios?: boolean;
		sessions?: boolean;
		tools?: boolean;
	};
	limit?: number;
	outcomes?: Omit<VoiceOutcomeContractOptions<TSession>, 'contracts'> & {
		contracts: VoiceOutcomeContractDefinition[];
	};
	scenarios?: VoiceScenarioEvalDefinition[];
	store?: VoiceTraceEventStore;
	thresholds?: VoiceQualityThresholds;
	tools?: VoiceToolContractDefinition[];
};

export type VoiceSimulationSuiteRoutesOptions<
	TSession extends VoiceSessionRecord = VoiceSessionRecord
> = VoiceSimulationSuiteOptions<TSession> & {
	headers?: HeadersInit;
	htmlPath?: false | string;
	name?: string;
	path?: string;
	render?: (report: VoiceSimulationSuiteReport) => string | Promise<string>;
	title?: string;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const summarizeSection = (report: {
	failed: number;
	passed: number;
	status: 'fail' | 'pass';
	total: number;
}): VoiceSimulationSuiteSectionSummary => ({
	failed: report.failed,
	passed: report.passed,
	status: report.status,
	total: report.total
});

const hasWork = <TSession extends VoiceSessionRecord>(
	options: VoiceSimulationSuiteOptions<TSession>
) =>
	Boolean(
		options.store ||
			options.scenarios?.length ||
			options.fixtures?.length ||
			options.fixtureStore ||
			options.tools?.length ||
			options.outcomes?.contracts.length
	);

export const runVoiceSimulationSuite = async <
	TSession extends VoiceSessionRecord = VoiceSessionRecord
>(
	options: VoiceSimulationSuiteOptions<TSession>
): Promise<VoiceSimulationSuiteReport> => {
	const include = options.include ?? {};
	const shouldRunSessions =
		include.sessions ?? Boolean(options.store || !hasWork(options));
	const shouldRunScenarios =
		include.scenarios ?? Boolean(options.scenarios?.length);
	const shouldRunFixtures =
		include.fixtures ??
		Boolean((options.fixtures?.length ?? 0) > 0 || options.fixtureStore);
	const shouldRunTools = include.tools ?? Boolean(options.tools?.length);
	const shouldRunOutcomes =
		include.outcomes ?? Boolean(options.outcomes?.contracts.length);

	const [sessions, scenarios, fixtures, tools, outcomes] = await Promise.all([
		shouldRunSessions
			? runVoiceSessionEvals({
					limit: options.limit,
					store: options.store,
					thresholds: options.thresholds
				})
			: undefined,
		shouldRunScenarios
			? runVoiceScenarioEvals({
					scenarios: options.scenarios,
					store: options.store
				})
			: undefined,
		shouldRunFixtures
			? runVoiceScenarioFixtureEvals({
					fixtures: options.fixtures,
					fixtureStore: options.fixtureStore,
					scenarios: options.scenarios
				})
			: undefined,
		shouldRunTools
			? runVoiceToolContractSuite({
					contracts: options.tools ?? []
				})
			: undefined,
		shouldRunOutcomes && options.outcomes
			? runVoiceOutcomeContractSuite(options.outcomes)
			: undefined
	]);
	const sections = [sessions, scenarios, fixtures, tools, outcomes].filter(
		(report): report is NonNullable<typeof report> => Boolean(report)
	);
	const failed = sections.filter((section) => section.status === 'fail').length;
	const passed = sections.length - failed;

	return {
		checkedAt: Date.now(),
		failed,
		fixtures,
		outcomes,
		passed,
		scenarios,
		sessions,
		status: failed > 0 ? 'fail' : 'pass',
		summary: {
			fixtures: fixtures && summarizeSection(fixtures),
			outcomes: outcomes && summarizeSection(outcomes),
			scenarios: scenarios && summarizeSection(scenarios),
			sessions: sessions && summarizeSection(sessions),
			tools: tools && summarizeSection(tools)
		},
		tools,
		total: sections.length
	};
};

const renderSection = (
	label: string,
	summary: VoiceSimulationSuiteSectionSummary | undefined
) => {
	if (!summary) {
		return '';
	}

	return `<article class="${escapeHtml(summary.status)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(summary.status)}</strong><p>${summary.passed}/${summary.total} passed, ${summary.failed} failed.</p></article>`;
};

export const renderVoiceSimulationSuiteHTML = (
	report: VoiceSimulationSuiteReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'Voice Simulation Suite';

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#10151c;color:#f8f3e7;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1080px;padding:32px}.hero{background:linear-gradient(135deg,rgba(34,197,94,.18),rgba(59,130,246,.12));border:1px solid #283544;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#93c5fd;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:.9;margin:.2rem 0 1rem}.badge{border:1px solid #3f3f46;border-radius:999px;display:inline-flex;padding:8px 12px}.pass{color:#86efac}.fail{color:#fca5a5}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin:18px 0}.grid article{background:#151d27;border:1px solid #283544;border-radius:18px;padding:16px}.grid span{color:#aab5c0}.grid strong{display:block;font-size:2rem;margin:.25rem 0;text-transform:uppercase}pre{background:#151d27;border:1px solid #283544;border-radius:18px;overflow:auto;padding:16px}</style></head><body><main><section class="hero"><p class="eyebrow">Pre-production proof</p><h1>${escapeHtml(title)}</h1><p>One report for session quality, scenario evals, fixture simulations, tool contracts, and outcome contracts.</p><p class="badge ${escapeHtml(report.status)}">Status: ${escapeHtml(report.status)}</p><section class="grid">${renderSection('Sessions', report.summary.sessions)}${renderSection('Scenarios', report.summary.scenarios)}${renderSection('Fixtures', report.summary.fixtures)}${renderSection('Tools', report.summary.tools)}${renderSection('Outcomes', report.summary.outcomes)}</section></section><pre>${escapeHtml(JSON.stringify(report.summary, null, 2))}</pre></main></body></html>`;
};

export const createVoiceSimulationSuiteRoutes = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord
>(
	options: VoiceSimulationSuiteRoutesOptions<TSession>
) => {
	const path = options.path ?? '/api/voice/simulations';
	const htmlPath =
		options.htmlPath === undefined ? '/voice/simulations' : options.htmlPath;
	const app = new Elysia({
		name: options.name ?? 'absolutejs-voice-simulation-suite'
	}).get(path, () => runVoiceSimulationSuite(options));

	if (htmlPath) {
		app.get(htmlPath, async () => {
			const report = await runVoiceSimulationSuite(options);
			const html = options.render
				? await options.render(report)
				: renderVoiceSimulationSuiteHTML(report, options);

			return new Response(html, {
				headers: {
					'content-type': 'text/html; charset=utf-8',
					...options.headers
				}
			});
		});
	}

	return app;
};

export type VoiceSimulationSuiteEvalRoutesOptions = VoiceEvalRoutesOptions;
