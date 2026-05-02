import { expect, test } from "bun:test";
import {
  buildVoiceOperationalStatusReport,
  createVoiceOperationalStatusRoutes,
  renderVoiceOperationalStatusHTML,
} from "../src";
import type { VoiceProductionReadinessReport } from "../src";

const readinessReport = {
  checkedAt: 1_000,
  checks: [
    {
      label: "Session health",
      status: "pass",
    },
  ],
  links: {},
  status: "pass",
  summary: {},
} as VoiceProductionReadinessReport;

test("buildVoiceOperationalStatusReport combines proof freshness, delivery, and readiness", async () => {
  const report = await buildVoiceOperationalStatusReport({
    deliveryRuntime: {
      checkedAt: 1_000,
      isRunning: true,
      summary: {
        audit: {
          deadLettered: 0,
          delivered: 2,
          failed: 0,
          pending: 0,
          total: 2,
        },
        trace: {
          deadLettered: 0,
          delivered: 3,
          failed: 0,
          pending: 0,
          total: 3,
        },
      },
    },
    productionReadiness: readinessReport,
    proofPack: {
      ageMs: 1_000,
      generatedAt: new Date().toISOString(),
      maxAgeMs: 60_000,
      refreshing: false,
      state: "fresh",
    },
  });

  expect(report).toMatchObject({
    status: "pass",
    summary: {
      fail: 0,
      pass: 3,
      total: 3,
      warn: 0,
    },
  });
});

test("buildVoiceOperationalStatusReport fails missing proof and failed delivery", async () => {
  const report = await buildVoiceOperationalStatusReport({
    deliveryRuntime: {
      checkedAt: 1_000,
      isRunning: true,
      summary: {
        trace: {
          deadLettered: 1,
          delivered: 0,
          failed: 0,
          pending: 0,
          total: 1,
        },
      },
    },
    proofPack: {
      maxAgeMs: 60_000,
      refreshing: false,
      state: "missing",
    },
  });

  expect(report.status).toBe("fail");
  expect(report.summary.fail).toBe(2);
});

test("createVoiceOperationalStatusRoutes exposes json and html status surfaces", async () => {
  const routes = createVoiceOperationalStatusRoutes({
    deliveryRuntime: {
      checkedAt: 1_000,
      isRunning: false,
      summary: {},
    },
    htmlPath: "/voice/status",
    path: "/api/status",
  });
  const json = await routes.handle(new Request("http://localhost/api/status"));
  const html = await routes.handle(
    new Request("http://localhost/voice/status"),
  );

  expect(json.status).toBe(200);
  await expect(json.json()).resolves.toMatchObject({
    status: "warn",
  });
  expect(html.status).toBe(200);
  expect(await html.text()).toContain("Operational status");
});

test("renderVoiceOperationalStatusHTML renders checks", async () => {
  const report = await buildVoiceOperationalStatusReport({
    productionReadiness: readinessReport,
  });

  expect(renderVoiceOperationalStatusHTML(report)).toContain(
    "Production readiness",
  );
});
