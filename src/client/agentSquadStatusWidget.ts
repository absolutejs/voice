import {
	createVoiceAgentSquadStatusStore,
	type VoiceAgentSquadSpecialist,
	type VoiceAgentSquadStatusClientOptions,
	type VoiceAgentSquadStatusSnapshot
} from './agentSquadStatus';

export type VoiceAgentSquadStatusViewModel = {
	current?: VoiceAgentSquadSpecialist;
	description: string;
	error: string | null;
	isLoading: boolean;
	label: string;
	sessionCount: number;
	sessions: VoiceAgentSquadSpecialist[];
	title: string;
	updatedAt?: number;
};

export type VoiceAgentSquadStatusWidgetOptions =
	VoiceAgentSquadStatusClientOptions & {
		description?: string;
		title?: string;
	};

const DEFAULT_TITLE = 'Voice Agent Squad';
const DEFAULT_DESCRIPTION =
	'Current specialist and recent handoffs from your self-hosted voice traces.';

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const labelFor = (current?: VoiceAgentSquadSpecialist) => {
	if (!current) return 'Waiting for specialist activity';
	if (current.status === 'blocked') return 'Handoff blocked';
	if (current.status === 'unknown-target') return 'Unknown specialist';
	if (current.targetAgentId) return `Current: ${current.targetAgentId}`;
	return 'Specialist active';
};

export const createVoiceAgentSquadStatusViewModel = (
	snapshot: VoiceAgentSquadStatusSnapshot,
	options: VoiceAgentSquadStatusWidgetOptions = {}
): VoiceAgentSquadStatusViewModel => ({
	current: snapshot.report.current,
	description: options.description ?? DEFAULT_DESCRIPTION,
	error: snapshot.error,
	isLoading: snapshot.isLoading,
	label: snapshot.error ? 'Unavailable' : labelFor(snapshot.report.current),
	sessionCount: snapshot.report.sessionCount,
	sessions: snapshot.report.sessions,
	title: options.title ?? DEFAULT_TITLE,
	updatedAt: snapshot.updatedAt
});

export const renderVoiceAgentSquadStatusHTML = (
	snapshot: VoiceAgentSquadStatusSnapshot,
	options: VoiceAgentSquadStatusWidgetOptions = {}
) => {
	const model = createVoiceAgentSquadStatusViewModel(snapshot, options);
	const current = model.current;
	const rows = model.sessions.length
		? model.sessions
				.slice(0, 5)
				.map(
					(session) => `<li>
  <span>${escapeHtml(session.sessionId)}</span>
  <strong>${escapeHtml(session.targetAgentId ?? 'none')}</strong>
  <em>${escapeHtml(session.status)}</em>
  ${session.summary || session.reason ? `<p>${escapeHtml(session.summary ?? session.reason ?? '')}</p>` : ''}
</li>`
				)
				.join('')
		: '<li><span>No squad traces yet.</span><strong>Waiting</strong></li>';

	return `<section class="absolute-voice-agent-squad-status">
  <header>
    <span>${escapeHtml(model.title)}</span>
    <strong>${escapeHtml(model.label)}</strong>
  </header>
  <p>${escapeHtml(model.description)}</p>
  <div>
    <span>Session</span><strong>${escapeHtml(current?.sessionId ?? 'n/a')}</strong>
    <span>From</span><strong>${escapeHtml(current?.fromAgentId ?? 'n/a')}</strong>
    <span>Status</span><strong>${escapeHtml(current?.status ?? 'idle')}</strong>
  </div>
  <ul>${rows}</ul>
  ${model.error ? `<p class="absolute-voice-agent-squad-status__error">${escapeHtml(model.error)}</p>` : ''}
</section>`;
};

export const getVoiceAgentSquadStatusCSS = () =>
	`.absolute-voice-agent-squad-status{border:1px solid #38bdf866;border-radius:20px;background:#0f172a;color:#f8fafc;padding:18px;font-family:inherit}.absolute-voice-agent-squad-status header{display:grid;gap:4px}.absolute-voice-agent-squad-status header span{color:#7dd3fc;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-agent-squad-status header strong{font-size:20px}.absolute-voice-agent-squad-status p{color:#cbd5e1}.absolute-voice-agent-squad-status div{display:grid;gap:6px;grid-template-columns:max-content 1fr;margin:14px 0}.absolute-voice-agent-squad-status div span{color:#94a3b8}.absolute-voice-agent-squad-status ul{display:grid;gap:8px;list-style:none;margin:0;padding:0}.absolute-voice-agent-squad-status li{background:#020617;border:1px solid #1e293b;border-radius:14px;padding:10px}.absolute-voice-agent-squad-status li span{color:#94a3b8;display:block;font-size:12px}.absolute-voice-agent-squad-status li strong{display:block}.absolute-voice-agent-squad-status li em{color:#7dd3fc;font-style:normal}.absolute-voice-agent-squad-status__error{color:#fecaca;font-weight:800}`;

export const mountVoiceAgentSquadStatus = (
	element: Element | null,
	path = '/api/voice-traces',
	options: VoiceAgentSquadStatusWidgetOptions = {}
) => {
	if (!element) {
		throw new Error('mountVoiceAgentSquadStatus requires an element.');
	}
	const store = createVoiceAgentSquadStatusStore(path, options);
	const render = () => {
		element.innerHTML = `<style>${getVoiceAgentSquadStatusCSS()}</style>${renderVoiceAgentSquadStatusHTML(store.getSnapshot(), options)}`;
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

export const defineVoiceAgentSquadStatusElement = (
	tagName = 'absolute-voice-agent-squad-status',
	options: VoiceAgentSquadStatusWidgetOptions = {}
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
		class AbsoluteVoiceAgentSquadStatusElement extends HTMLElement {
			private mounted?: ReturnType<typeof mountVoiceAgentSquadStatus>;

			connectedCallback() {
				this.mounted = mountVoiceAgentSquadStatus(
					this,
					this.getAttribute('path') ?? '/api/voice-traces',
					{
						...options,
						description: this.getAttribute('description') ?? options.description,
						sessionId: this.getAttribute('session-id') ?? options.sessionId,
						title: this.getAttribute('title') ?? options.title
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
