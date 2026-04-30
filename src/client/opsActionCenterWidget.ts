import {
	createVoiceOpsActionCenterStore,
	type VoiceOpsActionCenterClientOptions,
	type VoiceOpsActionCenterSnapshot
} from './opsActionCenter';

export type VoiceOpsActionCenterViewModel = {
	actions: Array<{
		description: string;
		disabled: boolean;
		id: string;
		isRunning: boolean;
		label: string;
	}>;
	description: string;
	error: string | null;
	isRunning: boolean;
	label: string;
	lastResultLabel: string;
	status: 'ready' | 'running' | 'error' | 'completed';
	title: string;
};

export type VoiceOpsActionCenterWidgetOptions =
	VoiceOpsActionCenterClientOptions & {
		description?: string;
		title?: string;
	};

const DEFAULT_TITLE = 'Voice Ops Action Center';
const DEFAULT_DESCRIPTION =
	'Run production voice proofs and operator actions from one primitive panel.';

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

export const createVoiceOpsActionCenterViewModel = (
	snapshot: VoiceOpsActionCenterSnapshot,
	options: VoiceOpsActionCenterWidgetOptions = {}
): VoiceOpsActionCenterViewModel => {
	const status = snapshot.error
		? 'error'
		: snapshot.isRunning
			? 'running'
			: snapshot.lastResult
				? 'completed'
				: 'ready';

	return {
		actions: snapshot.actions.map((action) => ({
			description: action.description ?? '',
			disabled: Boolean(action.disabled || snapshot.isRunning),
			id: action.id,
			isRunning: snapshot.runningActionId === action.id,
			label: action.label
		})),
		description: options.description ?? DEFAULT_DESCRIPTION,
		error: snapshot.error,
		isRunning: snapshot.isRunning,
		label:
			status === 'error'
				? 'Needs attention'
				: status === 'running'
					? 'Running'
					: status === 'completed'
						? 'Action completed'
						: 'Ready',
		lastResultLabel: snapshot.lastResult
			? `${snapshot.lastResult.actionId} returned HTTP ${snapshot.lastResult.status}`
			: 'No action has run yet.',
		status,
		title: options.title ?? DEFAULT_TITLE
	};
};

export const renderVoiceOpsActionCenterHTML = (
	snapshot: VoiceOpsActionCenterSnapshot,
	options: VoiceOpsActionCenterWidgetOptions = {}
) => {
	const model = createVoiceOpsActionCenterViewModel(snapshot, options);
	const actions = model.actions
		.map(
			(action) => `<button type="button" data-absolute-voice-ops-action="${escapeHtml(action.id)}"${action.disabled ? ' disabled' : ''}>
  ${escapeHtml(action.isRunning ? 'Working...' : action.label)}
</button>`
		)
		.join('');

	return `<section class="absolute-voice-ops-action-center absolute-voice-ops-action-center--${escapeHtml(model.status)}">
  <header class="absolute-voice-ops-action-center__header">
    <span class="absolute-voice-ops-action-center__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-ops-action-center__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-ops-action-center__description">${escapeHtml(model.description)}</p>
  <div class="absolute-voice-ops-action-center__actions">${actions}</div>
  <p class="absolute-voice-ops-action-center__result">${escapeHtml(model.lastResultLabel)}</p>
  ${model.error ? `<p class="absolute-voice-ops-action-center__error">${escapeHtml(model.error)}</p>` : ''}
</section>`;
};

export const getVoiceOpsActionCenterCSS = () =>
	`.absolute-voice-ops-action-center{border:1px solid #d5cbb8;border-radius:20px;background:#fffaf1;color:#17130b;padding:18px;box-shadow:0 18px 40px rgba(58,42,16,.12);font-family:inherit}.absolute-voice-ops-action-center--error{border-color:#f2a7a7;background:#fff5f3}.absolute-voice-ops-action-center__header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-ops-action-center__eyebrow{color:#725d37;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-ops-action-center__label{font-size:28px;line-height:1}.absolute-voice-ops-action-center__description,.absolute-voice-ops-action-center__result{color:#5b4b2f;margin:12px 0 0}.absolute-voice-ops-action-center__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.absolute-voice-ops-action-center__actions button{background:#7c4a03;border:0;border-radius:999px;color:#fff8e8;cursor:pointer;font:inherit;font-weight:800;padding:8px 12px}.absolute-voice-ops-action-center__actions button:disabled{cursor:not-allowed;opacity:.5}.absolute-voice-ops-action-center__error{color:#9f1239;font-weight:700}`;

export const mountVoiceOpsActionCenter = (
	element: Element,
	options: VoiceOpsActionCenterWidgetOptions = {}
) => {
	const store = createVoiceOpsActionCenterStore(options);
	const render = () => {
		element.innerHTML = renderVoiceOpsActionCenterHTML(
			store.getSnapshot(),
			options
		);
	};
	const unsubscribe = store.subscribe(render);
	const handleClick = (event: Event) => {
		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}
		const action = target.closest('[data-absolute-voice-ops-action]');
		const actionId = action?.getAttribute('data-absolute-voice-ops-action');
		if (actionId) {
			void store.run(actionId).catch(() => {});
		}
	};
	element.addEventListener?.('click', handleClick);
	render();

	return {
		close: () => {
			element.removeEventListener?.('click', handleClick);
			unsubscribe();
			store.close();
		},
		run: store.run
	};
};

export const defineVoiceOpsActionCenterElement = (
	tagName = 'absolute-voice-ops-action-center',
	options: VoiceOpsActionCenterWidgetOptions = {}
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
		class AbsoluteVoiceOpsActionCenterElement extends HTMLElement {
			private mounted?: ReturnType<typeof mountVoiceOpsActionCenter>;

			connectedCallback() {
				this.mounted = mountVoiceOpsActionCenter(this, {
					...options,
					description: this.getAttribute('description') ?? options.description,
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
