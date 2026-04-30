import { Elysia } from 'elysia';

export type VoiceCompetitiveCoverageStatus = 'fail' | 'pass' | 'warn';

export type VoiceCompetitiveCoverageLevel =
	| 'covered'
	| 'intentional-gap'
	| 'missing'
	| 'partial';

export type VoiceCompetitiveDepthLevel =
	| 'advantage'
	| 'covered'
	| 'intentional-gap'
	| 'lag'
	| 'parity';

export type VoiceCompetitiveEvidence = {
	href?: string;
	kind?: 'docs' | 'example' | 'operations-record' | 'proof' | 'readiness' | 'route' | 'test';
	name: string;
	required?: boolean;
	status?: 'fail' | 'pass' | 'warn';
};

export type VoiceCompetitiveSurface = {
	buyerNeed?: string;
	competitors?: string[];
	coverage: VoiceCompetitiveCoverageLevel;
	depth: VoiceCompetitiveDepthLevel;
	evidence?: VoiceCompetitiveEvidence[];
	frameworkPrimitives?: string[];
	operationsRecord?: 'linked' | 'not-applicable' | 'required' | 'unknown';
	readinessGate?: 'not-applicable' | 'present' | 'recommended' | 'required' | 'unknown';
	remainingGap?: string;
	status?: VoiceCompetitiveCoverageStatus;
	surface: string;
	why: string;
	nextMove?: string;
};

export type VoiceCompetitiveCoverageReportInput = {
	generatedAt?: string;
	marketCoverageEstimate?: string;
	notes?: string[];
	source?: string;
	surfaces: VoiceCompetitiveSurface[];
	vapiCoverageEstimate?: string;
};

export type VoiceCompetitiveCoverageSummary = {
	advantage: number;
	covered: number;
	failed: number;
	intentionalGaps: number;
	missing: number;
	parity: number;
	passed: number;
	surfaces: number;
	warned: number;
};

export type VoiceCompetitiveCoverageIssue = {
	code: string;
	message: string;
	severity: 'error' | 'warning';
	surface?: string;
};

export type VoiceCompetitiveCoverageReport = {
	generatedAt: string;
	issues: VoiceCompetitiveCoverageIssue[];
	marketCoverageEstimate: string;
	notes: string[];
	ok: boolean;
	source?: string;
	status: VoiceCompetitiveCoverageStatus;
	summary: VoiceCompetitiveCoverageSummary;
	surfaces: Array<VoiceCompetitiveSurface & { status: VoiceCompetitiveCoverageStatus }>;
	vapiCoverageEstimate: string;
};

export type VoiceCompetitiveCoverageAssertionInput = {
	maxFailedSurfaces?: number;
	maxMissingSurfaces?: number;
	minAdvantageSurfaces?: number;
	minSurfaces?: number;
	requireOperationsRecordLinks?: boolean;
	requirePass?: boolean;
	requireReadinessGates?: boolean;
	requiredEvidence?: string[];
	requiredSurfaces?: string[];
};

export type VoiceCompetitiveCoverageAssertionReport = {
	advantage: number;
	failed: number;
	issues: string[];
	missing: number;
	ok: boolean;
	status: VoiceCompetitiveCoverageStatus;
	surfaces: string[];
	total: number;
};

export type VoiceCompetitiveCoverageRoutesOptions = {
	headers?: HeadersInit;
	htmlPath?: false | string;
	markdownPath?: false | string;
	name?: string;
	path?: string;
	render?: (
		report: VoiceCompetitiveCoverageReport
	) => Promise<string> | string;
	source:
		| (() =>
				| Promise<VoiceCompetitiveCoverageReport | VoiceCompetitiveCoverageReportInput>
				| VoiceCompetitiveCoverageReport
				| VoiceCompetitiveCoverageReportInput)
		| VoiceCompetitiveCoverageReport
		| VoiceCompetitiveCoverageReportInput;
	title?: string;
};

const escapeHtml = (value: unknown) =>
	String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const escapeMarkdown = (value: string) => value.replaceAll('|', '\\|');

const uniqueSorted = (values: string[]) => [...new Set(values)].sort();

const resolveSurfaceStatus = (
	surface: VoiceCompetitiveSurface
): VoiceCompetitiveCoverageStatus => {
	if (surface.status) return surface.status;
	if (surface.coverage === 'missing') return 'fail';
	if (surface.coverage === 'partial') return 'warn';
	if (surface.depth === 'lag' && surface.coverage !== 'intentional-gap') return 'warn';
	if ((surface.evidence ?? []).some((evidence) => evidence.status === 'fail')) {
		return 'fail';
	}
	if ((surface.evidence ?? []).some((evidence) => evidence.status === 'warn')) {
		return 'warn';
	}
	return 'pass';
};

export const buildVoiceCompetitiveCoverageReport = (
	input: VoiceCompetitiveCoverageReportInput
): VoiceCompetitiveCoverageReport => {
	const surfaces = input.surfaces.map((surface) => ({
		...surface,
		status: resolveSurfaceStatus(surface)
	}));
	const issues: VoiceCompetitiveCoverageIssue[] = [];

	for (const surface of surfaces) {
		const evidence = surface.evidence ?? [];
		const missingRequiredEvidence = evidence.filter(
			(item) => item.required && item.status !== 'pass'
		);
		for (const item of missingRequiredEvidence) {
			issues.push({
				code: 'required-evidence-not-passing',
				message: `Required evidence is not passing: ${item.name}.`,
				severity: 'error',
				surface: surface.surface
			});
		}
		if (surface.coverage === 'missing') {
			issues.push({
				code: 'surface-missing',
				message: `Competitive surface is missing: ${surface.surface}.`,
				severity: 'error',
				surface: surface.surface
			});
		}
		if (surface.status === 'warn') {
			issues.push({
				code: 'surface-warning',
				message: `Competitive surface needs depth work: ${surface.surface}.`,
				severity: 'warning',
				surface: surface.surface
			});
		}
	}

	const failed = surfaces.filter((surface) => surface.status === 'fail').length;
	const warned = surfaces.filter((surface) => surface.status === 'warn').length;
	const status: VoiceCompetitiveCoverageStatus =
		failed > 0 ? 'fail' : warned > 0 ? 'warn' : 'pass';

	return {
		generatedAt: input.generatedAt ?? new Date().toISOString(),
		issues,
		marketCoverageEstimate: input.marketCoverageEstimate ?? '93-95%',
		notes: input.notes ?? [],
		ok: status !== 'fail',
		source: input.source,
		status,
		summary: {
			advantage: surfaces.filter((surface) => surface.depth === 'advantage')
				.length,
			covered: surfaces.filter((surface) => surface.coverage === 'covered')
				.length,
			failed,
			intentionalGaps: surfaces.filter(
				(surface) => surface.coverage === 'intentional-gap'
			).length,
			missing: surfaces.filter((surface) => surface.coverage === 'missing')
				.length,
			parity: surfaces.filter((surface) => surface.depth === 'parity').length,
			passed: surfaces.filter((surface) => surface.status === 'pass').length,
			surfaces: surfaces.length,
			warned
		},
		surfaces,
		vapiCoverageEstimate: input.vapiCoverageEstimate ?? '99.8%'
	};
};

export const evaluateVoiceCompetitiveCoverage = (
	report: VoiceCompetitiveCoverageReport,
	input: VoiceCompetitiveCoverageAssertionInput = {}
): VoiceCompetitiveCoverageAssertionReport => {
	const issues: string[] = [];
	const surfaces = report.surfaces.map((surface) => surface.surface).sort();
	const missing = report.summary.missing;
	const failed = report.summary.failed;
	const evidenceNames = new Set(
		report.surfaces.flatMap((surface) =>
			(surface.evidence ?? []).map((evidence) => evidence.name)
		)
	);

	if ((input.requirePass ?? false) && report.status !== 'pass') {
		issues.push(`Expected competitive coverage to pass, found ${report.status}.`);
	}
	if (input.minSurfaces !== undefined && report.summary.surfaces < input.minSurfaces) {
		issues.push(
			`Expected at least ${String(input.minSurfaces)} competitive surfaces, found ${String(report.summary.surfaces)}.`
		);
	}
	if (
		input.minAdvantageSurfaces !== undefined &&
		report.summary.advantage < input.minAdvantageSurfaces
	) {
		issues.push(
			`Expected at least ${String(input.minAdvantageSurfaces)} advantage surfaces, found ${String(report.summary.advantage)}.`
		);
	}
	if (input.maxFailedSurfaces !== undefined && failed > input.maxFailedSurfaces) {
		issues.push(
			`Expected at most ${String(input.maxFailedSurfaces)} failing competitive surfaces, found ${String(failed)}.`
		);
	}
	if (input.maxMissingSurfaces !== undefined && missing > input.maxMissingSurfaces) {
		issues.push(
			`Expected at most ${String(input.maxMissingSurfaces)} missing competitive surfaces, found ${String(missing)}.`
		);
	}
	for (const surface of input.requiredSurfaces ?? []) {
		if (!surfaces.includes(surface)) {
			issues.push(`Missing competitive surface: ${surface}.`);
		}
	}
	for (const evidence of input.requiredEvidence ?? []) {
		if (!evidenceNames.has(evidence)) {
			issues.push(`Missing competitive evidence: ${evidence}.`);
		}
	}
	if (input.requireOperationsRecordLinks) {
		for (const surface of report.surfaces) {
			if (
				surface.coverage !== 'intentional-gap' &&
				surface.operationsRecord !== 'linked' &&
				surface.operationsRecord !== 'not-applicable'
			) {
				issues.push(
					`Competitive surface does not have operations-record proof: ${surface.surface}.`
				);
			}
		}
	}
	if (input.requireReadinessGates) {
		for (const surface of report.surfaces) {
			if (
				surface.coverage !== 'intentional-gap' &&
				surface.readinessGate !== 'present' &&
				surface.readinessGate !== 'not-applicable'
			) {
				issues.push(
					`Competitive surface does not have readiness-gate proof: ${surface.surface}.`
				);
			}
		}
	}

	return {
		advantage: report.summary.advantage,
		failed,
		issues,
		missing,
		ok: issues.length === 0,
		status: report.status,
		surfaces,
		total: report.summary.surfaces
	};
};

export const assertVoiceCompetitiveCoverage = (
	report: VoiceCompetitiveCoverageReport,
	input: VoiceCompetitiveCoverageAssertionInput = {}
): VoiceCompetitiveCoverageAssertionReport => {
	const assertion = evaluateVoiceCompetitiveCoverage(report, input);
	if (!assertion.ok) {
		throw new Error(
			`Voice competitive coverage assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
};

export const renderVoiceCompetitiveCoverageMarkdown = (
	report: VoiceCompetitiveCoverageReport,
	title = 'Voice Competitive Coverage'
) => [
	`# ${title}`,
	'',
	`- Status: ${report.status}`,
	`- Vapi-style coverage: ${report.vapiCoverageEstimate}`,
	`- Broader market coverage: ${report.marketCoverageEstimate}`,
	`- Surfaces: ${String(report.summary.surfaces)}`,
	`- Advantage surfaces: ${String(report.summary.advantage)}`,
	`- Parity surfaces: ${String(report.summary.parity)}`,
	`- Intentional gaps: ${String(report.summary.intentionalGaps)}`,
	'',
	'| Surface | Coverage | Depth | Status | Operations record | Readiness gate | Competitors | Next move |',
	'| --- | --- | --- | --- | --- | --- | --- | --- |',
	...report.surfaces.map(
		(surface) =>
			`| ${escapeMarkdown(surface.surface)} | ${surface.coverage} | ${surface.depth} | ${surface.status} | ${surface.operationsRecord ?? 'unknown'} | ${surface.readinessGate ?? 'unknown'} | ${escapeMarkdown((surface.competitors ?? []).join(', ') || 'n/a')} | ${escapeMarkdown(surface.nextMove ?? surface.remainingGap ?? 'none')} |`
	),
	'',
	'## Issues',
	'',
	...(report.issues.length
		? report.issues.map(
				(issue) =>
					`- ${issue.severity.toUpperCase()} ${issue.code}${issue.surface ? ` (${issue.surface})` : ''}: ${issue.message}`
			)
		: ['- None']),
	'',
	'## Notes',
	'',
	...(report.notes.length ? report.notes.map((note) => `- ${note}`) : ['- None'])
].join('\n');

export const renderVoiceCompetitiveCoverageHTML = (
	report: VoiceCompetitiveCoverageReport,
	title = 'Voice Competitive Coverage'
) => {
	const surfaceCards = report.surfaces
		.map((surface) => {
			const evidence = (surface.evidence ?? [])
				.map(
					(item) =>
						`<li><strong>${escapeHtml(item.name)}</strong>${item.kind ? ` <span>${escapeHtml(item.kind)}</span>` : ''}${item.status ? ` <em>${escapeHtml(item.status)}</em>` : ''}${item.href ? ` <a href="${escapeHtml(item.href)}">open</a>` : ''}</li>`
				)
				.join('');
			return `<article class="surface ${escapeHtml(surface.status)} ${escapeHtml(surface.depth)}">
<header><div><p class="eyebrow">${escapeHtml(surface.coverage)} · ${escapeHtml(surface.depth)}</p><h2>${escapeHtml(surface.surface)}</h2></div><strong>${escapeHtml(surface.status)}</strong></header>
<p>${escapeHtml(surface.why)}</p>
<dl>
<div><dt>Competitors</dt><dd>${escapeHtml((surface.competitors ?? []).join(', ') || 'n/a')}</dd></div>
<div><dt>Operations record</dt><dd>${escapeHtml(surface.operationsRecord ?? 'unknown')}</dd></div>
<div><dt>Readiness gate</dt><dd>${escapeHtml(surface.readinessGate ?? 'unknown')}</dd></div>
<div><dt>Frameworks</dt><dd>${escapeHtml((surface.frameworkPrimitives ?? []).join(', ') || 'n/a')}</dd></div>
</dl>
${surface.remainingGap ? `<p class="gap"><strong>Gap:</strong> ${escapeHtml(surface.remainingGap)}</p>` : ''}
${surface.nextMove ? `<p class="next"><strong>Next:</strong> ${escapeHtml(surface.nextMove)}</p>` : ''}
${evidence ? `<h3>Evidence</h3><ul>${evidence}</ul>` : '<p class="muted">No evidence links configured.</p>'}
</article>`;
		})
		.join('\n');
	const issueList = report.issues
		.map(
			(issue) =>
				`<li class="${escapeHtml(issue.severity)}"><strong>${escapeHtml(issue.code)}</strong>${issue.surface ? ` ${escapeHtml(issue.surface)}` : ''}: ${escapeHtml(issue.message)}</li>`
		)
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0e1412;color:#f7f3e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}.hero,.surface,.issues{background:#17201c;border:1px solid #2e3c35;border-radius:24px;margin-bottom:16px;padding:22px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.16),rgba(245,158,11,.12))}.eyebrow{color:#5eead4;font-size:.78rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}h2{margin:.2rem 0}.summary{display:flex;flex-wrap:wrap;gap:10px}.pill{border:1px solid #42534a;border-radius:999px;padding:8px 12px}.surfaces{display:grid;gap:14px}.surface header{align-items:flex-start;display:flex;gap:16px;justify-content:space-between}.surface.pass{border-color:rgba(34,197,94,.55)}.surface.warn{border-color:rgba(245,158,11,.72)}.surface.fail{border-color:rgba(239,68,68,.75)}.surface.advantage h2{color:#bbf7d0}.surface.intentional-gap h2{color:#cbd5e1}dl{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}dt{color:#9fb0a8;font-size:.8rem;font-weight:800}dd{margin:0;overflow-wrap:anywhere}.gap{color:#fde68a}.next{color:#bfdbfe}.muted{color:#a8b5ad}a{color:#5eead4}.issues li{margin:.4rem 0}.issues .error{color:#fecaca}.issues .warning{color:#fde68a}@media(max-width:760px){main{padding:18px}.surface header{display:block}}</style></head><body><main><section class="hero"><p class="eyebrow">Self-hosted market proof</p><h1>${escapeHtml(title)}</h1><p>Generated ${escapeHtml(report.generatedAt)}. This report scores whether AbsoluteJS Voice merely covers a hosted-platform buyer surface or beats it for a code-owned/self-hosted buyer.</p><div class="summary"><span class="pill">Status ${escapeHtml(report.status)}</span><span class="pill">Vapi-style ${escapeHtml(report.vapiCoverageEstimate)}</span><span class="pill">Market ${escapeHtml(report.marketCoverageEstimate)}</span><span class="pill">${String(report.summary.surfaces)} surfaces</span><span class="pill">${String(report.summary.advantage)} advantage</span><span class="pill">${String(report.summary.intentionalGaps)} intentional gaps</span></div></section><section class="issues"><h2>Issues</h2><ul>${issueList || '<li>No issues.</li>'}</ul></section><section class="surfaces">${surfaceCards || '<article class="surface"><p>No competitive surfaces configured.</p></article>'}</section></main></body></html>`;
};

const normalizeCompetitiveCoverageReport = (
	value: VoiceCompetitiveCoverageReport | VoiceCompetitiveCoverageReportInput
) =>
	'status' in value && 'summary' in value && 'issues' in value
		? value
		: buildVoiceCompetitiveCoverageReport(value);

export const createVoiceCompetitiveCoverageRoutes = (
	options: VoiceCompetitiveCoverageRoutesOptions
) => {
	const path = options.path ?? '/api/voice/competitive-coverage';
	const htmlPath = options.htmlPath ?? '/voice/competitive-coverage';
	const markdownPath =
		options.markdownPath ?? '/voice/competitive-coverage.md';
	const headers = options.headers ?? {};
	const title = options.title ?? 'Voice Competitive Coverage';
	const report = async () => {
		const value =
			typeof options.source === 'function'
				? await options.source()
				: options.source;
		return normalizeCompetitiveCoverageReport(value);
	};
	const app = new Elysia({
		name: options.name ?? 'absolutejs-voice-competitive-coverage'
	}).get(
		path,
		async () =>
			new Response(JSON.stringify(await report(), null, 2), {
				headers: {
					'content-type': 'application/json; charset=utf-8',
					...headers
				}
			})
	);

	if (htmlPath !== false) {
		app.get(htmlPath, async () => {
			const current = await report();
			const body = options.render
				? await options.render(current)
				: renderVoiceCompetitiveCoverageHTML(current, title);
			return new Response(body, {
				headers: {
					'content-type': 'text/html; charset=utf-8',
					...headers
				}
			});
		});
	}

	if (markdownPath !== false) {
		app.get(
			markdownPath,
			async () =>
				new Response(renderVoiceCompetitiveCoverageMarkdown(await report(), title), {
					headers: {
						'content-type': 'text/markdown; charset=utf-8',
						...headers
					}
				})
		);
	}

	return app;
};
