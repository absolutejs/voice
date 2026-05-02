import { Elysia } from "elysia";
import type {
  VoiceReconnectClientState,
  VoiceSessionRecord,
  VoiceSessionStore,
} from "./types";
import type { StoredVoiceTraceEvent } from "./trace";

export type VoiceReconnectContractSnapshot = {
  at: number;
  reconnect: VoiceReconnectClientState;
  turnIds?: readonly string[];
};

export type VoiceReconnectContractIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type VoiceReconnectContractReport = {
  checkedAt: number;
  issues: VoiceReconnectContractIssue[];
  pass: boolean;
  resumeLatencyP95Ms?: number;
  snapshotCount: number;
  statuses: VoiceReconnectClientState["status"][];
  summary: {
    attempts: number;
    maxAttempts: number;
    reconnected: boolean;
    resumed: boolean;
    exhausted: boolean;
    duplicateTurnIds: string[];
  };
};

export type VoiceReconnectContractOptions = {
  allowNoSnapshots?: boolean;
  requireReconnect?: boolean;
  requireResume?: boolean;
  requireReplayProtection?: boolean;
  snapshots: readonly VoiceReconnectContractSnapshot[];
};

export type VoiceReconnectProofStatus = "fail" | "pass" | "warn";

export type VoiceReconnectProofReport = {
  checkedAt: number;
  contract: VoiceReconnectContractReport;
  generatedAt: string;
  ok: boolean;
  reconnectAware: true;
  sessionCount: number;
  snapshotCount: number;
  status: VoiceReconnectProofStatus;
  summary: string;
};

export type VoiceReconnectProofOptions = {
  completedSessionCount?: number;
  maxAttempts?: number;
  requireObservedReconnect?: boolean;
  requireReplayProtection?: boolean;
  requireResumeAfterReconnect?: boolean;
  sessions?: readonly VoiceSessionRecord[];
  snapshots?: readonly VoiceReconnectContractSnapshot[];
};

export type VoiceReconnectProofRoutesOptions = Omit<
  VoiceReconnectProofOptions,
  "completedSessionCount" | "sessions" | "snapshots"
> & {
  getCompletedSessionCount?: () => number | Promise<number>;
  getSessions?: () =>
    | readonly VoiceSessionRecord[]
    | Promise<readonly VoiceSessionRecord[]>;
  getSnapshots?: () =>
    | readonly VoiceReconnectContractSnapshot[]
    | Promise<readonly VoiceReconnectContractSnapshot[]>;
  headers?: HeadersInit;
  maxCollectedSnapshots?: number;
  name?: string;
  path?: string;
  store?: VoiceSessionStore;
};

export type VoiceReconnectContractRoutesOptions = Omit<
  VoiceReconnectContractOptions,
  "snapshots"
> & {
  getSnapshots: () =>
    | readonly VoiceReconnectContractSnapshot[]
    | Promise<readonly VoiceReconnectContractSnapshot[]>;
  headers?: HeadersInit;
  htmlPath?: false | string;
  name?: string;
  path?: string;
  render?: (report: VoiceReconnectContractReport) => string | Promise<string>;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const unique = <T>(values: T[]) => [...new Set(values)];

const isReconnectPayload = (
  value: unknown,
): value is VoiceReconnectContractSnapshot & {
  sessionId?: string;
} => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as VoiceReconnectContractSnapshot;

  return (
    typeof payload.at === "number" &&
    !!payload.reconnect &&
    typeof payload.reconnect === "object" &&
    typeof payload.reconnect.attempts === "number" &&
    typeof payload.reconnect.maxAttempts === "number" &&
    typeof payload.reconnect.status === "string"
  );
};

export const summarizeVoiceReconnectContractSnapshots = (
  events: readonly StoredVoiceTraceEvent[],
  options: {
    sessionId?: string;
  } = {},
): VoiceReconnectContractSnapshot[] =>
  events
    .filter(
      (event) =>
        event.type === "client.reconnect" &&
        (!options.sessionId || event.sessionId === options.sessionId) &&
        isReconnectPayload(event.payload),
    )
    .map((event) => {
      const payload = event.payload as VoiceReconnectContractSnapshot;

      return {
        at: typeof payload.at === "number" ? payload.at : event.at,
        reconnect: payload.reconnect,
        turnIds: Array.isArray(payload.turnIds)
          ? payload.turnIds.filter(
              (turnId): turnId is string => typeof turnId === "string",
            )
          : undefined,
      };
    })
    .sort((left, right) => left.at - right.at);

export const summarizeVoiceReconnectProofSessions = (
  sessions: readonly VoiceSessionRecord[],
  options: { maxAttempts?: number } = {},
): VoiceReconnectContractSnapshot[] =>
  sessions
    .map((session) => {
      const attempts = session.reconnect.attempts;
      const at =
        session.lastActivityAt ??
        session.reconnect.lastDisconnectAt ??
        session.createdAt;
      const status: VoiceReconnectClientState["status"] =
        session.status === "reconnecting"
          ? "reconnecting"
          : attempts > 0 && session.status === "completed"
            ? "resumed"
            : attempts > 0 && session.status === "failed"
              ? "exhausted"
              : "idle";

      return {
        at,
        reconnect: {
          attempts,
          lastDisconnectAt: session.reconnect.lastDisconnectAt,
          lastResumedAt:
            status === "resumed" && session.lastActivityAt
              ? session.lastActivityAt
              : undefined,
          maxAttempts: options.maxAttempts ?? attempts,
          status,
        },
        turnIds:
          session.committedTurnIds.length > 0
            ? session.committedTurnIds
            : session.turns.map((turn) => turn.id),
      };
    })
    .sort((left, right) => left.at - right.at);

const findDuplicateTurnIds = (
  snapshots: readonly VoiceReconnectContractSnapshot[],
) => {
  const duplicates = new Set<string>();

  for (const snapshot of snapshots) {
    const seen = new Set<string>();
    for (const turnId of snapshot.turnIds ?? []) {
      if (seen.has(turnId)) {
        duplicates.add(turnId);
      }
      seen.add(turnId);
    }
  }

  return [...duplicates].sort();
};

const percentile = (values: number[], rank: number) => {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1),
  );
  return sorted[index];
};

const getResumeLatencies = (
  snapshots: readonly VoiceReconnectContractSnapshot[],
) =>
  snapshots
    .filter(
      (snapshot) =>
        snapshot.reconnect.status === "resumed" &&
        typeof snapshot.reconnect.lastResumedAt === "number",
    )
    .map((snapshot) => {
      const previousReconnect = snapshots
        .filter(
          (candidate) =>
            candidate.at <= snapshot.at &&
            candidate.reconnect.status === "reconnecting" &&
            typeof candidate.reconnect.lastDisconnectAt === "number",
        )
        .at(-1);

      return previousReconnect?.reconnect.lastDisconnectAt === undefined
        ? undefined
        : snapshot.reconnect.lastResumedAt! -
            previousReconnect.reconnect.lastDisconnectAt;
    })
    .filter(
      (value): value is number => typeof value === "number" && value >= 0,
    );

export const runVoiceReconnectContract = (
  options: VoiceReconnectContractOptions,
): VoiceReconnectContractReport => {
  const snapshots = [...options.snapshots].sort(
    (left, right) => left.at - right.at,
  );
  const issues: VoiceReconnectContractIssue[] = [];
  const statuses = unique(
    snapshots.map((snapshot) => snapshot.reconnect.status),
  );
  const attempts = Math.max(
    0,
    ...snapshots.map((snapshot) => snapshot.reconnect.attempts),
  );
  const maxAttempts = Math.max(
    0,
    ...snapshots.map((snapshot) => snapshot.reconnect.maxAttempts),
  );
  const reconnected = statuses.includes("reconnecting");
  const resumed = statuses.includes("resumed");
  const exhausted = statuses.includes("exhausted");
  const duplicateTurnIds = findDuplicateTurnIds(snapshots);
  const resumeLatencyP95Ms = percentile(getResumeLatencies(snapshots), 95);
  const requireReconnect = options.requireReconnect ?? true;
  const requireResume = options.requireResume ?? true;
  const requireReplayProtection = options.requireReplayProtection ?? true;

  if (snapshots.length === 0 && !options.allowNoSnapshots) {
    issues.push({
      code: "reconnect.no_snapshots",
      message: "No reconnect snapshots were provided.",
      severity: "error",
    });
  }

  if (requireReconnect && !reconnected) {
    issues.push({
      code: "reconnect.not_observed",
      message: "No reconnecting state was observed.",
      severity: "error",
    });
  }

  if (requireResume && reconnected && !resumed) {
    issues.push({
      code: exhausted
        ? "reconnect.exhausted_before_resume"
        : "reconnect.resume_not_observed",
      message: exhausted
        ? "Reconnect exhausted before a resumed state was observed."
        : "Reconnect started but no resumed state was observed.",
      severity: "error",
    });
  }

  for (const snapshot of snapshots) {
    const { reconnect } = snapshot;
    if (
      reconnect.maxAttempts > 0 &&
      reconnect.attempts > reconnect.maxAttempts
    ) {
      issues.push({
        code: "reconnect.max_attempts_exceeded",
        message: `Reconnect attempts exceeded maxAttempts at ${snapshot.at}.`,
        severity: "error",
      });
    }
    if (
      reconnect.status === "reconnecting" &&
      reconnect.nextAttemptAt !== undefined &&
      reconnect.nextAttemptAt < snapshot.at
    ) {
      issues.push({
        code: "reconnect.stale_next_attempt",
        message: `Reconnect nextAttemptAt is older than the snapshot at ${snapshot.at}.`,
        severity: "warning",
      });
    }
  }

  if (requireReplayProtection && duplicateTurnIds.length > 0) {
    issues.push({
      code: "reconnect.duplicate_turn_ids",
      message: `Replay produced duplicate turn ids: ${duplicateTurnIds.join(", ")}.`,
      severity: "error",
    });
  }

  const pass = issues.every((issue) => issue.severity !== "error");

  return {
    checkedAt: Date.now(),
    issues,
    pass,
    resumeLatencyP95Ms,
    snapshotCount: snapshots.length,
    statuses,
    summary: {
      attempts,
      duplicateTurnIds,
      exhausted,
      maxAttempts,
      reconnected,
      resumed,
    },
  };
};

export const buildVoiceReconnectProofReport = (
  options: VoiceReconnectProofOptions = {},
): VoiceReconnectProofReport => {
  const sessionSnapshots = options.sessions
    ? summarizeVoiceReconnectProofSessions(options.sessions, {
        maxAttempts: options.maxAttempts,
      })
    : [];
  const snapshots = [...sessionSnapshots, ...(options.snapshots ?? [])].sort(
    (left, right) => left.at - right.at,
  );
  const requireObservedReconnect = options.requireObservedReconnect ?? false;
  const contract = runVoiceReconnectContract({
    allowNoSnapshots: true,
    requireReconnect: requireObservedReconnect,
    requireReplayProtection: options.requireReplayProtection ?? true,
    requireResume:
      options.requireResumeAfterReconnect ?? requireObservedReconnect,
    snapshots,
  });
  const errorCount = contract.issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const warningCount = contract.issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const status: VoiceReconnectProofStatus =
    errorCount > 0 ? "fail" : warningCount > 0 ? "warn" : "pass";
  const sessionCount =
    options.completedSessionCount ?? options.sessions?.length ?? 0;
  const summary =
    snapshots.length === 0
      ? `Checked ${sessionCount} completed session(s). Reconnect proof is enabled; no reconnect cycle was observed.`
      : contract.summary.resumed
        ? `Checked ${sessionCount} completed session(s) and ${snapshots.length} reconnect snapshot(s). Resume was observed without replay duplicates.`
        : contract.summary.reconnected
          ? `Checked ${sessionCount} completed session(s) and ${snapshots.length} reconnect snapshot(s). Reconnect was observed.`
          : `Checked ${sessionCount} completed session(s) and ${snapshots.length} reconnect snapshot(s). No reconnect was required.`;

  return {
    checkedAt: contract.checkedAt,
    contract,
    generatedAt: new Date(contract.checkedAt).toISOString(),
    ok: status !== "fail",
    reconnectAware: true,
    sessionCount,
    snapshotCount: snapshots.length,
    status,
    summary,
  };
};

const getSessionsFromStore = async (store: VoiceSessionStore) => {
  const summaries = await store.list();
  const sessions = await Promise.all(
    summaries.map((summary) => store.get(summary.id)),
  );

  return sessions.filter(
    (session): session is VoiceSessionRecord => session !== undefined,
  );
};

export const createVoiceReconnectProofRoutes = (
  options: VoiceReconnectProofRoutesOptions = {},
) => {
  const path = options.path ?? "/api/voice/reconnect-proof";
  const collectedSnapshots: VoiceReconnectContractSnapshot[] = [];
  const maxCollectedSnapshots = options.maxCollectedSnapshots ?? 500;
  const buildReport = async () =>
    buildVoiceReconnectProofReport({
      completedSessionCount: options.getCompletedSessionCount
        ? await options.getCompletedSessionCount()
        : undefined,
      maxAttempts: options.maxAttempts,
      requireObservedReconnect: options.requireObservedReconnect,
      requireReplayProtection: options.requireReplayProtection,
      requireResumeAfterReconnect: options.requireResumeAfterReconnect,
      sessions: options.getSessions
        ? await options.getSessions()
        : options.store
          ? await getSessionsFromStore(options.store)
          : undefined,
      snapshots: [
        ...collectedSnapshots,
        ...(options.getSnapshots ? await options.getSnapshots() : []),
      ],
    });
  const respond = async () =>
    new Response(JSON.stringify(await buildReport()), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...options.headers,
      },
    });
  const collectSnapshot = (body: unknown) => {
    if (!isReconnectPayload(body)) {
      return;
    }

    collectedSnapshots.push({
      at: body.at,
      reconnect: body.reconnect,
      turnIds: Array.isArray(body.turnIds)
        ? body.turnIds.filter(
            (turnId): turnId is string => typeof turnId === "string",
          )
        : undefined,
    });
    if (collectedSnapshots.length > maxCollectedSnapshots) {
      collectedSnapshots.splice(
        0,
        collectedSnapshots.length - maxCollectedSnapshots,
      );
    }
  };

  return new Elysia({
    name: options.name ?? "absolutejs-voice-reconnect-proof",
  })
    .get(path, respond)
    .post(path, async ({ body }) => {
      collectSnapshot(body);
      return respond();
    });
};

export const renderVoiceReconnectContractHTML = (
  report: VoiceReconnectContractReport,
) => {
  const issues = report.issues
    .map(
      (issue) =>
        `<li class="${escapeHtml(issue.severity)}"><strong>${escapeHtml(issue.code)}</strong>: ${escapeHtml(issue.message)}</li>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Voice Reconnect Contract</title><style>body{background:#0d1117;color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:980px;padding:32px}.hero,.card{background:#151b23;border:1px solid #30363d;border-radius:18px;margin-bottom:16px;padding:20px}.eyebrow{color:#7dd3fc;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}h1{font-size:clamp(2.25rem,7vw,4.5rem);letter-spacing:-.06em;line-height:.92;margin:.2rem 0 1rem}.summary{display:flex;flex-wrap:wrap;gap:10px}.pill{background:#0d1117;border:1px solid #30363d;border-radius:999px;padding:7px 10px}.pass{color:#86efac}.fail,.error{color:#fca5a5}.warning{color:#fde68a}li{margin:8px 0}</style></head><body><main><section class="hero"><p class="eyebrow">Reconnect Resume Proof</p><h1>Voice reconnect contract</h1><div class="summary"><span class="pill ${report.pass ? "pass" : "fail"}">${report.pass ? "pass" : "fail"}</span><span class="pill">${String(report.snapshotCount)} snapshots</span><span class="pill">${String(report.summary.attempts)} attempts</span><span class="pill">statuses ${escapeHtml(report.statuses.join(", ") || "none")}</span></div></section><section class="card"><h2>Summary</h2><p>reconnected ${String(report.summary.reconnected)} · resumed ${String(report.summary.resumed)} · exhausted ${String(report.summary.exhausted)} · duplicate turns ${String(report.summary.duplicateTurnIds.length)}</p></section><section class="card"><h2>Issues</h2>${issues ? `<ul>${issues}</ul>` : '<p class="pass">No contract issues.</p>'}</section></main></body></html>`;
};

export const createVoiceReconnectContractRoutes = (
  options: VoiceReconnectContractRoutesOptions,
) => {
  const path = options.path ?? "/api/voice/reconnect-contract";
  const htmlPath = options.htmlPath ?? "/voice/reconnect-contract";
  const buildReport = async () =>
    runVoiceReconnectContract({
      requireReconnect: options.requireReconnect,
      requireReplayProtection: options.requireReplayProtection,
      requireResume: options.requireResume,
      snapshots: await options.getSnapshots(),
    });
  const app = new Elysia({
    name: options.name ?? "absolutejs-voice-reconnect-contract",
  }).get(
    path,
    async () =>
      new Response(JSON.stringify(await buildReport()), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...options.headers,
        },
      }),
  );

  if (htmlPath !== false) {
    app.get(htmlPath, async () => {
      const report = await buildReport();
      const html = options.render
        ? await options.render(report)
        : renderVoiceReconnectContractHTML(report);

      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  return app;
};
