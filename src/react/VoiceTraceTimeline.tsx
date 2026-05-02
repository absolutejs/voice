import {
  createVoiceTraceTimelineViewModel,
  type VoiceTraceTimelineWidgetOptions,
} from "../client/traceTimelineWidget";
import { useVoiceTraceTimeline } from "./useVoiceTraceTimeline";

export type VoiceTraceTimelineProps = VoiceTraceTimelineWidgetOptions & {
  className?: string;
  path?: string;
};

export const VoiceTraceTimeline = ({
  className,
  path = "/api/voice-traces",
  ...options
}: VoiceTraceTimelineProps) => {
  const snapshot = useVoiceTraceTimeline(path, options);
  const model = createVoiceTraceTimelineViewModel(snapshot, options);

  return (
    <section
      className={[
        "absolute-voice-trace-timeline",
        `absolute-voice-trace-timeline--${model.status}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="absolute-voice-trace-timeline__header">
        <span className="absolute-voice-trace-timeline__eyebrow">
          {model.title}
        </span>
        <strong className="absolute-voice-trace-timeline__label">
          {model.label}
        </strong>
      </header>
      <p className="absolute-voice-trace-timeline__description">
        {model.description}
      </p>
      {model.sessions.length ? (
        <div className="absolute-voice-trace-timeline__sessions">
          {model.sessions.map((session) => (
            <article
              className={[
                "absolute-voice-trace-timeline__session",
                `absolute-voice-trace-timeline__session--${session.status}`,
              ].join(" ")}
              key={session.sessionId}
            >
              <header>
                <strong>{session.sessionId}</strong>
                <span>{session.status}</span>
              </header>
              <p>
                {session.label} · {session.durationLabel} ·{" "}
                {session.providerLabel}
              </p>
              <p className="absolute-voice-trace-timeline__actions">
                <a href={session.detailHref}>Open timeline</a>
                {session.operationsRecordHref ? (
                  <a href={session.operationsRecordHref}>
                    Open operations record
                  </a>
                ) : null}
                {session.incidentBundleHref ? (
                  <a href={session.incidentBundleHref}>
                    Export incident bundle
                  </a>
                ) : null}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="absolute-voice-trace-timeline__empty">
          Run a voice session to see call timelines.
        </p>
      )}
      {model.error ? (
        <p className="absolute-voice-trace-timeline__error">{model.error}</p>
      ) : null}
    </section>
  );
};
