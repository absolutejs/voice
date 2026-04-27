import type {
	VoiceProviderCapabilityKind,
	VoiceProviderCapabilitySummary
} from '../providerCapabilities';
import {
	createVoiceProviderCapabilitiesStore,
	type VoiceProviderCapabilitiesClientOptions,
	type VoiceProviderCapabilitiesSnapshot
} from './providerCapabilities';

export type VoiceProviderCapabilityCardView<
	TProvider extends string = string
> = VoiceProviderCapabilitySummary<TProvider> & {
	detail: string;
	label: string;
	rows: Array<{ label: string; value: string }>;
};

export type VoiceProviderCapabilitiesViewModel<
	TProvider extends string = string
> = {
	capabilities: VoiceProviderCapabilityCardView<TProvider>[];
	description: string;
	error: string | null;
	isLoading: boolean;
	label: string;
	status: 'empty' | 'error' | 'loading' | 'ready' | 'warning';
	title: string;
	updatedAt?: number;
};

export type VoiceProviderCapabilitiesWidgetOptions =
	VoiceProviderCapabilitiesClientOptions & {
		description?: string;
		title?: string;
	};

const DEFAULT_TITLE = 'Provider Capabilities';
const DEFAULT_DESCRIPTION =
	'Configured, selected, and healthy voice providers for this deployment.';

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

const formatKind = (kind: VoiceProviderCapabilityKind) =>
	kind.toUpperCase();

const formatStatus = (status: string) =>
	status
		.split('-')
		.map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
		.join(' ');

const getCapabilityDetail = (capability: VoiceProviderCapabilitySummary) => {
	if (!capability.configured) {
		return 'Not configured in this deployment.';
	}
	if (capability.selected) {
		return `Selected ${capability.kind.toUpperCase()} provider for new sessions.`;
	}
	if (capability.health?.status === 'healthy') {
		return 'Configured and healthy fallback candidate.';
	}
	if (capability.health?.status === 'idle') {
		return 'Configured; no traffic observed yet.';
	}
	if (capability.health?.lastError) {
		return capability.health.lastError;
	}
	return 'Configured and available.';
};

const isWarningStatus = (status: string) =>
	status === 'degraded' ||
	status === 'rate-limited' ||
	status === 'suppressed' ||
	status === 'unconfigured';

export const createVoiceProviderCapabilitiesViewModel = <
	TProvider extends string = string
>(
	snapshot: VoiceProviderCapabilitiesSnapshot<TProvider>,
	options: VoiceProviderCapabilitiesWidgetOptions = {}
): VoiceProviderCapabilitiesViewModel<TProvider> => {
	const capabilities = (snapshot.report?.capabilities ?? []).map(
		(capability) => ({
			...capability,
			detail: getCapabilityDetail(capability),
			label: `${formatProvider(capability.provider)} ${formatKind(capability.kind)}`,
			rows: [
				{ label: 'Status', value: formatStatus(capability.status) },
				{ label: 'Selected', value: capability.selected ? 'Yes' : 'No' },
				{ label: 'Model', value: capability.model ?? 'Default' },
				{
					label: 'Features',
					value: capability.features?.join(', ') || 'Not specified'
				},
				{ label: 'Runs', value: String(capability.health?.runCount ?? 0) },
				{ label: 'Errors', value: String(capability.health?.errorCount ?? 0) }
			]
		})
	);
	const warningCount = capabilities.filter((capability) =>
		isWarningStatus(capability.status)
	).length;
	const selectedCount =
		snapshot.report?.selected ??
		capabilities.filter((capability) => capability.selected).length;

	return {
		capabilities,
		description: options.description ?? DEFAULT_DESCRIPTION,
		error: snapshot.error,
		isLoading: snapshot.isLoading,
		label: snapshot.error
			? 'Unavailable'
			: capabilities.length
				? warningCount > 0
					? `${warningCount} needs attention`
					: `${selectedCount} selected`
				: snapshot.isLoading
					? 'Checking'
					: 'No capabilities',
		status: snapshot.error
			? 'error'
			: capabilities.length
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

export const renderVoiceProviderCapabilitiesHTML = <
	TProvider extends string = string
>(
	snapshot: VoiceProviderCapabilitiesSnapshot<TProvider>,
	options: VoiceProviderCapabilitiesWidgetOptions = {}
) => {
	const model = createVoiceProviderCapabilitiesViewModel(snapshot, options);
	const capabilities = model.capabilities.length
		? `<div class="absolute-voice-provider-capabilities__providers">${model.capabilities
				.map(
					(capability) => `<article class="absolute-voice-provider-capabilities__provider absolute-voice-provider-capabilities__provider--${escapeHtml(capability.status)}">
  <header>
    <strong>${escapeHtml(capability.label)}</strong>
    <span>${escapeHtml(formatStatus(capability.status))}</span>
  </header>
  <p>${escapeHtml(capability.detail)}</p>
  <dl>${capability.rows
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
		: '<p class="absolute-voice-provider-capabilities__empty">Configure provider capabilities to see deployment coverage.</p>';

	return `<section class="absolute-voice-provider-capabilities absolute-voice-provider-capabilities--${escapeHtml(model.status)}">
  <header class="absolute-voice-provider-capabilities__header">
    <span class="absolute-voice-provider-capabilities__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-provider-capabilities__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-provider-capabilities__description">${escapeHtml(model.description)}</p>
  ${capabilities}
  ${model.error ? `<p class="absolute-voice-provider-capabilities__error">${escapeHtml(model.error)}</p>` : ''}
</section>`;
};

export const getVoiceProviderCapabilitiesCSS = () =>
	`.absolute-voice-provider-capabilities{border:1px solid #bfd7ea;border-radius:20px;background:#f6fbff;color:#08131f;padding:18px;box-shadow:0 18px 40px rgba(14,51,78,.12);font-family:inherit}.absolute-voice-provider-capabilities--error,.absolute-voice-provider-capabilities--warning{border-color:#f2a7a7;background:#fff5f3}.absolute-voice-provider-capabilities__header,.absolute-voice-provider-capabilities__provider header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-provider-capabilities__eyebrow{color:#255f85;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-provider-capabilities__label{font-size:24px;line-height:1}.absolute-voice-provider-capabilities__description,.absolute-voice-provider-capabilities__provider p,.absolute-voice-provider-capabilities__provider dt,.absolute-voice-provider-capabilities__empty{color:#405467}.absolute-voice-provider-capabilities__providers{display:grid;gap:12px;margin-top:14px}.absolute-voice-provider-capabilities__provider{background:#fff;border:1px solid #d7e7f3;border-radius:16px;padding:14px}.absolute-voice-provider-capabilities__provider--selected,.absolute-voice-provider-capabilities__provider--healthy{border-color:#86efac}.absolute-voice-provider-capabilities__provider--degraded,.absolute-voice-provider-capabilities__provider--rate-limited,.absolute-voice-provider-capabilities__provider--suppressed,.absolute-voice-provider-capabilities__provider--unconfigured{border-color:#f2a7a7}.absolute-voice-provider-capabilities__provider p{margin:10px 0}.absolute-voice-provider-capabilities__provider dl{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));margin:0}.absolute-voice-provider-capabilities__provider div{background:#f6fbff;border:1px solid #d7e7f3;border-radius:12px;padding:8px}.absolute-voice-provider-capabilities__provider dt{font-size:12px}.absolute-voice-provider-capabilities__provider dd{font-weight:800;margin:4px 0 0}.absolute-voice-provider-capabilities__empty{margin:14px 0 0}.absolute-voice-provider-capabilities__error{color:#9f1239;font-weight:700}`;

export const mountVoiceProviderCapabilities = <
	TProvider extends string = string
>(
	element: Element,
	path = '/api/provider-capabilities',
	options: VoiceProviderCapabilitiesWidgetOptions = {}
) => {
	const store = createVoiceProviderCapabilitiesStore<TProvider>(path, options);
	const render = () => {
		element.innerHTML = renderVoiceProviderCapabilitiesHTML(
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

export const defineVoiceProviderCapabilitiesElement = (
	tagName = 'absolute-voice-provider-capabilities'
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
		class AbsoluteVoiceProviderCapabilitiesElement extends HTMLElement {
			private mounted?: ReturnType<typeof mountVoiceProviderCapabilities>;

			connectedCallback() {
				const intervalMs = Number(this.getAttribute('interval-ms') ?? 5000);
				this.mounted = mountVoiceProviderCapabilities(
					this,
					this.getAttribute('path') ?? '/api/provider-capabilities',
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
