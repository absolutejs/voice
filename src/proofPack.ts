import { Elysia } from 'elysia';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
	VoiceObservabilityExportArtifact,
	VoiceObservabilityExportReport
} from './observabilityExport';

export type VoiceProofPackStatus = 'fail' | 'pass' | 'warn';

export type VoiceProofPackEvidence = {
	detail?: string;
	href?: string;
	label: string;
	status?: VoiceProofPackStatus;
	value?: number | string;
};

export type VoiceProofPackSection = {
	evidence?: VoiceProofPackEvidence[];
	status?: VoiceProofPackStatus;
	summary?: string;
	title: string;
};

export type VoiceProofPack = {
	artifacts: VoiceObservabilityExportArtifact[];
	generatedAt: string;
	ok: boolean;
	outputDir?: string;
	runId: string;
	sections: VoiceProofPackSection[];
	status: VoiceProofPackStatus;
	summary: {
		fail: number;
		pass: number;
		sections: number;
		warn: number;
	};
};

export type VoiceProofPackInput = {
	artifacts?: VoiceObservabilityExportArtifact[];
	generatedAt?: number | string;
	outputDir?: string;
	runId?: string;
	sections?: VoiceProofPackSection[];
};

export type VoiceProofPackWriteResult = {
	artifacts: VoiceObservabilityExportArtifact[];
	jsonPath: string;
	markdownPath: string;
	proofPack: VoiceProofPack;
};

export type VoiceProofPackRoutesOptions = {
	headers?: HeadersInit;
	jsonPath?: false | string;
	markdownPath?: false | string;
	name?: string;
	source:
		| VoiceProofPack
		| VoiceProofPackInput
		| (() => VoiceProofPack | VoiceProofPackInput | Promise<VoiceProofPack | VoiceProofPackInput>);
};

const toGeneratedAt = (value: number | string | undefined) =>
	value === undefined
		? new Date().toISOString()
		: typeof value === 'number'
			? new Date(value).toISOString()
			: value;

const summarizeProofPackSections = (sections: VoiceProofPackSection[]) => {
	let pass = 0;
	let warn = 0;
	let fail = 0;

	for (const section of sections) {
		const statuses = [
			section.status,
			...(section.evidence ?? []).map((evidence) => evidence.status)
		].filter((status): status is VoiceProofPackStatus => Boolean(status));
		if (statuses.some((status) => status === 'fail')) {
			fail += 1;
		} else if (statuses.some((status) => status === 'warn')) {
			warn += 1;
		} else {
			pass += 1;
		}
	}

	return { fail, pass, sections: sections.length, warn };
};

const resolveProofPack = async (
	source: VoiceProofPackRoutesOptions['source']
): Promise<VoiceProofPack> => {
	const input = typeof source === 'function' ? await source() : source;
	return buildVoiceProofPack(input);
};

export const buildVoiceProofPack = (
	input: VoiceProofPackInput | VoiceProofPack
): VoiceProofPack => {
	if (
		'status' in input &&
		'ok' in input &&
		'summary' in input &&
		Array.isArray(input.sections)
	) {
		return input;
	}

	const sections = input.sections ?? [];
	const summary = summarizeProofPackSections(sections);
	const status: VoiceProofPackStatus =
		summary.fail > 0 ? 'fail' : summary.warn > 0 ? 'warn' : 'pass';

	return {
		artifacts: input.artifacts ?? [],
		generatedAt: toGeneratedAt(input.generatedAt),
		ok: status === 'pass',
		outputDir: input.outputDir,
		runId: input.runId ?? `voice-proof-pack-${crypto.randomUUID()}`,
		sections,
		status,
		summary
	};
};

export const buildVoiceProofPackFromObservabilityExport = (
	report: VoiceObservabilityExportReport,
	input: Omit<VoiceProofPackInput, 'artifacts' | 'sections'> = {}
): VoiceProofPack =>
	buildVoiceProofPack({
		...input,
		artifacts: report.artifacts,
		generatedAt: input.generatedAt ?? report.checkedAt,
		sections: [
			{
				evidence: [
					{
						label: 'Trace events',
						status: report.summary.traceEvents > 0 ? 'pass' : 'warn',
						value: report.summary.traceEvents
					},
					{
						label: 'Audit events',
						status: report.summary.auditEvents > 0 ? 'pass' : 'warn',
						value: report.summary.auditEvents
					},
					{
						label: 'Artifacts',
						status: report.artifacts.some((artifact) => artifact.status === 'fail')
							? 'fail'
							: report.artifacts.some((artifact) => artifact.status === 'warn')
								? 'warn'
								: 'pass',
						value: report.artifacts.length
					}
				],
				status: report.status,
				summary: 'Customer-owned observability export evidence.',
				title: 'Observability export'
			},
			{
				evidence: report.issues.map((issue) => ({
					detail: issue.detail,
					label: issue.label,
					status: issue.severity,
					value: issue.value
				})),
				status: report.status,
				summary:
					report.issues.length === 0
						? 'No export issues were reported.'
						: `${report.issues.length} export issue(s) were reported.`,
				title: 'Export issues'
			}
		]
	});

export const renderVoiceProofPackMarkdown = (proofPack: VoiceProofPack) => {
	const sections = proofPack.sections
		.map((section) => {
			const evidence = (section.evidence ?? [])
				.map((item) => {
					const value = item.value === undefined ? '' : `: ${String(item.value)}`;
					const href = item.href ? ` (${item.href})` : '';
					const detail = item.detail ? ` - ${item.detail}` : '';
					return `- ${item.label}${value}${href} - ${item.status ?? 'pass'}${detail}`;
				})
				.join('\n');

			return [
				`## ${section.title}`,
				'',
				section.summary ?? '',
				'',
				evidence
			]
				.filter(Boolean)
				.join('\n');
		})
		.join('\n\n');

	return [
		'# AbsoluteJS Voice Proof Pack',
		'',
		`Run: ${proofPack.runId}`,
		`Generated: ${proofPack.generatedAt}`,
		`Status: ${proofPack.status}`,
		'',
		`Sections: ${proofPack.summary.sections}`,
		`Passing sections: ${proofPack.summary.pass}`,
		`Warning sections: ${proofPack.summary.warn}`,
		`Failing sections: ${proofPack.summary.fail}`,
		'',
		sections
	]
		.filter(Boolean)
		.join('\n');
};

export const writeVoiceProofPack = async (
	input: VoiceProofPackInput | VoiceProofPack,
	options: {
		jsonFileName?: string;
		markdownFileName?: string;
		outputDir: string;
	} = { outputDir: '.voice-runtime/proof-pack' }
): Promise<VoiceProofPackWriteResult> => {
	const proofPack = buildVoiceProofPack({
		...input,
		outputDir: options.outputDir
	});
	const jsonPath = join(options.outputDir, options.jsonFileName ?? 'latest.json');
	const markdownPath = join(
		options.outputDir,
		options.markdownFileName ?? 'latest.md'
	);

	await mkdir(dirname(jsonPath), { recursive: true });
	await mkdir(dirname(markdownPath), { recursive: true });
	await Promise.all([
		Bun.write(jsonPath, JSON.stringify(proofPack, null, 2)),
		Bun.write(markdownPath, renderVoiceProofPackMarkdown(proofPack))
	]);

	return {
		artifacts: createVoiceProofPackArtifacts({
			jsonPath,
			markdownPath,
			proofPack
		}),
		jsonPath,
		markdownPath,
		proofPack
	};
};

export const createVoiceProofPackArtifacts = (input: {
	jsonPath?: string;
	markdownPath?: string;
	proofPack: VoiceProofPack;
}): VoiceObservabilityExportArtifact[] => [
	...(input.markdownPath
		? [
				{
					generatedAt: input.proofPack.generatedAt,
					id: 'latest-proof-pack',
					kind: 'proof-pack' as const,
					label: 'Latest proof pack',
					metadata: {
						proofPackStatus: input.proofPack.status,
						runId: input.proofPack.runId
					},
					path: input.markdownPath,
					required: false,
					status: 'pass' as const
				}
			]
		: []),
	...(input.jsonPath
		? [
				{
					contentType: 'application/json',
					generatedAt: input.proofPack.generatedAt,
					id: 'latest-proof-pack-json',
					kind: 'proof-pack' as const,
					label: 'Latest proof pack JSON',
					metadata: {
						proofPackStatus: input.proofPack.status,
						runId: input.proofPack.runId
					},
					path: input.jsonPath,
					required: false,
					status: 'pass' as const
				}
			]
		: [])
];

export const createVoiceProofPackRoutes = (
	options: VoiceProofPackRoutesOptions
) => {
	const jsonPath = options.jsonPath ?? '/api/voice/proof-pack';
	const markdownPath = options.markdownPath ?? '/voice/proof-pack.md';
	const app = new Elysia({ name: options.name ?? 'voice-proof-pack' });

	if (jsonPath !== false) {
		app.get(
			jsonPath,
			async () => new Response(JSON.stringify(await resolveProofPack(options.source), null, 2), {
				headers: {
					'content-type': 'application/json; charset=utf-8',
					...options.headers
				}
			})
		);
	}

	if (markdownPath !== false) {
		app.get(
			markdownPath,
			async () =>
				new Response(
					renderVoiceProofPackMarkdown(await resolveProofPack(options.source)),
					{
						headers: {
							'content-type': 'text/markdown; charset=utf-8',
							...options.headers
						}
					}
				)
		);
	}

	return app;
};
