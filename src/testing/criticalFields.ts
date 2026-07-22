import { normalizeSpokenNumbers } from "../core/numberNormalizer";

export type VoiceCriticalFieldKind =
  | "acronym"
  | "brand"
  | "currency"
  | "custom"
  | "email"
  | "number"
  | "organization"
  | "percentage"
  | "person-name"
  | "phone";

export type VoiceExpectedCriticalField = {
  aliases?: string[];
  id: string;
  kind: VoiceCriticalFieldKind;
  metadata?: Record<string, unknown>;
  required?: boolean;
  value: string;
};

export type VoiceCriticalFieldResult = VoiceExpectedCriticalField & {
  matched: boolean;
  matchedAlias?: string;
};

export type VoiceCriticalFieldAccuracy = {
  accuracy: number;
  fields: VoiceCriticalFieldResult[];
  matchedCount: number;
  missingFieldIds: string[];
  passesRequired: boolean;
  totalCount: number;
};

const normalizeText = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@.%+$'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeDigits = (value: string) =>
  normalizeSpokenNumbers(value).replace(/\D/g, "");

const normalizeSemanticNumber = (value: string) =>
  normalizeSpokenNumbers(value)
    .toLowerCase()
    .replace(/\bdollars?\b|\busd\b|\bpercent(age)?\b|[%,$]/g, "")
    .replace(/\s+/g, "")
    .trim();

const matchesCandidate = (
  actual: string,
  candidate: string,
  kind: VoiceCriticalFieldKind,
) => {
  if (kind === "phone") {
    const expectedDigits = normalizeDigits(candidate);
    return expectedDigits.length > 0 && normalizeDigits(actual).includes(expectedDigits);
  }

  if (kind === "currency" || kind === "number" || kind === "percentage") {
    const expectedNumber = normalizeSemanticNumber(candidate);
    return (
      expectedNumber.length > 0 &&
      normalizeSemanticNumber(actual).includes(expectedNumber)
    );
  }

  const normalizedCandidate = normalizeText(candidate);
  return (
    normalizedCandidate.length > 0 &&
    normalizeText(actual).includes(normalizedCandidate)
  );
};

export const scoreVoiceCriticalFields = (
  actualText: string,
  expectedFields: VoiceExpectedCriticalField[] = [],
): VoiceCriticalFieldAccuracy => {
  const fields = expectedFields.map((field): VoiceCriticalFieldResult => {
    const candidates = [field.value, ...(field.aliases ?? [])];
    const matchedAlias = candidates.find((candidate) =>
      matchesCandidate(actualText, candidate, field.kind),
    );

    return {
      ...field,
      matched: matchedAlias !== undefined,
      matchedAlias,
    };
  });
  const matchedCount = fields.filter((field) => field.matched).length;
  const totalCount = fields.length;

  return {
    accuracy: totalCount > 0 ? matchedCount / totalCount : 1,
    fields,
    matchedCount,
    missingFieldIds: fields
      .filter((field) => !field.matched)
      .map((field) => field.id),
    passesRequired: fields.every((field) => field.required === false || field.matched),
    totalCount,
  };
};
