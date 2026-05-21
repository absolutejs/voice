import { describe, expect, test } from "bun:test";
import {
  collectVoiceCampaignTemplateVariables,
  resolveVoiceCampaignTemplate,
} from "../src/core/campaignTemplate";

describe("resolveVoiceCampaignTemplate", () => {
  test("interpolates plain variables", () => {
    const result = resolveVoiceCampaignTemplate(
      "Hi {{firstName}}, your appointment is at {{time}}",
      { scope: { firstName: "Alex", time: "3pm" } },
    );
    expect(result.output).toBe("Hi Alex, your appointment is at 3pm");
    expect(result.missingVariables).toEqual([]);
  });

  test("supports dotted paths", () => {
    const result = resolveVoiceCampaignTemplate("Account {{customer.id}}", {
      scope: { customer: { id: "cust_1" } },
    });
    expect(result.output).toBe("Account cust_1");
  });

  test("applies filters chain", () => {
    const result = resolveVoiceCampaignTemplate(
      "{{name | upper}} {{amount | currency:USD}}",
      { scope: { amount: 19.95, name: "alex" } },
    );
    expect(result.output).toBe("ALEX $19.95");
  });

  test("default filter substitutes when missing-in-scope falls back blank", () => {
    const result = resolveVoiceCampaignTemplate(
      "Hi {{firstName | default:friend}}",
      { scope: { firstName: "" } },
    );
    expect(result.output).toBe("Hi friend");
  });

  test("phone filter formats US numbers", () => {
    const result = resolveVoiceCampaignTemplate("Call {{number | phone}}", {
      scope: { number: "+14155550100" },
    });
    expect(result.output).toBe("Call +1 (415) 555-0100");
  });

  test("ssml filter escapes XML characters", () => {
    const result = resolveVoiceCampaignTemplate("{{text | ssml}}", {
      scope: { text: 'AT&T <script>"x"' },
    });
    expect(result.output).toBe("AT&amp;T &lt;script&gt;&quot;x&quot;");
  });

  test("collects missing variables without strict mode", () => {
    const result = resolveVoiceCampaignTemplate("Hi {{firstName}} ({{age}})", {
      fallback: "[?]",
      scope: { firstName: "Alex" },
    });
    expect(result.output).toBe("Hi Alex ([?])");
    expect(result.missingVariables).toEqual(["age"]);
  });

  test("throws in strict mode when variable missing", () => {
    expect(() =>
      resolveVoiceCampaignTemplate("{{x}}", { scope: {}, strict: true }),
    ).toThrow(/Missing template variable/);
  });

  test("custom filters are usable", () => {
    const result = resolveVoiceCampaignTemplate("{{value | shout}}", {
      filters: {
        shout: (v) => `${String(v ?? "").toUpperCase()}!!!`,
      },
      scope: { value: "hi" },
    });
    expect(result.output).toBe("HI!!!");
  });

  test("rejects unknown filters", () => {
    expect(() =>
      resolveVoiceCampaignTemplate("{{x | nonsense}}", {
        scope: { x: "y" },
      }),
    ).toThrow(/Unknown template filter/);
  });
});

describe("collectVoiceCampaignTemplateVariables", () => {
  test("returns unique variable names in order", () => {
    const vars = collectVoiceCampaignTemplateVariables(
      "Hi {{firstName}}, your {{plan}} renews on {{date | date}} ({{plan}})",
    );
    expect(vars).toEqual(["firstName", "plan", "date"]);
  });

  test("returns empty list for static templates", () => {
    expect(collectVoiceCampaignTemplateVariables("no variables")).toEqual([]);
  });
});
