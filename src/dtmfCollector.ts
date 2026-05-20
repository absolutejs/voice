export type VoiceDTMFDigit =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "*"
  | "#";

export const VOICE_DTMF_DIGITS: readonly VoiceDTMFDigit[] = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "*",
  "#",
];

export type VoiceDTMFCollectorState =
  | { status: "collecting"; digits: string }
  | { status: "completed"; digits: string; reason: "length" | "terminator" }
  | { status: "cancelled"; digits: string }
  | {
      status: "rejected";
      digits: string;
      reason: "invalid" | "timeout" | "too-short";
    };

export type CreateVoiceDTMFCollectorOptions = {
  prompt: string;
  minLength?: number;
  maxLength?: number;
  terminator?: VoiceDTMFDigit | null;
  timeoutMs?: number;
  interDigitTimeoutMs?: number;
  validator?: (digits: string) => boolean | string;
  now?: () => number;
};

const isDigit = (value: string): value is VoiceDTMFDigit =>
  VOICE_DTMF_DIGITS.includes(value as VoiceDTMFDigit);

export const collectVoiceDTMFInput = (
  options: CreateVoiceDTMFCollectorOptions,
) => {
  const now = options.now ?? (() => Date.now());
  const minLength = options.minLength ?? 1;
  const maxLength = options.maxLength ?? minLength;
  if (maxLength < minLength) {
    throw new RangeError(
      `maxLength (${maxLength}) cannot be less than minLength (${minLength})`,
    );
  }
  const terminator =
    options.terminator === undefined ? "#" : options.terminator;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const interDigitTimeoutMs = options.interDigitTimeoutMs ?? 3_000;
  const startedAt = now();
  let lastDigitAt = startedAt;
  let state: VoiceDTMFCollectorState = { digits: "", status: "collecting" };
  const listeners = new Set<(state: VoiceDTMFCollectorState) => void>();
  const notify = () => {
    for (const listener of listeners) listener(state);
  };

  const checkTimeouts = (at: number): boolean => {
    if (state.status !== "collecting") return false;
    if (at - startedAt > timeoutMs) {
      state = { digits: state.digits, reason: "timeout", status: "rejected" };
      notify();
      return true;
    }
    if (state.digits.length > 0 && at - lastDigitAt > interDigitTimeoutMs) {
      state = { digits: state.digits, reason: "timeout", status: "rejected" };
      notify();
      return true;
    }
    return false;
  };

  const finish = (reason: "length" | "terminator") => {
    if (state.status !== "collecting") return;
    const digits = state.digits;
    if (digits.length < minLength) {
      state = { digits, reason: "too-short", status: "rejected" };
      notify();
      return;
    }
    if (options.validator) {
      const verdict = options.validator(digits);
      if (verdict !== true) {
        state = { digits, reason: "invalid", status: "rejected" };
        notify();
        return;
      }
    }
    state = { digits, reason, status: "completed" };
    notify();
  };

  return {
    cancel(): VoiceDTMFCollectorState {
      if (state.status === "collecting") {
        state = { digits: state.digits, status: "cancelled" };
        notify();
      }
      return state;
    },
    feed(digit: string, at: number = now()): VoiceDTMFCollectorState {
      if (state.status !== "collecting") return state;
      if (checkTimeouts(at)) return state;
      if (!isDigit(digit)) {
        state = {
          digits: state.digits,
          reason: "invalid",
          status: "rejected",
        };
        notify();
        return state;
      }
      lastDigitAt = at;
      if (terminator && digit === terminator) {
        finish("terminator");
        return state;
      }
      const digits = state.digits + digit;
      state = { digits, status: "collecting" };
      if (digits.length >= maxLength) {
        finish("length");
      } else {
        notify();
      }
      return state;
    },
    getState: () => state,
    prompt: options.prompt,
    subscribe(listener: (state: VoiceDTMFCollectorState) => void) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    tick(at: number = now()): VoiceDTMFCollectorState {
      checkTimeouts(at);
      return state;
    },
  };
};

export type VoiceDTMFCollector = ReturnType<typeof collectVoiceDTMFInput>;

export const validateVoiceDTMFLuhn = (digits: string): boolean => {
  if (!/^\d+$/u.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};
