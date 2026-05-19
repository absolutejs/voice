import { useEffect, useMemo, useState } from "react";
import {
  createLiveCallViewer,
  type LiveCallViewer,
  type LiveCallViewState,
} from "../client/liveCallViewer";

export type VoiceLiveCallViewerProps = {
  className?: string;
  /** Pre-built viewer instance; if omitted, one is created with options.sessionId. */
  sessionId?: string;
  title?: string;
  viewer?: LiveCallViewer;
};

const CATEGORY_COLOR: Record<string, string> = {
  agent_audio: "#3b82f6",
  agent_text: "#3b82f6",
  lifecycle: "#94a3b8",
  tool: "#f59e0b",
  transcript: "#10b981",
};

const formatRelative = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
};

export const VoiceLiveCallViewer = ({
  className,
  sessionId,
  title,
  viewer: viewerProp,
}: VoiceLiveCallViewerProps) => {
  const viewer = useMemo(
    () =>
      viewerProp ?? createLiveCallViewer({ sessionId: sessionId ?? "live" }),
    [viewerProp, sessionId],
  );
  const [state, setState] = useState<LiveCallViewState>(() => viewer.getState());

  useEffect(() => {
    const unsubscribe = viewer.subscribe(() => {
      setState(viewer.getState());
    });
    return () => {
      unsubscribe();
    };
  }, [viewer]);

  return (
    <section
      aria-label="voice-live-call-viewer"
      className={className ?? "absolute-voice-live-call-viewer"}
      data-agent-state={state.agentState}
      style={{
        background: "#0f172a",
        borderRadius: 16,
        color: "#f8fafc",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        padding: 20,
      }}
    >
      <header
        style={{
          alignItems: "center",
          display: "flex",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <strong style={{ fontSize: 16 }}>{title ?? "Live call"}</strong>
        <span
          style={{
            background: "rgba(59,130,246,0.18)",
            borderRadius: 999,
            fontSize: 11,
            padding: "3px 10px",
            textTransform: "uppercase",
          }}
        >
          {state.agentState}
        </span>
        <span style={{ fontSize: 13, marginLeft: "auto", opacity: 0.7 }}>
          {state.sessionId} · {formatRelative(state.callDurationMs)}
        </span>
      </header>
      {state.partialTranscript ? (
        <p
          style={{
            background: "rgba(16,185,129,0.12)",
            borderRadius: 12,
            fontSize: 13,
            margin: "0 0 12px",
            opacity: 0.95,
            padding: "10px 12px",
          }}
        >
          “{state.partialTranscript}”
        </p>
      ) : null}
      <ol
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          listStyle: "none",
          margin: 0,
          maxHeight: 320,
          overflowY: "auto",
          padding: 0,
        }}
      >
        {state.events.map((event, index) => (
          <li
            key={`${event.at}-${index}`}
            style={{
              alignItems: "center",
              borderLeft: `3px solid ${
                CATEGORY_COLOR[event.kind] ?? "#94a3b8"
              }`,
              display: "flex",
              fontSize: 13,
              gap: 12,
              paddingLeft: 12,
            }}
          >
            <span
              style={{
                color: "#cbd5e1",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
                width: 60,
              }}
            >
              {formatRelative(
                event.at -
                  (state.events[0]?.at ?? event.at),
              )}
            </span>
            <strong style={{ fontSize: 13 }}>{event.title}</strong>
            {event.detail ? (
              <span style={{ opacity: 0.85 }}>{event.detail}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
};
