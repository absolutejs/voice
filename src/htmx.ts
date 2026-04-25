import type {
	VoiceHTMXConfig,
	VoiceHTMXRenderConfig,
	VoiceHTMXRenderInput,
	VoiceHTMXTargets,
	VoiceSessionRecord,
	VoiceTurnRecord
} from './types';

type ResolvedVoiceHTMXRenderConfig<
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = Required<VoiceHTMXRenderConfig<TSession, TResult>>;

const DEFAULT_HTMX_TARGETS: VoiceHTMXTargets = {
	assistant: 'voice-htmx-assistant',
	metrics: 'voice-htmx-metrics',
	result: 'voice-htmx-result',
	status: 'voice-htmx-status',
	turns: 'voice-htmx-turns'
};

const escapeHtml = (text: string) =>
	text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const stringifyResult = (result: unknown) => {
	if (result === undefined) {
		return '';
	}

	if (typeof result === 'string') {
		return result;
	}

	try {
		return JSON.stringify(result, null, 2);
	} catch {
		return String(result);
	}
};

const defaultEmptyState = (kind: keyof VoiceHTMXTargets) => {
	switch (kind) {
		case 'assistant':
			return '<p class="empty-copy">No assistant messages yet.</p>';
		case 'metrics':
			return '<p class="empty-copy">No active voice session yet.</p>';
		case 'result':
			return '<p class="empty-copy">No structured result yet.</p>';
		case 'status':
			return '<p class="empty-copy">Voice session is idle.</p>';
		case 'turns':
			return '<p class="empty-copy">No turns committed yet.</p>';
	}
};

const defaultMetrics = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	input: VoiceHTMXRenderInput<TResult, TSession>
) => {
	if (!input.sessionId) {
		return defaultEmptyState('metrics');
	}

	return [
		'<div class="voice-metric">',
		'<span class="voice-metric-label">Session</span>',
		`<span class="voice-metric-value">${escapeHtml(input.sessionId)}</span>`,
		'</div>',
		input.session?.scenarioId
			? `<div class="voice-metric">
				<span class="voice-metric-label">Scenario</span>
				<span class="voice-metric-value">${escapeHtml(input.session.scenarioId)}</span>
			</div>`
			: '',
		'<div class="voice-metric">',
		'<span class="voice-metric-label">Status</span>',
		`<span class="voice-metric-value">${escapeHtml(input.status)}</span>`,
		'</div>',
		'<div class="voice-metric">',
		'<span class="voice-metric-label">Committed turns</span>',
		`<span class="voice-metric-value">${String(input.turnCount)}</span>`,
		'</div>'
	].join('');
};

const defaultStatus = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	input: VoiceHTMXRenderInput<TResult, TSession>
) =>
	[
		'<div class="status-row">',
		'<span class="label">Voice status</span>',
		`<span class="value">${escapeHtml(input.status)}</span>`,
		'</div>',
		'<div class="status-row">',
		'<span class="label">Partial transcript</span>',
		`<span class="value">${escapeHtml(input.partial || 'No live partial')}</span>`,
		'</div>'
	].join('');

const renderTurn = <TResult = unknown>(turn: VoiceTurnRecord<TResult>) =>
	[
		'<article class="voice-turn">',
		'<div class="voice-turn-header">',
		`<strong>${escapeHtml(turn.text)}</strong>`,
		`<span>${new Date(turn.committedAt).toLocaleString('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short'
		})}</span>`,
		'</div>',
		turn.assistantText
			? [
					'<div class="voice-assistant-label">Assistant</div>',
					`<p class="voice-turn-text">${escapeHtml(turn.assistantText)}</p>`
				].join('')
			: '',
		'</article>'
	].join('');

const defaultTurns = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	input: VoiceHTMXRenderInput<TResult, TSession>
) =>
	input.turns.length === 0
		? defaultEmptyState('turns')
		: input.turns.map((turn) => renderTurn(turn)).join('');

const defaultAssistant = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	input: VoiceHTMXRenderInput<TResult, TSession>
) =>
	input.assistantTexts.length === 0
		? defaultEmptyState('assistant')
		: input.assistantTexts
				.map(
					(text, index) =>
						[
							'<article class="voice-assistant-item">',
							`<div class="voice-assistant-label">Reply ${String(index + 1)}</div>`,
							`<p class="voice-turn-text">${escapeHtml(text)}</p>`,
							'</article>'
						].join('')
				)
				.join('');

const defaultResult = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	input: VoiceHTMXRenderInput<TResult, TSession>
) => {
	if (input.result === undefined) {
		return defaultEmptyState('result');
	}

	return [
		'<pre class="voice-code"><code>',
		escapeHtml(stringifyResult(input.result)),
		'</code></pre>'
	].join('');
};

export const resolveVoiceHTMXTargets = (
	custom?: Partial<VoiceHTMXTargets>
): VoiceHTMXTargets => ({
	...DEFAULT_HTMX_TARGETS,
	...custom
});

export const resolveVoiceHTMXRenderers = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	custom?: VoiceHTMXConfig<TSession, TResult>
): ResolvedVoiceHTMXRenderConfig<TSession, TResult> => {
	const renderConfig: VoiceHTMXRenderConfig<TSession, TResult> | undefined =
		typeof custom === 'function' ? { result: custom } : custom;

	return {
		assistant: renderConfig?.assistant ?? defaultAssistant,
		emptyState: renderConfig?.emptyState ?? defaultEmptyState,
		metrics: renderConfig?.metrics ?? defaultMetrics,
		result: renderConfig?.result ?? defaultResult,
		status: renderConfig?.status ?? defaultStatus,
		turns: renderConfig?.turns ?? defaultTurns
	};
};

const renderOob = (id: string, html: string) =>
	`<div id="${escapeHtml(id)}" hx-swap-oob="innerHTML">${html}</div>`;

export const buildVoiceHTMXResponse = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	input: VoiceHTMXRenderInput<TResult, TSession>,
	renderers: ResolvedVoiceHTMXRenderConfig<TSession, TResult>,
	targets: VoiceHTMXTargets
) =>
	[
		renderOob(targets.metrics, renderers.metrics(input)),
		renderOob(targets.status, renderers.status(input)),
		renderOob(targets.turns, renderers.turns(input)),
		renderOob(targets.assistant, renderers.assistant(input)),
		renderOob(targets.result, renderers.result(input))
	].join('');
