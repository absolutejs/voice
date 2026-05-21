export type BrowserVoiceSupportProbe = {
  hasAudioContext: boolean;
  hasAudioWorklet: boolean;
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  hasOpusEncoding: boolean;
  hasRTCPeerConnection: boolean;
  hasWebSocket: boolean;
  isInsecureContext: boolean;
  isIos: boolean;
  isSafari: boolean;
  requiresUserGestureToResumeAudio: boolean;
  userAgent: string;
};

export type BrowserVoiceSupportReport = {
  blockers: string[];
  capabilities: BrowserVoiceSupportProbe;
  ok: boolean;
  warnings: string[];
};

const safeGet = <T>(fn: () => T): T | undefined => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

const detectMediaRecorderOpus = (
  ctor:
    | (typeof MediaRecorder & {
        isTypeSupported?: (type: string) => boolean;
      })
    | undefined,
): boolean => {
  if (!ctor || typeof ctor.isTypeSupported !== "function") return false;
  try {
    return ctor.isTypeSupported("audio/webm;codecs=opus");
  } catch {
    return false;
  }
};

export const checkBrowserVoiceSupport = (
  globalScope: typeof globalThis = globalThis,
): BrowserVoiceSupportReport => {
  const capabilities = probeBrowserVoiceSupport(globalScope);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!capabilities.hasWebSocket) {
    blockers.push(
      "WebSocket is not available — voice runtime cannot stream audio.",
    );
  }
  if (!capabilities.hasGetUserMedia) {
    blockers.push(
      "navigator.mediaDevices.getUserMedia is not available — cannot capture microphone.",
    );
  }
  if (capabilities.isInsecureContext) {
    blockers.push(
      "Page is served from an insecure context; getUserMedia requires HTTPS or localhost.",
    );
  }
  if (!capabilities.hasAudioContext) {
    blockers.push(
      "AudioContext is not available — cannot decode or play TTS audio.",
    );
  }
  if (!capabilities.hasAudioWorklet) {
    warnings.push(
      "AudioWorklet is unavailable — noise suppression and custom audio processors won't run.",
    );
  }
  if (!capabilities.hasRTCPeerConnection) {
    warnings.push(
      "RTCPeerConnection is unavailable — WebRTC transport paths are disabled.",
    );
  }
  if (!capabilities.hasOpusEncoding) {
    warnings.push(
      "MediaRecorder does not advertise Opus support — fall back to PCM streaming.",
    );
  }
  if (capabilities.requiresUserGestureToResumeAudio) {
    warnings.push(
      "Safari / iOS requires a user gesture before audioContext.resume() succeeds.",
    );
  }

  return {
    blockers,
    capabilities,
    ok: blockers.length === 0,
    warnings,
  };
};
export const probeBrowserVoiceSupport = (
  globalScope: typeof globalThis = globalThis,
): BrowserVoiceSupportProbe => {
  const win = globalScope as typeof globalThis & {
    AudioContext?: typeof AudioContext;
    MediaRecorder?: typeof MediaRecorder;
    RTCPeerConnection?: typeof RTCPeerConnection;
    isSecureContext?: boolean;
    navigator?: Navigator;
    webkitAudioContext?: typeof AudioContext;
  };
  const userAgent = win.navigator?.userAgent ?? "";
  const audioContextCtor = win.AudioContext ?? win.webkitAudioContext;
  const hasAudioContext = typeof audioContextCtor === "function";
  const hasAudioWorklet = hasAudioContext
    ? safeGet(() => "audioWorklet" in audioContextCtor.prototype) === true
    : false;
  const hasGetUserMedia = Boolean(
    win.navigator?.mediaDevices &&
    typeof win.navigator.mediaDevices.getUserMedia === "function",
  );
  const hasMediaRecorder = typeof win.MediaRecorder === "function";
  const hasRTCPeerConnection = typeof win.RTCPeerConnection === "function";
  const hasWebSocket =
    typeof (win as { WebSocket?: unknown }).WebSocket === "function";
  const isInsecureContext =
    typeof win.isSecureContext === "boolean" ? !win.isSecureContext : false;
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const isIos = /iPad|iPhone|iPod/.test(userAgent);
  const requiresUserGestureToResumeAudio = isSafari || isIos;
  const hasOpusEncoding = detectMediaRecorderOpus(win.MediaRecorder);

  return {
    hasAudioContext,
    hasAudioWorklet,
    hasGetUserMedia,
    hasMediaRecorder,
    hasOpusEncoding,
    hasRTCPeerConnection,
    hasWebSocket,
    isInsecureContext,
    isIos,
    isSafari,
    requiresUserGestureToResumeAudio,
    userAgent,
  };
};
