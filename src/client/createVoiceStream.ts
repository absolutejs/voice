import { serverMessageToAction } from './actions';
import { createVoiceBrowserMediaReporter } from './browserMedia';
import { createVoiceConnection } from './connection';
import { createVoiceStreamStore } from './store';
import type { VoiceConnectionOptions, VoiceStream } from '../types';

export const createVoiceStream = <TResult = unknown>(
	path: string,
	options: VoiceConnectionOptions = {}
): VoiceStream<TResult> => {
	const connection = createVoiceConnection(path, options);
	const store = createVoiceStreamStore<TResult>();
	const browserMediaReporter =
		options.browserMedia && typeof window !== 'undefined'
			? createVoiceBrowserMediaReporter({
					...options.browserMedia,
					getScenarioId: () =>
						options.browserMedia
							? (options.browserMedia.getScenarioId?.() ?? connection.getScenarioId())
							: connection.getScenarioId(),
					getSessionId: () =>
						options.browserMedia
							? (options.browserMedia.getSessionId?.() ?? connection.getSessionId())
							: connection.getSessionId()
				})
			: null;
	const subscribers = new Set<() => void>();
	const start = (input?: { scenarioId?: string; sessionId?: string }) =>
		Promise.resolve().then(() => {
			if (!input?.sessionId && !input?.scenarioId) {
				return;
			}

			connection.start(input);
			browserMediaReporter?.start();
		});

	const notify = () => {
		subscribers.forEach((subscriber) => subscriber());
	};
	const reportReconnect = () => {
		if (!options.reconnectReportPath || typeof fetch === 'undefined') {
			return;
		}

		const snapshot = store.getSnapshot();
		const body = JSON.stringify({
			at: Date.now(),
			reconnect: snapshot.reconnect,
			scenarioId: snapshot.scenarioId,
			sessionId: connection.getSessionId(),
			turnIds: snapshot.turns.map((turn) => turn.id)
		});
		void fetch(options.reconnectReportPath, {
			body,
			headers: {
				'Content-Type': 'application/json'
			},
			keepalive: true,
			method: 'POST'
		}).catch(() => {});
	};

	const unsubscribeConnection = connection.subscribe((message) => {
		const action = serverMessageToAction<TResult>(message as never);
		if (action) {
			store.dispatch(action as never);
			if (message.type === 'connection') {
				reportReconnect();
			}
			notify();
		}
	});

	return {
		callControl(message) {
			connection.callControl(message);
		},
		close() {
			unsubscribeConnection();
			browserMediaReporter?.close();
			connection.close();
			store.dispatch({ type: 'disconnected' });
			notify();
		},
		endTurn() {
			connection.endTurn();
		},
		get error() {
			return store.getSnapshot().error;
		},
		getServerSnapshot() {
			return store.getServerSnapshot();
		},
		getSnapshot() {
			return store.getSnapshot();
		},
		get isConnected() {
			return store.getSnapshot().isConnected;
		},
		get scenarioId() {
			return store.getSnapshot().scenarioId;
		},
		start,
		get partial() {
			return store.getSnapshot().partial;
		},
		get reconnect() {
			return store.getSnapshot().reconnect;
		},
		get sessionId() {
			return connection.getSessionId();
		},
		get status() {
			return store.getSnapshot().status;
		},
		get turns() {
			return store.getSnapshot().turns;
		},
		get assistantTexts() {
			return store.getSnapshot().assistantTexts;
		},
		get assistantAudio() {
			return store.getSnapshot().assistantAudio;
		},
		get call() {
			return store.getSnapshot().call;
		},
		sendAudio(audio: Uint8Array | ArrayBuffer) {
			connection.sendAudio(audio);
		},
		subscribe(subscriber: () => void) {
			subscribers.add(subscriber);

			return () => {
				subscribers.delete(subscriber);
			};
		}
	};
};
