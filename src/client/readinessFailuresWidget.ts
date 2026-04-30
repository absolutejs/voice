import type {
	VoiceProductionReadinessCheck,
	VoiceProductionReadinessGateExplanation
} from '../productionReadiness';
import {
	createVoiceReadinessFailuresStore,
	type VoiceReadinessFailuresClientOptions,
	type VoiceReadinessFailuresSnapshot
} from './readinessFailures';

export type VoiceReadinessFailureView = {
	evidenceHref?: string;
	label: string;
	observed: string;
	remediation: string;
	sourceHref?: string;
	status: VoiceProductionReadinessCheck['status'];
	threshold: string;
	thresholdLabel: string;
};

export type VoiceReadinessFailuresViewModel = {
	description: string;
	error: string | null;
	failures: VoiceReadinessFailureView[];
	isLoading: boolean;
	label: string;
	links: Array<{ href: string; label: string }>;
	status: 'empty' | 'error' | 'loading' | 'ready' | 'warning';
	title: string;
	updatedAt?: number;
};

export type VoiceReadinessFailuresWidgetOptions =
	VoiceReadinessFailuresClientOptions & {
		description?: string;
		links?: Array<{ href: string; label: string }>;
		title?: string;
	};

const DEFAULT_TITLE = 'Readiness Gate Explanations';
const DEFAULT_DESCRIPTION =
	'Structured reasons for calibrated production-readiness warnings and failures.';
const DEFAULT_LINKS = [
	{ href: '/production-readiness', label: 'Readiness page' },
	{ href: '/voice/slo-readiness-thresholds', label: 'Gate thresholds' }
];

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const formatExplanationValue = (
	value: VoiceProductionReadinessGateExplanation['observed'],
	unit: VoiceProductionReadinessGateExplanation['unit']
) => {
	if (value === undefined || value === null) {
		return 'n/a';
	}
	const suffix = unit && unit !== 'status' ? ` ${unit}` : '';
	return `${String(value)}${suffix}`;
};

const toFailureView = (
	check: VoiceProductionReadinessCheck
): VoiceReadinessFailureView | undefined => {
	const explanation = check.gateExplanation;
	if (!explanation || check.status === 'pass') {
		return undefined;
	}

	return {
		evidenceHref: explanation.evidenceHref ?? check.href,
		label: check.label,
		observed: formatExplanationValue(explanation.observed, explanation.unit),
		remediation: explanation.remediation,
		sourceHref: explanation.sourceHref,
		status: check.status,
		threshold: formatExplanationValue(explanation.threshold, explanation.unit),
		thresholdLabel: explanation.thresholdLabel ?? 'Readiness threshold'
	};
};

export const createVoiceReadinessFailuresViewModel = (
	snapshot: VoiceReadinessFailuresSnapshot,
	options: VoiceReadinessFailuresWidgetOptions = {}
): VoiceReadinessFailuresViewModel => {
	const failures =
		snapshot.report?.checks
			.map(toFailureView)
			.filter((value): value is VoiceReadinessFailureView => !!value) ?? [];
	const hasOpenIssues = failures.length > 0;

	return {
		description: options.description ?? DEFAULT_DESCRIPTION,
		error: snapshot.error,
		failures,
		isLoading: snapshot.isLoading,
		label: snapshot.error
			? 'Unavailable'
			: snapshot.report
				? hasOpenIssues
					? `${failures.length} calibrated gate issue(s)`
					: 'No calibrated gate issues'
				: snapshot.isLoading
					? 'Checking'
					: 'No readiness report',
		links: options.links ?? DEFAULT_LINKS,
		status: snapshot.error
			? 'error'
			: snapshot.report
				? hasOpenIssues
					? 'warning'
					: 'ready'
				: snapshot.isLoading
					? 'loading'
					: 'empty',
		title: options.title ?? DEFAULT_TITLE,
		updatedAt: snapshot.updatedAt
	};
};

export const renderVoiceReadinessFailuresHTML = (
	snapshot: VoiceReadinessFailuresSnapshot,
	options: VoiceReadinessFailuresWidgetOptions = {}
) => {
	const model = createVoiceReadinessFailuresViewModel(snapshot, options);
	const failures = model.failures.length
		? `<div class="absolute-voice-readiness-failures__items">${model.failures
				.map(
					(failure) => `<article class="absolute-voice-readiness-failures__item absolute-voice-readiness-failures__item--${escapeHtml(failure.status)}">
  <span>${escapeHtml(failure.status.toUpperCase())}</span>
  <strong>${escapeHtml(failure.label)}</strong>
  <p>Observed ${escapeHtml(failure.observed)} against ${escapeHtml(failure.thresholdLabel)} ${escapeHtml(failure.threshold)}.</p>
  <p>${escapeHtml(failure.remediation)}</p>
  <p class="absolute-voice-readiness-failures__links">${failure.evidenceHref ? `<a href="${escapeHtml(failure.evidenceHref)}">Evidence</a>` : ''}${failure.sourceHref ? `<a href="${escapeHtml(failure.sourceHref)}">Threshold source</a>` : ''}</p>
</article>`
				)
				.join('')}</div>`
		: `<p class="absolute-voice-readiness-failures__empty">${
				model.error
					? escapeHtml(model.error)
					: 'No calibrated readiness gate explanations are open.'
			}</p>`;
	const links = model.links.length
		? `<p class="absolute-voice-readiness-failures__links">${model.links
				.map(
					(link) =>
						`<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`
				)
				.join('')}</p>`
		: '';

	return `<section class="absolute-voice-readiness-failures absolute-voice-readiness-failures--${escapeHtml(model.status)}">
  <header class="absolute-voice-readiness-failures__header">
    <span class="absolute-voice-readiness-failures__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-readiness-failures__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-readiness-failures__description">${escapeHtml(model.description)}</p>
  ${failures}
  ${links}
  ${model.error ? `<p class="absolute-voice-readiness-failures__error">${escapeHtml(model.error)}</p>` : ''}
</section>`;
};

export const getVoiceReadinessFailuresCSS = () =>
	`.absolute-voice-readiness-failures{border:1px solid #fed7aa;border-radius:20px;background:#fff7ed;color:#1c1917;padding:18px;box-shadow:0 18px 40px rgba(234,88,12,.12);font-family:inherit}.absolute-voice-readiness-failures--ready{border-color:#86efac;background:#f0fdf4}.absolute-voice-readiness-failures--error{border-color:#fda4af;background:#fff1f2}.absolute-voice-readiness-failures__header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-readiness-failures__eyebrow{color:#9a3412;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-readiness-failures__label{font-size:24px;line-height:1}.absolute-voice-readiness-failures__description,.absolute-voice-readiness-failures__empty{color:#57534e}.absolute-voice-readiness-failures__items{display:grid;gap:10px;margin-top:14px}.absolute-voice-readiness-failures__item{background:white;border:1px solid #fed7aa;border-radius:16px;padding:12px}.absolute-voice-readiness-failures__item--fail{border-color:#fb7185}.absolute-voice-readiness-failures__item span{color:#9a3412;display:block;font-size:12px;font-weight:900;text-transform:uppercase}.absolute-voice-readiness-failures__item strong{display:block;font-size:18px;margin-top:4px}.absolute-voice-readiness-failures__item p{margin:.45rem 0 0}.absolute-voice-readiness-failures__links{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}.absolute-voice-readiness-failures__links a{border:1px solid #fdba74;border-radius:999px;color:#9a3412;font-weight:800;padding:6px 10px;text-decoration:none}.absolute-voice-readiness-failures__error{color:#9f1239;font-weight:700}`;

export const mountVoiceReadinessFailures = (
	element: Element,
	path = '/api/production-readiness',
	options: VoiceReadinessFailuresWidgetOptions = {}
) => {
	const store = createVoiceReadinessFailuresStore(path, options);
	const render = () => {
		element.innerHTML = renderVoiceReadinessFailuresHTML(
			store.getSnapshot(),
			options
		);
	};
	const unsubscribe = store.subscribe(render);
	render();
	void store.refresh().catch(() => {});

	return {
		close: () => {
			unsubscribe();
			store.close();
		},
		refresh: store.refresh
	};
};

export const defineVoiceReadinessFailuresElement = (
	tagName = 'absolute-voice-readiness-failures'
) => {
	if (
		typeof window === 'undefined' ||
		typeof customElements === 'undefined' ||
		customElements.get(tagName)
	) {
		return;
	}

	customElements.define(
		tagName,
		class AbsoluteVoiceReadinessFailuresElement extends HTMLElement {
			private mounted?: ReturnType<typeof mountVoiceReadinessFailures>;

			connectedCallback() {
				this.mounted = mountVoiceReadinessFailures(
					this,
					this.getAttribute('path') ?? '/api/production-readiness',
					{
						description: this.getAttribute('description') ?? undefined,
						intervalMs: Number(this.getAttribute('interval-ms') ?? 0) || undefined,
						title: this.getAttribute('title') ?? undefined
					}
				);
			}

			disconnectedCallback() {
				this.mounted?.close();
				this.mounted = undefined;
			}
		}
	);
};
