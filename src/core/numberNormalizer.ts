/* Spoken-number normalizer for STT transcripts.
 *
 * Conversational STT models (notably Deepgram Flux, which doesn't accept the
 * `numerals` formatting flag) emit numbers, currency, and percentages as
 * spelled-out words — "ten million", "forty percent", "twenty-five thousand
 * dollars". Downstream LLM extraction then interprets the same metric
 * inconsistently across calls. This converts spelled numeric spans to digit
 * form so revenue/growth metrics read consistently, while leaving all
 * non-numeric text untouched.
 *
 * Deliberately conservative: it only rewrites spans that are unambiguously
 * numeric, keeps the magnitude WORD for million and up (so "ten to a hundred
 * million" → "10 to 100 million" reads correctly rather than mis-eliding), and
 * never touches a token it can't parse.
 */

const ONES: Record<string, number> = {
  eight: 8,
  eighteen: 18,
  eleven: 11,
  fifteen: 15,
  five: 5,
  four: 4,
  fourteen: 14,
  nine: 9,
  nineteen: 19,
  one: 1,
  seven: 7,
  seventeen: 17,
  six: 6,
  sixteen: 16,
  ten: 10,
  thirteen: 13,
  three: 3,
  twelve: 12,
  two: 2,
  zero: 0,
};
const TENS: Record<string, number> = {
  eighty: 80,
  fifty: 50,
  forty: 40,
  ninety: 90,
  seventy: 70,
  sixty: 60,
  thirty: 30,
  twenty: 20,
};
// Scales >= 1000 multiply the running value and flag a magnitude; "hundred" is
// handled separately (it scales the current group, not the total).
const SCALES: Record<string, number> = {
  billion: 1_000_000_000,
  million: 1_000_000,
  thousand: 1000,
  trillion: 1_000_000_000_000,
};
// Magnitudes rendered back as a word ("10 million") instead of multiplied out.
// Thousands stay numeric ("5,000") — that's how people write them.
const MAGNITUDE_WORDS: Array<[number, string]> = [
  [1_000_000_000_000, "trillion"],
  [1_000_000_000, "billion"],
  [1_000_000, "million"],
];
const FILLER = new Set(["and", "a", "an"]);
const DECIMAL_PLACES = 3;

const isValueWord = (word: string) =>
  word in ONES || word in TENS || word === "hundred";
const isScaleWord = (word: string) => word in SCALES;
const isNumberWord = (word: string) =>
  isValueWord(word) || isScaleWord(word) || word === "point" || FILLER.has(word);

const trimNumber = (value: number) => {
  if (Number.isInteger(value)) return value.toLocaleString("en-US");

  return String(Number(value.toFixed(DECIMAL_PLACES)));
};

const renderValue = (value: number, usedMagnitude: boolean): string => {
  if (usedMagnitude) {
    for (const [scale, word] of MAGNITUDE_WORDS) {
      if (value >= scale) {
        const scaled = value / scale;
        if (Number(scaled.toFixed(DECIMAL_PLACES)) === scaled) {
          return `${trimNumber(scaled)} ${word}`;
        }
      }
    }
  }

  return trimNumber(value);
};

type Parsed = { value: number; usedMagnitude: boolean } | null;

const parseNumberWords = (words: string[]): Parsed => {
  let total = 0;
  let current = 0;
  let usedMagnitude = false;
  let sawNumber = false;
  let decimal: string | null = null;
  const foldDecimal = () => {
    if (decimal && decimal.length > 0) current += Number(`0.${decimal}`);
    decimal = null;
  };

  for (const word of words) {
    if (word === "point") {
      decimal = "";
      continue;
    }
    const one = ONES[word];
    const ten = TENS[word];
    const scale = SCALES[word];
    if (decimal !== null) {
      if (one !== undefined && one <= 9) {
        decimal += String(one);
        sawNumber = true;
        continue;
      }
      foldDecimal();
    }
    if (FILLER.has(word)) continue;
    if (one !== undefined) {
      current += one;
      sawNumber = true;
    } else if (ten !== undefined) {
      current += ten;
      sawNumber = true;
    } else if (word === "hundred") {
      current = (current === 0 ? 1 : current) * 100;
      sawNumber = true;
    } else if (scale !== undefined) {
      total += (current === 0 ? 1 : current) * scale;
      current = 0;
      sawNumber = true;
      usedMagnitude = true;
    }
  }
  foldDecimal();
  if (!sawNumber) return null;

  return { usedMagnitude, value: total + current };
};

const PERCENT_RE = /^(per ?cent|percent|percentage)$/;
const CURRENCY_RE = /^(dollars?|bucks?|usd)$/;
const WORD_RE = /^[A-Za-z]+(?:-[A-Za-z]+)*$/;

const wordsOf = (token: string) => token.toLowerCase().split("-");
const isNumberToken = (token: string) =>
  WORD_RE.test(token) && wordsOf(token).every(isNumberWord);
const startsNumber = (token: string) =>
  WORD_RE.test(token) && wordsOf(token).some(isValueWord);
const isSpace = (token: string) => /^\s+$/.test(token);

/* Normalize spelled numbers / currency / percent in a transcript line. */
export const normalizeSpokenNumbers = (input: string): string => {
  if (!input) return input;
  const parts = input.match(/[A-Za-z]+(?:-[A-Za-z]+)*|[^A-Za-z]+/g);
  if (!parts) return input;

  const at = (idx: number): string => parts[idx] ?? "";
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const token = at(i);
    const lower = token.toLowerCase();
    // "a"/"an" only count as a number ("a hundred" = 100) when a scale/hundred
    // follows — otherwise it's an article ("a forty percent uplift").
    if (lower === "a" || lower === "an") {
      const nextWord = at(i + 2);
      const nextHead = wordsOf(nextWord)[0] ?? "";
      const nextIsScale =
        isSpace(at(i + 1)) &&
        WORD_RE.test(nextWord) &&
        (nextHead === "hundred" || isScaleWord(nextHead));
      if (!nextIsScale) {
        out.push(token);
        i += 1;
        continue;
      }
    } else if (!startsNumber(token)) {
      out.push(token);
      i += 1;
      continue;
    }

    // Greedily gather a maximal number span across single-space gaps.
    const spanIdx = [i];
    let j = i + 1;
    while (isSpace(at(j)) && isNumberToken(at(j + 1))) {
      spanIdx.push(j + 1);
      j += 2;
    }
    const words = spanIdx.flatMap((k) => wordsOf(at(k)));
    while (words.length > 0 && FILLER.has(words[words.length - 1] ?? "")) {
      words.pop();
    }
    const parsed = parseNumberWords(words);
    if (!parsed) {
      out.push(token);
      i += 1;
      continue;
    }

    let rendered = renderValue(parsed.value, parsed.usedMagnitude);
    let lastIdx = spanIdx[spanIdx.length - 1] ?? i;
    // Fold a trailing "percent" / "dollars" unit into symbol form.
    const unitWord = at(lastIdx + 2);
    if (isSpace(at(lastIdx + 1)) && WORD_RE.test(unitWord)) {
      const unit = unitWord.toLowerCase();
      if (PERCENT_RE.test(unit)) {
        rendered = `${rendered}%`;
        lastIdx += 2;
      } else if (CURRENCY_RE.test(unit)) {
        rendered = rendered.startsWith("$") ? rendered : `$${rendered}`;
        lastIdx += 2;
      }
    }

    out.push(rendered);
    i = lastIdx + 1;
  }

  return out.join("");
};
