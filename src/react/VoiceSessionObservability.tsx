import {
  createVoiceSessionObservabilityViewModel,
  type VoiceSessionObservabilityWidgetOptions,
} from "../client/sessionObservabilityWidget";
import { useVoiceSessionObservability } from "./useVoiceSessionObservability";

export type VoiceSessionObservabilityProps =
  VoiceSessionObservabilityWidgetOptions & {
    className?: string;
    path?: string;
  };

export const VoiceSessionObservability = ({
  className,
  path = "/api/voice/session-observability/latest",
  ...options
}: VoiceSessionObservabilityProps) => {
  const snapshot = useVoiceSessionObservability(path, options);
  const model = createVoiceSessionObservabilityViewModel(snapshot, options);

  return (
    <section
      className={[
        "absolute-voice-session-observability",
        `absolute-voice-session-observability--${model.status}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="absolute-voice-session-observability__header">
        <span className="absolute-voice-session-observability__eyebrow">
          {model.title}
        </span>
        <strong className="absolute-voice-session-observability__label">
          {model.label}
        </strong>
      </header>
      <p className="absolute-voice-session-observability__description">
        {model.description}
      </p>
      {model.sessionId ? (
        <p className="absolute-voice-session-observability__session">
          {model.sessionId}
        </p>
      ) : null}
      {model.links.length ? (
        <p className="absolute-voice-session-observability__actions">
          {model.links.map((link) => (
            <a href={link.href} key={`${link.rel}:${link.href}`}>
              {link.label}
            </a>
          ))}
        </p>
      ) : null}
      {model.turns.length ? (
        <div className="absolute-voice-session-observability__turns">
          {model.turns.map((turn) => (
            <article
              className="absolute-voice-session-observability__turn"
              key={turn.turnId}
            >
              <header>
                <strong>{turn.turnId}</strong>
                <span>{turn.durationLabel}</span>
              </header>
              <p>{turn.label}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="absolute-voice-session-observability__empty">
          Open a voice session to see turn waterfalls.
        </p>
      )}
      {model.error ? (
        <p className="absolute-voice-session-observability__error">
          {model.error}
        </p>
      ) : null}
    </section>
  );
};
