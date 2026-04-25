import type { AudioChunk, Transcript } from './types';

export const DEFAULT_SILENCE_MS = 700;
export const DEFAULT_SPEECH_THRESHOLD = 0.015;

const toUint8Array = (audio: AudioChunk) => {
	if (audio instanceof ArrayBuffer) {
		return new Uint8Array(audio);
	}

	return new Uint8Array(
		audio.buffer,
		audio.byteOffset,
		audio.byteLength
	);
};

export const measureAudioLevel = (audio: AudioChunk) => {
	const bytes = toUint8Array(audio);
	if (bytes.byteLength < 2) {
		return 0;
	}

	const samples = new Int16Array(
		bytes.buffer,
		bytes.byteOffset,
		Math.floor(bytes.byteLength / 2)
	);

	if (samples.length === 0) {
		return 0;
	}

	let sumSquares = 0;
	for (const sample of samples) {
		const normalized = sample / 0x8000;
		sumSquares += normalized * normalized;
	}

	return Math.sqrt(sumSquares / samples.length);
};

const normalizeText = (value: string) =>
	value.trim().replace(/\s+/g, ' ');

const countWords = (value: string) =>
	value.length > 0 ? value.split(' ').length : 0;

export const selectPreferredTranscriptText = (
	currentText: string,
	nextText: string
) => {
	const current = normalizeText(currentText);
	const next = normalizeText(nextText);

	if (!current) {
		return next;
	}

	if (!next) {
		return current;
	}

	if (current === next || current.includes(next)) {
		return current;
	}

	if (next.includes(current)) {
		return next;
	}

	if (countWords(next) > countWords(current)) {
		return next;
	}

	if (countWords(next) === countWords(current) && next.length > current.length) {
		return next;
	}

	return current;
};

const mergeSequentialTranscriptText = (
	currentText: string,
	nextText: string
) => {
	const current = normalizeText(currentText);
	const next = normalizeText(nextText);

	if (!current) {
		return next;
	}

	if (!next) {
		return current;
	}

	const currentWords = current.split(' ');
	const nextWords = next.split(' ');
	const maxOverlap = Math.min(currentWords.length, nextWords.length);

	for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
		const currentSuffix = currentWords.slice(-overlap).join(' ');
		const nextPrefix = nextWords.slice(0, overlap).join(' ');

		if (currentSuffix === nextPrefix) {
			return [...currentWords, ...nextWords.slice(overlap)].join(' ');
		}
	}

	return `${current} ${next}`.trim();
};

const countCommonPrefixWords = (currentText: string, nextText: string) => {
	const currentWords = normalizeText(currentText).split(' ').filter(Boolean);
	const nextWords = normalizeText(nextText).split(' ').filter(Boolean);
	const maxWords = Math.min(currentWords.length, nextWords.length);
	let count = 0;

	for (let index = 0; index < maxWords; index += 1) {
		if (currentWords[index] !== nextWords[index]) {
			break;
		}

		count += 1;
	}

	return count;
};

const mergeTranscriptTexts = (transcripts: Transcript[]) => {
	const merged: string[] = [];

	for (const transcript of transcripts) {
		const nextText = normalizeText(transcript.text);
		if (!nextText) {
			continue;
		}

		const previous = merged.at(-1);
		if (!previous) {
			merged.push(nextText);
			continue;
		}

		if (nextText === previous || previous.includes(nextText)) {
			continue;
		}

		if (nextText.includes(previous)) {
			merged[merged.length - 1] = nextText;
			continue;
		}

		merged.push(nextText);
	}

	return merged.join(' ').trim();
};

export const buildTurnText = (
	transcripts: Transcript[],
	partialText: string,
	options: {
		partialEndedAtMs?: number;
		partialStartedAtMs?: number;
	} = {}
) => {
	const finalText = mergeTranscriptTexts(transcripts);
	const nextPartial = normalizeText(partialText);
	const lastFinalEndedAtMs = [...transcripts]
		.reverse()
		.find((transcript) => typeof transcript.endedAtMs === 'number')?.endedAtMs;

	if (
		finalText &&
		nextPartial &&
		typeof lastFinalEndedAtMs === 'number' &&
		typeof options.partialStartedAtMs === 'number' &&
		options.partialStartedAtMs - lastFinalEndedAtMs >= 250 &&
		countCommonPrefixWords(finalText, nextPartial) === 0
	) {
		return mergeSequentialTranscriptText(finalText, nextPartial);
	}

	return selectPreferredTranscriptText(finalText, nextPartial);
};
