import { describe, expect, test } from "bun:test";
import {
  checkBrowserVoiceSupport,
  probeBrowserVoiceSupport,
} from "../src/client/browserVoiceSupport";

const buildFakeBrowser = (
  overrides: Partial<{
    audioContext: boolean;
    audioWorklet: boolean;
    getUserMedia: boolean;
    isSecureContext: boolean;
    mediaRecorder: boolean;
    opus: boolean;
    rtcPeerConnection: boolean;
    userAgent: string;
    webSocket: boolean;
  }>,
) => {
  const want = {
    audioContext: true,
    audioWorklet: true,
    getUserMedia: true,
    isSecureContext: true,
    mediaRecorder: true,
    opus: true,
    rtcPeerConnection: true,
    userAgent: "Mozilla/5.0 Chrome/130.0",
    webSocket: true,
    ...overrides,
  };
  class FakeAudioContext {}
  if (want.audioWorklet) {
    (FakeAudioContext.prototype as never as { audioWorklet: unknown }).audioWorklet = {};
  }
  class FakeMediaRecorder {
    static isTypeSupported(_t: string) {
      return want.opus;
    }
  }
  class FakeRTC {}
  class FakeWS {}
  return {
    AudioContext: want.audioContext ? FakeAudioContext : undefined,
    MediaRecorder: want.mediaRecorder ? FakeMediaRecorder : undefined,
    RTCPeerConnection: want.rtcPeerConnection ? FakeRTC : undefined,
    WebSocket: want.webSocket ? FakeWS : undefined,
    isSecureContext: want.isSecureContext,
    navigator: {
      mediaDevices: want.getUserMedia
        ? { getUserMedia: () => undefined }
        : undefined,
      userAgent: want.userAgent,
    },
  } as unknown as typeof globalThis;
};

describe("probeBrowserVoiceSupport", () => {
  test("flags a healthy modern browser as fully supported", () => {
    const probe = probeBrowserVoiceSupport(buildFakeBrowser({}));
    expect(probe.hasAudioContext).toBe(true);
    expect(probe.hasAudioWorklet).toBe(true);
    expect(probe.hasGetUserMedia).toBe(true);
    expect(probe.hasMediaRecorder).toBe(true);
    expect(probe.hasOpusEncoding).toBe(true);
    expect(probe.hasRTCPeerConnection).toBe(true);
    expect(probe.hasWebSocket).toBe(true);
    expect(probe.isInsecureContext).toBe(false);
  });

  test("flags Safari + iOS as requiring user gesture for audio resume", () => {
    const probe = probeBrowserVoiceSupport(
      buildFakeBrowser({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      }),
    );
    expect(probe.isSafari).toBe(true);
    expect(probe.isIos).toBe(true);
    expect(probe.requiresUserGestureToResumeAudio).toBe(true);
  });
});

describe("checkBrowserVoiceSupport", () => {
  test("ok: true with no warnings on a healthy browser", () => {
    const report = checkBrowserVoiceSupport(buildFakeBrowser({}));
    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
  });

  test("ok: false when getUserMedia is missing", () => {
    const report = checkBrowserVoiceSupport(
      buildFakeBrowser({ getUserMedia: false }),
    );
    expect(report.ok).toBe(false);
    expect(report.blockers.join(" ")).toContain("getUserMedia");
  });

  test("blockers include insecure-context warning", () => {
    const report = checkBrowserVoiceSupport(
      buildFakeBrowser({ isSecureContext: false }),
    );
    expect(report.blockers.join(" ")).toContain("insecure");
  });

  test("missing AudioWorklet drops into warnings, not blockers", () => {
    const report = checkBrowserVoiceSupport(
      buildFakeBrowser({ audioWorklet: false }),
    );
    expect(report.ok).toBe(true);
    expect(report.warnings.join(" ")).toContain("AudioWorklet");
  });

  test("missing Opus encoding warns about fallback", () => {
    const report = checkBrowserVoiceSupport(buildFakeBrowser({ opus: false }));
    expect(report.warnings.join(" ")).toContain("Opus");
  });
});
