import {
	createVoiceSessionSnapshotStore,
	type VoiceSessionSnapshotClientOptions,
	type VoiceSessionSnapshotClientState
} from './sessionSnapshot';

export type VoiceSessionSnapshotViewModel = {
	description: string;
	error: string | null;
	isLoading: boolean;
	label: string;
	rows: Array<{ label: string; value: string }>;
	showDownload: boolean;
	status: 'empty' | 'error' | 'loading' | 'ready' | 'warning';
	title: string;
	updatedAt?: number;
};

export type VoiceSessionSnapshotWidgetOptions =
	VoiceSessionSnapshotClientOptions & {
		description?: string;
		downloadLabel?: string;
		title?: string;
	};

const DEFAULT_TITLE = 'Session Snapshot';
const DEFAULT_DESCRIPTION =
	'Portable call artifact with media graph, provider routing, proof, quality, and telephony evidence.';
const DEFAULT_DOWNLOAD_LABEL = 'Download snapshot';

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const formatStatus = (status?: string) => status ?? 'n/a';

export const createVoiceSessionSnapshotViewModel = (
	state: VoiceSessionSnapshotClientState,
	options: VoiceSessionSnapshotWidgetOptions = {}
): VoiceSessionSnapshotViewModel => {
	const snapshot = state.snapshot;
	const failedProofs = snapshot?.proofSummary.failed ?? 0;
	const mediaWarnings =
		snapshot?.media.filter((media) => media.report.status !== 'pass').length ?? 0;
	const timingWarnings =
		snapshot?.media.reduce(
			(total, media) => total + media.report.timing.overBudgetFrames,
			0
		) ?? 0;
	const backpressureDrops =
		snapshot?.media.reduce(
			(total, media) => total + media.report.backpressure.droppedFrames,
			0
		) ?? 0;
	const qualityWarnings =
		snapshot?.quality.filter((quality) => quality.status !== 'pass').length ?? 0;

	return {
		description: options.description ?? DEFAULT_DESCRIPTION,
		error: state.error,
		isLoading: state.isLoading,
		label: state.error
			? 'Unavailable'
			: snapshot
				? `${snapshot.status} · ${snapshot.sessionId}`
				: state.isLoading
					? 'Loading'
					: 'No snapshot',
		rows: snapshot
			? [
					{ label: 'Media graphs', value: String(snapshot.media.length) },
					{ label: 'Media warnings', value: String(mediaWarnings) },
					{ label: 'Timing warnings', value: String(timingWarnings) },
					{ label: 'Backpressure drops', value: String(backpressureDrops) },
					{ label: 'Proof failures', value: String(failedProofs) },
					{ label: 'Quality warnings', value: String(qualityWarnings) },
					{
						label: 'Provider routing',
						value: String(snapshot.providerRoutingEvents.length)
					},
					{
						label: 'Telephony outcomes',
						value: String(snapshot.telephonyOutcomes.length)
					}
				]
			: [],
		showDownload: snapshot !== undefined,
		status: state.error
			? 'error'
			: snapshot
				? snapshot.status === 'pass'
					? 'ready'
					: 'warning'
				: state.isLoading
					? 'loading'
					: 'empty',
		title: options.title ?? DEFAULT_TITLE,
		updatedAt: state.updatedAt
	};
};

export const renderVoiceSessionSnapshotHTML = (
	state: VoiceSessionSnapshotClientState,
	options: VoiceSessionSnapshotWidgetOptions = {}
) => {
	const model = createVoiceSessionSnapshotViewModel(state, options);
	const rows = model.rows.length
		? `<dl>${model.rows
				.map(
					(row) => `<div>
    <dt>${escapeHtml(row.label)}</dt>
    <dd>${escapeHtml(row.value)}</dd>
  </div>`
				)
				.join('')}</dl>`
		: '<p class="absolute-voice-session-snapshot__empty">Load a session snapshot to see support diagnostics.</p>';

	return `<section class="absolute-voice-session-snapshot absolute-voice-session-snapshot--${escapeHtml(model.status)}">
  <header class="absolute-voice-session-snapshot__header">
    <span class="absolute-voice-session-snapshot__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-session-snapshot__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-session-snapshot__description">${escapeHtml(model.description)}</p>
  ${
		model.showDownload
			? `<button class="absolute-voice-session-snapshot__download" data-absolute-voice-session-snapshot-download type="button">${escapeHtml(options.downloadLabel ?? DEFAULT_DOWNLOAD_LABEL)}</button>`
			: ''
	}
  ${rows}
  ${model.error ? `<p class="absolute-voice-session-snapshot__error">${escapeHtml(model.error)}</p>` : ''}
</section>`;
};

const downloadBlob = (blob: Blob, filename: string) => {
	if (typeof document === 'undefined' || typeof URL === 'undefined') {
		return;
	}
	const href = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = href;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(href);
};

export const mountVoiceSessionSnapshot = (
	element: Element,
	path: string,
	options: VoiceSessionSnapshotWidgetOptions = {}
) => {
	const store = createVoiceSessionSnapshotStore(path, options);
	const render = () => {
		element.innerHTML = renderVoiceSessionSnapshotHTML(
			store.getSnapshot(),
			options
		);
	};
	const handleClick = (event: Event) => {
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest('[data-absolute-voice-session-snapshot-download]')
		) {
			const sessionId = store.getSnapshot().snapshot?.sessionId ?? 'session';
			downloadBlob(
				store.download(),
				`voice-session-${sessionId}.snapshot.json`
			);
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
		download: store.download,
		refresh: store.refresh
	};
};

export const defineVoiceSessionSnapshotElement = (
	tagName = 'absolute-voice-session-snapshot'
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
		class AbsoluteVoiceSessionSnapshotElement extends HTMLElement {
			private mounted?: ReturnType<typeof mountVoiceSessionSnapshot>;

			connectedCallback() {
				const intervalMs = Number(this.getAttribute('interval-ms') ?? 0);
				this.mounted = mountVoiceSessionSnapshot(
					this,
					this.getAttribute('path') ?? '/api/voice/session-snapshot/session',
					{
						description: this.getAttribute('description') ?? undefined,
						downloadLabel:
							this.getAttribute('download-label') ?? undefined,
						intervalMs: Number.isFinite(intervalMs) ? intervalMs : 0,
						title: this.getAttribute('title') ?? undefined,
						turnId: this.getAttribute('turn-id') ?? undefined
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
