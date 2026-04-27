import type { VoiceTurnQualityItem } from '../turnQuality';
import {
	createVoiceTurnQualityStore,
	type VoiceTurnQualityClientOptions,
	type VoiceTurnQualitySnapshot
} from './turnQuality';

export type VoiceTurnQualityCardView = VoiceTurnQualityItem & {
	detail: string;
	label: string;
	rows: Array<{ label: string; value: string }>;
};

export type VoiceTurnQualityViewModel = {
	description: string;
	error: string | null;
	isLoading: boolean;
	label: string;
	status: 'empty' | 'error' | 'loading' | 'ready' | 'warning';
	title: string;
	turns: VoiceTurnQualityCardView[];
	updatedAt?: number;
};

export type VoiceTurnQualityWidgetOptions = VoiceTurnQualityClientOptions & {
	description?: string;
	title?: string;
};

const DEFAULT_TITLE = 'Turn Quality';
const DEFAULT_DESCRIPTION =
	'Per-turn STT confidence, fallback selection, corrections, and transcript coverage.';

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const formatConfidence = (value: number | undefined) =>
	typeof value === 'number' ? `${Math.round(value * 100)}%` : 'n/a';

const formatMaybe = (value: string | number | undefined) =>
	value === undefined || value === '' ? 'n/a' : String(value);

const getTurnDetail = (turn: VoiceTurnQualityItem) => {
	if (turn.status === 'fail') {
		return 'Empty or unusable committed turn; inspect transcripts and adapter events.';
	}
	if (turn.fallbackUsed) {
		return `Fallback STT selected${turn.fallbackSelectionReason ? ` by ${turn.fallbackSelectionReason}` : ''}.`;
	}
	if (turn.correctionChanged) {
		return `Correction changed the turn${turn.correctionProvider ? ` via ${turn.correctionProvider}` : ''}.`;
	}
	if (turn.status === 'warn') {
		return 'Turn completed with quality warnings.';
	}
	if (turn.status === 'unknown') {
		return 'No quality diagnostics were recorded for this turn.';
	}
	return 'Turn quality looks healthy.';
};

export const createVoiceTurnQualityViewModel = (
	snapshot: VoiceTurnQualitySnapshot,
	options: VoiceTurnQualityWidgetOptions = {}
): VoiceTurnQualityViewModel => {
	const turns = (snapshot.report?.turns ?? []).map((turn) => ({
		...turn,
		detail: getTurnDetail(turn),
		label: turn.text || 'Empty turn',
		rows: [
			{ label: 'Source', value: turn.source ?? 'unknown' },
			{ label: 'Confidence', value: formatConfidence(turn.averageConfidence) },
			{ label: 'Fallback', value: turn.fallbackUsed ? 'Yes' : 'No' },
			{ label: 'Correction', value: turn.correctionChanged ? 'Changed' : 'None' },
			{ label: 'Transcripts', value: `${turn.selectedTranscriptCount} selected` },
			{ label: 'Cost', value: formatMaybe(turn.costUnits) }
		]
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
					? `${failedCount} failed`
					: warningCount > 0
						? `${warningCount} warnings`
						: `${turns.length} healthy`
				: snapshot.isLoading
					? 'Checking'
					: 'No turns',
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

export const renderVoiceTurnQualityHTML = (
	snapshot: VoiceTurnQualitySnapshot,
	options: VoiceTurnQualityWidgetOptions = {}
) => {
	const model = createVoiceTurnQualityViewModel(snapshot, options);
	const turns = model.turns.length
		? `<div class="absolute-voice-turn-quality__turns">${model.turns
				.map(
					(turn) => `<article class="absolute-voice-turn-quality__turn absolute-voice-turn-quality__turn--${escapeHtml(turn.status)}">
  <header>
    <strong>${escapeHtml(turn.label)}</strong>
    <span>${escapeHtml(turn.status)}</span>
  </header>
  <p>${escapeHtml(turn.detail)}</p>
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
		: '<p class="absolute-voice-turn-quality__empty">Complete a voice turn to see STT quality diagnostics.</p>';

	return `<section class="absolute-voice-turn-quality absolute-voice-turn-quality--${escapeHtml(model.status)}">
  <header class="absolute-voice-turn-quality__header">
    <span class="absolute-voice-turn-quality__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-turn-quality__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-turn-quality__description">${escapeHtml(model.description)}</p>
  ${turns}
  ${model.error ? `<p class="absolute-voice-turn-quality__error">${escapeHtml(model.error)}</p>` : ''}
</section>`;
};

export const getVoiceTurnQualityCSS = () =>
	`.absolute-voice-turn-quality{border:1px solid #e4d1a3;border-radius:20px;background:#fff9eb;color:#17120a;padding:18px;box-shadow:0 18px 40px rgba(73,48,14,.12);font-family:inherit}.absolute-voice-turn-quality--error,.absolute-voice-turn-quality--warning{border-color:#f2a7a7;background:#fff5f3}.absolute-voice-turn-quality__header,.absolute-voice-turn-quality__turn header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-turn-quality__eyebrow{color:#8a5a0a;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-turn-quality__label{font-size:24px;line-height:1}.absolute-voice-turn-quality__description,.absolute-voice-turn-quality__turn p,.absolute-voice-turn-quality__turn dt,.absolute-voice-turn-quality__empty{color:#5a4930}.absolute-voice-turn-quality__turns{display:grid;gap:12px;margin-top:14px}.absolute-voice-turn-quality__turn{background:#fff;border:1px solid #f0dfba;border-radius:16px;padding:14px}.absolute-voice-turn-quality__turn--pass{border-color:#86efac}.absolute-voice-turn-quality__turn--warn,.absolute-voice-turn-quality__turn--unknown{border-color:#fbbf24}.absolute-voice-turn-quality__turn--fail{border-color:#f2a7a7}.absolute-voice-turn-quality__turn p{margin:10px 0}.absolute-voice-turn-quality__turn dl{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));margin:0}.absolute-voice-turn-quality__turn div{background:#fff9eb;border:1px solid #f0dfba;border-radius:12px;padding:8px}.absolute-voice-turn-quality__turn dt{font-size:12px}.absolute-voice-turn-quality__turn dd{font-weight:800;margin:4px 0 0}.absolute-voice-turn-quality__empty{margin:14px 0 0}.absolute-voice-turn-quality__error{color:#9f1239;font-weight:700}`;

export const mountVoiceTurnQuality = (
	element: Element,
	path = '/api/turn-quality',
	options: VoiceTurnQualityWidgetOptions = {}
) => {
	const store = createVoiceTurnQualityStore(path, options);
	const render = () => {
		element.innerHTML = renderVoiceTurnQualityHTML(store.getSnapshot(), options);
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

export const defineVoiceTurnQualityElement = (
	tagName = 'absolute-voice-turn-quality'
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
		class AbsoluteVoiceTurnQualityElement extends HTMLElement {
			private mounted?: ReturnType<typeof mountVoiceTurnQuality>;

			connectedCallback() {
				const intervalMs = Number(this.getAttribute('interval-ms') ?? 5000);
				this.mounted = mountVoiceTurnQuality(
					this,
					this.getAttribute('path') ?? '/api/turn-quality',
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
