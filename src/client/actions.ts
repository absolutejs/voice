import type { VoiceServerMessage } from '../types';

const normalizeErrorMessage = (value: unknown): string => {
	if (typeof value === 'string' && value.trim()) {
		return value;
	}

	if (value instanceof Error && value.message.trim()) {
		return value.message;
	}

	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		for (const key of ['message', 'reason', 'description']) {
			const candidate = record[key];
			if (typeof candidate === 'string' && candidate.trim()) {
				return candidate;
			}
		}

		if ('error' in record) {
			return normalizeErrorMessage(record.error);
		}

		if ('cause' in record) {
			return normalizeErrorMessage(record.cause);
		}

		try {
			return JSON.stringify(value);
		} catch {}
	}

	return 'Unexpected error';
};

export const serverMessageToAction = <TResult = unknown>(
	message: VoiceServerMessage<TResult>
) => {
	switch (message.type) {
		case 'audio':
			return {
				chunk: Uint8Array.from(atob(message.chunkBase64), (char) =>
					char.charCodeAt(0)
				),
				format: message.format,
				receivedAt: message.receivedAt,
				turnId: message.turnId,
				type: 'audio' as const
			};
		case 'assistant':
			return {
				text: message.text,
				type: 'assistant' as const
			};
		case 'complete':
			return {
				sessionId: message.sessionId,
				type: 'complete' as const
			};
		case 'connection':
			return {
				reconnect: message.reconnect,
				type: 'connection' as const
			};
		case 'call_lifecycle':
			return {
				event: message.event,
				sessionId: message.sessionId,
				type: 'call_lifecycle' as const
			};
		case 'error':
			return {
				message: normalizeErrorMessage(
					(message as { message?: unknown }).message
				),
				type: 'error' as const
			};
		case 'final':
			return {
				transcript: message.transcript,
				type: 'final' as const
			};
		case 'partial':
			return {
				transcript: message.transcript,
				type: 'partial' as const
			};
		case 'replay':
			return {
				assistantTexts: message.assistantTexts,
				call: message.call,
				partial: message.partial,
				scenarioId: message.scenarioId,
				sessionId: message.sessionId,
				status: message.status,
				turns: message.turns,
				type: 'replay' as const
			};
		case 'session':
			return {
				sessionId: message.sessionId,
				scenarioId: message.scenarioId,
				status: message.status,
				type: 'session' as const
			};
		case 'turn':
			return {
				turn: message.turn,
				type: 'turn' as const
			};
		default:
			return null;
	}
};
