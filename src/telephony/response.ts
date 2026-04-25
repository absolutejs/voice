export type TelephonyResponseShapeMode = 'full' | 'lead-clause';

export type TelephonyResponseShapeOptions = {
	mode?: TelephonyResponseShapeMode;
	maxChars?: number;
	maxWords?: number;
};

const normalizeWhitespace = (value: string) =>
	value.replace(/\s+/g, ' ').trim();

const DEFAULT_MAX_WORDS = 12;
const CLAUSE_BOUNDARY_PATTERN = /(?<=[,.;!?])\s+/u;

const clampWords = (text: string, maxWords: number) => {
	if (!Number.isFinite(maxWords) || maxWords <= 0) {
		return text;
	}

	const words = text.split(/\s+/u).filter(Boolean);
	if (words.length <= maxWords) {
		return text;
	}

	return words.slice(0, maxWords).join(' ');
};

const clampChars = (text: string, maxChars: number | undefined) => {
	if (!Number.isFinite(maxChars) || !maxChars || maxChars <= 0) {
		return text;
	}

	if (text.length <= maxChars) {
		return text;
	}

	return text.slice(0, maxChars).trim();
};

const ensureTerminalPunctuation = (text: string) => {
	if (!text) {
		return text;
	}

	return /[.!?]$/u.test(text) ? text : `${text}.`;
};

const extractLeadClause = (text: string) => {
	const normalized = normalizeWhitespace(text);
	if (!normalized) {
		return normalized;
	}

	const colonIndex = normalized.indexOf(':');
	const body =
		colonIndex >= 0 &&
		colonIndex < 24 &&
		colonIndex < normalized.length - 1
			? normalizeWhitespace(normalized.slice(colonIndex + 1))
			: normalized;

	const clauses = body.split(CLAUSE_BOUNDARY_PATTERN).filter(Boolean);
	return clauses[0] ?? body;
};

export const shapeTelephonyAssistantText = (
	text: string,
	options: TelephonyResponseShapeOptions = {}
) => {
	const normalized = normalizeWhitespace(text);
	if (!normalized) {
		return normalized;
	}

	if ((options.mode ?? 'lead-clause') === 'full') {
		return clampChars(normalized, options.maxChars);
	}

	const lead = extractLeadClause(normalized);
	const limitedWords = clampWords(lead, options.maxWords ?? DEFAULT_MAX_WORDS);
	const limitedChars = clampChars(limitedWords, options.maxChars);
	return ensureTerminalPunctuation(normalizeWhitespace(limitedChars));
};
