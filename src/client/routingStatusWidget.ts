import type { VoiceRoutingDecisionSummary } from '../resilienceRoutes';
import {
	createVoiceRoutingStatusStore,
	type VoiceRoutingStatusClientOptions,
	type VoiceRoutingStatusSnapshot
} from './routingStatus';

export type VoiceRoutingStatusViewModel = {
	decision: VoiceRoutingDecisionSummary | null;
	description: string;
	error: string | null;
	isLoading: boolean;
	label: string;
	rows: Array<{ label: string; value: string }>;
	status: 'empty' | 'error' | 'loading' | 'ready';
	title: string;
	updatedAt?: number;
};

export type VoiceRoutingStatusWidgetOptions = VoiceRoutingStatusClientOptions & {
	description?: string;
	title?: string;
};

const DEFAULT_TITLE = 'Voice Routing';
const DEFAULT_DESCRIPTION =
	'Latest provider routing decision from the self-hosted trace store.';

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const formatValue = (value: unknown, fallback = 'None') =>
	typeof value === 'string' && value.trim()
		? value
		: typeof value === 'number' && Number.isFinite(value)
			? String(value)
			: fallback;

export const createVoiceRoutingStatusViewModel = (
	snapshot: VoiceRoutingStatusSnapshot,
	options: VoiceRoutingStatusWidgetOptions = {}
): VoiceRoutingStatusViewModel => {
	const decision = snapshot.decision;
	const rows = decision
		? [
				{ label: 'Kind', value: decision.kind.toUpperCase() },
				{ label: 'Policy', value: formatValue(decision.routing, 'Unknown') },
				{ label: 'Provider', value: formatValue(decision.provider, 'Unknown') },
				{
					label: 'Selected',
					value: formatValue(decision.selectedProvider, 'Unknown')
				},
				{
					label: 'Fallback',
					value: formatValue(decision.fallbackProvider)
				},
				{ label: 'Status', value: formatValue(decision.status, 'unknown') },
				{
					label: 'Latency budget',
					value:
						typeof decision.latencyBudgetMs === 'number'
							? `${decision.latencyBudgetMs}ms`
							: 'None'
				}
			]
		: [];

	return {
		decision,
		description: options.description ?? DEFAULT_DESCRIPTION,
		error: snapshot.error,
		isLoading: snapshot.isLoading,
		label: snapshot.error
			? 'Unavailable'
			: decision
				? `${formatValue(decision.kind).toUpperCase()} ${formatValue(decision.status, 'unknown')}`
				: snapshot.isLoading
					? 'Checking'
					: 'No routing yet',
		rows,
		status: snapshot.error
			? 'error'
			: decision
				? 'ready'
				: snapshot.isLoading
					? 'loading'
					: 'empty',
		title: options.title ?? DEFAULT_TITLE,
		updatedAt: snapshot.updatedAt
	};
};

export const renderVoiceRoutingStatusHTML = (
	snapshot: VoiceRoutingStatusSnapshot,
	options: VoiceRoutingStatusWidgetOptions = {}
) => {
	const model = createVoiceRoutingStatusViewModel(snapshot, options);
	const rows = model.rows.length
		? `<div class="absolute-voice-routing-status__grid">${model.rows
				.map(
					(row) => `<div>
  <span>${escapeHtml(row.label)}</span>
  <strong>${escapeHtml(row.value)}</strong>
</div>`
				)
				.join('')}</div>`
		: '<p class="absolute-voice-routing-status__empty">Start a voice session to see the selected provider.</p>';

	return `<section class="absolute-voice-routing-status absolute-voice-routing-status--${escapeHtml(model.status)}">
  <header class="absolute-voice-routing-status__header">
    <span class="absolute-voice-routing-status__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-routing-status__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-routing-status__description">${escapeHtml(model.description)}</p>
  ${rows}
  ${model.error ? `<p class="absolute-voice-routing-status__error">${escapeHtml(model.error)}</p>` : ''}
</section>`;
};

export const getVoiceRoutingStatusCSS = () => `.absolute-voice-routing-status{border:1px solid #d8d2c4;border-radius:20px;background:#fffaf0;color:#16130d;padding:18px;box-shadow:0 18px 40px rgba(47,37,18,.12);font-family:inherit}.absolute-voice-routing-status--error{border-color:#f2a7a7;background:#fff5f3}.absolute-voice-routing-status__header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-routing-status__eyebrow{color:#73664f;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-routing-status__label{font-size:24px;line-height:1}.absolute-voice-routing-status__description{color:#514733;margin:12px 0 0}.absolute-voice-routing-status__grid{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:14px}.absolute-voice-routing-status__grid div{background:#fff;border:1px solid #eee4d2;border-radius:14px;padding:10px 12px}.absolute-voice-routing-status__grid span{color:#655944;display:block;font-size:12px;margin-bottom:4px}.absolute-voice-routing-status__grid strong{overflow-wrap:anywhere}.absolute-voice-routing-status__empty{color:#655944;margin:14px 0 0}.absolute-voice-routing-status__error{color:#9f1239;font-weight:700}`;

export const mountVoiceRoutingStatus = (
	element: Element,
	path = '/api/routing/latest',
	options: VoiceRoutingStatusWidgetOptions = {}
) => {
	const store = createVoiceRoutingStatusStore(path, options);
	const render = () => {
		element.innerHTML = renderVoiceRoutingStatusHTML(store.getSnapshot(), options);
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

export const defineVoiceRoutingStatusElement = (
	tagName = 'absolute-voice-routing-status'
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
		class AbsoluteVoiceRoutingStatusElement extends HTMLElement {
			private mounted?: ReturnType<typeof mountVoiceRoutingStatus>;

			connectedCallback() {
				const intervalMs = Number(this.getAttribute('interval-ms') ?? 5000);
				this.mounted = mountVoiceRoutingStatus(
					this,
					this.getAttribute('path') ?? '/api/routing/latest',
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
