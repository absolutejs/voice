import { describe, expect, test } from "bun:test";
import {
  createVoiceSupervisorPermissions,
  VOICE_SUPERVISOR_TIER_CAPABILITIES,
} from "../src/core/supervisorPermissions";

describe("createVoiceSupervisorPermissions", () => {
  test("monitor-only tier blocks coach + takeover", () => {
    const perms = createVoiceSupervisorPermissions({
      permissions: [{ supervisorId: "sup_1", tier: "monitor-only" }],
    });
    expect(perms.can("sup_1", "monitor").allowed).toBe(true);
    expect(perms.can("sup_1", "coach").allowed).toBe(false);
    expect(perms.can("sup_1", "takeover").allowed).toBe(false);
  });

  test("full-control tier permits everything in the matrix", () => {
    const perms = createVoiceSupervisorPermissions({
      permissions: [{ supervisorId: "sup_1", tier: "full-control" }],
    });
    for (const cap of VOICE_SUPERVISOR_TIER_CAPABILITIES["full-control"]) {
      expect(perms.can("sup_1", cap).allowed).toBe(true);
    }
  });

  test("unknown supervisor has no-permission unless default tier set", () => {
    const perms = createVoiceSupervisorPermissions();
    expect(perms.can("nobody", "monitor")).toEqual({
      allowed: false,
      reason: "no-permission",
    });
  });

  test("default tier applies to all by default", () => {
    const perms = createVoiceSupervisorPermissions({
      defaultTier: "monitor-only",
    });
    expect(perms.can("anyone", "monitor").allowed).toBe(true);
    expect(perms.can("anyone", "takeover").allowed).toBe(false);
  });

  test("expired permission blocks", () => {
    let t = 0;
    const perms = createVoiceSupervisorPermissions({
      now: () => t,
      permissions: [{ expiresAt: 1_000, supervisorId: "sup_1", tier: "coach" }],
    });
    expect(perms.can("sup_1", "coach").allowed).toBe(true);
    t = 2_000;
    expect(perms.can("sup_1", "coach")).toEqual({
      allowed: false,
      reason: "expired",
    });
  });

  test("denied capability overrides tier", () => {
    const perms = createVoiceSupervisorPermissions({
      permissions: [
        {
          deniedCapabilities: ["whisper"],
          supervisorId: "sup_1",
          tier: "full-control",
        },
      ],
    });
    expect(perms.can("sup_1", "whisper")).toEqual({
      allowed: false,
      reason: "denied",
    });
    expect(perms.can("sup_1", "barge").allowed).toBe(true);
  });

  test("extra capability adds to tier", () => {
    const perms = createVoiceSupervisorPermissions({
      permissions: [
        {
          extraCapabilities: ["whisper"],
          supervisorId: "sup_1",
          tier: "monitor-only",
        },
      ],
    });
    expect(perms.can("sup_1", "whisper").allowed).toBe(true);
  });

  test("enforce throws when not allowed", () => {
    const perms = createVoiceSupervisorPermissions({
      permissions: [{ supervisorId: "sup_1", tier: "monitor-only" }],
    });
    expect(() => perms.enforce("sup_1", "takeover")).toThrow(/cannot takeover/);
  });

  test("grant + revoke mutate permissions", () => {
    const perms = createVoiceSupervisorPermissions();
    perms.grant("sup_1", "coach");
    expect(perms.can("sup_1", "coach").allowed).toBe(true);
    expect(perms.revoke("sup_1")).toBe(true);
    expect(perms.can("sup_1", "coach").allowed).toBe(false);
  });
});
