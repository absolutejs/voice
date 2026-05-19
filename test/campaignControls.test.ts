import { describe, expect, test } from "bun:test";
import {
  createInMemoryDNCList,
  isPhoneOnDNC,
  isWithinCampaignWindow,
  normalizePhoneNumber,
  shouldRetryCampaignAttempt,
  summarizeVoiceCampaignDispositions,
} from "../src/campaignControls";
import type { VoiceCampaignRecord } from "../src/campaign";

describe("normalizePhoneNumber + createInMemoryDNCList", () => {
  test("normalizes spaces/dashes/parens before matching", async () => {
    const list = createInMemoryDNCList(["+14155551212"]);
    expect(await isPhoneOnDNC("+1 (415) 555-1212", list)).toBe(true);
    expect(await isPhoneOnDNC("+14155550000", list)).toBe(false);
  });

  test("normalizePhoneNumber strips whitespace + parens + dashes", () => {
    expect(normalizePhoneNumber("+1 (415) 555-1212")).toBe("+14155551212");
  });
});

describe("isWithinCampaignWindow", () => {
  test("returns true inside the configured hour range", () => {
    const inside = isWithinCampaignWindow({
      now: new Date("2026-05-19T15:00:00Z"),
      window: { endHour: 17, startHour: 9 },
    });
    expect(inside).toBe(true);
  });

  test("returns false outside the configured hour range", () => {
    const outside = isWithinCampaignWindow({
      now: new Date("2026-05-19T03:00:00Z"),
      window: { endHour: 17, startHour: 9 },
    });
    expect(outside).toBe(false);
  });

  test("filters by daysOfWeek", () => {
    // 2026-05-19 is a Tuesday (UTC day 2)
    const tuesday = isWithinCampaignWindow({
      now: new Date("2026-05-19T15:00:00Z"),
      window: { daysOfWeek: [1, 2, 3], endHour: 17, startHour: 9 },
    });
    const sunday = isWithinCampaignWindow({
      now: new Date("2026-05-17T15:00:00Z"),
      window: { daysOfWeek: [1, 2, 3], endHour: 17, startHour: 9 },
    });
    expect(tuesday).toBe(true);
    expect(sunday).toBe(false);
  });

  test("wraps midnight when startHour > endHour", () => {
    const lateNight = isWithinCampaignWindow({
      now: new Date("2026-05-19T02:00:00Z"),
      window: { endHour: 6, startHour: 22 },
    });
    const noon = isWithinCampaignWindow({
      now: new Date("2026-05-19T12:00:00Z"),
      window: { endHour: 6, startHour: 22 },
    });
    expect(lateNight).toBe(true);
    expect(noon).toBe(false);
  });
});

describe("shouldRetryCampaignAttempt", () => {
  test("denies retry when attempts >= campaign.maxAttempts", () => {
    expect(
      shouldRetryCampaignAttempt({
        attempts: 3,
        campaign: { maxAttempts: 3 },
      }),
    ).toEqual({ retry: false });
  });

  test("allows retry within budget", () => {
    expect(
      shouldRetryCampaignAttempt({
        attempts: 1,
        campaign: { maxAttempts: 3 },
      }).retry,
    ).toBe(true);
  });

  test("disposition rule with retry:false short-circuits", () => {
    expect(
      shouldRetryCampaignAttempt({
        attempts: 0,
        campaign: { maxAttempts: 5 },
        disposition: "failed",
        policy: { failed: { retry: false } },
      }),
    ).toEqual({ retry: false });
  });

  test("disposition-specific maxAttempts overrides", () => {
    expect(
      shouldRetryCampaignAttempt({
        attempts: 2,
        campaign: { maxAttempts: 5 },
        disposition: "voicemail",
        policy: { voicemail: { maxAttempts: 2 } },
      }).retry,
    ).toBe(false);
  });

  test("passes backoffMs from the disposition rule when present", () => {
    expect(
      shouldRetryCampaignAttempt({
        attempts: 1,
        campaign: { maxAttempts: 5 },
        disposition: "busy",
        policy: { busy: { backoffMs: 30_000 } },
      }),
    ).toEqual({ backoffMs: 30_000, retry: true });
  });
});

describe("summarizeVoiceCampaignDispositions", () => {
  test("aggregates by status and disposition", () => {
    const record: VoiceCampaignRecord = {
      attempts: [
        {
          campaignId: "c1",
          createdAt: 0,
          id: "a1",
          metadata: { disposition: "answered" },
          recipientId: "r1",
          status: "succeeded",
          updatedAt: 0,
        },
        {
          campaignId: "c1",
          createdAt: 0,
          id: "a2",
          metadata: { disposition: "voicemail" },
          recipientId: "r2",
          status: "succeeded",
          updatedAt: 0,
        },
        {
          campaignId: "c1",
          createdAt: 0,
          id: "a3",
          recipientId: "r3",
          status: "failed",
          updatedAt: 0,
        },
      ],
      campaign: {
        createdAt: 0,
        id: "c1",
        maxAttempts: 3,
        maxConcurrentAttempts: 1,
        name: "Test",
        status: "running",
        updatedAt: 0,
      },
      recipients: [
        {
          attempts: 1,
          createdAt: 0,
          id: "r1",
          phone: "+1",
          status: "completed",
          updatedAt: 0,
        },
        {
          attempts: 1,
          createdAt: 0,
          id: "r2",
          phone: "+1",
          status: "completed",
          updatedAt: 0,
        },
        {
          attempts: 1,
          createdAt: 0,
          id: "r3",
          phone: "+1",
          status: "failed",
          updatedAt: 0,
        },
      ],
    };
    const summary = summarizeVoiceCampaignDispositions(record);
    expect(summary.attempts).toBe(3);
    expect(summary.byStatus.succeeded).toBe(2);
    expect(summary.byStatus.failed).toBe(1);
    expect(summary.byDisposition.answered).toBe(1);
    expect(summary.byDisposition.voicemail).toBe(1);
    expect(summary.byDisposition.failed).toBe(1);
    expect(summary.recipientsByStatus.completed).toBe(2);
    expect(summary.recipientsByStatus.failed).toBe(1);
  });
});
