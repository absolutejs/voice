import type { VoiceAppKitStatusReport } from '../appKit';
import {
	createVoiceAppKitStatusStore,
	type VoiceAppKitStatusClientOptions,
	type VoiceAppKitStatusSnapshot
} from './appKitStatus';

export type VoiceOpsStatusSurfaceView = {
	detail: string;
	failed: number;
	id: string;
	label: string;
	status: 'pass' | 'fail';
	total: number;
};

export type VoiceOpsStatusViewModel = {
	description: string;
	error: string | null;
	isLoading: boolean;
	label: string;
	links: Array<{ href: string; label: string }>;
	passed: number;
	status: 'pass' | 'fail' | 'loading' | 'error';
	surfaces: VoiceOpsStatusSurfaceView[];
	title: string;
	total: number;
	updatedAt?: number;
};

export type VoiceOpsStatusWidgetOptions = VoiceAppKitStatusClientOptions & {
	description?: string;
	includeLinks?: boolean;
	title?: string;
};

const DEFAULT_TITLE = 'Voice Ops Status';
const DEFAULT_DESCRIPTION =
	'Certified workflow, provider, and handoff readiness from the AbsoluteJS voice app kit.';

const SURFACE_LABELS: Record<string, string> = {
	handoffs: 'Handoffs',
	providers: 'Providers',
	quality: 'Quality',
	sessions: 'Sessions',
	workflows: 'Workflows'
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const readNumber = (value: unknown, key: string) =>
	value && typeof value === 'object' && key in value
		? Number((value as Record<string, unknown>)[key] ?? 0)
		: 0;

const surfaceDetail = (surface: unknown) => {
	const total = readNumber(surface, 'total');
	const failed = readNumber(surface, 'failed');
	const degraded = readNumber(surface, 'degraded');
	const source =
		surface &&
		typeof surface === 'object' &&
		'source' in surface &&
		typeof (surface as { source?: unknown }).source === 'string'
			? ` from ${(surface as { source: string }).source}`
			: '';

	if (degraded > 0) {
		return `${degraded} degraded of ${total}`;
	}
	if (failed > 0) {
		return `${failed} failing of ${total}${source}`;
	}
	return total > 0 ? `${total} passing${source}` : `No failures${source}`;
};

export const getVoiceOpsStatusLabel = (
	report?: VoiceAppKitStatusReport | null,
	error?: string | null
) => {
	if (error) {
		return 'Unavailable';
	}
	if (!report) {
		return 'Checking';
	}
	return report.status === 'pass' ? 'Passing' : 'Needs attention';
};

export const createVoiceOpsStatusViewModel = (
	snapshot: VoiceAppKitStatusSnapshot,
	options: VoiceOpsStatusWidgetOptions = {}
): VoiceOpsStatusViewModel => {
	const report = snapshot.report;
	const surfaces = Object.entries(report?.surfaces ?? {}).map(([id, surface]) => {
		const failed = readNumber(surface, 'failed') || readNumber(surface, 'degraded');
		const total = readNumber(surface, 'total');
		const status =
			surface && typeof surface === 'object' && 'status' in surface
				? ((surface as { status?: 'pass' | 'fail' }).status ?? 'pass')
				: 'pass';

		return {
			detail: surfaceDetail(surface),
			failed,
			id,
			label: SURFACE_LABELS[id] ?? id,
			status,
			total
		};
	});

	return {
		description: options.description ?? DEFAULT_DESCRIPTION,
		error: snapshot.error,
		isLoading: snapshot.isLoading,
		label: getVoiceOpsStatusLabel(report, snapshot.error),
		links: options.includeLinks === false ? [] : (report?.links ?? []),
		passed: report?.passed ?? 0,
		status: snapshot.error
			? 'error'
			: report
				? report.status
				: snapshot.isLoading
					? 'loading'
					: 'loading',
		surfaces,
		title: options.title ?? DEFAULT_TITLE,
		total: report?.total ?? 0,
		updatedAt: snapshot.updatedAt
	};
};

export const renderVoiceOpsStatusHTML = (
	snapshot: VoiceAppKitStatusSnapshot,
	options: VoiceOpsStatusWidgetOptions = {}
) => {
	const model = createVoiceOpsStatusViewModel(snapshot, options);
	const surfaces = model.surfaces.length
		? model.surfaces
				.map(
					(surface) => `<li class="absolute-voice-ops-status__surface absolute-voice-ops-status__surface--${escapeHtml(surface.status)}">
  <span>${escapeHtml(surface.label)}</span>
  <strong>${escapeHtml(surface.detail)}</strong>
</li>`
				)
				.join('')
		: '<li class="absolute-voice-ops-status__surface"><span>Status</span><strong>Waiting for first check</strong></li>';
	const links = model.links.length
		? `<nav class="absolute-voice-ops-status__links">${model.links
				.slice(0, 4)
				.map(
					(link) =>
						`<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`
				)
				.join('')}</nav>`
		: '';

	return `<section class="absolute-voice-ops-status absolute-voice-ops-status--${escapeHtml(model.status)}">
  <header class="absolute-voice-ops-status__header">
    <span class="absolute-voice-ops-status__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-ops-status__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-ops-status__description">${escapeHtml(model.description)}</p>
  <div class="absolute-voice-ops-status__summary">
    <span>${model.passed} passing</span>
    <span>${Math.max(model.total - model.passed, 0)} failing</span>
    <span>${model.total} checks</span>
  </div>
  <ul class="absolute-voice-ops-status__surfaces">${surfaces}</ul>
  ${model.error ? `<p class="absolute-voice-ops-status__error">${escapeHtml(model.error)}</p>` : ''}
  ${links}
</section>`;
};

export const getVoiceOpsStatusCSS = () => `.absolute-voice-ops-status{border:1px solid #d8d2c4;border-radius:20px;background:#fffaf0;color:#16130d;padding:18px;box-shadow:0 18px 40px rgba(47,37,18,.12);font-family:inherit}.absolute-voice-ops-status--fail,.absolute-voice-ops-status--error{border-color:#f2a7a7;background:#fff5f3}.absolute-voice-ops-status__header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-ops-status__eyebrow{color:#73664f;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-ops-status__label{font-size:28px;line-height:1}.absolute-voice-ops-status__description{color:#514733;margin:12px 0 0}.absolute-voice-ops-status__summary,.absolute-voice-ops-status__links{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.absolute-voice-ops-status__summary span,.absolute-voice-ops-status__links a{border:1px solid #e6ddca;border-radius:999px;color:inherit;padding:6px 10px;text-decoration:none}.absolute-voice-ops-status__surfaces{display:grid;gap:8px;list-style:none;margin:16px 0 0;padding:0}.absolute-voice-ops-status__surface{align-items:center;background:#fff;border:1px solid #eee4d2;border-radius:14px;display:flex;gap:12px;justify-content:space-between;padding:10px 12px}.absolute-voice-ops-status__surface--fail{border-color:#f2a7a7}.absolute-voice-ops-status__surface span{color:#655944}.absolute-voice-ops-status__error{color:#9f1239;font-weight:700}`;

export const mountVoiceOpsStatus = (
	element: Element,
	path = '/app-kit/status',
	options: VoiceOpsStatusWidgetOptions = {}
) => {
	const store = createVoiceAppKitStatusStore(path, options);
	const render = () => {
		element.innerHTML = renderVoiceOpsStatusHTML(store.getSnapshot(), options);
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
