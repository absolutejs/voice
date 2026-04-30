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
	actions: VoiceSimulationSuiteAction[];
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

export type VoiceSimulationSuiteAction = {
	description: string;
	href?: string;
	label: string;
	section: 'fixtures' | 'outcomes' | 'scenarios' | 'sessions' | 'tools';
	severity: 'error' | 'warning';
};

export type VoiceSimulationSuiteSectionSummary = {
	failed: number;
	passed: number;
	status: VoiceSimulationSuiteStatus;
	total: number;
};

export type VoiceSimulationSuiteSection =
	| 'fixtures'
	| 'outcomes'
	| 'scenarios'
	| 'sessions'
	| 'tools';

export type VoiceSimulationSuiteAssertionInput = {
	maxActions?: number;
	maxFailed?: number;
	minPassed?: number;
	minSections?: number;
	requiredSections?: VoiceSimulationSuiteSection[];
	sectionMinimums?: Partial<Record<VoiceSimulationSuiteSection, number>>;
};

export type VoiceSimulationSuiteAssertionReport = {
	actions: number;
	failed: number;
	issues: string[];
	ok: boolean;
	passed: number;
	sections: VoiceSimulationSuiteSection[];
	sectionTotals: Partial<Record<VoiceSimulationSuiteSection, number>>;
	status: VoiceSimulationSuiteStatus;
	total: number;
};

export type VoiceSimulationSuiteOptions<
	TSession extends VoiceSessionRecord = VoiceSessionRecord
> = {
	actionLinks?: {
		fixtures?: string;
		outcomes?: string;
		scenarios?: string;
		sessions?: string;
		tools?: string;
	};
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
	operationsRecordHref?: false | string | ((sessionId: string) => string);
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

const collectSimulationActions = (input: {
	fixtures?: VoiceScenarioFixtureEvalReport;
	links?: VoiceSimulationSuiteOptions['actionLinks'];
	outcomes?: VoiceOutcomeContractSuiteReport;
	scenarios?: VoiceScenarioEvalReport;
	sessions?: VoiceEvalReport;
	tools?: VoiceToolContractSuiteReport;
}): VoiceSimulationSuiteAction[] => {
	const actions: VoiceSimulationSuiteAction[] = [];

	if (input.sessions?.failed) {
		const firstFailed = input.sessions.sessions.find(
			(session) => session.status === 'fail'
		);
		actions.push({
			description: firstFailed
				? `Inspect session ${firstFailed.sessionId}; at least one quality metric is outside threshold.`
				: 'Inspect failing session quality reports.',
			href: firstFailed?.operationsRecordHref ?? input.links?.sessions,
			label: 'Review failing session quality',
			section: 'sessions',
			severity: 'error'
		});
	}

	for (const scenario of input.scenarios?.scenarios ?? []) {
		if (scenario.status !== 'fail') {
			continue;
		}
		const issue =
			scenario.issues[0] ??
			scenario.sessions.find((session) => session.issues.length > 0)?.issues[0] ??
			'Scenario did not meet its expected trace conditions.';
		const failedSession = scenario.sessions.find(
			(session) => session.status === 'fail'
		);
		actions.push({
			description: `${scenario.label}: ${issue}`,
			href: failedSession?.operationsRecordHref ?? input.links?.scenarios,
			label: `Fix scenario ${scenario.label}`,
			section: 'scenarios',
			severity: 'error'
		});
	}

	for (const fixture of input.fixtures?.fixtures ?? []) {
		if (fixture.status !== 'fail') {
			continue;
		}
		const failedScenario = fixture.report.scenarios.find(
			(scenario) => scenario.status === 'fail'
		);
		const failedSession = failedScenario?.sessions.find(
			(session) => session.status === 'fail'
		);
		actions.push({
			description: failedScenario
				? `${fixture.label}: ${failedScenario.label} failed.`
				: `${fixture.label}: fixture simulation failed.`,
			href: failedSession?.operationsRecordHref ?? input.links?.fixtures,
			label: `Update fixture ${fixture.label}`,
			section: 'fixtures',
			severity: 'error'
		});
	}

	for (const tool of input.tools?.contracts ?? []) {
		if (tool.pass) {
			continue;
		}
		const issue = tool.issues[0] ?? tool.cases.find((testCase) => !testCase.pass)?.issues[0];
		actions.push({
			description: issue?.message ?? `${tool.toolName} contract failed.`,
			href: input.links?.tools,
			label: `Fix tool contract ${tool.label ?? tool.contractId}`,
			section: 'tools',
			severity: 'error'
		});
	}

	for (const outcome of input.outcomes?.contracts ?? []) {
		if (outcome.pass) {
			continue;
		}
		actions.push({
			description:
				outcome.issues[0]?.message ??
				`${outcome.label ?? outcome.contractId} is missing required outcome evidence.`,
			href: input.links?.outcomes,
			label: `Fix outcome ${outcome.label ?? outcome.contractId}`,
			section: 'outcomes',
			severity: 'error'
		});
	}

	return actions;
};

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
					operationsRecordHref: options.operationsRecordHref,
					store: options.store,
					thresholds: options.thresholds
				})
			: undefined,
		shouldRunScenarios
			? runVoiceScenarioEvals({
					operationsRecordHref: options.operationsRecordHref,
					scenarios: options.scenarios,
					store: options.store
				})
			: undefined,
		shouldRunFixtures
			? runVoiceScenarioFixtureEvals({
					fixtures: options.fixtures,
					fixtureStore: options.fixtureStore,
					operationsRecordHref: options.operationsRecordHref,
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
	const actions = collectSimulationActions({
		fixtures,
		links: options.actionLinks,
		outcomes,
		scenarios,
		sessions,
		tools
	});

	return {
		actions,
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

const simulationSectionNames = [
	'fixtures',
	'outcomes',
	'scenarios',
	'sessions',
	'tools'
] as const;

export const evaluateVoiceSimulationSuiteEvidence = (
	report: VoiceSimulationSuiteReport,
	input: VoiceSimulationSuiteAssertionInput = {}
): VoiceSimulationSuiteAssertionReport => {
	const issues: string[] = [];
	const maxFailed = input.maxFailed ?? 0;
	const maxActions = input.maxActions ?? 0;
	const sections = simulationSectionNames.filter(
		(section): section is VoiceSimulationSuiteSection =>
			report.summary[section] !== undefined
	);
	const sectionTotals = Object.fromEntries(
		sections.map((section) => [section, report.summary[section]?.total ?? 0])
	) as Partial<Record<VoiceSimulationSuiteSection, number>>;

	if (report.failed > maxFailed) {
		issues.push(
			`Expected at most ${String(maxFailed)} failing simulation section(s), found ${String(report.failed)}.`
		);
	}
	if (report.actions.length > maxActions) {
		issues.push(
			`Expected at most ${String(maxActions)} simulation action(s), found ${String(report.actions.length)}.`
		);
	}
	if (input.minSections !== undefined && report.total < input.minSections) {
		issues.push(
			`Expected at least ${String(input.minSections)} simulation section(s), found ${String(report.total)}.`
		);
	}
	if (input.minPassed !== undefined && report.passed < input.minPassed) {
		issues.push(
			`Expected at least ${String(input.minPassed)} passing simulation section(s), found ${String(report.passed)}.`
		);
	}
	for (const section of input.requiredSections ?? []) {
		if (!sections.includes(section)) {
			issues.push(`Missing simulation section: ${section}.`);
		}
	}
	for (const [section, minimum] of Object.entries(
		input.sectionMinimums ?? {}
	) as Array<[VoiceSimulationSuiteSection, number]>) {
		const total = sectionTotals[section] ?? 0;
		if (total < minimum) {
			issues.push(
				`Expected simulation section ${section} to include at least ${String(minimum)} item(s), found ${String(total)}.`
			);
		}
	}

	return {
		actions: report.actions.length,
		failed: report.failed,
		issues,
		ok: issues.length === 0,
		passed: report.passed,
		sections,
		sectionTotals,
		status: report.status,
		total: report.total
	};
};

export const assertVoiceSimulationSuiteEvidence = (
	report: VoiceSimulationSuiteReport,
	input: VoiceSimulationSuiteAssertionInput = {}
): VoiceSimulationSuiteAssertionReport => {
	const assertion = evaluateVoiceSimulationSuiteEvidence(report, input);
	if (!assertion.ok) {
		throw new Error(
			`Voice simulation suite evidence assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
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

const renderAction = (action: VoiceSimulationSuiteAction) => {
	const content = `<strong>${escapeHtml(action.label)}</strong><p>${escapeHtml(action.description)}</p><span>${escapeHtml(action.section)} / ${escapeHtml(action.severity)}</span>`;
	return action.href
		? `<a class="action" href="${escapeHtml(action.href)}">${content}</a>`
		: `<article class="action">${content}</article>`;
};

export const renderVoiceSimulationSuiteHTML = (
	report: VoiceSimulationSuiteReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'Voice Simulation Suite';
	const snippet = escapeHtml(`app.use(
	createVoiceSimulationSuiteRoutes({
		htmlPath: '/voice/simulations',
		path: '/api/voice/simulations',
		store: traceStore,
		scenarios: workflowScenarios,
		fixtureStore,
		tools: toolContracts,
		outcomes: {
			contracts: outcomeContracts,
			sessions: loadCompletedSessions
		},
		actionLinks: {
			scenarios: '/evals/scenarios',
			fixtures: '/evals/fixtures',
			tools: '/tool-contracts',
			outcomes: '/reviews'
		}
	})
);

app.use(
	createVoiceProductionReadinessRoutes({
		proofSources: {
			simulations: {
				href: '/voice/simulations',
				source: 'simulation-suite',
				sourceLabel: 'Pre-production simulation suite'
			}
		},
		store: traceStore
	})
);`);

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#10151c;color:#f8f3e7;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1080px;padding:32px}.hero,.primitive{background:linear-gradient(135deg,rgba(34,197,94,.18),rgba(59,130,246,.12));border:1px solid #283544;border-radius:28px;margin-bottom:18px;padding:28px}.primitive{background:#151d27;border-color:#355078}.eyebrow{color:#93c5fd;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:.9;margin:.2rem 0 1rem}.badge{border:1px solid #3f3f46;border-radius:999px;display:inline-flex;padding:8px 12px}.pass{color:#86efac}.fail{color:#fca5a5}.grid,.actions{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin:18px 0}.grid article,.action{background:#151d27;border:1px solid #283544;border-radius:18px;color:inherit;padding:16px;text-decoration:none}.grid span,.action span{color:#aab5c0}.grid strong{display:block;font-size:2rem;margin:.25rem 0;text-transform:uppercase}.action strong{display:block;color:#f8f3e7;margin-bottom:.35rem}.action p,.primitive p{color:#d8dee6;line-height:1.55;margin:.3rem 0 .6rem}pre{background:#151d27;border:1px solid #283544;border-radius:18px;overflow:auto;padding:16px}.primitive pre{background:#0b1118;color:#dbeafe}.primitive code{color:#bfdbfe}</style></head><body><main><section class="hero"><p class="eyebrow">Pre-production proof</p><h1>${escapeHtml(title)}</h1><p>One report for session quality, scenario evals, fixture simulations, tool contracts, and outcome contracts.</p><p class="badge ${escapeHtml(report.status)}">Status: ${escapeHtml(report.status)}</p><section class="grid">${renderSection('Sessions', report.summary.sessions)}${renderSection('Scenarios', report.summary.scenarios)}${renderSection('Fixtures', report.summary.fixtures)}${renderSection('Tools', report.summary.tools)}${renderSection('Outcomes', report.summary.outcomes)}</section></section><section class="primitive"><p class="eyebrow">Copy into your app</p><h2><code>createVoiceSimulationSuiteRoutes(...)</code> builds this pre-production proof surface</h2><p>Run session quality checks, scenario evals, fixture-backed simulations, tool contracts, and outcome contracts from one route group before live traffic sees a regression.</p><pre><code>${snippet}</code></pre></section><h2>Actions</h2><section class="actions">${report.actions.length > 0 ? report.actions.map(renderAction).join('') : '<article class="action"><strong>No action required</strong><p>All enabled simulation sections are passing.</p></article>'}</section><pre>${escapeHtml(JSON.stringify({ summary: report.summary, actions: report.actions }, null, 2))}</pre></main></body></html>`;
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
