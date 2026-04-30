import type { VoiceTraceTimelineSession } from '../traceTimeline';
import {
	createVoiceTraceTimelineStore,
	type VoiceTraceTimelineClientOptions,
	type VoiceTraceTimelineSnapshot
} from './traceTimeline';

export type VoiceTraceTimelineSessionView = VoiceTraceTimelineSession & {
	detailHref: string;
	durationLabel: string;
	incidentBundleHref?: string;
	label: string;
	operationsRecordHref?: string;
	providerLabel: string;
};

export type VoiceTraceTimelineViewModel = {
	description: string;
	error: string | null;
	isLoading: boolean;
	label: string;
	sessions: VoiceTraceTimelineSessionView[];
	status: 'empty' | 'error' | 'failed' | 'loading' | 'ready' | 'warning';
	title: string;
	updatedAt?: number;
};

export type VoiceTraceTimelineWidgetOptions = VoiceTraceTimelineClientOptions & {
	description?: string;
	detailBasePath?: string;
	incidentBundleBasePath?: false | string;
	limit?: number;
	operationsRecordBasePath?: false | string;
	title?: string;
};

const DEFAULT_TITLE = 'Voice Traces';
const DEFAULT_DESCRIPTION =
	'Latest call timelines with provider latency, fallbacks, handoffs, and errors from your self-hosted trace store.';

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const formatMs = (value: number | undefined) =>
	typeof value === 'number' ? `${value}ms` : 'n/a';

const formatProviders = (session: VoiceTraceTimelineSession) =>
	session.providers.length
		? session.providers.map((provider) => provider.provider).join(', ')
		: 'No providers';

export const createVoiceTraceTimelineViewModel = (
	snapshot: VoiceTraceTimelineSnapshot,
	options: VoiceTraceTimelineWidgetOptions = {}
): VoiceTraceTimelineViewModel => {
	const sessions = (snapshot.report?.sessions ?? [])
		.slice(0, options.limit ?? 3)
		.map((session) => ({
			...session,
			detailHref: `${options.detailBasePath ?? '/traces'}/${encodeURIComponent(session.sessionId)}`,
			durationLabel: formatMs(session.summary.callDurationMs),
			incidentBundleHref:
				options.incidentBundleBasePath === false
					? undefined
					: `${options.incidentBundleBasePath ?? '/voice-incidents'}/${encodeURIComponent(session.sessionId)}/markdown`,
			label: `${session.summary.eventCount} events / ${session.summary.turnCount} turns`,
			operationsRecordHref:
				options.operationsRecordBasePath === false
					? undefined
					: `${options.operationsRecordBasePath ?? '/voice-operations'}/${encodeURIComponent(session.sessionId)}`,
			providerLabel: formatProviders(session)
		}));
	const failed = sessions.filter((session) => session.status === 'failed').length;
	const warnings = sessions.filter(
		(session) => session.status === 'warning'
	).length;

	return {
		description: options.description ?? DEFAULT_DESCRIPTION,
		error: snapshot.error,
		isLoading: snapshot.isLoading,
		label: snapshot.error
			? 'Unavailable'
			: failed > 0
				? `${failed} failed`
				: warnings > 0
					? `${warnings} warning`
					: sessions.length
						? `${sessions.length} recent`
						: snapshot.isLoading
							? 'Checking'
							: 'No traces yet',
		sessions,
		status: snapshot.error
			? 'error'
			: failed > 0
				? 'failed'
				: warnings > 0
					? 'warning'
					: sessions.length
						? 'ready'
						: snapshot.isLoading
							? 'loading'
							: 'empty',
		title: options.title ?? DEFAULT_TITLE,
		updatedAt: snapshot.updatedAt
	};
};

export const renderVoiceTraceTimelineWidgetHTML = (
	snapshot: VoiceTraceTimelineSnapshot,
	options: VoiceTraceTimelineWidgetOptions = {}
) => {
	const model = createVoiceTraceTimelineViewModel(snapshot, options);
	const sessions = model.sessions.length
		? `<div class="absolute-voice-trace-timeline__sessions">${model.sessions
				.map(
					(session) => {
						const supportLinks = [
							`<a href="${escapeHtml(session.detailHref)}">Open timeline</a>`,
							session.operationsRecordHref
								? `<a href="${escapeHtml(session.operationsRecordHref)}">Open operations record</a>`
								: undefined,
							session.incidentBundleHref
								? `<a href="${escapeHtml(session.incidentBundleHref)}">Export incident bundle</a>`
								: undefined
						]
							.filter(Boolean)
							.join('');
						return `<article class="absolute-voice-trace-timeline__session absolute-voice-trace-timeline__session--${escapeHtml(session.status)}">
  <header>
    <strong>${escapeHtml(session.sessionId)}</strong>
    <span>${escapeHtml(session.status)}</span>
  </header>
  <p>${escapeHtml(session.label)} · ${escapeHtml(session.durationLabel)} · ${escapeHtml(session.providerLabel)}</p>
  <p class="absolute-voice-trace-timeline__actions">${supportLinks}</p>
</article>`;
					}
				)
				.join('')}</div>`
		: '<p class="absolute-voice-trace-timeline__empty">Run a voice session to see call timelines.</p>';

	return `<section class="absolute-voice-trace-timeline absolute-voice-trace-timeline--${escapeHtml(model.status)}">
  <header class="absolute-voice-trace-timeline__header">
    <span class="absolute-voice-trace-timeline__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-trace-timeline__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-trace-timeline__description">${escapeHtml(model.description)}</p>
  ${sessions}
  ${model.error ? `<p class="absolute-voice-trace-timeline__error">${escapeHtml(model.error)}</p>` : ''}
</section>`;
};

export const getVoiceTraceTimelineCSS = () =>
	`.absolute-voice-trace-timeline{border:1px solid #bad7d3;border-radius:20px;background:#f3fffb;color:#09201c;padding:18px;box-shadow:0 18px 40px rgba(9,32,28,.12);font-family:inherit}.absolute-voice-trace-timeline--error,.absolute-voice-trace-timeline--failed{border-color:#f2a7a7;background:#fff5f3}.absolute-voice-trace-timeline--warning{border-color:#fbbf24;background:#fffaf0}.absolute-voice-trace-timeline__header,.absolute-voice-trace-timeline__session header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-trace-timeline__eyebrow{color:#17665b;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-trace-timeline__label{font-size:24px;line-height:1}.absolute-voice-trace-timeline__description,.absolute-voice-trace-timeline__session p,.absolute-voice-trace-timeline__empty{color:#35544f}.absolute-voice-trace-timeline__sessions{display:grid;gap:12px;margin-top:14px}.absolute-voice-trace-timeline__session{background:#fff;border:1px solid #cfe7e2;border-radius:16px;padding:14px}.absolute-voice-trace-timeline__session--failed{border-color:#f2a7a7}.absolute-voice-trace-timeline__session--warning{border-color:#fbbf24}.absolute-voice-trace-timeline__session p{margin:10px 0}.absolute-voice-trace-timeline__actions{display:flex;flex-wrap:wrap;gap:10px}.absolute-voice-trace-timeline__session a{color:#0f766e;font-weight:800}.absolute-voice-trace-timeline__empty{margin:14px 0 0}.absolute-voice-trace-timeline__error{color:#9f1239;font-weight:700}`;

export const mountVoiceTraceTimeline = (
	element: Element,
	path = '/api/voice-traces',
	options: VoiceTraceTimelineWidgetOptions = {}
) => {
	const store = createVoiceTraceTimelineStore(path, options);
	const render = () => {
		element.innerHTML = renderVoiceTraceTimelineWidgetHTML(
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

export const defineVoiceTraceTimelineElement = (
	tagName = 'absolute-voice-trace-timeline'
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
		class AbsoluteVoiceTraceTimelineElement extends HTMLElement {
			private mounted?: ReturnType<typeof mountVoiceTraceTimeline>;

			connectedCallback() {
				const intervalMs = Number(this.getAttribute('interval-ms') ?? 5000);
				const limit = Number(this.getAttribute('limit') ?? 3);
				this.mounted = mountVoiceTraceTimeline(
					this,
					this.getAttribute('path') ?? '/api/voice-traces',
					{
						description: this.getAttribute('description') ?? undefined,
						detailBasePath:
							this.getAttribute('detail-base-path') ?? undefined,
						incidentBundleBasePath:
							this.getAttribute('incident-bundle-base-path') ?? undefined,
						intervalMs: Number.isFinite(intervalMs) ? intervalMs : 5000,
						limit: Number.isFinite(limit) ? limit : 3,
						operationsRecordBasePath:
							this.getAttribute('operations-record-base-path') ?? undefined,
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
