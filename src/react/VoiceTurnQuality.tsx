import { useVoiceTurnQuality } from "./useVoiceTurnQuality";
import {
  createVoiceTurnQualityViewModel,
  type VoiceTurnQualityWidgetOptions,
} from "../client/turnQualityWidget";

export type VoiceTurnQualityProps = VoiceTurnQualityWidgetOptions & {
  className?: string;
  path?: string;
};

export const VoiceTurnQuality = ({
  className,
  path = "/api/turn-quality",
  ...options
}: VoiceTurnQualityProps) => {
  const snapshot = useVoiceTurnQuality(path, options);
  const model = createVoiceTurnQualityViewModel(snapshot, options);

  return (
    <section
      className={[
        "absolute-voice-turn-quality",
        `absolute-voice-turn-quality--${model.status}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="absolute-voice-turn-quality__header">
        <span className="absolute-voice-turn-quality__eyebrow">
          {model.title}
        </span>
        <strong className="absolute-voice-turn-quality__label">
          {model.label}
        </strong>
      </header>
      <p className="absolute-voice-turn-quality__description">
        {model.description}
      </p>
      {model.turns.length ? (
        <div className="absolute-voice-turn-quality__turns">
          {model.turns.map((turn) => (
            <article
              className={[
                "absolute-voice-turn-quality__turn",
                `absolute-voice-turn-quality__turn--${turn.status}`,
              ].join(" ")}
              key={`${turn.sessionId}:${turn.turnId}`}
            >
              <header>
                <strong>{turn.label}</strong>
                <span>{turn.status}</span>
              </header>
              <p>{turn.detail}</p>
              <dl>
                {turn.rows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <p className="absolute-voice-turn-quality__empty">
          Complete a voice turn to see STT quality diagnostics.
        </p>
      )}
      {model.error ? (
        <p className="absolute-voice-turn-quality__error">{model.error}</p>
      ) : null}
    </section>
  );
};
