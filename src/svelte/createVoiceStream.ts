import { createVoiceStream as createSharedVoiceStream } from '../client/createVoiceStream';
import type { VoiceConnectionOptions } from '../types';

export const createVoiceStream = <TResult = unknown>(
	path: string,
	options: VoiceConnectionOptions = {}
) => createSharedVoiceStream<TResult>(path, options);
