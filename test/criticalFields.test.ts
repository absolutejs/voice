import { describe, expect, test } from "bun:test";
import { scoreVoiceCriticalFields } from "../src/testing";

describe("scoreVoiceCriticalFields", () => {
  test("scores aliases, spoken numbers, phone numbers, and required fields", () => {
    const result = scoreVoiceCriticalFields(
      "This is ACME Holdings. Revenue was twenty five dollars, growth was 12 percent, and call 212-555-0199.",
      [
        { id: "company", kind: "organization", value: "Acme, Inc.", aliases: ["ACME Holdings"] },
        { id: "revenue", kind: "currency", value: "$25", required: true },
        { id: "growth", kind: "percentage", value: "12%", required: true },
        { id: "phone", kind: "phone", value: "(212) 555-0199", required: true },
      ],
    );

    expect(result.accuracy).toBe(1);
    expect(result.passesRequired).toBe(true);
    expect(result.missingFieldIds).toEqual([]);
  });

  test("fails when a required value is absent", () => {
    const result = scoreVoiceCriticalFields("The company grew.", [
      { id: "percentage", kind: "percentage", value: "15%" },
    ]);
    expect(result.passesRequired).toBe(false);
    expect(result.missingFieldIds).toEqual(["percentage"]);
  });
});
