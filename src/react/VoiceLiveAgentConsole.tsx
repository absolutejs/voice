import { useEffect, useMemo, useState } from "react";
import {
  createLiveAgentConsole,
  type LiveAgentConsole,
  type LiveAgentConsoleState,
} from "../client/liveAgentConsole";

export type VoiceLiveAgentConsoleProps = {
  className?: string;
  console?: LiveAgentConsole;
  onTakeover?: (reason?: string) => void;
  sessionId?: string;
  takeoverButtonLabel?: string;
  takeoverReason?: string;
  title?: string;
};

export const VoiceLiveAgentConsole = ({
  className,
  console: consoleProp,
  onTakeover,
  sessionId,
  takeoverButtonLabel = "Take over",
  takeoverReason,
  title = "Live agent console",
}: VoiceLiveAgentConsoleProps) => {
  const console = useMemo(
    () =>
      consoleProp ?? createLiveAgentConsole({ sessionId: sessionId ?? "live" }),
    [consoleProp, sessionId],
  );
  const [state, setState] = useState<LiveAgentConsoleState>(() =>
    console.getState(),
  );

  useEffect(() => {
    const unsubscribe = console.subscribe(() => {
      setState(console.getState());
    });
    return () => {
      unsubscribe();
    };
  }, [console]);

  const handleTakeover = () => {
    console.takeover(takeoverReason);
    onTakeover?.(takeoverReason);
  };

  const handleRelease = () => {
    console.releaseTakeover();
  };

  return (
    <section
      aria-label="voice-live-agent-console"
      className={className ?? "absolute-voice-live-agent-console"}
      data-takeover={state.hasTakeover ? "true" : "false"}
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
        <strong style={{ fontSize: 16 }}>{title}</strong>
        <span
          style={{
            background: state.hasTakeover
              ? "rgba(239,68,68,0.18)"
              : "rgba(59,130,246,0.18)",
            borderRadius: 999,
            fontSize: 11,
            padding: "3px 10px",
            textTransform: "uppercase",
          }}
        >
          {state.hasTakeover ? "Human" : "Agent"}
        </span>
        <span style={{ fontSize: 13, marginLeft: "auto", opacity: 0.7 }}>
          {state.view.sessionId}
        </span>
      </header>
      {state.caller ? (
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            borderRadius: 12,
            fontSize: 13,
            margin: "0 0 12px",
            padding: 12,
          }}
        >
          <div
            style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase" }}
          >
            Caller
          </div>
          <div style={{ marginTop: 4 }}>{state.caller.summary}</div>
          {Object.keys(state.caller.facts ?? {}).length > 0 ? (
            <dl
              style={{
                display: "grid",
                fontSize: 12,
                gap: 4,
                gridTemplateColumns: "auto 1fr",
                margin: "8px 0 0",
              }}
            >
              {Object.entries(state.caller.facts).map(([key, value]) => (
                <div key={key} style={{ display: "contents" }}>
                  <dt style={{ opacity: 0.7 }}>{key}</dt>
                  <dd style={{ margin: 0 }}>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {state.caller.openActions.length > 0 ? (
            <ul
              style={{
                fontSize: 12,
                margin: "8px 0 0",
                paddingLeft: 16,
              }}
            >
              {state.caller.openActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        {state.hasTakeover ? (
          <button
            onClick={handleRelease}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 12,
              color: "#f8fafc",
              cursor: "pointer",
              fontSize: 13,
              padding: "8px 14px",
            }}
            type="button"
          >
            Release back to agent
          </button>
        ) : (
          <button
            onClick={handleTakeover}
            style={{
              background: "#ef4444",
              border: "none",
              borderRadius: 12,
              color: "#f8fafc",
              cursor: "pointer",
              fontSize: 13,
              padding: "8px 14px",
            }}
            type="button"
          >
            {takeoverButtonLabel}
          </button>
        )}
      </div>
      <ol
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          listStyle: "none",
          margin: 0,
          maxHeight: 260,
          overflowY: "auto",
          padding: 0,
        }}
      >
        {state.recentTimeline.map((event, index) => (
          <li
            key={`${event.at}-${index}`}
            style={{
              alignItems: "center",
              display: "flex",
              fontSize: 13,
              gap: 12,
              paddingLeft: 8,
            }}
          >
            <strong>{event.title}</strong>
            {event.detail ? (
              <span style={{ opacity: 0.85 }}>{event.detail}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
};
