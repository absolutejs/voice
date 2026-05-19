import {
  buildReplayTimelineReport,
  type ReplayTimelineEvent,
  type ReplayTimelineInput,
} from "../client/replayTimeline";

export type VoiceReplayTimelineProps = ReplayTimelineInput & {
  className?: string;
  title?: string;
};

const CATEGORY_COLOR: Record<ReplayTimelineEvent["category"], string> = {
  agent: "#3b82f6",
  lifecycle: "#94a3b8",
  tool: "#f59e0b",
  user: "#10b981",
};

const formatRelative = (ms: number) => {
  const seconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
};

export const VoiceReplayTimeline = ({
  artifact,
  className,
  title,
}: VoiceReplayTimelineProps) => {
  const report = buildReplayTimelineReport({ artifact });
  return (
    <section
      aria-label="voice-replay-timeline"
      className={className ?? "absolute-voice-replay-timeline"}
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
          alignItems: "baseline",
          display: "flex",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <strong style={{ fontSize: 16 }}>
          {title ?? report.metadata.title ?? "Replay"}
        </strong>
        <span style={{ fontSize: 13, opacity: 0.7 }}>
          {report.events.length} events · {report.summary.userTurns} user ·{" "}
          {report.summary.agentTurns} agent · {report.summary.toolCalls} tool
        </span>
      </header>
      {report.events.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.7 }}>No timeline events.</p>
      ) : (
        <ol
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {report.events.map((event, index) => (
            <li
              key={`${event.at}-${index}`}
              style={{
                alignItems: "center",
                borderLeft: `3px solid ${CATEGORY_COLOR[event.category]}`,
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
                {formatRelative(event.at - report.startedAt)}
              </span>
              <strong style={{ fontSize: 13 }}>{event.label}</strong>
              {event.detail ? (
                <span style={{ opacity: 0.85 }}>{event.detail}</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
