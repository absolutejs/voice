import type {
	VoiceProviderHealthStatus,
	VoiceProviderHealthSummary
} from '../providerHealth';
import {
	createVoiceProviderStatusStore,
	type VoiceProviderStatusClientOptions,
	type VoiceProviderStatusSnapshot
} from './providerStatus';

export type VoiceProviderStatusCardView<
	TProvider extends string = string
> = VoiceProviderHealthSummary<TProvider> & {
	detail: string;
	label: string;
	rows: Array<{ label: string; value: string }>;
};

export type VoiceProviderStatusViewModel<
	TProvider extends string = string
> = {
	description: string;
	error: string | null;
	isLoading: boolean;
	label: string;
	providers: VoiceProviderStatusCardView<TProvider>[];
	status: 'empty' | 'error' | 'loading' | 'ready' | 'warning';
	title: string;
	updatedAt?: number;
};

export type VoiceProviderStatusWidgetOptions = VoiceProviderStatusClientOptions & {
	description?: string;
	title?: string;
};

const DEFAULT_TITLE = 'Voice Providers';
const DEFAULT_DESCRIPTION =
	'Live provider health, fallback counts, latency, and suppression state from your self-hosted trace store.';

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const formatProvider = (provider: string) =>
	provider
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
		.join(' ') || provider;

const formatStatus = (status: VoiceProviderHealthStatus) =>
	status
		.split('-')
		.map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
		.join(' ');

const formatLatency = (value: number | undefined) =>
	typeof value === 'number' ? `${value}ms` : 'No samples';

const formatSuppression = (value: number | undefined) =>
	typeof value === 'number' ? `${Math.ceil(value / 1000)}s` : 'None';

const getProviderDetail = (provider: VoiceProviderHealthSummary) => {
	if (provider.status === 'suppressed') {
		return provider.lastError
			? `Suppressed for ${formatSuppression(provider.suppressionRemainingMs)} after ${provider.lastError}.`
			: `Suppressed for ${formatSuppression(provider.suppressionRemainingMs)}.`;
	}
	if (provider.status === 'recoverable') {
		return 'Cooldown expired; ready for recovery traffic.';
	}
	if (provider.status === 'rate-limited') {
		return 'Rate limit detected; router should avoid this provider.';
	}
	if (provider.status === 'degraded') {
		return provider.lastError ?? 'Recent provider errors detected.';
	}
	if (provider.status === 'healthy') {
		return provider.recommended
			? 'Healthy and currently recommended.'
			: 'Healthy and available for routing.';
	}
	return 'No provider traffic observed yet.';
};

const isWarningStatus = (status: VoiceProviderHealthStatus) =>
	status === 'degraded' ||
	status === 'rate-limited' ||
	status === 'recoverable' ||
	status === 'suppressed';

export const createVoiceProviderStatusViewModel = <
	TProvider extends string = string
>(
	snapshot: VoiceProviderStatusSnapshot<TProvider>,
	options: VoiceProviderStatusWidgetOptions = {}
): VoiceProviderStatusViewModel<TProvider> => {
	const providers = snapshot.providers.map((provider) => ({
		...provider,
		detail: getProviderDetail(provider),
		label: `${formatProvider(provider.provider)}${provider.recommended ? ' recommended' : ''}`,
		rows: [
			{ label: 'Runs', value: String(provider.runCount) },
			{ label: 'Avg latency', value: formatLatency(provider.averageElapsedMs) },
			{ label: 'Errors', value: String(provider.errorCount) },
			{ label: 'Timeouts', value: String(provider.timeoutCount) },
			{ label: 'Fallbacks', value: String(provider.fallbackCount) },
			{
				label: 'Suppression',
				value: formatSuppression(provider.suppressionRemainingMs)
			}
		]
	}));
	const warningCount = providers.filter((provider) =>
		isWarningStatus(provider.status)
	).length;
	const healthyCount = providers.filter(
		(provider) => provider.status === 'healthy'
	).length;

	return {
		description: options.description ?? DEFAULT_DESCRIPTION,
		error: snapshot.error,
		isLoading: snapshot.isLoading,
		label: snapshot.error
			? 'Unavailable'
			: providers.length
				? warningCount > 0
					? `${warningCount} needs attention`
					: `${healthyCount} healthy`
				: snapshot.isLoading
					? 'Checking'
					: 'No provider traffic',
		providers,
		status: snapshot.error
			? 'error'
			: providers.length
				? warningCount > 0
					? 'warning'
					: 'ready'
				: snapshot.isLoading
					? 'loading'
					: 'empty',
		title: options.title ?? DEFAULT_TITLE,
		updatedAt: snapshot.updatedAt
	};
};

export const renderVoiceProviderStatusHTML = <
	TProvider extends string = string
>(
	snapshot: VoiceProviderStatusSnapshot<TProvider>,
	options: VoiceProviderStatusWidgetOptions = {}
) => {
	const model = createVoiceProviderStatusViewModel(snapshot, options);
	const providers = model.providers.length
		? `<div class="absolute-voice-provider-status__providers">${model.providers
				.map(
					(provider) => `<article class="absolute-voice-provider-status__provider absolute-voice-provider-status__provider--${escapeHtml(provider.status)}">
  <header>
    <strong>${escapeHtml(provider.label)}</strong>
    <span>${escapeHtml(formatStatus(provider.status))}</span>
  </header>
  <p>${escapeHtml(provider.detail)}</p>
  <dl>${provider.rows
		.map(
			(row) => `<div>
    <dt>${escapeHtml(row.label)}</dt>
    <dd>${escapeHtml(row.value)}</dd>
  </div>`
		)
		.join('')}</dl>
</article>`
				)
				.join('')}</div>`
		: '<p class="absolute-voice-provider-status__empty">Run voice traffic to see provider health.</p>';

	return `<section class="absolute-voice-provider-status absolute-voice-provider-status--${escapeHtml(model.status)}">
  <header class="absolute-voice-provider-status__header">
    <span class="absolute-voice-provider-status__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-provider-status__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-provider-status__description">${escapeHtml(model.description)}</p>
  ${providers}
  ${model.error ? `<p class="absolute-voice-provider-status__error">${escapeHtml(model.error)}</p>` : ''}
</section>`;
};

export const getVoiceProviderStatusCSS = () =>
	`.absolute-voice-provider-status{border:1px solid #d8d2c4;border-radius:20px;background:#fffaf0;color:#16130d;padding:18px;box-shadow:0 18px 40px rgba(47,37,18,.12);font-family:inherit}.absolute-voice-provider-status--error,.absolute-voice-provider-status--warning{border-color:#f2a7a7;background:#fff5f3}.absolute-voice-provider-status__header,.absolute-voice-provider-status__provider header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-provider-status__eyebrow{color:#73664f;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-provider-status__label{font-size:24px;line-height:1}.absolute-voice-provider-status__description,.absolute-voice-provider-status__provider p,.absolute-voice-provider-status__provider dt,.absolute-voice-provider-status__empty{color:#514733}.absolute-voice-provider-status__providers{display:grid;gap:12px;margin-top:14px}.absolute-voice-provider-status__provider{background:#fff;border:1px solid #eee4d2;border-radius:16px;padding:14px}.absolute-voice-provider-status__provider--degraded,.absolute-voice-provider-status__provider--rate-limited,.absolute-voice-provider-status__provider--suppressed{border-color:#f2a7a7}.absolute-voice-provider-status__provider--recoverable{border-color:#fbbf24}.absolute-voice-provider-status__provider p{margin:10px 0}.absolute-voice-provider-status__provider dl{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));margin:0}.absolute-voice-provider-status__provider div{background:#fffaf0;border:1px solid #eee4d2;border-radius:12px;padding:8px}.absolute-voice-provider-status__provider dt{font-size:12px}.absolute-voice-provider-status__provider dd{font-weight:800;margin:4px 0 0}.absolute-voice-provider-status__empty{margin:14px 0 0}.absolute-voice-provider-status__error{color:#9f1239;font-weight:700}`;

export const mountVoiceProviderStatus = <TProvider extends string = string>(
	element: Element,
	path = '/api/provider-status',
	options: VoiceProviderStatusWidgetOptions = {}
) => {
	const store = createVoiceProviderStatusStore<TProvider>(path, options);
	const render = () => {
		element.innerHTML = renderVoiceProviderStatusHTML(
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

export const defineVoiceProviderStatusElement = (
	tagName = 'absolute-voice-provider-status'
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
		class AbsoluteVoiceProviderStatusElement extends HTMLElement {
			private mounted?: ReturnType<typeof mountVoiceProviderStatus>;

			connectedCallback() {
				const intervalMs = Number(this.getAttribute('interval-ms') ?? 5000);
				this.mounted = mountVoiceProviderStatus(
					this,
					this.getAttribute('path') ?? '/api/provider-status',
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
