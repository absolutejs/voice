export type VoiceCampaignTemplateValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type VoiceCampaignTemplateScope = Record<
  string,
  VoiceCampaignTemplateValue | Record<string, VoiceCampaignTemplateValue>
>;

export type VoiceCampaignTemplateFilter = (
  value: VoiceCampaignTemplateValue,
  ...args: string[]
) => VoiceCampaignTemplateValue;

export type VoiceCampaignTemplateResolveResult = {
  output: string;
  missingVariables: string[];
};

export type ResolveVoiceCampaignTemplateOptions = {
  scope: VoiceCampaignTemplateScope;
  filters?: Record<string, VoiceCampaignTemplateFilter>;
  fallback?: string;
  strict?: boolean;
};

const lookupPath = (
  scope: VoiceCampaignTemplateScope,
  path: string,
): VoiceCampaignTemplateValue | undefined => {
  const parts = path.split(".");
  let cursor: unknown = scope;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor as VoiceCampaignTemplateValue | undefined;
};

const escapeSpeech = (text: string): string =>
  text.replace(/[<&>"]/gu, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });

const formatPhone = (phone: string): string => {
  const digits = phone.replace(/\D/gu, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
};

const formatDate = (value: VoiceCampaignTemplateValue, locale?: string): string => {
  if (value === null || value === undefined) return "";
  const date = new Date(typeof value === "number" ? value : String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(locale ?? "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

export const DEFAULT_VOICE_CAMPAIGN_TEMPLATE_FILTERS: Record<
  string,
  VoiceCampaignTemplateFilter
> = {
  capitalize: (value) => {
    if (value === null || value === undefined || value === "") return value ?? "";
    const text = String(value);
    return text.charAt(0).toUpperCase() + text.slice(1);
  },
  currency: (value, currency = "USD") => {
    if (typeof value !== "number") return String(value ?? "");
    return new Intl.NumberFormat("en-US", {
      currency,
      style: "currency",
    }).format(value);
  },
  date: (value, locale) => formatDate(value, locale),
  default: (value, fallback) =>
    value === null || value === undefined || value === "" ? fallback ?? "" : value,
  lower: (value) => String(value ?? "").toLowerCase(),
  phone: (value) => formatPhone(String(value ?? "")),
  ssml: (value) => escapeSpeech(String(value ?? "")),
  upper: (value) => String(value ?? "").toUpperCase(),
};

const renderValue = (
  value: VoiceCampaignTemplateValue,
  filters: Record<string, VoiceCampaignTemplateFilter>,
  filterChain: string[],
): string => {
  let cursor: VoiceCampaignTemplateValue = value;
  for (const segment of filterChain) {
    const parts = segment.split(":");
    const name = (parts[0] ?? "").trim();
    if (!name) continue;
    const args = parts
      .slice(1)
      .join(":")
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    const filter = filters[name];
    if (!filter) throw new Error(`Unknown template filter: ${name}`);
    cursor = filter(cursor, ...args);
  }
  if (cursor === null || cursor === undefined) return "";
  return String(cursor);
};

export const resolveVoiceCampaignTemplate = (
  template: string,
  options: ResolveVoiceCampaignTemplateOptions,
): VoiceCampaignTemplateResolveResult => {
  const filters = {
    ...DEFAULT_VOICE_CAMPAIGN_TEMPLATE_FILTERS,
    ...(options.filters ?? {}),
  };
  const missing = new Set<string>();
  const output = template.replace(
    /\{\{([^{}]+)\}\}/gu,
    (match, expression: string) => {
      const segments = expression.split("|").map((part) => part.trim());
      const path = segments[0] ?? "";
      const value = lookupPath(options.scope, path);
      if (value === undefined) {
        missing.add(path);
        if (options.strict) {
          throw new Error(`Missing template variable: ${path}`);
        }
        return options.fallback ?? "";
      }
      return renderValue(value, filters, segments.slice(1));
    },
  );
  return { missingVariables: Array.from(missing), output };
};

export const collectVoiceCampaignTemplateVariables = (
  template: string,
): string[] => {
  const set = new Set<string>();
  const matches = template.matchAll(/\{\{([^{}]+)\}\}/gu);
  for (const match of matches) {
    const expression = match[1] ?? "";
    const path = (expression.split("|")[0] ?? "").trim();
    if (path) set.add(path);
  }
  return Array.from(set);
};
