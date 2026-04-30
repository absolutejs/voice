import type { VoiceRealCallProfileDefault } from '../proofTrends';
import {
	createVoiceProfileComparisonStore,
	type VoiceProfileComparisonClientOptions,
	type VoiceProfileComparisonSnapshot
} from './profileComparison';

export type VoiceProfileComparisonProfileView = {
	evidence: Array<{ label: string; value: string }>;
	label: string;
	nextMove: string;
	profileId: string;
	providerRoutes: string;
	status: string;
};

export type VoiceProfileComparisonViewModel = {
	description: string;
	error: string | null;
	isLoading: boolean;
	label: string;
	links: Array<{ href: string; label: string }>;
	profiles: VoiceProfileComparisonProfileView[];
	status: 'empty' | 'error' | 'loading' | 'ready' | 'warning';
	title: string;
};

export type VoiceProfileComparisonWidgetOptions =
	VoiceProfileComparisonClientOptions & {
		description?: string;
		links?: Array<{ href: string; label: string }>;
		title?: string;
	};

const DEFAULT_TITLE = 'Profile Stack Comparison';
const DEFAULT_DESCRIPTION =
	'Measured real-call evidence behind each profile default: provider routes, latency, and the next move.';
const DEFAULT_LINKS = [
	{ href: '/voice/real-call-profile-history', label: 'Profile history' },
	{ href: '/api/voice/real-call-profile-history', label: 'JSON' }
];

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const formatMs = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value)
		? `${Math.round(value)}ms`
		: 'n/a';

const formatProviderRoutes = (profile: VoiceRealCallProfileDefault) =>
	Object.entries(profile.providerRoutes)
		.map(([role, provider]) => `${role}: ${provider}`)
		.join(', ') || 'No complete route yet';

const createProfileView = (
	profile: VoiceRealCallProfileDefault
): VoiceProfileComparisonProfileView => ({
	evidence: [
		{ label: 'Live p95', value: formatMs(profile.evidence.liveP95Ms) },
		{ label: 'Provider p95', value: formatMs(profile.evidence.providerP95Ms) },
		{ label: 'Turn p95', value: formatMs(profile.evidence.turnP95Ms) }
	],
	label: profile.label ?? profile.profileId,
	nextMove: profile.nextMove,
	profileId: profile.profileId,
	providerRoutes: formatProviderRoutes(profile),
	status: profile.status
});

export const createVoiceProfileComparisonViewModel = (
	snapshot: VoiceProfileComparisonSnapshot,
	options: VoiceProfileComparisonWidgetOptions = {}
): VoiceProfileComparisonViewModel => {
	const report = snapshot.report;
	const profiles = report?.defaults.profiles.map(createProfileView) ?? [];

	return {
		description: options.description ?? DEFAULT_DESCRIPTION,
		error: snapshot.error,
		isLoading: snapshot.isLoading,
		label: snapshot.error
			? 'Unavailable'
			: report
				? `${report.defaults.summary.actionableProfiles}/${report.defaults.summary.profileCount} profiles ready`
				: snapshot.isLoading
					? 'Checking'
					: 'No profile evidence',
		links: options.links ?? DEFAULT_LINKS,
		profiles,
		status: snapshot.error
			? 'error'
			: report
				? report.status === 'pass'
					? 'ready'
					: 'warning'
				: snapshot.isLoading
					? 'loading'
					: 'empty',
		title: options.title ?? DEFAULT_TITLE
	};
};

export const renderVoiceProfileComparisonHTML = (
	snapshot: VoiceProfileComparisonSnapshot,
	options: VoiceProfileComparisonWidgetOptions = {}
) => {
	const model = createVoiceProfileComparisonViewModel(snapshot, options);
	const profiles = model.profiles.length
		? `<div class="absolute-voice-profile-comparison__profiles">${model.profiles
				.map(
					(profile) => `<article class="absolute-voice-profile-comparison__profile absolute-voice-profile-comparison__profile--${escapeHtml(profile.status)}">
  <header>
    <span>${escapeHtml(profile.status)}</span>
    <strong>${escapeHtml(profile.label)}</strong>
  </header>
  <p>${escapeHtml(profile.providerRoutes)}</p>
  <div>${profile.evidence
		.map(
			(metric) => `<span><small>${escapeHtml(metric.label)}</small><b>${escapeHtml(metric.value)}</b></span>`
		)
		.join('')}</div>
  <em>${escapeHtml(profile.nextMove)}</em>
</article>`
				)
				.join('')}</div>`
		: `<p class="absolute-voice-profile-comparison__empty">${
				model.error
					? escapeHtml(model.error)
					: 'Run real-call profile collection to populate profile comparisons.'
			}</p>`;
	const links = model.links.length
		? `<p class="absolute-voice-profile-comparison__links">${model.links
				.map(
					(link) =>
						`<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`
				)
				.join('')}</p>`
		: '';

	return `<section class="absolute-voice-profile-comparison absolute-voice-profile-comparison--${escapeHtml(model.status)}">
  <header class="absolute-voice-profile-comparison__header">
    <span class="absolute-voice-profile-comparison__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-profile-comparison__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-profile-comparison__description">${escapeHtml(model.description)}</p>
  ${profiles}
  ${links}
  ${model.error ? `<p class="absolute-voice-profile-comparison__error">${escapeHtml(model.error)}</p>` : ''}
</section>`;
};

export const getVoiceProfileComparisonCSS = () =>
	`.absolute-voice-profile-comparison{border:1px solid #c7d2fe;border-radius:20px;background:#eef2ff;color:#111827;padding:18px;box-shadow:0 18px 40px rgba(79,70,229,.12);font-family:inherit}.absolute-voice-profile-comparison--warning,.absolute-voice-profile-comparison--error{border-color:#fbbf24;background:#fffbeb}.absolute-voice-profile-comparison__header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-profile-comparison__eyebrow{color:#4338ca;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-profile-comparison__label{font-size:24px;line-height:1}.absolute-voice-profile-comparison__description,.absolute-voice-profile-comparison__empty{color:#4b5563}.absolute-voice-profile-comparison__profiles{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:14px}.absolute-voice-profile-comparison__profile{background:#fff;border:1px solid #c7d2fe;border-radius:16px;padding:14px}.absolute-voice-profile-comparison__profile--warn{border-color:#fbbf24}.absolute-voice-profile-comparison__profile--fail{border-color:#f87171}.absolute-voice-profile-comparison__profile header{align-items:center;display:flex;gap:8px;justify-content:space-between}.absolute-voice-profile-comparison__profile header span{border:1px solid currentColor;border-radius:999px;color:#4338ca;font-size:11px;font-weight:900;padding:3px 7px;text-transform:uppercase}.absolute-voice-profile-comparison__profile p{color:#1f2937;font-weight:800;overflow-wrap:anywhere}.absolute-voice-profile-comparison__profile div{display:grid;gap:8px;grid-template-columns:repeat(3,minmax(0,1fr))}.absolute-voice-profile-comparison__profile small{color:#6b7280;display:block;font-size:11px}.absolute-voice-profile-comparison__profile b{display:block}.absolute-voice-profile-comparison__profile em{color:#4b5563;display:block;font-size:13px;margin-top:12px}.absolute-voice-profile-comparison__links{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}.absolute-voice-profile-comparison__links a{border:1px solid #a5b4fc;border-radius:999px;color:#4338ca;font-weight:800;padding:6px 10px;text-decoration:none}.absolute-voice-profile-comparison__error{color:#9f1239;font-weight:700}`;

export const mountVoiceProfileComparison = (
	element: Element,
	path = '/api/voice/real-call-profile-history',
	options: VoiceProfileComparisonWidgetOptions = {}
) => {
	const store = createVoiceProfileComparisonStore(path, options);
	const render = () => {
		element.innerHTML = renderVoiceProfileComparisonHTML(
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

export const defineVoiceProfileComparisonElement = (
	tagName = 'absolute-voice-profile-comparison'
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
		class AbsoluteVoiceProfileComparisonElement extends HTMLElement {
			private mounted?: ReturnType<typeof mountVoiceProfileComparison>;

			connectedCallback() {
				const intervalMs = Number(this.getAttribute('interval-ms') ?? 5000);
				this.mounted = mountVoiceProfileComparison(
					this,
					this.getAttribute('path') ?? '/api/voice/real-call-profile-history',
					{
						description: this.getAttribute('description') ?? undefined,
						intervalMs: Number.isFinite(intervalMs) ? intervalMs : 5000,
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
