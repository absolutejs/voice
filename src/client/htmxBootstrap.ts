import { createVoiceController } from './controller';
import { createVoiceBargeInMonitor } from './bargeInMonitor';

type VoiceDemoMode = 'guided' | 'general';

const VOICE_WAVE_POINTS = 48;
const VOICE_WAVE_WIDTH = 320;
const VOICE_WAVE_HEIGHT = 88;

const DEFAULT_GUIDED_LABEL = 'Guided test';
const DEFAULT_GENERAL_LABEL = 'General recording';
const DEFAULT_IDLE_LEAD = 'Pick a scenario to begin the demo.';
const DEFAULT_GUIDED_LEAD =
	'I can walk you through a short guided voice test.';
const DEFAULT_GENERAL_LEAD =
	'I can capture one freeform recording and confirm that it landed.';
const DEFAULT_IDLE_PROMPT =
	'Choose a scenario to begin. Guided test asks follow-up prompts. General recording just captures what you say.';
const DEFAULT_GENERAL_IDLE_PROMPT =
	'Click Start general recording to capture one freeform answer.';
const DEFAULT_GENERAL_LIVE_PROMPT =
	'Speak freely. When you pause, the recording will be captured.';
const DEFAULT_GENERAL_COMPLETE_PROMPT =
	'Recording saved. Start again if you want another capture.';
const DEFAULT_GUIDED_COMPLETE_PROMPT =
	'Guided test complete. Review the saved summary below.';
const DEFAULT_GUIDED_OVERFLOW_PROMPT =
	'All prompts are covered. You can stop the microphone or keep speaking for extra detail.';
const DEFAULT_MIC_IDLE =
	'Ready. Start guided test or general recording to begin.';
const DEFAULT_MIC_LIVE =
	'Live. Answer the prompt, then click Stop microphone when finished.';
const DEFAULT_GUIDED_PROMPTS = [
	'Start with a quick introduction about who you are.',
	'Now describe what you are trying to do or test.',
	'Finish with any detail that feels blocked, risky, or unclear.'
];

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const readErrorField = (
	value: Record<string, unknown>,
	key: string
): string | null => {
	const candidate = value[key];

	if (typeof candidate === 'string' && candidate.trim()) {
		return candidate;
	}

	return null;
};

const formatErrorMessage = (error: unknown): string => {
	if (typeof error === 'string' && error.trim()) {
		return error;
	}

	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	if (error && typeof error === 'object') {
		const record = error as Record<string, unknown>;
		const direct =
			readErrorField(record, 'message') ??
			readErrorField(record, 'reason') ??
			readErrorField(record, 'description');

		if (direct) {
			return direct;
		}

		if ('error' in record) {
			return formatErrorMessage(record.error);
		}

		if ('cause' in record) {
			return formatErrorMessage(record.cause);
		}

		try {
			return JSON.stringify(error);
		} catch {}
	}

	return 'Unexpected error';
};

const createInitialVoiceWaveLevels = (count = VOICE_WAVE_POINTS) =>
	Array.from({ length: count }, () => 0);

const pushVoiceWaveLevel = (
	levels: number[],
	nextLevel: number,
	count = VOICE_WAVE_POINTS
) => {
	const next = levels.slice(-(count - 1));
	next.push(clamp(nextLevel, 0, 1));

	while (next.length < count) {
		next.unshift(0);
	}

	return next;
};

const createVoiceWavePath = (
	levels: number[],
	width = VOICE_WAVE_WIDTH,
	height = VOICE_WAVE_HEIGHT
) => {
	const samples =
		levels.length > 1 ? levels : createInitialVoiceWaveLevels(VOICE_WAVE_POINTS);
	const step = width / (samples.length - 1);
	const center = height / 2;
	const maxAmplitude = height * 0.34;
	const peakLevel = Math.max(...samples, 0);

	if (peakLevel <= 0.015) {
		return `M 0 ${center} L ${width} ${center}`;
	}

	const points = samples.map((level, index) => {
		const phase = index * 0.76;
		const wobble = Math.sin(phase) * 0.78 + Math.sin(phase * 0.41) * 0.22;
		const amplitude = level * maxAmplitude;
		const x = step * index;
		const y = clamp(center + wobble * amplitude, 8, height - 8);

		return { x, y };
	});

	if (points.length === 0) {
		return `M 0 ${center} L ${width} ${center}`;
	}

	let path = `M ${points[0]?.x ?? 0} ${points[0]?.y ?? center}`;

	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1];
		const current = points[index];

		if (!previous || !current) {
			continue;
		}

		const controlX = (previous.x + current.x) / 2;
		path += ` Q ${controlX} ${previous.y} ${current.x} ${current.y}`;
	}

	return path;
};

const parsePromptList = (value: string | undefined) => {
	if (!value) {
		return DEFAULT_GUIDED_PROMPTS;
	}

	try {
		const parsed = JSON.parse(value) as unknown;
		if (Array.isArray(parsed)) {
			const prompts = parsed
				.filter((entry): entry is string => typeof entry === 'string')
				.map((entry) => entry.trim())
				.filter(Boolean);

			if (prompts.length > 0) {
				return prompts;
			}
		}
	} catch {}

	return DEFAULT_GUIDED_PROMPTS;
};

const parseOptionalNumber = (value: string | undefined) => {
	if (!value) {
		return undefined;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const resolveElement = <T extends Element>(
	root: ParentNode,
	selector: string | undefined,
	ctor: abstract new (...args: never[]) => T
) => {
	const value = selector
		? document.querySelector(selector)
		: root.querySelector(selector ?? '');

	return value instanceof ctor ? value : null;
};

const requireElement = <T extends Element>(
	root: ParentNode,
	selector: string | undefined,
	ctor: abstract new (...args: never[]) => T,
	name: string
) => {
	const value = selector
		? document.querySelector(selector)
		: null;
	if (value instanceof ctor) {
		return value;
	}

	const fallback = root.querySelector(`#${name}`);
	if (fallback instanceof ctor) {
		return fallback;
	}

	throw new Error(
		`Voice HTMX bootstrap could not find the required element "${name}".`
	);
};

const resolveLeadMessage = (input: {
	mode: VoiceDemoMode | null;
	hasStarted: boolean;
	status: string;
	turnCount: number;
	guidedLabel: string;
	generalLabel: string;
	guidedPrompts: string[];
}) => {
	if (!input.mode) {
		return DEFAULT_IDLE_LEAD;
	}

	if (!input.hasStarted) {
		return input.mode === 'guided' ? DEFAULT_GUIDED_LEAD : DEFAULT_GENERAL_LEAD;
	}

	if (input.status === 'completed') {
		return input.mode === 'guided'
			? DEFAULT_GUIDED_COMPLETE_PROMPT
			: DEFAULT_GENERAL_COMPLETE_PROMPT;
	}

	if (input.mode === 'general') {
		return DEFAULT_GENERAL_LIVE_PROMPT;
	}

	return (
		input.guidedPrompts[input.turnCount] ?? DEFAULT_GUIDED_OVERFLOW_PROMPT
	);
};

const resolvePromptMessage = (input: {
	mode: VoiceDemoMode | null;
	hasStarted: boolean;
	status: string;
	turnCount: number;
	guidedPrompts: string[];
}) => {
	if (!input.mode) {
		return DEFAULT_IDLE_PROMPT;
	}

	if (input.status === 'completed') {
		return input.mode === 'guided'
			? DEFAULT_GUIDED_COMPLETE_PROMPT
			: DEFAULT_GENERAL_COMPLETE_PROMPT;
	}

	if (!input.hasStarted) {
		return input.mode === 'guided'
			? `Click Start guided test to begin. First prompt: ${input.guidedPrompts[0] ?? 'Answer the first prompt.'}`
			: DEFAULT_GENERAL_IDLE_PROMPT;
	}

	if (input.mode === 'general') {
		return input.turnCount === 0
			? DEFAULT_GENERAL_LIVE_PROMPT
			: DEFAULT_GENERAL_COMPLETE_PROMPT;
	}

	return (
		input.guidedPrompts[input.turnCount] ?? DEFAULT_GUIDED_OVERFLOW_PROMPT
	);
};

const initVoiceHTMXRoot = (root: HTMLElement) => {
	const guidedPath = root.dataset.voiceGuidedPath;
	const generalPath = root.dataset.voiceGeneralPath;
	if (!guidedPath || !generalPath) {
		throw new Error(
			'Voice HTMX bootstrap requires data-voice-guided-path and data-voice-general-path.'
		);
	}

	const guidedPrompts = parsePromptList(root.dataset.voiceGuidedPrompts);
	const guidedLabel = root.dataset.voiceGuidedLabel ?? DEFAULT_GUIDED_LABEL;
	const generalLabel = root.dataset.voiceGeneralLabel ?? DEFAULT_GENERAL_LABEL;
	const bargeInPath = root.dataset.voiceBargeInPath;
	const bargeInMonitor = bargeInPath
		? createVoiceBargeInMonitor({
				path: bargeInPath,
				thresholdMs: parseOptionalNumber(root.dataset.voiceBargeInThresholdMs)
			})
		: null;
	const bargeInRecentWindowMs =
		parseOptionalNumber(root.dataset.voiceBargeInRecentWindowMs) ?? 4_000;
	const bargeInSpeechThreshold =
		parseOptionalNumber(root.dataset.voiceBargeInSpeechThreshold) ?? 0.04;
	const syncElement = requireElement(
		document,
		root.dataset.voiceSync,
		HTMLElement,
		'voice-htmx-sync'
	);
	const connectionMetric = requireElement(
		root,
		root.dataset.voiceConnection,
		HTMLElement,
		'metric-connection'
	);
	const errorStatus = requireElement(
		root,
		root.dataset.voiceError,
		HTMLElement,
		'status-error'
	);
	const microphoneStatus = requireElement(
		root,
		root.dataset.voiceMicrophone,
		HTMLElement,
		'status-mic'
	);
	const promptStatus = requireElement(
		root,
		root.dataset.voicePrompt,
		HTMLElement,
		'status-prompt'
	);
	const chatList = requireElement(
		root,
		root.dataset.voiceChat,
		HTMLElement,
		'chat-list'
	);
	const startGuidedButton = requireElement(
		root,
		root.dataset.voiceStartGuided,
		HTMLButtonElement,
		'start-guided'
	);
	const startGeneralButton = requireElement(
		root,
		root.dataset.voiceStartGeneral,
		HTMLButtonElement,
		'start-general'
	);
	const stopButton = requireElement(
		root,
		root.dataset.voiceStop,
		HTMLButtonElement,
		'stop-mic'
	);
	const voiceMonitor = requireElement(
		root,
		root.dataset.voiceMonitor,
		HTMLElement,
		'voice-monitor'
	);
	const voiceMonitorCopy = requireElement(
		root,
		root.dataset.voiceMonitorCopy,
		HTMLElement,
		'voice-monitor-copy'
	);
	const voiceWaveGlow = requireElement(
		root,
		root.dataset.voiceWaveGlow,
		SVGPathElement,
		'voice-wave-glow'
	);
	const voiceWavePath = requireElement(
		root,
		root.dataset.voiceWavePath,
		SVGPathElement,
		'voice-wave-path'
	);

	let activeMode: VoiceDemoMode | null = null;
	let hasStartedModes: Record<VoiceDemoMode, boolean> = {
		general: false,
		guided: false
	};
	let isCapturing = false;
	let micError: string | null = null;
	let waveLevels = createInitialVoiceWaveLevels();
	let lastInputLevel = 0;
	let lastAssistantAt = 0;
	let lastAssistantAudioCount = 0;
	let lastAssistantTextCount = 0;

	const syncBargeInOutput = () => {
		if (!bargeInMonitor) {
			return;
		}

		const voice = currentVoice();
		const audioCount = voice.assistantAudio.length;
		const textCount = voice.assistantTexts.length;

		if (
			audioCount > lastAssistantAudioCount ||
			textCount > lastAssistantTextCount
		) {
			lastAssistantAt = Date.now();
		}

		lastAssistantAudioCount = audioCount;
		lastAssistantTextCount = textCount;
	};

	const sendAudioWithBargeInEvidence = (
		audio: Uint8Array | ArrayBuffer,
		sendAudio: (audio: Uint8Array | ArrayBuffer) => void
	) => {
		syncBargeInOutput();

		if (
			bargeInMonitor &&
			Date.now() - lastAssistantAt <= bargeInRecentWindowMs &&
			lastInputLevel >= bargeInSpeechThreshold
		) {
			bargeInMonitor.recordRequested({
				reason: 'manual-audio',
				sessionId: currentVoice().sessionId
			});
			bargeInMonitor.recordStopped({
				latencyMs: 0,
				playbackStopLatencyMs: 0,
				reason: 'manual-audio',
				sessionId: currentVoice().sessionId
			});
		}

		sendAudio(audio);
	};

	const guidedVoice = createVoiceController(guidedPath, {
		capture: {
			onAudio: sendAudioWithBargeInEvidence,
			onLevel: (level) => {
				lastInputLevel = level;
				waveLevels = pushVoiceWaveLevel(waveLevels, level);
				renderWave();
			}
		},
		preset: 'guided-intake'
	});
	const generalVoice = createVoiceController(generalPath, {
		capture: {
			onAudio: sendAudioWithBargeInEvidence,
			onLevel: (level) => {
				lastInputLevel = level;
				waveLevels = pushVoiceWaveLevel(waveLevels, level);
				renderWave();
			}
		},
		preset: 'dictation'
	});
	const stopGuidedBinding = guidedVoice.bindHTMX({ element: syncElement });
	const stopGeneralBinding = generalVoice.bindHTMX({ element: syncElement });

	const currentVoice = () =>
		activeMode === 'general' ? generalVoice : guidedVoice;

	const renderWave = () => {
		const path = createVoiceWavePath(waveLevels);
		voiceWaveGlow.setAttribute('d', path);
		voiceWavePath.setAttribute('d', path);
		voiceMonitorCopy.innerHTML = `<span class="voice-live-dot"></span>${
			isCapturing ? 'Microphone live' : 'Microphone idle'
		}`;
		voiceMonitorCopy.classList.toggle('is-live', isCapturing);
		voiceMonitor.classList.toggle('is-live', isCapturing);
	};

	const render = () => {
		const voice = currentVoice();
		const hasStarted =
			(activeMode ? hasStartedModes[activeMode] : false) ||
			voice.turns.length > 0;
		const status = voice.status;
		connectionMetric.textContent = voice.isConnected ? 'Connected' : 'Waiting';
		errorStatus.textContent = micError || voice.error || 'None';
		microphoneStatus.textContent = isCapturing
			? DEFAULT_MIC_LIVE
			: DEFAULT_MIC_IDLE;
		promptStatus.textContent = resolvePromptMessage({
			guidedPrompts,
			hasStarted,
			mode: activeMode,
			status,
			turnCount: voice.turns.length
		});
		startGuidedButton.hidden = isCapturing;
		startGeneralButton.hidden = isCapturing;
		stopButton.hidden = !isCapturing;
		chatList.innerHTML = `<article class="voice-chat-message assistant">
  <div class="voice-chat-role">${escapeHtml(activeMode === 'general' ? generalLabel : activeMode === 'guided' ? guidedLabel : 'Voice demo')}</div>
  <p class="voice-turn-text">${escapeHtml(
		resolveLeadMessage({
			generalLabel,
			guidedLabel,
			guidedPrompts,
			hasStarted,
			mode: activeMode,
			status,
			turnCount: voice.turns.length
		})
	)}</p>
</article>${voice.turns
		.map(
			(turn) => `<div class="voice-chat-stack">
  <article class="voice-chat-message user">
    <div class="voice-chat-role">You</div>
    <p class="voice-turn-text">${escapeHtml(turn.text)}</p>
  </article>
  ${
		turn.assistantText
			? `<article class="voice-chat-message assistant">
    <div class="voice-chat-role">${escapeHtml(
			activeMode === 'general'
				? generalLabel
				: activeMode === 'guided'
					? guidedLabel
					: 'Guide'
		)}</div>
    <p class="voice-turn-text">${escapeHtml(turn.assistantText)}</p>
  </article>`
			: ''
	}
</div>`
		)
		.join('')}${
			voice.partial
				? `<article class="voice-chat-message user pending">
  <div class="voice-chat-role">Speaking</div>
  <p class="voice-turn-text">${escapeHtml(voice.partial)}</p>
</article>`
				: ''
		}`;
		renderWave();
	};

	const stopMic = () => {
		currentVoice().stopRecording();
		isCapturing = false;
		micError = null;
		waveLevels = createInitialVoiceWaveLevels();
		render();
	};

	const startMode = async (mode: VoiceDemoMode) => {
		activeMode = mode;
		hasStartedModes = {
			...hasStartedModes,
			[mode]: true
		};

		try {
			await currentVoice().startRecording();
			micError = null;
			isCapturing = true;
			render();
		} catch (error) {
			currentVoice().stopRecording();
			isCapturing = false;
			waveLevels = createInitialVoiceWaveLevels();
			micError = formatErrorMessage(error);
			render();
		}
	};

	guidedVoice.subscribe(() => {
		syncBargeInOutput();
		render();
	});
	generalVoice.subscribe(() => {
		syncBargeInOutput();
		render();
	});

	startGuidedButton.addEventListener('click', () => {
		void startMode('guided');
	});
	startGeneralButton.addEventListener('click', () => {
		void startMode('general');
	});
	stopButton.addEventListener('click', () => {
		stopMic();
	});

	window.addEventListener('beforeunload', () => {
		guidedVoice.stopRecording();
		generalVoice.stopRecording();
		stopGuidedBinding();
		stopGeneralBinding();
		guidedVoice.close();
		generalVoice.close();
	});

	render();
};

export const initVoiceHTMX = () => {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return;
	}

	const roots = Array.from(document.querySelectorAll('[data-voice-htmx]'));
	for (const root of roots) {
		if (root instanceof HTMLElement) {
			initVoiceHTMXRoot(root);
		}
	}
};

initVoiceHTMX();
