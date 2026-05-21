import { describe, expect, test } from "bun:test";
import { createVoiceCRMRegistry } from "../src/core/crmContract";
import type { VoiceCRMContract } from "../src/core/crmContract";

const stubContract = (vendor: string): VoiceCRMContract => ({
  vendor,
  addNote: async () => ({ noteId: "n_1" }),
  createLead: async (i) => ({ ...i, id: "c_1", vendor }),
  logCall: async () => ({ activityId: "a_1" }),
  lookupByEmail: async () => null,
  lookupByPhone: async () => null,
});

describe("createVoiceCRMRegistry", () => {
  test("get returns the contract for a vendor", () => {
    const registry = createVoiceCRMRegistry({
      contracts: [stubContract("salesforce"), stubContract("hubspot")],
    });
    expect(registry.get("hubspot")?.vendor).toBe("hubspot");
    expect(registry.get("unknown")).toBeNull();
  });

  test("default falls back to first contract when defaultVendor unset", () => {
    const registry = createVoiceCRMRegistry({
      contracts: [stubContract("salesforce"), stubContract("hubspot")],
    });
    expect(registry.default()?.vendor).toBe("salesforce");
  });

  test("defaultVendor option overrides ordering", () => {
    const registry = createVoiceCRMRegistry({
      contracts: [stubContract("salesforce"), stubContract("hubspot")],
      defaultVendor: "hubspot",
    });
    expect(registry.default()?.vendor).toBe("hubspot");
  });

  test("list returns all contracts", () => {
    const registry = createVoiceCRMRegistry({
      contracts: [stubContract("salesforce"), stubContract("hubspot")],
    });
    expect(
      registry
        .list()
        .map((c) => c.vendor)
        .sort(),
    ).toEqual(["hubspot", "salesforce"]);
  });
});
