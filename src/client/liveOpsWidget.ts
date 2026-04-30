import {
	VOICE_LIVE_OPS_ACTIONS,
	type VoiceLiveOpsAction,
	type VoiceLiveOpsActionInput
} from '../liveOps';
import {
	createVoiceLiveOpsStore,
	type VoiceLiveOpsClientOptions,
	type VoiceLiveOpsSnapshot
} from './liveOps';

export type VoiceLiveOpsWidgetOptions = VoiceLiveOpsClientOptions & {
	defaultAssignee?: string;
	defaultDetail?: string;
	defaultTag?: string;
	description?: string;
	getSessionId?: () => string | null | undefined;
	title?: string;
};

const ACTION_LABELS: Record<VoiceLiveOpsAction, string> = {
	assign: 'Assign',
	'create-task': 'Create task',
	escalate: 'Escalate',
	'force-handoff': 'Force handoff',
	'inject-instruction': 'Inject instruction',
	'operator-takeover': 'Take over',
	'pause-assistant': 'Pause assistant',
	'resume-assistant': 'Resume assistant',
	tag: 'Tag'
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

export const createVoiceLiveOpsInput = (
	action: VoiceLiveOpsAction,
	input: {
		assignee?: string;
		detail?: string;
		sessionId?: string | null;
		tag?: string;
	}
): VoiceLiveOpsActionInput => ({
	action,
	assignee: input.assignee,
	detail: input.detail,
	sessionId: input.sessionId ?? '',
	tag: input.tag
});

export const renderVoiceLiveOpsHTML = (
	snapshot: VoiceLiveOpsSnapshot,
	options: VoiceLiveOpsWidgetOptions = {}
) => {
	const sessionId = options.getSessionId?.() ?? '';
	const disabled = snapshot.isRunning || !sessionId;
	const actions = VOICE_LIVE_OPS_ACTIONS.map(
		(action) =>
			`<button type="button" data-absolute-voice-live-ops-action="${escapeHtml(action)}"${disabled ? ' disabled' : ''}>${escapeHtml(snapshot.runningAction === action ? 'Running...' : ACTION_LABELS[action])}</button>`
	).join('');
	const result = snapshot.error
		? `<p class="absolute-voice-live-ops__error">${escapeHtml(snapshot.error)}</p>`
		: snapshot.lastResult
			? `<p class="absolute-voice-live-ops__result">Recorded ${escapeHtml(snapshot.lastResult.action)}. Control: ${escapeHtml(snapshot.lastResult.control.status)}.</p>`
			: '<p class="absolute-voice-live-ops__result">No live ops action has run yet.</p>';

	return `<section class="absolute-voice-live-ops">
  <header class="absolute-voice-live-ops__header">
    <span>${escapeHtml(options.title ?? 'Live Ops')}</span>
    <strong>${escapeHtml(sessionId || 'No active session')}</strong>
  </header>
  <p class="absolute-voice-live-ops__description">${escapeHtml(options.description ?? 'Pause, resume, take over, force handoff, or inject operator instructions during a live voice session.')}</p>
  <label><span>Operator</span><input data-absolute-voice-live-ops-assignee value="${escapeHtml(options.defaultAssignee ?? 'operator')}" /></label>
  <label><span>Tag / handoff target</span><input data-absolute-voice-live-ops-tag value="${escapeHtml(options.defaultTag ?? 'live-ops')}" /></label>
  <label><span>Detail / instruction</span><input data-absolute-voice-live-ops-detail value="${escapeHtml(options.defaultDetail ?? 'Operator marked this live session.')}" /></label>
  <div class="absolute-voice-live-ops__actions">${actions}</div>
  ${result}
</section>`;
};

export const getVoiceLiveOpsCSS = () =>
	`.absolute-voice-live-ops{border:1px solid #f59e0b66;border-radius:20px;background:#111827;color:#f8fafc;padding:18px;font-family:inherit}.absolute-voice-live-ops__header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-live-ops__header span{color:#fbbf24;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-live-ops__header strong{font-size:18px;overflow-wrap:anywhere}.absolute-voice-live-ops__description,.absolute-voice-live-ops__result{color:#cbd5e1}.absolute-voice-live-ops label{display:grid;gap:6px;margin-top:12px}.absolute-voice-live-ops label span{color:#94a3b8;font-size:13px}.absolute-voice-live-ops input{background:#020617;border:1px solid #f59e0b66;border-radius:12px;color:#f8fafc;font:inherit;padding:10px 12px}.absolute-voice-live-ops__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.absolute-voice-live-ops__actions button{background:#f59e0b;border:0;border-radius:999px;color:#111827;cursor:pointer;font:inherit;font-weight:900;padding:8px 12px}.absolute-voice-live-ops__actions button:disabled{cursor:not-allowed;opacity:.5}.absolute-voice-live-ops__error{color:#fecaca;font-weight:800}`;

export const mountVoiceLiveOps = (
	element: Element,
	options: VoiceLiveOpsWidgetOptions = {}
) => {
	const store = createVoiceLiveOpsStore(options);
	let assignee = options.defaultAssignee ?? 'operator';
	let detail = options.defaultDetail ?? 'Operator marked this live session.';
	let tag = options.defaultTag ?? 'live-ops';
	const syncInputs = () => {
		const assigneeInput = element.querySelector(
			'[data-absolute-voice-live-ops-assignee]'
		);
		const detailInput = element.querySelector(
			'[data-absolute-voice-live-ops-detail]'
		);
		const tagInput = element.querySelector('[data-absolute-voice-live-ops-tag]');
		if (assigneeInput instanceof HTMLInputElement) {
			assignee = assigneeInput.value;
		}
		if (detailInput instanceof HTMLInputElement) {
			detail = detailInput.value;
		}
		if (tagInput instanceof HTMLInputElement) {
			tag = tagInput.value;
		}
	};
	const render = () => {
		element.innerHTML = renderVoiceLiveOpsHTML(store.getSnapshot(), {
			...options,
			defaultAssignee: assignee,
			defaultDetail: detail,
			defaultTag: tag
		});
	};
	const unsubscribe = store.subscribe(render);
	const handleInput = () => syncInputs();
	const handleClick = (event: Event) => {
		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}
		const button = target.closest('[data-absolute-voice-live-ops-action]');
		const action = button?.getAttribute(
			'data-absolute-voice-live-ops-action'
		) as VoiceLiveOpsAction | null;
		if (!action) {
			return;
		}
		syncInputs();
		void store
			.run(
				createVoiceLiveOpsInput(action, {
					assignee,
					detail,
					sessionId: options.getSessionId?.(),
					tag
				})
			)
			.catch(() => {});
	};

	element.addEventListener?.('click', handleClick);
	element.addEventListener?.('input', handleInput);
	render();

	return {
		close: () => {
			element.removeEventListener?.('click', handleClick);
			element.removeEventListener?.('input', handleInput);
			unsubscribe();
			store.close();
		},
		run: store.run
	};
};

export const defineVoiceLiveOpsElement = (
	tagName = 'absolute-voice-live-ops',
	options: VoiceLiveOpsWidgetOptions = {}
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
		class AbsoluteVoiceLiveOpsElement extends HTMLElement {
			private mounted?: ReturnType<typeof mountVoiceLiveOps>;

			connectedCallback() {
				this.mounted = mountVoiceLiveOps(this, {
					...options,
					description: this.getAttribute('description') ?? options.description,
					getSessionId:
						options.getSessionId ??
						(() => this.getAttribute('session-id') ?? undefined),
					title: this.getAttribute('title') ?? options.title
				});
			}

			disconnectedCallback() {
				this.mounted?.close();
				this.mounted = undefined;
			}
		}
	);
};
