import { describe, expect, test } from "bun:test";
import { normalizeSpokenNumbers } from "../src/core/numberNormalizer";

describe("normalizeSpokenNumbers", () => {
  const cases: Array<[string, string]> = [
    // simple cardinals
    ["we have five qualified deals", "we have 5 qualified deals"],
    ["forty paying customers", "40 paying customers"],
    ["twenty-five reps", "25 reps"],
    ["a hundred and fifty accounts", "150 accounts"],
    // magnitudes keep the word, multiplier in digits
    ["ten million in revenue", "10 million in revenue"],
    ["five thousand users", "5,000 users"],
    ["two point five million ARR", "2.5 million ARR"],
    // ranges read correctly (each side parsed independently)
    [
      "we do ten to a hundred million in ARR",
      "we do 10 to 100 million in ARR",
    ],
    ["three to five accounts", "3 to 5 accounts"],
    // percent + currency units fold to symbols
    ["a forty percent improvement", "a 40% improvement"],
    ["ten million dollars", "$10 million"],
    ["twenty-five thousand dollars", "$25,000"],
    // timeframes
    ["in the first thirty days", "in the first 30 days"],
    ["within three months", "within 3 months"],
    // leave non-numbers + existing digits alone
    ["our CRM and pipeline visibility", "our CRM and pipeline visibility"],
    ["we grew 40% last quarter", "we grew 40% last quarter"],
    ["I am here and listening", "I am here and listening"],
    ["a great partnership", "a great partnership"],
  ];

  for (const [input, expected] of cases) {
    test(input, () => {
      expect(normalizeSpokenNumbers(input)).toBe(expected);
    });
  }

  test("empty / undefined-safe", () => {
    expect(normalizeSpokenNumbers("")).toBe("");
  });
});
