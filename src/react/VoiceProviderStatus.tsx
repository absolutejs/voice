import { useVoiceProviderStatus } from "./useVoiceProviderStatus";
import {
  createVoiceProviderStatusViewModel,
  type VoiceProviderStatusWidgetOptions,
} from "../client/providerStatusWidget";

export type VoiceProviderStatusProps = VoiceProviderStatusWidgetOptions & {
  className?: string;
  path?: string;
};

export const VoiceProviderStatus = ({
  className,
  path = "/api/provider-status",
  ...options
}: VoiceProviderStatusProps) => {
  const snapshot = useVoiceProviderStatus(path, options);
  const model = createVoiceProviderStatusViewModel(snapshot, options);

  return (
    <section
      className={[
        "absolute-voice-provider-status",
        `absolute-voice-provider-status--${model.status}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="absolute-voice-provider-status__header">
        <span className="absolute-voice-provider-status__eyebrow">
          {model.title}
        </span>
        <strong className="absolute-voice-provider-status__label">
          {model.label}
        </strong>
      </header>
      <p className="absolute-voice-provider-status__description">
        {model.description}
      </p>
      {model.providers.length ? (
        <div className="absolute-voice-provider-status__providers">
          {model.providers.map((provider) => (
            <article
              className={[
                "absolute-voice-provider-status__provider",
                `absolute-voice-provider-status__provider--${provider.status}`,
              ].join(" ")}
              key={provider.provider}
            >
              <header>
                <strong>{provider.label}</strong>
                <span>{provider.status}</span>
              </header>
              <p>{provider.detail}</p>
              <dl>
                {provider.rows.map((row) => (
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
        <p className="absolute-voice-provider-status__empty">
          Run voice traffic to see provider health.
        </p>
      )}
      {model.error ? (
        <p className="absolute-voice-provider-status__error">{model.error}</p>
      ) : null}
    </section>
  );
};
