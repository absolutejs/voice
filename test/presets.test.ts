import { expect, test } from "bun:test";
import { resolveVoiceOpsPreset } from "../src/opsPresets";
import { resolveVoiceRuntimePreset } from "../src/presets";
import { resolveVoiceSTTRoutingStrategy } from "../src/routing";

test("resolveVoiceRuntimePreset returns reliability settings for noisy, long calls", () => {
  const preset = resolveVoiceRuntimePreset("reliability");

  expect(preset.name).toBe("reliability");
  expect(preset.sttLifecycle).toBe("continuous");
  expect(preset.turnDetection.profile).toBe("long-form");
  expect(preset.turnDetection.qualityProfile).toBe("noisy-room");
  expect(preset.connection.maxReconnectAttempts).toBeGreaterThan(12);
  expect(preset.connection.pingInterval).toBeGreaterThan(30_000);
  expect(preset.audioConditioning).toBeDefined();
  expect(preset.audioConditioning?.maxGain).toBeGreaterThan(2.5);
  expect(preset.audioConditioning?.noiseGateAttenuation).toBeGreaterThan(0);
});

test("resolveVoiceRuntimePreset exposes a dedicated noisy-room preset", () => {
  const preset = resolveVoiceRuntimePreset("noisy-room");

  expect(preset.name).toBe("noisy-room");
  expect(preset.sttLifecycle).toBe("continuous");
  expect(preset.turnDetection.profile).toBe("long-form");
  expect(preset.turnDetection.qualityProfile).toBe("noisy-room");
  expect(preset.turnDetection.speechThreshold).toBeGreaterThanOrEqual(0.02);
  expect(preset.turnDetection.transcriptStabilityMs).toBeGreaterThan(1_500);
  expect(preset.audioConditioning?.noiseGateThreshold).toBeGreaterThan(0.005);
  expect(preset.audioConditioning?.noiseGateAttenuation).toBeGreaterThan(0.1);
});

test("resolveVoiceRuntimePreset exposes a dedicated pstn-fast preset", () => {
  const preset = resolveVoiceRuntimePreset("pstn-fast");

  expect(preset.name).toBe("pstn-fast");
  expect(preset.sttLifecycle).toBe("continuous");
  expect(preset.turnDetection.profile).toBe("long-form");
  expect(preset.turnDetection.silenceMs).toBe(620);
  expect(preset.turnDetection.transcriptStabilityMs).toBe(280);
  expect(preset.turnDetection.speechThreshold).toBe(0.012);
  expect(preset.audioConditioning?.noiseGateThreshold).toBe(0.005);
  expect(preset.audioConditioning?.maxGain).toBeGreaterThan(2.5);
});

test("resolveVoiceRuntimePreset exposes a dedicated pstn-balanced preset", () => {
  const preset = resolveVoiceRuntimePreset("pstn-balanced");

  expect(preset.name).toBe("pstn-balanced");
  expect(preset.sttLifecycle).toBe("continuous");
  expect(preset.turnDetection.profile).toBe("long-form");
  expect(preset.turnDetection.silenceMs).toBe(660);
  expect(preset.turnDetection.transcriptStabilityMs).toBe(300);
  expect(preset.turnDetection.speechThreshold).toBe(0.012);
  expect(preset.audioConditioning?.noiseGateThreshold).toBe(0.005);
  expect(preset.audioConditioning?.maxGain).toBeGreaterThan(2.5);
});

test("resolveVoiceSTTRoutingStrategy exposes best and low-cost package paths", () => {
  const best = resolveVoiceSTTRoutingStrategy("best");
  const lowCost = resolveVoiceSTTRoutingStrategy("low-cost");

  expect(best.benchmarkSessionTarget).toBe("deepgram-corrected");
  expect(best.correctionMode).toBe("generic");
  expect(best.preset).toBe("reliability");
  expect(lowCost.benchmarkSessionTarget).toBe("deepgram-flux");
  expect(lowCost.correctionMode).toBe("none");
  expect(lowCost.preset).toBe("default");
});

test("resolveVoiceOpsPreset exposes support-default queue routing and SLA follow-up", () => {
  const preset = resolveVoiceOpsPreset("support-default");

  expect(preset.name).toBe("support-default");
  expect(preset.taskPolicies.voicemail?.assignee).toBe("support-callbacks");
  expect(preset.taskPolicies.voicemail?.queue).toBe("support-callbacks");
  expect(preset.taskPolicies.escalated?.priority).toBe("urgent");
  expect(preset.assignmentRules[0]?.assign).toBe("support-oncall");
  expect(preset.assignmentRules[0]?.queue).toBe("support-oncall");
  expect(preset.sla.followUpTask?.assignee).toBe("support-supervisors");
  expect(preset.sla.followUpTask?.queue).toBe("support-supervisors");
});

test("resolveVoiceOpsPreset merges overrides on top of preset defaults", () => {
  const preset = resolveVoiceOpsPreset("sales-default", {
    sla: {
      followUpTask: {
        queue: "vip-sales-supervisors",
      },
    },
    taskPolicies: {
      voicemail: {
        assignee: "enterprise-callbacks",
        dueInMs: 5 * 60_000,
      },
    },
  });

  expect(preset.taskPolicies.voicemail?.assignee).toBe("enterprise-callbacks");
  expect(preset.taskPolicies.voicemail?.queue).toBe("sales-callbacks");
  expect(preset.taskPolicies.voicemail?.dueInMs).toBe(5 * 60_000);
  expect(preset.assignmentRules[0]?.assign).toBe("sales-priority-desk");
  expect(preset.sla.followUpTask?.assignee).toBe("sales-leads");
  expect(preset.sla.followUpTask?.queue).toBe("vip-sales-supervisors");
});
