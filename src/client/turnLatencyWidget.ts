import type { VoiceTurnLatencyItem } from '../turnLatency';
import {
	createVoiceTurnLatencyStore,
	type VoiceTurnLatencyClientOptions,
	type VoiceTurnLatencySnapshot
} from './turnLatency';

export type VoiceTurnLatencyCardView = VoiceTurnLatencyItem & {
	label: string;
	rows: Array<{ label: string; value: string }>;
};

export type VoiceTurnLatencyViewModel = {
	description: string;
	error: string | null;
	isLoading: boolean;
	label: string;
	proofLabel?: string;
	showProofAction: boolean;
	status: 'empty' | 'error' | 'loading' | 'ready' | 'warning';
	title: string;
	turns: VoiceTurnLatencyCardView[];
	updatedAt?: number;
};

export type VoiceTurnLatencyWidgetOptions = VoiceTurnLatencyClientOptions & {
	description?: string;
	proofLabel?: string;
	title?: string;
};

const DEFAULT_TITLE = 'Turn Latency';
const DEFAULT_DESCRIPTION =
	'Per-turn timing from first transcript to commit and assistant response start.';
const DEFAULT_PROOF_LABEL = 'Run latency proof';

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const formatMs = (value?: number) =>
	typeof value === 'number' ? `${Math.round(value)}ms` : 'n/a';

export const createVoiceTurnLatencyViewModel = (
	snapshot: VoiceTurnLatencySnapshot,
	options: VoiceTurnLatencyWidgetOptions = {}
): VoiceTurnLatencyViewModel => {
	const turns = (snapshot.report?.turns ?? []).map((turn) => ({
		...turn,
		label: turn.text || 'Empty turn',
		rows: turn.stages.map((stage) => ({
			label: stage.label,
			value: formatMs(stage.valueMs)
		}))
	}));
	const warningCount =
		snapshot.report?.warnings ??
		turns.filter((turn) => turn.status === 'warn').length;
	const failedCount =
		snapshot.report?.failed ??
		turns.filter((turn) => turn.status === 'fail').length;

	return {
		description: options.description ?? DEFAULT_DESCRIPTION,
		error: snapshot.error,
		isLoading: snapshot.isLoading,
		label: snapshot.error
			? 'Unavailable'
			: turns.length
				? failedCount > 0
					? `${failedCount} slow`
					: warningCount > 0
						? `${warningCount} warnings`
						: `avg ${formatMs(snapshot.report?.averageTotalMs)}`
				: snapshot.isLoading
					? 'Checking'
					: 'No turns',
		proofLabel: options.proofPath
			? (options.proofLabel ?? DEFAULT_PROOF_LABEL)
			: undefined,
		showProofAction: Boolean(options.proofPath),
		status: snapshot.error
			? 'error'
			: turns.length
				? failedCount > 0 || warningCount > 0
					? 'warning'
					: 'ready'
				: snapshot.isLoading
					? 'loading'
					: 'empty',
		title: options.title ?? DEFAULT_TITLE,
		turns,
		updatedAt: snapshot.updatedAt
	};
};

export const renderVoiceTurnLatencyHTML = (
	snapshot: VoiceTurnLatencySnapshot,
	options: VoiceTurnLatencyWidgetOptions = {}
) => {
	const model = createVoiceTurnLatencyViewModel(snapshot, options);
	const turns = model.turns.length
		? `<div class="absolute-voice-turn-latency__turns">${model.turns
				.map(
					(turn) => `<article class="absolute-voice-turn-latency__turn absolute-voice-turn-latency__turn--${escapeHtml(turn.status)}">
  <header>
    <strong>${escapeHtml(turn.label)}</strong>
    <span>${escapeHtml(turn.status)}</span>
  </header>
  <dl>${turn.rows
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
		: '<p class="absolute-voice-turn-latency__empty">Complete a voice turn to see latency diagnostics.</p>';

	return `<section class="absolute-voice-turn-latency absolute-voice-turn-latency--${escapeHtml(model.status)}">
  <header class="absolute-voice-turn-latency__header">
    <span class="absolute-voice-turn-latency__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-turn-latency__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-turn-latency__description">${escapeHtml(model.description)}</p>
  ${
		model.showProofAction
			? `<button class="absolute-voice-turn-latency__proof" data-absolute-voice-turn-latency-proof type="button">${escapeHtml(model.proofLabel ?? DEFAULT_PROOF_LABEL)}</button>`
			: ''
	}
  ${turns}
  ${model.error ? `<p class="absolute-voice-turn-latency__error">${escapeHtml(model.error)}</p>` : ''}
</section>`;
};

export const mountVoiceTurnLatency = (
	element: Element,
	path = '/api/turn-latency',
	options: VoiceTurnLatencyWidgetOptions = {}
) => {
	const store = createVoiceTurnLatencyStore(path, options);
	const render = () => {
		element.innerHTML = renderVoiceTurnLatencyHTML(store.getSnapshot(), options);
	};
	const handleClick = (event: Event) => {
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest('[data-absolute-voice-turn-latency-proof]')
		) {
			void store.runProof().catch(() => {});
		}
	};
	const unsubscribe = store.subscribe(render);
	element.addEventListener('click', handleClick);
	render();
	void store.refresh().catch(() => {});

	return {
		close: () => {
			element.removeEventListener('click', handleClick);
			unsubscribe();
			store.close();
		},
		refresh: store.refresh
	};
};

export const defineVoiceTurnLatencyElement = (
	tagName = 'absolute-voice-turn-latency'
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
		class AbsoluteVoiceTurnLatencyElement extends HTMLElement {
			private mounted?: ReturnType<typeof mountVoiceTurnLatency>;

			connectedCallback() {
				const intervalMs = Number(this.getAttribute('interval-ms') ?? 5000);
				this.mounted = mountVoiceTurnLatency(
					this,
					this.getAttribute('path') ?? '/api/turn-latency',
					{
						description: this.getAttribute('description') ?? undefined,
						intervalMs: Number.isFinite(intervalMs) ? intervalMs : 5000,
						proofLabel: this.getAttribute('proof-label') ?? undefined,
						proofPath: this.getAttribute('proof-path') ?? undefined,
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
