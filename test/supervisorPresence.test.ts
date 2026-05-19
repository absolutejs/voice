import { describe, expect, test } from "bun:test";
import {
  createVoiceSupervisorPresence,
  type VoiceSupervisorPresenceEvent,
} from "../src/supervisorPresence";

describe("createVoiceSupervisorPresence", () => {
  test("join emits join event and adds watcher", () => {
    const presence = createVoiceSupervisorPresence();
    const events: VoiceSupervisorPresenceEvent[] = [];
    presence.subscribe((e) => events.push(e));
    presence.join({ sessionId: "call_1", supervisorId: "sup_1" });
    expect(events[0]?.type).toBe("join");
    expect(presence.list("call_1")).toHaveLength(1);
  });

  test("leave removes watcher and emits leave event", () => {
    const presence = createVoiceSupervisorPresence();
    presence.join({ sessionId: "call_1", supervisorId: "sup_1" });
    const events: VoiceSupervisorPresenceEvent[] = [];
    presence.subscribe((e) => events.push(e));
    expect(presence.leave("call_1", "sup_1")).toBe(true);
    expect(events[0]?.type).toBe("leave");
    expect(presence.list("call_1")).toEqual([]);
  });

  test("role-change emits and updates", () => {
    const presence = createVoiceSupervisorPresence();
    presence.join({
      role: "viewer",
      sessionId: "call_1",
      supervisorId: "sup_1",
    });
    const events: VoiceSupervisorPresenceEvent[] = [];
    presence.subscribe((e) => events.push(e));
    presence.setRole("call_1", "sup_1", "coach");
    expect(events[0]).toMatchObject({ from: "viewer", to: "coach" });
    expect(presence.list("call_1")[0]?.role).toBe("coach");
  });

  test("stale watcher is pruned on list", () => {
    let t = 0;
    const presence = createVoiceSupervisorPresence({
      now: () => t,
      staleAfterMs: 1_000,
    });
    presence.join({ sessionId: "call_1", supervisorId: "sup_1" });
    t = 5_000;
    expect(presence.list("call_1")).toEqual([]);
  });

  test("heartbeat refreshes lastSeenAt", () => {
    let t = 0;
    const presence = createVoiceSupervisorPresence({
      now: () => t,
      staleAfterMs: 1_000,
    });
    presence.join({ sessionId: "call_1", supervisorId: "sup_1" });
    t = 800;
    presence.heartbeat("call_1", "sup_1");
    t = 1_500;
    expect(presence.list("call_1")).toHaveLength(1);
  });

  test("sessionsWatchedBy returns all sessions for a supervisor", () => {
    const presence = createVoiceSupervisorPresence();
    presence.join({ sessionId: "call_a", supervisorId: "sup_1" });
    presence.join({ sessionId: "call_b", supervisorId: "sup_1" });
    presence.join({ sessionId: "call_a", supervisorId: "sup_2" });
    expect(presence.sessionsWatchedBy("sup_1").sort()).toEqual([
      "call_a",
      "call_b",
    ]);
  });
});
