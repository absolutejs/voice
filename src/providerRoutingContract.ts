import {
  listVoiceRoutingEvents,
  type VoiceRoutingEvent,
  type VoiceRoutingEventKind,
} from "./resilienceRoutes";
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from "./trace";

export type VoiceProviderRoutingStatus = "error" | "fallback" | "success";

export type VoiceProviderRoutingExpectation = {
  fallbackProvider?: string;
  kind?: VoiceRoutingEventKind;
  operation?: string;
  provider?: string;
  selectedProvider?: string;
  status?: VoiceProviderRoutingStatus;
};

export type VoiceProviderRoutingContractDefinition = {
  description?: string;
  expect: VoiceProviderRoutingExpectation[];
  id: string;
  label?: string;
  scenarioId?: string;
  sessionId?: string;
};

export type VoiceProviderRoutingContractIssue = {
  code: string;
  message: string;
};

export type VoiceProviderRoutingContractReport = {
  contractId: string;
  events: VoiceRoutingEvent[];
  issues: VoiceProviderRoutingContractIssue[];
  pass: boolean;
  scenarioId?: string;
  sessionId?: string;
};

export type VoiceProviderRoutingContractRunOptions = {
  contract: VoiceProviderRoutingContractDefinition;
  events?: StoredVoiceTraceEvent[] | VoiceRoutingEvent[];
  store?: VoiceTraceEventStore;
};

export type VoiceProviderRoutingContractAssertionInput = {
  maxFailed?: number;
  maxIssues?: number;
  minContracts?: number;
  minEvents?: number;
  requiredContractIds?: string[];
  requiredFallbackProviders?: string[];
  requiredKinds?: VoiceRoutingEventKind[];
  requiredOperations?: string[];
  requiredProviders?: string[];
  requiredScenarioIds?: string[];
  requiredSelectedProviders?: string[];
  requiredStatuses?: VoiceProviderRoutingStatus[];
};

export type VoiceProviderRoutingContractAssertionReport = {
  contractIds: string[];
  events: number;
  failed: number;
  fallbackProviders: string[];
  issues: string[];
  issueCount: number;
  kinds: VoiceRoutingEventKind[];
  ok: boolean;
  operations: string[];
  passed: number;
  providers: string[];
  scenarioIds: string[];
  selectedProviders: string[];
  statuses: VoiceProviderRoutingStatus[];
  total: number;
};

const isRoutingEvent = (event: unknown): event is VoiceRoutingEvent =>
  Boolean(
    event &&
    typeof event === "object" &&
    "status" in event &&
    "kind" in event &&
    "sessionId" in event,
  );

const normalizeEvents = (
  events: StoredVoiceTraceEvent[] | VoiceRoutingEvent[],
): VoiceRoutingEvent[] =>
  (events.every(isRoutingEvent)
    ? [...(events as VoiceRoutingEvent[])]
    : listVoiceRoutingEvents(events as StoredVoiceTraceEvent[])
  ).sort((left, right) => left.at - right.at);

const matchesExpectation = (
  event: VoiceRoutingEvent,
  expectation: VoiceProviderRoutingExpectation,
) =>
  (expectation.kind === undefined || event.kind === expectation.kind) &&
  (expectation.operation === undefined ||
    event.operation === expectation.operation) &&
  (expectation.provider === undefined ||
    event.provider === expectation.provider) &&
  (expectation.selectedProvider === undefined ||
    event.selectedProvider === expectation.selectedProvider) &&
  (expectation.fallbackProvider === undefined ||
    event.fallbackProvider === expectation.fallbackProvider) &&
  (expectation.status === undefined || event.status === expectation.status);

const describeExpectation = (expectation: VoiceProviderRoutingExpectation) =>
  Object.entries(expectation)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");

export const runVoiceProviderRoutingContract = async (
  options: VoiceProviderRoutingContractRunOptions,
): Promise<VoiceProviderRoutingContractReport> => {
  const rawEvents = options.events ?? (await options.store?.list()) ?? [];
  const events = normalizeEvents(rawEvents).filter(
    (event) =>
      (!options.contract.sessionId ||
        event.sessionId === options.contract.sessionId) &&
      (!options.contract.scenarioId ||
        event.sessionId === options.contract.scenarioId ||
        (rawEvents as StoredVoiceTraceEvent[]).some(
          (rawEvent) =>
            !isRoutingEvent(rawEvent) &&
            rawEvent.sessionId === event.sessionId &&
            rawEvent.scenarioId === options.contract.scenarioId,
        )),
  );
  const issues: VoiceProviderRoutingContractIssue[] = [];
  let searchFrom = 0;

  for (const [index, expectation] of options.contract.expect.entries()) {
    const matchIndex = events.findIndex(
      (event, eventIndex) =>
        eventIndex >= searchFrom && matchesExpectation(event, expectation),
    );
    if (matchIndex === -1) {
      issues.push({
        code: "provider_routing.expected_event_missing",
        message: `Expected provider routing event ${index + 1}: ${describeExpectation(expectation)}.`,
      });
      continue;
    }
    searchFrom = matchIndex + 1;
  }

  return {
    contractId: options.contract.id,
    events,
    issues,
    pass: issues.length === 0,
    scenarioId: options.contract.scenarioId,
    sessionId: options.contract.sessionId,
  };
};

export const assertVoiceProviderRoutingContract = async (
  options: VoiceProviderRoutingContractRunOptions,
): Promise<VoiceProviderRoutingContractReport> => {
  const report = await runVoiceProviderRoutingContract(options);
  if (!report.pass) {
    throw new Error(
      `Voice provider routing contract ${report.contractId} failed: ${report.issues
        .map((issue) => issue.message)
        .join(" ")}`,
    );
  }
  return report;
};

export const evaluateVoiceProviderRoutingContractEvidence = (
  reports: readonly VoiceProviderRoutingContractReport[],
  input: VoiceProviderRoutingContractAssertionInput = {},
): VoiceProviderRoutingContractAssertionReport => {
  const issues: string[] = [];
  const maxFailed = input.maxFailed ?? 0;
  const maxIssues = input.maxIssues ?? 0;
  const events = reports.flatMap((report) => report.events);
  const contractIds = [
    ...new Set(reports.map((report) => report.contractId)),
  ].sort();
  const scenarioIds = [
    ...new Set(
      reports
        .map((report) => report.scenarioId)
        .filter((scenarioId): scenarioId is string => Boolean(scenarioId)),
    ),
  ].sort();
  const kinds = [...new Set(events.map((event) => event.kind))].sort();
  const operations = [
    ...new Set(
      events
        .map((event) => event.operation)
        .filter((operation): operation is string => Boolean(operation)),
    ),
  ].sort();
  const providers = [
    ...new Set(
      events
        .map((event) => event.provider)
        .filter((provider): provider is string => Boolean(provider)),
    ),
  ].sort();
  const selectedProviders = [
    ...new Set(
      events
        .map((event) => event.selectedProvider)
        .filter((provider): provider is string => Boolean(provider)),
    ),
  ].sort();
  const fallbackProviders = [
    ...new Set(
      events
        .map((event) => event.fallbackProvider)
        .filter((provider): provider is string => Boolean(provider)),
    ),
  ].sort();
  const statuses = [
    ...new Set(
      events
        .map((event) => event.status)
        .filter(
          (status): status is VoiceProviderRoutingStatus =>
            status !== undefined,
        ),
    ),
  ].sort();
  const failed = reports.filter((report) => !report.pass).length;
  const issueCount = reports.reduce(
    (total, report) => total + report.issues.length,
    0,
  );

  if (input.minContracts !== undefined && reports.length < input.minContracts) {
    issues.push(
      `Expected at least ${String(input.minContracts)} provider routing contract(s), found ${String(reports.length)}.`,
    );
  }
  if (failed > maxFailed) {
    issues.push(
      `Expected at most ${String(maxFailed)} failing provider routing contract(s), found ${String(failed)}.`,
    );
  }
  if (issueCount > maxIssues) {
    issues.push(
      `Expected at most ${String(maxIssues)} provider routing contract issue(s), found ${String(issueCount)}.`,
    );
  }
  if (input.minEvents !== undefined && events.length < input.minEvents) {
    issues.push(
      `Expected at least ${String(input.minEvents)} provider routing event(s), found ${String(events.length)}.`,
    );
  }
  for (const contractId of input.requiredContractIds ?? []) {
    if (!contractIds.includes(contractId)) {
      issues.push(`Missing provider routing contract: ${contractId}.`);
    }
  }
  for (const scenarioId of input.requiredScenarioIds ?? []) {
    if (!scenarioIds.includes(scenarioId)) {
      issues.push(`Missing provider routing scenario: ${scenarioId}.`);
    }
  }
  for (const kind of input.requiredKinds ?? []) {
    if (!kinds.includes(kind)) {
      issues.push(`Missing provider routing kind: ${kind}.`);
    }
  }
  for (const operation of input.requiredOperations ?? []) {
    if (!operations.includes(operation)) {
      issues.push(`Missing provider routing operation: ${operation}.`);
    }
  }
  for (const provider of input.requiredProviders ?? []) {
    if (!providers.includes(provider)) {
      issues.push(`Missing provider routing provider: ${provider}.`);
    }
  }
  for (const provider of input.requiredSelectedProviders ?? []) {
    if (!selectedProviders.includes(provider)) {
      issues.push(`Missing selected provider: ${provider}.`);
    }
  }
  for (const provider of input.requiredFallbackProviders ?? []) {
    if (!fallbackProviders.includes(provider)) {
      issues.push(`Missing fallback provider: ${provider}.`);
    }
  }
  for (const status of input.requiredStatuses ?? []) {
    if (!statuses.includes(status)) {
      issues.push(`Missing provider routing status: ${status}.`);
    }
  }

  return {
    contractIds,
    events: events.length,
    failed,
    fallbackProviders,
    issues,
    issueCount,
    kinds,
    ok: issues.length === 0,
    operations,
    passed: reports.length - failed,
    providers,
    scenarioIds,
    selectedProviders,
    statuses,
    total: reports.length,
  };
};

export const assertVoiceProviderRoutingContractEvidence = (
  reports: readonly VoiceProviderRoutingContractReport[],
  input: VoiceProviderRoutingContractAssertionInput = {},
): VoiceProviderRoutingContractAssertionReport => {
  const report = evaluateVoiceProviderRoutingContractEvidence(reports, input);
  if (!report.ok) {
    throw new Error(
      `Voice provider routing contract evidence assertion failed: ${report.issues.join(" ")}`,
    );
  }
  return report;
};
