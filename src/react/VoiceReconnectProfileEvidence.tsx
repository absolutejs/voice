import {
  createVoiceReconnectProfileEvidenceViewModel,
  type VoiceReconnectProfileEvidenceWidgetOptions,
} from "../client/reconnectProfileEvidenceWidget";
import { useVoiceReconnectProfileEvidence } from "./useVoiceReconnectProfileEvidence";

export type VoiceReconnectProfileEvidenceProps =
  VoiceReconnectProfileEvidenceWidgetOptions & {
    className?: string;
    path?: string;
  };

export const VoiceReconnectProfileEvidence = ({
  className,
  path = "/api/voice/reconnect-profile-evidence",
  ...options
}: VoiceReconnectProfileEvidenceProps) => {
  const snapshot = useVoiceReconnectProfileEvidence(path, options);
  const model = createVoiceReconnectProfileEvidenceViewModel(snapshot, options);

  return (
    <section
      className={[
        "absolute-voice-reconnect-evidence",
        `absolute-voice-reconnect-evidence--${model.status}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="absolute-voice-reconnect-evidence__header">
        <span className="absolute-voice-reconnect-evidence__eyebrow">
          {model.title}
        </span>
        <strong className="absolute-voice-reconnect-evidence__label">
          {model.label}
        </strong>
      </header>
      <p className="absolute-voice-reconnect-evidence__description">
        {model.description}
      </p>
      <div className="absolute-voice-reconnect-evidence__metrics">
        {model.metrics.map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>
      {model.latest ? (
        <p className="absolute-voice-reconnect-evidence__latest">
          Latest {model.latest.profileLabel} · {model.latest.sessionId} ·{" "}
          {model.latest.surfaces}
        </p>
      ) : (
        <p className="absolute-voice-reconnect-evidence__empty">
          No persisted reconnect profile evidence yet.
        </p>
      )}
      {model.links.length ? (
        <p className="absolute-voice-reconnect-evidence__links">
          {model.links.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </p>
      ) : null}
      {model.error ? (
        <p className="absolute-voice-reconnect-evidence__error">
          {model.error}
        </p>
      ) : null}
    </section>
  );
};
