import { describe, expect, test } from "bun:test";
import {
  createVoiceWhisperChannel,
  type VoiceWhisperEvent,
} from "../src/whisperChannel";

describe("createVoiceWhisperChannel", () => {
  test("start emits started + ducked events for agent-only route", () => {
    const channel = createVoiceWhisperChannel({
      duckCallerToLevel: 0.3,
      sessionId: "call_1",
    });
    const events: VoiceWhisperEvent[] = [];
    channel.subscribe((e) => events.push(e));
    channel.start("sup_1");
    expect(events.map((e) => e.type)).toEqual(["started", "ducked"]);
  });

  test("agent-and-caller route does not duck", () => {
    const channel = createVoiceWhisperChannel({ sessionId: "call_1" });
    const events: VoiceWhisperEvent[] = [];
    channel.subscribe((e) => events.push(e));
    channel.start("sup_1", "agent-and-caller");
    expect(events.map((e) => e.type)).toEqual(["started"]);
  });

  test("frames from unknown supervisor are dropped", () => {
    const channel = createVoiceWhisperChannel({ sessionId: "call_1" });
    const route = channel.pushFrame({
      pcm: new Uint8Array([1, 2, 3]),
      sampleRate: 16_000,
      sessionId: "call_1",
      supervisorId: "sup_unknown",
      timestamp: 0,
    });
    expect(route).toBe("drop");
  });

  test("frames from active supervisor route per config", () => {
    const channel = createVoiceWhisperChannel({ sessionId: "call_1" });
    channel.start("sup_1");
    const route = channel.pushFrame({
      pcm: new Uint8Array([1, 2, 3]),
      sampleRate: 16_000,
      sessionId: "call_1",
      supervisorId: "sup_1",
      timestamp: 0,
    });
    expect(route).toBe("agent-only");
  });

  test("max concurrent supervisors enforced", () => {
    const channel = createVoiceWhisperChannel({
      maxConcurrentWhispers: 1,
      sessionId: "call_1",
    });
    channel.start("sup_1");
    expect(() => channel.start("sup_2")).toThrow(/max concurrent/);
  });

  test("setRoute updates routing without restart", () => {
    const channel = createVoiceWhisperChannel({ sessionId: "call_1" });
    channel.start("sup_1", "agent-only");
    expect(channel.setRoute("sup_1", "agent-and-caller")).toBe(true);
    expect(channel.routeFor("sup_1")).toBe("agent-and-caller");
  });

  test("stop emits stopped event and removes supervisor", () => {
    const channel = createVoiceWhisperChannel({ sessionId: "call_1" });
    channel.start("sup_1");
    const events: VoiceWhisperEvent[] = [];
    channel.subscribe((e) => events.push(e));
    expect(channel.stop("sup_1")).toBe(true);
    expect(events.map((e) => e.type)).toEqual(["stopped"]);
    expect(channel.activeSupervisors()).toEqual([]);
  });
});
