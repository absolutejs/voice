import type {
	VoiceClientMessage,
	VoiceConnectionOptions,
	VoiceServerMessage
} from '../types';

const WS_OPEN = 1;
const WS_CLOSED = 3;
const WS_NORMAL_CLOSURE = 1000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_PING_INTERVAL = 30_000;
const RECONNECT_DELAY_MS = 500;

const DEFAULT_SCENARIO_QUERY_PARAM = 'scenarioId';

type VoiceConnectionState = {
	isConnected: boolean;
	pendingMessages: Array<string | Uint8Array | ArrayBuffer>;
	pingInterval: ReturnType<typeof setInterval> | null;
	scenarioId: string | null;
	reconnectAttempts: number;
	reconnectTimeout: ReturnType<typeof setTimeout> | null;
	sessionId: string;
	ws: WebSocket | null;
};

type VoiceConnectionHandle = {
	callControl: (
		message: Omit<VoiceClientMessage & { type: 'call_control' }, 'type'>
	) => void;
	start: (input?: { sessionId?: string; scenarioId?: string }) => void;
	close: () => void;
	endTurn: () => void;
	getReadyState: () => number;
	getScenarioId: () => string;
	getSessionId: () => string;
	send: (message: VoiceClientMessage) => void;
	sendAudio: (audio: Uint8Array | ArrayBuffer) => void;
	subscribe: (callback: (message: VoiceServerMessage) => void) => () => void;
};

const noop = () => {};
const noopUnsubscribe = () => noop;

const NOOP_CONNECTION: VoiceConnectionHandle = {
	callControl: noop,
	close: noop,
	endTurn: noop,
	getReadyState: () => WS_CLOSED,
	getScenarioId: () => '',
	getSessionId: () => '',
	send: noop,
	sendAudio: noop,
	start: () => {},
	subscribe: noopUnsubscribe
};

const createSessionId = () => crypto.randomUUID();

const buildWsUrl = (
	path: string,
	sessionId: string,
	scenarioId: string | null
) => {
	const { hostname, port, protocol } = window.location;
	const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
	const portSuffix = port ? `:${port}` : '';
	const url = new URL(`${wsProtocol}//${hostname}${portSuffix}${path}`);
	url.searchParams.set('sessionId', sessionId);

	if (scenarioId) {
		url.searchParams.set(DEFAULT_SCENARIO_QUERY_PARAM, scenarioId);
	}

	return url.toString();
};

const isVoiceServerMessage = (value: unknown): value is VoiceServerMessage => {
	if (!value || typeof value !== 'object' || !('type' in value)) {
		return false;
	}

	switch (value.type) {
		case 'audio':
		case 'assistant':
		case 'call_lifecycle':
		case 'complete':
		case 'error':
		case 'final':
		case 'partial':
		case 'pong':
		case 'session':
		case 'turn':
			return true;
		default:
			return false;
	}
};

const parseServerMessage = (event: MessageEvent) => {
	if (typeof event.data !== 'string') {
		return null;
	}

	try {
		const parsed = JSON.parse(event.data) as unknown;

		return isVoiceServerMessage(parsed) ? parsed : null;
	} catch {
		return null;
	}
};

export const createVoiceConnection = (
	path: string,
	options: VoiceConnectionOptions = {}
) => {
	if (typeof window === 'undefined') {
		return NOOP_CONNECTION;
	}

	const listeners = new Set<(message: VoiceServerMessage) => void>();
	const shouldReconnect = options.reconnect !== false;
	const maxReconnectAttempts =
		options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
	const pingInterval = options.pingInterval ?? DEFAULT_PING_INTERVAL;

	const state: VoiceConnectionState = {
		isConnected: false,
		pendingMessages: [],
		scenarioId: options.scenarioId ?? null,
		pingInterval: null,
		reconnectAttempts: 0,
		reconnectTimeout: null,
		sessionId: options.sessionId ?? createSessionId(),
		ws: null
	};

	const clearTimers = () => {
		if (state.pingInterval) {
			clearInterval(state.pingInterval);
			state.pingInterval = null;
		}

		if (state.reconnectTimeout) {
			clearTimeout(state.reconnectTimeout);
			state.reconnectTimeout = null;
		}
	};

	const flushPendingMessages = () => {
		if (state.ws?.readyState !== WS_OPEN) {
			return;
		}

		while (state.pendingMessages.length > 0) {
			const next = state.pendingMessages.shift();

			if (next !== undefined) {
				state.ws.send(next);
			}
		}
	};

	const scheduleReconnect = () => {
		state.reconnectAttempts += 1;
		state.reconnectTimeout = setTimeout(() => {
			if (state.reconnectAttempts > maxReconnectAttempts) {
				return;
			}

			connect();
		}, RECONNECT_DELAY_MS);
	};

	const connect = () => {
		const ws = new WebSocket(
			buildWsUrl(path, state.sessionId, state.scenarioId)
		);
		ws.binaryType = 'arraybuffer';

		ws.onopen = () => {
			state.isConnected = true;
			state.reconnectAttempts = 0;
			flushPendingMessages();

			listeners.forEach((listener) =>
				listener({
					scenarioId: state.scenarioId ?? undefined,
					sessionId: state.sessionId,
					status: 'active',
					type: 'session'
				})
			);

			state.pingInterval = setInterval(() => {
				if (ws.readyState === WS_OPEN) {
					ws.send(JSON.stringify({ type: 'ping' }));
				}
			}, pingInterval);
		};

		ws.onmessage = (event) => {
			const parsed = parseServerMessage(event);
			if (!parsed) {
				return;
			}

			if (parsed.type === 'session') {
				state.sessionId = parsed.sessionId;
				state.scenarioId = parsed.scenarioId ?? state.scenarioId;
			}

			listeners.forEach((listener) => listener(parsed));
		};

		ws.onclose = (event) => {
			state.isConnected = false;
			clearTimers();

			const reconnectable =
				shouldReconnect &&
				event.code !== WS_NORMAL_CLOSURE &&
				state.reconnectAttempts < maxReconnectAttempts;

			if (reconnectable) {
				scheduleReconnect();
			}
		};

		state.ws = ws;
	};

	const sendSerialized = (value: string | Uint8Array | ArrayBuffer) => {
		if (state.ws?.readyState === WS_OPEN) {
			state.ws.send(value);

			return;
		}

		state.pendingMessages.push(value);
	};

	const send = (message: VoiceClientMessage) => {
		sendSerialized(JSON.stringify(message));
	};

	const start = (input: { sessionId?: string; scenarioId?: string } = {}) => {
		if (input.sessionId) {
			state.sessionId = input.sessionId;
		}

		if (input.scenarioId) {
			state.scenarioId = input.scenarioId;
		}

		send({
			type: 'start',
			sessionId: state.sessionId,
			scenarioId: state.scenarioId ?? undefined
		});
	};

	const sendAudio = (audio: Uint8Array | ArrayBuffer) => {
		sendSerialized(audio);
	};

	const endTurn = () => {
		send({ type: 'end_turn' });
	};

	const callControl = (
		message: Omit<VoiceClientMessage & { type: 'call_control' }, 'type'>
	) => {
		send({
			...message,
			type: 'call_control'
		});
	};

	const close = () => {
		clearTimers();

		if (state.ws) {
			state.ws.close(WS_NORMAL_CLOSURE);
			state.ws = null;
		}

		state.isConnected = false;
		listeners.clear();
	};

	const subscribe = (callback: (message: VoiceServerMessage) => void) => {
		listeners.add(callback);

		return () => {
			listeners.delete(callback);
		};
	};

	connect();

	return {
		callControl,
		close,
		endTurn,
		getReadyState: () => state.ws?.readyState ?? WS_CLOSED,
		getScenarioId: () => state.scenarioId ?? '',
		getSessionId: () => state.sessionId,
		send,
		sendAudio,
		start,
		subscribe
	};
};
