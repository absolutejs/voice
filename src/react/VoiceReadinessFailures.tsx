import {
  createVoiceReadinessFailuresViewModel,
  type VoiceReadinessFailuresWidgetOptions,
} from "../client/readinessFailuresWidget";
import { useVoiceReadinessFailures } from "./useVoiceReadinessFailures";

export type VoiceReadinessFailuresProps =
  VoiceReadinessFailuresWidgetOptions & {
    className?: string;
    path?: string;
  };

export const VoiceReadinessFailures = ({
  className,
  path = "/api/production-readiness",
  ...options
}: VoiceReadinessFailuresProps) => {
  const snapshot = useVoiceReadinessFailures(path, options);
  const model = createVoiceReadinessFailuresViewModel(snapshot, options);

  return (
    <section
      className={[
        "absolute-voice-readiness-failures",
        `absolute-voice-readiness-failures--${model.status}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="absolute-voice-readiness-failures__header">
        <span className="absolute-voice-readiness-failures__eyebrow">
          {model.title}
        </span>
        <strong className="absolute-voice-readiness-failures__label">
          {model.label}
        </strong>
      </header>
      <p className="absolute-voice-readiness-failures__description">
        {model.description}
      </p>
      {model.failures.length ? (
        <div className="absolute-voice-readiness-failures__items">
          {model.failures.map((failure) => (
            <article
              className={`absolute-voice-readiness-failures__item absolute-voice-readiness-failures__item--${failure.status}`}
              key={failure.label}
            >
              <span>{failure.status.toUpperCase()}</span>
              <strong>{failure.label}</strong>
              <p>
                Observed {failure.observed} against {failure.thresholdLabel}{" "}
                {failure.threshold}.
              </p>
              <p>{failure.remediation}</p>
              <p className="absolute-voice-readiness-failures__links">
                {failure.evidenceHref ? (
                  <a href={failure.evidenceHref}>Evidence</a>
                ) : null}
                {failure.sourceHref ? (
                  <a href={failure.sourceHref}>Threshold source</a>
                ) : null}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="absolute-voice-readiness-failures__empty">
          {model.error ?? "No calibrated readiness gate explanations are open."}
        </p>
      )}
      {model.links.length ? (
        <p className="absolute-voice-readiness-failures__links">
          {model.links.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </p>
      ) : null}
      {model.error ? (
        <p className="absolute-voice-readiness-failures__error">
          {model.error}
        </p>
      ) : null}
    </section>
  );
};
