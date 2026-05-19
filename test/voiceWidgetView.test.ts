import { describe, expect, test } from "bun:test";
import {
  createVoiceWidgetViewModel,
  renderVoiceWidgetHTML,
} from "../src/client/voiceWidgetView";

const baseState = {
  assistantAudio: [],
  error: null,
  isConnected: false,
  isRecording: false,
  partial: "",
  status: "idle" as const,
  turns: [],
};

describe("createVoiceWidgetViewModel", () => {
  test("starts in idle with only the start button enabled", () => {
    const model = createVoiceWidgetViewModel({ state: baseState });
    expect(model.agentState).toBe("idle");
    expect(model.controls.canStart).toBe(true);
    expect(model.controls.canMute).toBe(false);
    expect(model.controls.canEnd).toBe(false);
  });

  test("connecting label fires while the controller has not connected yet", () => {
    const model = createVoiceWidgetViewModel({
      state: { ...baseState, status: "active" as const },
    });
    expect(model.statusLabel).toBe("Connecting…");
  });

  test("listening when recording is active", () => {
    const model = createVoiceWidgetViewModel({
      state: { ...baseState, isConnected: true, isRecording: true },
    });
    expect(model.agentState).toBe("listening");
    expect(model.controls.canMute).toBe(true);
    expect(model.controls.canEnd).toBe(true);
  });

  test("surfaces the partial transcript when present", () => {
    const model = createVoiceWidgetViewModel({
      state: { ...baseState, isConnected: true, partial: "hello world" },
    });
    expect(model.partial).toBe("hello world");
  });

  test("merges caller theme overrides on top of defaults", () => {
    const model = createVoiceWidgetViewModel({
      state: baseState,
      theme: { accent: "#ff00aa" },
    });
    expect(model.theme.accent).toBe("#ff00aa");
    expect(model.theme.background).toBe("#0f172a");
  });
});

describe("renderVoiceWidgetHTML", () => {
  test("renders a region with the agent-state data attribute and labels", () => {
    const model = createVoiceWidgetViewModel({
      state: { ...baseState, isConnected: true, isRecording: true },
      title: "Demo",
    });
    const html = renderVoiceWidgetHTML(model);
    expect(html).toContain('data-agent-state="listening"');
    expect(html).toContain("Demo");
    expect(html).toContain("Listening");
  });

  test("escapes user-controlled strings", () => {
    const model = createVoiceWidgetViewModel({
      state: { ...baseState, partial: "<script>alert(1)</script>" },
    });
    const html = renderVoiceWidgetHTML(model);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
