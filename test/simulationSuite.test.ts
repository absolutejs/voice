import { expect, test } from "bun:test";
import {
  createVoiceMemoryTraceEventStore,
  createVoiceSimulationSuiteRoutes,
  evaluateVoiceSimulationSuiteEvidence,
  runVoiceSimulationSuite,
  renderVoiceSimulationSuiteHTML,
} from "../src";

const createFailingSimulationEvents = () => [
  {
    at: Date.parse("2026-04-25T10:00:00.000Z"),
    id: "simulation-session-start",
    payload: {},
    scenarioId: "simulation-regression",
    sessionId: "simulation-session",
    type: "session.started" as const,
  },
  {
    at: Date.parse("2026-04-25T10:00:01.000Z"),
    id: "simulation-session-turn-1",
    payload: { text: "repeat" },
    scenarioId: "simulation-regression",
    sessionId: "simulation-session",
    turnId: "turn-1",
    type: "turn.committed" as const,
  },
  {
    at: Date.parse("2026-04-25T10:00:02.000Z"),
    id: "simulation-session-turn-2",
    payload: { text: "repeat" },
    scenarioId: "simulation-regression",
    sessionId: "simulation-session",
    turnId: "turn-2",
    type: "turn.committed" as const,
  },
  {
    at: Date.parse("2026-04-25T10:00:03.000Z"),
    id: "simulation-session-error",
    payload: {
      elapsedMs: 5000,
      provider: "openai",
      providerStatus: "error",
    },
    scenarioId: "simulation-regression",
    sessionId: "simulation-session",
    type: "session.error" as const,
  },
];

test("renderVoiceSimulationSuiteHTML renders primitive setup copy", () => {
  const html = renderVoiceSimulationSuiteHTML({
    actions: [],
    checkedAt: 100,
    failed: 0,
    passed: 1,
    status: "pass",
    summary: {
      sessions: {
        failed: 0,
        passed: 1,
        status: "pass",
        total: 1,
      },
    },
    total: 1,
  });

  expect(html).toContain("Voice Simulation Suite");
  expect(html).toContain("Copy into your app");
  expect(html).toContain("createVoiceSimulationSuiteRoutes");
  expect(html).toContain("createVoiceProductionReadinessRoutes");
  expect(html).toContain("Pre-production simulation suite");
});

test("createVoiceSimulationSuiteRoutes exposes json and html reports", async () => {
  const app = createVoiceSimulationSuiteRoutes({
    include: {
      sessions: true,
    },
  });

  const json = await app.handle(
    new Request("http://localhost/api/voice/simulations"),
  );
  const html = await app.handle(
    new Request("http://localhost/voice/simulations"),
  );

  expect(json.status).toBe(200);
  await expect(json.json()).resolves.toMatchObject({
    status: "pass",
    summary: {
      sessions: {
        status: "pass",
      },
    },
  });
  expect(html.status).toBe(200);
  expect(await html.text()).toContain("createVoiceSimulationSuiteRoutes");
});

test("runVoiceSimulationSuite links failing session actions to operations records", async () => {
  const store = createVoiceMemoryTraceEventStore();
  for (const event of createFailingSimulationEvents()) {
    await store.append(event);
  }

  const report = await runVoiceSimulationSuite({
    actionLinks: {
      scenarios: "/evals/scenarios",
      sessions: "/quality",
    },
    fixtures: [
      {
        events: createFailingSimulationEvents(),
        id: "fixture-regression",
        label: "Regression fixture",
      },
    ],
    include: {
      fixtures: true,
      scenarios: true,
      sessions: true,
    },
    operationsRecordHref: "/voice-operations/:sessionId",
    scenarios: [
      {
        id: "simulation-regression-contract",
        requiredDisposition: "completed",
        scenarioId: "simulation-regression",
      },
    ],
    store,
  });

  expect(report.status).toBe("fail");
  expect(report.sessions?.sessions[0]?.operationsRecordHref).toBe(
    "/voice-operations/simulation-session",
  );
  expect(report.actions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        href: "/voice-operations/simulation-session",
        section: "sessions",
      }),
      expect.objectContaining({
        href: "/voice-operations/simulation-session",
        section: "scenarios",
      }),
      expect.objectContaining({
        href: "/voice-operations/simulation-session",
        section: "fixtures",
      }),
    ]),
  );
  expect(renderVoiceSimulationSuiteHTML(report)).toContain(
    "/voice-operations/simulation-session",
  );
});

test("evaluateVoiceSimulationSuiteEvidence accepts complete simulation coverage", () => {
  const report = evaluateVoiceSimulationSuiteEvidence(
    {
      actions: [],
      checkedAt: 1,
      failed: 0,
      passed: 5,
      status: "pass",
      summary: {
        fixtures: { failed: 0, passed: 1, status: "pass", total: 1 },
        outcomes: { failed: 0, passed: 5, status: "pass", total: 5 },
        scenarios: { failed: 0, passed: 3, status: "pass", total: 3 },
        sessions: { failed: 0, passed: 2, status: "pass", total: 2 },
        tools: { failed: 0, passed: 3, status: "pass", total: 3 },
      },
      total: 5,
    },
    {
      maxActions: 0,
      maxFailed: 0,
      minPassed: 5,
      minSections: 5,
      requiredSections: [
        "fixtures",
        "outcomes",
        "scenarios",
        "sessions",
        "tools",
      ],
      sectionMinimums: {
        fixtures: 1,
        outcomes: 5,
        scenarios: 3,
        sessions: 1,
        tools: 3,
      },
    },
  );

  expect(report.ok).toBe(true);
  expect(report.sections).toEqual([
    "fixtures",
    "outcomes",
    "scenarios",
    "sessions",
    "tools",
  ]);
});

test("evaluateVoiceSimulationSuiteEvidence reports missing simulation coverage", () => {
  const report = evaluateVoiceSimulationSuiteEvidence(
    {
      actions: [
        {
          description: "Fix tools.",
          label: "Fix tools",
          section: "tools",
          severity: "error",
        },
      ],
      checkedAt: 1,
      failed: 1,
      passed: 1,
      status: "fail",
      summary: {
        tools: { failed: 1, passed: 0, status: "fail", total: 1 },
      },
      total: 1,
    },
    {
      maxActions: 0,
      maxFailed: 0,
      minPassed: 5,
      minSections: 5,
      requiredSections: [
        "fixtures",
        "outcomes",
        "scenarios",
        "sessions",
        "tools",
      ],
      sectionMinimums: {
        tools: 3,
      },
    },
  );

  expect(report.ok).toBe(false);
  expect(report.issues).toEqual(
    expect.arrayContaining([
      "Expected at most 0 failing simulation section(s), found 1.",
      "Expected at most 0 simulation action(s), found 1.",
      "Expected at least 5 simulation section(s), found 1.",
      "Expected at least 5 passing simulation section(s), found 1.",
      "Missing simulation section: fixtures.",
      "Missing simulation section: outcomes.",
      "Missing simulation section: scenarios.",
      "Missing simulation section: sessions.",
      "Expected simulation section tools to include at least 3 item(s), found 1.",
    ]),
  );
});
